// Account dialogs shared by the Super Admin (Admin accounts) and Admin (User accounts) portals.

import React, { useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Button, Field, Input, Modal } from './ui';
import { useToast } from '../../context/ToastContext';
import type { PublicUser } from '../../../shared/types';

const ENDPOINT = { admin: '/api/superadmin/admins', user: '/api/admin/users' } as const;

/** Create/edit an Admin (Super Admin portal) or User (Admin portal) account. */
export function AccountModal({
  kind,
  account,
  onClose,
  onSaved,
  extra,
  extraBody,
}: {
  kind: 'admin' | 'user';
  account: PublicUser | null;
  onClose: () => void;
  onSaved: () => void;
  extra?: React.ReactNode;
  extraBody?: Record<string, unknown>;
}) {
  const { showToast } = useToast();
  const [name, setName] = useState(account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const [organisation, setOrganisation] = useState(account?.organisation || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = kind === 'admin' ? 'admin' : 'user';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { name, email, organisation, ...(extraBody || {}) };
      if (account) await api.put(`${ENDPOINT[kind]}/${account.id}`, body);
      else await api.post(ENDPOINT[kind], { ...body, password });
      showToast(account ? 'Account updated' : 'Account created', 'success');
      onSaved();
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
      title={account ? `Edit ${label}` : `New ${label}`}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="account-form" loading={busy}>
            {account ? 'Save' : `Create ${label}`}
          </Button>
        </>
      }
    >
      <form id="account-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="acc-name">
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Email (sign-in)" htmlFor="acc-email">
            <Input id="acc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} />
          </Field>
        </div>
        <Field label="Organisation / department" htmlFor="acc-org" optional>
          <Input id="acc-org" value={organisation} onChange={(e) => setOrganisation(e.target.value)} maxLength={200} />
        </Field>
        {!account && (
          <Field label="Initial password" htmlFor="acc-pw" hint="At least 10 characters with letters and numbers. Share it securely; they can change it after signing in.">
            <Input id="acc-pw" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
        )}
        {extra}
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

export function PasswordModal({ kind, account, onClose }: { kind: 'admin' | 'user'; account: PublicUser; onClose: () => void }) {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`${ENDPOINT[kind]}/${account.id}/password`, { password });
      showToast('Password reset. Their other sessions were signed out.', 'success');
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
      title={`Reset password for ${account.name}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="pw-reset" loading={busy}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="pw-reset" onSubmit={submit} className="space-y-3">
        <Field label="New password" htmlFor="pw-reset-input" hint="At least 10 characters with letters and numbers." error={error}>
          <Input id="pw-reset-input" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
      </form>
    </Modal>
  );
}
