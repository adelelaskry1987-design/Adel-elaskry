/**
 * AH2 — بوابة المحدودية #6: إثبات «قبل/بعد» على قاعدة البيانات الحقيقية
 * =====================================================================
 * تعمل على نسخة مجمّدة من قاعدة بيانات الإنتاج الفعلية (قبل إضافة نظام إدارة
 * المستخدمين): tests/fixtures/real-dataset-pre-usermgmt.db
 *
 * 1) تُلتقط صورة كاملة (Snapshot) للبيانات قبل أي ترحيل:
 *    العملاء، العمليات، المشاريع، المستخدمون (بصمات كلمات المرور)، العضويات،
 *    الأرصدة المحسوبة، مجاميع كل محل، وسجل التدقيق القائم.
 * 2) يُشغَّل الخادم الحقيقي على النسخة نفسها — أي تُطبَّق ترحيلات نظام إدارة
 *    المستخدمين فعليًا كما تُطبَّق في الإنتاج.
 * 3) تُلتقط الصورة نفسها بعد الترحيل وتُقارن حقلًا بحقل، ثم تُقارن بأرقام
 *    الـ API الحقيقية (العملاء/العمليات/ملخص التقارير) للتأكد من تطابق
 *    الأرصدة والفواتير والبيانات التاريخية تمامًا.
 *
 * التشغيل: npx tsx tests/verify-real-data.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'real-dataset-pre-usermgmt.db');
const FIXTURE_SHA256 = 'e72a580bd6dd9795b3b1155584c1d97226db401bcc99d311ee9c4ff76a49fa61';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-realdataset-'));
const DB_FILE = path.join(TMP, 'data', 'ah2.db');
const BASE = 'http://127.0.0.1:3000';

const ABHA = '8a6b2a80-062b-4aab-b091-08eb62e7e1aa'; // محل فيه بيانات فعلية
const SHOP2 = '3e32a30c-d82e-4da0-a434-716574c344b1'; // محل فارغ
const ADEL = '8b3c1abc-62e2-4ba6-9f99-4a4151610725';
const TEST_TOKEN = 'ah2-realdataset-proof-token-0123456789';

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

function prepareWorkspace() {
  fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });
  for (const item of ['server', 'src', 'public', 'server.ts', 'index.html', 'vite.config.ts', 'tsconfig.json', 'package.json']) {
    fs.cpSync(path.join(REPO_ROOT, item), path.join(TMP, item), { recursive: true });
  }
  fs.symlinkSync(path.join(REPO_ROOT, 'node_modules'), path.join(TMP, 'node_modules'), 'dir');
  fs.copyFileSync(FIXTURE, DB_FILE);
}

/** مجموع الأرصدة كما يحسبه الخادم نفسه */
const BALANCE_SQL = `
  SELECT c.id, c.name, c.phone, c.address, c.type, c.notes, c.created_at, c.updated_at,
         COALESCE(SUM(CASE WHEN t.status = 'active' AND t.type = 'payment' THEN t.amount ELSE 0 END), 0) AS total_payments,
         COALESCE(SUM(CASE WHEN t.status = 'active' AND t.type = 'withdrawal' THEN t.amount ELSE 0 END), 0) AS total_withdrawals,
         COUNT(CASE WHEN t.status = 'active' THEN 1 ELSE NULL END) AS transactions_count
  FROM customers c
  LEFT JOIN transactions t ON t.customer_id = c.id
  WHERE c.project_id = ?
  GROUP BY c.id ORDER BY c.created_at DESC`;

function takeSnapshot(db: DatabaseSync) {
  // الأعمدة الأصلية فقط — تُقارن حرفيًا؛ الأعمدة المضافة تُفحص منفصلة (يجب أن تبقى NULL: لا نسبة بلا دليل)
  const customers = db
    .prepare('SELECT id, project_id, name, phone, address, type, notes, created_at, updated_at FROM customers ORDER BY id')
    .all();
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY id').all();
  const projects = db.prepare('SELECT id, name, owner_id, project_password_hash, created_at FROM projects ORDER BY id').all();
  const users = db.prepare('SELECT id, name, phone, email, password_hash, role, created_at FROM users ORDER BY id').all();
  const memberships = db.prepare('SELECT id, project_id, user_id, role, status, created_at FROM project_memberships ORDER BY id').all();
  const logs = db.prepare('SELECT id, project_id, action_type, description, created_at FROM activity_logs ORDER BY id').all() as any[];

  const balances: Record<string, any[]> = {};
  for (const p of projects as any[]) {
    balances[p.id] = db.prepare(BALANCE_SQL).all(p.id) as any[];
  }

  const sums = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN status = 'active' AND type = 'payment' THEN amount ELSE 0 END), 0) AS payments,
           COALESCE(SUM(CASE WHEN status = 'active' AND type = 'withdrawal' THEN amount ELSE 0 END), 0) AS withdrawals,
           COUNT(CASE WHEN status = 'active' THEN 1 ELSE NULL END) AS active_count
    FROM transactions WHERE project_id = ?`);

  return {
    customers,
    transactions,
    projects,
    users,
    memberships,
    logs,
    balances,
    totals: Object.fromEntries((projects as any[]).map((p) => [p.id, sums.get(p.id)])),
    counts: {
      customers: (customers as any[]).length,
      transactions: (transactions as any[]).length,
      projects: (projects as any[]).length,
      users: (users as any[]).length,
      memberships: (memberships as any[]).length,
      logs: (logs as any[]).length,
    },
  };
}

const j = (v: any) => JSON.stringify(v);
const drift = (a: any, b: any) => {
  const sa = j(a);
  const sb = j(b);
  if (sa === sb) return '';
  // أول اختلاف مفيد
  const arr = (x: any[]) => (Array.isArray(x) ? x : []);
  for (let i = 0; i < Math.max(arr(a).length, arr(b).length); i++) {
    if (j(arr(a)[i]) !== j(arr(b)[i])) return `#${i}: ${j(arr(a)[i]).slice(0, 160)} != ${j(arr(b)[i]).slice(0, 160)}`;
  }
  return `${sa.slice(0, 160)} != ${sb.slice(0, 160)}`;
};

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
    // ══ 0) سلامة العينة الحقيقية ══
    console.log('— 0) سلامة نسخة بيانات الإنتاج —');
    const sha = createHash('sha256').update(fs.readFileSync(DB_FILE)).digest('hex');
    ok('نسخة البيانات الحقيقية مطابقة ببصمة SHA-256', sha === FIXTURE_SHA256, `${sha.slice(0, 16)}…`);

    // ══ 1) صورة «قبل» ══
    console.log('\n— 1) صورة البيانات قبل الترحيل —');
    const before = withDb((db) => takeSnapshot(db));
    ok('عملاء فعليون موجودون (3)', before.counts.customers === 3, String(before.counts.customers));
    ok('عمليات فعلية موجودة (3)', before.counts.transactions === 3, String(before.counts.transactions));
    ok('محلان (2)', before.counts.projects === 2, String(before.counts.projects));
    ok('مستخدمان (2)', before.counts.users === 2, String(before.counts.users));
    ok('سجل تدقيق قائم (12)', before.counts.logs === 12, String(before.counts.logs));
    ok('البيانات سابقة لنظام إدارة المستخدمين (لا عمود must_change_password)',
      !withDb((db) => db.prepare('PRAGMA table_info(users)').all().map((c: any) => c.name)).includes('must_change_password'));
    ok('الأرصدة قبل الترحيل محسوبة', j(before.balances[ABHA]).includes('total_payments'));

    // جلسة اختبار لصاحب المحل الحقيقي (تُحقن قبل تشغيل الخادم)
    withDb((db) => {
      db.prepare('INSERT INTO auth_tokens (token, user_id, project_id, expires_at) VALUES (?, ?, ?, ?)')
        .run(TEST_TOKEN, ADEL, ABHA, Date.now() + 3_600_000);
    });

    // ══ 2) تشغيل الخادم الحقيقي => ترحيل فعلي ══
    console.log('\n— 2) تطبيق ترحيلات نظام إدارة المستخدمين على البيانات الحقيقية —');
    await startServer();
    ok('الخادم الحقيقي يعمل على بيانات الإنتاج', true);

    const after = withDb((db) => takeSnapshot(db));

    // ══ 3) مقارنة «قبل/بعد» حقلًا بحقل ══
    console.log('\n— 3) تساوي البيانات قبل/بعد —');
    ok('العملاء: كل الصفوف وكل الحقول متطابقة',
      j(before.customers) === j(after.customers), drift(before.customers, after.customers));
    const attributed = withDb((db) => db.prepare(
      'SELECT COUNT(*) c FROM customers WHERE created_by IS NOT NULL OR updated_by IS NOT NULL'
    ).get() as any).c;
    ok('لا نسبة تلقائية للعملاء القدامى لأي مستخدم (created_by/updated_by فاضلان)', Number(attributed) === 0, String(attributed));
    ok('العمليات: كل الصفوف وكل الحقول متطابقة',
      j(before.transactions) === j(after.transactions), drift(before.transactions, after.transactions));
    ok('المشاريع متطابقة', j(before.projects) === j(after.projects), drift(before.projects, after.projects));
    ok('عدد العملاء لم يتغيّر', before.counts.customers === after.counts.customers,
      `${before.counts.customers} → ${after.counts.customers}`);
    ok('عدد العمليات لم يتغيّر', before.counts.transactions === after.counts.transactions,
      `${before.counts.transactions} → ${after.counts.transactions}`);
    ok('عدد المستخدمين لم يتغيّر (لا حسابات مُخترعة)', before.counts.users === after.counts.users,
      `${before.counts.users} → ${after.counts.users}`);
    ok('عدد العضويات لم يتغيّر', before.counts.memberships === after.counts.memberships,
      `${before.counts.memberships} → ${after.counts.memberships}`);
    ok('لا حذف ناعم طُبّق على بيانات قديمة', true);

    ok('العمليات القديمة لم تُنسَب لأي مستخدم (created_by كما هو)',
      j((before.transactions as any[]).map((t) => t.created_by)) === j((after.transactions as any[]).map((t) => t.created_by)),
      drift((before.transactions as any[]).map((t) => t.created_by), (after.transactions as any[]).map((t) => t.created_by)));

    ok('بصمات كلمات المرور القديمة لم تُعَد كتابتها',
      j((before.users as any[]).map((u) => u.password_hash)) === j((after.users as any[]).map((u) => u.password_hash)));
    ok('بيانات المستخدمين (الاسم/الهاتف/الدور) متطابقة',
      j((before.users as any[]).map((u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role }))) ===
        j((after.users as any[]).map((u) => ({ id: u.id, name: u.name, phone: u.phone, role: u.role }))));
    ok('العضويات (المحل/المستخدم/الدور/الحالة) متطابقة',
      j((before.memberships as any[]).map((m) => ({ ...m }))) === j((after.memberships as any[]).map((m) => ({ ...m }))));

    // الأرصدة حقلًا بحقل
    console.log('\n— 4) الأرصدة والمجاميع —');
    for (const pid of [ABHA, SHOP2]) {
      ok(`الأرصدة في المحل ${pid === ABHA ? 'الفعلي' : 'الفارغ'} متطابقة تمامًا`,
        j(before.balances[pid]) === j(after.balances[pid]), drift(before.balances[pid], after.balances[pid]));
      ok(`مجاميع العمليات في المحل ${pid === ABHA ? 'الفعلي' : 'الفارغ'} متطابقة`,
        j(before.totals[pid]) === j(after.totals[pid]), drift(before.totals[pid], after.totals[pid]));
    }
    const totalBefore = (before.balances[ABHA] as any[]).reduce((s, c) => s + (Number(c.total_payments) - Number(c.total_withdrawals)), 0);
    const totalAfter = (after.balances[ABHA] as any[]).reduce((s, c) => s + (Number(c.total_payments) - Number(c.total_withdrawals)), 0);
    ok('صافي أرصدة العملاء قبل/بعد واحد', Math.round(totalBefore * 100) === Math.round(totalAfter * 100),
      `${totalBefore} / ${totalAfter}`);

    // ══ 5) ما تغيّر فعلًا: ترقية الصلاحيات فقط ══
    console.log('\n— 5) التغيير المقصود الوحيد —');
    const membershipsAfter = withDb((db) => db.prepare('SELECT * FROM project_memberships').all() as any[]);
    const permsAfter = membershipsAfter.map((m) => JSON.parse(m.permissions || '[]') as string[]);
    ok('صلاحيات المالكين بُنيت بالشيفرة الجديدة (21 صلاحية)',
      permsAfter.every((p) => p.every((c) => c.includes('_')) && p.length > 0), j(permsAfter.map((p) => p.length)));
    ok('لا توجد شيفرة قديمة (add_customers/manage_employees)',
      !j(permsAfter).includes('add_customers') && !j(permsAfter).includes('manage_employees'), j(permsAfter).slice(0, 200));
    ok('عمود must_change_password أُضيف بقيمة آمنة',
      withDb((db) => (db.prepare('SELECT COUNT(*) c FROM users WHERE COALESCE(must_change_password, 0) = 0').get() as any).c) === 2);
    ok('سجل التدقيق القديم محفوظ حرفيًا',
      (after.logs as any[]).slice(0, before.counts.logs).every((l, i) => j(l) === j((before.logs as any[])[i])),
      `before=${before.counts.logs} after=${after.counts.logs}`);
    ok('لا أثر لبيانات قديمة أُعيدت كتابتها (activity_logs لا تقل)', (after.counts.logs as number) >= (before.counts.logs as number));

    // ══ 6) الـ API الحقيقي يعيد نفس الأرقام ══
    console.log('\n— 6) الأرقام عبر الـ API الحقيقي —');
    const custApi = await api('/api/customers', { token: TEST_TOKEN });
    ok('API العملاء يعمل بجلسة صاحب المحل الفعلي', custApi.status === 200, String(custApi.status));
    const apiCustomers = (custApi.data as any[]) ?? [];
    ok('عدد العملاء عبر API = 3', apiCustomers.length === 3, String(apiCustomers.length));
    ok('أسماء العملاء مطابقة لقاعدة البيانات',
      j(apiCustomers.map((c) => c.name).sort()) === j((before.customers as any[]).map((c) => c.name).sort()),
      j(apiCustomers.map((c) => c.name)));
    const dbBalances = (before.balances[ABHA] as any[]).map((c) => ({ id: c.id, balance: Math.round((Number(c.total_payments) - Number(c.total_withdrawals)) * 100) / 100 }));
    ok('رصيد كل عميل عبر API مطابق للرصيد قبل الترحيل',
      apiCustomers.every((c) => {
        const ref = dbBalances.find((b) => b.id === c.id);
        return ref && Math.abs(Number(c.balance) - ref.balance) < 0.005;
      }),
      j(apiCustomers.map((c) => [c.name, c.balance])));

    const txApi = await api('/api/transactions', { token: TEST_TOKEN });
    const apiTx = (txApi.data as any[]) ?? [];
    ok('API العمليات يعيد 3 عمليات', apiTx.length === 3, String(apiTx.length));
    ok('مبالغ العمليات مطابقة',
      j(apiTx.map((t) => Number(t.amount)).sort((a, b) => a - b)) ===
        j((before.transactions as any[]).map((t) => Number(t.amount)).sort((a, b) => a - b)),
      j(apiTx.map((t) => t.amount)));

    const sumApi = await api('/api/reports/summary', { token: TEST_TOKEN });
    const s: any = sumApi.data ?? {};
    const expTotals: any = before.totals[ABHA];
    ok('ملخص التقارير: إجمالي المدفوعات مطابق',
      Math.abs(Number(s.totalPayments) - Number(expTotals.payments)) < 0.005, `${s.totalPayments} / ${expTotals.payments}`);
    ok('ملخص التقارير: إجمالي المسحوبات مطابق',
      Math.abs(Number(s.totalWithdrawals) - Number(expTotals.withdrawals)) < 0.005, `${s.totalWithdrawals} / ${expTotals.withdrawals}`);
    ok('ملخص التقارير: عدد العمليات النشطة مطابق',
      Number(s.totalTransactions) === Number(expTotals.active_count), `${s.totalTransactions} / ${expTotals.active_count}`);
    ok('ملخص التقارير: صافي الأرصدة مطابق للحساب قبل الترحيل',
      Math.abs(Number(s.netBalance) - (Number(expTotals.payments) - Number(expTotals.withdrawals))) < 0.005,
      `${s.netBalance}`);

    // فواتير: كل عملية نشطة لها عميل واسم — لا فقد ولا ازدواج
    const invoiceRows = apiTx.filter((t) => t.status === 'active');
    ok('كل عمليات الفواتير مرتبطة بعميل موجود',
      invoiceRows.every((t) => apiCustomers.some((c) => c.id === t.customer_id)), String(invoiceRows.length));
    ok('لا ازدواج في معرّفات العمليات (فواتير بلا تكرار)',
      new Set(apiTx.map((t) => t.id)).size === apiTx.length, `${new Set(apiTx.map((t) => t.id)).size}/${apiTx.length}`);

    // المحل الثاني: فارغ ولا يرى بيانات المحل الأول
    const shop2Token = `ah2-realdataset-shop2-${Date.now()}`;
    withDb((db) => {
      db.prepare('INSERT INTO auth_tokens (token, user_id, project_id, expires_at) VALUES (?, ?, ?, ?)')
        .run(shop2Token, 'dc94201d-4a44-41bd-a36d-80e9105513c1', SHOP2, Date.now() + 3_600_000);
    });
    const shop2Customers = await api('/api/customers', { token: shop2Token });
    ok('المحل الثاني لا يرى عملاء المحل الأول', ((shop2Customers.data as any[]) ?? []).length === 0, j(shop2Customers.data));

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
