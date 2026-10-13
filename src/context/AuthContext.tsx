import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Project } from '../types';
import { api, getStoredToken, setStoredToken, removeStoredToken } from '../services/api';

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
  };

  const register = async (payload: any) => {
    const res = await api.register(payload);
    setStoredToken(res.token);
    setUser(res.user);
    setProject(res.project);
    setPermissions(res.permissions || []);
    setRole(res.user.role);
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
    }
  };

  const hasPermission = (perm: string) => {
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
