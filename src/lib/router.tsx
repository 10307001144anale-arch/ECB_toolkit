// Minimal client-side router (pathname based, no dependency).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface RouterValue {
  path: string;
  query: URLSearchParams;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

type BlockFn = () => boolean; // return true to allow navigation
let blocker: BlockFn | null = null;
/** Lets a page (e.g. the designer with unsaved changes) confirm before navigating away. */
export function setNavigationBlocker(fn: BlockFn | null) {
  blocker = fn;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, search: window.location.search }));

  useEffect(() => {
    const onPop = () => setLoc({ path: window.location.pathname, search: window.location.search });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (blocker && !blocker()) return;
    const url = new URL(to, window.location.origin);
    if (opts?.replace) window.history.replaceState(null, '', url.pathname + url.search);
    else window.history.pushState(null, '', url.pathname + url.search);
    setLoc({ path: url.pathname, search: url.search });
    window.scrollTo(0, 0);
  }, []);

  const value = useMemo(() => ({ path: loc.path, query: new URLSearchParams(loc.search), navigate }), [loc, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const r = useContext(RouterContext);
  if (!r) throw new Error('useRouter outside RouterProvider');
  return r;
}

/** Matches "/admin/templates/:id" style patterns. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const a = path.split('/').filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}

export function Link({ to, className, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
