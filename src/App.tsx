import React, { Suspense, lazy, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import { RouterProvider, matchPath, useRouter } from './lib/router';
import { ThemeProvider, usePortalAccent } from './lib/theme';
import { PORTALS, homeFor, portalOfPath } from './lib/portals';
import { ToastProvider } from './context/ToastContext';
import { Button, ConfirmProvider, Spinner } from './components/shared/ui';
import { AppShell, PortalBadge } from './components/shared/AppShell';
import { LoginPage } from './components/shared/LoginPage';
import { VerifyPage } from './components/shared/VerifyPage';
import { OAuthCompletePage } from './components/shared/OAuthCompletePage';
import { ForgotPasswordPage, ResetPasswordPage } from './components/shared/PasswordResetPages';
import { purgeExpiredOutputs } from './engine/localStore';
import type { PortalId } from '../shared/types';

// Heavier screens are loaded on demand.
// Super Admin portal
const SuperDashboard = lazy(() => import('./components/superadmin/AdminDashboard'));
const SuperTemplates = lazy(() => import('./components/superadmin/TemplatesPage'));
const TemplateDesigner = lazy(() => import('./components/superadmin/TemplateDesigner'));
const TemplateTest = lazy(() => import('./components/superadmin/TemplateTestPage'));
const SuperTeam = lazy(() => import('./components/superadmin/TeamPage'));
const AuditLog = lazy(() => import('./components/superadmin/ActivityPage'));
// Admin portal
const AdminHome = lazy(() => import('./components/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./components/admin/UsersPage'));
const AdminUserDetail = lazy(() => import('./components/admin/UserDetailPage'));
const AdminActivities = lazy(() => import('./components/admin/ActivitiesPage'));
const AdminAudit = lazy(() => import('./components/admin/TemplateAuditPage'));
const AdminHistory = lazy(() => import('./components/admin/AdminPages').then((m) => ({ default: m.AdminHistory })));
// User portal
const UserHome = lazy(() => import('./components/user/ClientHome'));
const BatchWizard = lazy(() => import('./components/user/BatchWizard'));
const HistoryPage = lazy(() => import('./components/user/HistoryPage'));
const PresetsPage = lazy(() => import('./components/user/PresetsPage'));
// Every portal
const ProfilePage = lazy(() => import('./components/shared/ProfilePage'));

/** Pages of each portal, outside the full-screen designer. */
function portalPage(portal: PortalId, path: string): React.ReactNode | null {
  if (path === (portal === 'user' ? '/profile' : `/${portal}/profile`)) return <ProfilePage portal={portal} />;
  if (portal === 'superadmin') {
    if (path === '/superadmin') return <SuperDashboard />;
    if (path === '/superadmin/templates') return <SuperTemplates />;
    if (path === '/superadmin/team') return <SuperTeam />;
    if (path === '/superadmin/audit') return <AuditLog />;
    return null;
  }
  if (portal === 'admin') {
    if (path === '/admin') return <AdminHome />;
    if (path === '/admin/users') return <AdminUsers />;
    const u = matchPath('/admin/users/:id', path);
    if (u) return <AdminUserDetail id={u.id} />;
    if (path === '/admin/activities') return <AdminActivities />;
    if (path === '/admin/generate') return <AdminHistory />;
    if (path === '/admin/history') return <AdminHistory />;
    if (path === '/admin/audit' || path === '/admin/templates') return <AdminAudit />;
    if (path === '/admin/clients' || path.startsWith('/admin/clients/')) return <AdminUsers />;
    return null;
  }
  if (path === '/') return <UserHome />;
  if (path === '/new') return <BatchWizard />;
  if (path === '/history') return <HistoryPage />;
  if (path === '/presets') return <PresetsPage />;
  return null;
}

function Routes() {
  const { path, query, navigate } = useRouter();
  const { user, loading, offline, refresh, portal: sessionPortal } = useAuth();
  const pathPortal = portalOfPath(path);
  // Each portal has its own session: check it again after moving to another portal.
  useEffect(() => {
    if (!loading && sessionPortal !== pathPortal) refresh();
  }, [pathPortal, sessionPortal, loading, refresh]);

  // Public routes
  const verify = matchPath('/verify/:id', path);
  if (verify) return <VerifyPage id={verify.id} />;
  if (path === '/verify') return <VerifyPage id={null} />;
  if (path === '/oauth/complete' || path === '/oauth/microsoft') return <OAuthCompletePage />;
  if (path === '/forgot-password') return <ForgotPasswordPage />;
  if (path === '/reset-password') return <ResetPasswordPage />;

  // Old client-portal links (/app/...) now live at the root of the User portal.
  if (path === '/app' || path.startsWith('/app/')) {
    const rest = path.slice(4) || '/';
    const qs = query.toString();
    return <Redirect to={`${rest}${qs ? `?${qs}` : ''}`} />;
  }

  if (loading || sessionPortal !== pathPortal) return <Spinner className="min-h-screen" />;
  if (!user && offline)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold text-navy">Cannot reach the server</h1>
        <p className="max-w-md text-sm text-slate-600">Your session is kept. Check your connection, then try again.</p>
        <Button variant="primary" onClick={() => refresh()}>
          Try again
        </Button>
      </div>
    );

  const portal = portalOfPath(path);
  const def = PORTALS[portal];

  // Each portal has its own sign-in page.
  if (path === def.login) {
    if (user?.role === portal) return <Redirect to={def.base} />;
    return <LoginPage portal={portal} />;
  }

  if (!user) return <Redirect to={`${def.login}?next=${encodeURIComponent(path + window.location.search)}`} />;
  // Role guard: every role can only open its own portal.
  if (user.role !== portal) return <WrongPortal portal={portal} />;

  if (portal === 'superadmin') {
    const test = matchPath('/superadmin/templates/:id/test', path);
    if (test) return <TemplateTest id={test.id} />;
    const designer = matchPath('/superadmin/templates/:id', path);
    if (designer) return <TemplateDesigner id={designer.id} />;
  }

  const page = portalPage(portal, path);
  if (page) return <AppShell portal={portal}>{page}</AppShell>;
  return <NotFound onHome={() => navigate(homeFor(user.role))} />;
}

/** Signed in, but this portal belongs to another role. */
function WrongPortal({ portal }: { portal: PortalId }) {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();
  usePortalAccent(portal);
  const mine = PORTALS[user!.role];
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-amber-50 p-3 text-amber-600">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <PortalBadge portal={portal} />
      <h1 className="text-xl font-semibold text-slate-900">This area is for {PORTALS[portal].name} accounts</h1>
      <p className="max-w-md text-sm text-slate-600">
        You are signed in as <b>{user!.name}</b> with a {mine.name} account. Go to your own portal, or sign out and sign in with a {PORTALS[portal].name} account.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={() => navigate(mine.base)}>
          Go to the {mine.name} portal
        </Button>
        <Button
          onClick={async () => {
            await logout();
            navigate(PORTALS[portal].login, { replace: true });
          }}
        >
          Sign out
        </Button>
      </div>
    </div>
  );
}

function Redirect({ to }: { to: string }) {
  const { navigate } = useRouter();
  useEffect(() => navigate(to, { replace: true }), [to, navigate]);
  return null;
}

function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-600">This page does not exist or you do not have access to it.</p>
      <button onClick={onHome} className="mt-2 text-sm font-medium text-brand-700 hover:underline">
        Go to your home page
      </button>
    </div>
  );
}

/** Loads every page's code in the background so moving between pages never waits. */
const PRELOAD: Record<PortalId, (() => Promise<unknown>)[]> = {
  superadmin: [
    () => import('./components/superadmin/AdminDashboard'),
    () => import('./components/superadmin/TemplatesPage'),
    () => import('./components/superadmin/TemplateDesigner'),
    () => import('./components/superadmin/TemplateTestPage'),
    () => import('./components/superadmin/TeamPage'),
    () => import('./components/superadmin/ActivityPage'),
  ],
  admin: [
    () => import('./components/admin/AdminDashboard'),
    () => import('./components/admin/UsersPage'),
    () => import('./components/admin/UserDetailPage'),
    () => import('./components/admin/ActivitiesPage'),
    () => import('./components/admin/AdminPages'),
    () => import('./components/admin/TemplateAuditPage'),
  ],
  user: [
    () => import('./components/user/ClientHome'),
    () => import('./components/user/BatchWizard'),
    () => import('./components/user/HistoryPage'),
    () => import('./components/user/PresetsPage'),
  ],
};

function usePreloadPortal() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const run = () => PRELOAD[user.role].forEach((load) => load().catch(() => {}));
    const w = window as any;
    const id = w.requestIdleCallback ? w.requestIdleCallback(run) : setTimeout(run, 800);
    return () => (w.cancelIdleCallback ? w.cancelIdleCallback(id) : clearTimeout(id));
  }, [user]);
}

function PreloadPortal() {
  usePreloadPortal();
  return null;
}

export default function App() {
  useEffect(() => {
    purgeExpiredOutputs();
  }, []);
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider>
            <AuthProvider>
              <PreloadPortal />
              <Suspense fallback={<Spinner className="min-h-screen" />}>
                <Routes />
              </Suspense>
            </AuthProvider>
          </RouterProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
