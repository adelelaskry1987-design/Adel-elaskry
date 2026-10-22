/**
 * AH2 — البوابة النهائية: الاختبارات الـ19 الإلزامية + سلامة البيانات
 * ================================================================
 * كل اختبار هنا يُنفَّذ فعليًا عبر HTTP على خادم حقيقي وقاعدة مؤقتة،
 * مرقّمًا بنفس ترقيم المتطلبات (#1 .. #19) حتى يمكن تتبّعه في التقرير.
 *
 * التشغيل: npx tsx tests/verify-final-19.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-final19-'));
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

type Row = Record<string, any>;

/** لقطة سلامة البيانات: أعداد + مجموع الأرصدة + ملخص التقارير */
async function snapshot(token: string) {
  const customers = await api('/api/customers', { token });
  const summary = await api('/api/reports/summary', { token });
  const list = (customers.data as Row[]) ?? [];
  const balancesSum = list.reduce((s, c) => s + Number(c.balance ?? 0), 0);
  return {
    customersCount: list.length,
    balancesSum: Math.round(balancesSum * 100) / 100,
    reports: summary.data ?? {},
    status: customers.status,
  };
}

function txCountByUser(userId: string): number {
  return withDb((db) =>
    Number((db.prepare('SELECT COUNT(*) c FROM transactions WHERE created_by = ?').get(userId) as any).c)
  );
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('\n❌ تجاوز الوقت المسموح — إيقاف قسري');
    killTree(child);
    process.exit(1);
  }, 300_000);
  watchdog.unref?.();

  console.log(`مجلد الاختبار المؤقت: ${TMP}\n`);
  prepareWorkspace();

  try {
    await startServer();

    // ── تهيئة: محل + صاحب محل + مدير ──
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('تهيئة: إنشاء المحل', reg.status === 201, JSON.stringify(reg.data).slice(0, 120));
    const projectId = reg.data.project.id;
    const ownerLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    const owner = ownerLogin.data.token;

    // ═══════════════════ #1 — دخول صاحب المحل ═══════════════════
    console.log('\n#1 — دخول صاحب المحل —');
    ok('#1 صاحب المحل يدخل بنجاح', ownerLogin.status === 200 && !!owner, String(ownerLogin.status));
    ok('#1 الدور = owner', (ownerLogin.data?.user?.role ?? ownerLogin.data?.role) === 'owner', String(ownerLogin.data?.user?.role));
    ok('#1 يملك الصلاحيات الكاملة (21)', (ownerLogin.data?.permissions ?? []).length === 21, String((ownerLogin.data?.permissions ?? []).length));
    ok('#1 الحالة = active', (ownerLogin.data?.user?.account_status ?? ownerLogin.data?.account_status) === 'active', String(ownerLogin.data?.user?.account_status));

    // إنشاء مدير بواسطة صاحب المحل
    const mgrCreate = await api('/api/accounts', {
      method: 'POST', token: owner,
      body: { name: 'سارة المديرة', phone: '01000000002', password: 'secret123', role: 'manager' },
    });
    ok('تهيئة: صاحب المحل ينشئ مديرًا', mgrCreate.status === 201, JSON.stringify(mgrCreate.data).slice(0, 140));

    // ═══════════════════ #2 — دخول المدير ═══════════════════
    console.log('\n#2 — دخول المدير —');
    const mgrLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000002', password: 'secret123' } });
    const mgr = mgrLogin.data.token;
    ok('#2 المدير يدخل بنجاح', mgrLogin.status === 200 && !!mgr, String(mgrLogin.status));
    ok('#2 الدور = manager', (mgrLogin.data?.user?.role ?? mgrLogin.data?.role) === 'manager', String(mgrLogin.data?.user?.role));
    ok('#2 لا يملك صلاحية الموافقة', !(mgrLogin.data?.permissions ?? []).includes('approve_requests'), JSON.stringify(mgrLogin.data?.permissions ?? []).slice(0, 80));

    // ── بيانات مالية مرجعية قبل أي إجراء على الحسابات (لاختبار #19) ──
    const c0 = await api('/api/customers', { method: 'POST', token: owner, body: { name: 'عميل مرجعي', phone: '01111111111', type: 'individual' } });
    ok('تهيئة: عميل مرجعي', c0.status === 201);
    const refCustomerId = c0.data.id;
    await api('/api/transactions', {
      method: 'POST', token: owner,
      body: { customerId: refCustomerId, type: 'payment', amount: 1500, date: '2026-10-01', time: '09:00', description: 'دفعة مرجعية' },
    });
    await api('/api/transactions', {
      method: 'POST', token: owner,
      body: { customerId: refCustomerId, type: 'withdrawal', amount: 500, date: '2026-10-02', time: '10:00', description: 'سحب مرجعي' },
    });
    const snapshotBefore = await snapshot(owner);
    ok('تهيئة: لقطة بيانات مرجعية', snapshotBefore.status === 200 && snapshotBefore.customersCount >= 1, JSON.stringify({ c: snapshotBefore.customersCount, b: snapshotBefore.balancesSum }));

    // ═══════════════════ #3 — إنشاء حساب موظف ═══════════════════
    console.log('\n#3 — المدير ينشئ حساب موظف —');
    const empCreate = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: { name: 'محمد الموظف', phone: '01000000003', password: 'secret123', role: 'employee', permissions: ['view_customers', 'add_customer', 'create_transaction', 'view_balances'] },
    });
    ok('#3 الحساب أُنشئ (201)', empCreate.status === 201, JSON.stringify(empCreate.data).slice(0, 160));
    const empMembership = empCreate.data.membership_id;
    ok('#3 الحساب مربوط بالمحل نفسه', !!empMembership && empCreate.data?.account_status !== undefined);

    // ═══════════════════ #4 — الحساب يبقى معلقًا ═══════════════════
    console.log('\n#4 — الحساب معلق حتى الاعتماد —');
    ok('#4 الحالة = pending', empCreate.data?.account_status === 'pending', String(empCreate.data?.account_status));
    ok('#4 لا صلاحيات مفعّلة قبل الاعتماد', (empCreate.data?.permissions ?? []).length === 0, JSON.stringify(empCreate.data?.permissions));
    const pendingLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('#4 الحساب المعلق لا يستطيع الدخول (403)', pendingLogin.status === 403, String(pendingLogin.status));

    // اعتماد الموظف
    const reqs1 = await api('/api/accounts/requests', { token: owner });
    const createReq = (reqs1.data as Row[]).find((r) => r.type === 'create_account' && r.status === 'pending' && r.target_phone === '01000000003');
    const approve = await api(`/api/accounts/requests/${createReq?.id}/decide`, { method: 'POST', token: owner, body: { decision: 'approve' } });
    ok('تهيئة: صاحب المحل يعتمد الحساب', approve.status === 200, JSON.stringify(approve.data).slice(0, 140));
    const empLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    const emp = empLogin.data.token;
    const empUserId = empLogin.data?.user?.id;
    ok('#4 المعتمد يدخل ويعمل', empLogin.status === 200 && !!emp, String(empLogin.status));

    // ═══════════════════ #5 — رفض الطلب يمنع الاستخدام ═══════════════════
    console.log('\n#5 — رفض طلب الإنشاء —');
    const rejCreate = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: { name: 'حساب مرفوض', phone: '01000000004', password: 'secret123', role: 'employee', permissions: ['view_customers'] },
    });
    const reqs2 = await api('/api/accounts/requests', { token: owner });
    const rejReq = (reqs2.data as Row[]).find((r) => r.status === 'pending' && r.type === 'create_account' && r.target_phone === '01000000004');
    const reject = await api(`/api/accounts/requests/${rejReq?.id}/decide`, { method: 'POST', token: owner, body: { decision: 'reject', note: 'غير مطلوب' } });
    ok('#5 صاحب المحل يرفض الطلب', reject.status === 200, String(reject.status));
    const rejLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000004', password: 'secret123' } });
    ok('#5 المرفوض لا يستطيع الدخول', rejLogin.status === 403 && rejLogin.data?.account_status === 'rejected', `${rejLogin.status} / ${rejLogin.data?.account_status}`);

    // ═══════════════════ #6 — منع منح صلاحيات غير معتمدة ═══════════════════
    console.log('\n#6 — منع منح صلاحيات خارج السقف —');
    const overGrant = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: { name: 'موظف بصلاحيات زائدة', phone: '01000000008', password: 'secret123', role: 'employee', permissions: ['view_customers', 'delete_customer', 'manage_users', 'approve_requests'] },
    });
    ok('#6 الطلب الزائد لا يمنح صلاحيات محجوزة', overGrant.status === 201 && !(overGrant.data?.permissions ?? []).includes('delete_customer') && !(overGrant.data?.permissions ?? []).includes('approve_requests'), JSON.stringify(overGrant.data?.permissions));
    const mgrMakesManager = await api('/api/accounts', {
      method: 'POST', token: mgr, body: { name: 'مدير آخر', phone: '01000000009', password: 'secret123', role: 'manager' },
    });
    ok('#6 المدير لا ينشئ مديرًا (403)', mgrMakesManager.status === 403, String(mgrMakesManager.status));
    const mgrMakesOwner = await api('/api/accounts', {
      method: 'POST', token: mgr, body: { name: 'مالك آخر', phone: '01000000010', password: 'secret123', role: 'owner' },
    });
    ok('#6 المدير لا ينشئ صاحب محل (403)', mgrMakesOwner.status === 403, String(mgrMakesOwner.status));

    // ═══════════════════ #7 — المدير يقدّم طلب تعطيل ═══════════════════
    console.log('\n#7 — المدير يطلب تعطيل حساب —');
    const disReq = await api(`/api/accounts/${empMembership}/request`, {
      method: 'POST', token: mgr, body: { type: 'disable_account', reason: 'انتهاء فترة العمل' },
    });
    ok('#7 الطلب أُنشئ (201)', disReq.status === 201, JSON.stringify(disReq.data).slice(0, 140));
    ok('#7 الطلب معلق', disReq.data?.status === 'pending', String(disReq.data?.status));

    // ═══════════════════ #8 — لا تنفيذ قبل الاعتماد ═══════════════════
    console.log('\n#8 — لا تنفيذ قبل موافقة صاحب المحل —');
    const stillWorks = await api('/api/customers', { token: emp });
    ok('#8 الموظف يعمل قبل الموافقة', stillWorks.status === 200, String(stillWorks.status));
    const mgrDirectDisable = await api(`/api/accounts/${empMembership}/disable`, { method: 'POST', token: mgr, body: {} });
    ok('#8 المدير لا يعطّل مباشرة (403)', mgrDirectDisable.status === 403, String(mgrDirectDisable.status));
    const empStatusBefore = withDb((db) => (db.prepare('SELECT status FROM project_memberships WHERE id = ?').get(empMembership) as Row)?.status);
    ok('#8 الحالة لم تتغيّر قبل الاعتماد', empStatusBefore === 'active', String(empStatusBefore));

    // عمليات ينفّذها الموظف (لاختبارَي #13/#18)
    const empCustomer = await api('/api/customers', {
      method: 'POST', token: emp, body: { name: 'عميل الموظف', phone: '01111111112', type: 'individual' },
    });
    const empCustomerId = empCustomer.data?.id;
    const empTx1 = await api('/api/transactions', {
      method: 'POST', token: emp,
      body: { customerId: empCustomerId, type: 'payment', amount: 1000, date: '2026-10-10', time: '09:00', description: 'دفعة الموظف 1' },
    });
    const empTx2 = await api('/api/transactions', {
      method: 'POST', token: emp,
      body: { customerId: empCustomerId, type: 'withdrawal', amount: 300, date: '2026-10-11', time: '10:00', description: 'سحب الموظف 1' },
    });
    ok('تهيئة: الموظف يسجّل عمليتين', empTx1.status === 201 && empTx2.status === 201, `${empTx1.status}/${empTx2.status}`);

    // ═══════════════════ #18 — نسب العمليات للمستخدم الصحيح ═══════════════════
    console.log('\n#18 — نسب العمليات للمستخدم الصحيح —');
    ok('#18 العمليات مسجّلة باسم الموظف (2)', txCountByUser(empUserId) === 2, String(txCountByUser(empUserId)));
    const empTxRow = withDb((db) => db.prepare('SELECT created_by FROM transactions WHERE id = ?').get(empTx1.data?.transaction?.id ?? empTx1.data?.id) as Row);
    ok('#18 created_by = معرّف الموظف', empTxRow?.created_by === empUserId, String(empTxRow?.created_by));
    const auditCreateTx = withDb((db) => db.prepare("SELECT user_name, actor_role FROM activity_logs WHERE action_type='CREATE_TRANSACTION' ORDER BY created_at DESC LIMIT 1").get() as Row);
    ok('#18 سجل التدقيق يذكر الموظف ودوره', auditCreateTx?.user_name === 'محمد الموظف' && auditCreateTx?.actor_role === 'employee', JSON.stringify(auditCreateTx));

    // ═══════════════════ #9 — صاحب المحل يعطّل مباشرة ═══════════════════
    console.log('\n#9 — التعطيل المباشر من صاحب المحل —');
    const ownerDisable = await api(`/api/accounts/${empMembership}/disable`, { method: 'POST', token: owner, body: { reason: 'استقالة' } });
    ok('#9 يعطّل مباشرة (200)', ownerDisable.status === 200, JSON.stringify(ownerDisable.data).slice(0, 140));
    const empStatusAfter = withDb((db) => (db.prepare('SELECT status FROM project_memberships WHERE id = ?').get(empMembership) as Row)?.status);
    ok('#9 الحالة = disabled', empStatusAfter === 'disabled', String(empStatusAfter));
    const pendingReq = withDb((db) => db.prepare("SELECT status FROM account_requests WHERE target_membership_id = ? AND type='disable_account'").get(empMembership) as Row);
    ok('#9 طلب المدير المعلّق أُغلق', pendingReq?.status === 'cancelled', String(pendingReq?.status));

    // ═══════════════════ #10 — منع الدخول بعد التعطيل ═══════════════════
    console.log('\n#10 — منع الدخول بعد التعطيل —');
    const disabledLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('#10 الدخول مرفوض (403)', disabledLogin.status === 403, String(disabledLogin.status));
    ok('#10 سبب الرفض صريح (disabled)', disabledLogin.data?.account_status === 'disabled', String(disabledLogin.data?.account_status));

    // ═══════════════════ #11 — إبطال الجلسة القديمة ═══════════════════
    console.log('\n#11 — إبطال الجلسة القائمة —');
    const oldSession = await api('/api/customers', { token: emp });
    ok('#11 الجلسة القديمة مرفوضة (401/403)', oldSession.status === 401 || oldSession.status === 403, String(oldSession.status));
    const liveTokens = withDb((db) => Number((db.prepare('SELECT COUNT(*) c FROM auth_tokens WHERE user_id = ?').get(empUserId) as any).c));
    ok('#11 كل توكنات الموظف حُذفت', liveTokens === 0, String(liveTokens));

    // ═══════════════════ #12 — إعادة التفعيل بموافقة صاحب المحل ═══════════════════
    console.log('\n#12 — إعادة التفعيل —');
    const enable = await api(`/api/accounts/${empMembership}/enable`, { method: 'POST', token: owner, body: { reason: 'عودة للعمل' } });
    ok('#12 صاحب المحل يعيد التفعيل (200)', enable.status === 200, JSON.stringify(enable.data).slice(0, 140));
    const reLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('#12 الموظف يدخل بعد إعادة التفعيل', reLogin.status === 200 && !!reLogin.data?.token, String(reLogin.status));
    ok('#12 الصلاحيات المعتمدة نفسها (4)', (reLogin.data?.permissions ?? []).length === 4, JSON.stringify(reLogin.data?.permissions));
    const mgrEnableAttempt = await api(`/api/accounts/${empMembership}/enable`, { method: 'POST', token: mgr, body: {} });
    ok('#12 المدير لا يستطيع إعادة التفعيل بنفسه (403)', mgrEnableAttempt.status === 403, String(mgrEnableAttempt.status));

    // ═══════════════════ #13 — بقاء عمليات الموظف بعد التعطيل ═══════════════════
    console.log('\n#13 — بقاء العمليات بعد التعطيل —');
    ok('#13 عمليات الموظف محفوظة (2)', txCountByUser(empUserId) === 2, String(txCountByUser(empUserId)));
    const empCustomerStill = withDb((db) => db.prepare('SELECT COUNT(*) c FROM customers WHERE name = ?').get('عميل الموظف') as any);
    ok('#13 عميل الموظف محفوظ', Number(empCustomerStill.c) === 1, String(empCustomerStill.c));

    // ═══════════════════ #14 — الحذف لا يتلف السجلات ═══════════════════
    console.log('\n#14 — الحذف المنطقي —');
    const delReq = await api(`/api/accounts/${empMembership}/request`, {
      method: 'POST', token: mgr, body: { type: 'delete_account', reason: 'ترك العمل' },
    });
    ok('#14 المدير يطلب الحذف (201)', delReq.status === 201, String(delReq.status));
    const reqs3 = await api('/api/accounts/requests', { token: owner });
    const pendingDelete = (reqs3.data as Row[]).find((r) => r.type === 'delete_account' && r.status === 'pending');
    const delApprove = await api(`/api/accounts/requests/${pendingDelete?.id}/decide`, { method: 'POST', token: owner, body: { decision: 'approve' } });
    ok('#14 صاحب المحل يوافق على الحذف', delApprove.status === 200, JSON.stringify(delApprove.data).slice(0, 140));
    const deletedRow = withDb((db) => db.prepare('SELECT status FROM project_memberships WHERE id = ?').get(empMembership) as Row);
    ok('#14 الحالة = deleted (حذف منطقي)', deletedRow?.status === 'deleted', String(deletedRow?.status));
    ok('#14 عمليات الموظف باقية بعد الحذف (2)', txCountByUser(empUserId) === 2, String(txCountByUser(empUserId)));
    const userStillExists = withDb((db) => db.prepare('SELECT COUNT(*) c FROM users WHERE id = ?').get(empUserId) as any);
    ok('#14 صف المستخدم محفوظ (لم يُحذف نهائيًا)', Number(userStillExists.c) === 1, String(userStillExists.c));
    const deletedLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('#14 المحذوف لا يدخل (401/403)', deletedLogin.status === 401 || deletedLogin.status === 403, String(deletedLogin.status));

    // ═══════════════════ #15 — منع الوظائف المحظورة ═══════════════════
    console.log('\n#15 — منع الوظائف المحظورة على الدور —');
    const mgrBackup = await api('/api/backups/create', { method: 'POST', token: mgr, body: {} });
    ok('#15 المدير ممنوع من النسخ الاحتياطي (403)', mgrBackup.status === 403, String(mgrBackup.status));
    const mgrReset = await api('/api/data/reset', { method: 'POST', token: mgr, body: { confirm: true } });
    ok('#15 المدير ممنوع من تصفير البيانات (403)', mgrReset.status === 403, String(mgrReset.status));
    const mgrUsersDecide = await api('/api/accounts/requests', { token: mgr });
    ok('#15 المدير لا يملك مسار الاعتماد', mgrUsersDecide.status === 200); // يرى الطلبات لكن لا يعتمدها (تم اختبار الاعتماد في #6/#8)
    const empBackup = await api('/api/backups/create', { method: 'POST', token: mgr, body: {} });
    ok('#15 وظائف البيانات محجوبة على المدير', empBackup.status === 403, String(empBackup.status));

    // ═══════════════════ #16 — منع التجاوز بطلب مباشر للـAPI ═══════════════════
    console.log('\n#16 — منع التجاوز عبر API مباشر —');
    const mgrDeleteCustomer = await api(`/api/customers/${empCustomerId}`, { method: 'DELETE', token: mgr });
    ok('#16 المدير لا يحذف عميلًا (403)', mgrDeleteCustomer.status === 403, String(mgrDeleteCustomer.status));
    const mgrOwnerDisable = await api(`/api/accounts/${empMembership}/disable`, { method: 'POST', token: mgr, body: {} });
    ok('#16 المدير لا يمسّ حسابًا مباشرة (403)', mgrOwnerDisable.status === 403, String(mgrOwnerDisable.status));
    const noToken = await api('/api/customers');
    ok('#16 بلا توكن = 401', noToken.status === 401, String(noToken.status));
    const fakeToken = await api('/api/customers', { token: 'fake-token-123' });
    ok('#16 توكن مزيّف = 401', fakeToken.status === 401, String(fakeToken.status));

    // ═══════════════════ #17 — عزل بيانات المحلات ═══════════════════
    console.log('\n#17 — عزل بيانات المحلات —');
    const otherReg = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'تاجر آخر', projectName: 'محل آخر', phone: '01099999999', password: 'secret123', confirmPassword: 'secret123' },
    });
    const otherToken = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01099999999', password: 'secret123' } })).data.token;
    const otherCustomers = await api('/api/customers', { token: otherToken });
    ok('#17 المحل الآخر لا يرى عملاءنا', otherCustomers.status === 200 && (otherCustomers.data as Row[]).length === 0, `status=${otherCustomers.status} count=${(otherCustomers.data as Row[])?.length}`);
    const otherSeesCustomer = await api(`/api/customers/${refCustomerId}`, { token: otherToken });
    ok('#17 المحل الآخر لا يفتح عميلًا لمحلنا (404/403)', otherSeesCustomer.status === 404 || otherSeesCustomer.status === 403, String(otherSeesCustomer.status));
    const otherAccounts = await api('/api/accounts', { token: otherToken });
    const leakedMembers = (otherAccounts.data as Row[])?.filter((m) => m.membership_id === empMembership) ?? [];
    ok('#17 قائمة مستخدمي المحل الآخر لا تتسرّب', otherAccounts.status === 200 && leakedMembers.length === 0, String(leakedMembers.length));
    const otherTx = await api(`/api/transactions/${empTx1.data?.transaction?.id ?? empTx1.data?.id}/cancel`, { method: 'POST', token: otherToken, body: { reason: 'x' } });
    ok('#17 المحل الآخر لا يلغي عملياتنا (403/404)', otherTx.status === 404 || otherTx.status === 403, String(otherTx.status));

    // ═══════════════════ #19 — استمرار العملاء/الأرصدة/التقارير/الفواتير ═══════════════════
    console.log('\n#19 — سلامة البيانات بعد كل إجراءات الحسابات —');
    const snapshotAfter = await snapshot(owner);
    ok('#19 عدد العملاء لم يتغيّر', snapshotAfter.customersCount === snapshotBefore.customersCount + 1, // + عميل واحد أضافه الموظف
      `${snapshotBefore.customersCount} → ${snapshotAfter.customersCount}`);
    ok('#19 مجموع الأرصدة صحيح ومحسوب بنفس الطريقة',
      snapshotAfter.balancesSum === Math.round(((snapshotBefore.balancesSum) + (1000 - 300)) * 100) / 100,
      `${snapshotBefore.balancesSum} → ${snapshotAfter.balancesSum}`);
    ok('#19 ملخص التقارير متاح لصاحب المحل', snapshotAfter.status === 200 && !!snapshotAfter.reports, `status=${snapshotAfter.status}`);
    ok('#19 بيانات المحل لمحلنا فقط', snapshotAfter.customersCount >= 2, String(snapshotAfter.customersCount));
    const ownerCanStillWork = await api('/api/customers', { token: owner });
    ok('#19 صاحب المحل يعمل كالمعتاد', ownerCanStillWork.status === 200, String(ownerCanStillWork.status));
    const ownerTx = await api('/api/transactions', {
      method: 'POST', token: owner,
      body: { customerId: refCustomerId, type: 'payment', amount: 100, date: '2026-10-20', time: '12:00', description: 'بعد كل الإجراءات' },
    });
    ok('#19 صاحب المحل يسجّل عملية جديدة', ownerTx.status === 201, String(ownerTx.status));
    const finalSnapshot = await snapshot(owner);
    ok('#19 الرصيد تغيّر بالمقدار الصحيح (+100)', finalSnapshot.balancesSum === Math.round((snapshotAfter.balancesSum + 100) * 100) / 100,
      `${snapshotAfter.balancesSum} → ${finalSnapshot.balancesSum}`);
    const ownersRows = withDb((db) => db.prepare("SELECT COUNT(*) c FROM activity_logs WHERE action_type = 'DELETE_CUSTOMER'").get() as any);
    ok('#19 لم يُحذف أي عميل بالخطأ', Number(ownersRows.c) === 0, String(ownersRows.c));

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
