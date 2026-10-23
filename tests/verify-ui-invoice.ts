/**
 * AH2 — بوابة الفواتير وكشف الحساب (PDF + صورة) على البيانات الحقيقية
 * ================================================================
 * تُشغَّل على نسخة قاعدة بيانات الإنتاج الفعلية (tests/fixtures/…) وتتحقق أن:
 *  - كشف حساب العميل الحقيقي يفتح من الواجهة ويعرض رصيده وعملياته كما هي في القاعدة.
 *  - توليد ملف PDF وتحميله يعمل فعليًا (ملف حقيقي بحجم > 0).
 *  - توليد صورة PNG وتحميلها يعمل فعليًا.
 *  - لا أخطاء JavaScript أثناء التوليد (html2canvas/jspdf).
 *
 * التشغيل: npx tsx tests/verify-ui-invoice.ts
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-uiinvoice-'));
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

  // قاعدة الإنتاج الحقيقية بدل قاعدة فارغة
  const FIXTURE = path.join(REPO_ROOT, 'tests', 'fixtures', 'real-dataset-pre-usermgmt.db');
  fs.copyFileSync(FIXTURE, DB_FILE);

  let browser: Browser | null = null;

  try {
    // جلسة صاحب المحل الحقيقي (عادل — محل Abha)
    const TOKEN = 'ah2-invoice-gate-token-0123456789';
    withDb((db) => {
      db.prepare('INSERT INTO auth_tokens (token, user_id, project_id, expires_at) VALUES (?, ?, ?, ?)')
        .run(TOKEN, '8b3c1abc-62e2-4ba6-9f99-4a4151610725', '8a6b2a80-062b-4aab-b091-08eb62e7e1aa', Date.now() + 3_600_000);
    });

    await startServer();
    ok('الخادم يعمل على بيانات الإنتاج', true);

    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 420, height: 900 },
      locale: 'ar-EG',
      acceptDownloads: true,
    });
    const page = await ctx.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await seedSession(page, TOKEN);

    // ══ 1) شاشة العملاء الحقيقية ══
    console.log('\n— 1) عملاء الإنتاج —');
    const opened = await openScreen(page, 'العملاء وإدارة الحسابات');
    ok('الوصول لشاشة العملاء', opened);
    await page.waitForTimeout(4000);
    let body = await toLatinDigits(await mainText(page));
    ok('عميل الإنتاج (Gfdfhh) ظاهر', body.includes('Gfdfhh'), body.slice(0, 200));
    ok('عميل الإنتاج (Ahmed) ظاهر', body.includes('Ahmed'), body.slice(0, 200));

    // ══ 2) كشف حساب العميل ══
    console.log('\n— 2) كشف الحساب —');
    await page.locator('text=Gfdfhh').first().click();
    await page.waitForTimeout(3000);
    body = await toLatinDigits(await mainText(page));
    ok('شاشة بيانات العميل ظهرت', body.includes('بيانات العميل'), body.slice(0, 200));
    // الرصيد الحقيقي لعميل Gfdfhh = 580 - 558.6 = 21.4 (يُعرض بفواصل عربية أحيانًا)
    const normalized = body.replace(/[\u066B\u066C,\u060C]/g, '.');
    ok('الرصيد الحقيقي (21.4) معروض في كشف الحساب', /21[.\s]?4/.test(normalized), normalized.slice(0, 400));

    // ══ 3) نافذة المشاركة/الفاتورة ══
    console.log('\n— 3) نافذة الفاتورة —');
    const shareBtn = page.locator('button', { hasText: 'مشاركة كشف الحساب' }).first();
    ok('زر المشاركة موجود', (await shareBtn.count()) > 0);
    await shareBtn.click();
    await page.waitForTimeout(2500);
    body = await toLatinDigits(await mainText(page));
    ok('نافذة المشاركة فُتحت', body.includes('ماذا تريد أن ترسل'), body.slice(0, 200));

    // العمليات الكاملة داخل الكشف
    const fullScope = page.locator('button', { hasText: 'إجمالي الحساب والعمليات' }).first();
    if (await fullScope.count()) {
      await fullScope.click();
      await page.waitForTimeout(1500);
    }

    // ══ 4) توليد PDF وتحميله ══
    console.log('\n— 4) توليد PDF —');
    const pdfFormat = page.locator('button', { hasText: /^PDF$/ }).first();
    if (await pdfFormat.count()) {
      await pdfFormat.click();
      await page.waitForTimeout(800);
    }
    const pdfBtn = page.locator('button', { hasText: 'حفظ ملف PDF' }).first();
    ok('زر حفظ PDF ظاهر', (await pdfBtn.count()) > 0);
    const pdfDownload = page.waitForEvent('download', { timeout: 90_000 }).catch(() => null);
    await pdfBtn.click();
    const pdfFile = await pdfDownload;
    ok('تم إنشاء ملف PDF وتنزيله', !!pdfFile, pdfFile ? String(pdfFile.suggestedFilename()) : 'no download');
    if (pdfFile) {
      const p = await pdfFile.path();
      const buf = p ? fs.readFileSync(p) : Buffer.alloc(0);
      ok('ملف PDF ليس فارغًا', buf.length > 1000, `${buf.length} bytes`);
      ok('المحتوى ملف PDF حقيقي (بصمة %PDF)', buf.subarray(0, 4).toString('latin1') === '%PDF',
        buf.subarray(0, 8).toString('latin1'));
      // ملاحظة: Chromium بلا واجهة يقترح الاسم «download» رغم ضبط `download` attribute،
      // لذا نتحقق من المحتوى (بصمة %PDF) لا من الاسم.
      console.log(`     (اسم التنزيل المقترح من المتصفح: ${pdfFile.suggestedFilename()})`);
    }
    await page.waitForTimeout(1500);
    body = await toLatinDigits(await mainText(page));
    ok('لا رسالة خطأ عند توليد PDF', !body.includes('تعذر'), body.slice(0, 300));

    // ══ 5) توليد صورة PNG وتحميلها ══
    console.log('\n— 5) توليد صورة —');
    const imgFormat = page.locator('button', { hasText: 'صورة' }).first();
    ok('خيار الصورة موجود', (await imgFormat.count()) > 0);
    if (await imgFormat.count()) {
      await imgFormat.click();
      await page.waitForTimeout(1200);
    }
    const imgBtn = page.locator('button', { hasText: 'حفظ الصورة' }).first();
    ok('زر حفظ الصورة ظاهر', (await imgBtn.count()) > 0);
    const imgDownload = page.waitForEvent('download', { timeout: 90_000 }).catch(() => null);
    await imgBtn.click();
    const imgFile = await imgDownload;
    ok('تم إنشاء الصورة وتنزيلها', !!imgFile, imgFile ? String(imgFile.suggestedFilename()) : 'no download');
    if (imgFile) {
      const p = await imgFile.path();
      const buf = p ? fs.readFileSync(p) : Buffer.alloc(0);
      ok('الصورة ليست فارغة', buf.length > 1000, `${buf.length} bytes`);
      ok('المحتوى صورة PNG حقيقية (بصمة PNG)',
        buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        buf.subarray(0, 8).toString('hex'));
    }

    // ══ 6) لا أخطاء في المتصفح ══
    console.log('\n— 6) سلامة التشغيل —');
    const fatal = pageErrors.filter((e) => !/ResizeObserver|NotAllowedError|AbortError/.test(e));
    ok('لا أخطاء JavaScript أثناء الفاتورة', fatal.length === 0, fatal.slice(0, 2).join(' | '));

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
