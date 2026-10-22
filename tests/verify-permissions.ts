/**
 * AH2 — بوابة المرحلة 3: تطبيق الصلاحيات فعليًا على الخادم
 * ===========================================================
 *  (أ) فحص تغطية ثابت: كل مسار محمي في server.ts يجب أن يمر بحرس صلاحية.
 *  (ب) اختبارات HTTP فعلية لمحاولات التجاوز:
 *      #6  منع منح الموظف صلاحيات غير معتمدة
 *      #15 منع الموظف من الوظائف المحظورة عنه
 *      #16 منع التجاوز بإرسال طلب مباشر (reset / delete / employees / backups ...)
 *      #17 عزل بيانات المحلات
 *
 * التشغيل: npx tsx tests/verify-permissions.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-perm-'));
const DB_FILE = path.join(TMP, 'data', 'ah2.db');
const PORT = 3000;
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

// ── (أ) فحص التغطية الثابت ───────────────────────────────────
function staticCoverageCheck() {
  console.log('— (أ) فحص تغطية الصلاحيات في الكود —');
  const source = fs.readFileSync(path.join(REPO_ROOT, 'server.ts'), 'utf8');
  const routeRe = /app\.(get|post|put|delete|patch)\(\s*'([^']+)'/g;

  const NON_API_ROUTES = new Set([
    'get /', // مسار الواجهة في وضع الإنتاج
    'get *', // SPA fallback: يُخدم ملف index.html وليس API
  ]);

  const PUBLIC_ROUTES = new Set([
    'post /api/auth/register',
    'post /api/auth/login',
    'get /api/auth/recovery/status',
    'post /api/auth/recovery/email/request',
    'post /api/auth/recovery/email/verify-token',
    'post /api/auth/recovery/email/reset',
    'post /api/auth/recovery/phone/request',
    'post /api/auth/recovery/phone/verify-otp',
    'post /api/auth/recovery/phone/reset-password',
    'post /api/auth/recovery/support-request',
  ]);

  // مسارات مخصّصة: أي مستخدم نشط (لا تحتاج صلاحية، لكنها تحتاج تسجيل دخول)
  const AUTH_ONLY_ROUTES = new Set([
    'get /api/auth/me',
    'post /api/auth/logout',
    'post /api/auth/change-password',
    'post /api/auth/update-profile',
    'post /api/auth/verify-project-password',
    'get /api/notifications',
    'post /api/notifications/:id/read',
    'post /api/notifications/read-all',
  ]);

  const unguarded: string[] = [];
  let total = 0;
  let guarded = 0;
  let m: RegExpExecArray | null;

  while ((m = routeRe.exec(source)) !== null) {
    const key = `${m[1]} ${m[2]}`;
    if (NON_API_ROUTES.has(key)) continue;
    total++;
    if (PUBLIC_ROUTES.has(key) || AUTH_ONLY_ROUTES.has(key)) continue;

    // نقرأ نص تعريف المسار حتى بداية الدالة (أول 300 حرف بعد المطابقة)
    const tail = source.slice(m.index, m.index + 300);
    if (/authMiddleware,\s*(requirePermission|requireAnyPermission|requireOwner)\(/.test(tail)) {
      guarded++;
    } else {
      unguarded.push(key);
    }
  }

  ok(
    `كل المسارات المحمية (${guarded}/${total - PUBLIC_ROUTES.size - AUTH_ONLY_ROUTES.size}) لها حرس صلاحية`,
    unguarded.length === 0,
    unguarded.join(' · ')
  );
  ok('عدد مسارات الـ API المحمية 20', guarded === 20, String(guarded));
  ok('المسارات العامة مسجّلة صراحةً', PUBLIC_ROUTES.size === 10);

  // حماية إضافية: لا مسارات لتعديل/حذف سجل التدقيق
  ok(
    'لا يوجد أي مسار لتعديل أو حذف سجل التدقيق',
    !/app\.(put|delete|patch)\(\s*'\/api\/activity-logs/.test(source)
  );
}

// ── التشغيل ──────────────────────────────────────────────────
async function main() {
  const watchdog = setTimeout(() => {
    console.error('\n❌ تجاوز الوقت المسموح — إيقاف قسري');
    killTree(child);
    process.exit(1);
  }, 240_000);
  watchdog.unref?.();

  staticCoverageCheck();
  console.log(`\nمجلد الاختبار المؤقت: ${TMP}\n`);
  prepareWorkspace();

  let ownerToken = '';
  let projectId = '';
  let customerId = '';

  try {
    await startServer();

    // ══ محل أ: المالك + موظف محدود الصلاحيات + مدير ══
    const regA = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('إنشاء المحل أ', regA.status === 201, JSON.stringify(regA.data).slice(0, 100));
    projectId = regA.data.project.id;

    // ══ محل ب: مالك آخر (لاختبار العزل) ══
    const regB = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'كريم', projectName: 'محل كريم', phone: '01099999999', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('إنشاء المحل ب', regB.status === 201);

    await stopServer();

    // ══ إدخال الموظفين والمدير مباشرة (لأن مسارات الطلبات تُبنى في المرحلة 4) ══
    withDb((db) => {
      const now = new Date().toISOString();
      const insertUser = db.prepare(
        `INSERT INTO users (id, name, phone, email, password_hash, role, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)`
      );
      const insertMember = db.prepare(
        `INSERT INTO project_memberships (id, project_id, user_id, role, status, permissions, created_at, proposed_permissions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      // موظف بالصلاحيات الافتراضية (مشاهدة/إضافة عملاء، تسجيل عملية، أرصدة، مشاركة)
      insertUser.run('u-emp', 'محمد الموظف', '01000000003', hash('secret123'), 'employee', now);
      insertMember.run(
        'm-emp', projectId, 'u-emp', 'employee', 'active',
        JSON.stringify(['view_customers', 'add_customer', 'create_transaction', 'view_customer_transactions', 'view_balances', 'share_invoices']),
        now, JSON.stringify([])
      );

      // مدير
      insertUser.run('u-mgr', 'سارة المديرة', '01000000002', hash('secret123'), 'manager', now);
      insertMember.run(
        'm-mgr', projectId, 'u-mgr', 'manager', 'active',
        JSON.stringify(['view_customers', 'add_customer', 'edit_customer', 'create_transaction', 'view_customer_transactions', 'cancel_transaction', 'view_balances', 'view_all_transactions', 'view_reports', 'share_invoices', 'manage_users', 'create_employees', 'request_disable_account', 'request_delete_account', 'request_enable_account']),
        now, JSON.stringify([])
      );

      // عضو في المحل ب (لاختبار العزل) — نفس الجداول
      insertUser.run('u-empB', 'موظف ب', '01088888888', hash('secret123'), 'employee', now);
      insertMember.run(
        'm-empB', db.prepare('SELECT id FROM projects WHERE owner_id = ?').get(
          db.prepare("SELECT id FROM users WHERE phone='01099999999'").get()!.id
        )!.id as string,
        'u-empB', 'employee', 'active',
        JSON.stringify(['view_customers', 'add_customer']), now, JSON.stringify([])
      );
    });

    await startServer();

    const ownerLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } });
    ownerToken = ownerLogin.data.token;
    const empLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    const empToken = empLogin.data.token;
    const mgrLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000002', password: 'secret123' } });
    const mgrToken = mgrLogin.data.token;
    const empBLogin = await api('/api/auth/login', { method: 'POST', body: { identifier: '01088888888', password: 'secret123' } });
    const empBToken = empBLogin.data.token;

    ok('دخول المالك/الموظف/المدير/موظف ب', !!ownerToken && !!empToken && !!mgrToken && !!empBToken);

    // ══ بيانات أساسية بيد المالك ══
    const addC = await api('/api/customers', {
      method: 'POST', token: ownerToken,
      body: { name: 'أحمد علي', phone: '01111111111', type: 'individual' },
    });
    customerId = addC.data?.id;
    ok('المالك يضيف عميلًا', addC.status === 201);

    const addTx = await api('/api/transactions', {
      method: 'POST', token: ownerToken,
      body: { customerId, type: 'payment', amount: 1000, date: '2026-10-20', time: '10:00', description: 'دفعة' },
    });
    ok('المالك يسجّل عملية', addTx.status === 201);

    // ══ اختبار #6: منع منح صلاحيات غير معتمدة ══
    console.log('\n— اختبار #6: منع تصعيد الصلاحيات عند إنشاء الحساب —');
    const escalate = await api('/api/employees', {
      method: 'POST', token: mgrToken,
      body: {
        name: 'موظف متسلل', phone: '01077777777', password: 'secret123',
        permissions: ['manage_backups', 'restore_data', 'reset_data', 'approve_requests', 'manage_users'],
      },
    });
    ok('إنشاء حساب بصلاحيات إدارية مرفوض', escalate.status === 400, `got ${escalate.status} ${JSON.stringify(escalate.data).slice(0, 140)}`);
    ok('الصفات المرفوضة معلنة في الرد', Array.isArray(escalate.data?.rejected_permissions) && escalate.data.rejected_permissions.length >= 4, JSON.stringify(escalate.data));

    const partial = await api('/api/employees', {
      method: 'POST', token: mgrToken,
      body: { name: 'موظف مقيد', phone: '01077777778', password: 'secret123', permissions: ['view_customers', 'reset_data'] },
    });
    ok('الصلاحيات المتجاوزة تُحذف ويُنشأ الحساب بالمسموح فقط', partial.status === 201, JSON.stringify(partial.data).slice(0, 140));

    const created = withDb((db) =>
      db.prepare(
        `SELECT pm.permissions FROM project_memberships pm JOIN users u ON u.id = pm.user_id WHERE u.phone = '01077777778'`
      ).get() as any
    );
    const createdPerms: string[] = JSON.parse(created?.permissions ?? '[]');
    ok('المخزّن لا يحتوي reset_data', !createdPerms.includes('reset_data'), JSON.stringify(createdPerms));
    ok('المخزّن يحتوي view_customers فقط', createdPerms.length === 1 && createdPerms[0] === 'view_customers');

    // ══ اختبار #15/#16: منع الموظف من الوظائف المحظورة ══
    console.log('\n— اختبار #15/#16: منع الموظف من الوظائف المحظورة (طلب مباشر) —');
    const forbidden: Array<[string, string, string, any?]> = [
      ['DELETE', `/api/customers/${customerId}`, 'delete_customer', { projectPassword: 'secret123' }],
      ['PUT', `/api/customers/${customerId}`, 'edit_customer', { name: 'تعديل', phone: '01111111111' }],
      ['POST', '/api/data/reset', 'reset_data', { projectPassword: 'secret123' }],
      ['POST', '/api/data/export', 'manage_backups', {}],
      ['POST', '/api/data/import', 'restore_data', {}],
      ['GET', '/api/backups', 'manage_backups'],
      ['POST', '/api/backups/create', 'manage_backups', {}],
      ['GET', '/api/employees', 'manage_users'],
      ['POST', '/api/employees', 'create_employees', { name: 'x', phone: '01066666666', password: 'secret123', permissions: ['view_customers'] }],
      ['DELETE', '/api/employees/m-emp', 'manage_users', {}],
      ['GET', '/api/activity-logs', 'manage_users'],
      ['POST', '/api/auth/set-project-password', 'owner_only', { projectPassword: 'x' }],
    ];

    for (const [method, route, label, body] of forbidden) {
      const r = await api(route, { method, token: empToken, body });
      ok(`الموظف ممنوع من ${method} ${route} (${label})`, r.status === 403, `got ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
      if (r.status === 403) {
        ok(`  رمز الرفض صحيح لـ ${route}`, ['PERMISSION_DENIED'].includes(r.data?.code), JSON.stringify(r.data));
      }
    }

    // ══ ما هو مسموح للموظف فعلًا ══
    console.log('\n— الوظائف المسموحة للموظف تعمل —');
    const empView = await api('/api/customers', { token: empToken });
    ok('الموظف يرى العملاء', empView.status === 200 && Array.isArray(empView.data));

    const empAdd = await api('/api/customers', {
      method: 'POST', token: empToken,
      body: { name: 'عميل من الموظف', phone: '01222222222', type: 'individual' },
    });
    ok('الموظف يضيف عميلًا', empAdd.status === 201, JSON.stringify(empAdd.data).slice(0, 100));

    const empTx = await api('/api/transactions', {
      method: 'POST', token: empToken,
      body: { customerId, type: 'withdrawal', amount: 200, date: '2026-10-21', time: '11:00', description: 'سحب' },
    });
    ok('الموظف يسجّل عملية', empTx.status === 201);

    const empTxList = await api(`/api/transactions?customerId=${customerId}`, { token: empToken });
    ok('الموظف يرى سجل عمليات عميل محدد', empTxList.status === 200 && Array.isArray(empTxList.data) && empTxList.data.length >= 2);

    const empTxAll = await api('/api/transactions', { token: empToken });
    ok('الموظف لا يرى «كل العمليات» (قائمة فارغة)', empTxAll.status === 200 && Array.isArray(empTxAll.data) && empTxAll.data.length === 0, JSON.stringify(empTxAll.data).slice(0, 120));

    const empSummary = await api('/api/reports/summary', { token: empToken });
    ok('الموظف يرى الأرصدة', empSummary.status === 200 && typeof empSummary.data?.positiveBalanceSum === 'number');
    ok('الموظف لا يرى تفاصيل التقارير', empSummary.data?.totalTransactions === 0 && empSummary.data?.totalPayments === 0, JSON.stringify(empSummary.data));

    const empCancel = await api(`/api/transactions/${addTx.data?.transaction?.id}/cancel`, {
      method: 'POST', token: empToken, body: { reason: 'محاولة' },
    });
    ok('الموظف لا يستطيع إلغاء عملية', empCancel.status === 403, `got ${empCancel.status}`);

    // ══ المدير: ما هو مسموح وما هو ممنوع ══
    console.log('\n— المدير: صلاحيات ثابتة أقل من المالك —');
    const mgrCancel = await api(`/api/transactions/${addTx.data?.transaction?.id}/cancel`, {
      method: 'POST', token: mgrToken, body: { reason: 'إلغاء من المدير' },
    });
    ok('المدير يستطيع إلغاء عملية', mgrCancel.status === 200, `got ${mgrCancel.status}`);

    const mgrDeleteCustomer = await api(`/api/customers/${customerId}`, {
      method: 'DELETE', token: mgrToken, body: { projectPassword: 'secret123' },
    });
    ok('المدير لا يستطيع حذف عميل', mgrDeleteCustomer.status === 403, `got ${mgrDeleteCustomer.status}`);

    const mgrReset = await api('/api/data/reset', { method: 'POST', token: mgrToken, body: { projectPassword: 'secret123' } });
    ok('المدير لا يستطيع تصفير البيانات', mgrReset.status === 403, `got ${mgrReset.status}`);

    const mgrReports = await api('/api/reports/summary', { token: mgrToken });
    ok('المدير يرى تفاصيل التقارير', mgrReports.status === 200 && mgrReports.data?.totalCustomers >= 2, JSON.stringify(mgrReports.data));

    // ══ اختبار #17: عزل بيانات المحلات ══
    console.log('\n— اختبار #17: عزل بيانات المحلات —');
    const bSeesA = await api('/api/customers', { token: empBToken });
    ok('موظف المحل ب لا يرى عملاء المحل أ', bSeesA.status === 200 && Array.isArray(bSeesA.data) && bSeesA.data.length === 0, JSON.stringify(bSeesA.data));

    // موظف المحل ب لا يملك صلاحية مشاهدة العمليات أصلًا، فإن مُنح فعليًا (كما في المرحلة 4)
    // يبقى العزل قائمًا لأن كل استعلام مقيّد بـ project_id من التوكن.
    const bTxOfA = await api(`/api/transactions?customerId=${customerId}`, { token: empBToken });
    ok(
      'موظف المحل ب لا يصل لعمليات المحل أ (رفض أو قائمة فارغة)',
      (bTxOfA.status === 403) || (bTxOfA.status === 200 && Array.isArray(bTxOfA.data) && bTxOfA.data.length === 0),
      JSON.stringify(bTxOfA.data).slice(0, 120)
    );

    const bEditA = await api(`/api/customers/${customerId}`, {
      method: 'PUT', token: empBToken, body: { name: 'اختراق', phone: '01111111111' },
    });
    ok('محاولة تعديل عميل محل آخر محجوبة (403 أو 404)', bEditA.status === 403 || bEditA.status === 404, `got ${bEditA.status}`);

    const bAddTxToA = await api('/api/transactions', {
      method: 'POST', token: empBToken,
      body: { customerId, type: 'payment', amount: 5000, date: '2026-10-21', time: '12:00' },
    });
    ok('لا يمكن تسجيل عملية على عميل محل آخر', bAddTxToA.status === 403 || bAddTxToA.status === 404, `got ${bAddTxToA.status}`);

    // ══ المالك لا يفقد أي وظيفة (#19) ══
    console.log('\n— المالك يحتفظ بكل الوظائف —');
    for (const [method, route, body] of [
      ['GET', '/api/customers', undefined],
      ['GET', '/api/transactions', undefined],
      ['GET', '/api/reports/summary', undefined],
      ['GET', '/api/activity-logs', undefined],
      ['GET', '/api/backups', undefined],
      ['GET', '/api/employees', undefined],
    ] as const) {
      const r = await api(route, { method, token: ownerToken, body });
      ok(`المالك: ${method} ${route}`, r.status === 200, `got ${r.status}`);
    }

    // ══ سجل التدقيق: محاولات الرفض مسجّلة ══
    console.log('\n— سجل التدقيق —');
    const audit = withDb((db) =>
      db.prepare("SELECT action_type, result, reason, actor_role FROM activity_logs WHERE result='denied'").all() as any[]
    );
    ok('محاولات الرفض مسجّلة', audit.filter((r) => r.action_type === 'PERMISSION_DENIED').length >= 10, `count=${audit.filter((r) => r.action_type === 'PERMISSION_DENIED').length}`);
    ok('الصلاحية المطلوبة مسجّلة في السبب', audit.some((r) => String(r.reason ?? '').includes('required_permission=delete_customer')));
    ok('محاولة التصعيد مسجّلة', audit.some((r) => r.action_type === 'PERMISSION_ESCALATION_BLOCKED'));
    ok('دور المنفذ مسجّل', audit.some((r) => r.actor_role === 'employee'));

    // ══ سلامة الأرصدة بعد كل المحاولات ══
    console.log('\n— سلامة البيانات بعد محاولات التجاوز —');
    const customers = await api('/api/customers', { token: ownerToken });
    ok('لم يُحذف أي عميل', (customers.data as any[]).length >= 2, String((customers.data as any[]).length));
    const summary = await api('/api/reports/summary', { token: ownerToken });
    ok('البيانات لم تُصفَّر (العملاء موجودون)', summary.data?.totalCustomers >= 2, JSON.stringify(summary.data));

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
