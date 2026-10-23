/**
 * AH2 — بوابة استيراد البيانات إلى Firestore
 * ==========================================
 * تُشغَّل على محاكي Firestore الحقيقي بقواعد الأمان الفعلية، وتثبت:
 *  - الاستيراد يرفض العمل قبل وجود وثيقة المحل أو إذا لم تكن المالك.
 *  - يكتب نسخة SQLite الاحتياطية كاملة دون حذف أو استبدال.
 *  - تقرير المطابقة يطابق الأعداد والأرصدة حرفيًا (صافي −1178.6).
 *  - إعادة التشغيل لا تُكرّر شيئًا (idempotent).
 *  - `created_by` القديم يبقى كما هو (لا نسبة بلا دليل).
 *  - موظف مُعطّل لا يرى البيانات بعد الاستيراد.
 *
 * التشغيل: npm run test:import
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';
import { importBackup, balancesOf, type BackupExport } from '../src/services/firestore/import';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER_UID = 'owner-real-uid';
const DISABLED_UID = 'emp-disabled';
// عيّنة عامة بنفس شكل وأرقام نسخة الإنتاج (أسماء وهمية) — آمنة للنشر
const BACKUP = path.join(REPO_ROOT, 'tests', 'fixtures', 'import-sample.json');

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

let env: RulesTestEnvironment;

async function main() {
  console.log('— تهيئة محاكي Firestore —');
  env = await initializeTestEnvironment({
    projectId: 'demo-ah2-import',
    firestore: {
      rules: fs.readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  ok('نسخة البيانات الاحتياطية موجودة', fs.existsSync(BACKUP), BACKUP);
  const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8')) as BackupExport;
  ok('النسخة تحتوي 3 عملاء', (backup.tables.customers ?? []).length === 3);
  ok('النسخة تحتوي 3 عمليات', (backup.tables.transactions ?? []).length === 3);
  ok('النسخة تحتوي 12 سجل تدقيق', (backup.tables.activity_logs ?? []).length === 12);

  // ── 1) قبل وجود المحل: يجب أن يرفض ──
  console.log('\n— 1) شروط الأمان قبل الاستيراد —');
  {
    const db = env.authenticatedContext(OWNER_UID).firestore();
    const res = await importBackup(db, 'main', OWNER_UID, backup);
    ok('يرفض الاستيراد قبل إنشاء وثيقة المحل', !!res.fatal && res.fatal.includes('shops/main'), String(res.fatal));
  }

  // ── 2) إنشاء المحل يدويًا (كما يفعل المالك في الكونسول) ──
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'shops', 'main'), { name: 'Abha', ownerUid: OWNER_UID, createdAt: '2026-10-23T00:00:00.000Z' });
    await setDoc(doc(db, 'shops/main/members', OWNER_UID), {
      uid: OWNER_UID, name: 'عادل', role: 'owner', status: 'active', permissions: [], createdAt: '2026-10-23T00:00:00.000Z',
    });
    await setDoc(doc(db, 'shops/main/members', DISABLED_UID), {
      uid: DISABLED_UID, name: 'موظف معطّل', role: 'employee', status: 'disabled', permissions: ['view_customers'], createdAt: '2026-10-23T00:00:00.000Z',
    });
    // موظف نشط لكنه ليس المالك — لاختبار منع الاستيراد بدقة
    await setDoc(doc(db, 'shops/main/members', 'someone-else'), {
      uid: 'someone-else', name: 'موظف نشط', role: 'employee', status: 'active',
      permissions: ['view_customers', 'add_customer'], createdAt: '2026-10-23T00:00:00.000Z',
    });
  });

  // ── 3) حساب ليس المالك: يجب أن يرفض ──
  console.log('\n— 2) منع غير المالك من الاستيراد —');
  {
    const intruder = env.authenticatedContext('someone-else').firestore();
    const res = await importBackup(intruder, 'main', 'someone-else', backup);
    ok('يرفض الاستيراد لحساب ليس مالكًا', !!res.fatal && res.fatal.includes('ownerUid'), String(res.fatal));
    const writes = await getDocs(collection(intruder, 'shops', 'main', 'customers')).catch(() => null);
    ok('لم تُكتب أي بيانات بواسطة غير المالك', writes === null || writes.empty, 'تم الكتابة!');
  }

  // ── 4) الاستيراد الفعلي بصفة المالك ──
  console.log('\n— 3) الاستيراد الفعلي —');
  const ownerDb = env.authenticatedContext(OWNER_UID).firestore();
  const run = await importBackup(ownerDb, 'main', OWNER_UID, backup);
  const r = run.report;

  ok('الاستيراد اكتمل بلا أخطاء', run.report.ok, run.fatal ?? '');
  ok('كُتب 3 عملاء', r.written.customers === 3, String(r.written.customers));
  ok('كُتبت 3 عمليات', r.written.transactions === 3, String(r.written.transactions));
  ok('كُتب 12 سجل تدقيق', r.written.auditLogs === 12, String(r.written.auditLogs));
  ok('كُتبت 6 إشعارات', r.written.notifications === 6, String(r.written.notifications));

  console.log('\n— 4) تقرير المطابقة —');
  for (const c of r.checks) {
    ok(`${c.label}: ${c.expected} = ${c.actual}`, c.pass, `${c.expected} ≠ ${c.actual}`);
  }
  ok('صافي الأرصدة = −1178.6', String(r.source.net) === '-1178.6', String(r.source.net));
  ok('صافي الأرصدة بعد الاستيراد = −1178.6', String(r.readBack.net) === '-1178.6', String(r.readBack.net));

  const expectedBalances: Record<string, number> = {
    'عميل اختبار أ': 0,
    'عميل اختبار ب': -1200,
    'عميل اختبار ج': 21.4,
  };
  for (const [name, expected] of Object.entries(expectedBalances)) {
    const row = r.balancesAfter.find((b) => b.name === name);
    ok(`رصيد ${name} = ${expected}`, !!row && Math.abs(row.balance - expected) < 0.005, row ? String(row.balance) : 'مفقود');
  }

  // ── 5) إعادة التشغيل: لا تكرار ──
  console.log('\n— 5) إعادة التشغيل (idempotent) —');
  {
    const again = await importBackup(ownerDb, 'main', OWNER_UID, backup);
    ok('إعادة التشغيل لا تكتب شيئًا جديدًا', again.report.written.customers === 0 && again.report.written.transactions === 0,
      JSON.stringify(again.report.written));
    ok('عدد العملاء بقي 3', again.report.readBack.customers === 3, String(again.report.readBack.customers));
    ok('الصافي لم يتغيّر', String(again.report.readBack.net) === '-1178.6', String(again.report.readBack.net));
  }

  // ── 6) لا نسبة بلا دليل ──
  console.log('\n— 6) حماية البيانات التاريخية —');
  {
    const snap = await getDocs(collection(ownerDb, 'shops', 'main', 'transactions'));
    const rows = snap.docs.map((d) => d.data() as any);
    const original = new Set((backup.tables.transactions as any[]).map((t) => t.created_by));
    ok('created_by لكل عملية مطابق للأصل', rows.every((t) => original.has(t.created_by)), JSON.stringify(rows.map((t) => t.created_by)));
    ok('لا نسبة لأي عملية للمالك الحالي', rows.every((t) => t.created_by !== OWNER_UID), 'يوجد تلاعب');
    ok('مبالغ العمليات كما هي', JSON.stringify(rows.map((t) => t.amount).sort()) === JSON.stringify([558.6, 580, 1200].sort()));
  }

  // ── 7) العزل بعد الاستيراد ──
  console.log('\n— 7) العزل بعد الاستيراد —');
  {
    const disabledDb = env.authenticatedContext(DISABLED_UID).firestore();
    await assertFails(getDoc(doc(disabledDb, 'shops/main/customers', (backup.tables.customers as any[])[0].id)));
    ok('الموظف المعطّل لا يقرأ بيانات العملاء', true);

    const stranger = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(stranger, 'shops', 'main', 'transactions')));
    ok('الزائر غير المسجّل لا يقرأ العمليات', true);

    const ownerRead = await getDoc(doc(ownerDb, 'shops/main/customers', (backup.tables.customers as any[])[0].id));
    ok('المالك يقرأ بياناته بعد الاستيراد', ownerRead.exists());
  }

  console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
  await env.cleanup();
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch(async (err) => {
  console.error('فشل الاختبار:', err);
  try {
    await env?.cleanup();
  } catch {
    /* تجاهل */
  }
  process.exit(1);
});
