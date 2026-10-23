/**
 * AH2 — بوابة المحدودية #3: حساب واحد في أكثر من محل
 * ===================================================
 * يتحقق فعليًا عبر HTTP أن:
 *  - المستخدم نفسه (نفس الهاتف/الحساب) يمكن أن يكون عضوًا في محلين مختلفين.
 *  - الدخول يطلب اختيار المحل عند تعدد العضويات النشطة، ثم يصدر جلسة للمحل المختار فقط.
 *  - كل جلسة ترى بيانات محلها فقط (عزل كامل بين المحلين).
 *  - تبديل المحل يصدر جلسة جديدة مربوطة بالمحل الآخر.
 *  - المستخدم يستطيع مغادرة محل ليس صاحبه، فتُلغى جلساته فيه فقط.
 *  - لا تكرار للعضوية نفسها (409)، ولا إمكانية مغادرة محل يملكه.

 * التشغيل: npx tsx tests/verify-multi-shop.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-multishop-'));
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

    // ══ محلان لمالكين مختلفين ══
    const shopA = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    const shopB = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'سامي', projectName: 'محل سامي', phone: '01000000001', password: 'secret123', confirmPassword: 'secret123' },
    });
    ok('تهيئة: محلان مستقلان', shopA.status === 201 && shopB.status === 201, `${shopA.status}/${shopB.status}`);
    const projectA = shopA.data.project.id;
    const projectB = shopB.data.project.id;

    const ownerA = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } })).data.token;
    const ownerB = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000001', password: 'secret123' } })).data.token;
    ok('تهيئة: دخول المالكين', !!ownerA && !!ownerB);

    // عملاء مختلفون في كل محل
    await api('/api/customers', { method: 'POST', token: ownerA, body: { name: 'عميل المحل أ', phone: '01110000001', type: 'individual' } });
    await api('/api/customers', { method: 'POST', token: ownerB, body: { name: 'عميل المحل ب', phone: '01110000002', type: 'individual' } });

    // ══ 1) صاحب المحل (أ) يضيف شخصًا جديدًا، ثم صاحب (ب) يضيف نفس الشخص ══
    console.log('\n— إضافة نفس الشخص إلى محلين —');
    const empInA = await api('/api/accounts', {
      method: 'POST', token: ownerA,
      body: { name: 'محمد الموظف', phone: '01000000003', password: 'secret123', role: 'employee', permissions: ['view_customers', 'view_all_transactions'] },
    });
    ok('إضافة الموظف إلى المحل (أ)', empInA.status === 201, JSON.stringify(empInA.data).slice(0, 140));

    // موظف يُضاف إلى المحل (ب) — نفس رقم الهاتف (حساب موجود)
    const empInB = await api('/api/accounts', {
      method: 'POST', token: ownerB,
      body: { name: 'محمد الموظف', phone: '01000000003', role: 'employee', permissions: ['view_customers'] },
    });
    ok('نفس الحساب يُضاف إلى المحل (ب) بدون كلمة مرور جديدة', empInB.status === 201, JSON.stringify(empInB.data).slice(0, 140));
    ok('الرد يوضّح أنه حساب موجود', empInB.data?.existing_account === true, String(empInB.data?.existing_account));
    ok('العضوية الثانية نشطة (أنشأها صاحب المحل)', empInB.data?.account_status === 'active', String(empInB.data?.account_status));

    const dupInB = await api('/api/accounts', {
      method: 'POST', token: ownerB,
      body: { name: 'محمد الموظف', phone: '01000000003', role: 'employee', permissions: ['view_customers'] },
    });
    ok('إضافة نفس الشخص مرتين للمحل نفسه مرفوضة (409)', dupInB.status === 409, String(dupInB.status));

    // ══ 2) الدخول يطلب اختيار المحل ══
    console.log('\n— اختيار المحل عند الدخول —');
    const ambiguous = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('الدخول يطلب اختيار المحل', ambiguous.status === 200 && ambiguous.data?.requires_project_selection === true, JSON.stringify(ambiguous.data).slice(0, 160));
    ok('لا تُصدر جلسة قبل الاختيار', !ambiguous.data?.token, String(ambiguous.data?.token));
    ok('كل المحلات معروضة (2)', (ambiguous.data?.projects ?? []).length === 2, JSON.stringify(ambiguous.data?.projects));

    // اختيار المحل أ
    const loginA = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123', projectId: projectA } });
    ok('اختيار المحل (أ) يصدر جلسة', loginA.status === 200 && !!loginA.data?.token, String(loginA.status));
    ok('الجلسة مربوطة بالمحل (أ)', loginA.data?.project?.id === projectA, String(loginA.data?.project?.id));

    // ══ 3) عزل البيانات بين الجلستين ══
    console.log('\n— عزل البيانات بين المحلين —');
    const custA = await api('/api/customers', { token: loginA.data.token });
    ok('جلسة (أ) ترى عميل المحل (أ) فقط', (custA.data as any[]).length === 1 && (custA.data as any[])[0].name === 'عميل المحل أ', JSON.stringify((custA.data as any[]).map((c: any) => c.name)));

    const loginB = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123', projectId: projectB } });
    ok('اختيار المحل (ب) يصدر جلسة', loginB.status === 200 && !!loginB.data?.token, String(loginB.status));
    const custB = await api('/api/customers', { token: loginB.data.token });
    ok('جلسة (ب) ترى عميل المحل (ب) فقط', (custB.data as any[]).length === 1 && (custB.data as any[])[0].name === 'عميل المحل ب', JSON.stringify((custB.data as any[]).map((c: any) => c.name)));

    // ══ 4) محلاتي + التبديل ══
    console.log('\n— محلاتي والتبديل —');
    const mine = await api('/api/auth/my-projects', { token: loginA.data.token });
    ok('قائمة محلاتي تعرض المحلين', mine.status === 200 && (mine.data?.projects ?? []).length === 2, String((mine.data?.projects ?? []).length));
    ok('يُشار للمحل الحالي', mine.data?.current_project_id === projectA, String(mine.data?.current_project_id));

    const switchRes = await api('/api/auth/switch-project', { method: 'POST', token: loginA.data.token, body: { projectId: projectB } });
    ok('التبديل إلى المحل (ب) يعمل', switchRes.status === 200 && !!switchRes.data?.token, JSON.stringify(switchRes.data).slice(0, 140));
    const custAfterSwitch = await api('/api/customers', { token: switchRes.data.token });
    ok('الجلسة الجديدة ترى بيانات المحل (ب)', (custAfterSwitch.data as any[]).length === 1 && (custAfterSwitch.data as any[])[0].name === 'عميل المحل ب', JSON.stringify((custAfterSwitch.data as any[]).map((c: any) => c.name)));
    ok('الصلاحيات تُعاد حسابها للمحل الجديد', Array.isArray(switchRes.data?.permissions), JSON.stringify(switchRes.data?.permissions));
    const badSwitch = await api('/api/auth/switch-project', { method: 'POST', token: loginA.data.token, body: { projectId: 'not-a-project' } });
    ok('التبديل لمحل لا يملكه مرفوض (403)', badSwitch.status === 403, String(badSwitch.status));

    // ══ 5) المغادرة ══
    console.log('\n— مغادرة محل —');
    const leave = await api('/api/auth/leave-project', { method: 'POST', token: loginB.data.token, body: { reason: 'انتهت الحاجة' } });
    ok('مغادرة المحل (ب) تعمل', leave.status === 200, JSON.stringify(leave.data).slice(0, 140));
    const afterLeave = await api('/api/customers', { token: loginB.data.token });
    ok('جلسة المحل (ب) مُبطَلة بعد المغادرة (401/403)', afterLeave.status === 401 || afterLeave.status === 403, String(afterLeave.status));

    const stillA = await api('/api/customers', { token: loginA.data.token });
    ok('جلسة المحل (أ) ما زالت تعمل', stillA.status === 200, String(stillA.status));

    const loginAfterLeave = await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } });
    ok('بعد المغادرة: عضوية واحدة ⇒ دخول مباشر بلا اختيار', loginAfterLeave.status === 200 && loginAfterLeave.data?.project?.id === projectA, JSON.stringify(loginAfterLeave.data?.project));

    const ownerLeave = await api('/api/auth/leave-project', { method: 'POST', token: ownerA, body: {} });
    ok('صاحب المحل لا يغادر محله (400)', ownerLeave.status === 400, String(ownerLeave.status));

    // ══ 6) أثر المغادرة على صاحب المحل (ب) ══
    console.log('\n— أثر المغادرة على المحل —');
    const membersB = await api('/api/accounts', { token: ownerB });
    const leftRow = (membersB.data as any[]).find((r) => r.phone === '01000000003');
    ok('صاحب المحل (ب) يرى الحالة «غادر المحل»', leftRow?.status === 'left', String(leftRow?.status));
    const custBAfter = await api('/api/customers', { token: ownerB });
    ok('بيانات المحل (ب) سليمة بعد المغادرة', (custBAfter.data as any[]).length === 1, String((custBAfter.data as any[]).length));

    // ══ 7) سجل التدقيق ══
    console.log('\n— سجل التدقيق —');
    const switchLog = withDb((db) => db.prepare("SELECT * FROM activity_logs WHERE action_type = 'SWITCH_PROJECT'").all() as any[]);
    ok('حدث تبديل المحل مسجّل', switchLog.length === 1, String(switchLog.length));
    const leaveLog = withDb((db) => db.prepare("SELECT * FROM activity_logs WHERE action_type = 'LEAVE_PROJECT'").all() as any[]);
    ok('حدث مغادرة المحل مسجّل', leaveLog.length === 1, String(leaveLog.length));
    const linkLog = withDb((db) => db.prepare("SELECT * FROM activity_logs WHERE action_type = 'LINK_EXISTING_ACCOUNT'").all() as any[]);
    ok('حدث ربط حساب موجود مسجّل', linkLog.length === 1, String(linkLog.length));

    // ══ 8) لا كشف لبيانات المحل الآخر ══
    console.log('\n— منع الوصول المتقاطع —');
    const crossCustomer = await api(`/api/customers?projectId=${projectB}`, { token: loginA.data.token });
    const crossList = (crossCustomer.data as any[]) ?? [];
    ok('طلب بيانات المحل (ب) بجلسة (أ) لا يعيد شيئًا', crossList.every((c: any) => c.name === 'عميل المحل أ'), JSON.stringify(crossList.map((c: any) => c.name)));

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
