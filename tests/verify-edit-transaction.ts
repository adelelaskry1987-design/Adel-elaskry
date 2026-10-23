/**
 * AH2 — بوابة المحدودية #1: تعديل عملية مالية (edit_transaction)
 * ==============================================================
 * يتحقق فعليًا عبر HTTP أن:
 *  - صاحب المحل يعدّل المبلغ/النوع/التاريخ/الوقت/الوصف ويُعاد حساب الرصيد تلقائيًا.
 *  - المدير والموظف ممنوعان (403) — الصلاحية محجوبة على الخادم.
 *  - العملية الملغاة لا تُعدَّل (409).
 *  - المدخلات غير الصالحة تُرفض (400).
 *  - كل تعديل يُسجَّل في سجل التدقيق بالقيم قبل/بعد والسبب.
 *  - بيانات العملاء والعمليات الأخرى لا تتأثر.
 *
 * التشغيل: npx tsx tests/verify-edit-transaction.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ah2-edittx-'));
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

    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'عادل', projectName: 'محل عادل', phone: '01068505471', password: 'secret123', confirmPassword: 'secret123' },
    });
    const owner = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01068505471', password: 'secret123' } })).data.token;
    ok('تهيئة: صاحب المحل', !!owner);

    // مدير وموظف بصلاحياتهما الافتراضية (بلا edit_transaction)
    await api('/api/accounts', { method: 'POST', token: owner, body: { name: 'سارة المديرة', phone: '01000000002', password: 'secret123', role: 'manager' } });
    const mgr = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000002', password: 'secret123' } })).data.token;
    const empCreate = await api('/api/accounts', {
      method: 'POST', token: mgr,
      body: { name: 'محمد الموظف', phone: '01000000003', password: 'secret123', role: 'employee', permissions: ['view_customers', 'view_all_transactions', 'view_balances'] },
    });
    const reqs = await api('/api/accounts/requests', { token: owner });
    const createReq = (reqs.data as any[]).find((r) => r.type === 'create_account' && r.status === 'pending');
    await api(`/api/accounts/requests/${createReq.id}/decide`, { method: 'POST', token: owner, body: { decision: 'approve' } });
    const emp = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01000000003', password: 'secret123' } })).data.token;
    ok('تهيئة: مدير وموظف', !!mgr && !!emp);

    // عميل + عمليتان
    const cust = await api('/api/customers', { method: 'POST', token: owner, body: { name: 'أحمد العميل', phone: '01111111111', type: 'individual' } });
    const customerId = cust.data.id;
    const tx1 = await api('/api/transactions', {
      method: 'POST', token: owner,
      body: { customerId, type: 'payment', amount: 1000, date: '2026-10-01', time: '09:00', description: 'دفعة أولى' },
    });
    const txId = tx1.data.transaction.id;
    await api('/api/transactions', {
      method: 'POST', token: owner,
      body: { customerId, type: 'withdrawal', amount: 200, date: '2026-10-02', time: '10:00', description: 'سحب' },
    });
    const custBefore = await api(`/api/customers/${customerId}`, { token: owner });
    ok('الرصيد قبل التعديل = 800', Number(custBefore.data?.customer?.balance) === 800, String(custBefore.data?.customer?.balance));

    // ══ 1) تعديل المبلغ ══
    console.log('\n— تعديل المبلغ —');
    const edit1 = await api(`/api/transactions/${txId}`, {
      method: 'PUT', token: owner,
      body: { amount: 1500, reason: 'تصحيح مبلغ مُدخل بالخطأ' },
    });
    ok('صاحب المحل يعدّل العملية (200)', edit1.status === 200, JSON.stringify(edit1.data).slice(0, 160));
    ok('المبلغ الجديد مطبّق', Number(edit1.data?.transaction?.amount) === 1500, String(edit1.data?.transaction?.amount));
    const custAfter = await api(`/api/customers/${customerId}`, { token: owner });
    ok('الرصيد أُعيد حسابه تلقائيًا (1300)', Number(custAfter.data?.customer?.balance) === 1300, String(custAfter.data?.customer?.balance));
    ok('عدد العمليات لم يتغيّر', Number(custAfter.data?.customer?.transactions_count) === 2, String(custAfter.data?.customer?.transactions_count));
    ok('التغييرات موضّحة في الرد', Array.isArray(edit1.data?.changes) && edit1.data.changes.some((c: string) => c.includes('amount')), JSON.stringify(edit1.data?.changes));

    // ══ 2) تعديل النوع ══
    console.log('\n— تعديل النوع والتاريخ والوقت والوصف —');
    const edit2 = await api(`/api/transactions/${txId}`, {
      method: 'PUT', token: owner,
      body: { type: 'withdrawal', date: '2026-10-03', time: '11:30', description: 'سحب مُصحَّح' },
    });
    ok('النوع تغيّر إلى سحب (200)', edit2.status === 200 && edit2.data?.transaction?.type === 'withdrawal', JSON.stringify(edit2.data).slice(0, 160));
    ok('التاريخ تغيّر', edit2.data?.transaction?.date === '2026-10-03', String(edit2.data?.transaction?.date));
    ok('الوقت تغيّر', edit2.data?.transaction?.time === '11:30', String(edit2.data?.transaction?.time));
    ok('الوصف تغيّر', edit2.data?.transaction?.description === 'سحب مُصحَّح', String(edit2.data?.transaction?.description));
    const custAfter2 = await api(`/api/customers/${customerId}`, { token: owner });
    ok('الرصيد انعكس بعد تغيير النوع (-1700)', Number(custAfter2.data?.customer?.balance) === -1700, String(custAfter2.data?.customer?.balance));

    // ══ 3) العملية الأخرى لم تتأثر ══
    const allTx = await api(`/api/transactions?customerId=${customerId}`, { token: owner });
    const list = (allTx.data as any[]) ?? [];
    const other = list.find((t) => t.id !== txId);
    ok('العملية الأخرى لم تتأثر', Number(other?.amount) === 200 && other?.status === 'active', JSON.stringify({ a: other?.amount, s: other?.status }));

    // ══ 4) الصلاحية محجوبة على المدير والموظف ══
    console.log('\n— منع المدير والموظف —');
    const mgrEdit = await api(`/api/transactions/${txId}`, { method: 'PUT', token: mgr, body: { amount: 10 } });
    ok('المدير ممنوع من التعديل (403)', mgrEdit.status === 403, String(mgrEdit.status));
    const empEdit = await api(`/api/transactions/${txId}`, { method: 'PUT', token: emp, body: { amount: 10 } });
    ok('الموظف ممنوع من التعديل (403)', empEdit.status === 403, String(empEdit.status));
    const stillSame = await api(`/api/customers/${customerId}`, { token: owner });
    ok('لا أثر لمحاولاتهم على الرصيد', Number(stillSame.data?.customer?.balance) === -1700, String(stillSame.data?.customer?.balance));

    // ══ 5) لا تعديل لبيانات محل آخر ══
    await api('/api/auth/register', { method: 'POST', body: { name: 'تاجر آخر', projectName: 'محل آخر', phone: '01099999999', password: 'secret123', confirmPassword: 'secret123' } });
    const otherToken = (await api('/api/auth/login', { method: 'POST', body: { identifier: '01099999999', password: 'secret123' } })).data.token;
    const crossEdit = await api(`/api/transactions/${txId}`, { method: 'PUT', token: otherToken, body: { amount: 1 } });
    ok('محل آخر لا يعدّل عمليتنا (403/404)', crossEdit.status === 403 || crossEdit.status === 404, String(crossEdit.status));

    // ══ 6) مدخلات غير صالحة ══
    console.log('\n— التحقق من المدخلات —');
    const badAmount = await api(`/api/transactions/${txId}`, { method: 'PUT', token: owner, body: { amount: 0 } });
    ok('مبلغ صفر مرفوض (400)', badAmount.status === 400, String(badAmount.status));
    const negAmount = await api(`/api/transactions/${txId}`, { method: 'PUT', token: owner, body: { amount: -50 } });
    ok('مبلغ سالب مرفوض (400)', negAmount.status === 400, String(negAmount.status));
    const badType = await api(`/api/transactions/${txId}`, { method: 'PUT', token: owner, body: { type: 'unknown' } });
    ok('نوع غير معروف مرفوض (400)', badType.status === 400, String(badType.status));
    const badDate = await api(`/api/transactions/${txId}`, { method: 'PUT', token: owner, body: { date: '03-10-2026' } });
    ok('تاريخ بصيغة خاطئة مرفوض (400)', badDate.status === 400, String(badDate.status));
    const badTime = await api(`/api/transactions/${txId}`, { method: 'PUT', token: owner, body: { time: '99:99' } });
    ok('وقت بصيغة خاطئة مرفوض (400)', badTime.status === 400, String(badTime.status));
    const missing = await api('/api/transactions/does-not-exist', { method: 'PUT', token: owner, body: { amount: 5 } });
    ok('عملية غير موجودة = 404', missing.status === 404, String(missing.status));

    // ══ 7) العملية الملغاة لا تُعدَّل ══
    console.log('\n— العملية الملغاة —');
    await api(`/api/transactions/${txId}/cancel`, { method: 'POST', token: owner, body: { reason: 'إلغاء للاختبار' } });
    const editCancelled = await api(`/api/transactions/${txId}`, { method: 'PUT', token: owner, body: { amount: 999 } });
    ok('تعديل عملية ملغاة مرفوض (409)', editCancelled.status === 409, String(editCancelled.status));
    ok('رسالة الرفض توضّح السبب', String(editCancelled.data?.error ?? '').includes('ملغاة'), String(editCancelled.data?.error));

    // ══ 8) سجل التدقيق ══
    console.log('\n— سجل التدقيق —');
    const editLogs = withDb((db) => db.prepare("SELECT * FROM activity_logs WHERE action_type = 'EDIT_TRANSACTION' ORDER BY created_at ASC").all() as any[]);
    ok('كل تعديل مسجّل (حدثان)', editLogs.length === 2, String(editLogs.length));
    ok('السجل يذكر المنفّذ ودوره', editLogs[0]?.user_name === 'عادل' && editLogs[0]?.actor_role === 'owner', JSON.stringify(editLogs[0] ?? {}).slice(0, 140));
    ok('السجل يحمل القيم قبل/بعد', String(editLogs[0]?.reason ?? '').includes('amount: 1000 → 1500'), String(editLogs[0]?.reason).slice(0, 90));
    ok('السجل يحمل سبب المستخدم', String(editLogs[0]?.reason ?? '').includes('تصحيح مبلغ'), String(editLogs[0]?.reason).slice(0, 90));
    ok('السجل مرتبط بالعملية', editLogs[0]?.entity_type === 'TRANSACTION' && !!editLogs[0]?.entity_id, JSON.stringify({ t: editLogs[0]?.entity_type, i: editLogs[0]?.entity_id }));
    ok('نتيجة الحدث success', editLogs[0]?.result === 'success', String(editLogs[0]?.result));

    // ══ 9) سلامة باقي البيانات ══
    const finalCust = await api(`/api/customers/${customerId}`, { token: owner });
    ok('الرصيد النهائي صحيح بعد الإلغاء (-200 من العملية المتبقية)', Number(finalCust.data?.customer?.balance) === -200, String(finalCust.data?.customer?.balance));
    ok('العميل موجود ولم يُحذف', !!finalCust.data?.customer?.id);

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
