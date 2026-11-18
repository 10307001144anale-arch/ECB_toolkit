import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useRouter, Link } from '../../lib/router';
import { PORTALS } from '../../lib/portals';
import { usePortalAccent } from '../../lib/theme';
import type { PortalId } from '../../../shared/types';
import { Alert, Button, Field, Input } from './ui';
import { PortalBadge } from './AppShell';
import { EcbStripes, ECB_TAGLINE, ECB_URL, HeaderLockup } from './brand';

const HELP: Record<PortalId, string> = {
  superadmin: 'The first Super Admin is created from ADMIN_EMAIL / ADMIN_PASSWORD on first start, or with “npm run create-admin”.',
  admin: 'Admin accounts are created by the Super Admin under Admin accounts.',
  user: 'User accounts are created by your Admin. Ask them for your email and password.',
};

const POINTS: Record<PortalId, string[]> = {
  superadmin: ['Upload certificate designs and draw the fields.', 'Test every template with sample data before publishing.', 'Keep versions; archive and restore at any time.'],
  admin: ['Organise clients and their activities.', 'Assign the right templates to each activity.', 'See how many certificates each activity produced.'],
  user: ['Pick your client, activity and template.', 'Participant data, photos and PDFs stay in your browser.', 'Every certificate gets a QR code that can be verified online.'],
};

/** Sign-in page of one portal. Accounts can only sign in to the portal of their role. */
export function LoginPage({ portal }: { portal: PortalId }) {
  const { login } = useAuth();
  const { navigate, query } = useRouter();
  usePortalAccent(portal);
  const def = PORTALS[portal];
  const next = query.get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${def.name} sign in · CertiGen · ECB`;
  }, [def.name]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password, portal);
      const home = def.base;
      const inPortal = (p: string) => (portal === 'user' ? !p.startsWith('/admin') && !p.startsWith('/superadmin') : p === home || p.startsWith(`${home}/`));
      const allowed = next && next.startsWith('/') && !next.startsWith('//') && inPortal(next) && !next.endsWith('/login');
      navigate(allowed ? next! : home, { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-white">
      <div className="grid flex-1 lg:grid-cols-2">
        <div className="relative hidden flex-col justify-between bg-navy p-12 pb-24 text-white lg:flex">
          <HeaderLockup onNavy size={64} />
          <div className="max-w-md">
            <p className="text-sm font-medium uppercase tracking-widest text-orange">CertiGen · {def.name} portal</p>
            <h2 className="mt-3 text-display text-white">{def.tagline}.</h2>
            <ul className="mt-6 space-y-3 text-sm text-white/85">
              {POINTS[portal].map((p) => (
                <li key={p} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-yellow" /> {p}
                </li>
              ))}
            </ul>
          </div>
          <p className="max-w-md text-sm text-white/80">{ECB_TAGLINE}</p>
        </div>

        <div className="relative flex flex-col items-center justify-center px-4 pb-24 pt-12">
          <div className="mb-8 lg:hidden">
            <HeaderLockup size={52} />
          </div>
          <div className="w-full max-w-md">
            <div className="mb-6">
              <PortalBadge portal={portal} />
              <h1 className="mt-3 text-h1 text-navy">Sign in</h1>
              <span className="mt-2 block h-[3px] w-10 rounded-full bg-orange" aria-hidden="true" />
            </div>

            <form onSubmit={submit} className="space-y-4 rounded-card border border-slate-200 bg-white p-6 shadow-float">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@your-organisation.org" />
            </Field>
            <Field
              label={
                <span className="flex w-full items-center justify-between">
                  Password
                  <Link to={`/forgot-password?portal=${portal}`} className="text-xs font-medium text-navy hover:underline">
                    Forgot password?
                  </Link>
                </span>
              }
              htmlFor="password"
            >
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
              Sign in to {def.name}
            </Button>
            <p className="text-xs leading-relaxed text-slate-500">{HELP[portal]}</p>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-slate-500">
            {(Object.keys(PORTALS) as PortalId[])
              .filter((p) => p !== portal)
              .map((p) => (
                <Link key={p} to={PORTALS[p].login} className="hover:text-slate-900 hover:underline">
                  {PORTALS[p].name} sign in
                </Link>
              ))}
            <Link to="/verify" className="font-medium text-brand-700 hover:underline">
              Verify a certificate
            </Link>
          </div>
        </div>
      </div>
      </div>
      {/* Straight ECB bands along the bottom of the sign-in screen, with the URL on the navy base. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <EcbStripes />
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 bg-navy px-6 py-3 text-xs text-white">
          <span>{ECB_TAGLINE}</span>
          <a href={ECB_URL} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">
            www.ecb.bt
          </a>
        </div>
      </div>
    </div>
  );
}
