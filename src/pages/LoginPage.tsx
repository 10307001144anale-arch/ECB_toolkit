import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useRouter, Link } from '../lib/router';
import { Alert, Button, Card, Field, Input } from '../components/ui';
import { Brand } from '../components/AppShell';

export function LoginPage() {
  const { login } = useAuth();
  const { navigate, query } = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const user = await login(email, password);
      const next = query.get('next');
      const allowed = next && next.startsWith('/') && !next.startsWith('//') && (user.role === 'admin' ? next.startsWith('/admin') || next.startsWith('/app') : next.startsWith('/app'));
      navigate(allowed ? next! : user.role === 'admin' ? '/admin' : '/app', { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <div className="mb-8">
        <Brand subtitle="Certificate generation" />
      </div>
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-lg font-semibold text-slate-900">Admin sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to manage templates and clients. Creating certificates does not need an account.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="primary" className="w-full" loading={busy} icon={<Lock className="h-4 w-4" />}>
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-sm text-slate-500">
        <Link to="/app" className="font-medium text-brand-700 hover:underline">
          Go to the certificate generator
        </Link>
        {' · '}Checking a certificate?{' '}
        <Link to="/verify" className="font-medium text-brand-700 hover:underline">
          Verify it here
        </Link>
      </p>
    </div>
  );
}
