import React, { useState } from 'react';
import {
  Activity,
  Award,
  FilePlus2,
  History,
  Home,
  KeyRound,
  LayoutTemplate,
  LogOut,
  Menu as MenuIcon,
  BookmarkCheck,
  Users,
  X,
  ShieldCheck,
  ArrowLeftRight,
} from 'lucide-react';
import { Link, useRouter } from '../lib/router';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Button, Field, Input, Modal, cx } from './ui';
import { useToast } from '../context/ToastContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: <Home className="h-4 w-4" />, exact: true },
  { to: '/admin/templates', label: 'Templates', icon: <LayoutTemplate className="h-4 w-4" /> },
  { to: '/admin/activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
];

const CLIENT_NAV: NavItem[] = [
  { to: '/app', label: 'Home', icon: <Home className="h-4 w-4" />, exact: true },
  { to: '/app/new', label: 'New batch', icon: <FilePlus2 className="h-4 w-4" /> },
  { to: '/app/history', label: 'History', icon: <History className="h-4 w-4" /> },
  { to: '/app/presets', label: 'Content presets', icon: <BookmarkCheck className="h-4 w-4" /> },
];

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
        <Award className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-slate-900">CertiGen</p>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

export function AppShell({ children, mode }: { children: React.ReactNode; mode: 'admin' | 'client' }) {
  const { user, logout } = useAuth();
  const { path, navigate } = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const nav = mode === 'admin' ? ADMIN_NAV : CLIENT_NAV;
  const signedInHere = !!user && (mode === 'admin' ? user.role === 'admin' : user.role === 'client');

  const isActive = (n: NavItem) => (n.exact ? path === n.to : path === n.to || path.startsWith(`${n.to}/`));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Brand subtitle={mode === 'admin' ? 'Admin portal' : 'Certificate generator'} />
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Main">
        {nav.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            onClick={() => setMobileOpen(false)}
            className={cx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
              isActive(n) ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            )}
            aria-current={isActive(n) ? 'page' : undefined}
          >
            {n.icon}
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        {mode === 'client' ? (
          <Link
            to="/admin"
            onClick={() => setMobileOpen(false)}
            className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ShieldCheck className="h-4 w-4" /> {user?.role === 'admin' ? 'Back to admin portal' : 'Admin portal'}
          </Link>
        ) : (
          <Link
            to="/app"
            onClick={() => setMobileOpen(false)}
            className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ArrowLeftRight className="h-4 w-4" /> Open client portal
          </Link>
        )}
        {signedInHere ? (
          <>
            <div className="px-2 pb-2 pt-1">
              <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.organisation || user?.email}</p>
            </div>
            <button onClick={() => setPwOpen(true)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <KeyRound className="h-4 w-4" /> Change password
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate(mode === 'admin' ? '/login' : '/app', { replace: true });
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </>
        ) : (
          <p className="px-3 pt-1 text-xs text-slate-500">
            {user?.role === 'admin' ? `Signed in as ${user.name} (admin). Using the public client portal.` : 'No sign-in needed. Your presets and history are kept for this browser.'}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <button className="absolute right-3 top-4 p-2 text-slate-500" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setMobileOpen(true)} className="p-2 text-slate-600" aria-label="Open menu">
          <MenuIcon className="h-5 w-5" />
        </button>
        <Brand />
        <span className="w-9" />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next });
      showToast('Password changed', 'success');
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Change password" size="sm">
      <form onSubmit={submit} className="space-y-4" id="pw-form">
        <Field label="Current password" htmlFor="pw-cur">
          <Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" htmlFor="pw-new" hint="At least 10 characters, with letters and numbers.">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-conf" error={error}>
          <Input id="pw-conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Change password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
