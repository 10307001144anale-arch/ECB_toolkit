// Admin portal dialogs: User (formerly "Client") and Activity forms.

import React, { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea } from '../shared/ui';
import { UserLogo } from '../shared/UserLogo';
import { useToast } from '../../context/ToastContext';
import type { ActivityRecord, ActivityStatus, UserAccount } from '../../../shared/types';

export const ACTIVITY_STATUS: Record<ActivityStatus, { label: string; tone: 'gray' | 'green' | 'amber' | 'blue' }> = {
  planned: { label: 'Planned', tone: 'blue' },
  active: { label: 'Active', tone: 'green' },
  completed: { label: 'Completed', tone: 'gray' },
  archived: { label: 'Archived', tone: 'amber' },
};

export function ActivityStatusBadge({ status }: { status: ActivityStatus }) {
  const s = ACTIVITY_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Create or edit a User: name, organization, email (sign-in and contact), logo, notes, status. */
export function UserModal({ user, onClose, onSaved }: { user: UserAccount | null; onClose: () => void; onSaved: (u: UserAccount) => void }) {
  const { showToast } = useToast();
  const [f, setF] = useState({
    name: user?.name || '',
    organisation: user?.organisation || '',
    email: user?.email || '',
    notes: user?.notes || '',
    active: user ? user.active : true,
    logoFileId: user?.logoFileId || null,
    password: '',
  });
  const [busy, setBusy] = useState<'save' | 'logo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setBusy('logo');
    setError(null);
    try {
      const r = await api.upload<{ id: string }>(`/api/admin/files?kind=logo&name=${encodeURIComponent(file.name)}`, file);
      set({ logoFileId: r.id });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setError(null);
    try {
      const body = { name: f.name, organisation: f.organisation, email: f.email, notes: f.notes, active: f.active, logoFileId: f.logoFileId };
      const saved = user ? await api.put<UserAccount>(`/api/admin/users/${user.id}`, body) : await api.post<UserAccount>('/api/admin/users', { ...body, password: f.password });
      showToast(user ? 'User updated' : 'User created', 'success');
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? 'Edit user' : 'New user'}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="user-form" loading={busy === 'save'}>
            {user ? 'Save' : 'Create user'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          <UserLogo user={{ name: f.name || '?', logoFileId: f.logoFileId }} size="lg" />
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-navy hover:bg-slate-50">
              <ImagePlus className="h-4 w-4" /> {busy === 'logo' ? 'Uploading…' : f.logoFileId ? 'Change logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => uploadLogo(e.target.files?.[0])} />
            </label>
            {f.logoFileId && (
              <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => set({ logoFileId: null })}>
                Remove
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="u-name">
            <Input id="u-name" value={f.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} />
          </Field>
          <Field label="Organization" htmlFor="u-org" optional hint="Printed as the issuer on the verification page.">
            <Input id="u-org" value={f.organisation} onChange={(e) => set({ organisation: e.target.value })} maxLength={200} />
          </Field>
          <Field label="Contact email (sign-in)" htmlFor="u-email">
            <Input id="u-email" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} required maxLength={200} />
          </Field>
          <Field label="Status" htmlFor="u-status" hint="Inactive users cannot sign in.">
            <Select id="u-status" value={f.active ? 'active' : 'inactive'} onChange={(e) => set({ active: e.target.value === 'active' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        {!user && (
          <Field label="Initial password" htmlFor="u-pw" hint="At least 10 characters with letters and numbers. Share it securely; the user can change it after signing in.">
            <Input id="u-pw" type="text" autoComplete="new-password" value={f.password} onChange={(e) => set({ password: e.target.value })} required />
          </Field>
        )}
        <Field label="Notes" htmlFor="u-notes" optional>
          <Textarea id="u-notes" rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

export function ActivityModal({
  activity,
  userId,
  users,
  onClose,
  onSaved,
}: {
  activity: ActivityRecord | null;
  userId?: string;
  users?: UserAccount[];
  onClose: () => void;
  onSaved: (a: ActivityRecord) => void;
}) {
  const { showToast } = useToast();
  const [f, setF] = useState({
    userId: activity?.userId || userId || '',
    name: activity?.name || '',
    date: activity?.date || '',
    description: activity?.description || '',
    status: (activity?.status || 'active') as ActivityStatus,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.userId) return setError('Choose a user first.');
    setBusy(true);
    setError(null);
    try {
      const body = { name: f.name, date: f.date, description: f.description, status: f.status };
      const saved = activity ? await api.put<ActivityRecord>(`/api/admin/activities/${activity.id}`, body) : await api.post<ActivityRecord>(`/api/admin/users/${f.userId}/activities`, body);
      showToast(activity ? 'Activity updated' : 'Activity created', 'success');
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={activity ? 'Edit activity' : 'New activity'}
      description="An event, workshop or programme a user issues certificates for."
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="activity-form" loading={busy}>
            {activity ? 'Save' : 'Create activity'}
          </Button>
        </>
      }
    >
      <form id="activity-form" onSubmit={submit} className="space-y-4">
        {!activity && users && !userId && (
          <Field label="User" htmlFor="ac-user">
            <Select id="ac-user" value={f.userId} onChange={(e) => set({ userId: e.target.value })} required>
              <option value="">Choose a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.organisation ? ` — ${u.organisation}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Activity / event name" htmlFor="ac-name">
          <Input id="ac-name" value={f.name} onChange={(e) => set({ name: e.target.value })} required maxLength={160} placeholder="e.g. Voter Education Workshop 2026" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor="ac-date" optional>
            <Input id="ac-date" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Status" htmlFor="ac-status" hint="Archived activities cannot be chosen when generating.">
            <Select id="ac-status" value={f.status} onChange={(e) => set({ status: e.target.value as ActivityStatus })}>
              {(Object.keys(ACTIVITY_STATUS) as ActivityStatus[]).map((s) => (
                <option key={s} value={s}>
                  {ACTIVITY_STATUS[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description" htmlFor="ac-desc" optional>
          <Textarea id="ac-desc" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={2000} />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
