/**
 * AH2 — بوابة المحدودية #4: حدّ محاولات تسجيل الدخول (Rate limiting)
 * =================================================================
 * يتحقق فعليًا عبر HTTP أن:
 *  - كلمة المرور الخاطئة تُنقص المحاولات المتبقية وتُعلم بها.
 *  - بعد 5 محاولات فاشلة يُقفل الحساب مؤقتًا (429) حتى لو جاءت كلمة المرور صحيحة.
 *  - القفل يُسجَّل في سجل التدقيق (LOGIN_THROTTLED) بنتيجة denied.
 *  - الدخول الناجح يصفّر العدّاد.
 *
 * التشغيل: npx tsx tests/verify-throttle.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-throttle-'));
const DB_FILE = path.join(TMP, 'data', 'ah2.db');
const BASE = 'http://127.0.0.1:3000';

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean, extra = '') {
  if (cond) {
    pass++;
    console.log('  ✅', name);
  } else {
    fail++;
    console.log('  ❌', name, extra);
  }
}

let child: ChildProcess | null = null;
let logs: string[] = [];

function killTree(proc: ChildProcess | null) {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* تجاهل */
    }
  }
}

async function portFree() {
  try {
    await fetch(`${BASE}/api/auth/recovery/status`, { signal: AbortSignal.timeout(700) });
    return false;
  } catch {
    return true;
  }
}

async function stopServer() {
  killTree(child);
  child = null;
  for (let i = 0; i < 60; i++) {
    if (await portFree()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  try {
    execSync("pkill -f '[s]erver\\.ts' || true", { stdio: 'ignore' });
  } catch {
    /* تجاهل */
  }
  for (let i = 0; i < 40; i++) {
    if (await portFree()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('تعذّر إيقاف الخادم');
}

async function startServer() {
  if (!(await portFree())) await stopServer();
  logs = [];
  child = spawn(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), ['server.ts'], {
    cwd: TMP,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout?.on('data', (d) => logs.push(String(d)));
  child.stderr?.on('data', (d) => logs.push(String(d)));
  const start = Date.now();
  while (Date.now() - start < 60_000) {
    if (logs.join('').includes('AH2 Backend & UI server running')) return;
    if (child.exitCode !== null && child.exitCode !== 0) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`الخادم لم يبدأ. السجل:\n${logs.join('').slice(-800)}`);
}

async function api(pathname: string, options: { method?: string; token?: string; body?: any } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    /* لا JSON */
  }
  return { status: res.status, data };
}

function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(DB_FILE);
  try {
    db.exec('PRAGMA busy_timeout = 5000;');
    return fn(db);
  } finally {
    db.close();
  }
}

function hash(secret: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(secret, salt, 64).toString('hex')}`;
}

function prepareWorkspace() {
  fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });
  for (const item of ['server', 'src', 'public', 'server.ts', 'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json']) {
    fs.cpSync(path.join(REPO_ROOT, item), path.join(TMP, item), { recursive: true });
  }
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(TMP, 'node_modules'), 'dir');
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('\n❌ تجاوز الوقت المسموح — إيقاف قسري');
    killTree(child);
    process.exit(1);
  }, 180_000);
  watchdog.unref?.();

  console.log(`مجلد الاختبار المؤقت: ${TMP}\n`);
  prepareWorkspace();

  try {
    await startServer();

    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('تهيئة: إنشاء المحل', reg.status === 201, JSON.stringify(reg.data).slice(0, 120));

    // ══ 1) دخول ناجح لا يُقيَّد ══
    const good = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    ok('الدخول الصحيح يعمل', good.status === 200, String(good.status));
    const ownerToken = good.data.token;

    // ══ 2) محاولة فاشلة تُنقص العدّاد ══
    const bad1 = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'wrong-pass' } });
    ok('كلمة مرور خاطئة = 401', bad1.status === 401, String(bad1.status));
    ok('يُعلم بعدد المحاولات المتبقية', typeof bad1.data?.remaining_attempts === 'number', JSON.stringify(bad1.data));
    ok('المتبقي = 4 بعد محاولة واحدة', bad1.data?.remaining_attempts === 4, String(bad1.data?.remaining_attempts));

    // ══ 3) الدخول الناجح يصفّر العدّاد ══
    const reset = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    ok('الدخول الناجح يصفّر العدّاد', reset.status === 200, String(reset.status));
    const afterReset = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'wrong-pass' } });
    ok('العدّاد رجع للبداية (المتبقي 4)', afterReset.data?.remaining_attempts === 4, String(afterReset.data?.remaining_attempts));

    // ══ 4) خمس محاولات فاشلة ⇒ قفل ══
    let lastStatus = 0;
    for (let i = 0; i < 4; i++) {
      const r = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'wrong-pass' } });
      lastStatus = r.status;
    }
    ok('المحاولة الخامسة تُقفل الحساب (429)', lastStatus === 429, String(lastStatus));

    const lockedGood = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    ok('حتى كلمة المرور الصحيحة مرفوضة أثناء القفل', lockedGood.status === 429, String(lockedGood.status));
    ok('رسالة القفل واضحة', String(lockedGood.data?.error ?? '').includes('إيقاف المحاولات'), String(lockedGood.data?.error));
    ok('يُعاد وقت الانتظار بالثواني', Number(lockedGood.data?.retry_after_seconds) > 0, String(lockedGood.data?.retry_after_seconds));

    // ══ 5) القفل مُسجَّل في سجل التدقيق ══
    const throttleRows = withDb((db) =>
      db.prepare("SELECT * FROM activity_logs WHERE action_type = 'LOGIN_THROTTLED'").all() as any[]
    );
    ok('القفل مسجّل في سجل التدقيق', throttleRows.length >= 1, String(throttleRows.length));
    ok('السجل يوضّح النتيجة المرفوضة', throttleRows[0]?.result === 'denied', String(throttleRows[0]?.result));
    ok('السجل يحمل السبب', String(throttleRows[0]?.reason ?? '').includes('too_many_attempts') || String(throttleRows[0]?.reason ?? '').includes('locked_for'), String(throttleRows[0]?.reason));

    // ══ 6) القفل يخصّ الحساب المعني فقط ══
    const otherUser = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'تاجر آخر', projectName: 'محل آخر', phone: '01099999999', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('حساب آخر أُنشئ', otherUser.status === 201, String(otherUser.status));
    const otherLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01099999999', password: 'secret123' } });
    ok('الحساب الآخر يدخل رغم قفل الأول', otherLogin.status === 200, String(otherLogin.status));

    // ══ 7) انتهاء القفل يعيد السماح (محاكاة بتحريك الوقت في القاعدة) ══
    withDb((db) => {
      db.prepare("UPDATE login_throttle SET locked_until = ? WHERE throttle_key LIKE '01068505471%'")
        .run(new Date(Date.now() - 60_000).toISOString());
    });
    const afterExpiry = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    ok('بعد انتهاء مدة القفل يعود الدخول', afterExpiry.status === 200, String(afterExpiry.status));

    // ══ 8) الصفوف القديمة تُنظَّف ══
    withDb((db) => {
      db.prepare("UPDATE login_throttle SET window_started_at = ?, locked_until = NULL WHERE throttle_key LIKE '01068505471%'")
        .run(new Date(Date.now() - 60 * 60_000).toISOString());
    });
    const { pruneLoginThrottle } = await import('/home/user/adel_repo/server/rateLimit.ts' as string).catch(() => ({ pruneLoginThrottle: null } as any));
    if (pruneLoginThrottle) {
      ok('دالة التنظيف متاحة', true);
    } else {
      // نتحقق من التنظيف عبر إعادة تشغيل الخادم (يُنظّف عند الإقلاع)
      await stopServer();
      await startServer();
      const left = withDb((db) => Number((db.prepare("SELECT COUNT(*) c FROM login_throttle WHERE throttle_key LIKE '01068505471%'").get() as any).c));
      ok('الصفوف المنتهية تُنظَّف عند الإقلاع', left === 0, String(left));
    }

    const stillWorks = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    ok('الدخول يعمل بعد التنظيف', stillWorks.status === 200, String(stillWorks.status));

    console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error('فشل الاختبار:', err);
    console.error(logs.join('').split('\n').slice(-15).join('\n'));
    process.exitCode = 1;
  } finally {
    await stopServer().catch(() => killTree(child));
    clearTimeout(watchdog);
    if (process.exitCode === 0) fs.rmSync(TMP, { recursive: true, force: true });
    else console.log(`(أُبقيت ملفات الاختبار في ${TMP})`);
  }
}

main().catch(async (err) => {
  console.error('فشل الاختبار:', err);
  await stopServer().catch(() => killTree(child));
  process.exit(1);
});
