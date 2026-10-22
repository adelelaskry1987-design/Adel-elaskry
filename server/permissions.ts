/**
 * AH2 — المصفوفة المركزية للصلاحيات (Central Permission Matrix)
 * =============================================================
 * هذا الملف هو المصدر الوحيد للحقيقة (Single Source of Truth) لكل ما يتعلق
 * بأنواع الحسابات والصلاحيات. أي طبقة (الخادم أو الواجهة) تحتاج معرفة
 * صلاحيات دور معين يجب أن تستوردها من هنا — ولا تُكرِّر القوائم يدويًا.
 *
 * قواعد ثابتة في هذا النظام:
 *  1) صلاحيات صاحب المحل كاملة دائمًا ولا يمكن تقليصها أو تعديلها من أي دور آخر.
 *  2) صلاحيات المدير ثابتة (لا يستطيع منح نفسه أو غيره أكثر منها).
 *  3) صلاحيات الموظف يقررها صاحب المحل، بحدٍّ أقصى محدد في EMPLOYEE_MAX_PERMISSIONS.
 *  4) صلاحية "الموافقة على الطلبات" حصرية لصاحب المحل.
 */

// ─────────────────────────────────────────────────────────────
// الأدوار
// ─────────────────────────────────────────────────────────────

export type Role = 'owner' | 'manager' | 'employee';

export const ROLES: Role[] = ['owner', 'manager', 'employee'];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'صاحب المحل',
  manager: 'مدير المحل',
  employee: 'موظف',
};

/** هل الدور المعطى دورًا صالحًا؟ */
export function isRole(value: unknown): value is Role {
  return value === 'owner' || value === 'manager' || value === 'employee';
}

// ─────────────────────────────────────────────────────────────
// حالة الحساب
// ─────────────────────────────────────────────────────────────

/**
 * حالات حساب المستخدم داخل المحل:
 *  - pending  : في انتظار الاعتماد (أنشأه المدير، ولم يعتمده صاحب المحل بعد)
 *  - active   : نشط ومسموح له بالدخول وتنفيذ ما تسمح به صلاحياته
 *  - disabled : معطل (الإجراء الافتراضي عند توقف الموظف — يحفظ كل سجلاته)
 *  - rejected : مرفوض من صاحب المحل عند طلب الإنشاء
 *  - deleted  : محذوف منطقيًا (كلمة المرور مُعمّاة والجلسات مُبطلة، والسجل محفوظ)
 */
export type AccountStatus = 'pending' | 'active' | 'disabled' | 'rejected' | 'deleted';

export const ACCOUNT_STATUSES: AccountStatus[] = [
  'pending',
  'active',
  'disabled',
  'rejected',
  'deleted',
];

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  pending: 'في انتظار الاعتماد',
  active: 'نشط',
  disabled: 'معطل',
  rejected: 'مرفوض',
  deleted: 'محذوف',
};

/** الحالات الوحيدة المسموح لها بتسجيل الدخول واستخدام الوظائف المحمية. */
export const LOGIN_ALLOWED_STATUSES: AccountStatus[] = ['active'];

export function canLoginWithStatus(status: string | null | undefined): boolean {
  return LOGIN_ALLOWED_STATUSES.includes(status as AccountStatus);
}

// ─────────────────────────────────────────────────────────────
// الصلاحيات (21 صلاحية)
// ─────────────────────────────────────────────────────────────

export const PERMISSIONS = {
  // — العملاء —
  view_customers: { label: 'مشاهدة بيانات العملاء', group: 'customers' },
  add_customer: { label: 'إضافة عميل', group: 'customers' },
  edit_customer: { label: 'تعديل بيانات العميل', group: 'customers' },
  delete_customer: { label: 'حذف بيانات العميل', group: 'customers' },

  // — العمليات المالية —
  create_transaction: { label: 'تسجيل عملية جديدة', group: 'transactions' },
  view_customer_transactions: { label: 'مشاهدة سجل عمليات العميل', group: 'transactions' },
  edit_transaction: { label: 'تعديل عملية سابقة', group: 'transactions' },
  cancel_transaction: { label: 'إلغاء عملية', group: 'transactions' },
  view_balances: { label: 'مشاهدة الأرصدة', group: 'transactions' },
  view_all_transactions: { label: 'مشاهدة جميع العمليات', group: 'transactions' },

  // — التقارير والمشاركة —
  view_reports: { label: 'مشاهدة التقارير والإحصائيات', group: 'reports' },
  share_invoices: { label: 'مشاركة الفواتير والتقارير', group: 'reports' },

  // — إدارة المستخدمين —
  manage_users: { label: 'إدارة المستخدمين', group: 'users' },
  create_employees: { label: 'إنشاء حسابات الموظفين', group: 'users' },
  request_disable_account: { label: 'تقديم طلب تعطيل حساب موظف', group: 'users' },
  request_delete_account: { label: 'تقديم طلب حذف حساب موظف', group: 'users' },
  request_enable_account: { label: 'تقديم طلب إعادة تفعيل حساب', group: 'users' },
  approve_requests: { label: 'الموافقة على طلبات إدارة الموظفين', group: 'users' },

  // — البيانات والنسخ الاحتياطي (وظائف قائمة في التطبيق — محفوظة كما هي) —
  manage_backups: { label: 'إدارة النسخ الاحتياطي', group: 'data' },
  restore_data: { label: 'استرجاع البيانات', group: 'data' },
  reset_data: { label: 'تصفير البيانات', group: 'data' },
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

export const PERMISSION_GROUP_LABELS: Record<string, string> = {
  customers: 'العملاء',
  transactions: 'العمليات المالية',
  reports: 'التقارير والمشاركة',
  users: 'إدارة المستخدمين',
  data: 'البيانات والنسخ الاحتياطي',
};

/** صلاحيات إدارية لا يجوز منحها إلا لصاحب المحل (الحصرية). */
export const OWNER_ONLY_PERMISSIONS: PermissionCode[] = ['approve_requests'];

// ─────────────────────────────────────────────────────────────
// الصلاحيات الافتراضية لكل نوع حساب
// ─────────────────────────────────────────────────────────────

/**
 * الموظف (افتراضيًا): أداء المهام اليومية — مشاهدة العملاء، إضافة عميل،
 * تسجيل عملية، مشاهدة سجل عمليات العميل والأرصدة، ومشاركة الفواتير.
 */
export const EMPLOYEE_DEFAULT_PERMISSIONS: PermissionCode[] = [
  'view_customers',
  'add_customer',
  'create_transaction',
  'view_customer_transactions',
  'view_balances',
  'share_invoices',
];

/**
 * المدير (ثابتة): كل المهام اليومية والإشرافية، بدون:
 * حذف عميل · تعديل عملية سابقة · الموافقة على الطلبات · النسخ والاسترجاع والتصفير.
 */
export const MANAGER_PERMISSIONS: PermissionCode[] = [
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
  'manage_users',
  'create_employees',
  'request_disable_account',
  'request_delete_account',
  'request_enable_account',
];

/**
 * أقصى ما يمكن منحه للموظف بموافقة صاحب المحل.
 * (لا تشمل الحذف أو تعديل العمليات أو أي صلاحية إدارية.)
 */
export const EMPLOYEE_MAX_PERMISSIONS: PermissionCode[] = [
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

/** الصلاحيات الافتراضية بحسب الدور. صاحب المحل: الكل دائمًا. */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, PermissionCode[]> = {
  owner: [...ALL_PERMISSIONS],
  manager: [...MANAGER_PERMISSIONS],
  employee: [...EMPLOYEE_DEFAULT_PERMISSIONS],
};

/**
 * السقف الأعلى (Maximum) لكل دور: لا يمكن لأي عملية منح أو اقتراح
 * أن تتجاوز هذه القائمة، مهما كان مصدر الطلب.
 */
export const ROLE_MAX_PERMISSIONS: Record<Role, PermissionCode[]> = {
  owner: [...ALL_PERMISSIONS],
  manager: [...MANAGER_PERMISSIONS],
  employee: [...EMPLOYEE_MAX_PERMISSIONS],
};

// ─────────────────────────────────────────────────────────────
// التوافق مع الصلاحيات القديمة (ترحيل البيانات القائمة)
// ─────────────────────────────────────────────────────────────

/**
 * خريطة تحويل أكواد الصلاحيات القديمة (12 كودًا) إلى الأكواد الجديدة.
 * تُستخدم مرة واحدة عند الترحيل حتى لا يفقد أي مستخدم قائم صلاحياته.
 */
export const LEGACY_PERMISSION_MAP: Record<string, PermissionCode[]> = {
  view_customers: ['view_customers'],
  add_customers: ['add_customer'],
  edit_customers: ['edit_customer'],
  delete_customers: ['delete_customer'],
  view_transactions: ['view_customer_transactions', 'view_all_transactions'],
  create_transactions: ['create_transaction'],
  cancel_transactions: ['cancel_transaction'],
  view_reports: ['view_reports'],
  manage_employees: [
    'manage_users',
    'create_employees',
    'request_disable_account',
    'request_delete_account',
    'request_enable_account',
  ],
  manage_backups: ['manage_backups'],
  restore_data: ['restore_data'],
  reset_data: ['reset_data'],
};

/** هل المصفوفة تحتوي على أي كود قديم غير معروف في المصفوفة الحالية؟ */
export function hasLegacyCodes(stored: unknown): boolean {
  if (!Array.isArray(stored)) return false;
  return stored.some((code) => typeof code === 'string' && !ALL_PERMISSIONS.includes(code as PermissionCode));
}

// ─────────────────────────────────────────────────────────────
// دوال المعالجة
// ─────────────────────────────────────────────────────────────

function parsePermissionInput(stored: unknown): string[] | null {
  if (stored === null || stored === undefined) return null;

  let value: unknown = stored;

  // قد تُمرَّر كسلسلة JSON من قاعدة البيانات
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!Array.isArray(value)) return null;

  return value.filter((item): item is string => typeof item === 'string');
}

/** يقيّد أي مصفوفة صلاحيات بسقف الدور المعطى، ويحذف غير المعروف. */
export function clampToRoleMax(role: Role, stored: unknown): PermissionCode[] {
  const max = ROLE_MAX_PERMISSIONS[role] ?? [];
  const raw = parsePermissionInput(stored);
  if (raw === null) return [...(ROLE_DEFAULT_PERMISSIONS[role] ?? [])];

  const expanded = new Set<PermissionCode>();
  for (const code of raw) {
    const mapped = LEGACY_PERMISSION_MAP[code];
    if (mapped) {
      mapped.forEach((c) => expanded.add(c));
    } else if (ALL_PERMISSIONS.includes(code as PermissionCode)) {
      expanded.add(code as PermissionCode);
    }
  }

  return [...expanded].filter((code) => max.includes(code));
}

/**
 * يعيد الصلاحيات الفعّالة لمستخدم:
 *  - صاحب المحل → كل الصلاحيات دائمًا (بغض النظر عمّا هو مخزّن).
 *  - غيره → الصلاحيات المخزّنة بعد تحويل القديم وتقييدها بسقف الدور.
 *  - null/غير صالح → الصلاحيات الافتراضية للدور.
 */
export function normalizePermissions(role: Role, stored: unknown): PermissionCode[] {
  if (role === 'owner') return [...ALL_PERMISSIONS];
  return clampToRoleMax(role, stored);
}

/**
 * يتحقق أن المصفوفة المقترحة لا تتجاوز سقف الدور (تُستخدم عند إنشاء/اعتماد حساب).
 * يعيد القائمة النظيفة + قائمة الصلاحيات المرفوضة (لتسجيلها في سجل التدقيق).
 */
export function validatePermissionGrant(
  role: Role,
  proposed: unknown
): { granted: PermissionCode[]; rejected: string[] } {
  const max = ROLE_MAX_PERMISSIONS[role] ?? [];
  const raw = parsePermissionInput(proposed) ?? [];

  const granted: PermissionCode[] = [];
  const rejected: string[] = [];

  for (const code of raw) {
    const mapped = LEGACY_PERMISSION_MAP[code] ?? [code as PermissionCode];
    for (const candidate of mapped) {
      if (!ALL_PERMISSIONS.includes(candidate)) {
        rejected.push(candidate);
      } else if (max.includes(candidate)) {
        if (!granted.includes(candidate)) granted.push(candidate);
      } else {
        rejected.push(candidate);
      }
    }
  }

  return { granted, rejected };
}

/** هل يملك المستخدم الصلاحية؟ صاحب المحل يملكها دائمًا. */
export function hasPermission(
  role: Role,
  permissions: unknown,
  code: PermissionCode
): boolean {
  if (role === 'owner') return true;
  const effective = normalizePermissions(role, permissions);
  return effective.includes(code);
}

/**
 * هل يجوز للدور (actor) إنشاء/منح دور (target)؟
 * صاحب المحل: مدير أو موظف. المدير: موظف فقط. الموظف: لا شيء.
 */
export function canCreateRole(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === 'owner') return false;
  if (actorRole === 'owner') return true;
  if (actorRole === 'manager') return targetRole === 'employee';
  return false;
}

/** هل يجوز للدور تعديل/تعطيل/حذف حساب الدور الآخر؟ */
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  // لا أحد يدير حساب صاحب المحل.
  if (targetRole === 'owner') return false;
  if (actorRole === 'owner') return true;
  // المدير لا يدير مديرًا آخر (ولا يستطيع تنفيذ الإجراء بنفسه أصلًا — يقدّم طلبًا).
  if (actorRole === 'manager') return targetRole === 'employee';
  return false;
}

/** الصلاحيات المتاحة للعرض عند منح حساب بدور معين (تُستخدم في واجهة الاعتماد). */
export function grantablePermissions(actorRole: Role, targetRole: Role): PermissionCode[] {
  if (!canCreateRole(actorRole, targetRole)) return [];
  if (targetRole === 'owner') return [];
  const max = ROLE_MAX_PERMISSIONS[targetRole] ?? [];
  return max.filter((code) => !OWNER_ONLY_PERMISSIONS.includes(code));
}
