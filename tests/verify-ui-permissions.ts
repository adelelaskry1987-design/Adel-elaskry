/**
 * AH2 — بوابة المرحلة 6: ربط الصلاحيات بالشاشات القائمة (اختبار متصفح حقيقي)
 * ==========================================================================
 * يتحقّق أن الواجهة لا تُظهر — ولا تُتيح — أي شاشة أو زر لا يملكه حساب المستخدم،
 * وأن صاحب المحل يبقى كامل الصلاحيات (Owner Parity)، وأن الخادم يرفض كل تجاوز.
 *
 * التشغيل: npx tsx tests/verify-ui-permissions.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright-core';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-uiperm-'));
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
    env: { ...process.env, NODE_ENV: 'production' },
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

  // نبني الواجهة ونشغّل وضع الإنتاج: يمنع Vite من مراقبة مجلد data/ وإعادة تحميل
  // الصفحة عند كل كتابة في قاعدة البيانات (وهو سلوك بيئة التطوير فقط).
  console.log('— بناء الواجهة لاختبار الإنتاج —');
  execSync(`${path.join(REPO_ROOT, 'node_modules', '.bin', 'vite')} build`, {
    cwd: TMP,
    stdio: 'ignore',
    env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` },
  });
}

// ── مساعدات المتصفح ─────────────────────────────────────────
/** يضع توكنًا صالحًا في جلسة المتصفح الحقيقية */
async function seedSession(page: Page, token: string) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => localStorage.setItem('ah2_auth_token', t), token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
}

/** يسجّل الدخول عبر نموذج الشاشة 4 الحقيقي */
async function uiLogin(page: Page, identifier: string, password: string): Promise<boolean> {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500); // شاشة البداية تنتقل تلقائيًا إلى الدخول
  const inputs = page.locator('input');
  if ((await inputs.count()) < 2) return false;
  await inputs.nth(0).fill(identifier);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button', { hasText: /دخول/ }).last().click();
  await page.waitForTimeout(3500);
  return page.evaluate(() => !!localStorage.getItem('ah2_auth_token'));
}

/** يفتح شاشة عبر مبدّل الشاشات الموجود في التطبيق (مع البحث) */
async function openScreen(page: Page, query: string, avoid?: string): Promise<boolean> {
  let btn = page.locator('button[title*="الشاشات"]').first();
  if (!(await btn.count())) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        break;
      } catch {
        await page.waitForTimeout(1500);
      }
    }
    await page.waitForTimeout(4000);
    btn = page.locator('button[title*="الشاشات"]').first();
    if (!(await btn.count())) return false;
  }
  await btn.click();
  await page.waitForTimeout(700);

  const search = page.locator('input').first();
  if (await search.count()) {
    await search.fill(query);
    await page.waitForTimeout(700);
  }
  const item = avoid
    ? page.locator('button', { hasText: query }).filter({ hasNotText: avoid }).first()
    : page.locator('button', { hasText: query }).first();
  if (!(await item.count())) return false;
  await item.click();
  await page.waitForTimeout(2000);
  return true;
}

const MANAGER_PERMS = [
  'view_customers', 'add_customer', 'edit_customer', 'create_transaction',
  'view_customer_transactions', 'cancel_transaction', 'view_balances',
  'view_all_transactions', 'view_reports', 'share_invoices',
  'manage_users', 'create_employees', 'request_disable_account',
  'request_delete_account', 'request_enable_account',
];

/** موظف مقيّد: مشاهدة العملاء فقط (أقل من سقف الموظف) */
const RESTRICTED_EMPLOYEE_PERMS = ['view_customers'];

/** نص منطقة المحتوى فقط (شريط التنقل السفلي يحتوي نفس الكلمات دائمًا) */
async function mainText(page: Page): Promise<string> {
  const main = page.locator('main').first();
  if (await main.count()) return main.innerText();
  return page.locator('body').innerText();
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('\n❌ تجاوز الوقت المسموح — إيقاف قسري');
    killTree(child);
    process.exit(1);
  }, 480_000);
  watchdog.unref?.();

  console.log(`مجلد الاختبار المؤقت: ${TMP}\n`);
  prepareWorkspace();

  let browser: Browser | null = null;

  try {
    await startServer();

    // ══ تهيئة: محل + صاحب محل (عبر API) ══
    const reg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' }),
    }).then((r) => r.json());
    const projectId = reg.project.id;
    const ownerToken = reg.token as string;

    // عميل تجريبي (لاختبار أزرار تفاصيل العميل)
    const custRes = await fetch(`${BASE}/api/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
      body: JSON.stringify({ name: 'أحمد العميل', phone: '01111111111', address: 'القاهرة' }),
    });
    const custJson: any = await custRes.json().catch(() => ({}));
    ok('صاحب المحل يستطيع إضافة عميل عبر الخادم', custRes.status === 200 || custRes.status === 201, String(custRes.status));

    // ══ إدخال مدير وموظف مقيّد ══
    await stopServer();
    withDb((db) => {
      const now = new Date().toISOString();
      const mk = (id: string, name: string, phone: string, role: string, perms: string[], mid: string) => {
        db.prepare(`INSERT INTO users (id,name,phone,email,password_hash,role,created_at) VALUES (?,?,?,NULL,?,?,?)`)
          .run(id, name, phone, hash('secret123'), role, now);
        db.prepare(
          `INSERT INTO project_memberships (id,project_id,user_id,role,status,permissions,created_at,proposed_permissions)
           VALUES (?,?,?,?,?,?,?,?)`
        ).run(mid, projectId, id, role, 'active', JSON.stringify(perms), now, JSON.stringify([]));
      };
      mk('u-mgr2', 'سارة المديرة', '01000000002', 'manager', MANAGER_PERMS, 'm-mgr2');
      mk('u-emp2', 'عمر الموظف', '01000000007', 'employee', RESTRICTED_EMPLOYEE_PERMS, 'm-emp2');
    });
    await startServer();

    browser = await chromium.launch({ headless: true });

    // تسخين
    const warm = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const warmPage = await warm.newPage();
    await warmPage.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await warmPage.waitForTimeout(12_000);
    await warmPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await warmPage.waitForTimeout(4_000);
    await warm.close();

    const newSession = async (identifier: string) => {
      const ctx = await browser!.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-EG' });
      const page = await ctx.newPage();
      const logged = await uiLogin(page, identifier, 'secret123');
      if (logged) {
        const t = await page.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
        await seedSession(page, t);
      }
      return { ctx, page, logged };
    };

    // ══════════════ 1) صاحب المحل: تطابق كامل (Owner Parity) ══════════════
    console.log('— صاحب المحل: كل الوظائف متاحة —');
    const owner = await newSession('01068505471');
    ok('دخول صاحب المحل من الواجهة', owner.logged);
    let body = await mainText(owner.page);
    ok('صاحب المحل يرى بطاقات الأرصدة', body.includes('الرصيد الموجب'), body.slice(0, 150));
    ok('صاحب المحل يرى زر إضافة عميل', body.includes('إضافة عميل'));
    ok('صاحب المحل يرى زر التقارير', body.includes('التقارير'));
    ok('صاحب المحل يرى زر العمليات', body.includes('العمليات'));

    await openScreen(owner.page, 'التقارير والإحصائيات المالية');
    body = await owner.page.locator('body').innerText();
    ok('صاحب المحل يفتح شاشة التقارير فعليًا', !body.includes('لا تملك صلاحية'), body.slice(0, 120));

    await openScreen(owner.page, 'حذف العميل مع كلمة المرور');
    body = await owner.page.locator('body').innerText();
    ok('صاحب المحل يفتح شاشة حذف العميل', !body.includes('لا تملك صلاحية'), body.slice(0, 120));

    await openScreen(owner.page, 'النسخ الاحتياطي');
    body = await owner.page.locator('body').innerText();
    ok('صاحب المحل يفتح شاشة النسخ الاحتياطي', !body.includes('لا تملك صلاحية') && body.includes('نسخة احتياطية'), body.slice(0, 150));

    await openScreen(owner.page, 'إدارة المستخدمين والصلاحيات');
    body = await owner.page.locator('body').innerText();
    ok('صاحب المحل يفتح إدارة المستخدمين', !body.includes('لا تملك صلاحية') && body.includes('إدارة المستخدمين'), body.slice(0, 150));

    // ══════════════ 2) المدير: ما يملكه يظهر، وما لا يملكه يُمنع ══════════════
    console.log('\n— المدير: صلاحيات إشرافية بلا بيانات/حذف —');
    const mgr = await newSession('01000000002');
    ok('دخول المدير من الواجهة', mgr.logged);
    body = await mainText(mgr.page);
    ok('المدير يرى الأرصدة (view_balances)', body.includes('الرصيد الموجب'), body.slice(0, 150));
    ok('المدير يرى زر إضافة عميل', body.includes('إضافة عميل'));
    ok('المدير يرى زر التقارير', body.includes('التقارير'));
    ok('المدير يرى زر إدارة المستخدمين في الإعدادات', body.includes('إعدادات'));

    await openScreen(mgr.page, 'التقارير والإحصائيات المالية');
    body = await mainText(mgr.page);
    ok('المدير يفتح شاشة التقارير', !body.includes('لا تملك صلاحية'), body.slice(0, 120));

    await openScreen(mgr.page, 'النسخ الاحتياطي');
    body = await mainText(mgr.page);
    ok('المدير يُمنع من شاشة النسخ الاحتياطي', body.includes('لا تملك صلاحية'), body.slice(0, 150));
    ok('رسالة المنع تشرح أن الصلاحية من صاحب المحل', body.includes('صاحب المحل'));

    await openScreen(mgr.page, 'إعادة تعيين البيانات', 'بنجاح');
    body = await mainText(mgr.page);
    ok('المدير يُمنع من تصفير البيانات', body.includes('لا تملك صلاحية'), body.slice(0, 150));

    await openScreen(mgr.page, 'تصدير البيانات');
    body = await mainText(mgr.page);
    ok('المدير يُمنع من تصدير البيانات', body.includes('لا تملك صلاحية'), body.slice(0, 150));

    // تفاصيل العميل: تعديل متاح، حذف ممنوع للمدير
    await openScreen(mgr.page, 'العملاء وإدارة الحسابات');
    // بطاقة العميل عنصر div قابل للنقر (وليس button) — ننقر على اسم العميل فيتصاعد الحدث
    let custLink = mgr.page.locator('h3', { hasText: 'أحمد العميل' }).first();
    if (!(await custLink.count())) custLink = mgr.page.getByText('أحمد العميل', { exact: true }).first();
    let openedCustomer = false;
    if (await custLink.count()) {
      await custLink.click();
      await mgr.page.waitForTimeout(2000);
      openedCustomer = true;
    }
    body = await mainText(mgr.page);
    ok('المدير يفتح تفاصيل العميل', openedCustomer && body.includes('أحمد العميل'), body.slice(0, 150));
    ok('المدير يرى زر تعديل العميل (edit_customer)', body.includes('تعديل بيانات العميل'), body.slice(0, 200));
    ok('المدير لا يرى زر حذف العميل (delete_customer محجوبة)', !body.includes('حذف العميل'), body.slice(0, 200));
    ok('المدير يرى زر تسجيل عملية جديدة', body.includes('تسجيل عملية جديدة'));

    // ══════════════ 3) الموظف المقيّد: مشاهدة العملاء فقط ══════════════
    console.log('\n— الموظف المقيّد (مشاهدة العملاء فقط) —');
    const emp = await newSession('01000000007');
    ok('دخول الموظف المقيّد', emp.logged);
    body = await mainText(emp.page);
    ok('الموظف لا يرى بطاقات الأرصدة (بلا view_balances)', !body.includes('الرصيد الموجب'), body.slice(0, 200));
    ok('الموظف لا يرى زر إضافة عميل', !body.includes('إضافة عميل'), body.slice(0, 200));
    ok('الموظف لا يرى زر التقارير', !body.includes('التقارير'), body.slice(0, 200));
    ok('الموظف لا يرى زر العمليات', !body.includes('العمليات'), body.slice(0, 200));
    ok('الموظف يرى زر العملاء (view_customers)', body.includes('العملاء'), body.slice(0, 200));

    await openScreen(emp.page, 'إضافة عميل جديد');
    body = await mainText(emp.page);
    ok('الموظف يُمنع من شاشة إضافة عميل', body.includes('لا تملك صلاحية'), body.slice(0, 150));

    await openScreen(emp.page, 'التقارير والإحصائيات المالية');
    body = await mainText(emp.page);
    ok('الموظف يُمنع من شاشة التقارير', body.includes('لا تملك صلاحية'), body.slice(0, 150));

    await openScreen(emp.page, 'إدارة المستخدمين والصلاحيات');
    body = await mainText(emp.page);
    ok('الموظف يُمنع من إدارة المستخدمين', body.includes('لا تملك صلاحية'), body.slice(0, 150));

    // ══════════════ 4) تطابق الخادم مع الواجهة (لا تجاوز بالـ API) ══════════════
    console.log('\n— الخادم يرفض ما رفضته الواجهة —');
    const empToken = await emp.page.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    const statuses: Record<string, number> = {};
    const call = async (key: string, url: string, init: RequestInit = {}) => {
      const r = await fetch(`${BASE}${url}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empToken}`, ...(init.headers || {}) },
      });
      statuses[key] = r.status;
    };
    await call('addCustomer', '/api/customers', { method: 'POST', body: JSON.stringify({ name: 'عميل ممنوع', phone: '01099999999', address: 'x' }) });
    await call('reports', '/api/reports/summary');
    await call('backup', '/api/backups/create', { method: 'POST', body: JSON.stringify({}) });
    await call('users', '/api/accounts');
    await call('reset', '/api/data/reset', { method: 'POST', body: JSON.stringify({ confirm: true }) });

    ok('الخادم يرفض إضافة عميل للموظف المقيّد', statuses.addCustomer === 403, String(statuses.addCustomer));
    ok('الخادم يرفض التقارير للموظف المقيّد', statuses.reports === 403, String(statuses.reports));
    ok('الخادم يرفض النسخ الاحتياطي', statuses.backup === 403, String(statuses.backup));
    ok('الخادم يرفض قائمة المستخدمين', statuses.users === 403, String(statuses.users));
    ok('الخادم يرفض تصفير البيانات', statuses.reset === 403, String(statuses.reset));

    // المدير: ينجح فيما يملك، ويُرفض فيما لا يملك
    const mgrToken = await mgr.page.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    const mgrStatus: Record<string, number> = {};
    const mcall = async (key: string, url: string, init: RequestInit = {}) => {
      const r = await fetch(`${BASE}${url}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mgrToken}`, ...(init.headers || {}) },
      });
      mgrStatus[key] = r.status;
    };
    await mcall('reports', '/api/reports/summary');
    await mcall('backup', '/api/backups/create', { method: 'POST', body: JSON.stringify({}) });
    await mcall('users', '/api/accounts');
    ok('المدير يصل للتقارير عبر الخادم', mgrStatus.reports === 200, String(mgrStatus.reports));
    ok('المدير يُرفض في النسخ الاحتياطي', mgrStatus.backup === 403, String(mgrStatus.backup));
    ok('المدير يصل لقائمة المستخدمين', mgrStatus.users === 200, String(mgrStatus.users));

    console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
    process.exitCode = fail === 0 ? 0 : 1;
  } catch (err) {
    console.error('فشل الاختبار:', err);
    console.error(logs.join('').split('\n').slice(-15).join('\n'));
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
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
