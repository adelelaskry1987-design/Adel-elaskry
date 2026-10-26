/**
 * اختبار حقول المالك — يقيس بالضبط الحقول المطلوبة في الوثيقتين
 * =============================================================
 * يحاكي الوثائق التي ستُنشأ يدويًا في الكونسول ويقيس:
 *  1) هل يقرأ المالك وثيقة المحل بعضوية فيها status فقط (بلا role/bemail/permissions)؟
 *  2) هل غياب permissions يمنع المالك من قراءة العملاء؟
 *  3) هل status بحروف مختلفة (Active / نشط) تُقبل؟
 *  4) هل غياب role يمنع القراءة؟
 *  5) هل غياب الوثيقة الرئيسية أو تغيّر ownerUid يمنع المالك؟
 *
 * التشغيل: npm run test:owner-fields
 */
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const OWNER = 'V2h1DC7YSBM5f9vqBZEqN9UlPW02';
const OTHER = 'someone-else-uid';

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label} ${extra}`); }
}

let env: RulesTestEnvironment;

async function clearAll() {
  await env.clearFirestore();
}

const db = (uid: string) => env.authenticatedContext(uid).firestore();

async function seed(opts: {
  shop?: boolean;
  ownerUid?: string;
  status?: string | null;
  role?: string | null;
  permissions?: string[] | null;
  member?: boolean;
}) {
  const o = { shop: true, ownerUid: OWNER, status: 'active', role: 'owner', permissions: null, member: true, ...opts };
  if (o.shop) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'shops', 'main'), { name: 'OM BASMA', ownerUid: o.ownerUid, createdAt: '2026-10-25T00:00:00.000Z' });
      if (o.member) {
        const m: Record<string, unknown> = { uid: OWNER, name: 'عادل', email: 'adelelaskry1987@gmail.com', phone: '' };
        if (o.status !== null) m.status = o.status;
        if (o.role !== null) m.role = o.role;
        if (o.permissions !== null) m.permissions = o.permissions;
        await setDoc(doc(ctx.firestore(), 'shops', 'main', 'members', OWNER), m);
        await setDoc(doc(ctx.firestore(), 'shops', 'main', 'customers', 'c1'), { name: 'عميل', balance: 0 });
      }
    });
  }
}

async function canReadShop(uid = OWNER) {
  try { const s = await getDoc(doc(db(uid), 'shops', 'main')); return s.exists(); } catch { return false; }
}
async function canReadCustomers(uid = OWNER) {
  try { const s = await getDocs(collection(db(uid), 'shops', 'main', 'customers')); return s.size >= 0; } catch { return false; }
}

async function main() {
  env = await initializeTestEnvironment({
    projectId: 'demo-ah2-owner-fields',
    firestore: { rules: readFileSync(path.join(REPO_ROOT, 'firestore.rules'), 'utf8') },
  });

  // ── 1) الحالة الموصى بها: status+role فقط، بلا permissions ────────────
  console.log('— 1) عضوية فيها status وrole فقط (بدون permissions) —');
  await clearAll();
  await seed({ status: 'active', role: 'owner', permissions: null });
  ok('المالك يقرأ وثيقة المحل', await canReadShop());
  ok('المالك يقرأ العملاء (رغم غياب permissions)', await canReadCustomers());

  // ── 2) عضوية فيها status فقط (بلا role ولا permissions) ───────────────
  console.log('— 2) عضوية فيها status فقط (بلا role) —');
  await clearAll();
  await seed({ status: 'active', role: null, permissions: null });
  ok('القراءة تعمل بالـ status وحده + ownerUid', await canReadShop());

  // ── 3) status بحروف كبيرة ─────────────────────────────────────────────
  console.log('— 3) status = "Active" (حرف كبير) —');
  await clearAll();
  await seed({ status: 'Active' });
  ok('يُرفض الدخول (حساسية حالة الأحرف)', !(await canReadShop()));

  console.log('— 4) status = "نشط" —');
  await clearAll();
  await seed({ status: 'نشط' });
  ok('يُرفض الدخول (القيمة عربية)', !(await canReadShop()));

  // ── 5) لا وثيقة عضوية ────────────────────────────────────────────────
  console.log('— 5) بلا وثيقة عضوية —');
  await clearAll();
  await seed({ member: false });
  ok('المالك نفسه يُمنع (الشرط عضوية نشطة)', !(await canReadShop()));

  // ── 6) ownerUid مختلف ────────────────────────────────────────────────
  console.log('— 6) ownerUid = حساب آخر —');
  await clearAll();
  await seed({ ownerUid: OTHER });
  ok('يقرأ المحل (لأنه عضو نشط)', await canReadShop());
  ok('لكنه لا يقرأ العملاء (ليس المالك ولا يملك view_customers)', !(await canReadCustomers()));

  // ── 7) المالك يعدّل وثيقته؟ ──────────────────────────────────────────
  console.log('— 7) هل يستطيع المالك تعديل وثيقة عضويته؟ —');
  await clearAll();
  await seed({});
  let updateOk = true;
  try {
    await setDoc(doc(db(OWNER), 'shops', 'main', 'members', OWNER), { status: 'disabled' }, { merge: true });
  } catch { updateOk = false; }
  ok('لا يستطيع (القواعد تحمي عضوية المالك)', !updateOk);

  // ── 8) permissions صريحة فارغة ───────────────────────────────────────
  console.log('— 8) permissions = [] صريحة —');
  await clearAll();
  await seed({ permissions: [] });
  ok('المالك يقرأ كل شيء', (await canReadShop()) && (await canReadCustomers()));

  await env.cleanup();
  console.log(`\nالنتيجة: ${pass} ناجح / ${fail} فاشل`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error('فشل الاختبار:', e); process.exit(1); });
