import React, { useState, useEffect } from 'react';
import { Ah2Logo } from '../Ah2Logo';
import { ShopOwnerLogo } from '../ShopOwnerLogo';
import { ShareModal } from '../ShareModal';
import { PageTitle } from '../PageTitle';
import { Customer, NotificationItem, ReportsSummary, ScreenId } from '../../types';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  Bell,
  CheckCircle2,
  Lock,
  User,
  Phone,
  MapPin,
  Building,
  Info,
  Share2,
  Star,
  Settings,
  Shield,
  HelpCircle,
  Database,
  Moon,
  Sun,
  Monitor,
  Users,
  LogOut,
  Calendar,
  BarChart3,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  FileSpreadsheet,
  Trash2,
  Upload,
  Download,
  MessageCircle,
  ChevronLeft,
  AlertCircle,
  Check,
  Send,
  Eye,
  Printer,
  X,
} from 'lucide-react';

// ================= SCREEN 29: NOTIFICATIONS =================
export const Screen29Notifications: React.FC<{
  notifications: NotificationItem[];
  onNavigate: (s: ScreenId) => void;
  onRefresh: () => void;
}> = ({ notifications, onNavigate, onRefresh }) => {
  const [enableAll, setEnableAll] = useState(true);
  const [txNotifs, setTxNotifs] = useState(true);
  const [customerNotifs, setCustomerNotifs] = useState(true);
  const [backupNotifs, setBackupNotifs] = useState(true);
  const [importantAlerts, setImportantAlerts] = useState(true);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      onRefresh();
    } catch {
      // ignore
    }
  };

  const handleMarkOne = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      onRefresh();
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      <PageTitle
        title="الإشعارات"
        action={
          notifications.some((n) => !n.is_read) ? (
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-bold px-2.5 py-1 rounded-xl transition-all shadow-sm"
            >
              تحديد الكل كمقروء
            </button>
          ) : undefined
        }
      />

      {/* Settings Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <h3 className="text-xs font-black text-slate-800 border-b pb-2">
          إعدادات الإشعارات والتنبيهات
        </h3>

        {[
          { label: 'تفعيل الإشعارات', state: enableAll, setState: setEnableAll },
          { label: 'إشعارات العمليات المالية', state: txNotifs, setState: setTxNotifs },
          { label: 'إشعارات العملاء والحسابات', state: customerNotifs, setState: setCustomerNotifs },
          { label: 'إشعارات النسخ الاحتياطي', state: backupNotifs, setState: setBackupNotifs },
          { label: 'التنبيهات المهمة والأمنية', state: importantAlerts, setState: setImportantAlerts },
        ].map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs py-1">
            <span className="font-semibold text-slate-700">{item.label}</span>
            <button
              onClick={() => item.setState(!item.state)}
              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                item.state ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`toggle-thumb bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${
                  item.state ? '-translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      {/* Notification Feed */}
      <div className="space-y-2">
        <h3 className="text-xs font-black text-slate-700 px-1">سجل التنبيهات الأخير</h3>

        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => handleMarkOne(n.id)}
            className={`bg-white rounded-2xl p-3.5 border transition-all cursor-pointer ${
              n.is_read ? 'border-slate-200 bg-white' : 'border-blue-300 bg-blue-50/50 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    n.is_read ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-600'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800">{n.title}</h4>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{n.message}</p>
                  <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                    {n.created_at.split('T')[0]} • {n.created_at.split('T')[1]?.substring(0, 5)}
                  </span>
                </div>
              </div>

              {!n.is_read && (
                <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1"></span>
              )}
            </div>
          </div>
        ))}

        {notifications.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 text-slate-400">
            <Bell className="w-8 h-8 mx-auto text-slate-300 mb-1" />
            <p className="text-xs">لا توجد إشعارات جديدة حالياً</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ================= SCREEN 30: ABOUT APP =================
export const Screen30About: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      {/* 1. Official AH2 Logo at the very top of the page (أول عنصر في مقدمة الصفحة) */}
      <div className="flex flex-col items-center justify-center pt-2 pb-1">
        <Ah2Logo variant="emblem" size="md" showSubtitle={true} />
      </div>

      {/* 2. Page Title: «حول التطبيق» (التصميم المعتمد: خط أسود عريض وخطان أفقيان) */}
      <PageTitle title="حول التطبيق" />

      {/* 3. Official App Information Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm text-center flex flex-col items-center">
        <p className="text-xs sm:text-sm text-slate-700 font-medium max-w-xs leading-relaxed">
          تطبيق AH2 التجاري المتكامل لإدارة العملاء والحسابات والعمليات المالية بكل دقة وسهولة.
        </p>

        {/* Release Metadata Card (Exact user requirement) */}
        <div className="w-full mt-6 bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs space-y-2.5 text-right">
          <div className="flex justify-between items-center py-1 border-b border-slate-200">
            <span className="text-slate-500 font-semibold">إصدار التطبيق:</span>
            <span className="font-mono font-black text-blue-600">v1.0.0</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-200">
            <span className="text-slate-500 font-semibold">تاريخ الإصدار الرسمي:</span>
            <span className="font-bold text-slate-800">1 سبتمبر 2026</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-200">
            <span className="text-slate-500 font-semibold">المطور المسؤول:</span>
            <span className="font-black text-slate-900">م/ عادل العسكري</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-200">
            <span className="text-slate-500 font-semibold">حقوق النشر والملكية:</span>
            <span className="font-bold text-slate-800">© 2026 جميع الحقوق محفوظة</span>
          </div>

          <div className="flex justify-between items-center py-1">
            <span className="text-slate-500 font-semibold">اسم المشروع التجاري:</span>
            <span className="font-black text-amber-600">AH2 — إيه إتش تو</span>
          </div>
        </div>

        <div className="w-full mt-6 space-y-2">
          <button
            onClick={() => onNavigate('screen-17-share-menu')}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
          >
            <Share2 className="w-4 h-4" />
            <span>مشاركة التطبيق</span>
          </button>

          <button
            onClick={() => onNavigate('screen-35-support')}
            className="w-full py-2.5 px-4 rounded-xl theme-btn-secondary font-bold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <HelpCircle className="w-4 h-4" />
            <span>الدعم والمساعدة ودليل الاستخدام</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ================= SCREEN 31: CUSTOMER EDIT =================
export const Screen31CustomerEdit: React.FC<{
  customer: Customer | null;
  onNavigate: (s: ScreenId) => void;
  onUpdated: () => void;
}> = ({ customer, onNavigate, onUpdated }) => {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [type, setType] = useState<'individual' | 'company'>(customer?.type || 'individual');
  const [notes, setNotes] = useState(customer?.notes || '');
  const [projectPassword, setProjectPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setPhone(customer.phone);
      setAddress(customer.address || '');
      setType(customer.type || 'individual');
      setNotes(customer.notes || '');
    }
  }, [customer]);

  if (!customer) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>يرجى اختيار عميل أولاً</p>
      </div>
    );
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectPassword) {
      setError('يرجى إدخال كلمة مرور المشروع للتأكيد');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.updateCustomer(customer.id, {
        name,
        phone,
        address,
        type,
        notes,
        projectPassword,
      });
      onUpdated();
      onNavigate('screen-16-customer-updated-success');
    } catch (err: any) {
      setError(err.message || 'فشل التعديل، تحقق من كلمة مرور المشروع');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-4 pb-24 select-none">
      <PageTitle title="تعديل بيانات العميل" />

      {error && (
        <div className="p-3 rounded-xl bg-red-100 border border-red-300 text-red-700 text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleUpdate} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3.5">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">الاسم *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف *</label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">نوع العميل</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('individual')}
              className={`py-2 text-xs font-bold rounded-xl border ${
                type === 'individual' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50'
              }`}
            >
              فرد
            </button>
            <button
              type="button"
              onClick={() => setType('company')}
              className={`py-2 text-xs font-bold rounded-xl border ${
                type === 'company' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50'
              }`}
            >
              شركة
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full p-2.5 text-xs rounded-xl border border-slate-300"
          />
        </div>

        {/* Project Password verification (Mandatory in design) */}
        <div className="pt-2 border-t">
          <label className="block text-xs font-bold text-amber-800 mb-1">
            كلمة مرور المشروع للتأكيد *
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={projectPassword}
              onChange={(e) => setProjectPassword(e.target.value)}
              placeholder="أدخل كلمة مرور المشروع"
              className="w-full pr-8 pl-3 py-2 text-xs rounded-xl border border-amber-400 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            <Lock className="w-4 h-4 text-amber-500 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#1b74e4] hover:bg-[#1563c6] text-white font-bold text-xs shadow-md transition-all active:scale-98 disabled:opacity-50"
          >
            {loading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('screen-11-customer-details')}
            className="w-full py-2.5 rounded-xl theme-btn-secondary font-bold text-xs"
          >
            إلغاء
          </button>
        </div>
      </form>
    </div>
  );
};

// ================= SCREEN 32: SETTINGS =================
export const Screen32Settings: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const { user, project, logout } = useAuth();
  const { themeMode, resolvedTheme, setThemeMode } = useTheme();

  const themeOptions: { id: 'light' | 'dark' | 'system'; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'light', label: 'نهاري', icon: Sun },
    { id: 'dark', label: 'ليلي', icon: Moon },
    { id: 'system', label: 'حسب إعدادات الجهاز', icon: Monitor },
  ];

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      <PageTitle title="الإعدادات" />

      {/* Appearance / Theme Selection Card ("المظهر") */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            {resolvedTheme === 'dark' ? (
              <Moon className="w-4 h-4 text-amber-600" />
            ) : (
              <Sun className="w-4 h-4 text-amber-600" />
            )}
            <span className="font-black text-xs text-slate-800">المظهر</span>
          </div>
          <span className="text-[11px] font-bold text-slate-500">
            {themeMode === 'light'
              ? 'الوضع النهاري مفعّل'
              : themeMode === 'dark'
              ? 'الوضع الليلي مفعّل'
              : `حسب إعدادات الجهاز (${resolvedTheme === 'dark' ? 'ليلي' : 'نهاري'})`}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const isSelected = themeMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setThemeMode(opt.id)}
                className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98 ${
                  isSelected
                    ? 'theme-btn-primary shadow-sm ring-2 ring-[var(--color-gold)]/50'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 ${isSelected ? 'text-[#d4ab54]' : 'text-slate-500'}`} />
                <span className="text-[11px] leading-tight text-center">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu items */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden text-xs">
        {/* Profile */}
        <button
          onClick={() => onNavigate('screen-3-profile')}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <User className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">الملف الشخصي</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>

        {/* Change Password */}
        <button
          onClick={() => onNavigate('screen-12-change-password')}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">تغيير كلمة المرور</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>

        {/* Backup */}
        <button
          onClick={() => onNavigate('screen-20-backup')}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">النسخ الاحتياطي</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>

        {/* Data Management */}
        <button
          onClick={() => onNavigate('screen-34-data-management')}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">إدارة البيانات</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>

        {/* Notifications */}
        <button
          onClick={() => onNavigate('screen-29-notifications')}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">إشعارات التطبيق</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>

        {/* Support */}
        <button
          onClick={() => onNavigate('screen-35-support')}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <HelpCircle className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">الدعم والمساعدة</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>

        {/* About App */}
        <button
          onClick={() => onNavigate('screen-30-about')}
          className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
        >
          <div className="flex items-center gap-3">
            <Info className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">حول التطبيق</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Logout Button */}
      <button
        onClick={async () => {
          await logout();
          onNavigate('screen-4-login');
        }}
        className="w-full py-3 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs border border-red-200 flex items-center justify-center gap-2 transition-all active:scale-98"
      >
        <LogOut className="w-4 h-4" />
        <span>تسجيل الخروج</span>
      </button>

      <div className="text-center pt-2 text-[10px] text-slate-400">
        تطبيق AH2 • الإصدار 1.0.0 • تاريخ التسجيل: {user?.created_at?.split('T')[0] || '2026-09-01'}
      </div>
    </div>
  );
};

// ================= SCREEN 33: REPORTS & STATISTICS =================
export const Screen33Reports: React.FC<{
  onNavigate: (s: ScreenId) => void;
}> = ({ onNavigate }) => {
  const { project } = useAuth();
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.getReportsSummary(fromDate, toDate);
      setSummary(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [fromDate, toDate]);

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      <PageTitle title="التقارير والإحصائيات" />

      {/* أزرار الإجراءات - زر المشاركة بعرض الشاشة */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowShareModal(true)}
          className="w-full py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-sm active:scale-98 transition-all"
          title="مشاركة التقرير والإحصائيات"
        >
          <Share2 className="w-4 h-4 text-slate-950" />
          <span>مشاركة التقرير والإحصائيات</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPrintModal(true)}
          className="w-full py-2 px-4 rounded-xl theme-btn-secondary font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm active:scale-98"
          title="معاينة وطباعة التقرير"
        >
          <Printer className="w-4 h-4 text-slate-700" />
          <span>معاينة وطباعة التقرير</span>
        </button>
      </div>

      {/* Date Filter */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-sm grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">من تاريخ</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full p-1.5 border rounded-lg text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 font-bold mb-1">إلى تاريخ</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full p-1.5 border rounded-lg text-xs font-mono"
          />
        </div>
      </div>

      {/* 4 Metric Cards (Matching reference Screen 33) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Total Customers */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
          <span className="text-[10px] text-slate-500 font-bold">إجمالي العملاء</span>
          <div className="text-xl font-black font-mono text-slate-800 mt-1">
            {summary?.totalCustomers ?? 0}
          </div>
        </div>

        {/* Total Transactions */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm">
          <span className="text-[10px] text-slate-500 font-bold">إجمالي العمليات</span>
          <div className="text-xl font-black font-mono text-blue-600 mt-1">
            {summary?.totalTransactions ?? 0}
          </div>
        </div>

        {/* Total Withdrawals */}
        <div className="bg-red-50 rounded-2xl p-3.5 border border-red-200 shadow-sm">
          <span className="text-[10px] text-red-600 font-bold">إجمالي السحب</span>
          <div className="text-xl font-black font-mono text-red-700 mt-1 tabular-nums">
            {(summary?.totalWithdrawals ?? 0).toLocaleString()} <span className="text-[10px] font-sans">ج.م</span>
          </div>
        </div>

        {/* Total Payments */}
        <div className="bg-emerald-50 rounded-2xl p-3.5 border border-emerald-200 shadow-sm">
          <span className="text-[10px] text-emerald-600 font-bold">إجمالي الإيداع</span>
          <div className="text-xl font-black font-mono text-emerald-800 mt-1 tabular-nums">
            {(summary?.totalPayments ?? 0).toLocaleString()} <span className="text-[10px] font-sans">ج.م</span>
          </div>
        </div>
      </div>

      {/* Net Balance Banner */}
      <div className="bg-[var(--bg-header)] text-white rounded-2xl p-4 border border-[#1b3453] flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-300 font-bold">صافي الموقف المالي (الأرصدة)</span>
          <div className="text-2xl font-black font-mono text-[#d4ab54] mt-0.5 tabular-nums">
            {(summary?.netBalance ?? 0).toLocaleString()} ج.م
          </div>
        </div>
        <button
          onClick={() => onNavigate('screen-18-all-transactions')}
          className="px-3 py-1.5 theme-btn-gold rounded-xl text-xs font-bold transition-all"
        >
          عرض السجل
        </button>
      </div>

      {/* Action to view / print report carrying Shop Owner Identity */}
      <button
        onClick={() => setShowPrintModal(true)}
        className="w-full py-3 px-4 rounded-xl theme-btn-gold font-black text-xs shadow-sm flex items-center justify-center gap-2 transition-all active:scale-98"
      >
        <Printer className="w-4 h-4 text-[#0f233c]" />
        <span>معاينة وطباعة التقرير المالي بهوية المحل (PDF)</span>
      </button>

      {/* Printable Report Modal carrying Shop Owner Logo */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <span className="font-bold text-xs text-slate-700">معاينة تقرير الموقف المالي</span>
              <button
                onClick={() => setShowPrintModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Report Sheet (Always Print-Friendly White Paper) */}
            <div className="printable-invoice-sheet p-4 rounded-xl border border-amber-300 bg-[#fffdf7] text-slate-800 space-y-4">
              {/* Header with Shop Owner Logo */}
              <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                <ShopOwnerLogo variant="report" />
                <div className="text-left font-mono text-[11px] text-slate-500">
                  <div>تقرير مالي معتمد</div>
                  <div>التاريخ: {new Date().toISOString().split('T')[0]}</div>
                </div>
              </div>

              {/* Filter Period */}
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs flex justify-between font-mono">
                <span>الفترة:</span>
                <span>{fromDate || 'البداية'} إلى {toDate || 'اليوم'}</span>
              </div>

              {/* Metrics Breakdown */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">إجمالي العملاء:</span>
                  <span className="font-bold font-mono">{summary?.totalCustomers ?? 0} عميل</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">إجمالي العمليات:</span>
                  <span className="font-bold font-mono">{summary?.totalTransactions ?? 0} عملية</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>إجمالي الإيداعات / المدفوعات:</span>
                  <span className="font-bold font-mono">{(summary?.totalPayments ?? 0).toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between text-red-700">
                  <span>إجمالي السحوبات:</span>
                  <span className="font-bold font-mono">{(summary?.totalWithdrawals ?? 0).toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-black text-sm text-slate-900">
                  <span>صافي الموقف المالي:</span>
                  <span className="font-mono text-amber-700">{(summary?.netBalance ?? 0).toLocaleString()} ج.م</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-amber-200">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white border border-amber-400 p-0.5 flex items-center justify-center shrink-0 shadow-xs">
                    <img
                      src="/shop_owner_logo_emblem.png"
                      alt="لوجو OM BASMA"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="font-bold text-[11px] text-slate-800">
                    متجر OM BASMA للستائر والمفروشات
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1 shrink-0">
                  <Ah2Logo variant="footer" showSubtitle={false} />
                  <span className="text-[9.5px] font-bold text-slate-600 leading-none text-center whitespace-nowrap">
                    نظام AH2 المعتمد
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة التقرير (Print / PDF)</span>
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
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
            type: 'reports_summary',
            projectName: project?.name || 'متجر OM BASMA للستائر والمفروشات',
            reportDate: new Date().toISOString().split('T')[0],
            periodText:
              fromDate && toDate
                ? `من ${fromDate} إلى ${toDate}`
                : fromDate
                ? `من تاريخ ${fromDate}`
                : toDate
                ? `حتى تاريخ ${toDate}`
                : 'كافة الفترات والعمليات',
            totalCustomers: summary?.totalCustomers ?? 0,
            totalTransactions: summary?.totalTransactions ?? 0,
            totalPayments: summary?.totalPayments ?? 0,
            totalWithdrawals: summary?.totalWithdrawals ?? 0,
            netBalance: summary?.netBalance ?? 0,
          }}
        />
      )}
    </div>
  );
};

// ================= SCREEN 34: DATA MANAGEMENT =================
export const Screen34DataManagement: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const items = [
    {
      title: 'إدارة العملاء',
      desc: 'إضافة وتعديل وحذف بيانات العملاء وحساباتهم',
      target: 'screen-15-customers' as ScreenId,
      icon: Users,
      color: 'text-blue-600',
    },
    {
      title: 'إدارة العمليات',
      desc: 'عرض وتنظيم جميع العمليات المالية والمصادقات',
      target: 'screen-18-all-transactions' as ScreenId,
      icon: FileSpreadsheet,
      color: 'text-blue-600',
    },
    {
      title: 'إدارة التقارير',
      desc: 'إدارة بيانات التقارير والإحصائيات والتحليلات',
      target: 'screen-33-reports' as ScreenId,
      icon: BarChart3,
      color: 'text-amber-700',
    },
    {
      title: 'إعادة تعيين البيانات',
      desc: 'حذف جميع البيانات وإعادة ضبط التطبيق للوضع الافتراضي',
      target: 'screen-24-reset-data' as ScreenId,
      icon: Trash2,
      color: 'text-red-600',
    },
    {
      title: 'استيراد البيانات',
      desc: 'استيراد البيانات وقواعد الحسابات من ملف خارجي',
      target: 'screen-25-data-import' as ScreenId,
      icon: Upload,
      color: 'text-emerald-600',
    },
    {
      title: 'تصدير البيانات',
      desc: 'تصدير البيانات إلى ملف خارجي بصيغة مدعومة',
      target: 'screen-27-data-export' as ScreenId,
      icon: Download,
      color: 'text-blue-600',
    },
  ];

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      <PageTitle title="إدارة البيانات" />

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onClick={() => onNavigate(item.target)}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl bg-slate-50 border border-slate-200 ${item.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-xs text-slate-800">{item.title}</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ================= SCREEN 35: SUPPORT & HELP =================
export const Screen35Support: React.FC<{ onNavigate: (s: ScreenId) => void }> = ({ onNavigate }) => {
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sent, setSent] = useState(false);

  const faqs = [
    {
      q: 'كيف يتم احتساب رصيد العميل؟',
      a: 'الرصيد = إجمالي الدفع الفعلي − إجمالي السحب الفعلي مع استبعاد العمليات الملغاة. الرصيد الموجب يعني أن المبلغ لصالح العميل (المحل مدين للعميل به)، والرصيد السالب يعني أن المبلغ مستحق للمحل على العميل، والرصيد صفر يعني أن الحساب متعادل.',
    },
    {
      q: 'ماذا يحدث عند إلغاء عملية مالية؟',
      a: 'العملية الملغاة لا تُحذف نهائياً، بل يُشار إليها بـ "ملغاة" ويتم استبعادها فوراً من احتساب الرصيد للحفاظ على الشفافية وسجل التدقيق.',
    },
    {
      q: 'لماذا يُطلب كلمة مرور المشروع؟',
      a: 'لتأمين العمليات الحساسة مثل تعديل بيانات العميل، أو حذف عميل، أو استعادة النسخ الاحتياطية وإعادة تعيين البيانات.',
    },
    {
      q: 'كيف أنشئ نسخة احتياطية؟',
      a: 'من شاشة الإعدادات > النسخ الاحتياطي > إنشاء نسخة احتياطية، وسيتم حفظ ملف آمن لجميع بيانات مشروعك.',
    },
  ];

  return (
    <div className="p-4 max-w-md mx-auto space-y-3.5 pb-24 select-none">
      <PageTitle title="الدعم والمساعدة" />

      {/* Main Support Options */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div className="font-bold text-xs text-slate-800 border-b pb-2">
          الأسئلة الشائعة وإجاباتها
        </div>

        <div className="space-y-2">
          {faqs.map((f, i) => (
            <div key={i} className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <button
                onClick={() => setActiveFaq(activeFaq === i ? null : i)}
                className="w-full p-3 font-bold text-slate-800 flex justify-between items-center bg-slate-50 hover:bg-slate-100 text-right"
              >
                <span>{f.q}</span>
                <span className="text-slate-400">{activeFaq === i ? '▲' : '▼'}</span>
              </button>
              {activeFaq === i && (
                <div className="p-3 bg-white text-slate-600 text-[11px] leading-relaxed border-t">
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact & Feedback buttons */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-2.5">
        <button
          onClick={() => setShowContactModal(true)}
          className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-between transition-all"
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" />
            <span>التواصل مع الدعم الفني</span>
          </div>
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button
          onClick={() => setShowContactModal(true)}
          className="w-full py-3 px-4 rounded-xl theme-btn-secondary font-bold text-xs flex items-center justify-between transition-all"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>الإبلاغ عن مشكلة أو اقتراح</span>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Developer note */}
      <div className="p-4 bg-slate-50 rounded-2xl border text-center text-[11px] text-slate-500 space-y-1">
        <p className="font-bold text-slate-700">تطبيق AH2 التجاري الرسمي</p>
        <p>المطور: م/ عادل العسكري • حقوق النشر © 2026</p>
      </div>

      {/* Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl border border-slate-200">
            <h3 className="font-black text-sm text-slate-800 mb-2">
              التواصل مع الدعم الفني
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              أرسل استفسارك أو مشكلتك وسيتم الرد عليك في أقرب وقت.
            </p>

            {sent ? (
              <div className="text-center py-6 text-emerald-600 text-xs font-bold space-y-2">
                <CheckCircle2 className="w-10 h-10 mx-auto" />
                <p>تم إرسال رسالتك بنجاح، شكراً لتواصلك معنا!</p>
                <button
                  onClick={() => {
                    setShowContactModal(false);
                    setSent(false);
                    setFeedback('');
                  }}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs"
                >
                  إغلاق
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="اكتب رسالتك أو استفسارك هنا بالتفصيل..."
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (feedback.trim()) setSent(true);
                    }}
                    className="flex-1 py-2 rounded-xl bg-blue-600 text-white font-bold text-xs"
                  >
                    إرسال الرسالة
                  </button>
                  <button
                    onClick={() => setShowContactModal(false)}
                    className="py-2 px-4 rounded-xl theme-btn-secondary font-bold text-xs"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
