import {
  Customer,
  Transaction,
  ReportsSummary,
  NotificationItem,
  ActivityLog,
  BackupItem,
  User,
  Project,
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
    throw new Error(data.error || 'حدث خطأ غير متوقع');
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

  login: (identifier: string, password: string) =>
    request<{ token: string; user: User; project: Project; permissions: string[] }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ identifier, password }) }
    ),

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

  // Employees
  getEmployees: () => request<any[]>('/api/employees'),
  addEmployee: (data: any) =>
    request<{ message: string }>('/api/employees', { method: 'POST', body: JSON.stringify(data) }),
  deleteEmployee: (membershipId: string) =>
    request<{ message: string }>(`/api/employees/${membershipId}`, { method: 'DELETE' }),
};
