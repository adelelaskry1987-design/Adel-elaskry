import React, { useState, useEffect } from 'react';
import { Ah2Logo } from '../Ah2Logo';
import { ShopOwnerLogo } from '../ShopOwnerLogo';
import { InvoiceFooter } from '../InvoiceFooter';
import { ShareModal } from '../ShareModal';
import { Customer, Transaction, ScreenId } from '../../types';
import { api } from '../../services/api';
import { PageTitle } from '../PageTitle';
import { CustomerBalanceBadge } from '../CustomerBalanceBadge';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle2,
  Lock,
  User,
  Phone,
  MapPin,
  Calendar,
  Edit,
  Trash2,
  PlusCircle,
  FileText,
  DollarSign,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Printer,
  X,
  Share2,
} from 'lucide-react';

// ================= SCREEN 8: PASSWORD CHANGED SUCCESS =================
export const Screen8PasswordChangedSuccess: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <PageTitle title="تم تغيير كلمة المرور بنجاح" />

      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center my-6 shadow-lg shadow-emerald-500/10">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 stroke-[2.5]" />
      </div>

      <button
        onClick={() => onNavigate('screen-32-settings')}
        className="w-full max-w-xs py-3 px-6 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-sm shadow-md active:scale-98 transition-all"
      >
        حسناً
      </button>
    </div>
  );
};

// ================= SCREEN 9: APP LOGO =================
export const Screen9AppLogo: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex flex-col items-center justify-between p-6 text-[var(--text-primary)] text-center select-none transition-colors duration-200">
      <div className="w-full flex justify-between items-center text-xs text-[var(--text-muted)]">
        <span className="font-mono">10:30</span>
        <span className="text-[11px] bg-amber-50 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-300 font-bold">
          الهوية الرسمية
        </span>
      </div>

      <div className="my-auto flex flex-col items-center gap-6 bg-[var(--bg-header)] border-2 border-[var(--color-gold)]/70 rounded-3xl p-6 shadow-xl text-white">
        <div className="flex flex-col items-center bg-white/5 border-2 border-[#c59a3f]/60 rounded-3xl p-4 shadow-md">
          <ShopOwnerLogo variant="default" size="2xl" showTitle={false} />
        </div>
        <Ah2Logo variant="splash" size="md" showSubtitle={true} />
        <p className="mt-2 text-xs text-slate-300 max-w-xs leading-relaxed">
          هوية متجر OM BASMA المعتمدة على تطبيق AH2 لإدارة العملاء والعمليات المالية والحسابات
        </p>

        <button
          onClick={() => onNavigate('screen-5-home')}
          className="mt-6 py-3 px-8 rounded-xl theme-btn-gold font-black text-xs shadow-md transition-all active:scale-98"
        >
          العودة للرئيسية
        </button>
      </div>

      <div className="text-[11px] text-[var(--text-muted)]">
        المطور: م/ عادل العسكري • تاريخ الإصدار: 1 سبتمبر 2026
      </div>
    </div>
  );
};

// ================= SCREEN 10: CUSTOMER DELETED SUCCESS =================
export const Screen10CustomerDeletedSuccess: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <PageTitle title="تم حذف العميل" />

      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center my-6 shadow-lg shadow-emerald-500/10">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 stroke-[2.5]" />
      </div>

      <button
        onClick={() => onNavigate('screen-15-customers')}
        className="w-full max-w-xs py-3 px-6 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-sm shadow-md active:scale-98 transition-all"
      >
        العودة إلى العملاء
      </button>
    </div>
  );
};

// ================= SCREEN 11: CUSTOMER DETAILS =================
export const Screen11CustomerDetails: React.FC<{
  customer: Customer | null;
  onNavigate: (s: ScreenId) => void;
}> = ({ customer, onNavigate }) => {
  if (!customer) {
    return (
      <div className="p-8 text-center text-slate-500 select-none">
        <p className="text-sm">لم يتم تحديد عميل</p>
        <button
          onClick={() => onNavigate('screen-15-customers')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
        >
          الانتقال لقائمة العملاء
        </button>
      </div>
    );
  }

  const { project , hasPermission } = useAuth();
  const [showInvoice, setShowInvoice] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [customerTxs, setCustomerTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    if (customer?.id) {
      api.getCustomer(customer.id).then((res) => {
        setCustomerTxs(res.transactions || []);
      }).catch(() => {});
    }
  }, [customer?.id]);

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      {/* Title banner */}
      <PageTitle title="بيانات العميل" />

      {/* زر المشاركة بعرض الشاشة */}
      <button
        type="button"
        onClick={() => setShowShareModal(true)}
        className="w-full py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
        title="مشاركة كشف الحساب"
      >
        <Share2 className="w-4 h-4 text-slate-950" />
        <span>مشاركة كشف الحساب</span>
      </button>

      {/* Main info card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-base shadow-inner">
            {customer.name.slice(0, 1)}
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-sm">{customer.name}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">{customer.phone}</p>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span className="flex items-center gap-1.5 text-slate-400">
              <MapPin className="w-4 h-4 text-blue-500" />
              العنوان
            </span>
            <span className="font-semibold text-slate-800">{customer.address || 'غير محدد'}</span>
          </div>

          <div className="flex items-center justify-between text-slate-600">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Calendar className="w-4 h-4 text-blue-500" />
              تاريخ تسجيل العميل
            </span>
            <span className="font-semibold text-slate-800 font-mono">
              {customer.created_at ? customer.created_at.split('T')[0] : '2026-09-01'}
            </span>
          </div>
        </div>
      </div>

      {/* Balance Hero Card */}
      <CustomerBalanceBadge balance={customer.balance} variant="hero" />

      {/* Action Buttons */}
      <div className="space-y-2.5 pt-1">
        {/* New Transaction */}
        {hasPermission('create_transaction') && (
        <button
          onClick={() => onNavigate('screen-14-new-transaction')}
          className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4" />
            <span>تسجيل عملية جديدة للعميل</span>
          </div>
          <ArrowRight className="w-4 h-4" />
        </button>
        )}

        {/* View Customer Transactions */}
        {hasPermission('view_customer_transactions') && (
        <button
          onClick={() => onNavigate('screen-19-customer-transactions')}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span>سجل عمليات العميل ({customer.transactions_count || 0})</span>
          </div>
          <ArrowRight className="w-4 h-4" />
        </button>
        )}

        {/* Print Invoice with Shop Owner Identity */}
        {hasPermission('share_invoices') && (
        <button
          onClick={() => setShowInvoice(true)}
          className="w-full py-3 px-4 rounded-xl theme-btn-gold font-black text-xs shadow-sm flex items-center justify-between active:scale-98 transition-all"
        >
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-[#0f233c]" />
            <span>طباعة فاتورة / كشف حساب بهوية المحل</span>
          </div>
          <ArrowRight className="w-4 h-4 text-[#0f233c]" />
        </button>
        )}

        {/* Edit Customer */}
        {hasPermission('edit_customer') && (
        <button
          onClick={() => onNavigate('screen-31-customer-edit')}
          className="w-full py-2.5 px-4 rounded-xl theme-btn-secondary font-bold text-xs flex items-center justify-between transition-all"
        >
          <div className="flex items-center gap-2">
            <Edit className="w-4 h-4 text-blue-600" />
            <span>تعديل بيانات العميل</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400" />
        </button>
        )}

        {/* Delete Customer */}
        {hasPermission('delete_customer') && (
        <button
          onClick={() => onNavigate('screen-6-customer-delete')}
          className="w-full py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs border border-red-200 flex items-center justify-between transition-all"
        >
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-600" />
            <span>حذف العميل</span>
          </div>
          <ArrowRight className="w-4 h-4 text-red-400" />
        </button>
        )}
      </div>

      {/* Invoice / Statement Modal carrying Shop Owner Identity */}
      {showInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <span className="font-bold text-xs text-slate-700">معاينة الفاتورة وكشف الحساب</span>
              <button
                onClick={() => setShowInvoice(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Invoice Printable Sheet (Scaled 30% smaller, Always Print-Friendly White Paper) */}
            <div className="printable-invoice-sheet max-w-[340px] mx-auto p-3 rounded-xl border border-amber-300 bg-[#fffdf7] text-slate-800 space-y-2.5">
              {/* Clean Statement Header (No shop logo at top per rule 4) */}
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <div>
                  <h3 className="font-black text-xs text-[#0f233c]">فاتورة وكشف حساب العميل</h3>
                  <div className="text-[9px] text-slate-500 font-mono">رقم الكشف: #{customer.id.slice(0, 8)}</div>
                </div>
                <div className="text-left font-mono text-[9.5px] text-slate-500">
                  <div>التاريخ: {new Date().toISOString().split('T')[0]}</div>
                  <div className="text-[9px] text-slate-400">نظام AH2</div>
                </div>
              </div>

              {/* Customer Box */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 text-[10.5px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">العميل:</span>
                  <span className="font-black text-slate-800">{customer.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الهاتف:</span>
                  <span className="font-bold font-mono text-slate-800">{customer.phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">العنوان:</span>
                  <span className="font-medium text-slate-700">{customer.address || 'غير محدد'}</span>
                </div>
              </div>

              {/* Financial Status */}
              <div className="bg-white p-2 rounded-lg border border-slate-200 text-[10.5px] space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">إجمالي العمليات:</span>
                  <span className="font-bold font-mono">{customer.transactions_count || 0}</span>
                </div>
                <div className="flex justify-between items-center border-t pt-1 font-bold">
                  <span className="text-slate-800">الرصيد الحالي:</span>
                  <CustomerBalanceBadge balance={customer.balance} variant="inline" />
                </div>
              </div>

              {/* Invoice Footer with Shop Logo (Far Right) and Project AH2 Logo (Far Left) */}
              <InvoiceFooter className="bg-white/80 p-2 rounded-xl border border-amber-200/80" />
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الفاتورة (Print / PDF)</span>
              </button>
              <button
                onClick={() => setShowInvoice(false)}
                className="py-2.5 px-4 rounded-xl theme-btn-secondary font-bold text-xs"
              >
                إغلاق
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
            type: 'customer_statement',
            projectName: project?.name || 'مشروع إدارة الحسابات',
            reportDate: new Date().toISOString().split('T')[0],
            periodText: 'كافة العمليات المسجلة للعميل',
            customer,
            currentBalance: customer.balance,
            periodPayments: customer.total_payments || 0,
            periodWithdrawals: customer.total_withdrawals || 0,
            periodNetMovement: (customer.total_payments || 0) - (customer.total_withdrawals || 0),
            transactions: customerTxs,
          }}
        />
      )}
    </div>
  );
};

// ================= SCREEN 12: CHANGE PASSWORD =================
export const Screen12ChangePassword: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword) {
      setError('يرجى إدخال كلمة المرور القديمة والجديدة');
      return;
    }
    if (newPassword.length < 6) {
      setError('كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('تأكيد كلمة المرور غير متطابق');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.changePassword({ oldPassword, newPassword, confirmPassword });
      onNavigate('screen-8-password-changed-success');
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <PageTitle title="تغيير كلمة المرور" />

      {error && (
        <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-700 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            كلمة المرور القديمة *
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الحالية"
              className="w-full pr-8 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <Lock className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            كلمة المرور الجديدة *
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الجديدة"
              className="w-full pr-8 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <Lock className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            تأكيد كلمة المرور الجديدة *
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد إدخال كلمة المرور الجديدة"
              className="w-full pr-8 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <Lock className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('screen-32-settings')}
            className="w-full py-2.5 rounded-xl theme-btn-secondary font-bold text-xs transition-all"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
};

// ================= SCREEN 13: TRANSACTION SAVED SUCCESS =================
export const Screen13TransactionSavedSuccess: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <PageTitle title="تم حفظ العملية بنجاح" />

      <div className="w-24 h-24 rounded-full bg-emerald-50 border-4 border-emerald-500 flex items-center justify-center my-6 shadow-lg shadow-emerald-500/10">
        <CheckCircle2 className="w-14 h-14 text-emerald-500 stroke-[2.5]" />
      </div>

      <div className="w-full max-w-xs space-y-3">
        <button
          onClick={() => onNavigate('screen-11-customer-details')}
          className="w-full py-3 px-6 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-sm shadow-md active:scale-98 transition-all"
        >
          العودة إلى العميل
        </button>
        <button
          onClick={() => onNavigate('screen-18-all-transactions')}
          className="w-full py-2.5 px-6 rounded-xl theme-btn-secondary font-bold text-xs transition-all"
        >
          عرض كل العمليات
        </button>
      </div>
    </div>
  );
};

// ================= SCREEN 14: NEW TRANSACTION =================
// CRITICAL USER REQUIREMENT #1: Official name is "عملية جديدة", NOT "تعديل عملية"!
export const Screen14NewTransaction: React.FC<{
  customer: Customer | null;
  onNavigate: (s: ScreenId) => void;
  onTransactionSaved: () => void;
}> = ({ customer, onNavigate, onTransactionSaved }) => {
  const [type, setType] = useState<'payment' | 'withdrawal'>('payment');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!customer) {
    return (
      <div className="p-8 text-center text-slate-500 select-none">
        <p className="text-sm">يرجى اختيار عميل أولاً لتسجيل عملية له</p>
        <button
          onClick={() => onNavigate('screen-15-customers')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
        >
          اختيار عميل
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setError('يرجى إدخال مبلغ صحيح أكبر من صفر');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const time = now.toTimeString().split(' ')[0].substring(0, 5);

      await api.createTransaction({
        customerId: customer.id,
        type,
        amount: num,
        date,
        time,
        description: description.trim(),
      });

      onTransactionSaved();
      onNavigate('screen-13-transaction-saved-success');
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء حفظ العملية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      {/* Official Name Header as per User Modification #1: "عملية جديدة" */}
      <PageTitle title="عملية جديدة" />

      {/* Customer summary card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <span className="text-[10px] text-slate-400 font-semibold">العميل</span>
          <h3 className="font-black text-slate-800 text-sm">{customer.name}</h3>
          <span className="text-xs text-slate-500 font-mono">{customer.phone}</span>
        </div>

        <div className="text-left">
          <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">الرصيد الحالي</span>
          <CustomerBalanceBadge balance={customer.balance} variant="badge" />
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-700 text-xs">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-4">
        {/* Transaction Type Buttons: دفع (Green/Positive) vs سحب (Red/Negative) */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            نوع العملية *
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('payment')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all ${
                type === 'payment'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>دفع (إيداع / موجب)</span>
            </button>

            <button
              type="button"
              onClick={() => setType('withdrawal')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-all ${
                type === 'withdrawal'
                  ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-600/20'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <TrendingDown className="w-4 h-4" />
              <span>سحب (خصم / سالب)</span>
            </button>
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            المبلغ (ج.م) *
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full pr-8 pl-3 py-2 text-sm font-mono font-bold rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <span className="absolute right-3 top-2 text-xs font-bold text-slate-400">
              ج.م
            </span>
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            التاريخ *
          </label>
          <div className="relative">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full pr-8 pl-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <Calendar className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            بيانات العملية (البيان)
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="أدخل بيان أو تفاصيل العملية..."
            className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? 'جاري الحفظ...' : 'حفظ العملية'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('screen-11-customer-details')}
            className="w-full py-2.5 rounded-xl theme-btn-secondary font-bold text-xs transition-all"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
};
