import React, { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import { RouterProvider, matchPath, useRouter } from './lib/router';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider, Spinner } from './components/ui';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { VerifyPage } from './pages/VerifyPage';
import { OAuthCompletePage } from './pages/OAuthCompletePage';
import { purgeExpiredOutputs } from './engine/localStore';

// Heavier screens are loaded on demand.
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const TemplatesPage = lazy(() => import('./pages/admin/TemplatesPage'));
const TemplateDesigner = lazy(() => import('./pages/admin/TemplateDesigner'));
const ActivityPage = lazy(() => import('./pages/admin/ActivityPage'));
const ClientHome = lazy(() => import('./pages/client/ClientHome'));
const BatchWizard = lazy(() => import('./pages/client/BatchWizard'));
const HistoryPage = lazy(() => import('./pages/client/HistoryPage'));
const PresetsPage = lazy(() => import('./pages/client/PresetsPage'));

function Routes() {
  const { path, navigate } = useRouter();
  const { user, loading } = useAuth();

  // Public routes
  const verify = matchPath('/verify/:id', path);
  if (verify) return <VerifyPage id={verify.id} />;
  if (path === '/verify') return <VerifyPage id={null} />;
  if (path === '/oauth/complete' || path === '/oauth/microsoft') return <OAuthCompletePage />;

  if (loading) return <Spinner className="min-h-screen" />;

  // Client portal: open to everyone. Visitors who are not signed in (and
  // administrators visiting it) use the public client account.
  if (path === '/' ) return <Redirect to={user?.role === 'admin' ? '/admin' : '/app'} />;
  if (path === '/app' || path.startsWith('/app/')) {
    let page: React.ReactNode = null;
    if (path === '/app') page = <ClientHome />;
    else if (path === '/app/new') page = <BatchWizard />;
    else if (path === '/app/history') page = <HistoryPage />;
    else if (path === '/app/presets') page = <PresetsPage />;
    if (page) return <AppShell mode="client">{page}</AppShell>;
    return <NotFound onHome={() => navigate('/app')} />;
  }

  // Admin portal: always requires an administrator sign-in.
  if (path === '/login') {
    if (user?.role === 'admin') return <Redirect to="/admin" />;
    if (user?.role === 'client') return <Redirect to="/app" />;
    return <LoginPage />;
  }
  if (path === '/admin' || path.startsWith('/admin/')) {
    if (!user || user.role !== 'admin') {
      return <Redirect to={`/login?next=${encodeURIComponent(path + window.location.search)}`} />;
    }
    const designer = matchPath('/admin/templates/:id', path);
    if (designer) return <TemplateDesigner id={designer.id} />;
    let page: React.ReactNode = null;
    if (path === '/admin') page = <AdminDashboard />;
    else if (path === '/admin/templates') page = <TemplatesPage />;
    else if (path === '/admin/activity') page = <ActivityPage />;
    if (page) return <AppShell mode="admin">{page}</AppShell>;
  }
  return <NotFound onHome={() => navigate(user?.role === 'admin' ? '/admin' : '/app')} />;
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
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-slate-600">This page does not exist or you do not have access to it.</p>
      <button onClick={onHome} className="mt-2 text-sm font-medium text-brand-700 hover:underline">
        Go to your home page
      </button>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    purgeExpiredOutputs();
  }, []);
  return (
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider>
          <AuthProvider>
            <Suspense fallback={<Spinner className="min-h-screen" />}>
              <Routes />
            </Suspense>
          </AuthProvider>
        </RouterProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}
