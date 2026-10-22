/**
 * AH2 — سجل التدقيق الموحّد (Audit Log)
 * ======================================
 * نقطة واحدة لتسجيل كل حدث مهم في المشروع: من نفّذ، ماذا نفّذ، على من،
 * النتيجة، والسبب عند الحاجة — مع الوقت.
 *
 * ملاحظات تصميمية:
 *  - لا يوجد أي مسار API لتعديل أو حذف سجل التدقيق (الحماية على مستوى الـAPI).
 *  - الدالة لا ترمي استثناءً أبدًا: فشل التسجيل لا يجوز أن يُفشل العملية الأصلية.
 *  - الأحداث المرفوضة (denied) تُسجَّل أيضًا، لأن محاولات التجاوز نفسها معلومة أمنية مهمة.
 */

import { db, generateId } from './db.js';

export type AuditResult = 'success' | 'denied' | 'failed';

export interface AuditEvent {
  /** المشروع (المحل) الذي وقع فيه الحدث — يمنع تسرّب السجل بين المحلات */
  projectId: string;
  /** معرّف من نفّذ الإجراء (null للأحداث العامة) */
  actorId?: string | null;
  /** اسم من نفّذ الإجراء كما يُعرض في الواجهة */
  actorName?: string | null;
  /** دور من نفّذ الإجراء: owner | manager | employee | system */
  actorRole?: string | null;
  /** نوع الإجراء: LOGIN, CREATE_ACCOUNT, APPROVE_REQUEST, DISABLE_ACCOUNT, ... */
  actionType: string;
  /** وصف عربي مقروء للحدث */
  description: string;
  /** نوع الكيان المتأثر: USER | CUSTOMER | TRANSACTION | PROJECT | DATA ... */
  entityType: string;
  /** معرّف الكيان المتأثر إن وُجد */
  entityId?: string | null;
  /** معرّف المستخدم المتأثر (لأحداث إدارة الحسابات) */
  targetUserId?: string | null;
  /** نتيجة الإجراء */
  result?: AuditResult;
  /** سبب التغيير/القرار عند الحاجة */
  reason?: string | null;
}

/**
 * يسجّل حدثًا في سجل التدقيق. آمن تمامًا: لا يرمي استثناءات.
 */
export function logAudit(event: AuditEvent): void {
  try {
    db.prepare(
      `INSERT INTO activity_logs
        (id, project_id, user_id, user_name, action_type, description, entity_type, entity_id,
         created_at, actor_role, target_user_id, result, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      generateId(),
      event.projectId,
      event.actorId ?? 'system',
      event.actorName ?? 'النظام',
      event.actionType,
      event.description,
      event.entityType,
      event.entityId ?? null,
      new Date().toISOString(),
      event.actorRole ?? null,
      event.targetUserId ?? null,
      event.result ?? 'success',
      event.reason ?? null
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

/** يسجّل محاولة مرفوضة (صلاحية غير كافية / تجاوز / وصول لمحل آخر). */
export function logDenied(params: Omit<AuditEvent, 'result'> & { reason?: string | null }): void {
  logAudit({ ...params, result: 'denied' });
}
