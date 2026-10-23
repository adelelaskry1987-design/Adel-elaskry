/**
 * استيراد نسخة SQLite الاحتياطية إلى Firestore + تقرير مطابقة
 * ===========================================================
 * آمن بالتصميم:
 *  - لا يحذف ولا يستبدل أي وثيقة موجودة (skip للموجود، ولا حذف إطلاقًا).
 *  - يكتب فقط مجموعات المحل: customers · transactions · auditLogs · notifications.
 *  - لا ينسب أي صف قديم لمستخدم آخر: `created_by` يبقى كما هو حرفيًا.
 *  - الوثيقتان `shops/main` و`members/{uid}` تُنشأان يدويًا (لأن القواعد تمنع
 *    كتابة ownerUid من المتصفح — وهذا مقصود لمنع أي انتحال للملكية).
 *  - يتوقف فورًا عند أول اختلاف في المطابقة.
 *
 * الوحدة نقية (تأخذ db كوسيط) لتُختبر على محاكي Firestore قبل لمس أي بيانات حقيقية.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

export interface BackupExport {
  exported_at: string;
  source?: string;
  tables: Record<string, any[]>;
}

export interface ImportReport {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  source: { customers: number; transactions: number; auditLogs: number; notifications: number; net: number };
  written: { customers: number; transactions: number; auditLogs: number; notifications: number; skippedExisting: number };
  readBack: { customers: number; transactions: number; auditLogs: number; notifications: number; net: number };
  balancesBefore: { id: string; name: string; balance: number }[];
  balancesAfter: { id: string; name: string; balance: number }[];
  checks: { label: string; expected: string; actual: string; pass: boolean }[];
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** يحسب رصيد كل عميل من العمليات النشطة (نفس معادلة التطبيق) */
export function balancesOf(
  customers: { id: string; name: string }[],
  transactions: { customer_id: string; type: string; amount: number; status?: string }[]
) {
  const acc = new Map<string, number>();
  for (const t of transactions) {
    if ((t.status ?? 'active') !== 'active') continue;
    const id = String(t.customer_id);
    const v = Number(t.amount) || 0;
    acc.set(id, (acc.get(id) ?? 0) + (t.type === 'payment' ? v : -v));
  }
  return customers.map((c) => ({ id: c.id, name: c.name, balance: round2(acc.get(c.id) ?? 0) }));
}

export interface ImportResult {
  report: ImportReport;
  /** الأخطاء الحرجة التي توقف الاستيراد */
  fatal?: string;
}

/**
 * ينفّذ الاستيراد على قاعدة Firestore معيّنة (حقيقية أو محاكي).
 * @param ownerUid معرّف مالك المحل — يجب أن يطابق `/shops/main.ownerUid`
 */
export async function importBackup(
  db: Firestore,
  shopId: string,
  ownerUid: string,
  backup: BackupExport,
  options: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  const startedAt = new Date().toISOString();
  const notes: string[] = [];
  const checks: ImportReport['checks'] = [];

  // ── 0) شرط مسبق: وثيقة المحل موجودة وأنت مالكها ──
  // ملاحظة: قواعد الأمان ترفض القراءة أصلًا قبل وجود العضوية، فالتعذّر هنا
  // يعني «المحل غير مهيّأ أو لست عضوًا» — نُعيد رسالة واضحة بدل استثناء خام.
  let shopSnap;
  try {
    shopSnap = await getDoc(doc(db, 'shops', shopId));
  } catch {
    return {
      report: emptyReport(startedAt, backup),
      fatal:
        'وثيقة المحل shops/main غير موجودة أو لا تملك عضوية نشطة فيها — أنشئ وثيقة المحل ووثيقة عضويتك (role/status) ثم أعد المحاولة',
    };
  }
  if (!shopSnap.exists()) {
    return {
      report: emptyReport(startedAt, backup),
      fatal: 'وثيقة المحل shops/main غير موجودة — أنشئها أولًا (name + ownerUid) ثم أعد المحاولة',
    };
  }
  const shopData = shopSnap.data() as any;
  if (shopData.ownerUid !== ownerUid) {
    return {
      report: emptyReport(startedAt, backup),
      fatal: 'هذا الحساب ليس مالك المحل (ownerUid مختلف) — الاستيراد مسموح للمالك فقط',
    };
  }

  // ── 1) تجهيز البيانات من نسخة SQLite ──
  const t = backup.tables;
  const srcCustomers = (t.customers ?? []).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? ''),
    phone: String(c.phone ?? ''),
    address: String(c.address ?? ''),
    type: c.type === 'company' ? 'company' : 'individual',
    notes: String(c.notes ?? ''),
    created_at: String(c.created_at ?? ''),
    updated_at: String(c.updated_at ?? ''),
  }));

  const srcTransactions = (t.transactions ?? []).map((x) => ({
    id: String(x.id),
    project_id: shopId,
    customer_id: String(x.customer_id),
    type: x.type === 'payment' ? 'payment' : 'withdrawal',
    amount: Number(x.amount),
    date: String(x.date ?? ''),
    time: String(x.time ?? ''),
    description: String(x.description ?? ''),
    status: x.status === 'cancelled' ? 'cancelled' : 'active',
    // لا نسبة بلا دليل: القيمة الأصلية كما هي
    created_by: x.created_by ?? null,
    cancelled_by: x.cancelled_by ?? null,
    cancelled_at: x.cancelled_at ?? null,
    cancellation_reason: x.cancellation_reason ?? null,
    created_at: String(x.created_at ?? ''),
  }));

  const srcAudit = (t.activity_logs ?? []).map((l) => ({
    id: String(l.id),
    actor_id: l.actor_id ?? l.user_id ?? null,
    action_type: String(l.action_type ?? l.action ?? 'LEGACY_EVENT'),
    description: String(l.description ?? ''),
    entity_type: l.entity_type ?? null,
    entity_id: l.entity_id ?? null,
    result: l.result ?? 'success',
    created_at: String(l.created_at ?? ''),
  }));

  const srcNotifications = (t.notifications ?? []).map((n) => ({
    id: String(n.id),
    title: String(n.title ?? ''),
    message: String(n.message ?? ''),
    type: n.type ?? 'info',
    is_read: !!n.is_read,
    created_at: String(n.created_at ?? ''),
  }));

  const balancesBefore = balancesOf(srcCustomers, srcTransactions as any);
  const srcNet = round2(balancesBefore.reduce((s, c) => s + c.balance, 0));

  const report: ImportReport = {
    ok: false,
    startedAt,
    finishedAt: '',
    source: {
      customers: srcCustomers.length,
      transactions: srcTransactions.length,
      auditLogs: srcAudit.length,
      notifications: srcNotifications.length,
      net: srcNet,
    },
    written: { customers: 0, transactions: 0, auditLogs: 0, notifications: 0, skippedExisting: 0 },
    readBack: { customers: 0, transactions: 0, auditLogs: 0, notifications: 0, net: 0 },
    balancesBefore,
    balancesAfter: [],
    checks,
    notes,
  };

  notes.push(
    'لا حذف ولا استبدال: أي وثيقة موجودة مسبقًا تُترك كما هي وتُحسب في «تم تخطيها».'
  );
  notes.push(
    'العضويات لا تُستورد: وثيقة عضوية المالك تُنشأ يدويًا، وقواعد الأمان تمنع منح دور owner من المتصفح.'
  );
  notes.push('created_by للعمليات القديمة يُحفظ كما هو دون أي نسبة تلقائية.');

  if (options.dryRun) {
    report.finishedAt = new Date().toISOString();
    report.ok = true;
    notes.push('تشغيل تجريبي (dry run): لم تُكتب أي بيانات.');
    return { report };
  }

  // ── 2) الكتابة (setDoc لمعرّفات ثابتة ⇒ لا تكرار عند إعادة التشغيل) ──
  const writeCollection = async (name: string, rows: { id: string }[]) => {
    let written = 0;
    for (const row of rows) {
      const ref = doc(collection(db, 'shops', shopId, name), row.id);
      const existing = await getDoc(ref);
      if (existing.exists()) {
        report.written.skippedExisting++;
        continue;
      }
      await setDoc(ref, row as any);
      written++;
    }
    return written;
  };

  report.written.customers = await writeCollection('customers', srcCustomers);
  report.written.transactions = await writeCollection('transactions', srcTransactions);
  report.written.auditLogs = await writeCollection('auditLogs', srcAudit);
  report.written.notifications = await writeCollection('notifications', srcNotifications);

  // ── 3) القراءة من جديد للتحقق ──
  const readAll = async (name: string) => {
    const snap = await getDocs(collection(db, 'shops', shopId, name));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  };
  const backCustomers = await readAll('customers');
  const backTransactions = await readAll('transactions');
  const backAudit = await readAll('auditLogs');
  const backNotifications = await readAll('notifications');

  const balancesAfter = balancesOf(
    backCustomers.map((c: any) => ({ id: c.id, name: c.name })),
    backTransactions as any
  );
  const backNet = round2(balancesAfter.reduce((s, c) => s + c.balance, 0));

  report.readBack = {
    customers: backCustomers.length,
    transactions: backTransactions.length,
    auditLogs: backAudit.length,
    notifications: backNotifications.length,
    net: backNet,
  };
  report.balancesAfter = balancesAfter;
  report.finishedAt = new Date().toISOString();

  // ── 4) المطابقة (توقف عند أي اختلاف) ──
  const push = (label: string, expected: any, actual: any) => {
    const pass = String(expected) === String(actual);
    checks.push({ label, expected: String(expected), actual: String(actual), pass });
    return pass;
  };

  let allPass = true;
  allPass = push('عدد العملاء', srcCustomers.length, backCustomers.length) && allPass;
  allPass = push('عدد العمليات', srcTransactions.length, backTransactions.length) && allPass;
  allPass = push('عدد سجلات التدقيق', srcAudit.length, backAudit.length) && allPass;
  allPass = push('عدد الإشعارات', srcNotifications.length, backNotifications.length) && allPass;
  allPass = push('صافي الأرصدة', srcNet, backNet) && allPass;
  allPass = push('مجموع أرصدة العملاء', round2(balancesBefore.reduce((s, c) => s + c.balance, 0)), backNet) && allPass;

  // رصيد كل عميل على حدة
  for (const before of balancesBefore) {
    const after = balancesAfter.find((a) => a.id === before.id);
    allPass = push(`رصيد العميل ${before.name}`, before.balance, after ? after.balance : 'مفقود') && allPass;
  }

  // حقول الأمان: لا نسبة تلقائية، ولا تغيير في المبالغ
  const createdByDrift =
    JSON.stringify(srcTransactions.map((x) => x.created_by)) ===
    JSON.stringify(
      backTransactions
        .slice()
        .sort((a: any, b: any) => srcTransactions.findIndex((s) => s.id === a.id) - srcTransactions.findIndex((s) => s.id === b.id))
        .map((x: any) => x.created_by ?? null)
    );
  allPass = push('بقاء created_by كما هو (بلا نسبة تلقائية)', true, createdByDrift) && allPass;

  const amountsMatch =
    JSON.stringify(srcTransactions.map((x) => x.id + ':' + x.amount).sort()) ===
    JSON.stringify(backTransactions.map((x: any) => x.id + ':' + x.amount).sort());
  allPass = push('مبالغ العمليات كما هي', true, amountsMatch) && allPass;

  report.ok = allPass;

  if (!allPass) {
    return {
      report,
      fatal: `توقف الاستيراد: ${checks.filter((c) => !c.pass).map((c) => c.label).join(' · ')} — البيانات المكتوبة لم تُحذف، راجع التقرير.`,
    };
  }
  return { report };
}

function emptyReport(startedAt: string, backup: BackupExport): ImportReport {
  const t = backup.tables;
  return {
    ok: false,
    startedAt,
    finishedAt: '',
    source: {
      customers: (t.customers ?? []).length,
      transactions: (t.transactions ?? []).length,
      auditLogs: (t.activity_logs ?? []).length,
      notifications: (t.notifications ?? []).length,
      net: 0,
    },
    written: { customers: 0, transactions: 0, auditLogs: 0, notifications: 0, skippedExisting: 0 },
    readBack: { customers: 0, transactions: 0, auditLogs: 0, notifications: 0, net: 0 },
    balancesBefore: [],
    balancesAfter: [],
    checks: [],
    notes: [],
  };
}
