import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  UserPlus,
  ClipboardCheck,
  Search,
  ShieldCheck,
  ShieldOff,
  Clock,
  UserX,
  RotateCcw,
  Trash2,
  X,
  Check,
  AlertTriangle,
  Loader2,
  ChevronLeft,
  Activity,
  KeyRound,
  Info,
  Ban,
} from 'lucide-react';
import { PageTitle } from '../PageTitle';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import {
  AccountRow,
  AccountRequestRow,
  AccountStatus,
  AuditActivityRow,
  PermissionCode,
  ScreenId,
  UserRole,
} from '../../types';

// ─────────────────────────────────────────────────────────────
// ثوابت العرض (أسماء وصلاحيات — مرآة للمصفوفة المركزية على الخادم)
// ─────────────────────────────────────────────────────────────

const PERMISSION_LABELS: Record<PermissionCode, string> = {
  view_customers: 'مشاهدة بيانات العملاء',
  add_customer: 'إضافة عميل',
  edit_customer: 'تعديل بيانات العميل',
  delete_customer: 'حذف بيانات العميل',
  create_transaction: 'تسجيل عملية جديدة',
  view_customer_transactions: 'مشاهدة سجل عمليات العميل',
  edit_transaction: 'تعديل عملية سابقة',
  cancel_transaction: 'إلغاء عملية',
  view_balances: 'مشاهدة الأرصدة',
  view_all_transactions: 'مشاهدة جميع العمليات',
  view_reports: 'مشاهدة التقارير والإحصائيات',
  share_invoices: 'مشاركة الفواتير والتقارير',
  manage_users: 'إدارة المستخدمين',
  create_employees: 'إنشاء حسابات الموظفين',
  request_disable_account: 'تقديم طلب تعطيل حساب موظف',
  request_delete_account: 'تقديم طلب حذف حساب موظف',
  request_enable_account: 'تقديم طلب إعادة تفعيل حساب',
  approve_requests: 'الموافقة على طلبات إدارة الموظفين',
  manage_backups: 'إدارة النسخ الاحتياطي',
  restore_data: 'استرجاع البيانات',
  reset_data: 'تصفير البيانات',
};

const PERMISSION_GROUPS: { key: string; label: string; codes: PermissionCode[] }[] = [
  { key: 'customers', label: 'العملاء', codes: ['view_customers', 'add_customer', 'edit_customer', 'delete_customer'] },
  {
    key: 'transactions',
    label: 'العمليات المالية',
    codes: [
      'create_transaction',
      'view_customer_transactions',
      'edit_transaction',
      'cancel_transaction',
      'view_balances',
      'view_all_transactions',
    ],
  },
  { key: 'reports', label: 'التقارير والمشاركة', codes: ['view_reports', 'share_invoices'] },
  {
    key: 'users',
    label: 'إدارة المستخدمين',
    codes: [
      'manage_users',
      'create_employees',
      'request_disable_account',
      'request_delete_account',
      'request_enable_account',
      'approve_requests',
    ],
  },
  { key: 'data', label: 'البيانات والنسخ', codes: ['manage_backups', 'restore_data', 'reset_data'] },
];

/** أقصى ما يمكن منحه للموظف (مرآة EMPLOYEE_MAX_PERMISSIONS على الخادم) */
const EMPLOYEE_GRANTABLE: PermissionCode[] = [
  'view_customers',
  'add_customer',
  'edit_customer',
  'create_transaction',
  'view_customer_transactions',
  'cancel_transaction',
  'view_balances',
  'view_all_transactions',
  'view_reports',
  'share_invoices',
];

const EMPLOYEE_DEFAULT: PermissionCode[] = [
  'view_customers',
  'add_customer',
  'create_transaction',
  'view_customer_transactions',
  'view_balances',
  'share_invoices',
];

const STATUS_STYLES: Record<AccountStatus, { badge: string; dot: string; label: string; icon: React.ElementType }> = {
  active: { badge: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500', label: 'نشط', icon: ShieldCheck },
  pending: { badge: 'bg-amber-50 text-amber-800 border-amber-300', dot: 'bg-amber-500', label: 'في انتظار الاعتماد', icon: Clock },
  disabled: { badge: 'bg-slate-100 text-slate-700 border-slate-300', dot: 'bg-slate-500', label: 'معطل', icon: ShieldOff },
  rejected: { badge: 'bg-red-50 text-red-800 border-red-300', dot: 'bg-red-500', label: 'مرفوض', icon: Ban },
  deleted: { badge: 'bg-red-100 text-red-900 border-red-400', dot: 'bg-red-700', label: 'محذوف', icon: UserX },
};

const ROLE_STYLES: Record<UserRole, { badge: string; label: string }> = {
  owner: { badge: 'bg-[#0b2545] text-[#d4ab54] border-[#1b3453]', label: 'صاحب المحل' },
  manager: { badge: 'bg-blue-50 text-blue-800 border-blue-300', label: 'مدير المحل' },
  employee: { badge: 'bg-slate-50 text-slate-700 border-slate-300', label: 'موظف' },
};

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

function formatDateOnly(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return value;
  }
}

const REQUEST_TYPE_LABELS: Record<AccountRequestRow['type'], string> = {
  create_account: 'اعتماد حساب جديد',
  disable_account: 'تعطيل حساب',
  enable_account: 'إعادة تفعيل حساب',
  delete_account: 'حذف حساب',
};

// ─────────────────────────────────────────────────────────────
// مكوّنات مشتركة
// ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: AccountStatus }> = ({ status }) => {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.active;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black ${style.badge}`}>
      <Icon className="w-3 h-3" />
      {style.label}
    </span>
  );
};

const RoleBadge: React.FC<{ role: UserRole }> = ({ role }) => {
  const style = ROLE_STYLES[role] ?? ROLE_STYLES.employee;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black ${style.badge}`}>
      {style.label}
    </span>
  );
};

const Alert: React.FC<{ tone: 'error' | 'success' | 'info'; children: React.ReactNode }> = ({ tone, children }) => {
  const map = {
    error: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
  };
  const Icon = tone === 'error' ? AlertTriangle : tone === 'success' ? Check : Info;
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-xl border text-[11px] font-bold leading-relaxed ${map[tone]}`}>
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
};

const PermissionChips: React.FC<{ codes: PermissionCode[]; max?: number }> = ({ codes, max = 4 }) => {
  if (!codes || codes.length === 0) {
    return <span className="text-[10px] text-slate-400 font-bold">لا توجد صلاحيات فعّالة</span>;
  }
  const shown = codes.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((code) => (
        <span key={code} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-[9.5px] font-bold">
          {PERMISSION_LABELS[code] ?? code}
        </span>
      ))}
      {codes.length > shown.length && (
        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[9.5px] font-bold">
          +{codes.length - shown.length}
        </span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// شاشة 36 — إدارة المستخدمين
// ─────────────────────────────────────────────────────────────

export const Screen36Users: React.FC<{
  onNavigate: (s: ScreenId) => void;
}> = ({ onNavigate }) => {
  const { hasPermission, role: myRole } = useAuth();
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [selected, setSelected] = useState<AccountRow | null>(null);
  const [activity, setActivity] = useState<AuditActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'disable' | 'delete'; row: AccountRow; typed: string; reason: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [list, requests] = await Promise.all([api.getAccounts(), api.getAccountRequests('pending')]);
      setRows(list);
      setPendingCount(requests.length);
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل قائمة المستخدمين');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadActivity = async (row: AccountRow) => {
    try {
      setActivityLoading(true);
      setActivity(await api.getAccountActivity(row.membership_id));
    } catch (err: any) {
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  };

  const openDetails = (row: AccountRow) => {
    setSelected(row);
    setNotice(null);
    loadActivity(row);
  };

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchSearch = !q || r.name.includes(q) || r.phone.includes(q) || (r.email ?? '').includes(q);
      return matchStatus && matchSearch;
    });
  }, [rows, search, statusFilter]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      pending: rows.filter((r) => r.status === 'pending').length,
      disabled: rows.filter((r) => r.status === 'disabled').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
      deleted: rows.filter((r) => r.status === 'deleted').length,
    }),
    [rows]
  );

  const canApprove = hasPermission('approve_requests');
  const isOwner = myRole === 'owner';

  const doEnable = async (row: AccountRow) => {
    try {
      setBusy(true);
      await api.enableAccount(row.membership_id);
      setNotice({ tone: 'success', text: 'تم إعادة تفعيل الحساب بنفس الصلاحيات المعتمدة' });
      setSelected(null);
      await load();
    } catch (err: any) {
      setNotice({ tone: 'error', text: err?.message || 'تعذر إعادة تفعيل الحساب' });
    } finally {
      setBusy(false);
    }
  };

  const requestAction = async (row: AccountRow, type: 'disable' | 'enable' | 'delete') => {
    try {
      setBusy(true);
      await api.requestAccountAction(row.membership_id, {
        type: type === 'disable' ? 'disable_account' : type === 'enable' ? 'enable_account' : 'delete_account',
      });
      setNotice({ tone: 'success', text: 'تم إرسال الطلب إلى صاحب المحل، ولن يُنفَّذ قبل موافقته' });
      setSelected(null);
      await load();
    } catch (err: any) {
      setNotice({ tone: 'error', text: err?.message || 'تعذر إرسال الطلب' });
    } finally {
      setBusy(false);
    }
  };

  const submitConfirm = async () => {
    if (!confirm) return;
    if (confirm.kind === 'delete' && confirm.typed.trim() !== 'حذف') {
      setNotice({ tone: 'error', text: 'اكتب كلمة «حذف» للتأكيد' });
      return;
    }
    try {
      setBusy(true);
      if (confirm.kind === 'disable') {
        await api.disableAccount(confirm.row.membership_id, confirm.reason || undefined);
        setNotice({ tone: 'success', text: 'تم تعطيل الحساب وإبطال جلساته، وكل عملياته وسجلاته محفوظة' });
      } else {
        const res = await api.deleteAccount(confirm.row.membership_id);
        setNotice({
          tone: 'success',
          text: `تم حذف الحساب مع الاحتفاظ بكل سجلاته (${res.preserved_transactions ?? 0} عملية محفوظة)`,
        });
      }
      setConfirm(null);
      setSelected(null);
      await load();
    } catch (err: any) {
      setNotice({ tone: 'error', text: err?.message || 'تعذر تنفيذ الإجراء' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto space-y-3 pb-24 select-none">
      <PageTitle title="إدارة المستخدمين" />

      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {/* أزرار الإجراءات */}
      <div className="grid grid-cols-2 gap-2">
        {hasPermission('create_employees') && (
          <button
            type="button"
            onClick={() => onNavigate('screen-37-user-add')}
            className="py-3 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            إضافة مستخدم
          </button>
        )}
        {hasPermission('manage_users') && (
          <button
            type="button"
            onClick={() => onNavigate('screen-38-user-requests')}
            className={`relative py-3 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-98 transition-all ${
              hasPermission('create_employees')
                ? 'theme-btn-secondary'
                : 'col-span-2 bg-amber-400 hover:bg-amber-300 text-slate-950'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            الطلبات
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
                {pendingCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* ملخّص الحالات */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { key: 'all', label: 'الكل', value: counts.all, style: 'bg-white border-slate-200 text-slate-800' },
          { key: 'active', label: 'نشط', value: counts.active, style: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { key: 'pending', label: 'معلّق', value: counts.pending, style: 'bg-amber-50 border-amber-200 text-amber-800' },
          { key: 'disabled', label: 'معطل', value: counts.disabled, style: 'bg-slate-100 border-slate-300 text-slate-700' },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setStatusFilter(card.key as any)}
            className={`rounded-xl border p-2 text-center transition-all active:scale-98 ${card.style} ${
              statusFilter === card.key ? 'ring-2 ring-[var(--color-gold)]/60' : ''
            }`}
          >
            <div className="text-base font-black font-mono tabular-nums leading-none">{card.value}</div>
            <div className="text-[9.5px] font-bold mt-1">{card.label}</div>
          </button>
        ))}
      </div>

      {/* بحث */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو رقم الهاتف"
          className="w-full py-2.5 pr-9 pl-3 rounded-xl border border-slate-200 bg-white text-xs font-bold"
        />
      </div>

      {/* القائمة */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-500 gap-2 text-xs font-bold">
          <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-500">لا يوجد مستخدمون مطابقون</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <button
              key={row.membership_id}
              type="button"
              onClick={() => openDetails(row)}
              className="w-full text-right bg-white rounded-2xl border border-slate-200 p-3 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-black text-xs text-slate-900 truncate">{row.name}</span>
                    <RoleBadge role={row.role} />
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5" dir="ltr">
                    {row.phone}
                  </div>
                  <div className="mt-1.5">
                    <PermissionChips codes={row.permissions} max={3} />
                  </div>
                  <div className="text-[9.5px] text-slate-400 font-bold mt-1">
                    أُنشئ: {formatDateOnly(row.created_at)} · آخر دخول: {formatDateOnly(row.last_login_at)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusBadge status={row.status} />
                  <ChevronLeft className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* تفاصيل مستخدم */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-3">
          <div className="bg-[var(--bg-page)] w-full max-w-md rounded-2xl border border-slate-200 max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 bg-[var(--bg-header)] text-white p-3 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#d4ab54]" />
                <span className="font-black text-xs">بيانات المستخدم</span>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="p-1 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-sm text-slate-900">{selected.name}</span>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="text-[10px] font-mono text-slate-500" dir="ltr">
                  {selected.phone}
                </div>
                {selected.email && <div className="text-[10px] font-mono text-slate-500" dir="ltr">{selected.email}</div>}
                <div className="flex items-center gap-2 pt-1">
                  <RoleBadge role={selected.role} />
                  <span className="text-[9.5px] text-slate-400 font-bold">أُنشئ: {formatDate(selected.created_at)}</span>
                </div>
                <div className="text-[9.5px] text-slate-400 font-bold">
                  آخر دخول: {formatDate(selected.last_login_at)}
                  {selected.approved_at ? ` · اعتُمد: ${formatDate(selected.approved_at)}` : ''}
                </div>
                {selected.status_reason && (
                  <div className="text-[10px] text-slate-600 font-bold bg-slate-50 border border-slate-200 rounded-lg p-2">
                    سبب الحالة: {selected.status_reason}
                  </div>
                )}
              </div>

              {/* الصلاحيات */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-800">
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" /> الصلاحيات المفعّلة
                </div>
                <PermissionChips codes={selected.permissions} max={40} />
                {selected.role !== 'owner' && selected.proposed_permissions.length > 0 && (
                  <>
                    <div className="text-[10px] font-black text-slate-700 pt-1">الصلاحيات المقترحة (غير مفعّلة)</div>
                    <PermissionChips codes={selected.proposed_permissions} max={40} />
                  </>
                )}
              </div>

              {/* سجل النشاط */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-slate-800">
                  <Activity className="w-3.5 h-3.5 text-blue-600" /> سجل النشاط
                </div>
                {activityLoading ? (
                  <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> جاري التحميل...
                  </div>
                ) : activity.length === 0 ? (
                  <div className="text-[10px] text-slate-400 font-bold">لا يوجد نشاط مسجّل</div>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {activity.slice(0, 30).map((a) => (
                      <div key={a.id} className="border-r-2 border-slate-200 pr-2 py-0.5">
                        <div className="text-[10px] font-bold text-slate-800">{a.description}</div>
                        <div className="text-[9px] text-slate-400 font-mono">
                          {formatDate(a.created_at)} · {a.action_type}
                          {a.result === 'denied' ? ' · مرفوض' : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* الإجراءات */}
              <div className="space-y-2">
                <Alert tone="info">
                  <b>الفرق بين التعطيل والحذف:</b> <b>التعطيل</b> يمنع الدخول ويُبقي الحساب وكل عملياته وسجلاته كما هي، ويمكن
                  إعادة تفعيله لاحقًا. <b>الحذف</b> إجراء نهائي يُغلق الحساب ويُعطّل كلمة المرور، لكنه <b>لا يحذف</b> أي عملية
                  أو عميل أو تقرير — تبقى كل السجلات التاريخية محفوظة.
                </Alert>

                {isOwner && selected.role !== 'owner' && selected.status !== 'deleted' && (
                  <>
                    {selected.status === 'active' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirm({ kind: 'disable', row: selected, typed: '', reason: '' })}
                        className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-black text-xs flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        <ShieldOff className="w-4 h-4" /> تعطيل الحساب (مباشرة)
                      </button>
                    )}
                    {(selected.status === 'disabled' || selected.status === 'rejected' || selected.status === 'pending') && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => doEnable(selected)}
                        className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        <RotateCcw className="w-4 h-4" /> إعادة تفعيل الحساب
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: 'delete', row: selected, typed: '', reason: '' })}
                      className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" /> حذف الحساب (نهائي)
                    </button>
                  </>
                )}

                {!isOwner && selected.role === 'employee' && selected.status !== 'deleted' && (
                  <div className="grid grid-cols-2 gap-2">
                    {selected.status === 'active' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => requestAction(selected, 'disable')}
                        className="py-2.5 rounded-xl theme-btn-secondary font-black text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        <ShieldOff className="w-3.5 h-3.5" /> طلب تعطيل
                      </button>
                    )}
                    {selected.status === 'disabled' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => requestAction(selected, 'enable')}
                        className="py-2.5 rounded-xl theme-btn-secondary font-black text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> طلب إعادة تفعيل
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => requestAction(selected, 'delete')}
                      className="py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 font-black text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> طلب حذف
                    </button>
                  </div>
                )}

                {!isOwner && selected.role !== 'employee' && (
                  <Alert tone="info">لا يمكن تعديل حسابات أصحاب المحل أو المديرين — يُرجى مراجعة صاحب المحل.</Alert>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* تأكيد مزدوج */}
      {confirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${confirm.kind === 'delete' ? 'bg-red-50' : 'bg-slate-100'}`}>
                {confirm.kind === 'delete' ? <Trash2 className="w-4 h-4 text-red-600" /> : <ShieldOff className="w-4 h-4 text-slate-700" />}
              </div>
              <div>
                <div className="font-black text-sm text-slate-900">
                  {confirm.kind === 'delete' ? 'تأكيد حذف الحساب' : 'تأكيد تعطيل الحساب'}
                </div>
                <div className="text-[10px] text-slate-500 font-bold">{confirm.row.name}</div>
              </div>
            </div>

            <p className="text-[11px] font-bold text-slate-600 leading-relaxed">
              {confirm.kind === 'delete'
                ? 'الحذف نهائي: لن يستطيع المستخدم الدخول مرة أخرى. لن تُحذف أي عملية أو عميل أو تقرير، وستبقى كل السجلات التاريخية محفوظة.'
                : 'التعطيل يمنع الدخول ويُبطل الجلسات، مع الاحتفاظ الكامل بالحساب وكل عملياته وسجلاته، ويمكن إعادة تفعيله لاحقًا.'}
            </p>

            {confirm.kind === 'disable' && (
              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-1">سبب التعطيل (اختياري)</label>
                <input
                  type="text"
                  value={confirm.reason}
                  onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })}
                  placeholder="مثال: انتهاء فترة العمل"
                  className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-xs font-bold"
                />
              </div>
            )}

            {confirm.kind === 'delete' && (
              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-1">
                  للتأكيد اكتب كلمة <span className="text-red-600">حذف</span>
                </label>
                <input
                  type="text"
                  value={confirm.typed}
                  onChange={(e) => setConfirm({ ...confirm, typed: e.target.value })}
                  className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-xs font-bold"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={submitConfirm}
                className={`py-2.5 rounded-xl text-white font-black text-xs disabled:opacity-60 ${
                  confirm.kind === 'delete' ? 'bg-red-600' : 'bg-slate-800'
                }`}
              >
                {busy ? 'جاري التنفيذ...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canApprove && !isOwner && (
        <p className="text-[9.5px] text-slate-400 font-bold text-center">
          بعض الإجراءات تحتاج موافقة صاحب المحل، وستظهر له في صفحة الطلبات.
        </p>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// شاشة 37 — إضافة مستخدم
// ─────────────────────────────────────────────────────────────

export const Screen37UserAdd: React.FC<{
  onNavigate: (s: ScreenId) => void;
}> = ({ onNavigate }) => {
  const { hasPermission, role: myRole } = useAuth();
  const isOwner = myRole === 'owner';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'manager' | 'employee'>('employee');
  const [perms, setPerms] = useState<PermissionCode[]>(EMPLOYEE_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; message: string; rejected: string[] } | null>(null);

  if (!hasPermission('create_employees')) {
    return (
      <div className="p-4 max-w-md mx-auto pb-24">
        <PageTitle title="إضافة مستخدم" />
        <Alert tone="error">لا تملك صلاحية إنشاء حسابات. يُرجى مراجعة صاحب المحل.</Alert>
      </div>
    );
  }

  const toggle = (code: PermissionCode) => {
    setPerms((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const submit = async () => {
    setError(null);
    setResult(null);
    if (!name.trim() || !phone.trim() || !password.trim()) {
      setError('الاسم ورقم الهاتف وكلمة المرور مطلوبة');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
      return;
    }
    if (role === 'employee' && perms.length === 0) {
      setError('اختر صلاحية واحدة على الأقل للموظف');
      return;
    }

    try {
      setBusy(true);
      const res = await api.createAccount({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        password,
        role,
        permissions: role === 'employee' ? perms : undefined,
      });
      setResult({
        status: res.account_status,
        message: res.message,
        rejected: res.rejected_permissions ?? [],
      });
    } catch (err: any) {
      setError(err?.message || 'تعذر إنشاء الحساب');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="p-4 max-w-md mx-auto space-y-3 pb-24">
        <PageTitle title={result.status === 'active' ? 'تم إنشاء الحساب' : 'تم إرسال الحساب للاعتماد'} />
        <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center space-y-3">
          <div
            className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center ${
              result.status === 'active' ? 'bg-emerald-50' : 'bg-amber-50'
            }`}
          >
            {result.status === 'active' ? (
              <Check className="w-7 h-7 text-emerald-600" />
            ) : (
              <Clock className="w-7 h-7 text-amber-600" />
            )}
          </div>
          <p className="text-xs font-bold text-slate-700 leading-relaxed">{result.message}</p>
          {result.status === 'pending' && (
            <Alert tone="info">
              الحساب لن يستطيع الدخول حتى يوافق صاحب المحل، وسيظهر الطلب في صفحة «الطلبات».
            </Alert>
          )}
          {result.rejected.length > 0 && (
            <Alert tone="error">
              بعض الصلاحيات لم تُمنح لأنها تتجاوز المسموح: {result.rejected.join(' · ')}
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('screen-36-users')}
              className="py-2.5 rounded-xl theme-btn-primary text-white font-black text-xs"
            >
              قائمة المستخدمين
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setName('');
                setPhone('');
                setEmail('');
                setPassword('');
              }}
              className="py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-black text-xs"
            >
              إضافة آخر
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-3 pb-24 select-none">
      <PageTitle title="إضافة مستخدم جديد" />

      {error && <Alert tone="error">{error}</Alert>}

      {!isOwner && (
        <Alert tone="info">
          الحساب الذي تنشئه سيُرسل إلى صاحب المحل للاعتماد، ولن يستطيع المستخدم الدخول قبل موافقته.
        </Alert>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2.5">
        <div>
          <label className="block text-[10px] font-black text-slate-600 mb-1">اسم المستخدم *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="الاسم الكامل"
            className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-xs font-bold"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-600 mb-1">رقم الهاتف (اسم الدخول) *</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01012345678"
            dir="ltr"
            className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-xs font-bold text-right"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-600 mb-1">البريد الإلكتروني (اختياري)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-xs font-bold text-right"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-600 mb-1">كلمة المرور * (لا تُعرض بعد الحفظ)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6 أحرف على الأقل"
            className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-xs font-bold"
          />
        </div>
      </div>

      {/* نوع الحساب */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
        <div className="text-[11px] font-black text-slate-800">نوع الحساب</div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRole('employee')}
            className={`py-2.5 rounded-xl border text-xs font-black flex flex-col items-center gap-1 ${
              role === 'employee' ? 'theme-btn-primary text-white border-transparent' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Users className="w-4 h-4" /> موظف
          </button>
          <button
            type="button"
            disabled={!isOwner}
            onClick={() => isOwner && setRole('manager')}
            className={`py-2.5 rounded-xl border text-xs font-black flex flex-col items-center gap-1 disabled:opacity-40 ${
              role === 'manager' ? 'theme-btn-primary text-white border-transparent' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> مدير محل
          </button>
        </div>
        {!isOwner && <p className="text-[9.5px] text-slate-400 font-bold">إنشاء حساب مدير متاح لصاحب المحل فقط.</p>}
        {isOwner && role === 'manager' && (
          <p className="text-[9.5px] text-slate-500 font-bold">
            صلاحيات المدير ثابتة من النظام: كل المهام اليومية والإشرافية، بدون حذف العملاء أو تعديل العمليات أو الموافقة على
            الطلبات أو تصفير البيانات.
          </p>
        )}
      </div>

      {/* الصلاحيات (للموظف فقط) */}
      {role === 'employee' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-black text-slate-800">صلاحيات الموظف</div>
            <span className="text-[9.5px] font-bold text-slate-500">{perms.length} مختارة</span>
          </div>
          {PERMISSION_GROUPS.map((group) => {
            const codes = group.codes.filter((c) => EMPLOYEE_GRANTABLE.includes(c));
            if (codes.length === 0) return null;
            return (
              <div key={group.key} className="space-y-1">
                <div className="text-[10px] font-black text-slate-500">{group.label}</div>
                <div className="space-y-1">
                  {codes.map((code) => {
                    const checked = perms.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => toggle(code)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg border text-[11px] font-bold transition-colors ${
                          checked ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}
                      >
                        <span className="text-right">{PERMISSION_LABELS[code]}</span>
                        <span
                          className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                            checked ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-[9.5px] text-slate-400 font-bold">
            الصلاحيات الإدارية (إدارة المستخدمين، الموافقة على الطلبات، النسخ والتصفير) لا يمكن منحها للموظف.
          </p>
        </div>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
        {busy ? 'جاري الإنشاء...' : isOwner ? 'إنشاء وتفعيل الحساب' : 'إنشاء وإرسال للاعتماد'}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// شاشة 38 — الطلبات والاعتماد
// ─────────────────────────────────────────────────────────────

type RequestTab = 'create_account' | 'disable_account' | 'enable_account' | 'delete_account';

export const Screen38UserRequests: React.FC<{
  onNavigate: (s: ScreenId) => void;
}> = ({ onNavigate }) => {
  const { hasPermission, role: myRole } = useAuth();
  const isOwner = myRole === 'owner';
  const canApprove = hasPermission('approve_requests');

  const [tab, setTab] = useState<RequestTab>('create_account');
  const [rows, setRows] = useState<AccountRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setRows(await api.getAccountRequests('pending'));
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (row: AccountRequestRow, decision: 'approve' | 'reject') => {
    try {
      setBusyId(row.id);
      setNotice(null);
      await api.decideAccountRequest(row.id, { decision, note: note[row.id] || undefined });
      setNotice(decision === 'approve' ? 'تمت الموافقة وتنفيذ الطلب' : 'تم رفض الطلب بدون أي تغيير على الحساب');
      await load();
    } catch (err: any) {
      setError(err?.message || 'تعذر تنفيذ القرار');
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(() => {
    const base: Record<RequestTab, number> = {
      create_account: 0,
      disable_account: 0,
      enable_account: 0,
      delete_account: 0,
    };
    rows.forEach((r) => {
      if (r.type in base) base[r.type as RequestTab] += 1;
    });
    return base;
  }, [rows]);

  const visible = rows.filter((r) => r.type === tab);

  if (!hasPermission('manage_users')) {
    return (
      <div className="p-4 max-w-md mx-auto pb-24">
        <PageTitle title="طلبات إدارة المستخدمين" />
        <Alert tone="error">لا تملك صلاحية الوصول إلى إدارة المستخدمين.</Alert>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-3 pb-24 select-none">
      <PageTitle title="طلبات إدارة المستخدمين" />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {!isOwner && (
        <Alert tone="info">
          أنت تعرض الطلبات التي قدّمتها. تنفيذ الطلبات يحتاج موافقة صاحب المحل.
        </Alert>
      )}

      {/* التبويبات */}
      <div className="grid grid-cols-2 gap-1.5">
        {(Object.keys(REQUEST_TYPE_LABELS) as RequestTab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`py-2 px-2 rounded-xl border text-[10.5px] font-black flex items-center justify-center gap-1.5 ${
              tab === key ? 'theme-btn-primary text-white border-transparent' : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            {REQUEST_TYPE_LABELS[key]}
            {counts[key] > 0 && (
              <span
                className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] font-black flex items-center justify-center ${
                  tab === key ? 'bg-white/20 text-white' : 'bg-red-600 text-white'
                }`}
              >
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-slate-500 gap-2 text-xs font-bold">
          <Loader2 className="w-4 h-4 animate-spin" /> جاري التحميل...
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-500">لا توجد طلبات في هذا التبويب</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div key={row.id} className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-black text-xs text-slate-900">{row.target_name ?? row.payload?.target_name ?? '—'}</div>
                  {row.target_phone && (
                    <div className="text-[10px] font-mono text-slate-500" dir="ltr">
                      {row.target_phone}
                    </div>
                  )}
                  <div className="text-[9.5px] text-slate-400 font-bold mt-0.5">
                    قدّمه: {row.requested_by_name ?? '—'} · {formatDate(row.requested_at)}
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[9.5px] font-black">
                  معلق
                </span>
              </div>

              {row.type === 'create_account' && Array.isArray(row.payload?.proposed_permissions) && (
                <div className="space-y-1">
                  <div className="text-[10px] font-black text-slate-600">الصلاحيات المقترحة</div>
                  <PermissionChips codes={row.payload.proposed_permissions} max={40} />
                </div>
              )}

              {row.payload?.reason && (
                <div className="text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2">
                  السبب: {String(row.payload.reason)}
                </div>
              )}

              {canApprove ? (
                <>
                  <input
                    type="text"
                    value={note[row.id] ?? ''}
                    onChange={(e) => setNote((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="ملاحظة القرار (اختياري)"
                    className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-[11px] font-bold"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => decide(row, 'approve')}
                      className="py-2.5 rounded-xl bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      <Check className="w-3.5 h-3.5" /> موافقة
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => decide(row, 'reject')}
                      className="py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      <X className="w-3.5 h-3.5" /> رفض
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  في انتظار موافقة صاحب المحل
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onNavigate('screen-36-users')}
        className="w-full py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-black text-xs flex items-center justify-center gap-1.5"
      >
        <Users className="w-4 h-4" /> رجوع لقائمة المستخدمين
      </button>
    </div>
  );
};
