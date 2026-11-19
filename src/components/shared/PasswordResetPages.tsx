// "Forgot password" (email → 6-digit code → new password) and "Reset password"
// (new password from an administrator's reset link). Shared by all three portals.

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, KeyRound, MailCheck, RotateCw, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Link, useRouter } from '../../lib/router';
import { PORTALS } from '../../lib/portals';
import { usePortalAccent } from '../../lib/theme';
import type { PortalId } from '../../../shared/types';
import { Alert, Button, Field, Input, Spinner, cx } from './ui';
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

/** Same rules as the server (passwordProblem): at least 10 characters, letters and numbers. */
const PASSWORD_RULES = [
  { label: 'At least 10 characters', test: (p: string) => p.length >= 10 },
  { label: 'Contains a letter', test: (p: string) => /[A-Za-z]/.test(p) },
  { label: 'Contains a number', test: (p: string) => /[0-9]/.test(p) },
];

function strength(p: string): { score: number; label: string } {
  let score = PASSWORD_RULES.filter((r) => r.test(p)).length;
  if (score === 3 && p.length >= 14 && /[^A-Za-z0-9]/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p)) score = 4;
  return { score, label: ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][score] };
}

/** New password + confirm, with a strength meter. Used after the code and from administrator links. */
function NewPasswordForm({ token, onDone }: { token: string; onDone: (role: PortalId) => void }) {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ok = PASSWORD_RULES.every((r) => r.test(next));
  const s = strength(next);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!ok) return setError('Choose a password that meets every rule below.');
    if (next !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    try {
      const r = await api.post<{ role: PortalId }>('/api/auth/reset-password', { token, newPassword: next, confirmPassword: confirm });
      onDone(r.role);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="New password" htmlFor="rp-new">
        <Input id="rp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required autoFocus />
      </Field>
      {next && (
        <div aria-live="polite">
          <div className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className={cx('h-1.5 flex-1 rounded-full', i <= s.score ? (s.score <= 2 ? 'bg-amber-500' : 'bg-emerald-600') : 'bg-slate-200')} />
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-600">Strength: {s.label}</p>
        </div>
      )}
      <ul className="space-y-1 text-xs">
        {PASSWORD_RULES.map((r) => {
          const met = r.test(next);
          return (
            <li key={r.label} className={cx('flex items-center gap-1.5', met ? 'text-emerald-700' : 'text-slate-600')}>
              {met ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {r.label}
            </li>
          );
        })}
      </ul>
      <Field label="Confirm new password" htmlFor="rp-conf" error={confirm && next !== confirm ? 'The passwords do not match.' : null}>
        <Input id="rp-conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" variant="primary" className="w-full" loading={busy} icon={<KeyRound className="h-4 w-4" />}>
        Save new password
      </Button>
    </form>
  );
}

function PasswordChanged({ portal }: { portal: PortalId }) {
  const { navigate } = useRouter();
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <Alert tone="success" title="Password changed">
        You were signed out everywhere. Sign in with your new password.
      </Alert>
      <Button variant="primary" className="w-full" onClick={() => navigate(PORTALS[portal].login, { replace: true })}>
        Go to sign in
      </Button>
    </div>
  );
}

type ForgotStep = 'email' | 'code' | 'password' | 'done' | 'admin';

export function ForgotPasswordPage() {
  const { query } = useRouter();
  const [portal, setPortal] = useState<PortalId>(() => portalFrom(query));
  const [step, setStep] = useState<ForgotStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const startCooldown = (seconds: number) => {
    setCooldown(seconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timer.current) clearInterval(timer.current);
        return Math.max(0, c - 1);
      });
    }, 1000);
  };

  const requestCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ message: string; emailEnabled: boolean; resendAfterSeconds: number }>('/api/auth/forgot-password', { email: email.trim() });
      setMessage(r.message);
      if (!r.emailEnabled) return setStep('admin');
      setCode('');
      setStep('code');
      startCooldown(r.resendAfterSeconds || 60);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    try {
      const r = await api.post<{ resetToken: string; role: PortalId }>('/api/auth/forgot-password/verify', { email: email.trim(), code });
      setResetToken(r.resetToken);
      setPortal(r.role);
      setStep('password');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const title = step === 'code' ? 'Enter verification code' : step === 'password' ? 'Choose a new password' : 'Forgot password';
  return (
    <Frame portal={portal} title={title}>
      {step === 'admin' ? (
        <div className="space-y-3 text-sm text-slate-700">
          {portal === 'superadmin' ? (
            <Alert tone="warning" title="Email is not set up on this server yet">
              Super Admin passwords can then only be reset on the server: run <code className="rounded bg-white px-1">npm run create-admin -- your@email "Your Name"</code>, or set up email (Resend) for CertiGen.
            </Alert>
          ) : (
            <Alert tone="success" title="Request sent to your administrator">
              {message} They will send you a link to choose a new password{portal === 'admin' ? ' (the Super Admin handles Admin accounts)' : ''}.
            </Alert>
          )}
        </div>
      ) : step === 'code' ? (
        <form onSubmit={verify} className="space-y-4">
          <div className="flex gap-3 text-sm text-slate-700">
            <MailCheck className="h-6 w-6 shrink-0 text-emerald-600" />
            <p>{message}</p>
          </div>
          <Field label="6-digit code" htmlFor="fp-code" hint={`Sent to ${email.trim()}. Check your spam folder too.`}>
            <Input
              id="fp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              required
              autoFocus
              className="text-center font-mono text-2xl tracking-[0.5em]"
            />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={code.length !== 6}>
            Verify code
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button type="button" className="text-slate-600 hover:underline" onClick={() => { setStep('email'); setError(null); }}>
              Use a different email
            </button>
            <button
              type="button"
              onClick={requestCode}
              disabled={cooldown > 0 || busy}
              className="inline-flex items-center gap-1.5 font-medium text-navy hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
            >
              <RotateCw className="h-3.5 w-3.5" /> {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      ) : step === 'password' ? (
        <NewPasswordForm token={resetToken} onDone={(role) => { setPortal(role); setStep('done'); }} />
      ) : step === 'done' ? (
        <PasswordChanged portal={portal} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            requestCode();
          }}
          className="space-y-4"
        >
          <p className="text-sm text-slate-600">Enter the email you sign in with. We'll email you a 6-digit code to reset your password.</p>
          <Field label="Email" htmlFor="fp-email">
            <Input id="fp-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Send verification code
          </Button>
        </form>
      )}
    </Frame>
  );
}

/** Administrator reset link (/reset-password?token=…): choose a new password. */
export function ResetPasswordPage() {
  const { query, navigate } = useRouter();
  const token = query.get('token') || '';
  const [valid, setValid] = useState<boolean | null>(null);
  const [portal, setPortal] = useState<PortalId>('user');
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

  return (
    <Frame portal={portal} title="Choose a new password">
      {valid === null ? (
        <Spinner label="Checking the link…" />
      ) : done ? (
        <PasswordChanged portal={portal} />
      ) : !valid ? (
        <div className="space-y-4 text-sm">
          <Alert tone="error" title="This link has expired or was already used">
            Reset links work once, for one hour.
          </Alert>
          <Button className="w-full" onClick={() => navigate(`/forgot-password?portal=${portal}`)}>
            Get a verification code instead
          </Button>
        </div>
      ) : (
        <NewPasswordForm
          token={token}
          onDone={(role) => {
            setPortal(role);
            setDone(true);
          }}
        />
      )}
    </Frame>
  );
}
