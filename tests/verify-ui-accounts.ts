/**
 * AH2 — بوابة المرحلة 5: واجهة إدارة المستخدمين (اختبار متصفح حقيقي)
 * ====================================================================
 * يشغّل التطبيق فعليًا في Chromium ويتفاعل معه كالمستخدم:
 *  - دخول صاحب المحل → شاشة إدارة المستخدمين (36) → إضافة مستخدم (37)
 *  - دخول المدير → إنشاء موظف → يبقى معلقًا → صاحب المحل يوافق من الطلبات (38)
 *  - تأكيد مزدوج قبل التعطيل، ومنع الموظف من الوصول للشاشات الإدارية
 *
 * التشغيل: npx tsx tests/verify-ui-accounts.ts
 * (يتطلب: node_modules/playwright-core + متصفح chromium مثبّت)
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-ui-'));
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
async function openScreen(page: Page, query: string): Promise<boolean> {
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
  const item = page.locator('button', { hasText: query }).first();
  if (!(await item.count())) return false;
  await item.click();
  await page.waitForTimeout(2000);
  return true;
}

async function main() {
  const watchdog = setTimeout(() => {
    console.error('\n❌ تجاوز الوقت المسموح — إيقاف قسري');
    killTree(child);
    process.exit(1);
  }, 420_000);
  watchdog.unref?.();

  console.log(`مجلد الاختبار المؤقت: ${TMP}\n`);
  prepareWorkspace();

  let browser: Browser | null = null;

  try {
    await startServer();

    // ══ تهيئة: محل + مالك + مدير (عبر API) ══
    const reg = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' }),
    }).then((r) => r.json());
    const projectId = reg.project.id;

    await stopServer();
    withDb((db) => {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO users (id,name,phone,email,password_hash,role,created_at) VALUES (?,?,?,NULL,?,?,?)`)
        .run('u-mgr', 'سارة المديرة', '01000000002', hash('secret123'), 'manager', now);
      db.prepare(
        `INSERT INTO project_memberships (id,project_id,user_id,role,status,permissions,created_at,proposed_permissions)
         VALUES (?,?,?,?,?,?,?,?)`
      ).run(
        'm-mgr', projectId, 'u-mgr', 'manager', 'active',
        JSON.stringify(['view_customers', 'add_customer', 'edit_customer', 'create_transaction', 'view_customer_transactions',
          'cancel_transaction', 'view_balances', 'view_all_transactions', 'view_reports', 'share_invoices',
          'manage_users', 'create_employees', 'request_disable_account', 'request_delete_account', 'request_enable_account']),
        now, JSON.stringify([])
      );
    });
    await startServer();

    browser = await chromium.launch({ headless: true });

    // تسخين: أول تحميل قد يُعيد Vite تحسين الاعتماديات ويُعيد تحميل الصفحة تلقائيًا
    const warm = await browser.newContext({ viewport: { width: 420, height: 900 } });
    const warmPage = await warm.newPage();
    await warmPage.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await warmPage.waitForTimeout(12_000);
    await warmPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await warmPage.waitForTimeout(4_000);
    await warm.close();

    const context = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-EG' });

    // ══ 1) صاحب المحل: شاشة إدارة المستخدمين ══
    console.log('— صاحب المحل: شاشة إدارة المستخدمين —');
    const ownerPage = await context.newPage();
    const uiLoggedIn = await uiLogin(ownerPage, '01068505471', 'secret123');
    ok('تسجيل الدخول من نموذج الواجهة يعمل', uiLoggedIn);

    const ownerToken = await ownerPage.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    ok('التوكن محفوظ في جلسة المتصفح', ownerToken.length > 20);
    await seedSession(ownerPage, ownerToken);

    // ننتقل للشاشة 36 عبر مبدّل الشاشات، وإلا بالرابط المباشر
    const opened = await openScreen(ownerPage, 'إدارة المستخدمين والصلاحيات');
    ok('مبدّل الشاشات أوصلنا لشاشة 36', opened);
    let body = await ownerPage.locator('body').innerText();
    ok('شاشة إدارة المستخدمين ظهرت', body.includes('إدارة المستخدمين'), body.slice(0, 120));
    ok('تظهر حالة "نشط" للمستخدمين', body.includes('نشط'));
    ok('يظهر نوع الحساب', body.includes('صاحب المحل') || body.includes('مدير المحل'));
    ok('زر إضافة مستخدم ظاهر للمالك', body.includes('إضافة مستخدم'));
    ok('زر الطلبات ظاهر', body.includes('الطلبات'));

    // ══ 2) صاحب المحل ينشئ مديرًا من الواجهة (37) ══
    console.log('\n— إنشاء حساب من الواجهة —');
    const addBtn = ownerPage.locator('button', { hasText: 'إضافة مستخدم' }).first();
    await addBtn.click();
    await ownerPage.waitForTimeout(1200);
    body = await ownerPage.locator('body').innerText();
    ok('شاشة إضافة مستخدم ظهرت', body.includes('إضافة مستخدم جديد'), body.slice(0, 150));

    const inputs = ownerPage.locator('input');
    await inputs.nth(0).fill('خالد المدير');
    await inputs.nth(1).fill('01000000005');
    await inputs.nth(3).fill('secret123');
    await ownerPage.locator('button', { hasText: 'مدير محل' }).first().click();
    await ownerPage.waitForTimeout(400);
    await ownerPage.locator('button', { hasText: /إنشاء وتفعيل الحساب|إنشاء وإرسال للاعتماد/ }).first().click();
    await ownerPage.waitForTimeout(4000);
    body = await ownerPage.locator('body').innerText();
    ok('تأكيد إنشاء الحساب ظهر', body.includes('تم إنشاء الحساب') || body.includes('تم إنشاء الحساب وتفعيله'), body.slice(0, 200));

    const createdActive = withDb((db) =>
      db.prepare(`SELECT pm.status FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE u.phone='01000000005'`).get() as any
    );
    ok('الحساب الذي أنشأه صاحب المحل = نشط', createdActive?.status === 'active', String(createdActive?.status));

    // ══ 3) المدير ينشئ موظفًا → معلق ══
    console.log('\n— المدير ينشئ موظفًا (يبقى معلقًا) —');
    const mgrContext = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-EG' });
    const mgrPage = await mgrContext.newPage();
    const mgrLoggedIn = await uiLogin(mgrPage, '01000000002', 'secret123');
    ok('دخول المدير من نموذج الواجهة', mgrLoggedIn);
    const mgrToken = await mgrPage.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    await seedSession(mgrPage, mgrToken);

    const mgrNav = await openScreen(mgrPage, 'إضافة مستخدم جديد');
    ok('المدير يصل لشاشة إضافة مستخدم عبر المبدّل', mgrNav);
    body = await mgrPage.locator('body').innerText();
    const managerSeesAddForm = body.includes('إضافة مستخدم جديد');
    ok('المدير يصل لشاشة إضافة مستخدم', managerSeesAddForm, body.slice(0, 150));

    if (managerSeesAddForm) {
      const mInputs = mgrPage.locator('input');
      await mInputs.nth(0).fill('محمد الموظف');
      await mInputs.nth(1).fill('01000000003');
      await mInputs.nth(3).fill('secret123');
      await mgrPage.waitForTimeout(300);
      await mgrPage.locator('button', { hasText: /إنشاء وإرسال للاعتماد/ }).first().click();
      await mgrPage.waitForTimeout(4000);
      body = await mgrPage.locator('body').innerText();
      ok('الواجهة تُعلم المدير بأن الحساب سيُرسل للاعتماد', body.includes('تم إرسال الحساب للاعتماد'), body.slice(0, 200));
      ok('رسالة الانتظار ظاهرة', body.includes('لن يستطيع الدخول حتى يوافق صاحب المحل'));
    }

    const empRow = withDb((db) =>
      db.prepare(`SELECT pm.status FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE u.phone='01000000003'`).get() as any
    );
    ok('حساب الموظف = في انتظار الاعتماد', empRow?.status === 'pending', String(empRow?.status));

    // ══ 4) صاحب المحل يوافق من شاشة الطلبات (38) ══
    console.log('\n— صاحب المحل يعتمد من شاشة الطلبات —');
    const reqNav = await openScreen(ownerPage, 'طلبات إدارة المستخدمين والاعتماد');
    ok('مبدّل الشاشات أوصلنا لشاشة 38', reqNav);
    body = await ownerPage.locator('body').innerText();
    ok('شاشة الطلبات ظهرت', body.includes('طلبات إدارة المستخدمين'), body.slice(0, 150));
    ok('طلب الاعتماد ظاهر لصاحب المحل', body.includes('محمد الموظف'), body.slice(0, 250));
    ok('الصلاحيات المقترحة معروضة', body.includes('الصلاحيات المقترحة'));

    const approveBtn = ownerPage.locator('button', { hasText: 'موافقة' }).first();
    if (await approveBtn.count()) {
      await approveBtn.click();
      await ownerPage.waitForTimeout(2500);
      body = await ownerPage.locator('body').innerText();
      ok('تأكيد الموافقة ظهر', body.includes('تمت الموافقة'), body.slice(0, 200));
    } else {
      ok('تأكيد الموافقة ظهر', false, 'زر الموافقة غير موجود');
    }

    const approvedRow = withDb((db) =>
      db.prepare(`SELECT pm.status, pm.permissions FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE u.phone='01000000003'`).get() as any
    );
    ok('الموظف أصبح نشطًا بعد الموافقة', approvedRow?.status === 'active', String(approvedRow?.status));
    ok('الصلاحيات فُعّلت بعد الاعتماد', JSON.parse(approvedRow?.permissions ?? '[]').length > 0, approvedRow?.permissions);

    // ══ 5) الموظف يدخل الآن، ولا يرى شاشات الإدارة ══
    console.log('\n— الموظف: الدخول بعد الاعتماد ومنع شاشات الإدارة —');
    const empContext = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'ar-EG' });
    const empPage = await empContext.newPage();
    const empLoggedIn = await uiLogin(empPage, '01000000003', 'secret123');
    ok('الموظف يدخل بعد الاعتماد', empLoggedIn);
    const empSessionToken = await empPage.evaluate(() => localStorage.getItem('ah2_auth_token') || '');
    await seedSession(empPage, empSessionToken);

    await openScreen(empPage, 'إدارة المستخدمين والصلاحيات');
    body = await empPage.locator('body').innerText();
    ok('الموظف يرى رسالة منع (لا قائمة مستخدمين)', body.includes('لا تملك صلاحية') || body.includes('غير مصرح'), body.slice(0, 200));
    ok('الموظف لا يرى زر إضافة مستخدم', !body.includes('إضافة مستخدم'));

    // ══ 6) صاحب المحل يعطّل الموظف بتأكيد مزدوج ══
    console.log('\n— تعطيل الحساب من الواجهة (تأكيد مزدوج) —');
    await openScreen(ownerPage, 'إدارة المستخدمين والصلاحيات');
    const empCard = ownerPage.locator('button', { hasText: 'محمد الموظف' }).first();
    ok('بطاقة الموظف ظاهرة', (await empCard.count()) > 0);
    await empCard.click();
    await ownerPage.waitForTimeout(1500);
    body = await ownerPage.locator('body').innerText();
    ok('شرح الفرق بين التعطيل والحذف معروض', body.includes('الفرق بين التعطيل والحذف'));
    ok('بيانات المستخدم معروضة', body.includes('بيانات المستخدم'));
    ok('سجل النشاط معروض', body.includes('سجل النشاط'));

    const disableBtn = ownerPage.locator('button', { hasText: 'تعطيل الحساب (مباشرة)' }).first();
    if (await disableBtn.count()) {
      await disableBtn.click();
      await ownerPage.waitForTimeout(800);
      body = await ownerPage.locator('body').innerText();
      ok('نافذة تأكيد التعطيل ظهرت', body.includes('تأكيد تعطيل الحساب'), body.slice(0, 200));
      await ownerPage.locator('button', { hasText: /^تأكيد$/ }).first().click();
      await ownerPage.waitForTimeout(2500);
      body = await ownerPage.locator('body').innerText();
      ok('تأكيد التعطيل ظهر في الواجهة', body.includes('تم تعطيل الحساب'), body.slice(0, 200));
    } else {
      ok('نافذة تأكيد التعطيل ظهرت', false, 'زر التعطيل غير موجود');
    }

    const disabledRow = withDb((db) =>
      db.prepare(`SELECT pm.status FROM project_memberships pm JOIN users u ON u.id=pm.user_id WHERE u.phone='01000000003'`).get() as any
    );
    ok('الحساب أصبح معطلًا في القاعدة', disabledRow?.status === 'disabled', String(disabledRow?.status));

    // ══ 7) الموظف المعطل يُطرد من الواجهة ══
    console.log('\n— الموظف المعطل يفقد الوصول من الواجهة —');
    await empPage.reload({ waitUntil: 'domcontentloaded' });
    await empPage.waitForTimeout(2500);
    body = await empPage.locator('body').innerText();
    ok('الموظف المعطل يُمنع/يُطرد', body.includes('الحساب غير نشط') || body.includes('حسابك معطل') || body.includes('تسجيل الدخول'), body.slice(0, 200));

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
