/**
 * AH2 — بوابة المحدودية #3 (واجهة): حساب واحد في أكثر من محل
 * =========================================================
 * يفتح التطبيق في Chromium ويتحقق من:
 *  - شاشة اختيار المحل عند الدخول بحساب له أكثر من عضوية.
 *  - دخول المحل المختار ورؤية بياناته فقط.
 *  - بطاقة «محلاتي» في الإعدادات والتبديل بين المحلات من الواجهة.
 *
 * التشغيل: npx tsx tests/verify-ui-multi-shop.ts
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-uimultishop-'));
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


/** يحوّل الأرقام العربية-الهندية إلى لاتينية لتسهيل المطابقة */
function toLatinDigits(text: string): string {
  return text.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
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
  }, 540_000);
  watchdog.unref?.();

  console.log(`مجلد الاختبار المؤقت: ${TMP}\n`);
  prepareWorkspace();

  let browser: Browser | null = null;

  try {
    await startServer();

    // محلان + موظف عضو في الاثنين
    const A = await apiCall('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    const B = await apiCall('/api/auth/register', {
      method: 'POST',
      body: { name: 'سامي', projectName: 'محل سامي', phone: '01000000001', password: 'secret123', confirmPassword: 'secret123' },
    });
    const ownerA = (await apiCall('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } })).data.token;
    const ownerB = (await apiCall('/api/auth/login', { method: 'POST', body: { identifier: '01000000001', password: 'secret123' } })).data.token;

    await apiCall('/api/customers', { method: 'POST', token: ownerA, body: { name: 'عميل عادل', phone: '01110000001', type: 'individual' } });
    await apiCall('/api/customers', { method: 'POST', token: ownerB, body: { name: 'عميل سامي', phone: '01110000002', type: 'individual' } });

    await apiCall('/api/accounts', {
      method: 'POST', token: ownerA,
      body: { name: 'محمد الموظف', phone: '01000000003', password: 'secret123', role: 'employee', permissions: ['view_customers', 'view_all_transactions', 'view_reports'] },
    });
    const addB = await apiCall('/api/accounts', {
      method: 'POST', token: ownerB,
      body: { name: 'محمد الموظف', phone: '01000000003', role: 'employee', permissions: ['view_customers', 'view_all_transactions', 'view_reports'] },
    });
    ok('تهيئة: عضو في محلين', addB.status === 201 && addB.data?.existing_account === true, JSON.stringify(addB.data).slice(0, 120));

    browser = await chromium.launch({ headless: true });
    const warm = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const warmPage = await warm.newPage();
    await warmPage.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await warmPage.waitForTimeout(12_000);
    await warmPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await warmPage.waitForTimeout(4_000);
    await warm.close();

    // ══ 1) الدخول يعرض شاشة اختيار المحل ══
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-EG' });
    const page = await ctx.newPage();

    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const inputs = page.locator('input');
    await inputs.nth(0).fill('01000000003');
    await page.locator('input[type="password"]').first().fill('secret123');
    await page.locator('button', { hasText: /دخول/ }).last().click();
    await page.waitForTimeout(3000);

    let body = await mainText(page);
    ok('شاشة اختيار المحل ظهرت', body.includes('اختر المحل'), body.slice(0, 250));
    ok('المحل الأول معروض', body.includes('محل عادل'), body.slice(0, 250));
    ok('المحل الثاني معروض', body.includes('محل سامي'), body.slice(0, 250));
    ok('لا تُصدر جلسة قبل الاختيار', !(await page.evaluate(() => localStorage.getItem('ah2_auth_token'))));

    // ══ 2) اختيار محل عادل ══
    await page.locator('button', { hasText: 'محل عادل' }).first().click();
    await page.waitForTimeout(4000);
    const token = await page.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    ok('بعد الاختيار تُصدر جلسة', token.length > 20, `len=${token.length}`);

    await seedSession(page, token);
    const nav1 = await openScreen(page, 'العملاء وإدارة الحسابات');
    ok('الوصول لشاشة العملاء', nav1);
    await page.waitForTimeout(4000);
    body = await mainText(page);
    ok('يرى عميل المحل المختار فقط', body.includes('عميل عادل') && !body.includes('عميل سامي'), body.slice(0, 250));

    // ══ 3) بطاقة محلاتي في الإعدادات + التبديل ══
    await openScreen(page, 'الإعدادات العامة');
    await page.waitForTimeout(2500);
    body = await mainText(page);
    ok('بطاقة «محلاتي» ظاهرة', body.includes('محلاتي'), body.slice(0, 250));
    ok('يظهر المحلان في القائمة', body.includes('محل عادل') && body.includes('محل سامي'), body.slice(0, 300));
    ok('يُشار إلى المحل الحالي', body.includes('الحالي'), body.slice(0, 300));

    const switchBtn = page.locator('button', { hasText: 'تبديل' }).first();
    ok('زر التبديل موجود', (await switchBtn.count()) > 0);
    await switchBtn.click();
    await page.waitForTimeout(4500);

    const newToken = await page.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    ok('التبديل أصدر جلسة جديدة', !!newToken && newToken !== token, `changed=${newToken !== token}`);

    await openScreen(page, 'العملاء وإدارة الحسابات');
    await page.waitForTimeout(4000);
    body = await mainText(page);
    ok('بعد التبديل يرى عميل المحل الآخر', body.includes('عميل سامي'), body.slice(0, 250));
    ok('ولا يرى عميل المحل الأول', !body.includes('عميل عادل'), body.slice(0, 250));

    // ══ 4) صاحب المحل: لا يظهر له زر مغادرة لمحله ══
    const ownerCtx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-EG' });
    const ownerPage = await ownerCtx.newPage();
    ok('دخول صاحب المحل', await uiLogin(ownerPage, '01068505471', 'secret123'));
    const ownerTok = await ownerPage.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    await seedSession(ownerPage, ownerTok);
    await openScreen(ownerPage, 'الإعدادات العامة');
    await ownerPage.waitForTimeout(2500);
    const ownerBody = await mainText(ownerPage);
    ok('صاحب المحل يرى بطاقة محلاتي', ownerBody.includes('محلاتي'), ownerBody.slice(0, 200));
    const leaveButtons = ownerPage.locator('button', { hasText: 'مغادرة' });
    ok('لا يظهر زر مغادرة لمحله', (await leaveButtons.count()) === 0, String(await leaveButtons.count()));

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
