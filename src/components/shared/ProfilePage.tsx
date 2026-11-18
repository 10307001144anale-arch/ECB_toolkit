// "My profile" — the same page in all three portals: profile photo, name,
// sign-in email (needs the current password) and password.

import React, { useRef, useState } from 'react';
import { Camera, KeyRound, Mail, Trash2, UserRound } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PORTALS } from '../../lib/portals';
import { useToast } from '../../context/ToastContext';
import { Alert, Button, Card, Field, Input, PageHeader } from './ui';
import { Avatar } from './Avatar';
import type { PortalId, PublicUser } from '../../../shared/types';

function Section({ icon, title, description, children }: { icon: React.ReactNode; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-brand-50 p-2 text-navy">{icon}</span>
        <div>
          <h2 className="text-h3 font-bold text-navy">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

export default function ProfilePage({ portal }: { portal: PortalId }) {
  const { user, refresh } = useAuth();
  const def = PORTALS[portal];
  if (!user) return null;
  return (
    <>
      <PageHeader
        title="My profile"
        breadcrumbs={[{ label: def.name, to: def.base }, { label: 'My profile' }]}
        description="Your photo, name, sign-in email and password."
      />
      <div className="grid max-w-3xl gap-5">
        <PhotoAndName user={user} onChanged={refresh} />
        <EmailSection user={user} onChanged={refresh} />
        <PasswordSection />
      </div>
    </>
  );
}

function PhotoAndName({ user, onChanged }: { user: PublicUser; onChanged: () => Promise<void> }) {
  const { showToast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState<'photo' | 'remove' | 'name' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(png|jpeg)$/.test(file.type)) return setError('Choose a PNG or JPG image.');
    if (file.size > 3 * 1024 * 1024) return setError('The photo must be 3 MB or smaller.');
    setBusy('photo');
    try {
      await api.upload('/api/auth/avatar', file);
      await onChanged();
      showToast('Profile photo updated', 'success');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      await api.del('/api/auth/avatar');
      await onChanged();
      showToast('Profile photo removed', 'success');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('name');
    try {
      await api.put('/api/auth/profile', { name });
      await onChanged();
      showToast('Name saved', 'success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section icon={<UserRound className="h-5 w-5" />} title="Profile photo and name">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} fileId={user.avatarFileId} size={88} className="ring-4 ring-brand-50" />
          <div className="flex flex-col gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload(e.target.files?.[0])} aria-label="Choose a profile photo" />
            <Button size="sm" variant="primary" icon={<Camera className="h-4 w-4" />} loading={busy === 'photo'} onClick={() => input.current?.click()}>
              {user.avatarFileId ? 'Change photo' : 'Upload photo'}
            </Button>
            {user.avatarFileId && (
              <Button size="sm" icon={<Trash2 className="h-4 w-4" />} loading={busy === 'remove'} onClick={remove}>
                Remove photo
              </Button>
            )}
            <p className="text-xs text-slate-500">PNG or JPG, up to 3 MB.</p>
          </div>
        </div>
        <form onSubmit={saveName} className="flex flex-1 items-end gap-2 sm:border-l sm:border-slate-200 sm:pl-5">
          <Field label="Name" htmlFor="profile-name" className="flex-1">
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </Field>
          <Button type="submit" loading={busy === 'name'} disabled={!name.trim() || name.trim() === user.name}>
            Save
          </Button>
        </form>
      </div>
      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}
    </Section>
  );
}

function EmailSection({ user, onChanged }: { user: PublicUser; onChanged: () => Promise<void> }) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post('/api/auth/change-email', { newEmail: email.trim(), currentPassword: password });
      await onChanged();
      setEmail('');
      setPassword('');
      showToast('Email changed — use the new address the next time you sign in', 'success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section icon={<Mail className="h-5 w-5" />} title="Sign-in email" description={`You sign in with ${user.email}. Enter your current password to change it.`}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="New email" htmlFor="profile-email">
          <Input id="profile-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@your-organisation.org" />
        </Field>
        <Field label="Current password" htmlFor="profile-email-pw">
          <Input id="profile-email-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && (
          <Alert tone="error" className="sm:col-span-2">
            {error}
          </Alert>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" variant="primary" loading={busy}>
            Change email
          </Button>
        </div>
      </form>
    </Section>
  );
}

function PasswordSection() {
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
      setCurrent('');
      setNext('');
      setConfirm('');
      showToast('Password changed — other devices were signed out', 'success');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section icon={<KeyRound className="h-5 w-5" />} title="Password" description="At least 10 characters, with letters and numbers. Changing it signs you out on other devices.">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password" htmlFor="pw-cur">
          <Input id="pw-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" htmlFor="pw-new">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-conf">
          <Input id="pw-conf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {error && (
          <Alert tone="error" className="sm:col-span-3">
            {error}
          </Alert>
        )}
        <div className="sm:col-span-3">
          <Button type="submit" variant="primary" loading={busy}>
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}
