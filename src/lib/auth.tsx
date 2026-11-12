import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PublicUser } from '../../shared/types';
import { api, onUnauthorised } from './api';

interface AuthValue {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api.get<{ user: PublicUser | null }>('/api/auth/me');
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const off = onUnauthorised(() => setUser(null));
    return () => {
      off();
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ user: PublicUser }>('/api/auth/login', { email, password });
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}
