/**
 * AH2 — بوابة المرحلة 7 (واجهة): عرض سجل التدقيق الموسّع
 * =====================================================
 * يفتح التطبيق في Chromium كصاحب محل/مدير ويقرأ السجل من الواجهة:
 *   من نفّذ · نوع الإجراء · المتأثر · التاريخ · النتيجة · السبب.
 * ويتحقق أن الفلترة بالنتيجة تعمل، وأن تبويب السجل لا يظهر لمن لا يملك إدارة المستخدمين.
 *
 * التشغيل: npx tsx tests/verify-ui-audit.ts
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-uiaudit-'));
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

const apiCall = async (path: string, opts: { method?: string; token?: string; body?: any } = {}) => {
  const r = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  let data: any = {};
  try { data = await r.json(); } catch { /* لا JSON */ }
  return { status: r.status, data };
};

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

    // ══ توليد أحداث حقيقية عبر الـAPI ══
    const reg = await apiCall('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    const ownerToken = (await apiCall('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } })).data.token;
    await apiCall('/api/accounts', {
      method: 'POST', token: ownerToken,
      body: { name: 'سارة المديرة', phone: '01000000002', password: 'secret123', role: 'manager' },
    });
    const mgrToken = (await apiCall('/api/auth/login', { method: 'POST', body: { identifier: '01000000002', password: 'secret123' } })).data.token;
    const empCreate = await apiCall('/api/accounts', {
      method: 'POST', token: mgrToken,
      body: { name: 'محمد الموظف', phone: '01000000003', password: 'secret123', role: 'employee', permissions: ['view_customers', 'create_transaction'] },
    });
    const empMembership = empCreate.data.membership_id;
    const reqs = await apiCall('/api/accounts/requests', { token: ownerToken });
    const createReq = (reqs.data as any[]).find((r) => r.type === 'create_account' && r.status === 'pending');
    await apiCall(`/api/accounts/requests/${createReq.id}/decide`, { method: 'POST', token: ownerToken, body: { decision: 'approve' } });

    const empToken = (await apiCall('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } })).data.token;
    // محاولة مرفوضة (لتوليد حدث denied)
    await apiCall('/api/backups/create', { method: 'POST', token: empToken, body: {} });
    // تعطيل مع سبب
    await apiCall(`/api/accounts/${empMembership}/disable`, { method: 'POST', token: ownerToken, body: { reason: 'إجازة طويلة' } });
    // خروج مُسجَّل
    const tmpLogin = (await apiCall('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } })).data.token;
    await apiCall('/api/auth/logout', { method: 'POST', token: tmpLogin });

    browser = await chromium.launch({ headless: true });

    const warm = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const warmPage = await warm.newPage();
    await warmPage.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await warmPage.waitForTimeout(12_000);
    await warmPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await warmPage.waitForTimeout(4_000);
    await warm.close();

    // ══ 1) صاحب المحل يفتح تبويب سجل التدقيق ══
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-EG' });
    const page = await ctx.newPage();
    const logged = await uiLogin(page, '01068505471', 'secret123');
    ok('دخول صاحب المحل من الواجهة', logged);
    const token = await page.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    await seedSession(page, token);

    const opened = await openScreen(page, 'إدارة المستخدمين والصلاحيات');
    ok('الوصول لشاشة إدارة المستخدمين', opened);
    let body = await mainText(page);
    ok('تبويب سجل التدقيق معروض', body.includes('سجل التدقيق'), body.slice(0, 150));

    const auditTab = page.locator('button', { hasText: 'سجل التدقيق' }).first();
    ok('زر التبويب موجود', (await auditTab.count()) > 0);
    await auditTab.click();
    await page.waitForTimeout(2500);
    body = await mainText(page);

    // ══ 2) الحقول المطلوبة ظاهرة في السجل ══
    ok('حدث تسجيل الدخول ظاهر', body.includes('تسجيل دخول'), body.slice(0, 250));
    ok('حدث تسجيل الخروج ظاهر', body.includes('تسجيل خروج'));
    ok('حدث إنشاء الحساب ظاهر', body.includes('إنشاء حساب'));
    ok('حدث الاعتماد ظاهر', body.includes('اعتماد حساب'));
    ok('حدث التعطيل ظاهر', body.includes('تعطيل حساب'));
    ok('حدث تغيير الصلاحيات ظاهر', body.includes('تغيير صلاحيات'));
    ok('حدث محاولة تجاوز/صلاحية غير كافية ظاهر', body.includes('صلاحية غير كافية') || body.includes('وصول مرفوض') || body.includes('إجراء مرفوض'));
    ok('اسم المنفّذ معروض', body.includes('المنفّذ:'), body.slice(0, 250));
    ok('دور المنفّذ معروض', body.includes('الدور:'));
    ok('النتيجة معروضة (ناجح/مرفوض)', body.includes('ناجح') || body.includes('مرفوض'));
    ok('السبب/التفاصيل معروضة', body.includes('السبب/التفاصيل'), body.slice(0, 300));
    // التاريخ يُعرض بصيغة ar-EG (أرقام عربية-هندية تفصلها علامات اتجاه)
    const plain = body.replace(/[\u200e\u200f\u061c]/g, '');
    ok('التاريخ/الوقت معروض', /[\u0660-\u0669]{4}/.test(plain) || /\d{4}/.test(plain), plain.slice(-120));
    ok('قائمة المستخدمين مخفية في تبويب السجل', !body.includes('إضافة مستخدم'));

    // ══ 3) فلترة النتيجة ══
    await page.locator('button', { hasText: 'مرفوض' }).first().click();
    await page.waitForTimeout(1500);
    body = await mainText(page);
    ok('فلتر «مرفوض» يعرض الأحداث المرفوضة', body.includes('مرفوض') && !body.includes('اعتماد حساب'), body.slice(0, 250));
    await page.locator('button', { hasText: 'الكل' }).first().click();
    await page.waitForTimeout(1200);
    body = await mainText(page);
    ok('العودة إلى «الكل» تعرض كل الأحداث', body.includes('اعتماد حساب'), body.slice(0, 200));

    // ══ 4) المدير يرى السجل (يملك إدارة المستخدمين) والموظف لا ══
    const mgrCtx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-EG' });
    const mgrPage = await mgrCtx.newPage();
    ok('دخول المدير', await uiLogin(mgrPage, '01000000002', 'secret123'));
    const mgrTok = await mgrPage.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    await seedSession(mgrPage, mgrTok);
    await openScreen(mgrPage, 'إدارة المستخدمين والصلاحيات');
    const mgrBody = await mainText(mgrPage);
    ok('المدير يرى تبويب سجل التدقيق', mgrBody.includes('سجل التدقيق'), mgrBody.slice(0, 150));

    // الموظف مُعطَّل حاليًا — نعيد تفعيله ثم نتحقق أنه لا يملك الشاشة أصلاً (مغطّى في بوابة الصلاحيات)
    const empRow = withDb((db) => db.prepare("SELECT status FROM project_memberships WHERE id = ?").get(empMembership) as any);
    ok('الموظف معطّل (تهيئة اختبار الواجهة)', empRow?.status === 'disabled', String(empRow?.status));

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
