/**
 * AH2 — بوابة المرحلة 4: دورة حياة الحسابات والاعتماد
 * =====================================================
 * اختبارات HTTP فعلية على خادم حقيقي وقاعدة مؤقتة:
 *   #3  المدير ينشئ حساب موظف
 *   #4  الحساب يبقى معلقًا حتى موافقة صاحب المحل
 *   #5  رفض الطلب يمنع استخدام الحساب
 *   #7  المدير يقدّم طلب تعطيل
 *   #8  لا تنفيذ قبل موافقة صاحب المحل
 *   #9  صاحب المحل يعطّل مباشرة
 *   #12 إعادة التفعيل بموافقة صاحب المحل واستعادة الصلاحيات نفسها
 *   #13 الاحتفاظ بكل عمليات الموظف بعد التعطيل
 *   #14 الحذف لا يُتلف السجلات التاريخية
 *   + منع إنشاء "مدير" بواسطة المدير، ومنع المساس بحساب صاحب المحل
 *
 * التشغيل: npx tsx tests/verify-accounts.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-accounts-'));
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

    // ══ 0) المالك ══
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('إنشاء المحل', reg.status === 201);
    const projectId = reg.data.project.id;

    const owner = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } })).data.token;

    // ══ إنشاء مدير بواسطة صاحب المحل ══
    const mgrCreate = await api('/api/accounts', {
      method: 'POST', token: owner,
      body: { name: 'سارة', phone: '01000000002', password: 'secret123', role: 'manager' },
    });
    ok('صاحب المحل ينشئ مديرًا', mgrCreate.status === 201, JSON.stringify(mgrCreate.data).slice(0, 140));
    ok('حساب المدير نشط فورًا', mgrCreate.data?.account_status === 'active');
    const mgr = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000002', password: 'secret123' } })).data.token;
    ok('المدير يستطيع الدخول', !!mgr);

    // ══ منع المدير من إنشاء مدير آخر، أو صاحب محل ══
    console.log('\n— قيود إنشاء الأدوار —');
    const mgrMakesManager = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: { name: 'مدير ثانٍ', phone: '01000000020', password: 'secret123', role: 'manager' },
    });
    ok('المدير لا ينشئ مديرًا آخر (403)', mgrMakesManager.status === 403, `got ${mgrMakesManager.status}`);

    const mgrMakesOwner = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: { name: 'مالك جديد', phone: '01000000021', password: 'secret123', role: 'owner' },
    });
    ok('المدير لا ينشئ صاحب محل (403)', mgrMakesOwner.status === 403, `got ${mgrMakesOwner.status}`);

    // ══ #3 + #4: المدير ينشئ موظفًا → معلق حتى الموافقة ══
    console.log('\n— #3/#4: إنشاء الحساب يبقى معلقًا حتى الاعتماد —');
    const empCreate = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: {
        name: 'محمد الموظف', phone: '01000000003', password: 'secret123', role: 'employee',
        permissions: ['view_customers', 'add_customer', 'create_transaction', 'view_balances'],
      },
    });
    ok('المدير ينشئ حساب موظف (201)', empCreate.status === 201, JSON.stringify(empCreate.data).slice(0, 160));
    ok('الحالة = pending', empCreate.data?.account_status === 'pending', JSON.stringify(empCreate.data));
    ok('لا صلاحيات مفعّلة قبل الاعتماد', Array.isArray(empCreate.data?.permissions) && empCreate.data.permissions.length === 0);
    const membershipId = empCreate.data?.membership_id;

    const pendingLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('الحساب المعلق لا يستطيع الدخول (403)', pendingLogin.status === 403, `got ${pendingLogin.status}`);
    ok('رسالة الانتظار واضحة', String(pendingLogin.data?.error ?? '').includes('انتظار اعتماد'));

    const requests = await api('/api/accounts/requests', { token: owner });
    ok('الطلب يظهر لصاحب المحل', requests.status === 200 && (requests.data as any[]).some((r) => r.type === 'create_account' && r.status === 'pending'));
    const createRequest = (requests.data as any[]).find((r) => r.type === 'create_account');
    ok('الطلب يحتوي الصلاحيات المقترحة', Array.isArray(createRequest?.payload?.proposed_permissions) && createRequest.payload.proposed_permissions.length === 4);

    // المدير لا يستطيع أن يوافق على طلبه
    const mgrApprove = await api(`/api/accounts/requests/${createRequest?.id}/decide`, {
      method: 'POST', token: mgr, body: { decision: 'approve' },
    });
    ok('المدير لا يستطيع اعتماد حسابه/طلبه (403)', mgrApprove.status === 403, `got ${mgrApprove.status}`);

    const approve = await api(`/api/accounts/requests/${createRequest?.id}/decide`, {
      method: 'POST', token: owner, body: { decision: 'approve' },
    });
    ok('صاحب المحل يعتمد الحساب', approve.status === 200, JSON.stringify(approve.data).slice(0, 140));

    const emp = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } })).data;
    ok('الحساب المعتمد يدخل الآن', !!emp.token);
    ok('الصلاحيات المعتمدة مطبقة (4)', (emp.permissions ?? []).length === 4, JSON.stringify(emp.permissions));
    const empToken = emp.token;

    // ══ #5: رفض طلب إنشاء حساب ══
    console.log('\n— #5: رفض طلب إنشاء حساب —');
    const rejCreate = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: { name: 'مرفوض', phone: '01000000004', password: 'secret123', role: 'employee', permissions: ['view_customers'] },
    });
    ok('إنشاء حساب ثانٍ (معلق)', rejCreate.status === 201 && rejCreate.data.account_status === 'pending');
    const rejReqList = await api('/api/accounts/requests', { token: owner });
    const rejReq = (rejReqList.data as any[]).find((r) => r.status === 'pending' && r.type === 'create_account' && r.target_phone === '01000000004');
    const reject = await api(`/api/accounts/requests/${rejReq?.id}/decide`, {
      method: 'POST', token: owner, body: { decision: 'reject', note: 'غير مطلوب حاليًا' },
    });
    ok('صاحب المحل يرفض الطلب', reject.status === 200, JSON.stringify(reject.data).slice(0, 140));

    const rejectedLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000004', password: 'secret123' } });
    ok('الحساب المرفوض لا يستطيع الدخول', rejectedLogin.status === 403, `got ${rejectedLogin.status}`);
    ok('حالة الرفض صريحة في الرد', rejectedLogin.data?.account_status === 'rejected', JSON.stringify(rejectedLogin.data));
    const rejectedStatus = withDb((db) => (db.prepare('SELECT status FROM project_memberships WHERE id = ?').get(rejCreate.data.membership_id) as any)?.status);
    ok('الحالة مخزّنة = rejected', rejectedStatus === 'rejected', String(rejectedStatus));

    // ══ تجهيز بيانات مالية من الموظف (لاختبار #13/#14) ══
    console.log('\n— تجهيز عمليات ينفّذها الموظف —');
    const c1 = await api('/api/customers', { method: 'POST', token: empToken, body: { name: 'عميل الموظف', phone: '01111111111', type: 'individual' } });
    ok('الموظف يضيف عميلًا', c1.status === 201);
    const customerId = c1.data?.id;
    const t1 = await api('/api/transactions', { method: 'POST', token: empToken, body: { customerId, type: 'payment', amount: 1000, date: '2026-10-21', time: '09:00', description: 'دفعة 1' } });
    const t2 = await api('/api/transactions', { method: 'POST', token: empToken, body: { customerId, type: 'withdrawal', amount: 300, date: '2026-10-21', time: '10:00', description: 'سحب 1' } });
    ok('الموظف يسجّل عمليتين', t1.status === 201 && t2.status === 201);
    const empUserId = emp.user.id;
    const before = withDb((db) => ({
      tx: Number((db.prepare('SELECT COUNT(*) c FROM transactions WHERE created_by = ?').get(empUserId) as any).c),
      customers: Number((db.prepare("SELECT COUNT(*) c FROM customers WHERE name = 'عميل الموظف'").get() as any).c),
    }));
    ok('عمليات الموظف مسجّلة باسمه (2)', before.tx === 2, String(before.tx));

    // ══ #7 + #8: طلب تعطيل من المدير لا يُنفَّذ قبل الموافقة ══
    console.log('\n— #7/#8: طلب تعطيل من المدير —');
    const disReq = await api(`/api/accounts/${membershipId}/request`, {
      method: 'POST', token: mgr, body: { type: 'disable_account', reason: 'انتهاء فترة العمل' },
    });
    ok('المدير يقدّم طلب تعطيل (201)', disReq.status === 201, JSON.stringify(disReq.data).slice(0, 160));
    ok('الطلب معلق', disReq.data?.status === 'pending');

    const stillActive = await api('/api/customers', { token: empToken });
    ok('الحساب ما زال يعمل قبل الموافقة (#8)', stillActive.status === 200, `got ${stillActive.status}`);

    const mgrDirectDisable = await api(`/api/accounts/${membershipId}/disable`, { method: 'POST', token: mgr, body: {} });
    ok('المدير لا يستطيع التعطيل المباشر (403)', mgrDirectDisable.status === 403, `got ${mgrDirectDisable.status}`);

    // ══ #9: صاحب المحل يعطّل مباشرة (بدون طلب) ══
    console.log('\n— #9: التعطيل المباشر من صاحب المحل —');
    const ownerDisable = await api(`/api/accounts/${membershipId}/disable`, {
      method: 'POST', token: owner, body: { reason: 'استقالة' },
    });
    ok('صاحب المحل يعطّل مباشرة', ownerDisable.status === 200, JSON.stringify(ownerDisable.data).slice(0, 140));
    ok('الحالة = disabled', ownerDisable.data?.account_status === 'disabled');

    const blocked = await api('/api/customers', { token: empToken });
    // 401 = التوكن حُذف فعلًا، 403 = الحالة غير نشطة — كلاهما يمنع الوصول
    ok('الجلسة القديمة للموظف مرفوضة فورًا (401/403)', blocked.status === 401 || blocked.status === 403, `got ${blocked.status}`);
    const relog = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('الموظف المعطل لا يستطيع الدخول', relog.status === 403);
    const tokensLeft = withDb((db) => Number((db.prepare('SELECT COUNT(*) c FROM auth_tokens WHERE user_id = ?').get(empUserId) as any).c));
    ok('كل توكنات الموظف حُذفت', tokensLeft === 0, String(tokensLeft));

    // ══ #13: عمليات الموظف محفوظة بعد التعطيل ══
    console.log('\n— #13: الاحتفاظ بعمليات الموظف بعد التعطيل —');
    const after = withDb((db) => ({
      tx: Number((db.prepare('SELECT COUNT(*) c FROM transactions WHERE created_by = ?').get(empUserId) as any).c),
      customers: Number((db.prepare("SELECT COUNT(*) c FROM customers WHERE name = 'عميل الموظف'").get() as any).c),
    }));
    ok('عدد عمليات الموظف لم يتغير (2)', after.tx === 2, String(after.tx));
    ok('عميل الموظف محفوظ', after.customers === 1, String(after.customers));
    const summary = await api('/api/reports/summary', { token: owner });
    ok('الرصيد لم يتأثر (إيداع 1000 - سحب 300 = 700)', summary.data?.totalPayments === 1000 && summary.data?.totalWithdrawals === 300, JSON.stringify(summary.data));
    const cust = (await api('/api/customers', { token: owner })).data as any[];
    const bal = cust.find((c) => c.id === customerId)?.balance;
    ok('رصيد العميل = 700', bal === 700, String(bal));
    const logsRows = withDb((db) => db.prepare('SELECT action_type, user_name, actor_role FROM activity_logs WHERE user_id = ?').all(empUserId) as any[]);
    ok('سجل نشاط الموظف محفوظ', logsRows.length >= 2);

    // ══ #12: إعادة التفعيل بموافقة صاحب المحل واستعادة نفس الصلاحيات ══
    console.log('\n— #12: إعادة التفعيل —');
    const enableReq = await api(`/api/accounts/${membershipId}/request`, {
      method: 'POST', token: mgr, body: { type: 'enable_account', reason: 'عاد للعمل' },
    });
    ok('المدير يقدّم طلب إعادة تفعيل', enableReq.status === 201, JSON.stringify(enableReq.data).slice(0, 140));

    const notYet = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('لا تفعيل قبل موافقة صاحب المحل', notYet.status === 403);

    const mgrEnableDirect = await api(`/api/accounts/${membershipId}/enable`, { method: 'POST', token: mgr, body: {} });
    ok('المدير لا يستطيع إعادة التفعيل مباشرة', mgrEnableDirect.status === 403, `got ${mgrEnableDirect.status}`);

    const enableApprove = await api(`/api/accounts/requests/${enableReq.data?.request_id}/decide`, {
      method: 'POST', token: owner, body: { decision: 'approve', note: 'موافقة' },
    });
    ok('صاحب المحل يوافق على إعادة التفعيل', enableApprove.status === 200, JSON.stringify(enableApprove.data).slice(0, 140));

    const empBack = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } })).data;
    ok('الحساب يعمل بعد إعادة التفعيل', !!empBack.token);
    ok('الصفات المستعادة = نفس المعتمدة (4)', (empBack.permissions ?? []).length === 4, JSON.stringify(empBack.permissions));
    ok('لا صلاحيات جديدة بعد إعادة التفعيل', !(empBack.permissions ?? []).includes('reset_data'));

    // ══ #14: الحذف لا يُتلف السجلات ══
    console.log('\n— #14: الحذف المنطقي وسلامة السجلات —');
    const deleteNoConfirm = await api(`/api/accounts/${membershipId}/delete`, { method: 'POST', token: owner, body: {} });
    ok('الحذف يتطلب تأكيدًا صريحًا', deleteNoConfirm.status === 400, `got ${deleteNoConfirm.status}`);

    const mgrDelete = await api(`/api/accounts/${membershipId}/delete`, { method: 'POST', token: mgr, body: { confirm: true } });
    ok('المدير لا يستطيع الحذف مباشرة', mgrDelete.status === 403, `got ${mgrDelete.status}`);

    const del = await api(`/api/accounts/${membershipId}/delete`, { method: 'POST', token: owner, body: { confirm: true } });
    ok('صاحب المحل يحذف الحساب', del.status === 200, JSON.stringify(del.data).slice(0, 140));
    ok('الحالة = deleted', del.data?.account_status === 'deleted');
    ok('عدد العمليات المحفوظة معلن في الرد (2)', del.data?.preserved_transactions === 2, JSON.stringify(del.data));

    const deletedLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    // كلمة المرور مُعمّاة → 401 (ولا يُكشف وجود الحساب)، أو 403 للحساب المحذوف
    ok('الحساب المحذوف لا يستطيع الدخول (401/403)', deletedLogin.status === 401 || deletedLogin.status === 403, `got ${deletedLogin.status}`);

    const post = withDb((db) => ({
      tx: Number((db.prepare('SELECT COUNT(*) c FROM transactions WHERE created_by = ?').get(empUserId) as any).c),
      txAll: Number((db.prepare('SELECT COUNT(*) c FROM transactions').get() as any).c),
      customers: Number((db.prepare('SELECT COUNT(*) c FROM customers').get() as any).c),
      userRow: Number((db.prepare('SELECT COUNT(*) c FROM users WHERE id = ?').get(empUserId) as any).c),
      hash: String((db.prepare('SELECT password_hash FROM users WHERE id = ?').get(empUserId) as any)?.password_hash ?? ''),
    }));
    ok('العمليات التاريخية محفوظة بعد الحذف (2)', post.tx === 2, String(post.tx));
    ok('كل عمليات المحل محفوظة', post.txAll >= 2, String(post.txAll));
    ok('العملاء محفوظون', post.customers >= 1, String(post.customers));
    ok('صف المستخدم باقٍ لسلامة سجل التدقيق', post.userRow === 1);
    ok('كلمة المرور مُعمّاة (لا يمكن الدخول)', post.hash.startsWith('deleted:'), post.hash.slice(0, 20));

    const loginAfterDelete = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    ok('صاحب المحل ما زال يعمل بعد كل ذلك', loginAfterDelete.status === 200);
    const finalSummary = await api('/api/reports/summary', { token: loginAfterDelete.data.token });
    ok('التقارير سليمة (إيداعات 1000)', finalSummary.data?.totalPayments === 1000, JSON.stringify(finalSummary.data));

    // ══ منع المساس بحساب صاحب المحل ══
    console.log('\n— حماية حساب صاحب المحل —');
    const ownerMembership = withDb((db) => (db.prepare("SELECT id FROM project_memberships WHERE role = 'owner'").get() as any)?.id);
    const ownerDisableTry = await api(`/api/accounts/${ownerMembership}/disable`, { method: 'POST', token: mgr, body: {} });
    ok('المدير لا يستطيع تعطيل صاحب المحل', ownerDisableTry.status === 403, `got ${ownerDisableTry.status}`);
    const ownerSelfDisable = await api(`/api/accounts/${ownerMembership}/disable`, { method: 'POST', token: owner, body: {} });
    ok('صاحب المحل لا يستطيع تعطيل نفسه', ownerSelfDisable.status === 400, `got ${ownerSelfDisable.status}`);
    const ownerDeleteTry = await api(`/api/accounts/${ownerMembership}/delete`, { method: 'POST', token: mgr, body: { confirm: true } });
    ok('المدير لا يستطيع حذف صاحب المحل', ownerDeleteTry.status === 403, `got ${ownerDeleteTry.status}`);

    // ══ سجل التدقيق ══
    console.log('\n— سجل التدقيق —');
    const audit = withDb((db) => db.prepare('SELECT action_type, actor_role, result, reason, target_user_id FROM activity_logs').all() as any[]);
    for (const type of ['CREATE_ACCOUNT', 'APPROVE_ACCOUNT', 'REJECT_ACCOUNT_REQUEST', 'REQUEST_ACCOUNT_ACTION', 'DISABLE_ACCOUNT', 'ENABLE_ACCOUNT', 'DELETE_ACCOUNT']) {
      ok(`الحدث ${type} مسجّل`, audit.some((r) => r.action_type === type), '');
    }
    ok('الرفض الأمني مسجّل', audit.some((r) => r.action_type === 'ACCOUNT_ACTION_DENIED' || r.action_type === 'PERMISSION_DENIED'));
    ok('السجل يحمل هوية المستهدف', audit.some((r) => r.action_type === 'DISABLE_ACCOUNT' && r.target_user_id === empUserId));

    console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error('فشل الاختبار:', err);
    console.error(logs.join('').split('\n').slice(-12).join('\n'));
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
