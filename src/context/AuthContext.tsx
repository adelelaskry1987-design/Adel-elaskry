import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Project } from '../types';
import {
  api,
  getStoredToken,
  setStoredToken,
  removeStoredToken,
  ACCOUNT_STATUS_EVENT,
  type InactiveAccountDetail,
} from '../services/api';

interface AuthContextType {
  user: User | null;
  project: Project | null;
  permissions: string[];
  role: string | null;
  isLoading: boolean;
  login: (identifier: string, pass: string) => Promise<void>;
  register: (payload: any) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  /** حالة الحساب داخل المحل: active | pending | disabled | rejected | deleted */
  accountStatus: string | null;
  /** سبب إيقاف الاستخدام (يُضبط عندما يرفض الخادم الطلب بسبب حالة الحساب) */
  inactiveAccount: InactiveAccountDetail | null;
  /** مسح رسالة الحساب غير النشط (بعد عرضها للمستخدم) */
  clearInactiveAccount: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [inactiveAccount, setInactiveAccount] = useState<InactiveAccountDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearInactiveAccount = () => setInactiveAccount(null);

  // استقبال الرفض المركزي من طبقة الـ API (حساب معطل/معلق/مرفوض/محذوف أو جلسة مُبطلة)
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<InactiveAccountDetail>).detail;
      setUser(null);
      setProject(null);
      setPermissions([]);
      setRole(null);
      setAccountStatus(detail?.reason ?? 'disabled');
      setInactiveAccount(detail ?? { reason: 'disabled', message: 'حسابك غير نشط حاليًا' });
    };
    window.addEventListener(ACCOUNT_STATUS_EVENT, handler);
    return () => window.removeEventListener(ACCOUNT_STATUS_EVENT, handler);
  }, []);

  const refresh = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setProject(null);
      setPermissions([]);
      setRole(null);
      setIsLoading(false);
      return;
    }

    try {
      const data = await api.getMe();
      setUser(data.user);
      setProject(data.project);
      setPermissions(data.permissions || []);
      setRole(data.role || 'owner');
      setAccountStatus((data as any).account_status ?? data.user?.account_status ?? 'active');
      setInactiveAccount(null);
    } catch (err) {
      console.warn('Session expired or invalid, logging out', err);
      removeStoredToken();
      setUser(null);
      setProject(null);
      setPermissions([]);
      setRole(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (identifier: string, pass: string) => {
    const res = await api.login(identifier, pass);
    setStoredToken(res.token);
    setUser(res.user);
    setProject(res.project);
    setPermissions(res.permissions || []);
    setRole(res.user.role);
    setAccountStatus((res.user as any).account_status ?? 'active');
    setInactiveAccount(null);
  };

  const register = async (payload: any) => {
    const res = await api.register(payload);
    setStoredToken(res.token);
    setUser(res.user);
    setProject(res.project);
    setPermissions(res.permissions || []);
    setRole(res.user.role);
    setAccountStatus((res.user as any)?.account_status ?? 'active');
    setInactiveAccount(null);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    } finally {
      removeStoredToken();
      setUser(null);
      setProject(null);
      setPermissions([]);
      setRole(null);
      setAccountStatus(null);
    }
  };

  /**
   * هل يملك المستخدم الحالي الصلاحية؟
   * ملاحظة أمنية: هذه الطبقة لتجربة الاستخدام فقط (إخفاء/تعطيل)؛
   * التحقق الفعلي والملزم يحدث على الخادم في كل طلب.
   */
  const hasPermission = (perm: string) => {
    if (!user) return false;
    if (role === 'owner') return true;
    return permissions.includes(perm);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        project,
        permissions,
        role,
        isLoading,
        login,
        register,
        logout,
        refresh,
        hasPermission,
        accountStatus,
        inactiveAccount,
        clearInactiveAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
