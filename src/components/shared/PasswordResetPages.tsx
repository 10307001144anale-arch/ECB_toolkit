// "Forgot password" (ask for a reset link by email) and "Reset password"
// (choose a new one from the link). Shared by all three portals.

import React, { useEffect, useState } from 'react';
import { ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { Link, useRouter } from '../../lib/router';
import { PORTALS } from '../../lib/portals';
import { usePortalAccent } from '../../lib/theme';
import type { PortalId } from '../../../shared/types';
import { Alert, Button, Field, Input, Spinner } from './ui';
import { PortalBadge } from './AppShell';
import { EcbStripes, HeaderLockup } from './brand';

function portalFrom(q: URLSearchParams): PortalId {
  const p = q.get('portal');
  return p === 'superadmin' || p === 'admin' ? p : 'user';
}

function Frame({ portal, title, children }: { portal: PortalId; title: string; children: React.ReactNode }) {
  usePortalAccent(portal);
  useEffect(() => {
    document.title = `${title} · CertiGen · ECB`;
  }, [title]);
  return (
    <div className="relative flex min-h-screen flex-col items-center bg-white px-4 pb-28 pt-12">
      <HeaderLockup size={52} />
      <div className="mt-8 w-full max-w-md">
        <PortalBadge portal={portal} />
        <h1 className="mt-3 text-h1 text-navy">{title}</h1>
        <span className="mb-6 mt-2 block h-[3px] w-10 rounded-full bg-orange" aria-hidden="true" />
        <div className="rounded-card border border-slate-200 bg-white p-6 shadow-float">{children}</div>
        <Link to={PORTALS[portal].login} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to {PORTALS[portal].name} sign in
        </Link>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <EcbStripes />
        <div className="h-3 bg-navy" />
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const { query } = useRouter();
  const portal = portalFrom(query);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ message: string; emailEnabled: boolean }>('/api/auth/forgot-password', { email: email.trim() });
      setEmailEnabled(r.emailEnabled);
      setSent(r.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame portal={portal} title="Forgot password">
      {sent && !emailEnabled ? (
        <div className="space-y-3 text-sm text-slate-700">
          {portal === 'superadmin' ? (
            <Alert tone="warning" title="Email is not set up on this server yet">
              Super Admin passwords can then only be reset on the server: run <code className="rounded bg-white px-1">npm run create-admin -- your@email "Your Name"</code>, or set up email (SMTP) for CertiGen.
            </Alert>
          ) : (
            <Alert tone="success" title="Request sent to your administrator">
              {sent} They will send you a link to choose a new password{portal === 'admin' ? ' (the Super Admin handles Admin accounts)' : ''}.
            </Alert>
          )}
        </div>
      ) : sent ? (
        <div className="space-y-3 text-sm text-slate-700">
          <MailCheck className="h-8 w-8 text-emerald-600" />
          <p>{sent}</p>
          <p className="text-slate-600">Didn't get it? Check your spam folder, or ask your administrator to reset your password.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">Enter the email you sign in with. We'll email you a link to choose a new password.</p>
          <Field label="Email" htmlFor="fp-email">
            <Input id="fp-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </Frame>
  );
}

export function ResetPasswordPage() {
  const { query, navigate } = useRouter();
  const token = query.get('token') || '';
  const [valid, setValid] = useState<boolean | null>(null);
  const [portal, setPortal] = useState<PortalId>('user');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return setValid(false);
    api
      .get<{ valid: boolean; role: PortalId | null }>(`/api/auth/reset-password/${encodeURIComponent(token)}`)
      .then((r) => {
        if (r.role) setPortal(r.role);
        setValid(r.valid);
      })
      .catch(() => setValid(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    try {
      const r = await api.post<{ role: PortalId }>('/api/auth/reset-password', { token, newPassword: next });
      setPortal(r.role);
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame portal={portal} title="Choose a new password">
      {valid === null ? (
        <Spinner label="Checking the link…" />
      ) : done ? (
        <div className="space-y-4 text-sm text-slate-700">
          <Alert tone="success" title="Password changed">
            Sign in with your new password.
          </Alert>
          <Button variant="primary" className="w-full" onClick={() => navigate(PORTALS[portal].login, { replace: true })}>
            Go to sign in
          </Button>
        </div>
      ) : !valid ? (
        <div className="space-y-4 text-sm">
          <Alert tone="error" title="This link has expired or was already used">
            Reset links work once, for one hour.
          </Alert>
          <Button className="w-full" onClick={() => navigate(`/forgot-password?portal=${portal}`)}>
            Ask for a new link
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" htmlFor="rp-new" hint="At least 10 characters, with letters and numbers.">
            <Input id="rp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required autoFocus />
          </Field>
          <Field label="Confirm new password" htmlFor="rp-conf">
            <Input id="rp-conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} icon={<KeyRound className="h-4 w-4" />}>
            Save new password
          </Button>
        </form>
      )}
    </Frame>
  );
}
