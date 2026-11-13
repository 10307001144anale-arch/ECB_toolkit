import React, { useEffect, useState } from 'react';
import { Award, Building2, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useRouter, Link } from '../lib/router';
import { Alert, Button, Field, Input, cx } from '../components/ui';

type Portal = 'admin' | 'client';

const PORTALS: Record<Portal, { title: string; subtitle: string; icon: React.ReactNode; help: string }> = {
  admin: {
    title: 'Super admin',
    subtitle: 'Templates, clients and settings',
    icon: <ShieldCheck className="h-5 w-5" />,
    help: 'The super admin account is created from ADMIN_EMAIL / ADMIN_PASSWORD on first start, or with “npm run create-admin”.',
  },
  client: {
    title: 'Client admin',
    subtitle: 'Create and download certificates',
    icon: <Building2 className="h-5 w-5" />,
    help: 'Client accounts are created by the super admin under Clients. Ask them for your email and password.',
  },
};

export function LoginPage() {
  const { login } = useAuth();
  const { navigate, query } = useRouter();
  const next = query.get('next');
  const [portal, setPortal] = useState<Portal>(next?.startsWith('/app') ? 'client' : query.get('as') === 'client' ? 'client' : 'admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · CertiGen';
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      // The account decides where you go; the tab only changes the wording.
      const home = user.role === 'admin' ? '/admin' : '/app';
      const allowed = next && next.startsWith('/') && !next.startsWith('//') && next.startsWith(home);
      navigate(allowed ? next! : home, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const p = PORTALS[portal];

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-indigo-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold">CertiGen</p>
            <p className="text-sm text-white/70">Certificate generation platform</p>
          </div>
        </div>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">Beautiful certificates for every participant, in minutes.</h2>
          <ul className="mt-6 space-y-3 text-sm text-white/85">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" /> Admins design templates once — clients only add wording and participants.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" /> Participant data, photos and PDFs stay in your browser.
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" /> Every certificate gets a QR code that can be verified online.
            </li>
          </ul>
        </div>
        <p className="text-xs text-white/60">Checking a certificate? Open the verification page from its QR code.</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -top-16 right-24 h-40 w-40 rounded-full bg-white/5" />
      </div>

      {/* Form */}
      <div className="flex flex-col items-center justify-center bg-slate-50 px-4 py-12">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white">
            <Award className="h-5 w-5" />
          </div>
          <p className="text-base font-semibold text-slate-900">CertiGen</p>
        </div>
        <div className="w-full max-w-md">
          <h1 className="text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Choose how you are signing in.</p>

          <div className="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Account type">
            {(Object.keys(PORTALS) as Portal[]).map((k) => {
              const it = PORTALS[k];
              const on = portal === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setPortal(k);
                    setError(null);
                  }}
                  className={cx(
                    'flex flex-col items-start gap-2 rounded-xl border bg-white p-4 text-left transition',
                    on ? 'border-brand-600 ring-2 ring-brand-600/20' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <span className={cx('flex h-9 w-9 items-center justify-center rounded-lg', on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600')}>{it.icon}</span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{it.title}</span>
                    <span className="block text-xs text-slate-500">{it.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder={portal === 'admin' ? 'admin@your-organisation.org' : 'you@your-organisation.org'} />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="relative">
                <Input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" variant="primary" className="w-full" loading={busy} icon={<Lock className="h-4 w-4" />}>
              Sign in as {p.title.toLowerCase()}
            </Button>
            <p className="text-xs leading-relaxed text-slate-500">{p.help}</p>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Checking a certificate?{' '}
            <Link to="/verify" className="font-medium text-brand-700 hover:underline">
              Verify it here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
