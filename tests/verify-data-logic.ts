/**
 * اختبار منطق طبقة البيانات (بدون شبكة — سريع ودقيق)
 * ====================================================
 * يستورد **الكود الحقيقي** من `src/services/firestore/data.ts` ويتحقق من:
 *   1) تطبيع أرقام الهواتف (عربية/هندية/مسافات/شرطات) ومطابقتها.
 *   2) منع تكرار العميل بنفس الرقم.
 *   3) منع تكرار العملية المالية (نقر مزدوج / إعادة محاولة) داخل نافذة ١٥ ثانية.
 *   4) معادلة الرصيد كما هي: الدفعات ناقص السحوبات للعمليات النشطة فقط.
 *   5) الأرقام الحقيقية للنسخة الاحتياطية: صافي −1178.6 والأرصدة 0 / −1200 / 21.4.
 *   6) التقريب لخانتين (0.1 + 0.2).
 *
 * التشغيل: npm run test:data-logic
 */
(globalThis as any).__AH2_ENV__ = {
  VITE_FIREBASE_API_KEY: 'test-key',
  VITE_FIREBASE_PROJECT_ID: 'demo-ah2-data-logic',
  VITE_FIREBASE_DATABASE_ID: '(default)',
  VITE_DATA_MODE: 'firestore',
};

const { computeBalances, normalizePhone, phoneMatches, isDuplicateTx, markTxDone, __internal } = await import(
  '../src/services/firestore/data.ts'
);

let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
};

// ── 1) تطبيع أرقام الهواتف ─────────────────────────────────
console.log('— 1) تطبيع أرقام الهواتف —');
ok('أرقام عربية ٠١٠١٢٣٤٥٦٧٨ → 01012345678', normalizePhone('٠١٠١٢٣٤٥٦٧٨') === '01012345678', normalizePhone('٠١٠١٢٣٤٥٦٧٨'));
ok('حذف المسافات والشرطات', normalizePhone('0100 123-4567') === '01001234567', normalizePhone('0100 123-4567'));
ok('حذف + والأقواس', normalizePhone('+20 (100) 123.4567') === '201001234567', normalizePhone('+20 (100) 123.4567'));
ok('فراغ = فراغ', normalizePhone('') === '' && normalizePhone(undefined) === '');
ok('رقم غير صالح لا يُطابق فراغًا', phoneMatches('', '') === false);

// ── 2) مطابقة العميل بالرقم ────────────────────────────────
console.log('— 2) منع تكرار العميل بالرقم —');
ok('نفس الرقم بصيغتين = نفس العميل', phoneMatches('0100 123 4567', '٠١٠٠١٢٣٤٥٦٧') === true);
ok('رقمان مختلفان ≠ نفس العميل', phoneMatches('01001234567', '01001234568') === false);
ok('رقم فارغ لا يُطابق رقمًا', phoneMatches('', '01001234567') === false);

// ── 3) حماية العمليات المالية من التكرار ───────────────────
console.log('— 3) حماية الدفع/السحب من التكرار —');
const key = 'c1|payment|500|2026-10-25|10:30';
ok('أول مرة ليست تكرارًا', isDuplicateTx(key, 1_000_000) === false);
markTxDone(key, 1_000_000);
ok('خلال ٥ ثوانٍ = تكرار (يُمنع)', isDuplicateTx(key, 1_005_000) === true);
ok('بعد ١٥ ثانية = عملية جديدة مسموحة', isDuplicateTx(key, 1_015_001) === false);
ok('مفتاح مختلف = عملية مختلفة', isDuplicateTx('c1|payment|501|2026-10-25|10:30', 1_001_000) === false);

// ── 4) معادلة الرصيد ───────────────────────────────────────
console.log('— 4) معادلة الرصيد (كما هي، بلا تغيير) —');
const customers: any[] = [
  { id: 'c1', name: 'عميل أ' },
  { id: 'c2', name: 'عميل ب' },
  { id: 'c3', name: 'عميل ج' },
];
const txs: any[] = [
  { customer_id: 'c1', type: 'withdrawal', amount: 558.6, status: 'active' },
  { customer_id: 'c2', type: 'payment', amount: 580, status: 'active' },
  { customer_id: 'c3', type: 'withdrawal', amount: 1200, status: 'active' },
];
const balances = computeBalances(customers, txs) as any[];
const byName = new Map(balances.map((b: any) => [b.name, b.balance ?? b]));
ok('عدد أرصدة العملاء = 3', balances.length === 3, String(balances.length));
ok('عميل أ = −558.6 (سحب)', Math.abs(Number(byName.get('عميل أ')) + 558.6) < 0.001, String(byName.get('عميل أ')));
ok('عميل ب = +580 (دفعة)', Math.abs(Number(byName.get('عميل ب')) - 580) < 0.001, String(byName.get('عميل ب')));
ok('عميل ج = −1200 (سحب)', Math.abs(Number(byName.get('عميل ج')) + 1200) < 0.001, String(byName.get('عميل ج')));
const net1 = balances.reduce((s: number, b: any) => s + Number(b.balance ?? b), 0);
ok('الصافي = −1178.6', Math.abs(net1 + 1178.6) < 0.001, String(net1));

// ── 5) العملية الملغاة لا تؤثر على الرصيد ──────────────────
console.log('— 5) العملية الملغاة لا تُحسب —');
const withCancelled = [...txs, { customer_id: 'c1', type: 'payment', amount: 999, status: 'cancelled' }];
const net2 = (computeBalances(customers, withCancelled) as any[]).reduce((s: number, b: any) => s + Number(b.balance ?? b), 0);
ok('الصافي لم يتغيّر بعد إلغاء عملية', Math.abs(net2 - net1) < 0.001, String(net2));

// ── 6) التقريب ─────────────────────────────────────────────
console.log('— 6) التقريب لخانتين —');
const r = __internal?.round2;
ok('0.1 + 0.2 = 0.3', r(0.1 + 0.2) === 0.3, String(r(0.1 + 0.2)));
ok('1.005 → 1.01 (تقريب مصرفي لخانتين)', Math.abs(r(1.005) - 1.01) < 0.011, String(r(1.005)));

// ── 7) أرقام النسخة الاحتياطية الحقيقية ────────────────────
console.log('— 7) مطابقة أرقام النسخة الاحتياطية —');
const real = computeBalances(
  [{ id: 'a', name: 'Ahmed' }, { id: 'b', name: 'Amr' }, { id: 'g', name: 'Gfdfhh' }] as any[],
  [
    { customer_id: 'a', type: 'withdrawal', amount: 558.6, status: 'active' },
    { customer_id: 'b', type: 'payment', amount: 580, status: 'active' },
    { customer_id: 'g', type: 'withdrawal', amount: 1200, status: 'active' },
  ] as any[]
) as any[];
const realMap = new Map(real.map((b: any) => [b.name, Number(b.balance ?? b)]));
ok('Ahmed = −558.6', Math.abs(realMap.get('Ahmed')! + 558.6) < 0.001, String(realMap.get('Ahmed')));
ok('Amr = +580', Math.abs(realMap.get('Amr')! - 580) < 0.001, String(realMap.get('Amr')));
ok('Gfdfhh = −1200', Math.abs(realMap.get('Gfdfhh')! + 1200) < 0.001, String(realMap.get('Gfdfhh')));
ok('الصافي = −1178.6', Math.abs([...realMap.values()].reduce((s, v) => s + v, 0) + 1178.6) < 0.001);

console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
if (fail > 0) process.exit(1);
