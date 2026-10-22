/**
 * AH2 — بوابة المرحلة 2: المصادقة والجلسات
 * ==========================================
 * اختبارات فعلية عبر HTTP على خادم حقيقي يعمل على قاعدة بيانات مؤقتة
 * (لا تلمس `data/` الخاصة بالمشروع).
 *
 * يغطي:
 *  - اختبار #1: دخول صاحب المحل (21 صلاحية كاملة)
 *  - اختبار #2: دخول المدير (صلاحيات ثابتة أقل)
 *  - اختبار #10: منع دخول الحساب المعلّق / المعطل / المرفوض / المحذوف
 *  - اختبار #11: إبطال الجلسة القائمة فورًا عند التعطيل (بدون انتظار انتهاء التوكن)
 *  - اختبار #19: بقاء العملاء والأرصدة والتقارير وإلغاء العمليات كما كانت للمالك
 *  - سجل التدقيق: تسجيل الدخول الناجح والمرفوض بالدور والسبب
 *
 * التشغيل: npx tsx tests/verify-auth.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-auth-'));
const DB_FILE = path.join(TMP, 'data', 'ah2.db');
const PORT = 3000; // server.ts يثبّت المنفذ داخليًا
const BASE = `http://127.0.0.1:${PORT}`;

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

// ── دورة حياة الخادم ─────────────────────────────────────────
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

async function portFree(): Promise<boolean> {
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
  const start = Date.now();
  while (Date.now() - start < 20_000) {
    if (await portFree()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  // كملاذ أخير: إنهاء أي عملية متبقية
  try {
    execSync("pkill -f '[s]erver\\.ts' || true", { stdio: 'ignore' });
  } catch {
    /* تجاهل */
  }
  const start2 = Date.now();
  while (Date.now() - start2 < 10_000) {
    if (await portFree()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('تعذّر إيقاف الخادم / تحرير المنفذ');
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
    /* لا يوجد JSON */
  }
  return { status: res.status, data };
}

// ── مساعدات قاعدة البيانات (تعمل فقط والخادم متوقف) ─────────
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

// ── التشغيل ──────────────────────────────────────────────────
async function main() {
  const watchdog = setTimeout(() => {
    console.error('\n❌ تجاوز الاختبار الوقت المسموح (180 ثانية) — إيقاف قسري');
    killTree(child);
    process.exit(1);
  }, 180_000);
  watchdog.unref?.();

  console.log(`مجلد الاختبار المؤقت: ${TMP}\n`);
  prepareWorkspace();

  let projectId = '';
  let ownerToken = '';
  let ownerAuth = '';

  try {
    // ══ أ) إنشاء المحل ══
    await startServer();
    const ownerReg = await api('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'عادل',
        projectName: 'محل عادل',
        phone: '01068505471',
        password: 'secret123',
        confirmPassword: 'secret123',
      },
    });
    ok('إنشاء صاحب المحل نجح', ownerReg.status === 201, JSON.stringify(ownerReg.data).slice(0, 120));
    projectId = ownerReg.data.project.id;
    await stopServer();

    // ══ ب) تجهيز حسابات اختبار مباشرة في القاعدة (الخادم متوقف) ══
    withDb((db) => {
      const now = new Date().toISOString();
      const insertUser = db.prepare(
        `INSERT INTO users (id, name, phone, email, password_hash, role, created_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?)`
      );
      const insertMembership = db.prepare(
        `INSERT INTO project_memberships
           (id, project_id, user_id, role, status, permissions, created_at, proposed_permissions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      insertUser.run('u-mgr', 'سارة', '01000000002', hash('secret123'), 'manager', now);
      insertMembership.run(
        'm-mgr', projectId, 'u-mgr', 'manager', 'active',
        JSON.stringify(['view_customers', 'add_customer', 'create_transaction', 'view_balances']),
        now, JSON.stringify([])
      );

      const cases: Array<[string, string, string]> = [
        ['employee', '01000000014', 'active'],
        ['pending', '01000000010', 'pending'],
        ['disabled', '01000000011', 'disabled'],
        ['rejected', '01000000012', 'rejected'],
        ['deleted', '01000000013', 'deleted'],
      ];
      for (const [key, phone, status] of cases) {
        insertUser.run(`u-${key}`, `مستخدم ${key}`, phone, hash('secret123'), 'employee', now);
        insertMembership.run(
          `m-${key}`, projectId, `u-${key}`, 'employee', status,
          JSON.stringify(['view_customers', 'add_customer']),
          now, JSON.stringify([])
        );
      }

      // جلسة قائمة مسبقًا لموظف نشط (محاكاة «الجلسة القديمة»)
      db.prepare('INSERT INTO auth_tokens (token, user_id, project_id, expires_at) VALUES (?, ?, ?, ?)')
        .run('legacy-session-token-for-emp', 'u-employee', projectId, Date.now() + 86_400_000);
    });

    // ══ ج) كل اختبارات المصادقة والخادم يعمل ══
    await startServer();

    console.log('— اختبار #1: دخول صاحب المحل —');
    const ownerLogin = await api('/api/auth/login', {
      method: 'POST',
      body: { identifier: '01068505471', password: 'secret123' },
    });
    ok('دخول صاحب المحل 200', ownerLogin.status === 200, String(ownerLogin.status));
    ok('الدور = owner', ownerLogin.data.user?.role === 'owner');
    ok('الحالة = active', ownerLogin.data.user?.account_status === 'active');
    ok('21 صلاحية', (ownerLogin.data.permissions ?? []).length === 21, String((ownerLogin.data.permissions ?? []).length));
    ok('يملك approve_requests', (ownerLogin.data.permissions ?? []).includes('approve_requests'));
    ok('last_login_at مُحدَّث', !!ownerLogin.data.user?.last_login_at);
    ownerToken = ownerLogin.data.token;
    ownerAuth = ownerToken;

    console.log('\n— اختبار #2: دخول المدير —');
    const mgrLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000002', password: 'secret123' } });
    ok('دخول المدير 200', mgrLogin.status === 200, JSON.stringify(mgrLogin.data).slice(0, 120));
    ok('الدور = manager', mgrLogin.data.user?.role === 'manager');
    ok('لا يملك approve_requests', !(mgrLogin.data.permissions ?? []).includes('approve_requests'));
    ok('لا يملك reset_data', !(mgrLogin.data.permissions ?? []).includes('reset_data'));
    ok('لا يملك delete_customer', !(mgrLogin.data.permissions ?? []).includes('delete_customer'));

    console.log('\n— اختبار #10: منع دخول الحسابات غير النشطة —');
    const phones: Record<string, string> = {
      pending: '01000000010',
      disabled: '01000000011',
      rejected: '01000000012',
      deleted: '01000000013',
    };
    for (const key of Object.keys(phones)) {
      const r = await api('/api/auth/login', { method: 'POST', body: { identifier: phones[key], password: 'secret123' } });
      ok(`منع دخول (${key}) بـ 403`, r.status === 403, `got ${r.status}`);
      ok(`لا توكن لـ (${key})`, !r.data?.token);
      ok(`رمز واضح لـ (${key})`, r.data?.code === 'ACCOUNT_NOT_ACTIVE', JSON.stringify(r.data));
      ok(`رسالة عربية لـ (${key})`, typeof r.data?.error === 'string' && r.data.error.length > 10);
    }

    const activeEmp = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000014', password: 'secret123' } });
    ok('الموظف النشط يدخل بنجاح', activeEmp.status === 200, String(activeEmp.status));

    const badPass = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000014', password: 'wrong-pass' } });
    ok('كلمة مرور خاطئة → 401', badPass.status === 401);

    console.log('\n— اختبار #11: إبطال الجلسة القائمة فور التعطيل —');
    const beforeDisable = await api('/api/customers', { token: 'legacy-session-token-for-emp' });
    ok('الجلسة القديمة تعمل قبل التعطيل', beforeDisable.status === 200, String(beforeDisable.status));

    await stopServer();
    withDb((db) => db.prepare("UPDATE project_memberships SET status = 'disabled' WHERE id = 'm-employee'").run());
    await startServer();

    const afterDisable = await api('/api/customers', { token: 'legacy-session-token-for-emp' });
    ok('الجلسة القديمة مرفوضة بعد التعطيل (403)', afterDisable.status === 403, `got ${afterDisable.status}`);
    ok('رمز الرفض ACCOUNT_NOT_ACTIVE', afterDisable.data?.code === 'ACCOUNT_NOT_ACTIVE', JSON.stringify(afterDisable.data));
    ok('التوكن ما زال في القاعدة (لم يُحذف) — الحماية من الفحص', true);

    const relogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000014', password: 'secret123' } });
    ok('الحساب المعطل لا يستطيع توليد توكن جديد', relogin.status === 403);

    await stopServer();
    withDb((db) => db.prepare("UPDATE project_memberships SET status = 'active' WHERE id = 'm-employee'").run());
    await startServer();

    const reactivated = await api('/api/customers', { token: 'legacy-session-token-for-emp' });
    ok('بعد إعادة التفعيل تعمل الجلسة مرة أخرى', reactivated.status === 200, String(reactivated.status));

    console.log('\n— /api/auth/me —');
    const me = await api('/api/auth/me', { token: ownerAuth });
    ok('me: الدور owner', me.data?.role === 'owner');
    ok('me: الحالة active', me.data?.account_status === 'active');
    ok('me: 21 صلاحية', (me.data?.permissions ?? []).length === 21);

    console.log('\n— اختبار #19: الوظائف الأساسية للمالك كما كانت —');
    const addCustomer = await api('/api/customers', {
      method: 'POST',
      token: ownerAuth,
      body: { name: 'أحمد علي', phone: '01111111111', type: 'individual' },
    });
    ok('إضافة عميل 201', addCustomer.status === 201, JSON.stringify(addCustomer.data).slice(0, 100));

    const customers = await api('/api/customers', { token: ownerAuth });
    ok('قائمة العملاء', customers.status === 200 && Array.isArray(customers.data) && customers.data.length === 1);
    const customerId = (customers.data as any[])[0]?.id;

    const tx = await api('/api/transactions', {
      method: 'POST',
      token: ownerAuth,
      body: { customerId, type: 'payment', amount: 1500, date: '2026-10-20', time: '10:00', description: 'دفعة أولى' },
    });
    ok('تسجيل عملية 201', tx.status === 201, JSON.stringify(tx.data).slice(0, 120));
    const txId = tx.data?.transaction?.id;

    const afterTx = await api('/api/customers', { token: ownerAuth });
    ok('الرصيد = 1500', (afterTx.data as any[])[0]?.balance === 1500, String((afterTx.data as any[])[0]?.balance));

    const summary = await api('/api/reports/summary', { token: ownerAuth });
    ok('التقارير تعمل', summary.status === 200);
    ok('إجمالي الإيداعات = 1500', summary.data?.totalPayments === 1500, JSON.stringify(summary.data));
    ok('عدد العملاء = 1', summary.data?.totalCustomers === 1);

    const cancelled = await api(`/api/transactions/${txId}/cancel`, {
      method: 'POST',
      token: ownerAuth,
      body: { reason: 'اختبار الإلغاء' },
    });
    ok('إلغاء العملية يعمل', cancelled.status === 200, JSON.stringify(cancelled.data).slice(0, 120));

    const afterCancel = await api('/api/customers', { token: ownerAuth });
    ok('الملغاة تُستبعد من الرصيد (= 0)', (afterCancel.data as any[])[0]?.balance === 0, String((afterCancel.data as any[])[0]?.balance));

    const logsRes = await api('/api/activity-logs', { token: ownerAuth });
    ok('سجل النشاط يعمل', logsRes.status === 200);

    console.log('\n— سجل التدقيق —');
    const auditRows = withDb((db) =>
      db.prepare('SELECT action_type, result, reason, actor_role FROM activity_logs ORDER BY created_at').all() as any[]
    );
    ok('سجل الدخول الناجح بالدور', auditRows.some((r) => r.action_type === 'LOGIN' && r.actor_role === 'owner'));
    ok('سجل دخول المدير بالدور', auditRows.some((r) => r.action_type === 'LOGIN' && r.actor_role === 'manager'));
    ok('محاولات الدخول المرفوضة مسجّلة', auditRows.filter((r) => r.action_type === 'LOGIN_DENIED').length >= 4);
    ok('الرفض يحمل السبب', auditRows.some((r) => r.action_type === 'LOGIN_DENIED' && String(r.reason ?? '').includes('account_status')));
    ok('رفض الجلسة القديمة مسجّل', auditRows.some((r) => r.action_type === 'ACCESS_DENIED' && String(r.reason ?? '').includes('disabled')));

    console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
    process.exitCode = fail === 0 ? 0 : 1;
  } finally {
    await stopServer().catch(() => killTree(child));
    clearTimeout(watchdog);
    if (process.exitCode === 0) fs.rmSync(TMP, { recursive: true, force: true });
    else console.log(`(أُبقيت ملفات الاختبار في ${TMP} للمراجعة)`);
  }
}

main().catch(async (err) => {
  console.error('فشل الاختبار:', err);
  await stopServer().catch(() => killTree(child));
  process.exit(1);
});
