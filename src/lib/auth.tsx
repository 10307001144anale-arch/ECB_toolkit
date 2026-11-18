import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PortalId, PublicUser } from '../../shared/types';
import { api, currentPortal, onUnauthorised } from './api';
import { disconnectLive } from './live';

interface AuthValue {
  user: PublicUser | null;
  loading: boolean;
  /** Set when the server could not be reached to check the session (not the same as signed out). */
  offline: boolean;
  /** Portal the current session check belongs to (each portal has its own session). */
  portal: PortalId;
  login: (email: string, password: string, portal?: PortalId) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [portal, setPortal] = useState<PortalId>(() => currentPortal());
  const portalRef = useRef<PortalId>(portal);

  /**
   * Checks the session. Only an answer from the server ("no session") signs
   * the person out; a network error or server error is retried, and the
   * session is kept, so a reload never sends a signed-in person to sign in.
   */
  const refresh = useCallback(async () => {
    const p = currentPortal();
    if (p !== portalRef.current) {
      // Another portal, another session: hide the previous portal's account while checking.
      portalRef.current = p;
      setLoading(true);
      disconnectLive();
    }
    setPortal(p);
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await api.get<{ user: PublicUser | null }>('/api/auth/me');
        setUser(r.user);
        setOffline(false);
        setLoading(false);
        return;
      } catch (e: any) {
        if (e?.status && e.status >= 400 && e.status < 500) {
          setUser(null);
          setOffline(false);
          setLoading(false);
          return;
        }
        await new Promise((res) => setTimeout(res, 400 * 2 ** attempt));
      }
    }
    setOffline(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // A 401 from some other request (e.g. an expired Google connection) does not
    // mean the CertiGen session ended: ask the server before signing out.
    const off = onUnauthorised(() => {
      api
        .get<{ user: PublicUser | null }>('/api/auth/me')
        .then((r) => {
          if (!r.user) setUser(null);
        })
        .catch(() => {});
    });
    return () => {
      off();
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, portal?: PortalId) => {
    const r = await api.post<{ user: PublicUser }>('/api/auth/login', { email, password, portal });
    portalRef.current = currentPortal();
    setPortal(portalRef.current);
    setUser(r.user);
    disconnectLive();
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      disconnectLive();
      setUser(null);
    }
  }, []);

  return <AuthContext.Provider value={{ user, loading, offline, portal, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth outside AuthProvider');
  return a;
}
