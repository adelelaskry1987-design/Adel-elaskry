import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Customer, Transaction, NotificationItem, ReportsSummary, ScreenId } from './types';
import { api } from './services/api';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { ScreenSwitcher } from './components/ScreenSwitcher';
import { Screen36Users, Screen37UserAdd, Screen38UserRequests } from './components/screens/ScreensPart6';

// Screens Part 1 (1 to 7)
import {
  Screen1Splash,
  Screen2CustomerAddedSuccess,
  Screen3Profile,
  Screen4Login,
  Screen5Home,
  Screen6CustomerDelete,
  Screen7CustomerAdd,
} from './components/screens/ScreensPart1';

// Screens Part 2 (8 to 14)
import {
  Screen8PasswordChangedSuccess,
  Screen9AppLogo,
  Screen10CustomerDeletedSuccess,
  Screen11CustomerDetails,
  Screen12ChangePassword,
  Screen13TransactionSavedSuccess,
  Screen14NewTransaction,
} from './components/screens/ScreensPart2';

// Screens Part 3 (15 to 21)
import {
  Screen15Customers,
  Screen16CustomerUpdatedSuccess,
  Screen17ShareMenu,
  Screen18AllTransactions,
  Screen19CustomerTransactions,
  Screen20Backup,
  Screen21BackupCreate,
} from './components/screens/ScreensPart3';

// Screens Part 4 (22 to 28)
import {
  Screen22BackupRestore,
  Screen23ResetDataSuccess,
  Screen24ResetData,
  Screen25DataImport,
  Screen26DataImportSuccess,
  Screen27DataExport,
  Screen28DataExportSuccess,
} from './components/screens/ScreensPart4';

// Screens Part 5 (29 to 35)
import {
  Screen29Notifications,
  Screen30About,
  Screen31CustomerEdit,
  Screen32Settings,
  Screen33Reports,
  Screen34DataManagement,
  Screen35Support,
} from './components/screens/ScreensPart5';

import { WifiOff, ShieldAlert, LogIn } from 'lucide-react';

function MainApp() {
  const { user, isLoading, inactiveAccount, clearInactiveAccount, hasPermission } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<ScreenId>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset_token') && params.get('uid')) {
      return 'screen-4-login';
    }
    return 'screen-1-splash';
  });
  const [history, setHistory] = useState<ScreenId[]>([]);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // App State Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [exportedData, setExportedData] = useState<any>(null);
  const [importCounts, setImportCounts] = useState<{ customers: number; transactions: number }>({
    customers: 0,
    transactions: 0,
  });

  // Track Online / Offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch project data whenever user logs in or data changes
  const refreshAllData = async () => {
    if (!user) return;
    try {
      const [cList, tList, nList, sData] = await Promise.all([
        api.getCustomers(),
        api.getTransactions(),
        api.getNotifications(),
        api.getReportsSummary(),
      ]);

      setCustomers(cList);
      setTransactions(tList);
      setNotifications(nList);
      setSummary(sData);

      // If a customer was selected, update their latest object
      if (selectedCustomer) {
        const updated = cList.find((c) => c.id === selectedCustomer.id);
        if (updated) setSelectedCustomer(updated);
      }
    } catch (err) {
      console.warn('Error fetching project data:', err);
    }
  };

  useEffect(() => {
    if (user) {
      refreshAllData();
    }
  }, [user]);

  // Screen Navigation Router
  const navigateTo = (screen: ScreenId) => {
    setHistory((prev) => [...prev, currentScreen]);
    setCurrentScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory((old) => old.slice(0, old.length - 1));
      setCurrentScreen(prev);
    } else {
      setCurrentScreen('screen-5-home');
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-page)] flex flex-col items-center justify-center text-[var(--text-primary)]">
        <div className="w-12 h-12 border-4 border-[var(--color-gold)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-semibold text-[var(--text-secondary)]">جاري تحميل نظام AH2...</p>
      </div>
    );
  }

  // شاشة الحساب غير النشط (تعطيل/انتظار اعتماد/رفض/حذف) — تأتي من رفض الخادم
  if (!user && inactiveAccount) {
    const titles: Record<string, string> = {
      pending: 'حسابك في انتظار الاعتماد',
      disabled: 'حسابك معطل',
      rejected: 'تم رفض طلب إنشاء الحساب',
      deleted: 'هذا الحساب محذوف',
      none: 'لا يوجد عضوية صالحة',
    };

    const hints: Record<string, string> = {
      pending: 'حسابك لم يُعتمد بعد من صاحب المحل. يمكنك الدخول بعد اعتماده.',
      disabled: 'تم تعطيل حسابك. بياناتك وعملياتك السابقة محفوظة كما هي، ولا يمكنك الدخول إلا بعد إعادة التفعيل من صاحب المحل.',
      rejected: 'رفض صاحب المحل طلب إنشاء هذا الحساب، لذلك لا يمكن استخدامه للدخول.',
      deleted: 'تم حذف هذا الحساب ولا يمكن استخدامه، سجلاته السابقة محفوظة في النظام.',
      none: 'الحساب غير مرتبط بعضوية صالحة في المحل، يرجى مراجعة صاحب المحل.',
    };

    return (
      <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-base font-black mb-2">{titles[inactiveAccount.reason] ?? 'الحساب غير نشط'}</h1>
        <p className="text-xs font-semibold text-[var(--text-secondary)] leading-relaxed max-w-xs mb-1">
          {inactiveAccount.message}
        </p>
        <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed max-w-xs mb-6">
          {hints[inactiveAccount.reason] ?? 'يرجى مراجعة صاحب المحل.'}
        </p>
        <button
          type="button"
          onClick={() => {
            clearInactiveAccount();
            setCurrentScreen('screen-4-login');
          }}
          className="py-2.5 px-5 rounded-xl theme-btn-primary font-bold text-xs flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          <span>العودة لتسجيل الدخول</span>
        </button>
      </div>
    );
  }

  // Auth Guard: if not authenticated and not splash/login/logo/about, redirect to login
  const publicScreens: ScreenId[] = [
    'screen-1-splash',
    'screen-4-login',
    'screen-9-app-logo',
    'screen-30-about',
    'screen-35-support',
  ];
  if (!user && !publicScreens.includes(currentScreen)) {
    return <Screen4Login onNavigate={navigateTo} />;
  }

  const isLoginScreen = currentScreen === 'screen-4-login';

  /**
   * خريطة الشاشات الحساسة والصلاحيات المطلوبة لكل شاشة.
   * تُطبَّق هنا كبوابة واجهة (دفاع في العمق) — والحماية الفعلية على الخادم.
   * كل شاشة تحتاج أن يملك المستخدم أيًّا من الصلاحيات المذكورة.
   */
  const SCREEN_PERMISSIONS: Partial<Record<ScreenId, string[]>> = {
    'screen-6-customer-delete': ['delete_customer'],
    'screen-7-customer-add': ['add_customer'],
    'screen-14-new-transaction': ['create_transaction'],
    'screen-17-share-menu': ['share_invoices'],
    'screen-18-all-transactions': ['view_all_transactions', 'view_customer_transactions'],
    'screen-19-customer-transactions': ['view_customer_transactions'],
    'screen-20-backup': ['manage_backups'],
    'screen-21-backup-create': ['manage_backups'],
    'screen-22-backup-restore': ['restore_data'],
    'screen-24-reset-data': ['reset_data'],
    'screen-25-data-import': ['restore_data'],
    'screen-27-data-export': ['manage_backups'],
    'screen-31-customer-edit': ['edit_customer'],
    'screen-33-reports': ['view_reports'],
    'screen-36-users': ['manage_users'],
    'screen-37-user-add': ['create_employees'],
    'screen-38-user-requests': ['approve_requests'],
  };

  const requiredPerms = SCREEN_PERMISSIONS[currentScreen];
  const screenDenied = !!requiredPerms && !requiredPerms.some((p) => hasPermission(p));

  return (
    <div
      className={`min-h-screen flex flex-col antialiased transition-colors duration-200 ${
        isLoginScreen
          ? 'bg-[#08172b] text-white'
          : 'bg-[var(--bg-page)] text-[var(--text-primary)]'
      }`}
    >
      {/* Offline Alert Strip */}
      {!isOnline && (
        <div className="bg-amber-600 text-white text-[11px] font-bold py-1.5 px-4 text-center flex items-center justify-center gap-1.5 sticky top-0 z-50 shadow-sm">
          <WifiOff className="w-3.5 h-3.5" />
          <span>تنبيه: أنت تعمل في وضع عدم الاتصال بالإنترنت حالياً</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        currentScreen={currentScreen}
        onNavigate={navigateTo}
        onBack={handleBack}
        unreadNotificationsCount={unreadCount}
        onOpenScreenSwitcher={() => setIsSwitcherOpen(true)}
      />

      {/* Main Content Area */}
      <main className={isLoginScreen ? 'flex-1 w-full' : 'flex-1 w-full max-w-md mx-auto'}>
        {/* بوابة الصلاحيات: لا تُعرَض الشاشة الحساسة لمن لا يملك صلاحيتها */}
        {screenDenied && (
          <div className="p-4 max-w-md mx-auto space-y-3 pb-24 select-none">
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-red-50 border-2 border-red-200 mx-auto flex items-center justify-center">
                <ShieldAlert className="w-7 h-7 text-red-600" />
              </div>
              <h2 className="font-black text-sm text-slate-800">لا تملك صلاحية لهذه الشاشة</h2>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                هذه الصفحة تتطلب صلاحية لا يمتلكها حسابك داخل المحل. تواصل مع صاحب المحل إذا كنت
                تحتاج هذه الصلاحية — لا يمكن منحها إلا من صاحبه.
              </p>
              <button
                onClick={() => navigateTo('screen-5-home')}
                className="w-full py-2.5 rounded-xl theme-btn-primary font-bold text-xs"
              >
                العودة إلى الرئيسية
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 1: SPLASH */}
        {!screenDenied && currentScreen === 'screen-1-splash' && <Screen1Splash onNavigate={navigateTo} />}

        {/* SCREEN 2: CUSTOMER ADDED SUCCESS */}
        {currentScreen === 'screen-2-customer-added-success' && (
          <Screen2CustomerAddedSuccess onNavigate={navigateTo} />
        )}

        {/* SCREEN 3: PROFILE */}
        {currentScreen === 'screen-3-profile' && <Screen3Profile onNavigate={navigateTo} />}

        {/* SCREEN 4: LOGIN / REGISTER */}
        {currentScreen === 'screen-4-login' && <Screen4Login onNavigate={navigateTo} />}

        {/* SCREEN 5: HOME DASHBOARD (NO "إجمالي العملاء" button per requirement #2) */}
        {currentScreen === 'screen-5-home' && (
          <Screen5Home onNavigate={navigateTo} summary={summary} />
        )}

        {/* SCREEN 6: CUSTOMER DELETE */}
        {!screenDenied && currentScreen === 'screen-6-customer-delete' && (
          <Screen6CustomerDelete
            customer={selectedCustomer}
            onNavigate={navigateTo}
            onDeleted={refreshAllData}
          />
        )}

        {/* SCREEN 7: CUSTOMER ADD */}
        {!screenDenied && currentScreen === 'screen-7-customer-add' && (
          <Screen7CustomerAdd onNavigate={navigateTo} onCustomerAdded={refreshAllData} />
        )}

        {/* SCREEN 8: PASSWORD CHANGED SUCCESS */}
        {currentScreen === 'screen-8-password-changed-success' && (
          <Screen8PasswordChangedSuccess onNavigate={navigateTo} />
        )}

        {/* SCREEN 9: APP LOGO */}
        {currentScreen === 'screen-9-app-logo' && <Screen9AppLogo onNavigate={navigateTo} />}

        {/* SCREEN 10: CUSTOMER DELETED SUCCESS */}
        {currentScreen === 'screen-10-customer-deleted-success' && (
          <Screen10CustomerDeletedSuccess onNavigate={navigateTo} />
        )}

        {/* SCREEN 11: CUSTOMER DETAILS */}
        {currentScreen === 'screen-11-customer-details' && (
          <Screen11CustomerDetails customer={selectedCustomer} onNavigate={navigateTo} />
        )}

        {/* SCREEN 12: CHANGE PASSWORD */}
        {currentScreen === 'screen-12-change-password' && (
          <Screen12ChangePassword onNavigate={navigateTo} />
        )}

        {/* SCREEN 13: TRANSACTION SAVED SUCCESS */}
        {currentScreen === 'screen-13-transaction-saved-success' && (
          <Screen13TransactionSavedSuccess onNavigate={navigateTo} />
        )}

        {/* SCREEN 14: NEW TRANSACTION ("عملية جديدة" per requirement #1) */}
        {!screenDenied && currentScreen === 'screen-14-new-transaction' && (
          <Screen14NewTransaction
            customer={selectedCustomer}
            onNavigate={navigateTo}
            onTransactionSaved={refreshAllData}
          />
        )}

        {/* SCREEN 15: CUSTOMERS */}
        {currentScreen === 'screen-15-customers' && (
          <Screen15Customers
            customers={customers}
            onSelectCustomer={setSelectedCustomer}
            onNavigate={navigateTo}
            onRefresh={refreshAllData}
          />
        )}

        {/* SCREEN 16: CUSTOMER UPDATED SUCCESS */}
        {currentScreen === 'screen-16-customer-updated-success' && (
          <Screen16CustomerUpdatedSuccess onNavigate={navigateTo} />
        )}

        {/* SCREEN 17: SHARE MENU */}
        {!screenDenied && currentScreen === 'screen-17-share-menu' && <Screen17ShareMenu onNavigate={navigateTo} />}

        {/* SCREEN 18: ALL TRANSACTIONS */}
        {!screenDenied && currentScreen === 'screen-18-all-transactions' && (
          <Screen18AllTransactions
            transactions={transactions}
            onNavigate={navigateTo}
            onRefresh={refreshAllData}
          />
        )}

        {/* SCREEN 19: CUSTOMER TRANSACTIONS */}
        {!screenDenied && currentScreen === 'screen-19-customer-transactions' && (
          <Screen19CustomerTransactions customer={selectedCustomer} onNavigate={navigateTo} />
        )}

        {/* SCREEN 20: BACKUP OVERVIEW */}
        {!screenDenied && currentScreen === 'screen-20-backup' && <Screen20Backup onNavigate={navigateTo} />}

        {/* SCREEN 21: BACKUP CREATE */}
        {!screenDenied && currentScreen === 'screen-21-backup-create' && (
          <Screen21BackupCreate onNavigate={navigateTo} />
        )}

        {/* SCREEN 22: BACKUP RESTORE */}
        {!screenDenied && currentScreen === 'screen-22-backup-restore' && (
          <Screen22BackupRestore onNavigate={navigateTo} onRestored={refreshAllData} />
        )}

        {/* SCREEN 23: RESET DATA SUCCESS */}
        {currentScreen === 'screen-23-reset-data-success' && (
          <Screen23ResetDataSuccess onNavigate={navigateTo} />
        )}

        {/* SCREEN 24: RESET DATA */}
        {!screenDenied && currentScreen === 'screen-24-reset-data' && (
          <Screen24ResetData onNavigate={navigateTo} onDataReset={refreshAllData} />
        )}

        {/* SCREEN 25: DATA IMPORT */}
        {!screenDenied && currentScreen === 'screen-25-data-import' && (
          <Screen25DataImport onNavigate={navigateTo} onImportComplete={setImportCounts} />
        )}

        {/* SCREEN 26: DATA IMPORT SUCCESS */}
        {currentScreen === 'screen-26-data-import-success' && (
          <Screen26DataImportSuccess onNavigate={navigateTo} importCounts={importCounts} />
        )}

        {/* SCREEN 27: DATA EXPORT */}
        {!screenDenied && currentScreen === 'screen-27-data-export' && (
          <Screen27DataExport onNavigate={navigateTo} onExportDone={setExportedData} />
        )}

        {/* SCREEN 28: DATA EXPORT SUCCESS */}
        {currentScreen === 'screen-28-data-export-success' && (
          <Screen28DataExportSuccess onNavigate={navigateTo} exportedData={exportedData} />
        )}

        {/* SCREEN 29: NOTIFICATIONS */}
        {currentScreen === 'screen-29-notifications' && (
          <Screen29Notifications
            notifications={notifications}
            onNavigate={navigateTo}
            onRefresh={refreshAllData}
          />
        )}

        {/* SCREEN 30: ABOUT APP */}
        {currentScreen === 'screen-30-about' && <Screen30About onNavigate={navigateTo} />}

        {/* SCREEN 31: CUSTOMER EDIT */}
        {!screenDenied && currentScreen === 'screen-31-customer-edit' && (
          <Screen31CustomerEdit
            customer={selectedCustomer}
            onNavigate={navigateTo}
            onUpdated={refreshAllData}
          />
        )}

        {/* SCREEN 32: SETTINGS */}
        {currentScreen === 'screen-32-settings' && <Screen32Settings onNavigate={navigateTo} />}

        {/* SCREEN 33: REPORTS */}
        {!screenDenied && currentScreen === 'screen-33-reports' && <Screen33Reports onNavigate={navigateTo} />}

        {/* SCREEN 34: DATA MANAGEMENT */}
        {currentScreen === 'screen-34-data-management' && (
          <Screen34DataManagement onNavigate={navigateTo} />
        )}

        {/* SCREEN 35: SUPPORT */}
        {currentScreen === 'screen-35-support' && <Screen35Support onNavigate={navigateTo} />}

        {/* SCREEN 36: USER MANAGEMENT */}
        {!screenDenied && currentScreen === 'screen-36-users' && <Screen36Users onNavigate={navigateTo} />}

        {/* SCREEN 37: ADD USER */}
        {!screenDenied && currentScreen === 'screen-37-user-add' && <Screen37UserAdd onNavigate={navigateTo} />}

        {/* SCREEN 38: ACCOUNT REQUESTS */}
        {!screenDenied && currentScreen === 'screen-38-user-requests' && <Screen38UserRequests onNavigate={navigateTo} />}
      </main>

      {/* 5-Tab Bottom Navigation Bar */}
      <BottomNav currentScreen={currentScreen} onNavigate={navigateTo} />

      {/* 35-Screens Drawer Modal */}
      <ScreenSwitcher
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        currentScreen={currentScreen}
        onSelectScreen={navigateTo}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <MainApp />
      </ThemeProvider>
    </AuthProvider>
  );
}
