import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ACCOUNT_STATUSES, isRole, normalizePermissions } from './permissions.js';

// Ensure data directory exists
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = path.join(DATA_DIR, 'ah2.db');
export const db = new DatabaseSync(DB_FILE);

// Enable WAL mode & foreign keys
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

// Create Schema Tables
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      project_password_hash TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS project_memberships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      status TEXT NOT NULL DEFAULT 'active',
      permissions TEXT NOT NULL, -- JSON array
      created_at TEXT NOT NULL,
      UNIQUE(project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'individual', -- individual | company
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      type TEXT NOT NULL, -- 'payment' (دفع/موجب) or 'withdrawal' (سحب/سالب)
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', -- 'active' or 'cancelled'
      cancelled_by TEXT,
      cancelled_at TEXT,
      cancellation_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS account_recovery_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      purpose TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      ip_address TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recovery_rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      window_start INTEGER NOT NULL,
      locked_until INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS support_recovery_requests (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      project_name TEXT NOT NULL,
      entered_contact TEXT NOT NULL,
      alternative_contact TEXT NOT NULL,
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      ip_address TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Safe migration: ensure users table has phone_verified column (default 1 for registered phone numbers)
  try {
    const cols = db.prepare(`PRAGMA table_info(users)`).all() as any[];
    const hasPhoneVerified = cols.some((c) => c.name === 'phone_verified');
    if (!hasPhoneVerified) {
      db.exec(`ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 1;`);
    }
  } catch (err) {
    console.warn('Migration check warning (users.phone_verified):', err);
  }

  // Detect any existing duplicate customer phones safely before creating unique index
  try {
    const duplicates = db.prepare(`
      SELECT project_id, phone, COUNT(*) as cnt
      FROM customers
      GROUP BY project_id, phone
      HAVING cnt > 1
    `).all() as any[];

    if (duplicates.length > 0) {
      console.warn('تنبيه: تم اكتشاف أرقام هواتف مكررة مسبقاً في قاعدة بيانات العملاء:', duplicates);
    } else {
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_project_phone 
        ON customers(project_id, phone);
      `);
    }
  } catch (err) {
    console.warn('Index check warning:', err);
  }

  // ترحيل نظام إدارة المستخدمين (إضافي وآمن — لا حذف ولا إعادة بناء)
  runUserManagementMigrations();
}

// ================= USER MANAGEMENT MIGRATIONS =================
/**
 * يضمن وجود عمود في جدول بطريقة آمنة وقابلة للتكرار.
 * لا يحذف ولا يعيد بناء أي جدول — يضيف فقط عند غياب العمود.
 */
function ensureColumn(table: string, column: string, definition: string): boolean {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (cols.some((c) => c.name === column)) return false;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    return true;
  } catch (err) {
    console.warn(`Migration warning (${table}.${column}):`, err);
    return false;
  }
}

/**
 * ترحيل نظام إدارة المستخدمين والصلاحيات:
 *  1) أعمدة إضافية فقط (users / project_memberships / customers / activity_logs).
 *  2) جدول جديد account_requests لطلبات الاعتماد/التعطيل/الحذف/إعادة التفعيل.
 *  3) فهارس مساعدة.
 *  4) ترحيل بيانات الصلاحيات القديمة (12 كودًا) إلى المصفوفة الجديدة (21 كودًا)
 *     دون فقدان أي صلاحية قائمة، مع ضمان بقاء صاحب المحل كامل الصلاحيات.
 * كل الخطوات قابلة للتكرار (idempotent) ولا تمسّ العملاء أو العمليات أو الأرصدة.
 */
export function runUserManagementMigrations() {
  let addedColumns = 0;

  // 1) أعمدة الحسابات والاعتماد
  if (ensureColumn('users', 'last_login_at', 'TEXT')) addedColumns++;
  if (ensureColumn('project_memberships', 'proposed_permissions', 'TEXT')) addedColumns++;
  if (ensureColumn('project_memberships', 'status_changed_at', 'TEXT')) addedColumns++;
  if (ensureColumn('project_memberships', 'status_changed_by', 'TEXT')) addedColumns++;
  if (ensureColumn('project_memberships', 'status_reason', 'TEXT')) addedColumns++;
  if (ensureColumn('project_memberships', 'approved_by', 'TEXT')) addedColumns++;
  if (ensureColumn('project_memberships', 'approved_at', 'TEXT')) addedColumns++;

  // 2) نسبة العملاء إلى منشئها (nullable — البيانات القديمة تبقى NULL ولا تُنسَب لأحد)
  if (ensureColumn('customers', 'created_by', 'TEXT')) addedColumns++;
  if (ensureColumn('customers', 'updated_by', 'TEXT')) addedColumns++;

  // 3) حقول سجل التدقيق
  if (ensureColumn('activity_logs', 'actor_role', 'TEXT')) addedColumns++;
  if (ensureColumn('activity_logs', 'target_user_id', 'TEXT')) addedColumns++;
  if (ensureColumn('activity_logs', 'result', "TEXT DEFAULT 'success'")) addedColumns++;
  if (ensureColumn('activity_logs', 'reason', 'TEXT')) addedColumns++;

  // 4) جدول طلبات إدارة الحسابات
  db.exec(`
    CREATE TABLE IF NOT EXISTS account_requests (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL, -- create_account | disable_account | enable_account | delete_account
      target_user_id TEXT,
      target_membership_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
      requested_by TEXT,
      requested_by_name TEXT,
      requested_by_role TEXT,
      requested_at TEXT NOT NULL,
      decided_by TEXT,
      decided_by_name TEXT,
      decided_at TEXT,
      decision_note TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_account_requests_project_status
      ON account_requests(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_account_requests_project_type
      ON account_requests(project_id, type);
    CREATE INDEX IF NOT EXISTS idx_memberships_project_status
      ON project_memberships(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user
      ON auth_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_project_created
      ON activity_logs(project_id, created_at);
  `);

  // 5) ترحيل بيانات الصلاحيات القائمة (مرة واحدة فعليًا — والخطوة قابلة للتكرار)
  let migratedMemberships = 0;
  try {
    const rows = db
      .prepare(
        `SELECT id, role, status, permissions, proposed_permissions
         FROM project_memberships`
      )
      .all() as any[];

    const update = db.prepare(
      `UPDATE project_memberships
       SET permissions = ?, proposed_permissions = ?, status = ?, approved_at = COALESCE(approved_at, ?)
       WHERE id = ?`
    );

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const row of rows) {
        const role = isRole(row.role) ? row.role : 'employee';

        let stored: string[] = [];
        try {
          const parsed = JSON.parse(row.permissions || '[]');
          stored = Array.isArray(parsed) ? parsed : [];
        } catch {
          stored = [];
        }

        const normalized = normalizePermissions(role, stored);
        const status = ACCOUNT_STATUSES.includes(row.status) ? row.status : 'active';
        const proposed = row.proposed_permissions ?? JSON.stringify(normalized);

        const permissionsChanged = JSON.stringify(normalized) !== JSON.stringify(stored);
        const proposedMissing = row.proposed_permissions === null || row.proposed_permissions === undefined;
        const statusChanged = status !== row.status;

        if (permissionsChanged || proposedMissing || statusChanged) {
          update.run(
            JSON.stringify(normalized),
            proposed,
            status,
            status === 'active' ? new Date().toISOString() : null,
            row.id
          );
          migratedMemberships++;
        }
      }
      db.exec('COMMIT;');
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  } catch (err) {
    console.warn('Migration warning (membership permissions backfill):', err);
  }

  if (addedColumns > 0 || migratedMemberships > 0) {
    console.log(
      `[migration] نظام إدارة المستخدمين: ${addedColumns} عمود جديد، ${migratedMemberships} عضوية تم ترحيل صلاحياتها.`
    );
  }
}

// Phone Number Normalization
export function normalizePhoneNumber(rawPhone: string | number): string {
  if (!rawPhone && rawPhone !== 0) return '';
  let str = String(rawPhone).trim();

  // 1. Convert Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII (0-9)
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  for (let i = 0; i < 10; i++) {
    str = str.replaceAll(arabicDigits[i], String(i));
    str = str.replaceAll(persianDigits[i], String(i));
  }

  // 2. Remove all non-digits and non-plus
  str = str.replace(/[^\d+]/g, '');

  // 3. Normalize international prefixes (+20 or 0020 for Egypt) to local 01xxxxxxxxx
  if (str.startsWith('+20')) {
    str = '0' + str.slice(3);
  } else if (str.startsWith('0020')) {
    str = '0' + str.slice(4);
  } else if (str.startsWith('+')) {
    str = str.slice(1);
  }

  // Remove any remaining non-digit
  return str.replace(/\D/g, '');
}

// Password utilities
export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(secret, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export function verifySecret(secret: string, combinedHash: string): boolean {
  try {
    const [salt, key] = combinedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedKey = crypto.scryptSync(secret, salt, 64);
    return crypto.timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

// Helper for generating unique UUIDs
export function generateId(): string {
  return crypto.randomUUID();
}
