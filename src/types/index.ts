export type UserRole = 'owner' | 'manager' | 'employee';

/**
 * حالة حساب المستخدم داخل المحل:
 * - pending  : في انتظار اعتماد صاحب المحل
 * - active   : نشط
 * - disabled : معطل (محفوظ بكل سجلاته)
 * - rejected : مرفوض
 * - deleted  : محذوف منطقيًا
 */
export type AccountStatus = 'pending' | 'active' | 'disabled' | 'rejected' | 'deleted';

export interface User {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
  /** حالة الحساب داخل المحل ( تأتي من العضوية وليس من صف المستخدم) */
  account_status?: AccountStatus;
  last_login_at?: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  type: 'individual' | 'company';
  notes: string;
  created_at: string;
  updated_at: string;
  total_payments: number;
  total_withdrawals: number;
  balance: number;
  transactions_count: number;
}

export interface Transaction {
  id: string;
  project_id: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  type: 'payment' | 'withdrawal'; // 'payment' = دفع (+), 'withdrawal' = سحب (-)
  amount: number;
  date: string;
  time: string;
  description: string;
  created_by: string;
  status: 'active' | 'cancelled';
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  project_id: string;
  user_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: number;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  project_id: string;
  user_id: string;
  user_name: string;
  action_type: string;
  description: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

export interface BackupItem {
  id: string;
  filename: string;
  file_size: number;
  created_at: string;
}

export interface ReportsSummary {
  totalCustomers: number;
  totalTransactions: number;
  positiveBalanceSum: number;
  negativeBalanceSum: number;
  totalPayments: number;
  totalWithdrawals: number;
  netBalance: number;
}

export type ScreenId =
  | 'screen-1-splash'
  | 'screen-2-customer-added-success'
  | 'screen-3-profile'
  | 'screen-4-login'
  | 'screen-5-home'
  | 'screen-6-customer-delete'
  | 'screen-7-customer-add'
  | 'screen-8-password-changed-success'
  | 'screen-9-app-logo'
  | 'screen-10-customer-deleted-success'
  | 'screen-11-customer-details'
  | 'screen-12-change-password'
  | 'screen-13-transaction-saved-success'
  | 'screen-14-new-transaction'
  | 'screen-15-customers'
  | 'screen-16-customer-updated-success'
  | 'screen-17-share-menu'
  | 'screen-18-all-transactions'
  | 'screen-19-customer-transactions'
  | 'screen-20-backup'
  | 'screen-21-backup-create'
  | 'screen-22-backup-restore'
  | 'screen-23-reset-data-success'
  | 'screen-24-reset-data'
  | 'screen-25-data-import'
  | 'screen-26-data-import-success'
  | 'screen-27-data-export'
  | 'screen-28-data-export-success'
  | 'screen-29-notifications'
  | 'screen-30-about'
  | 'screen-31-customer-edit'
  | 'screen-32-settings'
  | 'screen-33-reports'
  | 'screen-34-data-management'
  | 'screen-35-support'
  | 'screen-36-users'
  | 'screen-37-user-add'
  | 'screen-38-user-requests';

// ─────────────────────────────────────────────────────────────
// إدارة المستخدمين والصلاحيات (المرحلة 5)
// ─────────────────────────────────────────────────────────────

/** كود الصلاحية كما يُعرَّف في المصفوفة المركزية على الخادم */
export type PermissionCode =
  | 'view_customers'
  | 'add_customer'
  | 'edit_customer'
  | 'delete_customer'
  | 'create_transaction'
  | 'view_customer_transactions'
  | 'edit_transaction'
  | 'cancel_transaction'
  | 'view_balances'
  | 'view_all_transactions'
  | 'view_reports'
  | 'share_invoices'
  | 'manage_users'
  | 'create_employees'
  | 'request_disable_account'
  | 'request_delete_account'
  | 'request_enable_account'
  | 'approve_requests'
  | 'manage_backups'
  | 'restore_data'
  | 'reset_data';

/** حساب مستخدم داخل المحل (كما يعيده GET /api/accounts) */
export interface AccountRow {
  membership_id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
  role_label: string;
  status: AccountStatus;
  status_label: string;
  permissions: PermissionCode[];
  proposed_permissions: PermissionCode[];
  created_at: string;
  approved_at: string | null;
  status_changed_at: string | null;
  status_reason: string | null;
  last_login_at: string | null;
}

export type AccountRequestType = 'create_account' | 'disable_account' | 'enable_account' | 'delete_account';
export type AccountRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** طلب إدارة حساب (اعتماد إنشاء / تعطيل / إعادة تفعيل / حذف) */
export interface AccountRequestRow {
  id: string;
  type: AccountRequestType;
  type_label: string;
  status: AccountRequestStatus;
  target_user_id: string | null;
  target_membership_id: string | null;
  target_name: string | null;
  target_phone: string | null;
  payload: { reason?: string | null; target_name?: string; proposed_permissions?: PermissionCode[]; [key: string]: unknown };
  requested_by: string | null;
  requested_by_name: string | null;
  requested_by_role: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

/** سجل نشاط مستخدم */
export interface AuditActivityRow {
  id: string;
  user_id: string;
  user_name: string;
  action_type: string;
  description: string;
  entity_type: string;
  entity_id: string | null;
  actor_role: string | null;
  target_user_id: string | null;
  result: string | null;
  reason: string | null;
  created_at: string;
}
