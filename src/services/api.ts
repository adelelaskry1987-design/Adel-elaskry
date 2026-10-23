import {
  Customer,
  Transaction,
  ReportsSummary,
  NotificationItem,
  ActivityLog,
  BackupItem,
  User,
  Project,
  AccountRow,
  AccountRequestRow,
  AuditActivityRow,
  AccountRequestType,
  PermissionCode,
} from '../types';

const TOKEN_KEY = 'ah2_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export const ACCOUNT_STATUS_EVENT = 'ah2:account-status-changed';
/** يُطلق عندما يفرض الخادم تغيير كلمة المرور (428) بعد إعادة تعيين من صاحب المحل. */
export const PASSWORD_CHANGE_REQUIRED_EVENT = 'ah2:password-change-required';

function notifyPasswordChangeRequired(message: string) {
  try {
    window.dispatchEvent(new CustomEvent<{ message: string }>(PASSWORD_CHANGE_REQUIRED_EVENT, { detail: { message } }));
  } catch {
    /* بيئة بلا window */
  }
}

/** يعيد حالة الحساب عند رفض الخادم الطلب لأن الحساب غير نشط. */
export type InactiveAccountReason = 'pending' | 'disabled' | 'rejected' | 'deleted' | 'none';

export interface InactiveAccountDetail {
  reason: InactiveAccountReason;
  message: string;
}

function notifyInactiveAccount(reason: InactiveAccountReason, message: string) {
  try {
    window.dispatchEvent(new CustomEvent<InactiveAccountDetail>(ACCOUNT_STATUS_EVENT, { detail: { reason, message } }));
  } catch {
    /* بيئة بلا window */
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // ── معالجة مركزية: حساب معطل/معلق/مرفوض/محذوف أو جلسة منتهية ──
    // الخادم هو المرجع: عند رفضه نتوقف فورًا في الواجهة أيضًا (وليس إخفاء أزرار فقط).
    if (response.status === 403 && data?.code === 'ACCOUNT_NOT_ACTIVE') {
      removeStoredToken();
      notifyInactiveAccount((data?.account_status as InactiveAccountReason) ?? 'disabled', data.error || 'حسابك غير نشط حاليًا');
    } else if (response.status === 403 && data?.code === 'NO_MEMBERSHIP') {
      removeStoredToken();
      notifyInactiveAccount('none', data.error || 'لا يوجد عضوية صالحة لهذا الحساب');
    } else if (response.status === 428 && data?.code === 'PASSWORD_CHANGE_REQUIRED') {
      // إعادة تعيين إجبارية من صاحب المحل: لا يمكن استخدام التطبيق قبل التغيير
      notifyPasswordChangeRequired(data.error || 'يجب تغيير كلمة المرور أولًا');
    } else if (response.status === 401 && token) {
      // جلسة منتهية أو مُبطلة
      removeStoredToken();
    }

    const error = new Error(data.error || 'حدث خطأ غير متوقع') as Error & {
      status?: number;
      code?: string;
      accountStatus?: string;
    };
    error.status = response.status;
    error.code = data?.code;
    error.accountStatus = data?.account_status;
    throw error;
  }

  return data as T;
}

export const api = {
  // Auth
  register: (payload: any) =>
    request<{ token: string; user: User; project: Project; permissions: string[] }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  login: (identifier: string, password: string, projectId?: string) =>
    request<{
      token?: string;
      user?: User;
      project?: Project;
      permissions?: string[];
      must_change_password?: boolean;
      requires_project_selection?: boolean;
      projects?: { project_id: string; project_name: string; role: string }[];
      message?: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, ...(projectId ? { projectId } : {}) }),
    }),

  // ── تعدد المحلات ──
  getMyProjects: () =>
    request<{
      current_project_id: string;
      projects: {
        membership_id: string;
        project_id: string;
        project_name: string;
        role: string;
        role_label: string;
        status: string;
        status_label: string;
      }[];
    }>('/api/auth/my-projects'),

  switchProject: (projectId: string) =>
    request<{ message: string; token: string; project: Project; role: string; permissions: string[] }>(
      '/api/auth/switch-project',
      { method: 'POST', body: JSON.stringify({ projectId }) }
    ),

  leaveProject: (reason?: string) =>
    request<{ message: string }>('/api/auth/leave-project', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getMe: () =>
    request<{ user: User; project: Project; permissions: string[]; role: string }>('/api/auth/me'),

  logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),

  changePassword: (payload: any) =>
    request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProfile: (payload: any) =>
    request<{ message: string }>('/api/auth/update-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyProjectPassword: (projectPassword: string) =>
    request<{ valid: boolean }>('/api/auth/verify-project-password', {
      method: 'POST',
      body: JSON.stringify({ projectPassword }),
    }),

  setProjectPassword: (currentPassword: string, newProjectPassword: string) =>
    request<{ message: string }>('/api/auth/set-project-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newProjectPassword }),
    }),

  // Account & Password Recovery
  getRecoveryStatus: () =>
    request<{ emailProviderConfigured: boolean; smsProviderConfigured: boolean }>(
      '/api/auth/recovery/status'
    ),

  requestEmailPasswordReset: (email: string) =>
    request<{ message: string }>('/api/auth/recovery/email/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifyEmailResetToken: (userId: string, token: string) =>
    request<{ valid: boolean }>('/api/auth/recovery/email/verify-token', {
      method: 'POST',
      body: JSON.stringify({ userId, token }),
    }),

  completeEmailPasswordReset: (payload: {
    userId: string;
    token: string;
    newPassword: string;
    confirmPassword: string;
  }) =>
    request<{ message: string }>('/api/auth/recovery/email/reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  requestPhoneOtp: (phone: string, purpose: 'reset_password_sms' | 'forgot_email_sms') =>
    request<{ message: string }>('/api/auth/recovery/phone/request', {
      method: 'POST',
      body: JSON.stringify({ phone, purpose }),
    }),

  verifyPhoneOtp: (
    phone: string,
    code: string,
    purpose: 'reset_password_sms' | 'forgot_email_sms'
  ) =>
    request<{
      verified: boolean;
      resetSessionToken: string;
      accountInfo?: {
        name: string;
        phone: string;
        email: string | null;
        hasEmail: boolean;
      };
    }>('/api/auth/recovery/phone/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code, purpose }),
    }),

  completePhonePasswordReset: (payload: {
    phone: string;
    resetSessionToken: string;
    newPassword: string;
    confirmPassword: string;
    newEmail?: string;
  }) =>
    request<{ message: string }>('/api/auth/recovery/phone/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitSupportRecoveryRequest: (payload: {
    fullName: string;
    projectName: string;
    enteredContact: string;
    alternativeContact: string;
    notes?: string;
  }) =>
    request<{ referenceId: string; message: string }>('/api/auth/recovery/support-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Customers
  getCustomers: (search?: string) =>
    request<Customer[]>(`/api/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  getCustomer: (id: string) =>
    request<{ customer: Customer; transactions: Transaction[] }>(`/api/customers/${id}`),

  createCustomer: (data: Partial<Customer>) =>
    request<Customer>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCustomer: (id: string, data: any) =>
    request<Customer>(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCustomer: (id: string, projectPassword: string) =>
    request<{ message: string }>(`/api/customers/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ projectPassword }),
    }),

  // Transactions
  getTransactions: (filters: { customerId?: string; fromDate?: string; toDate?: string; status?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.customerId) params.append('customerId', filters.customerId);
    if (filters.fromDate) params.append('fromDate', filters.fromDate);
    if (filters.toDate) params.append('toDate', filters.toDate);
    if (filters.status) params.append('status', filters.status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<Transaction[]>(`/api/transactions${query}`);
  },

  createTransaction: (data: {
    customerId: string;
    type: 'payment' | 'withdrawal';
    amount: number;
    date: string;
    time: string;
    description: string;
  }) =>
    request<{ transaction: Transaction; customer: Customer }>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTransaction: (
    id: string,
    data: { amount: number; type: string; date: string; time: string; description?: string; reason?: string }
  ) =>
    request<{ transaction: Transaction; customer: Customer; message: string; changes: string[] }>(
      `/api/transactions/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    ),

  cancelTransaction: (id: string, reason: string) =>
    request<{ transaction: Transaction; customer: Customer; message: string }>(
      `/api/transactions/${id}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    ),

  // Reports
  getReportsSummary: (fromDate?: string, toDate?: string) => {
    const params = new URLSearchParams();
    if (fromDate) params.append('fromDate', fromDate);
    if (toDate) params.append('toDate', toDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    return request<ReportsSummary>(`/api/reports/summary${query}`);
  },

  // Notifications
  getNotifications: () => request<NotificationItem[]>('/api/notifications'),

  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'POST' }),

  markAllNotificationsRead: () =>
    request<{ success: boolean }>('/api/notifications/read-all', { method: 'POST' }),

  // Logs
  getActivityLogs: () => request<ActivityLog[]>('/api/activity-logs'),

  // Backups & Data
  getBackups: () => request<BackupItem[]>('/api/backups'),

  createBackup: () =>
    request<BackupItem & { message: string }>('/api/backups/create', { method: 'POST' }),

  restoreBackup: (id: string, projectPassword: string) =>
    request<{ message: string }>(`/api/backups/restore/${id}`, {
      method: 'POST',
      body: JSON.stringify({ projectPassword }),
    }),

  exportData: (options: { includeCustomers?: boolean; includeTransactions?: boolean; includeReports?: boolean }) =>
    request<any>('/api/data/export', {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  importData: (backupData: any) =>
    request<{ message: string; customersCount: number; transactionsCount: number }>('/api/data/import', {
      method: 'POST',
      body: JSON.stringify({ backupData }),
    }),

  resetData: (projectPassword: string) =>
    request<{ message: string }>('/api/data/reset', {
      method: 'POST',
      body: JSON.stringify({ projectPassword }),
    }),

  // ── إدارة المستخدمين والصلاحيات ──
  getAccounts: () => request<AccountRow[]>('/api/accounts'),

  createAccount: (payload: {
    name: string;
    phone: string;
    email?: string;
    password: string;
    role: 'manager' | 'employee';
    permissions?: PermissionCode[];
  }) =>
    request<{
      message: string;
      status: string;
      account_status: string;
      membership_id: string;
      user_id: string;
      request_id: string | null;
      permissions: PermissionCode[];
      proposed_permissions: PermissionCode[];
      rejected_permissions: string[];
    }>('/api/accounts', { method: 'POST', body: JSON.stringify(payload) }),

  getAccountRequests: (status: 'pending' | 'all' | 'approved' | 'rejected' = 'pending') =>
    request<AccountRequestRow[]>(`/api/accounts/requests?status=${status}`),

  decideAccountRequest: (requestId: string, payload: { decision: 'approve' | 'reject'; note?: string; permissions?: PermissionCode[] }) =>
    request<{ message: string; request_status: string }>(`/api/accounts/requests/${requestId}/decide`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  requestAccountAction: (membershipId: string, payload: { type: Exclude<AccountRequestType, 'create_account'>; reason?: string }) =>
    request<{ message: string; request_id: string; status: string; account_status: string }>(
      `/api/accounts/${membershipId}/request`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  disableAccount: (membershipId: string, reason?: string) =>
    request<{ message: string; account_status: string }>(`/api/accounts/${membershipId}/disable`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  enableAccount: (membershipId: string) =>
    request<{ message: string; account_status: string; permissions: PermissionCode[] }>(
      `/api/accounts/${membershipId}/enable`,
      { method: 'POST', body: JSON.stringify({}) }
    ),

  deleteAccount: (membershipId: string) =>
    request<{ message: string; account_status: string; preserved_transactions: number }>(
      `/api/accounts/${membershipId}/delete`,
      { method: 'POST', body: JSON.stringify({ confirm: true }) }
    ),

  resetAccountPassword: (membershipId: string, reason?: string) =>
    request<{ message: string; temporary_password: string; revoked_sessions: number; must_change_password: boolean }>(
      `/api/accounts/${membershipId}/reset-password`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),

  getAccountActivity: (membershipId: string) =>
    request<AuditActivityRow[]>(`/api/accounts/${membershipId}/activity`),

  // Employees (مسارات قديمة — محفوظة للتوافق)
  getEmployees: () => request<any[]>('/api/employees'),
  addEmployee: (data: any) =>
    request<{ message: string }>('/api/employees', { method: 'POST', body: JSON.stringify(data) }),
  deleteEmployee: (membershipId: string) =>
    request<{ message: string }>(`/api/employees/${membershipId}`, { method: 'DELETE' }),
};
