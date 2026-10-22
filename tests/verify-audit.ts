/**
 * AH2 — بوابة المرحلة 7: سجل التدقيق الموسّع
 * ==========================================
 * يتحقق أن كل حدث مطلوب يُسجَّل فعليًا عبر HTTP، مع الحقول الخمسة:
 *   من نفّذ (اسم + دور) · نوع الإجراء · المتأثر · التاريخ/الوقت · النتيجة · السبب عند الحاجة.
 *
 * الأحداث المغطّاة: دخول · خروج · إنشاء حساب · اعتماد · رفض · تعطيل · إعادة تفعيل ·
 * طلب حذف + اعتماده · تغيير الصلاحيات · تسجيل عملية مالية · إلغاء عملية ·
 * محاولات مرفوضة (صلاحية غير كافية / دخول مرفوض / تجاوز).
 *
 * التشغيل: npx tsx tests/verify-audit.ts
 */



import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-audit-'));
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

function logsFor(actionType: string): Row[] {
  return withDb((db) =>
    db.prepare('SELECT * FROM activity_logs WHERE action_type = ? ORDER BY created_at ASC').all(actionType) as Row[]
  );
}

function allLogs(): Row[] {
  return withDb((db) => db.prepare('SELECT * FROM activity_logs ORDER BY created_at ASC').all() as Row[]);
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

    // ══ 0) صاحب المحل ══
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('إنشاء المحل', reg.status === 201, JSON.stringify(reg.data).slice(0, 120));
    const owner = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } })).data.token;
    ok('صاحب المحل يدخل', !!owner);

    // ══ 1) الدخول مُسجَّل بكل حقوله ══
    console.log('\n— دخول/خروج —');
    const loginRows = logsFor('LOGIN');
    ok('حدث الدخول مُسجَّل', loginRows.length >= 1, String(loginRows.length));
    const lr = loginRows[loginRows.length - 1] ?? {};
    ok('الدخول: اسم المنفّذ مسجَّل', lr.user_name === 'عادل', String(lr.user_name));
    ok('الدخول: دور المنفّذ مسجَّل (owner)', lr.actor_role === 'owner', String(lr.actor_role));
    ok('الدخول: المستهدف مسجَّل', !!lr.target_user_id, String(lr.target_user_id));
    ok('الدخول: النتيجة = success', lr.result === 'success', String(lr.result));
    ok('الدخول: التاريخ بصيغة ISO', /^\d{4}-\d{2}-\d{2}T/.test(String(lr.created_at)), String(lr.created_at));

    // ══ 2) الخروج ══
    const secondLogin = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } })).data.token;
    const logout = await api('/api/auth/logout', { method: 'POST', token: secondLogin });
    ok('تسجيل الخروج ينفَّذ', logout.status === 200, String(logout.status));
    const logoutRows = logsFor('LOGOUT');
    ok('حدث الخروج مُسجَّل', logoutRows.length === 1, String(logoutRows.length));
    ok('الخروج: المنفّذ والدور', logoutRows[0]?.user_name === 'عادل' && logoutRows[0]?.actor_role === 'owner', JSON.stringify(logoutRows[0] ?? {}).slice(0, 120));
    ok('الخروج: النتيجة success', logoutRows[0]?.result === 'success', String(logoutRows[0]?.result));

    // ══ 3) إنشاء الحسابات ══
    console.log('\n— إنشاء حساب / اعتماد / رفض / تغيير صلاحيات —');
    const mgrCreate = await api('/api/accounts', {
      method: 'POST', token: owner,
      body: { name: 'سارة المديرة', phone: '01000000002', password: 'secret123', role: 'manager' },
    });
    ok('صاحب المحل ينشئ مديرًا', mgrCreate.status === 201, JSON.stringify(mgrCreate.data).slice(0, 140));
    const mgrToken = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000002', password: 'secret123' } })).data.token;

    const empCreate = await api('/api/accounts', {
      method: 'POST', token: mgrToken,
      body: { name: 'محمد الموظف', phone: '01000000003', password: 'secret123', role: 'employee', permissions: ['view_customers', 'add_customer', 'create_transaction', 'view_balances'] },
    });
    ok('المدير ينشئ موظفًا (معلق)', empCreate.status === 201 && empCreate.data.account_status === 'pending', JSON.stringify(empCreate.data).slice(0, 140));
    const membershipId = empCreate.data.membership_id;

    const createRows = logsFor('CREATE_ACCOUNT');
    ok('حدث إنشاء الحساب مُسجَّل (مرتان)', createRows.length === 2, String(createRows.length));
    const mgrCreateRow = createRows.find((r) => r.target_user_id && r.user_name === 'سارة المديرة') ?? createRows[1];
    ok('الإنشاء: من نفّذ مسجَّل', createRows[0]?.user_name === 'عادل', String(createRows[0]?.user_name));
    ok('الإنشاء: دور المنفّذ مسجَّل', createRows[0]?.actor_role === 'owner', String(createRows[0]?.actor_role));
    ok('الإنشاء: الحساب المستهدف مسجَّل', !!createRows[1]?.target_user_id, String(createRows[1]?.target_user_id));
    ok('الإنشاء: النتيجة success', createRows[0]?.result === 'success', String(createRows[0]?.result));

    // دخول مرفوض (الحساب معلق) — محاولة مرفوضة مسجَّلة
    const pendingLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('الحساب المعلق لا يدخل (403)', pendingLogin.status === 403, String(pendingLogin.status));
    const loginDenied = logsFor('LOGIN_DENIED');
    ok('محاولة الدخول المرفوضة مسجَّلة', loginDenied.length >= 1, String(loginDenied.length));
    ok('السجل المرفوض: النتيجة = denied', loginDenied[loginDenied.length - 1]?.result === 'denied', String(loginDenied[loginDenied.length - 1]?.result));
    ok('السجل المرفوض: السبب مذكور', !!loginDenied[loginDenied.length - 1]?.reason, String(loginDenied[loginDenied.length - 1]?.reason));

    // اعتماد
    const reqList = await api('/api/accounts/requests', { token: owner });
    const createReq = (reqList.data as Row[]).find((r) => r.type === 'create_account' && r.status === 'pending' && r.target_phone === '01000000003');
    const approve = await api(`/api/accounts/requests/${createReq?.id}/decide`, { method: 'POST', token: owner, body: { decision: 'approve' } });
    ok('صاحب المحل يعتمد الحساب', approve.status === 200, JSON.stringify(approve.data).slice(0, 140));

    const approveRows = logsFor('APPROVE_ACCOUNT');
    ok('حدث الاعتماد مُسجَّل', approveRows.length === 1, String(approveRows.length));
    ok('الاعتماد: المنفّذ والدور', approveRows[0]?.user_name === 'عادل' && approveRows[0]?.actor_role === 'owner', JSON.stringify(approveRows[0] ?? {}).slice(0, 120));
    ok('الاعتماد: المستهدف = الموظف', !!approveRows[0]?.target_user_id, String(approveRows[0]?.target_user_id));

    const permRows = logsFor('PERMISSION_CHANGE');
    ok('حدث تغيير الصلاحيات مُسجَّل بشكل مستقل', permRows.length === 1, String(permRows.length));
    ok('تغيير الصلاحيات: يوضّح الممنوح', String(permRows[0]?.reason ?? '').includes('granted='), String(permRows[0]?.reason));
    ok('تغيير الصلاحيات: المستهدف والمُنفّذ', !!permRows[0]?.target_user_id && permRows[0]?.user_name === 'عادل', JSON.stringify(permRows[0] ?? {}).slice(0, 120));

    // رفض
    const rejCreate = await api('/api/accounts', {
      method: 'POST', token: mgrToken,
      body: { name: 'حساب مرفوض', phone: '01000000004', password: 'secret123', role: 'employee', permissions: ['view_customers'] },
    });
    ok('إنشاء حساب للرفض', rejCreate.status === 201);
    const reqList2 = await api('/api/accounts/requests', { token: owner });
    const rejReq = (reqList2.data as Row[]).find((r) => r.status === 'pending' && r.type === 'create_account' && r.target_phone === '01000000004');
    const reject = await api(`/api/accounts/requests/${rejReq?.id}/decide`, {
      method: 'POST', token: owner, body: { decision: 'reject', note: 'غير مطلوب حاليًا' },
    });
    ok('صاحب المحل يرفض الطلب', reject.status === 200, JSON.stringify(reject.data).slice(0, 140));
    const rejectRows = logsFor('REJECT_ACCOUNT_REQUEST');
    ok('حدث الرفض مُسجَّل', rejectRows.length === 1, String(rejectRows.length));
    ok('الرفض: السبب مسجَّل', String(rejectRows[0]?.reason ?? '').includes('غير مطلوب'), String(rejectRows[0]?.reason));
    ok('الرفض: المنفّذ والمستهدف', rejectRows[0]?.user_name === 'عادل' && !!rejectRows[0]?.target_user_id, JSON.stringify(rejectRows[0] ?? {}).slice(0, 120));

    // ══ 4) تعطيل / إعادة تفعيل ══
    console.log('\n— تعطيل وإعادة تفعيل —');
    const disable = await api(`/api/accounts/${membershipId}/disable`, { method: 'POST', token: owner, body: { reason: 'إجازة طويلة' } });
    ok('صاحب المحل يعطّل', disable.status === 200, JSON.stringify(disable.data).slice(0, 140));
    const disableRows = logsFor('DISABLE_ACCOUNT');
    ok('حدث التعطيل مُسجَّل', disableRows.length >= 1, String(disableRows.length));
    ok('التعطيل: السبب مسجَّل', String(disableRows[disableRows.length - 1]?.reason ?? '').includes('إجازة'), String(disableRows[disableRows.length - 1]?.reason));
    ok('التعطيل: المنفّذ والدور والنتيجة', disableRows[disableRows.length - 1]?.user_name === 'عادل' && disableRows[disableRows.length - 1]?.actor_role === 'owner' && disableRows[disableRows.length - 1]?.result === 'success', JSON.stringify(disableRows[disableRows.length - 1] ?? {}).slice(0, 140));

    const enable = await api(`/api/accounts/${membershipId}/enable`, { method: 'POST', token: owner, body: { reason: 'عودة للعمل' } });
    ok('صاحب المحل يعيد التفعيل', enable.status === 200, JSON.stringify(enable.data).slice(0, 140));
    const enableRows = logsFor('ENABLE_ACCOUNT');
    ok('حدث إعادة التفعيل مُسجَّل', enableRows.length >= 1, String(enableRows.length));
    ok('إعادة التفعيل: السبب مسجَّل', String(enableRows[enableRows.length - 1]?.reason ?? '').includes('عودة') || !!enableRows[enableRows.length - 1]?.reason, String(enableRows[enableRows.length - 1]?.reason));

    // ══ 5) عمليات مالية: تسجيل وإلغاء ══
    console.log('\n— العمليات المالية —');
    const empToken = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } })).data.token;
    ok('الموظف يدخل بعد إعادة التفعيل', !!empToken);
    const cust = await api('/api/customers', { method: 'POST', token: empToken, body: { name: 'عميل التدقيق', phone: '01111111111', type: 'individual' } });
    ok('الموظف يضيف عميلًا', cust.status === 201);
    const tx = await api('/api/transactions', {
      method: 'POST', token: empToken,
      body: { customerId: cust.data.id, type: 'payment', amount: 500, date: '2026-10-22', time: '10:00', description: 'دفعة تدقيق' },
    });
    ok('الموظف يسجّل عملية', tx.status === 201, JSON.stringify(tx.data).slice(0, 120));

    const txRows = logsFor('CREATE_TRANSACTION');
    ok('حدث تسجيل العملية مُسجَّل', txRows.length === 1, String(txRows.length));
    ok('العملية: المنفّذ = الموظف بدوره', txRows[0]?.user_name === 'محمد الموظف' && txRows[0]?.actor_role === 'employee', JSON.stringify(txRows[0] ?? {}).slice(0, 140));
    ok('العملية: الكيان = TRANSACTION', txRows[0]?.entity_type === 'TRANSACTION', String(txRows[0]?.entity_type));
    ok('العملية: النتيجة success', txRows[0]?.result === 'success', String(txRows[0]?.result));

    const txId = tx.data?.transaction?.id ?? tx.data?.id;
    const cancel = await api(`/api/transactions/${txId}/cancel`, {
      method: 'POST', token: owner, body: { reason: 'خطأ في المبلغ' },
    });
    ok('صاحب المحل يلغي العملية', cancel.status === 200, JSON.stringify(cancel.data).slice(0, 140));
    const cancelRows = logsFor('CANCEL_TRANSACTION');
    ok('حدث إلغاء العملية مُسجَّل', cancelRows.length === 1, String(cancelRows.length));
    ok('الإلغاء: السبب مسجَّل', String(cancelRows[0]?.reason ?? '').includes('خطأ في المبلغ'), String(cancelRows[0]?.reason));
    ok('الإلغاء: المنفّذ والدور', cancelRows[0]?.user_name === 'عادل' && cancelRows[0]?.actor_role === 'owner', JSON.stringify(cancelRows[0] ?? {}).slice(0, 140));

    // ══ 6) محاولات مرفوضة ══
    console.log('\n— المحاولات المرفوضة —');
    const deniedBackup = await api('/api/backups/create', { method: 'POST', token: empToken, body: {} });
    ok('الموظف يُرفض في النسخ الاحتياطي (403)', deniedBackup.status === 403, String(deniedBackup.status));
    const deniedRows = allLogs().filter((r) => r.result === 'denied' && ['PERMISSION_DENIED', 'ACCESS_DENIED', 'ACCOUNT_ACTION_DENIED'].includes(String(r.action_type)));
    ok('المحاولة المرفوضة مُسجَّلة', deniedRows.length >= 1, String(deniedRows.length));
    ok('المرفوض: السبب مذكور', !!deniedRows[0]?.reason, String(deniedRows[0]?.reason));
    ok('المرفوض: المنفّذ مسجَّل', !!deniedRows[0]?.user_name, String(deniedRows[0]?.user_name));

    // محاولة تجاوز: المدير يحاول منح صلاحية محجوزة
    const escalation = await api('/api/accounts', {
      method: 'POST', token: mgrToken,
      body: { name: 'تجاوز', phone: '01000000009', password: 'secret123', role: 'manager' },
    });
    ok('المدير لا ينشئ مديرًا (403)', escalation.status === 403, String(escalation.status));
    const roleDeniedRows = logsFor('ACCOUNT_ACTION_DENIED');
    ok('محاولة إنشاء دور أعلى مُسجَّلة كمرفوضة', roleDeniedRows.length >= 1 && roleDeniedRows.some((r) => String(r.reason ?? '').includes('target_role=manager')), JSON.stringify(roleDeniedRows[0] ?? {}).slice(0, 140));

    // تجاوز سقف صلاحيات الموظف: يُقصّ ويُسجَّل الحدث
    const overGrant = await api('/api/accounts', {
      method: 'POST', token: mgrToken,
      body: { name: 'موظف بصلاحيات زائدة', phone: '01000000008', password: 'secret123', role: 'employee', permissions: ['view_customers', 'delete_customer', 'manage_users'] },
    });
    ok('الطلب الزائد يُقصّ لسقف الدور', overGrant.status === 201, JSON.stringify(overGrant.data).slice(0, 140));
    ok('الصلاحيات المحجوزة لم تُمنح', !(overGrant.data?.permissions ?? []).includes('delete_customer') && !(overGrant.data?.permissions ?? []).includes('manage_users'), JSON.stringify(overGrant.data?.permissions));
    const escalationRows = logsFor('PERMISSION_ESCALATION_BLOCKED');
    ok('محاولة التزايد في الصلاحيات مُسجَّلة', escalationRows.length >= 1, String(escalationRows.length));
    ok('سجل التزايد يذكر الصلاحيات المرفوضة', String(escalationRows[0]?.reason ?? '').includes('rejected'), String(escalationRows[0]?.reason));

    // ══ 7) الحذف المنطقي وطلب الحذف ══
    console.log('\n— طلب الحذف واعتماده —');
    const delCreate = await api('/api/accounts', {
      method: 'POST', token: mgrToken,
      body: { name: 'موظف للحذف', phone: '01000000005', password: 'secret123', role: 'employee', permissions: ['view_customers'] },
    });
    ok('إنشاء موظف للحذف', delCreate.status === 201, JSON.stringify(delCreate.data).slice(0, 140));
    const delMembership = delCreate.data.membership_id;
    const reqList3 = await api('/api/accounts/requests', { token: owner });
    const delCreateReq = (reqList3.data as Row[]).find((r) => r.status === 'pending' && r.type === 'create_account' && r.target_phone === '01000000005');
    await api(`/api/accounts/requests/${delCreateReq?.id}/decide`, { method: 'POST', token: owner, body: { decision: 'approve' } });

    const delReq = await api(`/api/accounts/${delMembership}/request`, {
      method: 'POST', token: mgrToken, body: { type: 'delete_account', reason: 'ترك العمل نهائيًا' },
    });
    ok('المدير يقدّم طلب حذف (201)', delReq.status === 201, JSON.stringify(delReq.data).slice(0, 140));
    const reqRows = logsFor('REQUEST_ACCOUNT_ACTION');
    ok('حدث تقديم الطلب مُسجَّل', reqRows.length >= 1, String(reqRows.length));
    ok('الطلب: السبب مسجَّل', String(reqRows[reqRows.length - 1]?.reason ?? '').includes('ترك العمل'), String(reqRows[reqRows.length - 1]?.reason));

    const delReqList = await api('/api/accounts/requests', { token: owner });
    const pendingDelete = (delReqList.data as Row[]).find((r) => r.type === 'delete_account' && r.status === 'pending');
    const delApprove = await api(`/api/accounts/requests/${pendingDelete?.id}/decide`, { method: 'POST', token: owner, body: { decision: 'approve' } });
    ok('صاحب المحل يوافق على الحذف', delApprove.status === 200, JSON.stringify(delApprove.data).slice(0, 140));
    const deleteRows = logsFor('DELETE_ACCOUNT');
    ok('حدث الحذف مُسجَّل', deleteRows.length === 1, String(deleteRows.length));
    ok('الحذف: السبب/التفاصيل مسجّلة', !!deleteRows[0]?.description, String(deleteRows[0]?.description).slice(0, 80));
    ok('الحذف: المنفّذ = صاحب المحل', deleteRows[0]?.user_name === 'عادل', String(deleteRows[0]?.user_name));

    // ══ 8) اكتمال الحقول على كل الأحداث المطلوبة ══
    console.log('\n— اكتمال الحقول على كل الأحداث —');
    const required = [
      'LOGIN', 'LOGOUT', 'CREATE_ACCOUNT', 'APPROVE_ACCOUNT', 'REJECT_ACCOUNT_REQUEST',
      'DISABLE_ACCOUNT', 'ENABLE_ACCOUNT', 'DELETE_ACCOUNT', 'PERMISSION_CHANGE',
      'CREATE_TRANSACTION', 'CANCEL_TRANSACTION', 'REQUEST_ACCOUNT_ACTION',
    ];
    const logs = allLogs();
    for (const type of required) {
      const rows = logs.filter((r) => r.action_type === type);
      const complete = rows.length > 0 && rows.every((r) =>
        !!r.user_name && !!r.actor_role && !!r.action_type && !!r.created_at && !!r.result &&
        !!r.description && (!!r.entity_id || !!r.target_user_id)
      );
      ok(`حقول كاملة لكل أحداث ${type} (${rows.length})`, complete, JSON.stringify(rows[0] ?? {}).slice(0, 160));
    }

    // نتيجة/دور/سبب على المحاولات المرفوضة
    const deniedAll = logs.filter((r) => r.result === 'denied');
    ok('كل الأحداث المرفوضة تحمل نتيجة denied', deniedAll.length > 0 && deniedAll.every((r) => r.result === 'denied'), String(deniedAll.length));
    ok('كل الأحداث تحمل تاريخًا صالحًا', logs.every((r) => /^\d{4}-\d{2}-\d{2}T/.test(String(r.created_at))), String(logs.length));
    ok('لا يوجد حدث بلا منفّذ', logs.every((r) => !!r.user_name), String(logs.filter((r) => !r.user_name).length));

    // ══ 9) حماية السجل: لا مسار للتعديل/الحذف ══
    console.log('\n— حماية السجل —');
    const beforeCount = withDb((db) => Number((db.prepare('SELECT COUNT(*) c FROM activity_logs').get() as any).c));
    const delAttempt = await api('/api/activity-logs', { method: 'DELETE', token: owner });
    const putAttempt = await api('/api/activity-logs', { method: 'PUT', token: owner, body: { description: 'مُعدَّل' } });
    ok('لا يوجد مسار حذف للسجل', delAttempt.status === 404 || delAttempt.status === 405, String(delAttempt.status));
    ok('لا يوجد مسار تعديل للسجل', putAttempt.status === 404 || putAttempt.status === 405, String(putAttempt.status));
    const afterCount = withDb((db) => Number((db.prepare('SELECT COUNT(*) c FROM activity_logs').get() as any).c));
    ok('عدد السجلات لم يتغيّر بعد المحاولات', afterCount === beforeCount, `${beforeCount} → ${afterCount}`);

    // حصانة على مستوى قاعدة البيانات: أي تعديل/حذف مباشر يجب أن يُرفض
    const dbGuardUpdate = withDb((db) => {
      try {
        db.prepare("UPDATE activity_logs SET description = 'مُعدَّل مباشرة'").run();
        return { blocked: false, message: '' };
      } catch (err: any) {
        return { blocked: true, message: String(err?.message ?? err) };
      }
    });
    ok('قاعدة البيانات ترفض تعديل سجل التدقيق', dbGuardUpdate.blocked, dbGuardUpdate.message.slice(0, 80));
    ok('رسالة الرفض واضحة (AUDIT_LOG_IMMUTABLE)', dbGuardUpdate.message.includes('AUDIT_LOG_IMMUTABLE'), dbGuardUpdate.message.slice(0, 80));

    const dbGuardDelete = withDb((db) => {
      try {
        db.prepare('DELETE FROM activity_logs').run();
        return { blocked: false, message: '' };
      } catch (err: any) {
        return { blocked: true, message: String(err?.message ?? err) };
      }
    });
    ok('قاعدة البيانات ترفض حذف سجل التدقيق', dbGuardDelete.blocked, dbGuardDelete.message.slice(0, 80));

    const countAfterGuards = withDb((db) => Number((db.prepare('SELECT COUNT(*) c FROM activity_logs').get() as any).c));
    ok('عدد السجلات سليم بعد محاولات التعديل/الحذف المباشرة', countAfterGuards === beforeCount, `${beforeCount} → ${countAfterGuards}`);

    const empLogs = await api('/api/activity-logs', { token: empToken });
    ok('الموظف لا يقرأ سجل التدقيق (403)', empLogs.status === 403, String(empLogs.status));
    const ownerLogs = await api('/api/activity-logs', { token: owner });
    ok('صاحب المحل يقرأ السجل (200)', ownerLogs.status === 200, String(ownerLogs.status));
    ok('السجل المُعاد يحتوي الأحداث', Array.isArray(ownerLogs.data) && (ownerLogs.data as Row[]).length > 0, String((ownerLogs.data as Row[])?.length));

    // عزل السجل بين المحلات
    const other = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'تاجر آخر', projectName: 'محل آخر', phone: '01099999999', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('إنشاء محل ثانٍ', other.status === 201);
    const otherToken = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01099999999', password: 'secret123' } })).data.token;
    const otherLogs = await api('/api/activity-logs', { token: otherToken });
    const leaked = (otherLogs.data as Row[]).some((r) => r.project_id !== other.data.project.id);
    ok('سجل المحل الآخر لا يتسرّب', otherLogs.status === 200 && !leaked, String(otherLogs.status));

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
