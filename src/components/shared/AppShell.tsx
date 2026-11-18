import React, { Suspense, useState } from 'react';
import { ChevronsLeft, ChevronsRight, LogOut, Menu as MenuIcon, UserRound, X } from 'lucide-react';
import { Link, useRouter } from '../../lib/router';
import { useAuth } from '../../lib/auth';
import { PORTALS, type NavItem } from '../../lib/portals';
import { usePortalAccent } from '../../lib/theme';
import type { PortalId } from '../../../shared/types';
import { Skeleton, cx } from './ui';
import { Avatar } from './Avatar';
import { BrandFooter, EbSubmark, HeaderLockup } from './brand';

/** Brand mark: the ECB header lockup (or the EB submark when compact). */
export function Brand({ subtitle, compact, onNavy }: { subtitle?: string; compact?: boolean; onNavy?: boolean }) {
  return compact ? <EbSubmark size={34} /> : <HeaderLockup onNavy={onNavy} size={40} subtitle={subtitle} />;
}

/** Role badges are navy pills with white text in every portal. */
const BADGE: Record<PortalId, string> = {
  superadmin: 'bg-navy text-white',
  admin: 'bg-navy text-white',
  user: 'bg-navy text-white',
};

/** Coloured role badge shown in each portal's header. */
export function PortalBadge({ portal, className }: { portal: PortalId; className?: string }) {
  const p = PORTALS[portal];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide', BADGE[portal], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-orange" aria-hidden="true" />
      {p.badge}
    </span>
  );
}


const COLLAPSE_KEY = 'certigen.sidebar';

export function AppShell({ children, portal }: { children: React.ReactNode; portal: PortalId }) {
  const { user, logout } = useAuth();
  const { path, navigate } = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  usePortalAccent(portal);
  const def = PORTALS[portal];
  const profilePath = portal === 'user' ? '/profile' : `${def.base}/profile`;

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const isActive = (n: NavItem) => (n.exact ? path === n.to : path === n.to || path.startsWith(`${n.to}/`));
  const signOut = async () => {
    await logout();
    navigate(def.login, { replace: true });
  };

  const sidebar = (mini: boolean) => (
    <div className="flex h-full flex-col">
      <div className={cx('flex h-20 items-center border-b border-white/10', mini ? 'justify-center px-2' : 'px-4')}>
        <Brand subtitle={`CertiGen · ${def.name}`} compact={mini} onNavy />
      </div>
      <nav className={cx('flex-1 space-y-1 py-2', mini ? 'px-2' : 'px-3')} aria-label="Main">
        {def.nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            onClick={() => setMobileOpen(false)}
            title={mini ? n.label : undefined}
            className={cx(
              'group relative flex items-center rounded-lg text-sm font-medium transition-colors',
              mini ? 'h-10 justify-center' : 'gap-3 px-3 py-2',
              isActive(n) ? 'bg-navy-tint text-white' : 'text-white/85 hover:bg-white/10 hover:text-white'
            )}
            aria-current={isActive(n) ? 'page' : undefined}
          >
            {isActive(n) && <span className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-orange" aria-hidden="true" />}
            <span className={cx(isActive(n) ? 'text-orange' : 'text-white/85 group-hover:text-white')}>{n.icon}</span>
            {!mini && n.label}
          </Link>
        ))}
      </nav>
      <div className={cx('border-t border-white/10', mini ? 'p-2' : 'p-3')}>
        {user && (
          <>
            {!mini && (
              <div className="flex items-center gap-3 px-2 pb-2 pt-1">
                <Avatar name={user.name} fileId={user.avatarFileId} size={32} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{user.name}</p>
                  <p className="truncate text-xs text-white/75">{user.email}</p>
                </div>
              </div>
            )}
            <Link
              to={profilePath}
              onClick={() => setMobileOpen(false)}
              title="My profile"
              aria-current={path === profilePath ? 'page' : undefined}
              className={cx(
                'flex w-full items-center rounded-lg text-sm hover:bg-white/10 hover:text-white',
                path === profilePath ? 'bg-navy-tint text-white' : 'text-white/85',
                mini ? 'h-10 justify-center' : 'gap-3 px-3 py-2'
              )}
            >
              <UserRound className="h-4 w-4" /> {!mini && 'My profile'}
            </Link>
            <button
              onClick={signOut}
              title="Sign out"
              className={cx('flex w-full items-center rounded-lg text-sm text-white/85 hover:bg-white/10 hover:text-white', mini ? 'h-10 justify-center' : 'gap-3 px-3 py-2')}
            >
              <LogOut className="h-4 w-4" /> {!mini && 'Sign out'}
            </button>
          </>
        )}
        <button
          onClick={toggleCollapsed}
          className={cx('mt-1 hidden w-full items-center rounded-lg text-xs text-white/75 hover:bg-white/10 hover:text-white lg:flex', mini ? 'h-9 justify-center' : 'gap-3 px-3 py-2')}
          aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {mini ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          {!mini && 'Collapse'}
        </button>
      </div>
    </div>
  );

  return (
    <div className={cx('flex min-h-screen flex-col', collapsed ? 'lg:pl-[72px]' : 'lg:pl-72')}>
      <aside className={cx('fixed inset-y-0 left-0 z-30 hidden bg-navy text-white lg:block', collapsed ? 'w-[72px]' : 'w-72')}>{sidebar(collapsed)}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy text-white shadow-xl">
            <button className="absolute right-3 top-4 z-10 p-2 text-white/70" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar(false)}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
        <button onClick={() => setMobileOpen(true)} className="-ml-2 p-2 text-slate-600 lg:hidden" aria-label="Open menu">
          <MenuIcon className="h-5 w-5" />
        </button>
        <div className="lg:hidden">
          <Brand compact />
        </div>
        <PortalBadge portal={portal} />
        <span className="hidden truncate text-sm text-slate-500 sm:inline">{def.tagline}</span>
        <div className="ml-auto flex items-center gap-1">
          {user && (
            <Link to={profilePath} className="ml-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange" aria-label="My profile" title="My profile">
              <Avatar name={user.name} fileId={user.avatarFileId} size={32} />
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Only the page content waits while a page loads; the sidebar and header stay in place. */}
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </main>
      <BrandFooter />
    </div>
  );
}

/** Placeholder shown inside the shell while the next page's code loads. */
function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading page">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}
