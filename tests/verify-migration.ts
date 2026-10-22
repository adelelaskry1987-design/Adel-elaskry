/**
 * AH2 — بوابة التحقق من ترحيل قاعدة البيانات (Migration Gate)
 * =============================================================
 * الهدف: إثبات أن ترحيل نظام إدارة المستخدمين **لا يغيّر أي بيانات قائمة**.
 *
 * الطريقة:
 *  1) بناء قاعدة بيانات بالمخطط القديم تمامًا + بيانات تمثيلية (محل واحد،
 *     مالك/مدير/موظف، عملاء، عمليات دفع وسحب، عملية ملغاة، سجل نشاط، نسخة احتياطية، جلسة).
 *  2) أخذ بصمة كاملة للبيانات (العملاء، العمليات، الأرصدة، الإجماليات، السجل، النسخ، الجلسات).
 *  3) تشغيل `initDatabase()` الحقيقي (نفس ما يعمل في الإنتاج) على تلك القاعدة.
 *  4) أخذ البصمة مرة أخرى والمقارنة الحرفية + فحص البنية والصلاحيات + تكرار الترحيل.
 *
 * التشغيل:  npx tsx tests/verify-migration.ts
 * لا يلمس هذا الاختبار مجلد `data/` الخاص بالمشروع إطلاقًا (يعمل في مجلد مؤقت).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-migrate-'));
const DB_FILE = path.join(TMP, 'data', 'ah2.db');

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

// ── 1) مخطط قديم + بيانات تمثيلية ─────────────────────────────
function buildLegacyDatabase() {
  fs.mkdirSync(path.join(TMP, 'data'), { recursive: true });
  const legacy = new DatabaseSync(DB_FILE);

  legacy.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, email TEXT UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL);
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL,
      project_password_hash TEXT, created_at TEXT NOT NULL);
    CREATE TABLE project_memberships (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee', status TEXT NOT NULL DEFAULT 'active', permissions TEXT NOT NULL,
      created_at TEXT NOT NULL);
    CREATE TABLE customers (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
      address TEXT DEFAULT '', type TEXT NOT NULL DEFAULT 'individual', notes TEXT DEFAULT '',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, customer_id TEXT NOT NULL,
      type TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, description TEXT DEFAULT '',
      created_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', cancelled_by TEXT, cancelled_at TEXT,
      cancellation_reason TEXT, created_at TEXT NOT NULL);
    CREATE TABLE notifications (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT, type TEXT NOT NULL,
      title TEXT NOT NULL, message TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE activity_logs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
      user_name TEXT NOT NULL, action_type TEXT NOT NULL, description TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT, created_at TEXT NOT NULL);
    CREATE TABLE backups (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, created_by TEXT NOT NULL,
      filename TEXT NOT NULL, file_size INTEGER NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE auth_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL);
    CREATE TABLE account_recovery_tokens (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, channel TEXT NOT NULL,
      purpose TEXT NOT NULL, secret_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 5, ip_address TEXT,
      created_at TEXT NOT NULL);
    CREATE TABLE recovery_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL, locked_until INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE support_recovery_requests (id TEXT PRIMARY KEY, full_name TEXT NOT NULL, project_name TEXT NOT NULL,
      entered_contact TEXT NOT NULL, alternative_contact TEXT NOT NULL, notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending', ip_address TEXT, created_at TEXT NOT NULL);
  `);

  const now = '2026-10-14T01:52:11.057Z';
  const addUser = legacy.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)');
  addUser.run('u-owner', 'عادل', '01068505471', null, 'salt:hash', 'owner', now);
  addUser.run('u-mgr', 'سارة', '01000000002', null, 'salt:hash', 'manager', now);
  addUser.run('u-emp', 'محمد', '01000000003', null, 'salt:hash', 'employee', now);
  legacy.prepare('INSERT INTO projects VALUES (?,?,?,?,?)').run('p1', 'محل عادل', 'u-owner', 'salt:hash', now);

  const addMembership = legacy.prepare('INSERT INTO project_memberships VALUES (?,?,?,?,?,?,?)');
  // صلاحيات بالأكواد القديمة (12 كودًا) كما هي في قاعدة البيانات الحقيقية
  addMembership.run(
    'm1', 'p1', 'u-owner', 'owner', 'active',
    JSON.stringify([
      'view_customers', 'add_customers', 'edit_customers', 'delete_customers', 'view_transactions',
      'create_transactions', 'cancel_transactions', 'view_reports', 'manage_employees',
      'manage_backups', 'restore_data', 'reset_data',
    ]),
    now
  );
  addMembership.run(
    'm2', 'p1', 'u-mgr', 'manager', 'active',
    JSON.stringify([
      'view_customers', 'add_customers', 'edit_customers', 'view_transactions',
      'create_transactions', 'cancel_transactions', 'view_reports',
    ]),
    now
  );
  addMembership.run(
    'm3', 'p1', 'u-emp', 'employee', 'active',
    JSON.stringify(['view_customers', 'add_customers', 'create_transactions', 'view_transactions']),
    now
  );

  const addCustomer = legacy.prepare(
    `INSERT INTO customers (id, project_id, name, phone, address, type, notes, created_at, updated_at)
     VALUES (?,?,?,?,'',?,'',?,?)`
  );
  addCustomer.run('c1', 'p1', 'أحمد علي', '01111111111', 'individual', '2026-10-15', '2026-10-15');
  addCustomer.run('c2', 'p1', 'شركة النور', '01022222222', 'company', '2026-10-16', '2026-10-16');
  addCustomer.run('c3', 'p1', 'منى حسن', '01033333333', 'individual', '2026-10-17', '2026-10-17');

  const addTx = legacy.prepare(
    `INSERT INTO transactions (id, project_id, customer_id, type, amount, date, time, description,
       created_by, status, cancelled_by, cancelled_at, cancellation_reason, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  addTx.run('t1', 'p1', 'c1', 'payment', 1500, '2026-10-15', '10:00', 'دفعة أولى', 'u-owner', 'active', null, null, null, '2026-10-15T10:00:00.000Z');
  addTx.run('t2', 'p1', 'c1', 'withdrawal', 500, '2026-10-16', '11:00', 'سحب نقدي', 'u-emp', 'active', null, null, null, '2026-10-16T11:00:00.000Z');
  addTx.run('t3', 'p1', 'c2', 'payment', 3000, '2026-10-17', '12:00', 'تحويل بنكي', 'u-mgr', 'active', null, null, null, '2026-10-17T12:00:00.000Z');
  addTx.run('t4', 'p1', 'c2', 'withdrawal', 1200.5, '2026-10-18', '13:00', 'بضاعة', 'u-owner', 'active', null, null, null, '2026-10-18T13:00:00.000Z');
  addTx.run('t5', 'p1', 'c3', 'payment', 700, '2026-10-18', '14:00', 'دفعة', 'u-emp', 'cancelled', 'u-owner', '2026-10-19', 'خطأ في المبلغ', '2026-10-18T14:00:00.000Z');
  addTx.run('t6', 'p1', 'c3', 'payment', 250.75, '2026-10-19', '15:00', 'دفعة جديدة', 'u-mgr', 'active', null, null, null, '2026-10-19T15:00:00.000Z');

  legacy.prepare('INSERT INTO activity_logs VALUES (?,?,?,?,?,?,?,?,?)')
    .run('a1', 'p1', 'u-emp', 'محمد', 'CREATE_TRANSACTION', 'تم تسجيل عملية', 'TRANSACTION', 't2', now);
  legacy.prepare('INSERT INTO backups VALUES (?,?,?,?,?,?,?)')
    .run('b1', 'p1', 'u-owner', 'backup-1.json', 1234, '{"data":{}}', now);
  legacy.prepare('INSERT INTO auth_tokens VALUES (?,?,?,?)')
    .run('tok-emp', 'u-emp', 'p1', Date.now() + 86_400_000);

  legacy.close();
}

// ── 2) البصمة ────────────────────────────────────────────────
function snapshot() {
  const d = new DatabaseSync(DB_FILE);
  const rows = (q: string) => d.prepare(q).all() as any[];

  const balances = rows(`
    SELECT c.id,
      COALESCE(SUM(CASE WHEN t.status='active' AND t.type='payment' THEN t.amount ELSE 0 END),0) AS payments,
      COALESCE(SUM(CASE WHEN t.status='active' AND t.type='withdrawal' THEN t.amount ELSE 0 END),0) AS withdrawals,
      COUNT(t.id) AS tx_count
    FROM customers c LEFT JOIN transactions t ON t.customer_id = c.id
    GROUP BY c.id ORDER BY c.id`
  ).map((r) => ({ ...r, balance: Math.round((r.payments - r.withdrawals) * 100) / 100 }));

  const snap = {
    customers: rows('SELECT id,name,phone,address,type,notes,created_at,updated_at FROM customers ORDER BY id'),
    transactions: rows(`SELECT id,customer_id,type,amount,date,time,description,created_by,status,
      cancelled_by,cancelled_at,cancellation_reason,created_at FROM transactions ORDER BY id`),
    balances,
    totals: rows(`SELECT COUNT(*) c, COALESCE(SUM(amount),0) s FROM transactions WHERE status='active'`)[0],
    logs: rows('SELECT id,user_id,action_type,description,entity_type,entity_id,created_at FROM activity_logs ORDER BY id'),
    backups: rows('SELECT id,filename,file_size,data_json FROM backups ORDER BY id'),
    tokens: rows('SELECT token,user_id,project_id,expires_at FROM auth_tokens ORDER BY token'),
  };
  d.close();
  return snap;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── 3) التشغيل ───────────────────────────────────────────────
async function main() {
  console.log(`مجلد الاختبار المؤقت: ${TMP}\n`);
  buildLegacyDatabase();
  const before = snapshot();
  console.log(
    `قبل الترحيل: ${before.customers.length} عميل · ${before.transactions.length} عملية · إجمالي نشط ${before.totals.s}\n`
  );

  // مهم: تغيير مجلد العمل قبل استيراد وحدة قاعدة البيانات (المسار يُحسب عند الاستيراد)
  process.chdir(TMP);
  const dbModule = await import(pathToFileURL(path.join(REPO_ROOT, 'server', 'db.ts')).href);
  dbModule.initDatabase();

  const after = snapshot();

  console.log('— سلامة البيانات (قبل = بعد) —');
  ok('العملاء متطابقون تمامًا', same(before.customers, after.customers));
  ok('العمليات متطابقة تمامًا', same(before.transactions, after.transactions));
  ok('الأرصدة والملخصات متطابقة', same(before.balances, after.balances));
  ok('الإجماليات متطابقة', same(before.totals, after.totals));
  ok('سجل النشاط القائم سليم', same(before.logs, after.logs));
  ok('النسخ الاحتياطية سليمة', same(before.backups, after.backups));
  ok('جلسات الدخول القائمة لم تُحذف', same(before.tokens, after.tokens));

  console.log('\n— بنية قاعدة البيانات بعد الترحيل —');
  const d = new DatabaseSync(DB_FILE);
  const cols = (t: string) => (d.prepare(`PRAGMA table_info(${t})`).all() as any[]).map((c) => c.name);

  ok('users.last_login_at', cols('users').includes('last_login_at'));
  for (const c of ['proposed_permissions', 'status_changed_at', 'status_changed_by', 'status_reason', 'approved_by', 'approved_at']) {
    ok(`project_memberships.${c}`, cols('project_memberships').includes(c));
  }
  ok('customers.created_by', cols('customers').includes('created_by'));
  ok('customers.updated_by', cols('customers').includes('updated_by'));
  for (const c of ['actor_role', 'target_user_id', 'result', 'reason']) {
    ok(`activity_logs.${c}`, cols('activity_logs').includes(c));
  }
  const hasRequests = (d.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='account_requests'`).all() as any[]).length === 1;
  ok('جدول account_requests', hasRequests);

  console.log('\n— ترحيل الصلاحيات —');
  const perms = (id: string) =>
    JSON.parse((d.prepare('SELECT permissions FROM project_memberships WHERE id=?').get(id) as any).permissions);
  const ownerP: string[] = perms('m1');
  const mgrP: string[] = perms('m2');
  const empP: string[] = perms('m3');

  ok('صاحب المحل لديه 21 صلاحية كاملة', ownerP.length === 21, String(ownerP.length));
  ok('صاحب المحل لديه approve_requests', ownerP.includes('approve_requests'));
  ok('المدير: view_transactions → view_customer_transactions', mgrP.includes('view_customer_transactions'));
  ok('المدير: لا يملك delete_customer', !mgrP.includes('delete_customer'));
  ok('الموظف: add_customers → add_customer', empP.includes('add_customer'));
  ok('الموظف: view_transactions → سجل عمليات العميل', empP.includes('view_customer_transactions'));
  ok(
    'الموظف: لا صلاحيات إدارية',
    !empP.some((p) => p.startsWith('request_') || p === 'manage_users' || p === 'approve_requests')
  );
  const meta = d.prepare('SELECT proposed_permissions, status, approved_at FROM project_memberships').all() as any[];
  ok('proposed_permissions مُعبّأة', meta.every((m) => m.proposed_permissions && JSON.parse(m.proposed_permissions).length > 0));
  ok('status يبقى active للجميع', meta.every((m) => m.status === 'active'));
  ok('approved_at مُعبّأ للنشطين', meta.every((m) => !!m.approved_at));
  d.close();

  console.log('\n— قابلية التكرار (idempotent) —');
  dbModule.initDatabase();
  const again = snapshot();
  ok('إعادة الترحيل لا تغيّر البيانات', same(after.customers, again.customers) && same(after.transactions, again.transactions) && same(after.balances, again.balances));
  const d2 = new DatabaseSync(DB_FILE);
  const ownerP2 = JSON.parse((d2.prepare('SELECT permissions FROM project_memberships WHERE id=?').get('m1') as any).permissions);
  ok('إعادة الترحيل لا تغيّر صلاحيات صاحب المحل', ownerP2.length === 21);
  d2.close();

  console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
  if (fail === 0) fs.rmSync(TMP, { recursive: true, force: true });
  else console.log(`(أُبقيت ملفات الاختبار في ${TMP} للمراجعة)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('فشل الاختبار:', err);
  process.exit(1);
});
