/**
 * AH2 — حدّ محاولات تسجيل الدخول (Login Rate Limiting)
 * ====================================================
 * يحمي مسار الدخول من التخمين الآلي لكلمات المرور.
 *
 * السياسة (ثابتة ومركزية):
 *  - تُحسب المحاولات الفاشلة لكل (رقم/بريد + عنوان IP) خلال نافذة زمنية.
 *  - عند بلوغ الحد الأقصى يُقفل المفتاح لمدة محددة، ويُرفض الدخول بـ 429.
 *  - الدخول الناجح يصفّر العدّاد فورًا.
 *  - بعد انتهاء مدة القفل يُصفَّر العدّاد تلقائيًا.
 *
 * التخزين في قاعدة البيانات (لا في الذاكرة) حتى يبقى الحد فعالًا بعد إعادة التشغيل،
 * وحتى لا يكون لكل نسخة من الخادم عدّاد منفصل.
 */

import { db, generateId } from './db.js';

/** الحد الأقصى للمحاولات الفاشلة المسموحة قبل القفل */
export const MAX_LOGIN_FAILURES = 5;
/** طول نافذة القياس بالدقائق */
export const LOGIN_WINDOW_MINUTES = 15;
/** مدة القفل بالدقائق بعد تجاوز الحد */
export const LOGIN_LOCK_MINUTES = 15;

export interface ThrottleState {
  blocked: boolean;
  /** عدد الثواني المتبقية على انتهاء القفل (0 إذا لم يكن مقفلًا) */
  retryAfterSeconds: number;
  /** عدد المحاولات الفاشلة المتبقية قبل القفل */
  remaining: number;
}

/** يبني مفتاح الحد من المعرّف وعنوان الـIP (المعرّف يُطبَّع دائمًا) */
export function buildThrottleKey(identifier: string, ip: string | undefined | null): string {
  const id = String(identifier ?? '').trim().toLowerCase();
  const address = String(ip ?? 'unknown');
  return `${id}|${address}`;
}

/**
 * يفحص حالة الحدّ للمفتاح المطلوب دون تعديل أي شيء.
 */
export function checkLoginThrottle(key: string): ThrottleState {
  try {
    const row = db
      .prepare('SELECT failures, window_started_at, locked_until FROM login_throttle WHERE throttle_key = ?')
      .get(key) as any;

    if (!row) return { blocked: false, retryAfterSeconds: 0, remaining: MAX_LOGIN_FAILURES };

    const now = Date.now();
    const lockedUntil = row.locked_until ? Date.parse(row.locked_until) : 0;

    // قفل ساري
    if (lockedUntil && lockedUntil > now) {
      return {
        blocked: true,
        retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000),
        remaining: 0,
      };
    }

    // انتهت النافذة أو انتهى القفل ⇒ العدّاد صفر
    const windowStarted = row.window_started_at ? Date.parse(row.window_started_at) : 0;
    const windowExpired = !windowStarted || now - windowStarted > LOGIN_WINDOW_MINUTES * 60_000;
    if (windowExpired || lockedUntil) {
      return { blocked: false, retryAfterSeconds: 0, remaining: MAX_LOGIN_FAILURES };
    }

    const failures = Number(row.failures ?? 0);
    return {
      blocked: false,
      retryAfterSeconds: 0,
      remaining: Math.max(0, MAX_LOGIN_FAILURES - failures),
    };
  } catch (err) {
    // لا يجوز أن يُعطّل فشلُ التخزين مسارَ الدخول
    console.error('Login throttle check error:', err);
    return { blocked: false, retryAfterSeconds: 0, remaining: MAX_LOGIN_FAILURES };
  }
}

/**
 * يسجّل محاولة فاشلة ويقفل المفتاح عند تجاوز الحد.
 * @returns حالة الحد بعد التسجيل
 */
export function recordLoginFailure(key: string): ThrottleState {
  try {
    const now = new Date();
    const row = db
      .prepare('SELECT failures, window_started_at FROM login_throttle WHERE throttle_key = ?')
      .get(key) as any;

    let failures = 0;
    let windowStart = now.toISOString();

    if (row) {
      const windowStarted = row.window_started_at ? Date.parse(row.window_started_at) : 0;
      const windowExpired = !windowStarted || now.getTime() - windowStarted > LOGIN_WINDOW_MINUTES * 60_000;
      failures = windowExpired ? 0 : Number(row.failures ?? 0);
      windowStart = windowExpired ? now.toISOString() : String(row.window_started_at);
    }

    failures += 1;
    const lockedUntil =
      failures >= MAX_LOGIN_FAILURES
        ? new Date(now.getTime() + LOGIN_LOCK_MINUTES * 60_000).toISOString()
        : null;

    if (row) {
      db.prepare(
        'UPDATE login_throttle SET failures = ?, window_started_at = ?, locked_until = ? WHERE throttle_key = ?'
      ).run(failures, windowStart, lockedUntil, key);
    } else {
      db.prepare(
        'INSERT INTO login_throttle (id, throttle_key, failures, window_started_at, locked_until, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(generateId(), key, failures, windowStart, lockedUntil, now.toISOString());
    }

    return {
      blocked: !!lockedUntil,
      retryAfterSeconds: lockedUntil ? LOGIN_LOCK_MINUTES * 60 : 0,
      remaining: Math.max(0, MAX_LOGIN_FAILURES - failures),
    };
  } catch (err) {
    console.error('Login throttle record error:', err);
    return { blocked: false, retryAfterSeconds: 0, remaining: MAX_LOGIN_FAILURES };
  }
}

/** يصفّر العدّاد (يُستدعى بعد دخول ناجح أو بعد تغيير كلمة المرور) */
export function clearLoginFailures(key: string): void {
  try {
    db.prepare('DELETE FROM login_throttle WHERE throttle_key = ?').run(key);
  } catch (err) {
    console.error('Login throttle clear error:', err);
  }
}

/** تنظيف الصفوف القديمة (نافذة منتهية وقفل منتهٍ) — يُستدعى دوريًا */
export function pruneLoginThrottle(): void {
  try {
    const cutoff = new Date(Date.now() - LOGIN_WINDOW_MINUTES * 60_000).toISOString();
    db.prepare(
      `DELETE FROM login_throttle
       WHERE (locked_until IS NULL OR locked_until < ?) AND window_started_at < ?`
    ).run(new Date().toISOString(), cutoff);
  } catch (err) {
    console.error('Login throttle prune error:', err);
  }
}
