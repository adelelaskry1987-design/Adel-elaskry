import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import {
  db,
  initDatabase,
  hashSecret,
  verifySecret,
  generateId,
  normalizePhoneNumber,
} from './server/db.js';
import { logAudit, logDenied } from './server/audit.js';
import {
  createAccount,
  listAccounts,
  getAccountActivity,
  disableAccountDirect,
  enableAccountDirect,
  softDeleteAccount,
  createAccountRequest,
  listAccountRequests,
  decideAccountRequest,
} from './server/accounts.js';
import {
  type Role,
  type AccountStatus,
  type PermissionCode,
  ACCOUNT_STATUS_LABELS,
  canLoginWithStatus,
  hasPermission,
  isRole,
  normalizePermissions,
  validatePermissionGrant,
} from './server/permissions.js';
import {
  getRecoveryProviderStatus,
  checkAndIncrementRateLimit,
  generateSecureLinkToken,
  generateSecureOtpCode,
  sendPasswordResetEmail,
  sendOtpSms,
} from './server/recovery.js';
import {
  buildThrottleKey,
  checkLoginThrottle,
  clearLoginFailures,
  recordLoginFailure,
  pruneLoginThrottle,
  MAX_LOGIN_FAILURES,
  LOGIN_LOCK_MINUTES,
} from './server/rateLimit.js';

initDatabase();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Auth Middleware
interface AuthRequest extends Request {
  user?: any;
  project?: any;
  membership?: any;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول أولاً' });
  }

  const token = authHeader.split(' ')[1];
  const tokenRecord = db
    .prepare('SELECT * FROM auth_tokens WHERE token = ?')
    .get(token) as any;

  if (!tokenRecord) {
    return res.status(401).json({ error: 'الجلسة غير صالحة أو منتهية' });
  }

  if (tokenRecord.expires_at < Date.now()) {
    db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
    return res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
  }

  const user = db
    .prepare('SELECT id, name, phone, email, role, created_at FROM users WHERE id = ?')
    .get(tokenRecord.user_id) as any;

  if (!user) {
    return res.status(401).json({ error: 'المستخدم غير موجود' });
  }

  const project = db
    .prepare('SELECT id, name, owner_id, project_password_hash, created_at FROM projects WHERE id = ?')
    .get(tokenRecord.project_id) as any;

  if (!project) {
    return res.status(401).json({ error: 'المشروع غير موجود' });
  }

  const membership = db
    .prepare('SELECT * FROM project_memberships WHERE project_id = ? AND user_id = ?')
    .get(project.id, user.id) as any;

  // ── حماية الجلسة: لا وصول للوظائف المحمية إلا بعضوية نشطة ──
  // هذا هو الفحص الذي يُبطل فعليًا جلسة أي موظف يتم تعطيله، حتى لو كان التوكن
  // ما زال موجودًا في قاعدة البيانات أو في متصفح المستخدم.
  if (!membership) {
    logDenied({
      projectId: project.id,
      actorId: user.id,
      actorName: user.name,
      actionType: 'ACCESS_DENIED',
      description: 'محاولة وصول بعضوية غير موجودة',
      entityType: 'USER',
      entityId: user.id,
      targetUserId: user.id,
      reason: 'no_membership',
    });
    return res.status(403).json({
      error: 'لا يوجد عضوية صالحة لهذا الحساب، يرجى مراجعة صاحب المحل',
      code: 'NO_MEMBERSHIP',
    });
  }

  if (!canLoginWithStatus(membership.status)) {
    logDenied({
      projectId: project.id,
      actorId: user.id,
      actorName: user.name,
      actorRole: isRole(membership.role) ? membership.role : null,
      actionType: 'ACCESS_DENIED',
      description: `محاولة وصول بحساب غير نشط — الحالة: ${ACCOUNT_STATUS_LABELS[membership.status as AccountStatus] ?? membership.status}`,
      entityType: 'USER',
      entityId: user.id,
      targetUserId: user.id,
      reason: `account_status=${membership.status}`,
    });
    return res.status(403).json({
      error: 'حسابك غير نشط حاليًا، لا يمكنك استخدام التطبيق. يرجى مراجعة صاحب المحل',
      account_status: membership.status,
      code: 'ACCOUNT_NOT_ACTIVE',
    });
  }

  const membershipRole: Role = isRole(membership.role) ? membership.role : 'employee';

  req.user = user;
  req.project = project;
  req.membership = {
    ...membership,
    role: membershipRole,
    permissions: normalizePermissions(membershipRole, membership.permissions),
  };

  next();
}

// ================= PERMISSION GUARDS =================
/**
 * حرّاس الصلاحيات: التحقق الفعلي (والملزم) يحدث هنا على الخادم، وليس بإخفاء الأزرار.
 * أي طلب لا يملك صلاحيته يُرفض بـ 403 ويُسجَّل في سجل التدقيق كنتيجة "denied".
 * صاحب المحل يملك كل الصلاحيات دائمًا (normalizePermissions).
 */
function currentActor(req: AuthRequest) {
  return {
    projectId: req.project?.id ?? '',
    actorId: req.user?.id ?? null,
    actorName: req.user?.name ?? null,
    actorRole: (req.membership?.role as Role) ?? null,
  };
}

function actorHas(req: AuthRequest, code: PermissionCode): boolean {
  const role = req.membership?.role as Role | undefined;
  if (!role) return false;
  return hasPermission(role, req.membership?.permissions ?? [], code);
}

function denyWith(res: Response, req: AuthRequest, code: string | null) {
  logDenied({
    ...currentActor(req),
    actionType: 'PERMISSION_DENIED',
    description: `محاولة تنفيذ إجراء بدون صلاحية${code ? ` (${code})` : ''} — ${req.method} ${req.originalUrl}`,
    entityType: 'PERMISSION',
    entityId: code,
    targetUserId: req.user?.id ?? null,
    reason: `required_permission=${code ?? 'none'}`,
  });

  return res.status(403).json({
    error: 'لا تملك صلاحية تنفيذ هذا الإجراء، يرجى مراجعة صاحب المحل',
    code: 'PERMISSION_DENIED',
    ...(code ? { required_permission: code } : {}),
  });
}

/** يتطلب صلاحية واحدة محددة. */
function requirePermission(code: PermissionCode) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (actorHas(req, code)) return next();
    return denyWith(res, req, code);
  };
}

/** يتطلب واحدة من عدة صلاحيات (يكفي واحدة). */
function requireAnyPermission(codes: PermissionCode[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (codes.some((code) => actorHas(req, code))) return next();
    return denyWith(res, req, codes.join('|'));
  };
}

/** يتطلب أن يكون المستخدم صاحب المحل (للعمليات الحصرية). */
function requireOwner() {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.membership?.role === 'owner') return next();
    return denyWith(res, req, 'owner_only');
  };
}

/**
 * يستنتج معرّف المحل من معرّف الدخول (هاتف/بريد) — يُستخدم لتسجيل أحداث الحجب
 * في سجل التدقيق داخل نطاق محل صحيح (سجل التدقيق مقيّد بالمحل دائمًا).
 */
function resolveProjectIdForIdentifier(identifier: string): string | null {
  try {
    const norm = normalizePhoneNumber(identifier);
    const user = db
      .prepare('SELECT id FROM users WHERE phone = ? OR phone = ? OR email = ?')
      .get(norm, identifier, identifier) as any;
    if (!user) return null;

    const owned = db.prepare('SELECT id FROM projects WHERE owner_id = ?').get(user.id) as any;
    if (owned) return owned.id;

    const membership = db
      .prepare("SELECT project_id FROM project_memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1")
      .get(user.id) as any;
    return membership?.project_id ?? null;
  } catch {
    return null;
  }
}

function logActivity(
  projectId: string,
  userId: string,
  userName: string,
  actionType: string,
  description: string,
  entityType: string,
  entityId: string | null = null,
  actorRole: string | null = null
) {
  // التوقيع متوافق مع الاستخدامات القائمة؛ التفاصيل الإضافية تُمرَّر عند الحاجة فقط.
  logAudit({
    projectId,
    actorId: userId,
    actorName: userName,
    actorRole,
    actionType,
    description,
    entityType,
    entityId,
  });
}

function createNotification(
  projectId: string,
  userId: string | null,
  type: string,
  title: string,
  message: string
) {
  try {
    db.prepare(`
      INSERT INTO notifications (id, project_id, user_id, type, title, message, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      generateId(),
      projectId,
      userId,
      type,
      title,
      message,
      new Date().toISOString()
    );
  } catch (err) {
    console.error('Error creating notification:', err);
  }
}

// ================= AUTH ENDPOINTS =================

app.post('/api/auth/register', (req: Request, res: Response) => {
  try {
    const { name, projectName, phone, email, password, confirmPassword, projectPassword } = req.body;

    if (!name || !projectName || !phone || !password) {
      return res.status(400).json({ error: 'يرجى ملء جميع الحقول الإلزامية' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن لا تقل عن 6 أحرف' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: 'كلمة المرور وتأكيدها غير متطابقين' });
    }

    const cleanPhone = normalizePhoneNumber(phone);
    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح' });
    }

    // Check phone uniqueness across all projects
    const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
    if (existingPhone) {
      return res.status(400).json({ error: 'رقم التليفون مستخدم بالفعل، من فضلك استخدم رقمًا آخر' });
    }

    // Check email uniqueness if provided
    if (email && email.trim() !== '') {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
      if (existingEmail) {
        return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل من قبل حساب آخر' });
      }
    }

    const userId = generateId();
    const projectId = generateId();
    const passwordHash = hashSecret(password);
    const projectPasswordHash = hashSecret(projectPassword || password);
    const now = new Date().toISOString();

    // Insert user with normalized phone
    db.prepare(`
      INSERT INTO users (id, name, phone, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, 'owner', ?)
    `).run(userId, name.trim(), cleanPhone, email ? email.trim() : null, passwordHash, now);

    // Insert project
    db.prepare(`
      INSERT INTO projects (id, name, owner_id, project_password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(projectId, projectName.trim(), userId, projectPasswordHash, now);

    // Insert owner membership with all permissions (من المصفوفة المركزية)
    const allPermissions = normalizePermissions('owner', null);

    db.prepare(`
      INSERT INTO project_memberships
        (id, project_id, user_id, role, status, permissions, created_at, proposed_permissions, approved_by, approved_at)
      VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      projectId,
      userId,
      JSON.stringify(allPermissions),
      now,
      JSON.stringify(allPermissions),
      userId,
      now
    );

    // Create session token
    const token = generateId() + generateId();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    db.prepare(`
      INSERT INTO auth_tokens (token, user_id, project_id, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(token, userId, projectId, expiresAt);

    logActivity(projectId, userId, name, 'REGISTER', `تم إنشاء حساب جديد ومشروع: ${projectName}`, 'PROJECT', projectId);
    createNotification(projectId, userId, 'WELCOME', 'مرحبًا بك في تطبيق AH2', `تم إنشاء مشروع ${projectName} بنجاح، يمكنك الآن البدء بإضافة العملاء وتسجيل العمليات.`);

    const user = { id: userId, name, phone, email: email || null, role: 'owner' as Role, account_status: 'active' as AccountStatus, created_at: now };
    const project = { id: projectId, name: projectName, owner_id: userId, created_at: now };

    return res.status(201).json({
      message: 'تم إنشاء الحساب والمشروع بنجاح',
      token,
      user,
      project,
      permissions: allPermissions,
    });
  } catch (error: any) {
    if (error?.message && error.message.includes('UNIQUE constraint failed: users.phone')) {
      return res.status(400).json({ error: 'رقم التليفون مستخدم بالفعل، من فضلك استخدم رقمًا آخر' });
    }
    console.error('Register error:', error);
    return res.status(500).json({ error: 'حدث خطأ غير متوقع أثناء إنشاء الحساب' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'يرجى إدخال اسم المستخدم / رقم الهاتف وكلمة المرور' });
    }

    const cleanIdentifier = identifier.trim();
    const normIdentifier = normalizePhoneNumber(identifier);

    // ── حدّ محاولات الدخول: يمنع التخمين الآلي ──
    const throttleKey = buildThrottleKey(cleanIdentifier || normIdentifier, req.ip);
    const throttle = checkLoginThrottle(throttleKey);
    if (throttle.blocked) {
      const waitMinutes = Math.ceil(throttle.retryAfterSeconds / 60);
      const blockedProjectId = resolveProjectIdForIdentifier(cleanIdentifier || normIdentifier);
      if (blockedProjectId) {
        logDenied({
          projectId: blockedProjectId,
          actorId: null,
          actorName: cleanIdentifier,
          actionType: 'LOGIN_THROTTLED',
          description: `تم حجب محاولة دخول متكررة على الحساب: ${cleanIdentifier}`,
          entityType: 'USER',
          reason: `too_many_attempts retry_after=${throttle.retryAfterSeconds}s`,
        });
      }
      return res.status(429).json({
        error: `تم إيقاف المحاولات مؤقتًا بسبب تكرار كلمة مرور خاطئة. أعد المحاولة بعد ${waitMinutes} دقيقة.`,
        code: 'TOO_MANY_ATTEMPTS',
        retry_after_seconds: throttle.retryAfterSeconds,
      });
    }

    const user = db.prepare(`
      SELECT * FROM users WHERE phone = ? OR phone = ? OR email = ?
    `).get(normIdentifier, cleanIdentifier, cleanIdentifier) as any;

    if (!user) {
      const state = recordLoginFailure(throttleKey);
      return res.status(401).json({
        error: 'بيانات الدخول غير صحيحة، يرجى التأكد والمحاولة ثانية',
        remaining_attempts: state.remaining,
      });
    }

    if (!verifySecret(password, user.password_hash)) {
      const state = recordLoginFailure(throttleKey);
      if (state.blocked) {
        const lockProjectId = resolveProjectIdForIdentifier(user.phone) ?? resolveProjectIdForIdentifier(user.email ?? '');
        if (lockProjectId) {
          logDenied({
            projectId: lockProjectId,
            actorId: user.id,
            actorName: user.name,
            actionType: 'LOGIN_THROTTLED',
            description: `تم قفل محاولات الدخول بعد ${MAX_LOGIN_FAILURES} محاولة فاشلة`,
            entityType: 'USER',
            entityId: user.id,
            targetUserId: user.id,
            reason: `locked_for=${LOGIN_LOCK_MINUTES}m`,
          });
        }
        return res.status(429).json({
          error: `تم إيقاف المحاولات مؤقتًا بسبب تكرار كلمة مرور خاطئة. أعد المحاولة بعد ${LOGIN_LOCK_MINUTES} دقيقة.`,
          code: 'TOO_MANY_ATTEMPTS',
          retry_after_seconds: LOGIN_LOCK_MINUTES * 60,
        });
      }
      return res.status(401).json({
        error: 'بيانات الدخول غير صحيحة، يرجى التأكد والمحاولة ثانية',
        remaining_attempts: state.remaining,
      });
    }

    // دخول صحيح بكلمة المرور ⇒ صفر العدّاد
    clearLoginFailures(throttleKey);

    // Find user's project (بدون أي تصفية على الحالة — الحالة تُفحص بعد ذلك بقرار واضح)
    let project = db.prepare('SELECT * FROM projects WHERE owner_id = ?').get(user.id) as any;
    let membership = db.prepare('SELECT * FROM project_memberships WHERE user_id = ?').get(user.id) as any;

    if (!project && membership) {
      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(membership.project_id) as any;
    }

    if (!project) {
      return res.status(404).json({ error: 'لا يوجد مشروع مرتبط بهذا الحساب' });
    }

    if (!membership) {
      membership = db.prepare('SELECT * FROM project_memberships WHERE project_id = ? AND user_id = ?').get(project.id, user.id) as any;
    }

    if (!membership) {
      return res.status(403).json({ error: 'لا يوجد عضوية صالحة لهذا الحساب في المشروع، يرجى مراجعة صاحب المحل' });
    }

    // ── فحص حالة الحساب: لا دخول إلا للحسابات النشطة ──
    const accountStatus: string = membership.status;
    const role: Role = isRole(membership.role) ? membership.role : 'employee';

    if (!canLoginWithStatus(accountStatus)) {
      const statusMessage: Record<string, string> = {
        pending: 'حسابك في انتظار اعتماد صاحب المحل، لا يمكنك الدخول قبل الاعتماد',
        disabled: 'حسابك معطل حاليًا، يرجى مراجعة صاحب المحل لإعادة التفعيل',
        rejected: 'تم رفض طلب إنشاء حسابك من صاحب المحل، لا يمكنك الدخول',
        deleted: 'هذا الحساب محذوف ولا يمكن استخدامه، يرجى مراجعة صاحب المحل',
      };

      logDenied({
        projectId: project.id,
        actorId: user.id,
        actorName: user.name,
        actorRole: role,
        actionType: 'LOGIN_DENIED',
        description: `محاولة دخول مرفوضة — حالة الحساب: ${ACCOUNT_STATUS_LABELS[accountStatus as AccountStatus] ?? accountStatus}`,
        entityType: 'USER',
        entityId: user.id,
        targetUserId: user.id,
        reason: `account_status=${accountStatus}`,
      });

      return res.status(403).json({
        error: statusMessage[accountStatus] ?? 'هذا الحساب غير نشط حاليًا، يرجى مراجعة صاحب المحل',
        account_status: accountStatus,
        code: 'ACCOUNT_NOT_ACTIVE',
      });
    }

    const permissions = normalizePermissions(role, membership.permissions);

    const token = generateId() + generateId();
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    db.prepare(`
      INSERT INTO auth_tokens (token, user_id, project_id, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(token, user.id, project.id, expiresAt);

    // آخر تسجيل دخول
    const loginAt = new Date().toISOString();
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(loginAt, user.id);

    logAudit({
      projectId: project.id,
      actorId: user.id,
      actorName: user.name,
      actorRole: role,
      actionType: 'LOGIN',
      description: 'تم تسجيل الدخول بنجاح',
      entityType: 'USER',
      entityId: user.id,
      targetUserId: user.id,
    });

    return res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role,
        account_status: accountStatus,
        last_login_at: loginAt,
        created_at: user.created_at,
      },
      project: {
        id: project.id,
        name: project.name,
        owner_id: project.owner_id,
        created_at: project.created_at,
      },
      permissions,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'حدث خطأ في الخادم أثناء تسجيل الدخول' });
  }
});

app.get('/api/auth/me', authMiddleware, (req: AuthRequest, res: Response) => {
  // الدور والحالة من العضوية (وليس من صف المستخدم) — لأن صلاحية الوصول تُحدَّد داخل المحل
  const role: Role = req.membership?.role ?? 'employee';
  const accountStatus: AccountStatus = req.membership?.status ?? 'active';

  return res.json({
    user: {
      ...req.user,
      role,
      account_status: accountStatus,
      last_login_at: req.user?.last_login_at ?? null,
    },
    project: {
      id: req.project.id,
      name: req.project.name,
      owner_id: req.project.owner_id,
      created_at: req.project.created_at,
    },
    permissions: req.membership ? req.membership.permissions : [],
    role,
    account_status: accountStatus,
  });
});

app.post('/api/auth/logout', authMiddleware, (req: AuthRequest, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token);
  }

  logAudit({
    projectId: req.project.id,
    actorId: req.user.id,
    actorName: req.user.name,
    actorRole: req.membership?.role ?? null,
    actionType: 'LOGOUT',
    description: 'تم تسجيل الخروج',
    entityType: 'USER',
    entityId: req.user.id,
    targetUserId: req.user.id,
    result: 'success',
  });

  return res.json({ message: 'تم تسجيل الخروج بنجاح' });
});

app.post('/api/auth/change-password', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'يرجى إدخال كلمة المرور القديمة والجديدة' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف' });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'تأكيد كلمة المرور غير متطابق' });
    }

    const userRecord = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id) as any;
    if (!verifySecret(oldPassword, userRecord.password_hash)) {
      return res.status(400).json({ error: 'كلمة المرور القديمة غير صحيحة' });
    }

    const newHash = hashSecret(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    logActivity(req.project.id, req.user.id, req.user.name, 'PASSWORD_CHANGE', 'تم تغيير كلمة المرور بنجاح', 'USER', req.user.id);
    createNotification(req.project.id, req.user.id, 'SECURITY', 'تم تغيير كلمة المرور', 'تم تحديث كلمة المرور الخاصة بحسابك بنجاح.');

    return res.json({ message: 'تم تحديث كلمة المرور بنجاح' });
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ أثناء تغيير كلمة المرور' });
  }
});

app.post('/api/auth/update-profile', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, projectName } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'الاسم ورقم الهاتف مطلوبان' });
    }

    const cleanPhone = normalizePhoneNumber(phone);
    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح' });
    }

    // Check phone uniqueness across all users/projects (excluding current user)
    const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(cleanPhone, req.user.id) as any;
    if (existingPhone) {
      return res.status(400).json({ error: 'رقم التليفون مستخدم بالفعل، من فضلك استخدم رقمًا آخر' });
    }

    if (email && email.trim() !== '') {
      const existingEmail = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.trim(), req.user.id) as any;
      if (existingEmail) {
        return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل من قبل حساب آخر' });
      }
    }

    db.prepare(`
      UPDATE users SET name = ?, phone = ?, email = ? WHERE id = ?
    `).run(name.trim(), cleanPhone, email && email.trim() ? email.trim() : null, req.user.id);

    if (projectName && projectName.trim() && req.user.role === 'owner') {
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(projectName.trim(), req.project.id);
    }

    logActivity(req.project.id, req.user.id, req.user.name, 'UPDATE_PROFILE', 'تم تحديث بيانات الملف الشخصي', 'USER', req.user.id);

    return res.json({ message: 'تم تحديث بيانات الملف الشخصي بنجاح' });
  } catch (error: any) {
    if (error?.message && error.message.includes('UNIQUE constraint failed: users.phone')) {
      return res.status(400).json({ error: 'رقم التليفون مستخدم بالفعل، من فضلك استخدم رقمًا آخر' });
    }
    return res.status(500).json({ error: 'حدث خطأ أثناء تعديل الملف الشخصي' });
  }
});

app.post('/api/auth/verify-project-password', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const { projectPassword } = req.body;
    if (!projectPassword) {
      return res.status(400).json({ valid: false, error: 'يرجى إدخال كلمة مرور المشروع' });
    }

    const project = db.prepare('SELECT project_password_hash FROM projects WHERE id = ?').get(req.project.id) as any;
    if (!project || !project.project_password_hash) {
      return res.status(400).json({ valid: false, error: 'لم يتم تعيين كلمة مرور للمشروع بعد' });
    }

    const isValid = verifySecret(projectPassword, project.project_password_hash);
    if (!isValid) {
      return res.status(401).json({ valid: false, error: 'كلمة مرور المشروع غير صحيحة' });
    }

    return res.json({ valid: true });
  } catch (error) {
    return res.status(500).json({ valid: false, error: 'حدث خطأ أثناء التحقق من كلمة المرور' });
  }
});

app.post('/api/auth/set-project-password', authMiddleware, requireOwner(), (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newProjectPassword } = req.body;
    if (!newProjectPassword || newProjectPassword.length < 4) {
      return res.status(400).json({ error: 'كلمة مرور المشروع يجب ألا تقل عن 4 رموز' });
    }

    const project = db.prepare('SELECT project_password_hash FROM projects WHERE id = ?').get(req.project.id) as any;
    if (project.project_password_hash) {
      if (!currentPassword || !verifySecret(currentPassword, project.project_password_hash)) {
        return res.status(401).json({ error: 'كلمة مرور المشروع الحالية غير صحيحة' });
      }
    }

    const newHash = hashSecret(newProjectPassword);
    db.prepare('UPDATE projects SET project_password_hash = ? WHERE id = ?').run(newHash, req.project.id);

    logActivity(req.project.id, req.user.id, req.user.name, 'PROJECT_PASSWORD_UPDATE', 'تم تغيير كلمة مرور المشروع', 'PROJECT', req.project.id);
    createNotification(req.project.id, req.user.id, 'SECURITY', 'كلمة مرور المشروع', 'تم تحديث كلمة مرور المشروع بنجاح.');

    return res.json({ message: 'تم تحديث كلمة مرور المشروع بنجاح' });
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ في تعيين كلمة المرور' });
  }
});

// ================= ACCOUNT & PASSWORD RECOVERY ENDPOINTS =================

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function findUserPrimaryProject(userId: string): any {
  let project = db.prepare('SELECT * FROM projects WHERE owner_id = ?').get(userId) as any;
  if (!project) {
    const membership = db
      .prepare('SELECT project_id FROM project_memberships WHERE user_id = ? AND status = "active"')
      .get(userId) as any;
    if (membership) {
      project = db.prepare('SELECT * FROM projects WHERE id = ?').get(membership.project_id) as any;
    }
  }
  return project;
}

// 0. Check configured recovery providers (never exposes API keys)
app.get('/api/auth/recovery/status', (_req: Request, res: Response) => {
  const status = getRecoveryProviderStatus();
  return res.json({
    emailProviderConfigured: status.emailProviderConfigured,
    smsProviderConfigured: status.smsProviderConfigured,
  });
});

// 1. Request Password Reset Link via Email
app.post('/api/auth/recovery/email/request', async (req: Request, res: Response) => {
  try {
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
    }

    const ip = getClientIp(req);
    const ipLimit = checkAndIncrementRateLimit(`send:email:ip:${ip}`, 5, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      return res.status(429).json({
        error: `تم تجاوز الحد المسموح لطلبات الاستعادة. يرجى الانتظار ${ipLimit.retryAfterSec} ثانية قبل المحاولة مجددًا.`,
      });
    }

    const targetLimit = checkAndIncrementRateLimit(`send:email:target:${rawEmail}`, 3, 15 * 60 * 1000);
    if (!targetLimit.allowed) {
      return res.status(429).json({
        error: `تم إرسال عدة طلبات لهذا البريد مؤخرًا. يرجى الانتظار ${targetLimit.retryAfterSec} ثانية قبل طلب رابط جديد.`,
      });
    }

    const providerStatus = getRecoveryProviderStatus();
    if (!providerStatus.emailProviderConfigured) {
      return res.status(503).json({
        providerConfigured: false,
        error:
          'خدمة إرسال البريد الإلكتروني غير مهيأة حاليًا على الخادم. يرجى ضبط مفاتيح مزود البريد (مثل RESEND_API_KEY أو SENDGRID_API_KEY أو BREVO_API_KEY أو EMAIL_WEBHOOK_URL) في إعدادات الخادم أولاً.',
      });
    }

    const user = db
      .prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?')
      .get(rawEmail) as any;

    const genericSuccessMessage =
      'إذا كان البريد الإلكتروني مسجلاً في النظام، فقد تم إرسال رابط آمن ومؤقت لإعادة تعيين كلمة المرور إليه.';

    if (!user) {
      return res.json({ message: genericSuccessMessage });
    }

    // Invalidate previous unused email reset tokens for this user
    const now = Date.now();
    db.prepare(
      `UPDATE account_recovery_tokens SET used_at = ? WHERE user_id = ? AND purpose = 'reset_password_email' AND used_at IS NULL`
    ).run(now, user.id);

    const rawToken = generateSecureLinkToken();
    const tokenHash = hashSecret(rawToken);
    const expiresInMinutes = 15;
    const expiresAt = now + expiresInMinutes * 60 * 1000;
    const tokenId = generateId();

    db.prepare(
      `INSERT INTO account_recovery_tokens (id, user_id, channel, purpose, secret_hash, expires_at, used_at, attempts, max_attempts, ip_address, created_at)
       VALUES (?, ?, 'email', 'reset_password_email', ?, ?, NULL, 0, 5, ?, ?)`
    ).run(tokenId, user.id, tokenHash, expiresAt, ip, new Date(now).toISOString());

    const baseUrl = (
      process.env.APP_URL || `${req.protocol}://${req.get('host') || 'localhost:3000'}`
    ).replace(/\/+$/, '');
    const resetUrl = `${baseUrl}/?reset_token=${encodeURIComponent(rawToken)}&uid=${encodeURIComponent(user.id)}`;

    try {
      await sendPasswordResetEmail({
        toEmail: user.email,
        userName: user.name,
        resetUrl,
        expiresInMinutes,
      });
    } catch (sendErr: any) {
      // Roll back the token if actual email delivery failed so we never claim fake success
      db.prepare('DELETE FROM account_recovery_tokens WHERE id = ?').run(tokenId);
      return res.status(502).json({
        error: sendErr?.message || 'تعذر إرسال رسالة البريد الإلكتروني عبر المزود المهيأ',
      });
    }

    const project = findUserPrimaryProject(user.id);
    if (project) {
      logActivity(
        project.id,
        user.id,
        user.name,
        'PASSWORD_RESET_REQUEST_EMAIL',
        'تم طلب رابط إعادة تعيين كلمة المرور عبر البريد الإلكتروني',
        'USER',
        user.id
      );
    }

    return res.json({ message: genericSuccessMessage });
  } catch (error: any) {
    console.error('Email recovery request error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء معالجة طلب استعادة كلمة المرور' });
  }
});

// 2. Verify Email Password Reset Link Token
app.post('/api/auth/recovery/email/verify-token', (req: Request, res: Response) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const token = String(req.body?.token || '').trim();
    if (!userId || !token) {
      return res.status(400).json({ valid: false, error: 'رابط إعادة تعيين كلمة المرور غير مكتمل أو غير صالح' });
    }

    const ip = getClientIp(req);
    const verifyLimit = checkAndIncrementRateLimit(`verify:email:${ip}:${userId}`, 10, 15 * 60 * 1000);
    if (!verifyLimit.allowed) {
      return res.status(429).json({
        valid: false,
        error: `تم تجاوز الحد المسموح لمحاولات التحقق. يرجى الانتظار ${verifyLimit.retryAfterSec} ثانية.`,
      });
    }

    const record = db
      .prepare(
        `SELECT * FROM account_recovery_tokens
         WHERE user_id = ? AND purpose = 'reset_password_email'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(userId) as any;

    if (!record) {
      return res.status(400).json({ valid: false, error: 'رابط إعادة تعيين كلمة المرور غير صالح' });
    }

    if (record.used_at !== null && record.used_at !== undefined) {
      return res.status(400).json({
        valid: false,
        error: 'تم استخدام رابط إعادة تعيين كلمة المرور هذا مسبقًا ولا يمكن استخدامه مرة أخرى',
      });
    }

    if (Number(record.expires_at) <= Date.now()) {
      return res.status(400).json({
        valid: false,
        error: 'انتهت صلاحية رابط إعادة تعيين كلمة المرور، يرجى طلب رابط جديد',
      });
    }

    if (Number(record.attempts) >= Number(record.max_attempts)) {
      return res.status(429).json({
        valid: false,
        error: 'تم تجاوز الحد الأقصى لمحاولات التحقق من هذا الرابط، يرجى طلب رابط جديد',
      });
    }

    if (!verifySecret(token, record.secret_hash)) {
      db.prepare('UPDATE account_recovery_tokens SET attempts = attempts + 1 WHERE id = ?').run(record.id);
      return res.status(400).json({ valid: false, error: 'رابط إعادة تعيين كلمة المرور غير صالح' });
    }

    return res.json({ valid: true });
  } catch (error) {
    return res.status(500).json({ valid: false, error: 'حدث خطأ أثناء التحقق من صلاحية الرابط' });
  }
});

// 3. Complete Password Reset via Email Link Token
app.post('/api/auth/recovery/email/reset', (req: Request, res: Response) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!userId || !token || !newPassword) {
      return res.status(400).json({ error: 'يرجى إدخال جميع البيانات المطلوبة' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة وتأكيدها غير متطابقين' });
    }

    const record = db
      .prepare(
        `SELECT * FROM account_recovery_tokens
         WHERE user_id = ? AND purpose = 'reset_password_email'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(userId) as any;

    if (!record) {
      return res.status(400).json({ error: 'رابط إعادة تعيين كلمة المرور غير صالح' });
    }

    if (record.used_at !== null && record.used_at !== undefined) {
      return res.status(400).json({
        error: 'تم استخدام رابط إعادة تعيين كلمة المرور هذا مسبقًا ولا يمكن استخدامه مرة أخرى',
      });
    }

    if (Number(record.expires_at) <= Date.now()) {
      return res.status(400).json({
        error: 'انتهت صلاحية رابط إعادة تعيين كلمة المرور، يرجى طلب رابط جديد',
      });
    }

    if (Number(record.attempts) >= Number(record.max_attempts)) {
      return res.status(429).json({
        error: 'تم تجاوز الحد الأقصى لمحاولات التحقق من هذا الرابط، يرجى طلب رابط جديد',
      });
    }

    if (!verifySecret(token, record.secret_hash)) {
      db.prepare('UPDATE account_recovery_tokens SET attempts = attempts + 1 WHERE id = ?').run(record.id);
      return res.status(400).json({ error: 'رابط إعادة تعيين كلمة المرور غير صالح' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'الحساب غير موجود' });
    }

    const now = Date.now();
    const newHash = hashSecret(newPassword);

    // Mark token as used and update user's password hash without altering any project/customer/transaction data
    db.prepare('UPDATE account_recovery_tokens SET used_at = ? WHERE id = ?').run(now, record.id);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);
    db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').run(user.id);

    const project = findUserPrimaryProject(user.id);
    if (project) {
      logActivity(
        project.id,
        user.id,
        user.name,
        'PASSWORD_RESET_COMPLETED_EMAIL',
        'تم إعادة تعيين كلمة المرور بنجاح عبر رابط البريد الإلكتروني',
        'USER',
        user.id
      );
      createNotification(
        project.id,
        user.id,
        'SECURITY',
        'تم استعادة كلمة المرور',
        'تم تغيير كلمة المرور الخاصة بحسابك بنجاح عبر البريد الإلكتروني.'
      );
    }

    return res.json({
      message: 'تم إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
    });
  } catch (error) {
    console.error('Email reset error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ كلمة المرور الجديدة' });
  }
});

// 4. Request SMS OTP for Phone Password Reset or Forgot Email Recovery
app.post('/api/auth/recovery/phone/request', async (req: Request, res: Response) => {
  try {
    const rawPhone = String(req.body?.phone || '').trim();
    const purpose: 'reset_password_sms' | 'forgot_email_sms' =
      req.body?.purpose === 'forgot_email_sms' ? 'forgot_email_sms' : 'reset_password_sms';

    const cleanPhone = normalizePhoneNumber(rawPhone);
    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح' });
    }

    const ip = getClientIp(req);
    const ipLimit = checkAndIncrementRateLimit(`send:sms:ip:${ip}`, 5, 15 * 60 * 1000);
    if (!ipLimit.allowed) {
      return res.status(429).json({
        error: `تم تجاوز الحد المسموح لطلبات إرسال الرسائل. يرجى الانتظار ${ipLimit.retryAfterSec} ثانية قبل المحاولة مجددًا.`,
      });
    }

    const phoneLimit = checkAndIncrementRateLimit(
      `send:sms:target:${cleanPhone}:${purpose}`,
      3,
      15 * 60 * 1000
    );
    if (!phoneLimit.allowed) {
      return res.status(429).json({
        error: `تم إرسال عدة رموز تحقق لهذا الرقم مؤخرًا. يرجى الانتظار ${phoneLimit.retryAfterSec} ثانية قبل طلب رمز جديد.`,
      });
    }

    const providerStatus = getRecoveryProviderStatus();
    if (!providerStatus.smsProviderConfigured) {
      return res.status(503).json({
        providerConfigured: false,
        error:
          'خدمة إرسال الرسائل النصية (SMS) غير مهيأة حاليًا على الخادم. يرجى ضبط مفاتيح مزود الرسائل (مثل TWILIO أو VONAGE أو SMS_GATEWAY_URL) في إعدادات الخادم أولاً.',
      });
    }

    const user = db
      .prepare('SELECT * FROM users WHERE phone = ? OR phone = ?')
      .get(cleanPhone, rawPhone) as any;

    const genericSuccessMessage =
      'إذا كان رقم الهاتف مسجلاً وموثقاً في النظام، فقد تم إرسال رمز التحقق المؤقت إليه عبر رسالة نصية (SMS).';

    // Only allow recovery if the phone belongs to a registered user AND is verified
    if (!user || Number(user.phone_verified ?? 1) !== 1) {
      return res.json({ message: genericSuccessMessage });
    }

    const now = Date.now();
    db.prepare(
      `UPDATE account_recovery_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL`
    ).run(now, user.id, purpose);

    const otpCode = generateSecureOtpCode();
    const otpHash = hashSecret(otpCode);
    const expiresInMinutes = 10;
    const expiresAt = now + expiresInMinutes * 60 * 1000;
    const tokenId = generateId();

    db.prepare(
      `INSERT INTO account_recovery_tokens (id, user_id, channel, purpose, secret_hash, expires_at, used_at, attempts, max_attempts, ip_address, created_at)
       VALUES (?, ?, 'sms', ?, ?, ?, NULL, 0, 5, ?, ?)`
    ).run(tokenId, user.id, purpose, otpHash, expiresAt, ip, new Date(now).toISOString());

    try {
      await sendOtpSms({
        phone: cleanPhone,
        otpCode,
        purpose,
        expiresInMinutes,
      });
    } catch (sendErr: any) {
      // Roll back the OTP token if real SMS delivery failed so we never claim fake success
      db.prepare('DELETE FROM account_recovery_tokens WHERE id = ?').run(tokenId);
      return res.status(502).json({
        error: sendErr?.message || 'تعذر إرسال الرسالة النصية عبر مزود الـ SMS المهيأ',
      });
    }

    const project = findUserPrimaryProject(user.id);
    if (project) {
      logActivity(
        project.id,
        user.id,
        user.name,
        purpose === 'forgot_email_sms'
          ? 'ACCOUNT_RECOVERY_OTP_SENT'
          : 'PASSWORD_RESET_OTP_SENT',
        'تم إرسال رمز تحقق عبر الهاتف لاستعادة الحساب',
        'USER',
        user.id
      );
    }

    return res.json({ message: genericSuccessMessage });
  } catch (error) {
    console.error('Phone recovery request error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء معالجة طلب إرسال رمز التحقق' });
  }
});

// 5. Verify SMS OTP Code (for Phone Password Reset OR Forgot Email Recovery)
app.post('/api/auth/recovery/phone/verify-otp', (req: Request, res: Response) => {
  try {
    const rawPhone = String(req.body?.phone || '').trim();
    const code = String(req.body?.code || '').trim();
    const purpose: 'reset_password_sms' | 'forgot_email_sms' =
      req.body?.purpose === 'forgot_email_sms' ? 'forgot_email_sms' : 'reset_password_sms';

    const cleanPhone = normalizePhoneNumber(rawPhone);
    if (!cleanPhone || !code) {
      return res.status(400).json({ error: 'يرجى إدخال رقم الهاتف ورمز التحقق المكون من 6 أرقام' });
    }

    const ip = getClientIp(req);
    const verifyLimit = checkAndIncrementRateLimit(
      `verify:sms:${ip}:${cleanPhone}`,
      10,
      15 * 60 * 1000
    );
    if (!verifyLimit.allowed) {
      return res.status(429).json({
        error: `تم تجاوز الحد المسموح لمحاولات التحقق. يرجى الانتظار ${verifyLimit.retryAfterSec} ثانية قبل المحاولة مجددًا.`,
      });
    }

    const user = db
      .prepare('SELECT * FROM users WHERE phone = ? OR phone = ?')
      .get(cleanPhone, rawPhone) as any;

    if (!user || Number(user.phone_verified ?? 1) !== 1) {
      return res.status(400).json({ error: 'رمز التحقق غير صحيح أو غير صالح لهذا الرقم' });
    }

    const record = db
      .prepare(
        `SELECT * FROM account_recovery_tokens
         WHERE user_id = ? AND purpose = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(user.id, purpose) as any;

    if (!record) {
      return res.status(400).json({ error: 'لم يتم العثور على رمز تحقق نشط، يرجى طلب رمز جديد' });
    }

    if (record.used_at !== null && record.used_at !== undefined) {
      return res.status(400).json({
        error: 'تم استخدام رمز التحقق هذا مسبقًا ولا يمكن استخدامه مرة أخرى',
      });
    }

    if (Number(record.expires_at) <= Date.now()) {
      return res.status(400).json({
        error: 'انتهت صلاحية رمز التحقق، يرجى طلب رمز جديد',
      });
    }

    if (Number(record.attempts) >= Number(record.max_attempts)) {
      return res.status(429).json({
        error: 'تم تجاوز الحد الأقصى لمحاولات إدخال الرمز، يرجى طلب رمز جديد',
      });
    }

    if (!verifySecret(code, record.secret_hash)) {
      const nextAttempts = Number(record.attempts) + 1;
      db.prepare('UPDATE account_recovery_tokens SET attempts = ? WHERE id = ?').run(
        nextAttempts,
        record.id
      );
      const remaining = Math.max(0, Number(record.max_attempts) - nextAttempts);
      if (remaining === 0) {
        return res.status(429).json({
          error: 'رمز التحقق غير صحيح، وقد تم استنفاد جميع المحاولات المتاحة. يرجى طلب رمز جديد.',
        });
      }
      return res.status(400).json({
        error: `رمز التحقق غير صحيح (المحاولات المتبقية: ${remaining})`,
      });
    }

    // Valid OTP: mark it as used immediately so it can NEVER be reused
    const now = Date.now();
    db.prepare('UPDATE account_recovery_tokens SET used_at = ? WHERE id = ?').run(now, record.id);

    // Issue a single-use short-lived reset session token (10 minutes)
    const resetSessionToken = generateSecureLinkToken();
    const sessionHash = hashSecret(resetSessionToken);
    db.prepare(
      `INSERT INTO account_recovery_tokens (id, user_id, channel, purpose, secret_hash, expires_at, used_at, attempts, max_attempts, ip_address, created_at)
       VALUES (?, ?, 'sms', 'reset_session', ?, ?, NULL, 0, 3, ?, ?)`
    ).run(
      generateId(),
      user.id,
      sessionHash,
      now + 10 * 60 * 1000,
      ip,
      new Date(now).toISOString()
    );

    if (purpose === 'forgot_email_sms') {
      const project = findUserPrimaryProject(user.id);
      if (project) {
        logActivity(
          project.id,
          user.id,
          user.name,
          'FORGOT_EMAIL_VERIFIED',
          'تم التحقق من ملكية الحساب عبر الهاتف لاستعادة البريد الإلكتروني وبيانات الدخول',
          'USER',
          user.id
        );
      }

      return res.json({
        verified: true,
        resetSessionToken,
        accountInfo: {
          name: user.name,
          phone: user.phone,
          email: user.email || null,
          hasEmail: Boolean(user.email),
        },
      });
    }

    return res.json({
      verified: true,
      resetSessionToken,
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء التحقق من الرمز' });
  }
});

// 6. Complete Password Reset (and optional Email update) after Phone OTP Verification
app.post('/api/auth/recovery/phone/reset-password', (req: Request, res: Response) => {
  try {
    const rawPhone = String(req.body?.phone || '').trim();
    const resetSessionToken = String(req.body?.resetSessionToken || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');
    const newEmail = req.body?.newEmail !== undefined ? String(req.body.newEmail).trim() : undefined;

    const cleanPhone = normalizePhoneNumber(rawPhone);
    if (!cleanPhone || !resetSessionToken || !newPassword) {
      return res.status(400).json({ error: 'يرجى إدخال جميع البيانات المطلوبة' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'كلمة المرور الجديدة وتأكيدها غير متطابقين' });
    }

    const user = db
      .prepare('SELECT * FROM users WHERE phone = ? OR phone = ?')
      .get(cleanPhone, rawPhone) as any;

    if (!user || Number(user.phone_verified ?? 1) !== 1) {
      return res.status(404).json({ error: 'الحساب غير موجود أو غير موثق' });
    }

    const sessionRecord = db
      .prepare(
        `SELECT * FROM account_recovery_tokens
         WHERE user_id = ? AND purpose = 'reset_session'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(user.id) as any;

    if (!sessionRecord) {
      return res.status(400).json({ error: 'جلسة الاستعادة غير صالحة، يرجى إعادة التحقق من الرقم' });
    }

    if (sessionRecord.used_at !== null && sessionRecord.used_at !== undefined) {
      return res.status(400).json({ error: 'تم استخدام جلسة الاستعادة هذه مسبقًا' });
    }

    if (Number(sessionRecord.expires_at) <= Date.now()) {
      return res.status(400).json({ error: 'انتهت صلاحية جلسة الاستعادة، يرجى إعادة التحقق من الرقم' });
    }

    if (!verifySecret(resetSessionToken, sessionRecord.secret_hash)) {
      db.prepare('UPDATE account_recovery_tokens SET attempts = attempts + 1 WHERE id = ?').run(
        sessionRecord.id
      );
      return res.status(400).json({ error: 'جلسة الاستعادة غير صالحة' });
    }

    let updatedEmail = user.email;
    if (newEmail !== undefined && newEmail !== '') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        return res.status(400).json({ error: 'يرجى إدخال بريد إلكتروني صحيح' });
      }
      const existingEmail = db
        .prepare('SELECT id FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) AND id != ?')
        .get(newEmail, user.id) as any;
      if (existingEmail) {
        return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل من قبل حساب آخر' });
      }
      updatedEmail = newEmail;
    }

    const now = Date.now();
    const newHash = hashSecret(newPassword);

    db.prepare('UPDATE account_recovery_tokens SET used_at = ? WHERE id = ?').run(now, sessionRecord.id);
    db.prepare('UPDATE users SET password_hash = ?, email = ? WHERE id = ?').run(
      newHash,
      updatedEmail,
      user.id
    );
    db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').run(user.id);

    const project = findUserPrimaryProject(user.id);
    if (project) {
      logActivity(
        project.id,
        user.id,
        user.name,
        'PASSWORD_RESET_COMPLETED_PHONE',
        'تم استعادة الحساب وتحديث كلمة المرور بنجاح عبر التحقق برقم الهاتف',
        'USER',
        user.id
      );
      createNotification(
        project.id,
        user.id,
        'SECURITY',
        'تم استعادة الحساب وتغيير كلمة المرور',
        'تم تحديث كلمة المرور الخاصة بحسابك بنجاح بعد التحقق من رقم الهاتف.'
      );
    }

    return res.json({
      message: 'تم تحديث كلمة المرور واستعادة الحساب بنجاح. يمكنك الآن تسجيل الدخول.',
    });
  } catch (error) {
    console.error('Phone password reset error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ كلمة المرور الجديدة' });
  }
});

// 7. Submit Official Support Account Ownership Recovery Request (when neither email nor phone is accessible)
app.post('/api/auth/recovery/support-request', (req: Request, res: Response) => {
  try {
    const fullName = String(req.body?.fullName || '').trim();
    const projectName = String(req.body?.projectName || '').trim();
    const enteredContact = String(req.body?.enteredContact || '').trim();
    const alternativeContact = String(req.body?.alternativeContact || '').trim();
    const notes = String(req.body?.notes || '').trim();

    if (!fullName || !projectName || !enteredContact || !alternativeContact) {
      return res.status(400).json({
        error: 'يرجى ملء جميع الحقول المطلوبة (الاسم، اسم المشروع، بيانات الحساب، ووسيلة التواصل البديلة)',
      });
    }

    const ip = getClientIp(req);
    const supportLimit = checkAndIncrementRateLimit(`support:ip:${ip}`, 3, 30 * 60 * 1000);
    if (!supportLimit.allowed) {
      return res.status(429).json({
        error: `تم إرسال عدة طلبات دعم مؤخرًا. يرجى الانتظار ${supportLimit.retryAfterSec} ثانية.`,
      });
    }

    const requestId = `REQ-${Date.now().toString(36).toUpperCase()}`;
    db.prepare(
      `INSERT INTO support_recovery_requests (id, full_name, project_name, entered_contact, alternative_contact, notes, status, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(
      requestId,
      fullName,
      projectName,
      enteredContact,
      alternativeContact,
      notes,
      ip,
      new Date().toISOString()
    );

    return res.status(201).json({
      referenceId: requestId,
      message:
        'تم تسجيل طلب استرداد الحساب والتحقق من الملكية بنجاح. سيتواصل معك فريق الدعم بعد مراجعة بيانات ملكية المشروع.',
    });
  } catch (error) {
    console.error('Support recovery request error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إرسال طلب استرداد الحساب' });
  }
});

// ================= CUSTOMERS ENDPOINTS =================

// Helper to calculate exact balances
function calculateCustomerBalances(projectId: string, customerId?: string) {
  let query = `
    SELECT 
      c.id, c.name, c.phone, c.address, c.type, c.notes, c.created_at, c.updated_at,
      COALESCE(SUM(CASE WHEN t.status = 'active' AND t.type = 'payment' THEN t.amount ELSE 0 END), 0) AS total_payments,
      COALESCE(SUM(CASE WHEN t.status = 'active' AND t.type = 'withdrawal' THEN t.amount ELSE 0 END), 0) AS total_withdrawals,
      COUNT(CASE WHEN t.status = 'active' THEN 1 ELSE NULL END) AS transactions_count
    FROM customers c
    LEFT JOIN transactions t ON t.customer_id = c.id
    WHERE c.project_id = ?
  `;
  const params: any[] = [projectId];

  if (customerId) {
    query += ' AND c.id = ?';
    params.push(customerId);
  }

  query += ' GROUP BY c.id ORDER BY c.created_at DESC';

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((r) => {
    // Round to 2 decimal places cleanly
    const totalPayments = Math.round(Number(r.total_payments) * 100) / 100;
    const totalWithdrawals = Math.round(Number(r.total_withdrawals) * 100) / 100;
    const balance = Math.round((totalPayments - totalWithdrawals) * 100) / 100;

    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      address: r.address || '',
      type: r.type,
      notes: r.notes || '',
      created_at: r.created_at,
      updated_at: r.updated_at,
      total_payments: totalPayments,
      total_withdrawals: totalWithdrawals,
      balance: balance,
      transactions_count: Number(r.transactions_count),
    };
  });
}

app.get('/api/customers', authMiddleware, requirePermission('view_customers'), (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    let list = calculateCustomerBalances(req.project.id);

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q)
      );
    }

    return res.json(list);
  } catch (error) {
    console.error('Get customers error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة العملاء' });
  }
});

app.post('/api/customers', authMiddleware, requirePermission('add_customer'), (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, address, type, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم العميل مطلوب' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    }

    const cleanPhone = normalizePhoneNumber(phone);
    if (!cleanPhone || cleanPhone.length < 6) {
      return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح للعميل' });
    }

    // Check customer phone uniqueness within the same project
    const existingCustomer = db.prepare(`
      SELECT id, name FROM customers
      WHERE project_id = ? AND phone = ?
    `).get(req.project.id, cleanPhone) as any;

    if (existingCustomer) {
      return res.status(400).json({ error: 'رقم التليفون مسجل بالفعل لعميل آخر' });
    }

    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO customers (id, project_id, name, phone, address, type, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.project.id,
      name.trim(),
      cleanPhone,
      address ? address.trim() : '',
      type === 'company' ? 'company' : 'individual',
      notes ? notes.trim() : '',
      now,
      now
    );

    logActivity(req.project.id, req.user.id, req.user.name, 'CREATE_CUSTOMER', `تم إضافة عميل جديد: ${name.trim()}`, 'CUSTOMER', id);
    createNotification(req.project.id, req.user.id, 'CUSTOMER_ADDED', 'عميل جديد', `تم إضافة العميل "${name.trim()}" بنجاح إلى قائمة العملاء.`);

    const created = calculateCustomerBalances(req.project.id, id)[0];
    return res.status(201).json(created);
  } catch (error: any) {
    if (
      error?.message &&
      (error.message.includes('idx_customers_project_phone') ||
        error.message.includes('UNIQUE constraint failed: customers.phone') ||
        error.message.includes('UNIQUE constraint failed: customers.project_id, customers.phone'))
    ) {
      return res.status(400).json({ error: 'رقم التليفون مسجل بالفعل لعميل آخر' });
    }
    console.error('Add customer error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إضافة العميل' });
  }
});

app.get('/api/customers/:id', authMiddleware, requirePermission('view_customers'), (req: AuthRequest, res: Response) => {
  try {
    const customer = calculateCustomerBalances(req.project.id, req.params.id)[0];
    if (!customer) {
      return res.status(404).json({ error: 'العميل غير موجود أو لا ينتمي لهذا المشروع' });
    }

    const transactions = db.prepare(`
      SELECT * FROM transactions
      WHERE customer_id = ? AND project_id = ?
      ORDER BY date DESC, time DESC, created_at DESC
    `).all(req.params.id, req.project.id) as any[];

    return res.json({ customer, transactions });
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب بيانات العميل' });
  }
});

app.put('/api/customers/:id', authMiddleware, requirePermission('edit_customer'), (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, address, type, notes, projectPassword } = req.body;

    // Verify project password on server
    const project = db.prepare('SELECT project_password_hash FROM projects WHERE id = ?').get(req.project.id) as any;
    if (!projectPassword || !verifySecret(projectPassword, project.project_password_hash)) {
      return res.status(401).json({ error: 'كلمة مرور المشروع غير صحيحة، لا يمكن تعديل بيانات العميل بدونها' });
    }

    const existing = db.prepare('SELECT id, name, phone FROM customers WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id) as any;
    if (!existing) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'اسم العميل مطلوب' });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'رقم الهاتف مطلوب' });
    }

    const cleanPhone = normalizePhoneNumber(phone);
    if (!cleanPhone || cleanPhone.length < 6) {
      return res.status(400).json({ error: 'يرجى إدخال رقم هاتف صحيح للعميل' });
    }

    // Verify uniqueness: check if another customer in the same project has this phone
    const duplicateCustomer = db.prepare(`
      SELECT id, name FROM customers
      WHERE project_id = ? AND phone = ? AND id != ?
    `).get(req.project.id, cleanPhone, req.params.id) as any;

    if (duplicateCustomer) {
      return res.status(400).json({ error: 'رقم التليفون مسجل بالفعل لعميل آخر' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE customers 
      SET name = ?, phone = ?, address = ?, type = ?, notes = ?, updated_at = ?
      WHERE id = ? AND project_id = ?
    `).run(
      name.trim(),
      cleanPhone,
      address ? address.trim() : '',
      type === 'company' ? 'company' : 'individual',
      notes ? notes.trim() : '',
      now,
      req.params.id,
      req.project.id
    );

    logActivity(req.project.id, req.user.id, req.user.name, 'UPDATE_CUSTOMER', `تم تعديل بيانات العميل: ${name.trim()}`, 'CUSTOMER', req.params.id);
    createNotification(req.project.id, req.user.id, 'CUSTOMER_UPDATED', 'تعديل عميل', `تم تعديل بيانات العميل "${name.trim()}" بنجاح.`);

    const updated = calculateCustomerBalances(req.project.id, req.params.id)[0];
    return res.json(updated);
  } catch (error: any) {
    if (
      error?.message &&
      (error.message.includes('idx_customers_project_phone') ||
        error.message.includes('UNIQUE constraint failed: customers.phone') ||
        error.message.includes('UNIQUE constraint failed: customers.project_id, customers.phone'))
    ) {
      return res.status(400).json({ error: 'رقم التليفون مسجل بالفعل لعميل آخر' });
    }
    console.error('Update customer error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء تحديث بيانات العميل' });
  }
});

app.delete('/api/customers/:id', authMiddleware, requirePermission('delete_customer'), (req: AuthRequest, res: Response) => {
  try {
    const { projectPassword } = req.body;

    const project = db.prepare('SELECT project_password_hash FROM projects WHERE id = ?').get(req.project.id) as any;
    if (!projectPassword || !verifySecret(projectPassword, project.project_password_hash)) {
      return res.status(401).json({ error: 'كلمة مرور المشروع غير صحيحة، لا يمكن حذف العميل بدونها' });
    }

    const customer = db.prepare('SELECT id, name FROM customers WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id) as any;
    if (!customer) {
      return res.status(404).json({ error: 'العميل غير موجود' });
    }

    // Delete customer (cascade will remove transactions)
    db.prepare('DELETE FROM customers WHERE id = ? AND project_id = ?').run(req.params.id, req.project.id);

    logActivity(req.project.id, req.user.id, req.user.name, 'DELETE_CUSTOMER', `تم حذف العميل نهائياً: ${customer.name}`, 'CUSTOMER', req.params.id);
    createNotification(req.project.id, req.user.id, 'CUSTOMER_DELETED', 'حذف عميل', `تم حذف العميل "${customer.name}" وجميع عملياته نهائياً.`);

    return res.json({ message: 'تم حذف العميل بنجاح من قاعدة البيانات' });
  } catch (error) {
    console.error('Delete customer error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء حذف العميل' });
  }
});

// ================= TRANSACTIONS ENDPOINTS =================

app.get('/api/transactions', authMiddleware, requireAnyPermission(['view_all_transactions', 'view_customer_transactions']), (req: AuthRequest, res: Response) => {
  try {
    const { customerId, fromDate, toDate, status } = req.query;

    let query = `
      SELECT t.*, c.name as customer_name, c.phone as customer_phone
      FROM transactions t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.project_id = ?
    `;
    const params: any[] = [req.project.id];

    if (customerId) {
      query += ' AND t.customer_id = ?';
      params.push(customerId);
    }
    if (fromDate) {
      query += ' AND t.date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      query += ' AND t.date <= ?';
      params.push(toDate);
    }
    if (status) {
      query += ' AND t.status = ?';
      params.push(status);
    }

    // ── تصفية بحسب الصلاحية ──
    // من يملك "مشاهدة جميع العمليات" يرى كل شيء، ومن يملك فقط "سجل عمليات العميل"
    // يجب أن يحدد العميل؛ بدون تحديد عميل لا تُعاد أي عمليات (بدل كسر شاشات التطبيق).
    const canViewAll = actorHas(req, 'view_all_transactions');
    if (!canViewAll && !customerId) {
      return res.json([]);
    }

    query += ' ORDER BY t.date DESC, t.time DESC, t.created_at DESC';

    const transactions = db.prepare(query).all(...params) as any[];
    return res.json(transactions);
  } catch (error) {
    console.error('Get transactions error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب العمليات المالية' });
  }
});

app.post('/api/transactions', authMiddleware, requirePermission('create_transaction'), (req: AuthRequest, res: Response) => {
  try {
    const { customerId, type, amount, date, time, description } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: 'يرجى اختيار العميل' });
    }
    if (type !== 'payment' && type !== 'withdrawal') {
      return res.status(400).json({ error: 'نوع العملية غير صالح (يجب أن يكون دفع أو سحب)' });
    }

    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'المبلغ يجب أن يكون رقماً موجباً أكبر من صفر' });
    }

    const cleanAmount = Math.round(parsedAmount * 100) / 100;

    // Check customer exists in current project
    const customer = db.prepare('SELECT id, name FROM customers WHERE id = ? AND project_id = ?').get(customerId, req.project.id) as any;
    if (!customer) {
      return res.status(404).json({ error: 'العميل غير موجود في هذا المشروع' });
    }

    const id = generateId();
    const now = new Date();
    const txDate = date || now.toISOString().split('T')[0];
    const txTime = time || now.toTimeString().split(' ')[0].substring(0, 5);
    const createdAt = now.toISOString();

    db.prepare(`
      INSERT INTO transactions (id, project_id, customer_id, type, amount, date, time, description, created_by, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(
      id,
      req.project.id,
      customerId,
      type,
      cleanAmount,
      txDate,
      txTime,
      description ? description.trim() : '',
      req.user.id,
      createdAt
    );

    const typeArabic = type === 'payment' ? 'دفع' : 'سحب';
    logActivity(
      req.project.id,
      req.user.id,
      req.user.name,
      'CREATE_TRANSACTION',
      `تم تسجيل عملية ${typeArabic} بمبلغ ${cleanAmount} ج.م للعميل: ${customer.name}`,
      'TRANSACTION',
      id
    );

    createNotification(
      req.project.id,
      req.user.id,
      'TRANSACTION_CREATED',
      `عملية ${typeArabic} جديدة`,
      `تم تسجيل عملية ${typeArabic} بمبلغ ${cleanAmount} ج.م للعميل ${customer.name}.`
    );

    const tx = db.prepare(`
      SELECT t.*, c.name as customer_name, c.phone as customer_phone
      FROM transactions t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.id = ?
    `).get(id) as any;

    // Fetch customer's updated balance
    const updatedCustomer = calculateCustomerBalances(req.project.id, customerId)[0];

    return res.status(201).json({
      transaction: tx,
      customer: updatedCustomer,
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء حفظ العملية المالية' });
  }
});

app.post('/api/transactions/:id/cancel', authMiddleware, requirePermission('cancel_transaction'), (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body;

    const tx = db.prepare(`
      SELECT t.*, c.name as customer_name
      FROM transactions t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.id = ? AND t.project_id = ?
    `).get(req.params.id, req.project.id) as any;

    if (!tx) {
      return res.status(404).json({ error: 'العملية غير موجودة' });
    }

    if (tx.status === 'cancelled') {
      return res.status(400).json({ error: 'العملية ملغاة بالفعل مسبقاً' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE transactions
      SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancellation_reason = ?
      WHERE id = ? AND project_id = ?
    `).run(req.user.id, now, reason ? reason.trim() : 'تم الإلغاء بواسطة المستخدم', req.params.id, req.project.id);

    logAudit({
      projectId: req.project.id,
      actorId: req.user.id,
      actorName: req.user.name,
      actorRole: req.membership?.role ?? null,
      actionType: 'CANCEL_TRANSACTION',
      description: `تم إلغاء عملية ${tx.type === 'payment' ? 'دفع' : 'سحب'} بمبلغ ${tx.amount} ج.م للعميل ${tx.customer_name}`,
      entityType: 'TRANSACTION',
      entityId: req.params.id,
      result: 'success',
      reason: reason ? String(reason).trim() : 'تم الإلغاء بواسطة المستخدم',
    });

    createNotification(
      req.project.id,
      req.user.id,
      'TRANSACTION_CANCELLED',
      'إلغاء عملية مالية',
      `تم إلغاء عملية ${tx.type === 'payment' ? 'دفع' : 'سحب'} بمبلغ ${tx.amount} ج.م للعميل ${tx.customer_name}.`
    );

    const updatedTx = db.prepare(`
      SELECT t.*, c.name as customer_name, c.phone as customer_phone
      FROM transactions t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.id = ?
    `).get(req.params.id);

    const updatedCustomer = calculateCustomerBalances(req.project.id, tx.customer_id)[0];

    return res.json({
      transaction: updatedTx,
      customer: updatedCustomer,
      message: 'تم إلغاء العملية واستبعادها من الرصيد بنجاح',
    });
  } catch (error) {
    console.error('Cancel transaction error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إلغاء العملية' });
  }
});

// ================= REPORTS & STATISTICS =================

app.get('/api/reports/summary', authMiddleware, requireAnyPermission(['view_reports', 'view_balances']), (req: AuthRequest, res: Response) => {
  try {
    const { fromDate, toDate } = req.query;

    const customers = calculateCustomerBalances(req.project.id);
    const totalCustomers = customers.length;

    let positiveBalanceSum = 0;
    let negativeBalanceSum = 0;

    customers.forEach((c) => {
      if (c.balance > 0) {
        positiveBalanceSum += c.balance;
      } else if (c.balance < 0) {
        negativeBalanceSum += Math.abs(c.balance);
      }
    });

    positiveBalanceSum = Math.round(positiveBalanceSum * 100) / 100;
    negativeBalanceSum = Math.round(negativeBalanceSum * 100) / 100;

    // Filtered transaction totals
    let txQuery = `
      SELECT 
        COUNT(CASE WHEN status = 'active' THEN 1 ELSE NULL END) as total_tx_count,
        COALESCE(SUM(CASE WHEN status = 'active' AND type = 'payment' THEN amount ELSE 0 END), 0) as total_payments,
        COALESCE(SUM(CASE WHEN status = 'active' AND type = 'withdrawal' THEN amount ELSE 0 END), 0) as total_withdrawals
      FROM transactions
      WHERE project_id = ?
    `;
    const params: any[] = [req.project.id];

    if (fromDate) {
      txQuery += ' AND date >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      txQuery += ' AND date <= ?';
      params.push(toDate);
    }

    const txTotals = db.prepare(txQuery).get(...params) as any;

    const totalPayments = Math.round(Number(txTotals.total_payments) * 100) / 100;
    const totalWithdrawals = Math.round(Number(txTotals.total_withdrawals) * 100) / 100;
    const totalTransactions = Number(txTotals.total_tx_count);

    const balancesPayload = {
      positiveBalanceSum,
      negativeBalanceSum,
      netBalance: Math.round((positiveBalanceSum - negativeBalanceSum) * 100) / 100,
    };

    // ── تصفية بحسب الصلاحية ──
    // من يملك التقارير يرى كل المؤشرات. من يملك الأرصدة فقط يرى الأرصدة دون تفاصيل التقارير.
    if (!actorHas(req, 'view_reports')) {
      return res.json({
        totalCustomers: 0,
        totalTransactions: 0,
        ...balancesPayload,
        totalPayments: 0,
        totalWithdrawals: 0,
      });
    }

    return res.json({
      totalCustomers,
      totalTransactions,
      ...balancesPayload,
      totalPayments,
      totalWithdrawals,
    });
  } catch (error) {
    console.error('Reports summary error:', error);
    return res.status(500).json({ error: 'حدث خطأ في جلب بيانات التقارير' });
  }
});

// ================= NOTIFICATIONS & ACTIVITY LOGS =================

app.get('/api/notifications', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.project.id);
    return res.json(notifications);
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب الإشعارات' });
  }
});

app.post('/api/notifications/:id/read', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND project_id = ?').run(req.params.id, req.project.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ' });
  }
});

app.post('/api/notifications/read-all', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE project_id = ?').run(req.project.id);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ' });
  }
});

app.get('/api/activity-logs', authMiddleware, requirePermission('manage_users'), (req: AuthRequest, res: Response) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM activity_logs
      WHERE project_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.project.id);
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب سجل النشاط' });
  }
});

// ================= BACKUPS & DATA MANAGEMENT =================

app.get('/api/backups', authMiddleware, requirePermission('manage_backups'), (req: AuthRequest, res: Response) => {
  try {
    const backups = db.prepare(`
      SELECT id, filename, file_size, created_at
      FROM backups
      WHERE project_id = ?
      ORDER BY created_at DESC
    `).all(req.project.id);
    return res.json(backups);
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة النسخ الاحتياطية' });
  }
});

app.post('/api/backups/create', authMiddleware, requirePermission('manage_backups'), (req: AuthRequest, res: Response) => {
  try {
    const customers = db.prepare('SELECT * FROM customers WHERE project_id = ?').all(req.project.id);
    const transactions = db.prepare('SELECT * FROM transactions WHERE project_id = ?').all(req.project.id);
    const notifications = db.prepare('SELECT * FROM notifications WHERE project_id = ?').all(req.project.id);
    const logs = db.prepare('SELECT * FROM activity_logs WHERE project_id = ?').all(req.project.id);

    const backupPayload = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      projectId: req.project.id,
      projectName: req.project.name,
      createdBy: req.user.name,
      data: {
        customers,
        transactions,
        notifications,
        logs,
      },
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const fileSize = Buffer.byteLength(jsonString, 'utf8');
    const dateStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const filename = `backup_ah2_${dateStr}.json`;
    const backupId = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO backups (id, project_id, created_by, filename, file_size, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(backupId, req.project.id, req.user.id, filename, fileSize, jsonString, now);

    logActivity(req.project.id, req.user.id, req.user.name, 'CREATE_BACKUP', `تم إنشاء نسخة احتياطية: ${filename}`, 'BACKUP', backupId);
    createNotification(req.project.id, req.user.id, 'BACKUP_CREATED', 'نسخة احتياطية جديدة', `تم إنشاء نسخة احتياطية بنجاح بحجم ${(fileSize / 1024).toFixed(1)} ك.ب.`);

    return res.status(201).json({
      id: backupId,
      filename,
      file_size: fileSize,
      created_at: now,
      message: 'تم إنشاء النسخة الاحتياطية بنجاح',
    });
  } catch (error) {
    console.error('Create backup error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إنشاء النسخة الاحتياطية' });
  }
});

app.post('/api/backups/restore/:id', authMiddleware, requirePermission('restore_data'), (req: AuthRequest, res: Response) => {
  try {
    const { projectPassword } = req.body;
    const project = db.prepare('SELECT project_password_hash FROM projects WHERE id = ?').get(req.project.id) as any;
    if (!projectPassword || !verifySecret(projectPassword, project.project_password_hash)) {
      return res.status(401).json({ error: 'كلمة مرور المشروع غير صحيحة، لا يمكن استعادة النسخة بدونها' });
    }

    const backup = db.prepare('SELECT * FROM backups WHERE id = ? AND project_id = ?').get(req.params.id, req.project.id) as any;
    if (!backup) {
      return res.status(404).json({ error: 'النسخة الاحتياطية غير موجودة' });
    }

    const payload = JSON.parse(backup.data_json);
    if (!payload.data) {
      return res.status(400).json({ error: 'ملف النسخة الاحتياطية تالف أو غير متوافق' });
    }

    // Atomic restore
    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('DELETE FROM transactions WHERE project_id = ?').run(req.project.id);
      db.prepare('DELETE FROM customers WHERE project_id = ?').run(req.project.id);

      const insertCustomer = db.prepare(`
        INSERT INTO customers (id, project_id, name, phone, address, type, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const c of payload.data.customers || []) {
        insertCustomer.run(c.id, req.project.id, c.name, c.phone, c.address || '', c.type || 'individual', c.notes || '', c.created_at, c.updated_at || c.created_at);
      }

      const insertTx = db.prepare(`
        INSERT INTO transactions (id, project_id, customer_id, type, amount, date, time, description, created_by, status, cancelled_by, cancelled_at, cancellation_reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const t of payload.data.transactions || []) {
        insertTx.run(
          t.id,
          req.project.id,
          t.customer_id,
          t.type,
          t.amount,
          t.date,
          t.time,
          t.description || '',
          t.created_by || req.user.id,
          t.status || 'active',
          t.cancelled_by || null,
          t.cancelled_at || null,
          t.cancellation_reason || null,
          t.created_at
        );
      }

      db.exec('COMMIT;');
    } catch (restoreErr) {
      db.exec('ROLLBACK;');
      throw restoreErr;
    }

    logActivity(req.project.id, req.user.id, req.user.name, 'RESTORE_BACKUP', `تم استعادة النسخة الاحتياطية: ${backup.filename}`, 'BACKUP', backup.id);
    createNotification(req.project.id, req.user.id, 'BACKUP_RESTORED', 'استعادة البيانات', `تم استعادة بيانات المشروع من النسخة ${backup.filename} بنجاح.`);

    return res.json({ message: 'تم استعادة النسخة الاحتياطية بنجاح' });
  } catch (error) {
    console.error('Restore backup error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء استعادة النسخة الاحتياطية' });
  }
});

app.post('/api/data/export', authMiddleware, requirePermission('manage_backups'), (req: AuthRequest, res: Response) => {
  try {
    const { includeCustomers = true, includeTransactions = true, includeReports = true } = req.body;

    const exportData: any = {
      project_name: req.project.name,
      export_date: new Date().toISOString(),
      app_version: '1.0.0',
    };

    if (includeCustomers) {
      exportData.customers = calculateCustomerBalances(req.project.id);
    }
    if (includeTransactions) {
      exportData.transactions = db.prepare('SELECT * FROM transactions WHERE project_id = ?').all(req.project.id);
    }
    if (includeReports) {
      const summary = db.prepare(`
        SELECT 
          COUNT(CASE WHEN status = 'active' THEN 1 ELSE NULL END) as total_tx,
          COALESCE(SUM(CASE WHEN status = 'active' AND type = 'payment' THEN amount ELSE 0 END), 0) as total_payments,
          COALESCE(SUM(CASE WHEN status = 'active' AND type = 'withdrawal' THEN amount ELSE 0 END), 0) as total_withdrawals
        FROM transactions WHERE project_id = ?
      `).get(req.project.id);
      exportData.reports_summary = summary;
    }

    logActivity(req.project.id, req.user.id, req.user.name, 'EXPORT_DATA', 'تم تصدير بيانات المشروع', 'DATA');
    return res.json(exportData);
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ أثناء تصدير البيانات' });
  }
});

app.post('/api/data/import', authMiddleware, requirePermission('restore_data'), (req: AuthRequest, res: Response) => {
  try {
    const { backupData } = req.body;
    if (!backupData) {
      return res.status(400).json({ error: 'يرجى تقديم بيانات الاستيراد' });
    }

    const parsed = typeof backupData === 'string' ? JSON.parse(backupData) : backupData;
    const customers = parsed.customers || (parsed.data && parsed.data.customers) || [];
    const transactions = parsed.transactions || (parsed.data && parsed.data.transactions) || [];

    db.exec('BEGIN TRANSACTION;');
    try {
      const insertCustomer = db.prepare(`
        INSERT OR REPLACE INTO customers (id, project_id, name, phone, address, type, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const c of customers) {
        insertCustomer.run(
          c.id || generateId(),
          req.project.id,
          c.name,
          normalizePhoneNumber(c.phone),
          c.address || '',
          c.type || 'individual',
          c.notes || '',
          c.created_at || new Date().toISOString(),
          c.updated_at || new Date().toISOString()
        );
      }

      const insertTx = db.prepare(`
        INSERT OR REPLACE INTO transactions (id, project_id, customer_id, type, amount, date, time, description, created_by, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const t of transactions) {
        insertTx.run(
          t.id || generateId(),
          req.project.id,
          t.customer_id,
          t.type,
          t.amount,
          t.date,
          t.time || '12:00',
          t.description || '',
          req.user.id,
          t.status || 'active',
          t.created_at || new Date().toISOString()
        );
      }

      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    logActivity(req.project.id, req.user.id, req.user.name, 'IMPORT_DATA', `تم استيراد ${customers.length} عميل و ${transactions.length} عملية`, 'DATA');
    createNotification(req.project.id, req.user.id, 'DATA_IMPORTED', 'استيراد البيانات', `تم استيراد ${customers.length} عميل و ${transactions.length} عملية بنجاح.`);

    return res.json({
      message: 'تم استيراد البيانات بنجاح',
      customersCount: customers.length,
      transactionsCount: transactions.length,
    });
  } catch (error) {
    console.error('Import error:', error);
    return res.status(500).json({ error: 'فشل استيراد الملف، تأكد من صحة التنسيق' });
  }
});

app.post('/api/data/reset', authMiddleware, requirePermission('reset_data'), (req: AuthRequest, res: Response) => {
  try {
    const { projectPassword } = req.body;
    const project = db.prepare('SELECT project_password_hash FROM projects WHERE id = ?').get(req.project.id) as any;
    if (!projectPassword || !verifySecret(projectPassword, project.project_password_hash)) {
      return res.status(401).json({ error: 'كلمة مرور المشروع غير صحيحة، لا يمكن إعادة تعيين البيانات بدونها' });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare('DELETE FROM transactions WHERE project_id = ?').run(req.project.id);
      db.prepare('DELETE FROM customers WHERE project_id = ?').run(req.project.id);
      db.prepare('DELETE FROM notifications WHERE project_id = ?').run(req.project.id);
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }

    logActivity(req.project.id, req.user.id, req.user.name, 'RESET_DATA', 'تم حذف جميع بيانات المشروع وإعادة التعيين للوضع الافتراضي', 'DATA');

    return res.json({ message: 'تم حذف جميع البيانات وإعادة تعيين النظام بنجاح' });
  } catch (error) {
    console.error('Reset error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إعادة تعيين البيانات' });
  }
});

// ================= ACCOUNTS & APPROVAL WORKFLOW =================
// إدارة الحسابات: كل التحقق (الدور، السقف، من يوافق، من ينفّذ) يتم داخل server/accounts.ts

app.get('/api/accounts', authMiddleware, requirePermission('manage_users'), listAccounts);

app.post('/api/accounts', authMiddleware, requirePermission('create_employees'), createAccount);

app.get('/api/accounts/requests', authMiddleware, requirePermission('manage_users'), listAccountRequests);

app.post(
  '/api/accounts/requests/:requestId/decide',
  authMiddleware,
  requirePermission('approve_requests'),
  decideAccountRequest
);

app.post('/api/accounts/:membershipId/disable', authMiddleware, requireOwner(), disableAccountDirect);

app.post('/api/accounts/:membershipId/enable', authMiddleware, requireOwner(), enableAccountDirect);

app.post('/api/accounts/:membershipId/delete', authMiddleware, requireOwner(), softDeleteAccount);

app.post(
  '/api/accounts/:membershipId/request',
  authMiddleware,
  requireAnyPermission(['request_disable_account', 'request_enable_account', 'request_delete_account']),
  createAccountRequest
);

app.get('/api/accounts/:membershipId/activity', authMiddleware, requirePermission('manage_users'), getAccountActivity);

// ================= EMPLOYEES & PERMISSIONS =================

app.get('/api/employees', authMiddleware, requirePermission('manage_users'), (req: AuthRequest, res: Response) => {
  try {
    const employees = db.prepare(`
      SELECT pm.id as membership_id, pm.role, pm.status, pm.permissions, pm.created_at,
             u.id as user_id, u.name, u.phone, u.email
      FROM project_memberships pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
      ORDER BY pm.created_at ASC
    `).all(req.project.id) as any[];

    return res.json(
      employees.map((e) => ({
        ...e,
        permissions: JSON.parse(e.permissions || '[]'),
      }))
    );
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة الموظفين' });
  }
});

app.post('/api/employees', authMiddleware, requirePermission('create_employees'), (req: AuthRequest, res: Response) => {
  // توافق خلفي: هذا المسار القديم يمر الآن عبر دورة الحياة الجديدة نفسها،
  // وبالتالي يحكمه نفس القواعد:
  //   - صاحب المحل: إنشاء موظف نشط مباشرة.
  //   - المدير: الحساب يبقى "في انتظار الاعتماد" حتى يوافق صاحب المحل.
  //   - أي صلاحية تتجاوز سقف دور الموظف تُرفض.
  return createAccount(req as any, res);
});

app.delete('/api/employees/:membershipId', authMiddleware, requireOwner(), (req: AuthRequest, res: Response) => {
  try {
    const membership = db.prepare('SELECT * FROM project_memberships WHERE id = ? AND project_id = ?').get(req.params.membershipId, req.project.id) as any;
    if (!membership) {
      return res.status(404).json({ error: 'العضوية غير موجودة' });
    }
    if (membership.role === 'owner') {
      return res.status(400).json({ error: 'لا يمكن حذف صاحب المشروع' });
    }

    db.prepare('DELETE FROM project_memberships WHERE id = ?').run(req.params.membershipId);
    logActivity(req.project.id, req.user.id, req.user.name, 'REMOVE_EMPLOYEE', 'تم إزالة موظف من المشروع', 'EMPLOYEE');

    return res.json({ message: 'تم إزالة الموظف من المشروع بنجاح' });
  } catch (error) {
    return res.status(500).json({ error: 'حدث خطأ أثناء إزالة الموظف' });
  }
});

// Vite Middleware for Fullstack React App
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // تنظيف دوري لسجلّات حدّ المحاولات المنتهية (لا يؤثر على أي قفل ساري)
  pruneLoginThrottle();
  const throttleCleanup = setInterval(pruneLoginThrottle, 10 * 60_000);
  throttleCleanup.unref?.();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AH2 Backend & UI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
