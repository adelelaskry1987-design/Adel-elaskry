/**
 * AH2 — بوابة المحدودية #2: إعادة تعيين كلمة المرور إجباريًا من صاحب المحل
 * ======================================================================
 * يتحقق فعليًا عبر HTTP أن:
 *  - صاحب المحل يعيد تعيين كلمة مرور أي مستخدم (غير نفسه) ويحصل على كلمة مؤقتة تُعرض مرة واحدة.
 *  - كلمة المرور لا تُخزَّن كنص ولا تُعاد مرة أخرى ولا تظهر في سجل التدقيق.
 *  - كل جلسات المستخدم تُبطَل فورًا.
 *  - المستخدم يدخل بالكلمة المؤقتة، لكن الخادم يرفض كل إجراء (428) حتى يغيّرها.
 *  - بعد التغيير يعود كل شيء للعمل، والحدث مسجَّل.
 *  - المدير لا يستطيع إعادة التعيين (403)، ولا يمكن استهداف صاحب المحل.
 *
 * التشغيل: npx tsx tests/verify-reset-password.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-resetpw-'));
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
  }, 240_000);
  watchdog.unref?.();

  console.log(`مجلد الاختبار المؤقت: ${TMP}\n`);
  prepareWorkspace();

  try {
    await startServer();

    await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    const ownerLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    const owner = ownerLogin.data.token;
    ok('تهيئة: صاحب المحل', !!owner);

    // مدير + موظف
    await api('/api/accounts', { method: 'POST', token: owner, body: { name: 'سارة المديرة', phone: '01000000002', password: 'secret123', role: 'manager' } });
    const mgr = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000002', password: 'secret123' } })).data.token;
    const empCreate = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: { name: 'محمد الموظف', phone: '01000000003', password: 'secret123', role: 'employee', permissions: ['view_customers', 'add_customer'] },
    });
    const empMembership = empCreate.data.membership_id;
    const reqs = await api('/api/accounts/requests', { token: owner });
    const createReq = (reqs.data as any[]).find((r) => r.type === 'create_account' && r.status === 'pending');
    await api(`/api/accounts/requests/${createReq.id}/decide`, { method: 'POST', token: owner, body: { decision: 'approve' } });
    const empLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    const empTokenBefore = empLogin.data.token;
    const empUserId = empLogin.data.user.id;
    ok('تهيئة: موظف نشط بجلسة قائمة', !!empTokenBefore);
    ok('الجلسة القائمة تعمل', (await api('/api/customers', { token: empTokenBefore })).status === 200);

    // ══ 1) صاحب المحل يعيد التعيين ══
    console.log('\n— إعادة التعيين —');
    const reset = await api(`/api/accounts/${empMembership}/reset-password`, {
      method: 'POST', token: owner, body: { reason: 'نسي كلمة المرور' },
    });
    ok('صاحب المحل يعيد التعيين (200)', reset.status === 200, JSON.stringify(reset.data).slice(0, 160));
    const tempPassword = reset.data?.temporary_password;
    ok('تُعاد كلمة مرور مؤقتة مرة واحدة', typeof tempPassword === 'string' && tempPassword.length >= 8, String(tempPassword).slice(0, 4) + '***');
    ok('يُعلم بعدد الجلسات المُبطَلة', Number(reset.data?.revoked_sessions) >= 1, String(reset.data?.revoked_sessions));
    ok('يُعلَّم الحساب بإجبار التغيير', reset.data?.must_change_password === true);

    // ══ 2) كل الجلسات القديمة مرفوضة ══
    const oldSession = await api('/api/customers', { token: empTokenBefore });
    ok('الجلسة القديمة مرفوضة (401/403)', oldSession.status === 401 || oldSession.status === 403, String(oldSession.status));

    // ══ 3) كلمة المرور لا تُخزَّن كنص ولا تظهر في السجلات ══
    const stored = withDb((db) => db.prepare('SELECT password_hash, must_change_password FROM users WHERE id = ?').get(empUserId) as any);
    ok('كلمة المرور مخزّنة كـ hash (scrypt)', String(stored?.password_hash ?? '').includes(':') && !String(stored?.password_hash ?? '').includes(tempPassword), 'hash ok');
    ok('علم إجبار التغيير مخزّن = 1', Number(stored?.must_change_password) === 1, String(stored?.must_change_password));
    const logsAfterReset = withDb((db) => db.prepare("SELECT * FROM activity_logs WHERE action_type = 'RESET_PASSWORD'").all() as any[]);
    ok('إعادة التعيين مسجّلة في سجل التدقيق', logsAfterReset.length === 1, String(logsAfterReset.length));
    ok('السجل لا يحتوي كلمة المرور إطلاقًا', !JSON.stringify(logsAfterReset[0] ?? {}).includes(tempPassword), 'no password in logs');
    ok('السجل يذكر من نفّذ والسبب', logsAfterReset[0]?.user_name === 'عادل' && String(logsAfterReset[0]?.reason ?? '').includes('نسي'), JSON.stringify(logsAfterReset[0] ?? {}).slice(0, 140));

    // ══ 4) دخول بالكلمة المؤقتة + منع الاستخدام حتى التغيير ══
    console.log('\n— الدخول الإجباري —');
    const oldPwLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('كلمة المرور القديمة لم تعد تعمل (401)', oldPwLogin.status === 401, String(oldPwLogin.status));

    const tempLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: tempPassword } });
    ok('الدخول بالكلمة المؤقتة يعمل', tempLogin.status === 200 && !!tempLogin.data?.token, String(tempLogin.status));
    ok('الرد يوضّح وجوب تغيير كلمة المرور', tempLogin.data?.must_change_password === true, String(tempLogin.data?.must_change_password));
    const tempToken = tempLogin.data.token;

    const blockedAction = await api('/api/customers', { token: tempToken });
    ok('كل إجراء ممنوع قبل التغيير (428)', blockedAction.status === 428, String(blockedAction.status));
    ok('رمز الرفض واضح', blockedAction.data?.code === 'PASSWORD_CHANGE_REQUIRED', String(blockedAction.data?.code));
    const blockedWrite = await api('/api/customers', {
      method: 'POST', token: tempToken, body: { name: 'عميل ممنوع', phone: '01111111199', type: 'individual' },
    });
    ok('حتى الكتابة ممنوعة (428)', blockedWrite.status === 428, String(blockedWrite.status));
    const meWorks = await api('/api/auth/me', { token: tempToken });
    ok('معرفة الحساب مسموحة (200)', meWorks.status === 200, String(meWorks.status));

    // ══ 5) تغيير كلمة المرور ثم العودة للعمل ══
    console.log('\n— التغيير الإجباري —');
    const change = await api('/api/auth/change-password', {
      method: 'POST', token: tempToken,
      body: { oldPassword: tempPassword, newPassword: 'newsecret123', confirmPassword: 'newsecret123' },
    });
    ok('تغيير كلمة المرور يعمل', change.status === 200, JSON.stringify(change.data).slice(0, 140));

    const afterChange = await api('/api/customers', { token: tempToken });
    ok('بعد التغيير يعود الاستخدام طبيعيًا (200)', afterChange.status === 200, String(afterChange.status));

    const relog = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'newsecret123' } });
    ok('الدخول بكلمة المرور الجديدة يعمل', relog.status === 200, String(relog.status));
    ok('علم الإجبار صار false', relog.data?.must_change_password === false, String(relog.data?.must_change_password));

    const changeLog = withDb((db) => db.prepare("SELECT * FROM activity_logs WHERE action_type = 'PASSWORD_CHANGE' ORDER BY created_at DESC LIMIT 1").get() as any);
    ok('تغيير كلمة المرور مسجّل', !!changeLog?.id && String(changeLog?.description ?? '').includes('المفروضة'), String(changeLog?.description).slice(0, 90));

    // ══ 6) صلاحيات إعادة التعيين ══
    console.log('\n— صلاحيات إعادة التعيين —');
    const mgrReset = await api(`/api/accounts/${empMembership}/reset-password`, { method: 'POST', token: mgr, body: {} });
    ok('المدير ممنوع من إعادة التعيين (403)', mgrReset.status === 403, String(mgrReset.status));
    const ownerRow = withDb((db) => db.prepare("SELECT id FROM project_memberships WHERE role = 'owner' LIMIT 1").get() as any);
    const selfReset = await api(`/api/accounts/${ownerRow?.id}/reset-password`, { method: 'POST', token: owner, body: {} });
    ok('لا يمكن إعادة تعيين كلمة مرور صاحب المحل (403)', selfReset.status === 403, String(selfReset.status));
    const other = await api('/api/auth/register', { method: 'POST', body: { name: 'تاجر آخر', projectName: 'محل آخر', phone: '01099999999', password: 'secret123', confirmPassword: 'secret123' } });
    const otherToken = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01099999999', password: 'secret123' } })).data.token;
    const crossReset = await api(`/api/accounts/${empMembership}/reset-password`, { method: 'POST', token: otherToken, body: {} });
    ok('محل آخر لا يعيد تعيين كلمة مرور موظفنا (404/403)', crossReset.status === 404 || crossReset.status === 403, String(crossReset.status));

    // ══ 7) كلمة المرور لا تُعاد مرة ثانية ══
    const resetAgain = await api(`/api/accounts/${empMembership}/reset-password`, { method: 'POST', token: owner, body: {} });
    const firstPass = reset.data?.temporary_password;
    ok('إعادة تعيين جديدة تعطي كلمة مختلفة', resetAgain.status === 200 && resetAgain.data?.temporary_password !== firstPass, 'new password issued');
    const meList = await api('/api/accounts', { token: owner });
    const empRow = (meList.data as any[]).find((r) => r.membership_id === empMembership);
    ok('قائمة المستخدمين لا تُظهر أي كلمة مرور', !JSON.stringify(empRow ?? {}).toLowerCase().includes('password') || !JSON.stringify(empRow ?? {}).includes(resetAgain.data?.temporary_password), 'no leakage');

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
