/**
 * AH2 — دورة حياة الحسابات والطلبات (Account Lifecycle & Approval Workflow)
 * ==========================================================================
 * هذا الملف هو المرجع الوحيد لكل ما يخص إنشاء الحسابات، اعتمادها، تعطيلها،
 * إعادة تفعيلها، وحذفها المنطقي — داخل المحل الحالي فقط.
 *
 * قواعد ملزمة مطبّقة هنا (وليس في الواجهة):
 *  1) صاحب المحل ينشئ حسابات نشطة مباشرة. المدير ينشئ حسابًا بحالة "في انتظار الاعتماد" فقط.
 *  2) لا أحد ينشئ حساب "صاحب محل". والمدير لا ينشئ "مديرًا" آخر.
 *  3) لا أحد يعطّل/يحذف/يعيد تفعيل حساب صاحب المحل.
 *  4) المدير لا ينفّذ تعطيلًا/حذفًا/إعادة تفعيل — يقدّم طلبًا فقط.
 *  5) لا تُنفَّذ أي طلب إلا بموافقة صاحب المحل.
 *  6) التعطيل/الحذف/الرفض يُبطل كل جلسات المستخدم فورًا.
 *  7) التعطيل لا يمسّ أي عملية أو عميل أو رصيد أو تقرير — الحساب والسجلات تبقى كاملة.
 *  8) الحذف منطقي: تُعمّى كلمة المرور وتُحفظ السجلات لسلامة سجل التدقيق.
 */

import type { Request, Response } from 'express';
import { db, generateId, hashSecret, normalizePhoneNumber } from './db.js';
import { logAudit, logDenied } from './audit.js';
import {
  type Role,
  type PermissionCode,
  ACCOUNT_STATUS_LABELS,
  ROLE_DEFAULT_PERMISSIONS,
  canCreateRole,
  canManageRole,
  isRole,
  normalizePermissions,
  ROLE_LABELS,
  validatePermissionGrant,
} from './permissions.js';

// ─────────────────────────────────────────────────────────────
// أنواع مساعدة
// ─────────────────────────────────────────────────────────────

interface ActorCtx {
  projectId: string;
  userId: string;
  userName: string;
  role: Role;
}

function actorOf(req: any): ActorCtx | null {
  const membership = req.membership;
  if (!membership || !req.project || !req.user) return null;
  const role: Role = isRole(membership.role) ? membership.role : 'employee';
  return { projectId: req.project.id, userId: req.user.id, userName: req.user.name, role };
}

function getMembershipInProject(projectId: string, membershipId: string) {
  return db
    .prepare(
      `SELECT pm.*, u.name AS user_name, u.phone AS user_phone, u.email AS user_email, u.last_login_at
       FROM project_memberships pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.id = ? AND pm.project_id = ?`
    )
    .get(membershipId, projectId) as any;
}

/** إبطال كل جلسات المستخدم داخل المحل فورًا (الطبقة الثانية بعد فحص الحالة في authMiddleware). */
function revokeSessions(projectId: string, userId: string): number {
  const result = db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND project_id = ?').run(userId, projectId);
  return Number(result.changes ?? 0);
}

function notify(projectId: string, userId: string | null, type: string, title: string, message: string) {
  try {
    db.prepare(
      `INSERT INTO notifications (id, project_id, user_id, type, title, message, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(generateId(), projectId, userId, type, title, message, new Date().toISOString());
  } catch (err) {
    console.error('Notification error:', err);
  }
}

function deny(res: Response, actor: ActorCtx, description: string, reason: string) {
  logDenied({
    projectId: actor.projectId,
    actorId: actor.userId,
    actorName: actor.userName,
    actorRole: actor.role,
    actionType: 'ACCOUNT_ACTION_DENIED',
    description,
    entityType: 'USER',
    reason,
  });
  return res.status(403).json({
    error: 'لا تملك صلاحية تنفيذ هذا الإجراء على هذا الحساب',
    code: 'ACCOUNT_ACTION_DENIED',
  });
}

// ─────────────────────────────────────────────────────────────
// إنشاء حساب (صاحب المحل: نشط / المدير: في انتظار الاعتماد)
// ─────────────────────────────────────────────────────────────

export function createAccount(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });

  try {
    const {
      name,
      phone,
      email,
      password,
      role: requestedRole = 'employee',
      permissions = [],
    } = req.body ?? {};

    const targetRole: Role = isRole(requestedRole) ? requestedRole : 'employee';

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
    }
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'كلمة المرور مطلوبة ويجب ألا تقل عن 6 أحرف' });
    }

    // (2) من يستطيع إنشاء أي دور؟
    if (!canCreateRole(actor.role, targetRole)) {
      return deny(
        res,
        actor,
        `محاولة إنشاء حساب بدور غير مسموح (${ROLE_LABELS[targetRole]})`,
        `actor_role=${actor.role}&target_role=${targetRole}`
      );
    }

    // (1) لا أحد ينشئ صاحب محل
    if (targetRole === 'owner') {
      return deny(res, actor, 'محاولة إنشاء حساب صاحب محل', 'target_role=owner');
    }

    const cleanPhone = normalizePhoneNumber(phone);
    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح' });
    }

    // الصلاحيات: إن لم يحددها المُنشئ تُستخدم الافتراضية للدور
    // (صلاحيات المدير ثابتة من المصفوفة المركزية، والموظف يبدأ بالافتراضية ثم يعتمدها صاحب المحل)
    const hasExplicitPermissions = Array.isArray(permissions) && permissions.length > 0;
    const requestedPermissions = hasExplicitPermissions ? permissions : ROLE_DEFAULT_PERMISSIONS[targetRole];

    // مطابقة الصلاحيات بسقف الدور (حتى لو كان الطلب من صاحب المحل نفسه)
    const grant = validatePermissionGrant(targetRole, requestedPermissions);

    // كل محاولة لتجاوز سقف الصلاحيات تُسجَّل في سجل التدقيق (حتى لو نجح إنشاء الحساب بصلاحيات أقل)
    if (grant.rejected.length > 0) {
      logDenied({
        projectId: actor.projectId,
        actorId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.role,
        actionType: 'PERMISSION_ESCALATION_BLOCKED',
        description: `محاولة منح صلاحيات تتجاوز المسموح للدور (${ROLE_LABELS[targetRole]}) عند إنشاء حساب`,
        entityType: 'PERMISSION',
        reason: `rejected=${grant.rejected.join(',')}`,
      });
    }

    if (grant.granted.length === 0) {
      return res.status(400).json({
        error: 'يجب تحديد صلاحية واحدة على الأقل من الصلاحيات المسموحة لهذا النوع من الحسابات',
        code: 'INVALID_PERMISSIONS',
        rejected_permissions: grant.rejected,
      });
    }

    // المستخدم: جديد أو موجود (لكن بلا عضوية في أي محل — حساب واحد لكل شخص)
    const existingUser = db.prepare('SELECT id, name FROM users WHERE phone = ?').get(cleanPhone) as any;
    if (existingUser) {
      const existingMembership = db
        .prepare('SELECT id FROM project_memberships WHERE user_id = ? LIMIT 1')
        .get(existingUser.id) as any;
      if (existingMembership) {
        return res.status(400).json({ error: 'رقم الهاتف مرتبط بحساب آخر، لا يمكن استخدامه لإنشاء حساب جديد' });
      }
    }

    const now = new Date().toISOString();
    const userId = existingUser?.id ?? generateId();
    const membershipId = generateId();

    // صاحب المحل: نشط فورًا. المدير: في انتظار الاعتماد (5)
    const isOwnerCreating = actor.role === 'owner';
    const status = isOwnerCreating ? 'active' : 'pending';

    // الصلاحيات: لا تُفعّل إلا بعد الاعتماد إن كان المُنشئ مديرًا
    const effectivePermissions = isOwnerCreating ? grant.granted : [];
    const proposedPermissions = grant.granted;

    db.exec('BEGIN TRANSACTION;');
    try {
      if (!existingUser) {
        db.prepare(
          `INSERT INTO users (id, name, phone, email, password_hash, role, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          userId,
          String(name).trim(),
          cleanPhone,
          email && String(email).trim() ? String(email).trim() : null,
          hashSecret(String(password)),
          targetRole,
          now
        );
      } else if (email && String(email).trim()) {
        db.prepare('UPDATE users SET email = COALESCE(email, ?) WHERE id = ?').run(String(email).trim(), userId);
      }

      db.prepare(
        `INSERT INTO project_memberships
           (id, project_id, user_id, role, status, permissions, created_at,
            proposed_permissions, approved_by, approved_at, status_changed_by, status_changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        membershipId,
        actor.projectId,
        userId,
        targetRole,
        status,
        JSON.stringify(effectivePermissions),
        now,
        JSON.stringify(proposedPermissions),
        isOwnerCreating ? actor.userId : null,
        isOwnerCreating ? now : null,
        actor.userId,
        now
      );

      // إذا أنشأ المدير الحساب: يُسجّل طلب اعتماد لصاحب المحل
      let requestId: string | null = null;
      if (!isOwnerCreating) {
        requestId = generateId();
        db.prepare(
          `INSERT INTO account_requests
             (id, project_id, type, target_user_id, target_membership_id, payload_json, status,
              requested_by, requested_by_name, requested_by_role, requested_at)
           VALUES (?, ?, 'create_account', ?, ?, ?, 'pending', ?, ?, ?, ?)`
        ).run(
          requestId,
          actor.projectId,
          userId,
          membershipId,
          JSON.stringify({ name: String(name).trim(), phone: cleanPhone, role: targetRole, proposed_permissions: proposedPermissions }),
          actor.userId,
          actor.userName,
          actor.role,
          now
        );
      }

      db.exec('COMMIT;');

      logAudit({
        projectId: actor.projectId,
        actorId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.role,
        actionType: 'CREATE_ACCOUNT',
        description: `إنشاء حساب (${ROLE_LABELS[targetRole]}) للمستخدم ${String(name).trim()} — الحالة: ${ACCOUNT_STATUS_LABELS[status as 'active' | 'pending']}`,
        entityType: 'USER',
        entityId: userId,
        targetUserId: userId,
        reason: grant.rejected.length ? `rejected_permissions=${grant.rejected.join(',')}` : null,
      });

      notify(
        actor.projectId,
        isOwnerCreating ? userId : null,
        isOwnerCreating ? 'ACCOUNT_CREATED' : 'ACCOUNT_PENDING_APPROVAL',
        isOwnerCreating ? 'تم إنشاء حساب' : 'طلب اعتماد حساب جديد',
        isOwnerCreating
          ? `تم إنشاء حساب (${ROLE_LABELS[targetRole]}) للمستخدم "${String(name).trim()}" بنجاح.`
          : `قدّم ${actor.userName} طلب اعتماد حساب جديد للمستخدم "${String(name).trim()}"، بانتظار موافقة صاحب المحل.`
      );

      return res.status(201).json({
        message: isOwnerCreating
          ? 'تم إنشاء الحساب وتفعيله بنجاح'
          : 'تم إنشاء الحساب وإرساله لصاحب المحل للاعتماد، ولن يتمكن المستخدم من الدخول قبل الموافقة',
        status,
        account_status: status,
        membership_id: membershipId,
        user_id: userId,
        request_id: requestId,
        permissions: effectivePermissions,
        proposed_permissions: proposedPermissions,
        rejected_permissions: grant.rejected,
      });
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE constraint failed: users.phone')) {
      return res.status(400).json({ error: 'رقم الهاتف مستخدم بالفعل' });
    }
    console.error('Create account error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء الحساب' });
  }
}

// ─────────────────────────────────────────────────────────────
// قائمة المستخدمين
// ─────────────────────────────────────────────────────────────

export function listAccounts(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });

  try {
    const rows = db
      .prepare(
        `SELECT pm.id AS membership_id, pm.role, pm.status, pm.permissions, pm.proposed_permissions,
                pm.created_at, pm.approved_at, pm.status_changed_at, pm.status_reason,
                u.id AS user_id, u.name, u.phone, u.email, u.last_login_at
         FROM project_memberships pm
         JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = ?
         ORDER BY CASE pm.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, pm.created_at ASC`
      )
      .all(actor.projectId) as any[];

    return res.json(
      rows.map((row) => ({
        ...row,
        permissions: normalizePermissions(isRole(row.role) ? row.role : 'employee', row.permissions),
        proposed_permissions:
          row.proposed_permissions === null || row.proposed_permissions === undefined
            ? []
            : JSON.parse(row.proposed_permissions || '[]'),
        status_label: ACCOUNT_STATUS_LABELS[row.status as keyof typeof ACCOUNT_STATUS_LABELS] ?? row.status,
        role_label: ROLE_LABELS[(isRole(row.role) ? row.role : 'employee') as Role],
      }))
    );
  } catch (error) {
    console.error('List accounts error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة المستخدمين' });
  }
}

/** سجل نشاط مستخدم محدد (صاحب المحل/من يملك إدارة المستخدمين). */
export function getAccountActivity(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });

  try {
    const membership = getMembershipInProject(actor.projectId, String(req.params.membershipId));
    if (!membership) return res.status(404).json({ error: 'العضوية غير موجودة في هذا المحل' });

    const rows = db
      .prepare(
        `SELECT id, user_id, user_name, action_type, description, entity_type, entity_id,
                actor_role, target_user_id, result, reason, created_at
         FROM activity_logs
         WHERE project_id = ? AND (user_id = ? OR target_user_id = ?)
         ORDER BY created_at DESC
         LIMIT 200`
      )
      .all(actor.projectId, membership.user_id, membership.user_id);

    return res.json(rows);
  } catch (error) {
    console.error('Account activity error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب سجل النشاط' });
  }
}

// ─────────────────────────────────────────────────────────────
// تعطيل / إعادة تفعيل مباشرة (صاحب المحل فقط)
// ─────────────────────────────────────────────────────────────

export function disableAccountDirect(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });
  if (actor.role !== 'owner') return deny(res, actor, 'محاولة تعطيل حساب بدون أن يكون صاحب المحل', 'owner_only');

  try {
    const { reason } = req.body ?? {};
    const membership = getMembershipInProject(actor.projectId, String(req.params.membershipId));
    if (!membership) return res.status(404).json({ error: 'العضوية غير موجودة في هذا المحل' });

    const targetRole: Role = isRole(membership.role) ? membership.role : 'employee';

    // لا يمكن لأي مستخدم تعطيل حسابه بنفسه (رسالة أوضح من رفض الصلاحية)
    if (membership.user_id === actor.userId) {
      return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك بنفسك', code: 'SELF_ACTION_NOT_ALLOWED' });
    }

    // (3) لا أحد يعطّل صاحب المحل
    if (!canManageRole(actor.role, targetRole) || targetRole === 'owner') {
      return deny(res, actor, 'محاولة تعطيل حساب صاحب المحل', 'target_role=owner');
    }
    if (membership.status === 'disabled') {
      return res.status(400).json({ error: 'هذا الحساب معطل بالفعل' });
    }
    if (membership.status === 'deleted') {
      return res.status(400).json({ error: 'هذا الحساب محذوف، لا يمكن تعطيله' });
    }

    const now = new Date().toISOString();
    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(
        `UPDATE project_memberships
         SET status = 'disabled', status_changed_at = ?, status_changed_by = ?, status_reason = ?
         WHERE id = ? AND project_id = ?`
      ).run(now, actor.userId, reason ? String(reason).trim() : null, membership.id, actor.projectId);

      // إبطال كل الجلسات النشطة فورًا (7)
      revokeSessions(actor.projectId, membership.user_id);

      // إغلاق أي طلب تعطيل معلق لنفس الحساب
      db.prepare(
        `UPDATE account_requests
         SET status = 'cancelled', decided_by = ?, decided_by_name = ?, decided_at = ?, decision_note = ?
         WHERE project_id = ? AND target_membership_id = ? AND status = 'pending' AND type IN ('disable_account','enable_account','delete_account')`
      ).run(actor.userId, actor.userName, now, 'تم تنفيذ الإجراء مباشرة بواسطة صاحب المحل', actor.projectId, membership.id);

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    logAudit({
      projectId: actor.projectId,
      actorId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.role,
      actionType: 'DISABLE_ACCOUNT',
      description: `تم تعطيل حساب ${membership.user_name} (${ROLE_LABELS[targetRole]})`,
      entityType: 'USER',
      entityId: membership.user_id,
      targetUserId: membership.user_id,
      reason: reason ? String(reason).trim() : null,
    });

    notify(
      actor.projectId,
      membership.user_id,
      'ACCOUNT_DISABLED',
      'تم تعطيل حسابك',
      'تم تعطيل حسابك، وبياناتك وعملياتك السابقة محفوظة كما هي. يرجى مراجعة صاحب المحل.'
    );

    return res.json({
      message: 'تم تعطيل الحساب وإبطال جلساته، وتم الاحتفاظ بكل عملياته وسجلاته',
      account_status: 'disabled',
    });
  } catch (error) {
    console.error('Disable account error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء تعطيل الحساب' });
  }
}

export function enableAccountDirect(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });
  if (actor.role !== 'owner') return deny(res, actor, 'محاولة إعادة تفعيل حساب بدون أن يكون صاحب المحل', 'owner_only');

  try {
    const membership = getMembershipInProject(actor.projectId, String(req.params.membershipId));
    if (!membership) return res.status(404).json({ error: 'العضوية غير موجودة في هذا المحل' });

    const targetRole: Role = isRole(membership.role) ? membership.role : 'employee';
    if (!canManageRole(actor.role, targetRole) || targetRole === 'owner') {
      return deny(res, actor, 'محاولة تعديل حساب صاحب المحل', 'target_role=owner');
    }
    if (membership.status === 'active') {
      return res.status(400).json({ error: 'هذا الحساب نشط بالفعل' });
    }
    if (membership.status === 'deleted') {
      return res.status(400).json({ error: 'هذا الحساب محذوف نهائيًا، لا يمكن إعادة تفعيله' });
    }

    const now = new Date().toISOString();
    // (9) استعادة الصلاحيات المعتمدة كما هي — لا منح صلاحيات جديدة
    const approvedPermissions = normalizePermissions(targetRole, membership.permissions);

    db.prepare(
      `UPDATE project_memberships
       SET status = 'active', status_changed_at = ?, status_changed_by = ?, status_reason = NULL,
           permissions = ?, approved_by = ?, approved_at = ?
       WHERE id = ? AND project_id = ?`
    ).run(now, actor.userId, JSON.stringify(approvedPermissions), actor.userId, now, membership.id, actor.projectId);

    db.prepare(
      `UPDATE account_requests
       SET status = 'cancelled', decided_by = ?, decided_by_name = ?, decided_at = ?, decision_note = ?
       WHERE project_id = ? AND target_membership_id = ? AND status = 'pending' AND type IN ('disable_account','enable_account','delete_account')`
    ).run(actor.userId, actor.userName, now, 'تم تنفيذ الإجراء مباشرة بواسطة صاحب المحل', actor.projectId, membership.id);

    logAudit({
      projectId: actor.projectId,
      actorId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.role,
      actionType: 'ENABLE_ACCOUNT',
      description: `تم إعادة تفعيل حساب ${membership.user_name} بنفس الصلاحيات المعتمدة سابقًا`,
      entityType: 'USER',
      entityId: membership.user_id,
      targetUserId: membership.user_id,
    });

    notify(actor.projectId, membership.user_id, 'ACCOUNT_ENABLED', 'تم إعادة تفعيل حسابك', 'تم إعادة تفعيل حسابك، يمكنك الدخول الآن.');

    return res.json({
      message: 'تم إعادة تفعيل الحساب بنفس الصلاحيات المعتمدة',
      account_status: 'active',
      permissions: approvedPermissions,
    });
  } catch (error) {
    console.error('Enable account error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إعادة تفعيل الحساب' });
  }
}

// ─────────────────────────────────────────────────────────────
// حذف منطقي (صاحب المحل فقط، مع الحفاظ على السجلات)
// ─────────────────────────────────────────────────────────────

export function softDeleteAccount(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });
  if (actor.role !== 'owner') return deny(res, actor, 'محاولة حذف حساب بدون أن يكون صاحب المحل', 'owner_only');

  try {
    const { confirm } = req.body ?? {};
    if (confirm !== true) {
      return res.status(400).json({ error: 'يجب تأكيد الحذف صراحةً (confirm = true)' });
    }

    const membership = getMembershipInProject(actor.projectId, String(req.params.membershipId));
    if (!membership) return res.status(404).json({ error: 'العضوية غير موجودة في هذا المحل' });

    const targetRole: Role = isRole(membership.role) ? membership.role : 'employee';

    if (membership.user_id === actor.userId) {
      return res.status(400).json({ error: 'لا يمكنك حذف حسابك بنفسك', code: 'SELF_ACTION_NOT_ALLOWED' });
    }

    if (!canManageRole(actor.role, targetRole) || targetRole === 'owner') {
      return deny(res, actor, 'محاولة حذف حساب صاحب المحل', 'target_role=owner');
    }
    if (membership.status === 'deleted') {
      return res.status(400).json({ error: 'هذا الحساب محذوف بالفعل' });
    }

    // تحقق من سلامة البيانات قبل الحذف (8)
    const ownedTransactions = db
      .prepare('SELECT COUNT(*) AS c FROM transactions WHERE project_id = ? AND created_by = ?')
      .get(actor.projectId, membership.user_id) as any;
    const txCount = Number(ownedTransactions?.c ?? 0);

    const now = new Date().toISOString();
    db.exec('BEGIN TRANSACTION;');
    try {
      // لا تُحذف أي عملية أو عميل — فقط تُقفل العضوية وتُعمّى كلمة المرور
      db.prepare(
        `UPDATE project_memberships
         SET status = 'deleted', status_changed_at = ?, status_changed_by = ?, status_reason = ?
         WHERE id = ? AND project_id = ?`
      ).run(now, actor.userId, 'حذف نهائي بموافقة صاحب المحل', membership.id, actor.projectId);

      // تعمية كلمة المرور: لا يمكن الدخول إطلاقًا مع بقاء صف المستخدم لسلامة سجل التدقيق
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        `deleted:${generateId()}`,
        membership.user_id
      );

      revokeSessions(actor.projectId, membership.user_id);

      db.prepare(
        `UPDATE account_requests
         SET status = 'cancelled', decided_by = ?, decided_by_name = ?, decided_at = ?, decision_note = ?
         WHERE project_id = ? AND target_membership_id = ? AND status = 'pending'`
      ).run(actor.userId, actor.userName, now, 'تم تنفيذ الحذف بواسطة صاحب المحل', actor.projectId, membership.id);

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    logAudit({
      projectId: actor.projectId,
      actorId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.role,
      actionType: 'DELETE_ACCOUNT',
      description: `تم حذف حساب ${membership.user_name} (منطقيًا) مع الاحتفاظ بكل سجلاته (${txCount} عملية)`,
      entityType: 'USER',
      entityId: membership.user_id,
      targetUserId: membership.user_id,
      reason: `preserved_transactions=${txCount}`,
    });

    return res.json({
      message: 'تم حذف الحساب مع الاحتفاظ الكامل بكل عملياته وسجلاته التاريخية',
      account_status: 'deleted',
      preserved_transactions: txCount,
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء حذف الحساب' });
  }
}

// ─────────────────────────────────────────────────────────────
// طلبات المدير (تعطيل / إعادة تفعيل / حذف) — لا تُنفَّذ بدون موافقة
// ─────────────────────────────────────────────────────────────

/** الأنواع التي يقدّمها المدير كطلب (لا تشمل الإنشاء الذي يُنشأ تلقائيًا مع الحساب). */
const MANAGER_REQUEST_TYPES = ['disable_account', 'enable_account', 'delete_account'] as const;

/** كل أنواع الطلبات المخزّنة في account_requests. */
const REQUEST_TYPES = ['create_account', 'disable_account', 'enable_account', 'delete_account'] as const;
type ManagerRequestType = (typeof MANAGER_REQUEST_TYPES)[number];
type RequestType = (typeof REQUEST_TYPES)[number];

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  create_account: 'اعتماد حساب جديد',
  disable_account: 'تعطيل حساب',
  enable_account: 'إعادة تفعيل حساب',
  delete_account: 'حذف حساب',
};

export function createAccountRequest(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });

  try {
    const { type, reason } = req.body ?? {};
    const requestType = MANAGER_REQUEST_TYPES.includes(type) ? (type as ManagerRequestType) : null;
    if (!requestType) {
      return res.status(400).json({
        error: 'نوع الطلب غير صالح',
        allowed: MANAGER_REQUEST_TYPES,
      });
    }

    // (4) المدير لا ينفّذ — يقدّم طلبًا. وصاحب المحل ينفّذ مباشرة بدل الطلبات.
    if (actor.role === 'owner') {
      return res.status(400).json({
        error: 'صاحب المحل ينفّذ الإجراء مباشرة دون الحاجة إلى طلب',
        code: 'OWNER_ACTS_DIRECTLY',
      });
    }
    if (actor.role !== 'manager') {
      return deny(res, actor, 'محاولة تقديم طلب إدارة حساب من غير المدير', `actor_role=${actor.role}`);
    }

    const membership = getMembershipInProject(actor.projectId, String(req.params.membershipId));
    if (!membership) return res.status(404).json({ error: 'العضوية غير موجودة في هذا المحل' });

    const targetRole: Role = isRole(membership.role) ? membership.role : 'employee';
    if (!canManageRole(actor.role, targetRole) || targetRole !== 'employee') {
      return deny(res, actor, 'محاولة تقديم طلب على حساب لا يحق للمدير إدارته', `target_role=${targetRole}`);
    }

    // تحقق منطقي من الحالة الحالية
    if (requestType === 'disable_account' && membership.status !== 'active') {
      return res.status(400).json({ error: 'لا يمكن طلب تعطيل حساب غير نشط' });
    }
    if (requestType === 'enable_account' && membership.status !== 'disabled') {
      return res.status(400).json({ error: 'لا يمكن طلب إعادة تفعيل حساب غير معطل' });
    }
    if (requestType === 'delete_account' && membership.status === 'deleted') {
      return res.status(400).json({ error: 'هذا الحساب محذوف بالفعل' });
    }

    // لا طلبات مكررة معلقة
    const pending = db
      .prepare(
        `SELECT id FROM account_requests
         WHERE project_id = ? AND target_membership_id = ? AND type = ? AND status = 'pending'`
      )
      .get(actor.projectId, membership.id, requestType) as any;
    if (pending) {
      return res.status(400).json({ error: 'يوجد طلب معلق بالفعل لنفس الإجراء على هذا الحساب', request_id: pending.id });
    }

    const now = new Date().toISOString();
    const requestId = generateId();

    db.prepare(
      `INSERT INTO account_requests
         (id, project_id, type, target_user_id, target_membership_id, payload_json, status,
          requested_by, requested_by_name, requested_by_role, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
    ).run(
      requestId,
      actor.projectId,
      requestType,
      membership.user_id,
      membership.id,
      JSON.stringify({ reason: reason ? String(reason).trim() : null, target_name: membership.user_name }),
      actor.userId,
      actor.userName,
      actor.role,
      now
    );

    logAudit({
      projectId: actor.projectId,
      actorId: actor.userId,
      actorName: actor.userName,
      actorRole: actor.role,
      actionType: 'REQUEST_ACCOUNT_ACTION',
      description: `طلب ${REQUEST_TYPE_LABELS[requestType]} للمستخدم ${membership.user_name} (بانتظار موافقة صاحب المحل)`,
      entityType: 'USER',
      entityId: membership.user_id,
      targetUserId: membership.user_id,
      reason: reason ? String(reason).trim() : null,
    });

    notify(
      actor.projectId,
      null,
      'ACCOUNT_REQUEST_PENDING',
      'طلب إدارة حساب بانتظار موافقتك',
      `قدّم ${actor.userName} طلب ${REQUEST_TYPE_LABELS[requestType]} للمستخدم "${membership.user_name}".`
    );

    return res.status(201).json({
      message: 'تم إرسال الطلب إلى صاحب المحل، ولن يُنفَّذ أي تغيير قبل موافقته',
      request_id: requestId,
      status: 'pending',
      account_status: membership.status,
    });
  } catch (error) {
    console.error('Create account request error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إرسال الطلب' });
  }
}

// ─────────────────────────────────────────────────────────────
// قائمة الطلبات
// ─────────────────────────────────────────────────────────────

export function listAccountRequests(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });

  try {
    const status = String(req.query.status ?? 'pending');
    const isOwner = actor.role === 'owner';

    const rows = db
      .prepare(
        `SELECT ar.*, u.name AS target_name, u.phone AS target_phone
         FROM account_requests ar
         LEFT JOIN users u ON u.id = ar.target_user_id
         WHERE ar.project_id = ?
           ${status === 'all' ? '' : 'AND ar.status = ?'}
           ${isOwner ? '' : 'AND ar.requested_by = ?'}
         ORDER BY ar.requested_at DESC`
      )
      .all(
        ...(status === 'all'
          ? isOwner
            ? [actor.projectId]
            : [actor.projectId, actor.userId]
          : isOwner
          ? [actor.projectId, status]
          : [actor.projectId, status, actor.userId])
      ) as any[];

    return res.json(
      rows.map((row) => ({
        ...row,
        payload: (() => {
          try {
            return JSON.parse(row.payload_json || '{}');
          } catch {
            return {};
          }
        })(),
        type_label: REQUEST_TYPE_LABELS[row.type as RequestType] ?? row.type,
      }))
    );
  } catch (error) {
    console.error('List requests error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب الطلبات' });
  }
}

// ─────────────────────────────────────────────────────────────
// الموافقة / الرفض (صاحب المحل فقط)
// ─────────────────────────────────────────────────────────────

export function decideAccountRequest(req: Request, res: Response) {
  const actor = actorOf(req);
  if (!actor) return res.status(401).json({ error: 'غير مصرح' });

  // (5) لا قرار إلا من صاحب المحل
  if (actor.role !== 'owner') {
    return deny(res, actor, 'محاولة الموافقة على طلب إدارة حساب بدون أن يكون صاحب المحل', 'owner_only');
  }

  try {
    const { decision, note, permissions } = req.body ?? {};
    if (decision !== 'approve' && decision !== 'reject') {
      return res.status(400).json({ error: 'القرار يجب أن يكون approve أو reject' });
    }

    const request = db
      .prepare('SELECT * FROM account_requests WHERE id = ? AND project_id = ?')
      .get(String(req.params.requestId), actor.projectId) as any;
    if (!request) return res.status(404).json({ error: 'الطلب غير موجود في هذا المحل' });
    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'هذا الطلب تم البتّ فيه بالفعل', status: request.status });
    }

    const now = new Date().toISOString();
    const requestType: RequestType = request.type;

    // ── رفض الطلب ──
    if (decision === 'reject') {
      db.exec('BEGIN TRANSACTION;');
      try {
        db.prepare(
          `UPDATE account_requests
           SET status = 'rejected', decided_by = ?, decided_by_name = ?, decided_at = ?, decision_note = ?
           WHERE id = ?`
        ).run(actor.userId, actor.userName, now, note ? String(note).trim() : null, request.id);

        // رفض طلب الإنشاء → الحساب "مرفوض" ولا يمكنه الدخول
        if (requestType === 'create_account' && request.target_membership_id) {
          db.prepare(
            `UPDATE project_memberships
             SET status = 'rejected', status_changed_at = ?, status_changed_by = ?, status_reason = ?
             WHERE id = ? AND project_id = ?`
          ).run(now, actor.userId, note ? String(note).trim() : 'رفض صاحب المحل', request.target_membership_id, actor.projectId);

          if (request.target_user_id) revokeSessions(actor.projectId, request.target_user_id);
        }

        db.exec('COMMIT;');
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }

      logAudit({
        projectId: actor.projectId,
        actorId: actor.userId,
        actorName: actor.userName,
        actorRole: actor.role,
        actionType: 'REJECT_ACCOUNT_REQUEST',
        description: `رفض طلب ${REQUEST_TYPE_LABELS[requestType]} المقدّم من ${request.requested_by_name}`,
        entityType: 'USER',
        entityId: request.target_user_id,
        targetUserId: request.target_user_id,
        result: 'success',
        reason: note ? String(note).trim() : null,
      });

      return res.json({
        message: 'تم رفض الطلب، ولن يُطبَّق أي تغيير على الحساب',
        request_status: 'rejected',
      });
    }

    // ── الموافقة ──
    const membership = request.target_membership_id
      ? getMembershipInProject(actor.projectId, request.target_membership_id)
      : null;
    if (!membership) return res.status(404).json({ error: 'الحساب المستهدف غير موجود في هذا المحل' });

    const targetRole: Role = isRole(membership.role) ? membership.role : 'employee';
    if (targetRole === 'owner') {
      return deny(res, actor, 'محاولة تعديل حساب صاحب المحل عبر طلب', 'target_role=owner');
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      if (requestType === 'create_account') {
        // الصلاحيات النهائية: ما يحدده صاحب المحل، أو المقترحة من المدير
        let payload: any = {};
        try {
          payload = JSON.parse(request.payload_json || '{}');
        } catch {
          payload = {};
        }
        const source = permissions !== undefined ? permissions : payload.proposed_permissions ?? [];
        const grant = validatePermissionGrant(targetRole, source);
        if (grant.granted.length === 0) {
          db.exec('ROLLBACK;');
          return res.status(400).json({
            error: 'يجب اعتماد صلاحية واحدة على الأقل من الصلاحيات المسموحة',
            rejected_permissions: grant.rejected,
          });
        }

        db.prepare(
          `UPDATE project_memberships
           SET status = 'active', permissions = ?, proposed_permissions = ?,
               approved_by = ?, approved_at = ?, status_changed_by = ?, status_changed_at = ?, status_reason = NULL
           WHERE id = ? AND project_id = ?`
        ).run(
          JSON.stringify(grant.granted),
          JSON.stringify(grant.granted),
          actor.userId,
          now,
          actor.userId,
          now,
          membership.id,
          actor.projectId
        );

        logAudit({
          projectId: actor.projectId,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.role,
          actionType: 'APPROVE_ACCOUNT',
          description: `اعتماد حساب ${membership.user_name} (${ROLE_LABELS[targetRole]}) بـ ${grant.granted.length} صلاحية`,
          entityType: 'USER',
          entityId: membership.user_id,
          targetUserId: membership.user_id,
          reason: grant.rejected.length ? `rejected_permissions=${grant.rejected.join(',')}` : null,
        });

        notify(actor.projectId, membership.user_id, 'ACCOUNT_APPROVED', 'تم اعتماد حسابك', 'تم اعتماد حسابك، يمكنك الدخول الآن.');
      } else if (requestType === 'disable_account') {
        db.prepare(
          `UPDATE project_memberships
           SET status = 'disabled', status_changed_at = ?, status_changed_by = ?, status_reason = ?
           WHERE id = ? AND project_id = ?`
        ).run(now, actor.userId, note ? String(note).trim() : null, membership.id, actor.projectId);
        revokeSessions(actor.projectId, membership.user_id);

        logAudit({
          projectId: actor.projectId,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.role,
          actionType: 'DISABLE_ACCOUNT',
          description: `تم تعطيل حساب ${membership.user_name} بموافقة صاحب المحل على طلب ${request.requested_by_name}`,
          entityType: 'USER',
          entityId: membership.user_id,
          targetUserId: membership.user_id,
          reason: note ? String(note).trim() : null,
        });
      } else if (requestType === 'enable_account') {
        const approvedPermissions = normalizePermissions(targetRole, membership.permissions);
        db.prepare(
          `UPDATE project_memberships
           SET status = 'active', status_changed_at = ?, status_changed_by = ?, status_reason = NULL,
               permissions = ?, approved_by = ?, approved_at = ?
           WHERE id = ? AND project_id = ?`
        ).run(now, actor.userId, JSON.stringify(approvedPermissions), actor.userId, now, membership.id, actor.projectId);

        logAudit({
          projectId: actor.projectId,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.role,
          actionType: 'ENABLE_ACCOUNT',
          description: `تم إعادة تفعيل حساب ${membership.user_name} بنفس الصلاحيات المعتمدة`,
          entityType: 'USER',
          entityId: membership.user_id,
          targetUserId: membership.user_id,
          reason: note ? String(note).trim() : null,
        });
      } else if (requestType === 'delete_account') {
        db.prepare(
          `UPDATE project_memberships
           SET status = 'deleted', status_changed_at = ?, status_changed_by = ?, status_reason = ?
           WHERE id = ? AND project_id = ?`
        ).run(now, actor.userId, note ? String(note).trim() : 'موافقة على طلب الحذف', membership.id, actor.projectId);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(`deleted:${generateId()}`, membership.user_id);
        revokeSessions(actor.projectId, membership.user_id);

        logAudit({
          projectId: actor.projectId,
          actorId: actor.userId,
          actorName: actor.userName,
          actorRole: actor.role,
          actionType: 'DELETE_ACCOUNT',
          description: `تم حذف حساب ${membership.user_name} بموافقة صاحب المحل على طلب ${request.requested_by_name}`,
          entityType: 'USER',
          entityId: membership.user_id,
          targetUserId: membership.user_id,
        });
      }

      db.prepare(
        `UPDATE account_requests
         SET status = 'approved', decided_by = ?, decided_by_name = ?, decided_at = ?, decision_note = ?
         WHERE id = ?`
      ).run(actor.userId, actor.userName, now, note ? String(note).trim() : null, request.id);

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    return res.json({
      message: 'تمت الموافقة على الطلب وتنفيذه بنجاح',
      request_status: 'approved',
    });
  } catch (error) {
    console.error('Decide request error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ القرار' });
  }
}
