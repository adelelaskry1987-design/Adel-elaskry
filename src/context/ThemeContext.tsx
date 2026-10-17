import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const LAST_USER_KEY = 'ah2_theme_last_user_id';
const GUEST_THEME_KEY = 'ah2_theme_mode_guest';

function getUserThemeKey(userId: string | null | undefined): string {
  if (userId) return `ah2_theme_mode_user_${userId}`;
  return GUEST_THEME_KEY;
}

function isValidThemeMode(val: string | null): val is ThemeMode {
  return val === 'light' || val === 'dark' || val === 'system';
}

function getSystemResolvedTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function readInitialThemeMode(userId?: string | null): ThemeMode {
  try {
    const effectiveUserId = userId ?? localStorage.getItem(LAST_USER_KEY);
    if (effectiveUserId) {
      const savedUserMode = localStorage.getItem(getUserThemeKey(effectiveUserId));
      if (isValidThemeMode(savedUserMode)) return savedUserMode;
    }
    const savedGuest = localStorage.getItem(GUEST_THEME_KEY);
    if (isValidThemeMode(savedGuest)) return savedGuest;
  } catch {
    // ignore storage errors
  }
  return 'light';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readInitialThemeMode(user?.id));
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemResolvedTheme());

  // Sync user-isolated theme preference when user logs in/out or changes account
  useEffect(() => {
    if (isLoading) return;
    try {
      if (user?.id) {
        localStorage.setItem(LAST_USER_KEY, user.id);
        const userSaved = localStorage.getItem(getUserThemeKey(user.id));
        if (isValidThemeMode(userSaved)) {
          setThemeModeState(userSaved);
        } else {
          // Initialize isolated default for this user without leaking another user's setting
          localStorage.setItem(getUserThemeKey(user.id), 'light');
          setThemeModeState('light');
        }
      } else {
        localStorage.removeItem(LAST_USER_KEY);
        const guestSaved = localStorage.getItem(GUEST_THEME_KEY);
        setThemeModeState(isValidThemeMode(guestSaved) ? guestSaved : 'light');
      }
    } catch {
      // ignore storage errors
    }
  }, [user?.id, isLoading]);

  // Listen to device/OS prefers-color-scheme changes in real time
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    handleChange(mediaQuery);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  const resolvedTheme: ResolvedTheme = themeMode === 'system' ? systemTheme : themeMode;

  // Apply resolved theme to <html> and <body> immediately without page reload
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
  }, [resolvedTheme]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      if (user?.id) {
        localStorage.setItem(getUserThemeKey(user.id), mode);
        localStorage.setItem(LAST_USER_KEY, user.id);
      } else {
        localStorage.setItem(GUEST_THEME_KEY, mode);
      }
    } catch {
      // ignore storage errors
    }
  };

  return (
    <ThemeContext.Provider value={{ themeMode, resolvedTheme, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
