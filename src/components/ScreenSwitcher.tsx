import React, { useState } from 'react';
import { ScreenId } from '../types';
import { X, Search, CheckCircle2, ChevronLeft, Layers } from 'lucide-react';

interface ScreenSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  currentScreen: ScreenId;
  onSelectScreen: (screen: ScreenId) => void;
}

export const ALL_35_SCREENS: { id: ScreenId; num: number; title: string; category: string }[] = [
  { id: 'screen-1-splash', num: 1, title: 'شاشة البداية (Splash)', category: 'الدخول والبداية' },
  { id: 'screen-2-customer-added-success', num: 2, title: 'تم إضافة عميل بنجاح', category: 'العملاء' },
  { id: 'screen-3-profile', num: 3, title: 'الملف الشخصي', category: 'الحساب' },
  { id: 'screen-4-login', num: 4, title: 'تسجيل الدخول وإنشاء حساب', category: 'الدخول والبداية' },
  { id: 'screen-5-home', num: 5, title: 'الشاشة الرئيسية (الرصيد الموجب والسالب)', category: 'الرئيسية' },
  { id: 'screen-6-customer-delete', num: 6, title: 'حذف العميل مع كلمة المرور', category: 'العملاء' },
  { id: 'screen-7-customer-add', num: 7, title: 'إضافة عميل جديد', category: 'العملاء' },
  { id: 'screen-8-password-changed-success', num: 8, title: 'تم تغيير كلمة المرور بنجاح', category: 'الحساب' },
  { id: 'screen-9-app-logo', num: 9, title: 'شعار التطبيق الرسمي', category: 'الهوية' },
  { id: 'screen-10-customer-deleted-success', num: 10, title: 'تم حذف العميل بنجاح', category: 'العملاء' },
  { id: 'screen-11-customer-details', num: 11, title: 'بيانات العميل', category: 'العملاء' },
  { id: 'screen-12-change-password', num: 12, title: 'تغيير كلمة المرور', category: 'الحساب' },
  { id: 'screen-13-transaction-saved-success', num: 13, title: 'تم حفظ العملية بنجاح', category: 'العمليات' },
  { id: 'screen-14-new-transaction', num: 14, title: 'عملية جديدة (دفع / سحب)', category: 'العمليات' },
  { id: 'screen-15-customers', num: 15, title: 'العملاء وإدارة الحسابات', category: 'العملاء' },
  { id: 'screen-16-customer-updated-success', num: 16, title: 'تم تحديث بيانات العميل بنجاح', category: 'العملاء' },
  { id: 'screen-17-share-menu', num: 17, title: 'قائمة المشاركة', category: 'المشاركة' },
  { id: 'screen-18-all-transactions', num: 18, title: 'كل العمليات (سجل الحسابات والإلغاء)', category: 'العمليات' },
  { id: 'screen-19-customer-transactions', num: 19, title: 'عمليات العميل المحددة', category: 'العمليات' },
  { id: 'screen-20-backup', num: 20, title: 'النسخ الاحتياطي', category: 'البيانات والنسخ' },
  { id: 'screen-21-backup-create', num: 21, title: 'إنشاء نسخة احتياطية', category: 'البيانات والنسخ' },
  { id: 'screen-22-backup-restore', num: 22, title: 'استعادة النسخة الاحتياطية', category: 'البيانات والنسخ' },
  { id: 'screen-23-reset-data-success', num: 23, title: 'تم إعادة تعيين البيانات بنجاح', category: 'البيانات والنسخ' },
  { id: 'screen-24-reset-data', num: 24, title: 'إعادة تعيين البيانات', category: 'البيانات والنسخ' },
  { id: 'screen-25-data-import', num: 25, title: 'استيراد البيانات', category: 'البيانات والنسخ' },
  { id: 'screen-26-data-import-success', num: 26, title: 'تم استيراد البيانات بنجاح', category: 'البيانات والنسخ' },
  { id: 'screen-27-data-export', num: 27, title: 'تصدير البيانات', category: 'البيانات والنسخ' },
  { id: 'screen-28-data-export-success', num: 28, title: 'تم تصدير البيانات بنجاح', category: 'البيانات والنسخ' },
  { id: 'screen-29-notifications', num: 29, title: 'الإشعارات والتنبيهات', category: 'الإعدادات' },
  { id: 'screen-30-about', num: 30, title: 'حول التطبيق وبيانات الإصدار', category: 'الهوية' },
  { id: 'screen-31-customer-edit', num: 31, title: 'تعديل بيانات العميل', category: 'العملاء' },
  { id: 'screen-32-settings', num: 32, title: 'الإعدادات العامة', category: 'الإعدادات' },
  { id: 'screen-33-reports', num: 33, title: 'التقارير والإحصائيات المالية', category: 'التقارير' },
  { id: 'screen-34-data-management', num: 34, title: 'إدارة البيانات المركزية', category: 'البيانات والنسخ' },
  { id: 'screen-35-support', num: 35, title: 'الدعم والمساعدة والأسئلة الشائعة', category: 'المساعدة' },
];

export const ScreenSwitcher: React.FC<ScreenSwitcherProps> = ({
  isOpen,
  onClose,
  currentScreen,
  onSelectScreen,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = ALL_35_SCREENS.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.num.toString().includes(search) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 text-slate-800">
        {/* Header */}
        <div className="bg-[#0c1e34] text-white p-4 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-bold text-base leading-tight">خريطة شاشات AH2 الـ35 الأصلية</h2>
              <p className="text-[11px] text-slate-300">اختر أي شاشة للانتقال المباشر إليها وفحصها</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم الشاشة أو الاسم (مثال: 14، عملية جديدة، نسخ)..."
              className="w-full pr-9 pl-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* Screens List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 divide-y divide-slate-100">
          {filtered.map((screen) => {
            const isCurrent = currentScreen === screen.id;
            return (
              <button
                key={screen.id}
                onClick={() => {
                  onSelectScreen(screen.id);
                  onClose();
                }}
                className={`w-full pt-2 pb-2 px-3 rounded-xl flex items-center justify-between transition-all text-right ${
                  isCurrent
                    ? 'bg-blue-50 border border-blue-300 text-blue-900 font-bold'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${
                      isCurrent
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {screen.num}
                  </span>
                  <div>
                    <div className="text-xs font-semibold">{screen.title}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{screen.category}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  {isCurrent ? (
                    <span className="flex items-center gap-1 text-blue-600 text-[11px] font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                      الحالية
                    </span>
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-8 text-xs text-slate-400">
              لا توجد شاشة مطابقة لنتائج البحث
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-500">
          جميع الشاشات الـ35 مطبقة بكامل وظائفها الحقيقية وقواعد البيانات
        </div>
      </div>
    </div>
  );
};
