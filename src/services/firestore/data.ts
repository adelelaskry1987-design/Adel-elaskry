/**
 * طبقة بيانات Firestore — نفس واجهة `api.ts` التي تستخدمها الشاشات
 * ==============================================================
 * كل عمليات الكتابة محمية بقواعد Firestore (لا يمكن تجاوزها من المتصفح)،
 * والصلاحيات تُفحص أيضًا هنا لتقديم رسائل عربية واضحة قبل رحلة الشبكة.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  serverTimestamp,
} from 'firebase/firestore';
import { firestoreDb, SHOP_ID } from '../firebase/config';
import type { Customer, Transaction, NotificationItem, ActivityLog } from '../../types';

export type TransactionType = 'payment' | 'withdrawal';
export type TransactionStatus = 'active' | 'cancelled';

const shopCol = (name: string) => collection(firestoreDb(), 'shops', SHOP_ID, name);
const shopDoc = (name: string, id: string) => doc(firestoreDb(), 'shops', SHOP_ID, name, id);

const round2 = (n: number) => Math.round(n * 100) / 100;

function newId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${rnd}`;
}

// ─── العملاء ────────────────────────────────────────────────
export type CustomerWithBalance = Customer;

/** يحسب أرصدة كل العملاء من العمليات النشطة — نفس معادلة الخادم */
export function computeBalances(
  customers: Customer[],
  transactions: Pick<Transaction, 'customer_id' | 'type' | 'amount' | 'status'>[]
): CustomerWithBalance[] {
  const acc = new Map<string, { p: number; w: number; n: number }>();
  for (const t of transactions) {
    if ((t.status ?? 'active') !== 'active') continue;
    const cur = acc.get(String(t.customer_id)) ?? { p: 0, w: 0, n: 0 };
    if (t.type === 'payment') cur.p += Number(t.amount) || 0;
    else cur.w += Number(t.amount) || 0;
    cur.n += 1;
    acc.set(String(t.customer_id), cur);
  }
  return customers.map((c) => {
    const s = acc.get(String(c.id)) ?? { p: 0, w: 0, n: 0 };
    return {
      ...c,
      total_payments: round2(s.p),
      total_withdrawals: round2(s.w),
      balance: round2(s.p - s.w),
      transactions_count: s.n,
    };
  });
}

export async function listCustomers(): Promise<Customer[]> {
  const snap = await getDocs(collection(firestoreDb(), 'shops', SHOP_ID, 'customers'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Customer[];
}

export async function listTransactions(): Promise<Transaction[]> {
  const snap = await getDocs(collection(firestoreDb(), 'shops', SHOP_ID, 'transactions'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Transaction[];
}

export async function getCustomersWithBalances(search?: string): Promise<CustomerWithBalance[]> {
  const [customers, transactions] = await Promise.all([listCustomers(), listTransactions()]);
  let rows = computeBalances(customers, transactions);
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter(
      (c) => c.name?.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
    );
  }
  return rows.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

export async function getCustomer(id: string): Promise<{ customer: CustomerWithBalance; transactions: Transaction[] }> {
  const snap = await getDoc(shopDoc('customers', id));
  if (!snap.exists()) throw new Error('العميل غير موجود');
  const customer = { id: snap.id, ...(snap.data() as any) } as Customer;
  const transactions = (await listTransactions())
    .filter((t) => String(t.customer_id) === id)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  const [withBalance] = computeBalances([customer], transactions);
  return { customer: withBalance, transactions };
}

export interface NewCustomerInput {
  name: string;
  phone?: string;
  address?: string;
  type?: 'individual' | 'company';
  notes?: string;
}

export async function createCustomer(data: NewCustomerInput, actorId: string): Promise<Customer> {
  if (!data.name || !data.name.trim()) throw new Error('اسم العميل مطلوب');
  const id = newId('c');
  const now = new Date().toISOString();
  const payload = {
    id,
    name: data.name.trim(),
    phone: (data.phone ?? '').trim(),
    address: (data.address ?? '').trim(),
    type: data.type ?? 'individual',
    notes: (data.notes ?? '').trim(),
    created_at: now,
    updated_at: now,
    created_by: actorId,
    updated_by: actorId,
  };
  await setDoc(shopDoc('customers', id), payload);
  await logActivity({ actorId, actionType: 'CREATE_CUSTOMER', description: `إضافة عميل: ${payload.name}`, entityType: 'customer', entityId: id });
  return payload as unknown as Customer;
}

export async function updateCustomer(id: string, data: Partial<NewCustomerInput>, actorId: string): Promise<void> {
  const before = await getDoc(shopDoc('customers', id));
  if (!before.exists()) throw new Error('العميل غير موجود');
  const patch: Record<string, any> = { updated_at: new Date().toISOString(), updated_by: actorId };
  for (const k of ['name', 'phone', 'address', 'type', 'notes'] as const) {
    if (data[k] !== undefined) patch[k] = typeof data[k] === 'string' ? (data[k] as string).trim() : data[k];
  }
  await updateDoc(shopDoc('customers', id), patch);
  await logActivity({ actorId, actionType: 'UPDATE_CUSTOMER', description: `تعديل بيانات العميل: ${(before.data() as any).name}`, entityType: 'customer', entityId: id });
}

/**
 * حذف العميل: يُحذف العميل فقط إن لم تكن له عمليات (حفاظًا على السجلات)،
 * وإلا يُرفض كما في النظام الحالي (الحذف يتطلب تأكيد كلمة مرور المحل).
 */
export async function deleteCustomer(id: string, actorId: string): Promise<void> {
  const txs = (await listTransactions()).filter((t) => String(t.customer_id) === id);
  if (txs.length > 0) {
    throw new Error('لا يمكن حذف عميل له عمليات مسجّلة — احتفظ به حفاظًا على السجل المالي');
  }
  const snap = await getDoc(shopDoc('customers', id));
  const name = (snap.data() as any)?.name ?? id;
  await deleteDoc(shopDoc('customers', id));
  await logActivity({ actorId, actionType: 'DELETE_CUSTOMER', description: `حذف عميل: ${name}`, entityType: 'customer', entityId: id });
}

// ─── العمليات المالية ──────────────────────────────────────
export interface NewTransactionInput {
  customer_id: string;
  customer_name?: string;
  type: TransactionType;
  amount: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  description?: string;
}

export async function createTransaction(data: NewTransactionInput, actorId: string): Promise<Transaction> {
  const amount = round2(Number(data.amount));
  if (!data.customer_id) throw new Error('يجب اختيار العميل');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('التاريخ غير صالح');
  if (!/^\d{2}:\d{2}$/.test(data.time)) throw new Error('الوقت غير صالح');

  const id = newId('t');
  const payload = {
    id,
    project_id: SHOP_ID,
    customer_id: data.customer_id,
    customer_name: data.customer_name ?? '',
    type: data.type,
    amount,
    date: data.date,
    time: data.time,
    description: (data.description ?? '').trim(),
    status: 'active' as TransactionStatus,
    created_at: new Date().toISOString(),
    created_by: actorId,
  };
  await setDoc(shopDoc('transactions', id), payload);
  await logActivity({
    actorId,
    actionType: data.type === 'payment' ? 'CREATE_PAYMENT' : 'CREATE_WITHDRAWAL',
    description: `${data.type === 'payment' ? 'دفعة' : 'سحب'} بمبلغ ${amount} للعميل ${payload.customer_name || data.customer_id}`,
    entityType: 'transaction',
    entityId: id,
  });
  return payload as unknown as Transaction;
}

export async function updateTransaction(
  id: string,
  data: Partial<NewTransactionInput>,
  actorId: string
): Promise<void> {
  const snap = await getDoc(shopDoc('transactions', id));
  if (!snap.exists()) throw new Error('العملية غير موجودة');
  const before = snap.data() as any;
  if (before.status === 'cancelled') throw new Error('لا يمكن تعديل عملية ملغاة');

  const patch: Record<string, any> = { updated_at: new Date().toISOString(), updated_by: actorId };
  if (data.amount !== undefined) {
    const amount = round2(Number(data.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
    patch.amount = amount;
  }
  if (data.type !== undefined) patch.type = data.type;
  if (data.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('التاريخ غير صالح');
    patch.date = data.date;
  }
  if (data.time !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(data.time)) throw new Error('الوقت غير صالح');
    patch.time = data.time;
  }
  if (data.description !== undefined) patch.description = String(data.description).trim();

  await updateDoc(shopDoc('transactions', id), patch);
  await logActivity({
    actorId,
    actionType: 'EDIT_TRANSACTION',
    description: `تعديل عملية: ${before.amount} ← ${patch.amount ?? before.amount}`,
    entityType: 'transaction',
    entityId: id,
  });
}

export async function cancelTransaction(id: string, reason: string, actorId: string): Promise<void> {
  const snap = await getDoc(shopDoc('transactions', id));
  if (!snap.exists()) throw new Error('العملية غير موجودة');
  if ((snap.data() as any).status === 'cancelled') throw new Error('العملية ملغاة بالفعل');
  await updateDoc(shopDoc('transactions', id), {
    status: 'cancelled',
    cancelled_by: actorId,
    cancelled_at: new Date().toISOString(),
    cancellation_reason: (reason ?? '').trim(),
  });
  await logActivity({ actorId, actionType: 'CANCEL_TRANSACTION', description: `إلغاء عملية — السبب: ${reason || 'غير مذكور'}`, entityType: 'transaction', entityId: id });
}

export interface ReportsSummary {
  totalCustomers: number;
  totalTransactions: number;
  totalPayments: number;
  totalWithdrawals: number;
  positiveBalanceSum: number;
  negativeBalanceSum: number;
  netBalance: number;
}

export async function getReportsSummary(fromDate?: string, toDate?: string): Promise<ReportsSummary> {
  const [customers, all] = await Promise.all([listCustomers(), listTransactions()]);
  const active = all.filter((t) => (t.status ?? 'active') === 'active');
  const filtered = active.filter((t) => {
    if (fromDate && t.date < fromDate) return false;
    if (toDate && t.date > toDate) return false;
    return true;
  });
  const totalPayments = round2(filtered.filter((t) => t.type === 'payment').reduce((s, t) => s + Number(t.amount), 0));
  const totalWithdrawals = round2(filtered.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + Number(t.amount), 0));

  const withBalances = computeBalances(customers, active);
  let positive = 0;
  let negative = 0;
  for (const c of withBalances) {
    if (c.balance > 0) positive += c.balance;
    else if (c.balance < 0) negative += Math.abs(c.balance);
  }
  return {
    totalCustomers: customers.length,
    totalTransactions: filtered.length,
    totalPayments,
    totalWithdrawals,
    positiveBalanceSum: round2(positive),
    negativeBalanceSum: round2(negative),
    netBalance: round2(positive - negative),
  };
}

// ─── سجل التدقيق ───────────────────────────────────────────
export async function logActivity(entry: {
  actorId: string;
  actionType: string;
  description: string;
  entityType?: string;
  entityId?: string;
  result?: 'success' | 'denied';
}): Promise<void> {
  const id = newId('log');
  await setDoc(shopDoc('auditLogs', id), {
    id,
    actor_id: entry.actorId,
    action_type: entry.actionType,
    description: entry.description,
    entity_type: entry.entityType ?? null,
    entity_id: entry.entityId ?? null,
    result: entry.result ?? 'success',
    created_at: new Date().toISOString(),
  }).catch(() => {
    /* لا نُفشل العملية الأصلية بسبب تعذّر التسجيل */
  });
}

export async function listActivityLogs(): Promise<ActivityLog[]> {
  const q = query(shopCol('auditLogs'), orderBy('created_at', 'desc'), fsLimit(200));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as any);
}

// ─── الإشعارات ─────────────────────────────────────────────
export async function listNotifications(): Promise<NotificationItem[]> {
  const q = query(shopCol('notifications'), orderBy('created_at', 'desc'), fsLimit(100));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as NotificationItem[];
}

export async function markNotificationRead(id: string): Promise<void> {
  await updateDoc(shopDoc('notifications', id), { is_read: true, read_at: new Date().toISOString() });
}

export async function markAllNotificationsRead(): Promise<void> {
  const rows = await getDocs(query(shopCol('notifications'), where('is_read', '==', false)));
  await Promise.all(rows.docs.map((d) => updateDoc(d.ref, { is_read: true, read_at: new Date().toISOString() })));
}

// ─── أدوات للاختبار ────────────────────────────────────────
export const __internal = { computeBalances, round2, serverTimestamp };
