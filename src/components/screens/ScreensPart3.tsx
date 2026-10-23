import React, { useState } from 'react';
import { Customer, Transaction, ScreenId } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { ShareModal } from '../ShareModal';
import { PageTitle } from '../PageTitle';
import { CustomerBalanceBadge } from '../CustomerBalanceBadge';
import { getCustomerBalanceInfo } from '../../utils/balanceUtils';
import {
  CheckCircle2,
  Search,
  UserPlus,
  Share2,
  Filter,
  Calendar,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Edit,
  Database,
  Download,
  Upload,
  RefreshCw,
  Phone,
  MessageCircle,
  Send,
  Mail,
  Bluetooth,
  MoreHorizontal,
  ChevronLeft,
  AlertCircle,
  FileText,
  Users,
} from 'lucide-react';

// ================= SCREEN 15: CUSTOMERS LIST =================
export const Screen15Customers: React.FC<{
  customers: Customer[];
  onSelectCustomer: (c: Customer) => void;
  onNavigate: (s: ScreenId) => void;
  onRefresh: () => void;
}> = ({ customers, onSelectCustomer, onNavigate, onRefresh }) => {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      {/* Top Banner */}
      <PageTitle title="العملاء" />

      {/* زر إضافة عميل بعرض الشاشة */}
      {hasPermission('add_customer') && (
      <button
        type="button"
        onClick={() => onNavigate('screen-7-customer-add')}
        className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
      >
        <UserPlus className="w-4 h-4" />
        <span>إضافة عميل جديد +</span>
      </button>
      )}

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم، الهاتف، أو العنوان..."
          className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-300 text-xs bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
      </div>

      {/* Customer Cards List */}
      <div className="space-y-2">
        {filtered.map((customer) => {
          return (
            <div
              key={customer.id}
              onClick={() => {
                onSelectCustomer(customer);
                onNavigate('screen-11-customer-details');
              }}
              className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm hover:border-blue-400 cursor-pointer transition-all active:scale-99 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 font-bold text-sm flex items-center justify-center border border-blue-200 shrink-0">
                  {customer.name.slice(0, 1)}
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-800 leading-tight">
                    {customer.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                    <span className="font-mono">{customer.phone}</span>
                    {customer.address && <span>• {customer.address}</span>}
                  </div>
                </div>
              </div>

              {/* Balance Badge with Colors */}
              <div className="text-left shrink-0">
                <CustomerBalanceBadge balance={customer.balance} variant="badge" />
                <div className="text-[10px] text-slate-400 mt-0.5 text-center">
                  {customer.transactions_count || 0} عملية
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400 space-y-2">
            <Users className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">
              {customers.length === 0 ? 'لا يوجد عملاء مضافون في المشروع بعد' : 'لا توجد نتائج مطابقة لبحثك'}
            </p>
            {customers.length === 0 && hasPermission('add_customer') && (
              <button
                onClick={() => onNavigate('screen-7-customer-add')}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
              >
                + إضافة أول عميل الآن
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ================= SCREEN 16: CUSTOMER UPDATED SUCCESS =================
export const Screen16CustomerUpdatedSuccess: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <PageTitle title="تم تعديل بيانات العميل بنجاح" />

      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center my-6 shadow-lg shadow-emerald-500/10">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 stroke-[2.5]" />
      </div>

      <button
        onClick={() => onNavigate('screen-11-customer-details')}
        className="w-full max-w-xs py-3 px-6 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-sm shadow-md active:scale-98 transition-all"
      >
        حسناً
      </button>
    </div>
  );
};

// ================= SCREEN 17: SHARE MENU =================
export const Screen17ShareMenu: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const shareOptions = [
    { name: 'WhatsApp', icon: MessageCircle, color: 'bg-emerald-600' },
    { name: 'Telegram', icon: Send, color: 'theme-btn-primary' },
    { name: 'Messenger', icon: MessageCircle, color: 'theme-btn-primary' },
    { name: 'IMO', icon: MessageCircle, color: 'theme-btn-primary' },
    { name: 'Gmail', icon: Mail, color: 'theme-btn-primary' },
    { name: 'الرسائل', icon: MessageCircle, color: 'bg-emerald-600' },
    { name: 'المزيد', icon: MoreHorizontal, color: 'theme-btn-gold' },
    { name: 'بلوتوث', icon: Bluetooth, color: 'theme-btn-primary' },
  ];

  const [copiedLink, setCopiedLink] = useState(false);

  const handleDeviceShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'AH2 — تطبيق إدارة العملاء والعمليات المالية',
          text: 'إدارة عملائك وحساباتك المالية في يدك مع تطبيق AH2 المعتمد.',
          url: window.location.href,
        });
      } catch {
        // user cancelled
      }
    } else {
      navigator.clipboard?.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <PageTitle title="قائمة المشاركة" />

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
        <h3 className="text-xs font-black text-slate-700 mb-4 text-center">
          مشاركة عبر التطبيقات
        </h3>

        <div className="grid grid-cols-4 gap-4">
          {shareOptions.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.name}
                onClick={handleDeviceShare}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                <div
                  className={`w-12 h-12 rounded-2xl ${opt.color} text-white flex items-center justify-center shadow-md`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-semibold text-slate-700">{opt.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 pt-4 border-t border-slate-100">
          {copiedLink && (
            <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl text-center font-bold">
              ✓ تم نسخ رابط التطبيق بنجاح إلى الحافظة
            </div>
          )}
          <button
            onClick={handleDeviceShare}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-98"
          >
            مشاركة من الجهاز
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-2">
            سيتم فتح قائمة المشاركة الأصلية الخاصة بنظام جهازك
          </p>
        </div>
      </div>
    </div>
  );
};

// ================= SCREEN 18: ALL TRANSACTIONS =================
export const Screen18AllTransactions: React.FC<{
  transactions: Transaction[];
  onNavigate: (s: ScreenId) => void;
  onRefresh: () => void;
}> = ({ transactions, onNavigate, onRefresh }) => {
  const { project, hasPermission } = useAuth();
  // ── حالة نموذج تعديل العملية (صلاحية edit_transaction) ──
  const [editModalTx, setEditModalTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState({ amount: '', type: 'payment', date: '', time: '', description: '', reason: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editNotice, setEditNotice] = useState<string | null>(null);

  const openEdit = (t: Transaction) => {
    setEditModalTx(t);
    setEditError(null);
    setEditNotice(null);
    setEditForm({
      amount: String(t.amount ?? ''),
      type: (t as any).type ?? 'payment',
      date: (t as any).date ?? '',
      time: (t as any).time ?? '',
      description: (t as any).description ?? '',
      reason: '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editModalTx) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const res = await api.updateTransaction(editModalTx.id, {
        amount: Number(editForm.amount),
        type: editForm.type,
        date: editForm.date,
        time: editForm.time,
        description: editForm.description,
        reason: editForm.reason || undefined,
      });
      setEditNotice(res.message || 'تم تعديل العملية بنجاح');
      setEditModalTx(null);
      onRefresh();
    } catch (err: any) {
      setEditError(err?.message || 'تعذر تعديل العملية');
    } finally {
      setEditLoading(false);
    }
  };

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cancelModalTx, setCancelModalTx] = useState<Transaction | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const filtered = transactions.filter((t) => {
    if (fromDate && t.date < fromDate) return false;
    if (toDate && t.date > toDate) return false;
    return true;
  });

  const totalPayments = filtered
    .filter((t) => t.status === 'active' && t.type === 'payment')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalWithdrawals = filtered
    .filter((t) => t.status === 'active' && t.type === 'withdrawal')
    .reduce((acc, t) => acc + t.amount, 0);

  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleCancel = async () => {
    if (!cancelModalTx) return;
    setLoading(true);
    setCancelError(null);
    try {
      await api.cancelTransaction(cancelModalTx.id, cancelReason || 'تم الإلغاء بواسطة المستخدم');
      setCancelModalTx(null);
      setCancelReason('');
      onRefresh();
    } catch (err: any) {
      setCancelError(err.message || 'حدث خطأ أثناء إلغاء العملية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      {/* Banner */}
      <PageTitle title="كل العمليات" />
      {editNotice && (
        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
          {editNotice}
        </div>
      )}

      {/* زر المشاركة بعرض الشاشة */}
      <button
        type="button"
        onClick={() => setShowShareModal(true)}
        className="w-full py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
        title="مشاركة العمليات"
      >
        <Share2 className="w-4 h-4 text-slate-950" />
        <span>مشاركة العمليات</span>
      </button>

      {/* Date Filter Strip */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">من تاريخ</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-2 py-1.5 border rounded-lg text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-2 py-1.5 border rounded-lg text-xs font-mono"
          />
        </div>
      </div>

      {/* Summary Cards: إجمالي السحب vs إجمالي الإيداع */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-900">
          <div className="text-[10px] font-bold text-red-600">إجمالي السحب</div>
          <div className="text-base font-black font-mono tabular-nums mt-0.5">
            {totalWithdrawals.toLocaleString()} <span className="text-[10px] font-sans">ج.م</span>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-900">
          <div className="text-[10px] font-bold text-emerald-600">إجمالي الإيداع / الدفع</div>
          <div className="text-base font-black font-mono tabular-nums mt-0.5">
            {totalPayments.toLocaleString()} <span className="text-[10px] font-sans">ج.م</span>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-2">
        {filtered.map((t) => {
          const isCancelled = t.status === 'cancelled';
          const isPayment = t.type === 'payment';

          return (
            <div
              key={t.id}
              className={`bg-white rounded-2xl p-3.5 border shadow-sm transition-all ${
                isCancelled ? 'border-slate-200 opacity-60 bg-slate-50/80' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-800">
                      {t.customer_name || 'عميل'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCancelled
                          ? 'bg-slate-200 text-slate-600 line-through'
                          : isPayment
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {isCancelled ? 'ملغاة' : isPayment ? 'دفع (إيداع)' : 'سحب'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 mt-1 font-mono">
                    {t.date} • {t.time}
                  </div>

                  {t.description && (
                    <div className="text-[11px] text-slate-600 mt-1">
                      البيان: {t.description}
                    </div>
                  )}

                  {isCancelled && t.cancellation_reason && (
                    <div className="text-[10px] text-red-600 mt-1">
                      سبب الإلغاء: {t.cancellation_reason}
                    </div>
                  )}
                </div>

                <div className="text-left">
                  <div
                    className={`text-sm font-black font-mono tabular-nums ${
                      isCancelled
                        ? 'text-slate-400 line-through'
                        : isPayment
                        ? 'text-emerald-600'
                        : 'text-red-600'
                    }`}
                  >
                    {isPayment ? '+' : '-'} {t.amount.toLocaleString()} ج.م
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    {!isCancelled && hasPermission('edit_transaction') && (
                      <button
                        onClick={() => openEdit(t)}
                        className="mt-2 text-[10px] text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1"
                      >
                        <Edit className="w-3 h-3" />
                        تعديل العملية
                      </button>
                    )}
                    {!isCancelled && hasPermission('cancel_transaction') && (
                      <button
                        onClick={() => setCancelModalTx(t)}
                        className="mt-2 text-[10px] text-red-600 hover:text-red-800 font-bold flex items-center gap-1"
                      >
                        <Ban className="w-3 h-3" />
                        إلغاء العملية
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400">
            <FileText className="w-8 h-8 mx-auto text-slate-300 mb-1" />
            <p className="text-xs">لا توجد عمليات مسجلة في هذه الفترة</p>
          </div>
        )}
      </div>

      {/* Edit Transaction Modal — يظهر فقط لمن يملك صلاحية تعديل عملية */}
      {editModalTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-blue-700 font-black text-sm">
              <Edit className="w-5 h-5" />
              تعديل العملية المالية
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              العميل: <span className="font-bold">{editModalTx.customer_name}</span> — سيُعاد حساب رصيده تلقائيًا
              بالقيم الجديدة، ويُسجَّل التعديل في سجل التدقيق بالقيم قبل وبعد.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">المبلغ (ج.م)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="w-full p-2 border rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">النوع</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                  className="w-full p-2 border rounded-xl text-xs font-bold"
                >
                  <option value="payment">دفع</option>
                  <option value="withdrawal">سحب</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">التاريخ</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full p-2 border rounded-xl text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-1">الوقت</label>
                <input
                  type="time"
                  value={editForm.time}
                  onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                  className="w-full p-2 border rounded-xl text-xs font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 mb-1">الوصف</label>
              <input
                type="text"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full p-2 border rounded-xl text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 mb-1">سبب التعديل (يُسجَّل في السجل)</label>
              <input
                type="text"
                value={editForm.reason}
                onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                placeholder="مثال: تصحيح مبلغ مُدخل بالخطأ"
                className="w-full p-2 border rounded-xl text-xs"
              />
            </div>

            {editError && (
              <div className="p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{editError}</div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={editLoading}
                className="flex-1 py-2 rounded-xl bg-blue-700 text-white font-bold text-xs disabled:opacity-50"
              >
                {editLoading ? 'جاري الحفظ...' : 'حفظ التعديل'}
              </button>
              <button
                onClick={() => setEditModalTx(null)}
                className="flex-1 py-2 rounded-xl theme-btn-secondary font-bold text-xs"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {cancelModalTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center gap-2 text-red-600 font-black text-sm mb-2">
              <AlertCircle className="w-5 h-5" />
              تأكيد إلغاء العملية المالية
            </div>

            <p className="text-xs text-slate-600 mb-3">
              هل أنت متأكد من رغبتك في إلغاء عملية {cancelModalTx.type === 'payment' ? 'دفع' : 'سحب'} بمبلغ{' '}
              <span className="font-bold font-mono">{cancelModalTx.amount} ج.م</span> للعميل {cancelModalTx.customer_name}؟
              <br />
              <span className="text-[11px] text-slate-500">
                سيتم الاحتفاظ بالعملية في السجل كـ "ملغاة" واستبعادها فوراً من الرصيد.
              </span>
            </p>

            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                سبب الإلغاء (اختياري)
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="مثال: خطأ في المبلغ، إرجاع المبلغ..."
                className="w-full p-2 border rounded-xl text-xs"
              />
            </div>

            {cancelError && (
              <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {cancelError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 py-2 rounded-xl bg-red-600 text-white font-bold text-xs"
              >
                {loading ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
              </button>
              <button
                onClick={() => {
                  setCancelModalTx(null);
                  setCancelError(null);
                }}
                className="py-2 px-4 rounded-xl theme-btn-secondary font-bold text-xs"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          data={{
            type: 'all_transactions',
            projectName: project?.name || 'متجر OM BASMA للستائر والمفروشات',
            reportDate: new Date().toISOString().split('T')[0],
            periodText:
              fromDate && toDate
                ? `من ${fromDate} إلى ${toDate}`
                : fromDate
                ? `من تاريخ ${fromDate}`
                : toDate
                ? `حتى تاريخ ${toDate}`
                : 'كافة الفترات المسجلة',
            totalPayments,
            totalWithdrawals,
            netMovement: totalPayments - totalWithdrawals,
            totalCount: filtered.length,
            activeCount: filtered.filter((t) => t.status === 'active').length,
            cancelledCount: filtered.filter((t) => t.status === 'cancelled').length,
            transactions: filtered,
          }}
        />
      )}
    </div>
  );
};

// ================= SCREEN 19: CUSTOMER TRANSACTIONS =================
export const Screen19CustomerTransactions: React.FC<{
  customer: Customer | null;
  onNavigate: (s: ScreenId) => void;
}> = ({ customer, onNavigate }) => {
  const { project , hasPermission } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);

  const fetchTxs = async () => {
    if (!customer) return;
    try {
      const res = await api.getCustomer(customer.id);
      setTransactions(res.transactions || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchTxs();
  }, [customer]);

  if (!customer) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>يرجى اختيار عميل</p>
      </div>
    );
  }

  const filteredTxs = transactions.filter((t) => {
    if (fromDate && t.date < fromDate) return false;
    if (toDate && t.date > toDate) return false;
    return true;
  });

  const periodPayments = filteredTxs
    .filter((t) => t.status === 'active' && t.type === 'payment')
    .reduce((acc, t) => acc + t.amount, 0);

  const periodWithdrawals = filteredTxs
    .filter((t) => t.status === 'active' && t.type === 'withdrawal')
    .reduce((acc, t) => acc + t.amount, 0);

  const periodNetMovement = periodPayments - periodWithdrawals;

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      {/* Banner */}
      <PageTitle title="عمليات وكشف حساب العميل" />

      {/* أزرار الإجراءات - زر المشاركة بعرض الشاشة */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          className="w-full py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
          title="مشاركة كشف الحساب"
        >
          <Share2 className="w-4 h-4 text-slate-950" />
          <span>مشاركة كشف الحساب والعمليات</span>
        </button>

        {hasPermission('create_transaction') && (
        <button
          type="button"
          onClick={() => onNavigate('screen-14-new-transaction')}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 active:scale-98"
        >
          <span>+ تسجيل عملية جديدة</span>
        </button>
        )}
      </div>

      {/* Date Filter Strip */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">من تاريخ</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-2 py-1.5 border rounded-lg text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-2 py-1.5 border rounded-lg text-xs font-mono"
          />
        </div>
      </div>

      {/* Customer Balance Header & Period Movement */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-bold block mb-1">الرصيد التراكمي للعميل</span>
            <CustomerBalanceBadge balance={customer.balance} variant="badge" />
          </div>
          <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-lg">
            {customer.phone}
          </span>
        </div>

        {/* Period Summary Breakdown */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
          <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl">
            <div className="text-[10px] text-emerald-700 font-bold">دفع الفترة</div>
            <div className="font-black font-mono text-emerald-800 text-xs mt-0.5">
              {periodPayments.toLocaleString()} ج.م
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 p-2 rounded-xl">
            <div className="text-[10px] text-red-700 font-bold">سحب الفترة</div>
            <div className="font-black font-mono text-red-800 text-xs mt-0.5">
              {periodWithdrawals.toLocaleString()} ج.م
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-300 p-2 rounded-xl">
            <div className="text-[10px] text-amber-800 font-bold">صافي حركة الفترة</div>
            <div className="font-black font-mono text-amber-900 text-xs mt-0.5">
              {periodNetMovement.toLocaleString()} ج.م
            </div>
          </div>
        </div>

        {(fromDate || toDate) && (() => {
          const bal = getCustomerBalanceInfo(customer.balance);
          return (
            <div className="text-[10px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center space-y-0.5">
              <div>
                تنبيه محاسبي: صافي حركة الفترة (<span className="font-bold font-mono">{periodNetMovement.toLocaleString()} ج.م</span>) يمثل ناتج العمليات المحددة فقط.
              </div>
              <div className="text-slate-500">
                بينما الرصيد الكلي الحالي (<span className={`font-bold font-mono ${bal.textClass}`}>{bal.formattedAmount}</span> - <span className="font-bold">{bal.statusText}</span>) يعكس الحساب التراكمي المعتمد.
              </div>
            </div>
          );
        })()}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filteredTxs.map((t) => {
          const isCancelled = t.status === 'cancelled';
          const isPayment = t.type === 'payment';
          return (
            <div
              key={t.id}
              className={`bg-white rounded-2xl p-3.5 border shadow-sm ${
                isCancelled ? 'opacity-50 line-through' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isPayment ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {isCancelled ? 'ملغاة' : isPayment ? 'دفع' : 'سحب'}
                  </span>
                  <div className="text-[11px] text-slate-400 font-mono mt-1">
                    {t.date} • {t.time}
                  </div>
                  {t.description && (
                    <div className="text-xs text-slate-600 mt-1">{t.description}</div>
                  )}
                </div>

                <div
                  className={`text-sm font-black font-mono tabular-nums ${
                    isPayment ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {isPayment ? '+' : '-'} {t.amount.toLocaleString()} ج.م
                </div>
              </div>
            </div>
          );
        })}

        {filteredTxs.length === 0 && !loading && (
          <div className="text-center py-8 text-xs text-slate-400">
            لا توجد أي عمليات مسجلة لهذا العميل في هذه الفترة
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          data={{
            type: 'customer_statement',
            projectName: project?.name || 'مشروع إدارة الحسابات',
            reportDate: new Date().toISOString().split('T')[0],
            periodText:
              fromDate && toDate
                ? `من ${fromDate} إلى ${toDate}`
                : fromDate
                ? `من تاريخ ${fromDate}`
                : toDate
                ? `حتى تاريخ ${toDate}`
                : 'كافة العمليات المسجلة للعميل',
            customer,
            currentBalance: customer.balance,
            periodPayments,
            periodWithdrawals,
            periodNetMovement,
            transactions: filteredTxs,
          }}
        />
      )}
    </div>
  );
};

// ================= SCREEN 20: BACKUP OVERVIEW =================
export const Screen20Backup: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const { hasPermission } = useAuth();
  const [autoBackup, setAutoBackup] = useState(true);

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      <PageTitle title="النسخ الاحتياطي" />

      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        {/* Create Backup — لمن يملك إدارة النسخ الاحتياطي */}
        {hasPermission('manage_backups') && (
        <button
          onClick={() => onNavigate('screen-21-backup-create')}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-between shadow-md transition-all active:scale-98"
        >
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            <span>إنشاء نسخة احتياطية</span>
          </div>
          <ChevronLeft className="w-4 h-4" />
        </button>
        )}

        {/* Restore Backup — لمن يملك استرجاع البيانات */}
        {hasPermission('restore_data') && (
        <button
          onClick={() => onNavigate('screen-22-backup-restore')}
          className="w-full py-3 px-4 rounded-xl theme-btn-secondary font-bold text-xs flex items-center justify-between transition-all"
        >
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" />
            <span>استعادة نسخة احتياطية</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>
        )}
      </div>

      {/* Auto Backup Toggle */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-800">النسخ الاحتياطي التلقائي</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            إجراء حفظ نسخة احتياطية دورية لحماية بياناتك
          </p>
        </div>
        <button
          onClick={() => setAutoBackup(!autoBackup)}
          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
            autoBackup ? 'bg-blue-600' : 'bg-slate-300'
          }`}
        >
          <div
            className={`toggle-thumb bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
              autoBackup ? '-translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
};

// ================= SCREEN 21: BACKUP CREATE =================
export const Screen21BackupCreate: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.createBackup();
      onNavigate('screen-20-backup');
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء إنشاء النسخة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <PageTitle title="إنشاء نسخة احتياطية" />

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center border-2 border-blue-200">
          <Database className="w-8 h-8" />
        </div>

        <h3 className="font-black text-sm text-slate-800">
          هل تريد إنشاء نسخة احتياطية الآن؟
        </h3>
        <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
          سيتم حفظ جميع بيانات العملاء، العمليات المالية، والتقارير في نسخة احتياطية آمنة يمكن استعادتها في أي وقت.
        </p>

        <div className="bg-slate-50 p-3 rounded-xl border text-xs text-slate-600 space-y-1">
          <div className="flex justify-between">
            <span>تاريخ النسخة:</span>
            <span className="font-mono font-bold">{new Date().toISOString().split('T')[0]}</span>
          </div>
          <div className="flex justify-between">
            <span>الصيغة:</span>
            <span className="font-bold">JSON آمن ومشفر</span>
          </div>
        </div>

        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

        <div className="space-y-2 pt-2">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? 'جاري إنشاء النسخة...' : 'إنشاء النسخة الآن'}
          </button>
          <button
            onClick={() => onNavigate('screen-20-backup')}
            className="w-full py-2.5 rounded-xl theme-btn-secondary font-bold text-xs"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};
