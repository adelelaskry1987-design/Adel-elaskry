import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Project } from '../types';
import { isFirebaseConfigured, useFirestoreData } from '../services/firebase/config';
import {
  signInWithGoogle,
  loadSessionFor,
  onGoogleAuthChange,
  GoogleAuthError,
  type ShopMember,
} from '../services/firebase/auth';
import {
  api,
  getStoredToken,
  setStoredToken,
  removeStoredToken,
  ACCOUNT_STATUS_EVENT,
  PASSWORD_CHANGE_REQUIRED_EVENT,
  type InactiveAccountDetail,
} from '../services/api';

interface AuthContextType {
  user: User | null;
  project: Project | null;
  permissions: string[];
  role: string | null;
  isLoading: boolean;
  login: (
    identifier: string,
    pass: string,
    projectId?: string
  ) => Promise<{ requiresProjectSelection: boolean; projects: { project_id: string; project_name: string; role: string }[] }>;
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
  /** هل يجب على المستخدم تغيير كلمة المرور قبل أي استخدام؟ (إعادة تعيين إجبارية) */
  mustChangePassword: boolean;
  /** هل الدخول بحساب Google متاح؟ (يظهر الزر فقط عند ضبط Firebase) */
  googleAvailable: boolean;
  /** دخول بحساب Google — يبني جلسة التطبيق من عضوية Firestore */
  loginWithGoogle: () => Promise<void>;
  /** بريد الحساب الذي حاول الدخول بلا عضوية (لعرضه مع UID للمالك) */
  googleDenied: { email: string | null; uid: string | null; reason: string } | null;
  clearGoogleDenied: () => void;
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
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [googleDenied, setGoogleDenied] = useState<{ email: string | null; uid: string | null; reason: string } | null>(null);
  const applyGoogleSessionRef = React.useRef<((m: ShopMember, s: { name: string; ownerUid: string }) => void) | null>(null);

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

  // إجبار تغيير كلمة المرور (إعادة تعيين من صاحب المحل)
  useEffect(() => {
    const handler = () => setMustChangePassword(true);
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, handler);
    return () => window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, handler);
  }, []);

  const refresh = async () => {
    // وضع السحابة: الجلسة تُستعاد من Firebase Auth عبر المستمع أدناه
    if (useFirestoreData) {
      setIsLoading(false);
      return;
    }

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
      setMustChangePassword(!!(data as any).must_change_password);
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

  // استعادة الجلسة السحابية تلقائيًا عند إعادة تحميل الصفحة
  useEffect(() => {
    if (!useFirestoreData) return;
    const unsub = onGoogleAuthChange(async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setProject(null);
        setPermissions([]);
        setRole(null);
        setIsLoading(false);
        return;
      }
      try {
        const { member, shop } = await loadSessionFor(fbUser);
        applyGoogleSessionRef.current?.(member, shop);
      } catch (err) {
        if (err instanceof GoogleAuthError) {
          setGoogleDenied({ email: fbUser.email ?? null, uid: fbUser.uid, reason: err.message });
        }
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    });
    return unsub;
  }, []);

  const login = async (identifier: string, pass: string, projectId?: string) => {
    const res = await api.login(identifier, pass, projectId);

    // لديه أكثر من محل: لا تُصدر جلسة، وتُعرض شاشة اختيار المحل
    if (res.requires_project_selection) {
      return { requiresProjectSelection: true, projects: res.projects ?? [] };
    }

    setStoredToken(res.token as string);
    setUser(res.user as User);
    setProject(res.project as Project);
    setPermissions(res.permissions || []);
    setRole((res.user as User).role);
    setAccountStatus((res.user as any).account_status ?? 'active');
    setMustChangePassword(!!res.must_change_password);
    setInactiveAccount(null);
    return { requiresProjectSelection: false, projects: [] };
  };

  /**
   * الدخول بحساب Google (Firestore هو مصدر البيانات في هذا الوضع):
   * هوية Google + عضوية نشطة = جلسة. أي حساب آخر يُرفض ويُعرض UID للمالك.
   */
  const loginWithGoogle = async () => {
    setGoogleDenied(null);
    const fbUser = await signInWithGoogle();
    try {
      const { member, shop } = await loadSessionFor(fbUser);
      applyGoogleSession(member, shop);
    } catch (err) {
      if (err instanceof GoogleAuthError) {
        setGoogleDenied({ email: fbUser.email ?? null, uid: fbUser.uid, reason: err.message });
      }
      throw err;
    }
  };

  const applyGoogleSession = (member: ShopMember, shop: { name: string; ownerUid: string }) => {
    setUser({
      id: member.uid,
      name: member.name,
      phone: member.phone,
      email: member.email,
      role: member.role,
      account_status: 'active',
      last_login_at: member.lastLoginAt ?? null,
      created_at: member.createdAt ?? new Date().toISOString(),
    } as User);
    setProject({
      id: 'main',
      name: shop.name,
      owner_id: shop.ownerUid,
      created_at: member.createdAt ?? new Date().toISOString(),
    } as Project);
    setPermissions(member.permissions || []);
    setRole(member.role);
    setAccountStatus('active');
    setMustChangePassword(false);
    setInactiveAccount(null);
  };

  applyGoogleSessionRef.current = applyGoogleSession;

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
        mustChangePassword,
      googleAvailable: isFirebaseConfigured,
      loginWithGoogle,
      googleDenied,
      clearGoogleDenied: () => setGoogleDenied(null),
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
