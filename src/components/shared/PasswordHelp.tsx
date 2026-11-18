// "Forgot password" requests that reach an administrator when email cannot be
// sent (Users → Admins, Admins → Super Admin), and the reset link dialog.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, KeyRound, Link2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useLive } from '../../lib/live';
import { useToast } from '../../context/ToastContext';
import { timeAgo } from '../../lib/format';
import { Alert, Button, Input, Modal } from './ui';

export interface PasswordHelpRequest {
  id: string;
  userId: string;
  name: string;
  email: string;
  createdAt: number;
}

type Kind = 'user' | 'admin';
const API: Record<Kind, string> = { user: '/api/admin', admin: '/api/superadmin' };

/** Creates a one-hour reset link for an account and shows it to copy and send. */
export function ResetLinkModal({ kind, account, onClose, onDone }: { kind: Kind; account: { id: string; name: string; email: string }; onClose: () => void; onDone?: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api
      .post<{ link: string }>(`${API[kind]}/password-requests/${account.id}/link`)
      .then((r) => {
        setLink(r.link);
        onDone?.();
      })
      .catch((e) => setError(e.message));
  }, [kind, account.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link stays selectable in the field */
    }
  };

  return (
    <Modal open onClose={onClose} title={`Reset link for ${account.name}`} size="md" footer={<Button onClick={onClose}>Done</Button>}>
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : (
        <div className="space-y-3 text-sm text-slate-700">
          <p>
            Send this link to <b>{account.name}</b> ({account.email}) — for example by chat or in person. They open it and choose their own new password.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={link || 'Creating link…'} onFocus={(e) => e.currentTarget.select()} aria-label="Reset link" className="font-mono text-xs" />
            <Button variant="primary" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={copy} disabled={!link}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-slate-500">The link works once, for one hour. Only share it with this person.</p>
        </div>
      )}
    </Modal>
  );
}

/**
 * Open "forgot password" requests, with one-click reset links. Renders nothing
 * when there are none.
 */
export function PasswordHelpPanel({ kind, onSetPassword }: { kind: Kind; onSetPassword?: (r: PasswordHelpRequest) => void }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<PasswordHelpRequest[]>([]);
  const [linkFor, setLinkFor] = useState<PasswordHelpRequest | null>(null);

  const load = useCallback(() => {
    api
      .get<PasswordHelpRequest[]>(`${API[kind]}/password-requests`)
      .then(setItems)
      .catch(() => {});
  }, [kind]);
  useEffect(load, [load]);
  useLive([kind === 'user' ? 'users' : 'admins'], load);

  const dismiss = async (r: PasswordHelpRequest) => {
    try {
      await api.post(`${API[kind]}/password-requests/${r.userId}/dismiss`);
      load();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  if (!items.length && !linkFor) return null;
  return (
    <>
      {items.length > 0 && (
        <div className="mb-5 rounded-card border border-amber-600 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <KeyRound className="h-4 w-4" />
            {items.length === 1 ? '1 person forgot their password' : `${items.length} people forgot their password`}
          </p>
          <p className="mt-0.5 text-xs text-amber-900">Email is not available, so they asked you. Create a reset link and send it to them, or set a new password.</p>
          <ul className="mt-3 divide-y divide-amber-200 rounded-lg border border-amber-200 bg-white">
            {items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{r.name}</p>
                  <p className="truncate text-xs text-slate-600">
                    {r.email} · asked {timeAgo(r.createdAt)}
                  </p>
                </div>
                <Button size="sm" variant="primary" icon={<Link2 className="h-4 w-4" />} onClick={() => setLinkFor(r)}>
                  Create reset link
                </Button>
                {onSetPassword && (
                  <Button size="sm" icon={<KeyRound className="h-4 w-4" />} onClick={() => onSetPassword(r)}>
                    Set password
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => dismiss(r)}>
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {linkFor && <ResetLinkModal kind={kind} account={{ id: linkFor.userId, name: linkFor.name, email: linkFor.email }} onClose={() => setLinkFor(null)} onDone={load} />}
    </>
  );
}
