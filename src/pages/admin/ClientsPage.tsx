import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LayoutTemplate, MoreHorizontal, Pencil, Plus, Power, Search, Users, Wand2, Activity } from 'lucide-react';
import { api } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Menu, Modal, PageHeader, Spinner, useConfirm } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { PublicUser, TemplateSummary } from '../../../shared/types';
import { timeAgo } from '../../lib/format';

interface ClientRow extends PublicUser {
  isPublic?: boolean;
  batchCount: number;
  certificateCount: number;
  lastGeneratedAt: number | null;
  templateIds: string[];
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let s = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  if (!/\d/.test(s)) s = `${s.slice(0, -1)}7`;
  return s;
}

export default function ClientsPage() {
  const { showToast } = useToast();
  const { navigate } = useRouter();
  const confirm = useConfirm();
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<ClientRow | 'new' | null>(null);
  const [resetFor, setResetFor] = useState<ClientRow | null>(null);
  const [accessFor, setAccessFor] = useState<ClientRow | null>(null);

  const load = useCallback(() => {
    Promise.all([api.get<ClientRow[]>('/api/admin/clients'), api.get<TemplateSummary[]>('/api/admin/templates')])
      .then(([c, t]) => {
        setClients(c);
        setTemplates(t.filter((x) => x.status !== 'archived'));
      })
      .catch((e) => showToast(e.message, 'error'));
  }, [showToast]);
  useEffect(load, [load]);

  const toggleActive = async (c: ClientRow) => {
    if (c.active) {
      const ok = c.isPublic
        ? await confirm({ title: 'Turn off public access?', message: 'The client portal will then require a client account. Existing certificates stay valid.', confirmLabel: 'Turn off', danger: true })
        : await confirm({ title: `Deactivate ${c.name}?`, message: 'They will be signed out and cannot sign in until reactivated. Their history is kept.', confirmLabel: 'Deactivate', danger: true });
      if (!ok) return;
    }
    try {
      await api.put(`/api/admin/clients/${c.id}`, { active: !c.active });
      showToast(c.active ? 'Client deactivated' : 'Client activated', 'success');
      load();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const visible = (clients || []).filter((c) => !q || `${c.name} ${c.email} ${c.organisation || ''}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Clients"
        description="Anyone can create certificates without signing in (the Public client). Named client accounts get their own presets, history and Microsoft Excel access."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New client
          </Button>
        }
      />
      {clients && clients.length > 0 && (
        <div className="relative mb-4 w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" className="pl-9" aria-label="Search clients" />
        </div>
      )}
      {!clients ? (
        <Spinner />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No clients yet"
          description="Create an account for each organisation or person who will generate certificates."
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New client
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Templates</th>
                  <th className="px-4 py-3 font-medium">Certificates</th>
                  <th className="px-4 py-3 font-medium">Last sign-in</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-2 font-medium text-slate-900">
                        {c.name} {c.isPublic && <Badge tone="violet">No sign-in</Badge>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {c.isPublic ? 'Anyone who opens the client portal without signing in' : c.email}
                        {c.organisation ? ` · ${c.organisation}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">{c.active ? <Badge tone="green">{c.isPublic ? 'On' : 'Active'}</Badge> : <Badge>{c.isPublic ? 'Off' : 'Inactive'}</Badge>}</td>
                    <td className="px-4 py-3 text-slate-700">{c.templateIds.length} assigned</td>
                    <td className="px-4 py-3 text-slate-700">
                      {c.certificateCount.toLocaleString()} <span className="text-slate-400">({c.batchCount} batches)</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{c.isPublic ? '—' : timeAgo(c.lastLoginAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Menu
                        trigger={(t) => (
                          <IconButton label={`Actions for ${c.name}`} onClick={t}>
                            <MoreHorizontal className="h-4 w-4" />
                          </IconButton>
                        )}
                        items={[
                          { label: 'Edit details', icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(c) },
                          { label: 'Template access', icon: <LayoutTemplate className="h-4 w-4" />, onClick: () => setAccessFor(c) },
                          ...(c.isPublic ? [] : [{ label: 'Reset password', icon: <KeyRound className="h-4 w-4" />, onClick: () => setResetFor(c) }]),
                          { label: 'View activity', icon: <Activity className="h-4 w-4" />, onClick: () => navigate(`/admin/activity?user=${c.id}`) },
                          'divider',
                          { label: c.isPublic ? (c.active ? 'Turn off public access' : 'Turn on public access') : c.active ? 'Deactivate' : 'Activate', icon: <Power className="h-4 w-4" />, onClick: () => toggleActive(c), danger: c.active },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && <ClientModal client={editing === 'new' ? null : editing} templates={templates} onClose={() => setEditing(null)} onSaved={load} />}
      {resetFor && <ResetPasswordModal client={resetFor} onClose={() => setResetFor(null)} />}
      {accessFor && <ClientTemplatesModal client={accessFor} templates={templates} onClose={() => setAccessFor(null)} onSaved={load} />}
    </>
  );
}

function ClientModal({ client, templates, onClose, onSaved }: { client: ClientRow | null; templates: TemplateSummary[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [name, setName] = useState(client?.name || '');
  const [email, setEmail] = useState(client?.email || '');
  const [organisation, setOrganisation] = useState(client?.organisation || '');
  const [password, setPassword] = useState(() => (client ? '' : generatePassword()));
  const [templateIds, setTemplateIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (client) await api.put(`/api/admin/clients/${client.id}`, client.isPublic ? { name, organisation } : { name, email, organisation });
      else await api.post('/api/admin/clients', { name, email, organisation, password, templateIds: [...templateIds] });
      showToast(client ? 'Client updated' : 'Client created. Share the password with them securely.', 'success');
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
      title={client ? 'Edit client' : 'New client'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="client-form" loading={busy}>
            {client ? 'Save changes' : 'Create client'}
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="c-name">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
          </Field>
          <Field label="Organisation" htmlFor="c-org" optional>
            <Input id="c-org" value={organisation} onChange={(e) => setOrganisation(e.target.value)} maxLength={200} placeholder="Shown as the issuer on verification" />
          </Field>
        </div>
        {!client?.isPublic && (
          <Field label="Email (used to sign in)" htmlFor="c-email">
            <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
        )}
        {!client && (
          <>
            <Field label="Temporary password" htmlFor="c-pw" hint="Share it securely. The client can change it after signing in.">
              <div className="flex gap-2">
                <Input id="c-pw" value={password} onChange={(e) => setPassword(e.target.value)} required className="font-mono" />
                <Button onClick={() => setPassword(generatePassword())} icon={<Wand2 className="h-4 w-4" />} aria-label="Generate password">
                  Generate
                </Button>
              </div>
            </Field>
            {templates.length > 0 && (
              <Field label="Templates" optional hint="Only published templates appear to the client.">
                <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                  {templates.map((t) => (
                    <label key={t.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={templateIds.has(t.id)}
                        onChange={(e) => {
                          const s = new Set(templateIds);
                          e.target.checked ? s.add(t.id) : s.delete(t.id);
                          setTemplateIds(s);
                        }}
                      />
                      <span className="flex-1 truncate">{t.title}</span>
                      {t.status !== 'published' && <span className="text-xs text-slate-400">Draft</span>}
                    </label>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ client, onClose }: { client: ClientRow; onClose: () => void }) {
  const { showToast } = useToast();
  const [password, setPassword] = useState(generatePassword);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/clients/${client.id}/password`, { password });
      showToast('Password reset. The client has been signed out.', 'success');
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password"
      description={client.name}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Reset password
          </Button>
        </>
      }
    >
      <Field label="New password" htmlFor="rp" hint="Copy it before saving and share it securely." error={error}>
        <div className="flex gap-2">
          <Input id="rp" value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
          <Button onClick={() => setPassword(generatePassword())} icon={<Wand2 className="h-4 w-4" />} aria-label="Generate password" />
        </div>
      </Field>
    </Modal>
  );
}

function ClientTemplatesModal({ client, templates, onClose, onSaved }: { client: ClientRow; templates: TemplateSummary[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState(new Set(client.templateIds));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/api/admin/clients/${client.id}/templates`, { templateIds: [...selected] });
      showToast('Template access updated', 'success');
      onSaved();
      onClose();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const allClients = templates.filter((t) => t.visibility === 'all');
  return (
    <Modal
      open
      onClose={onClose}
      title="Template access"
      description={client.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      {templates.length === 0 ? (
        <p className="text-sm text-slate-500">No templates yet.</p>
      ) : (
        <>
          <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {templates.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={t.visibility === 'all' || selected.has(t.id)}
                  disabled={t.visibility === 'all'}
                  onChange={(e) => {
                    const s = new Set(selected);
                    e.target.checked ? s.add(t.id) : s.delete(t.id);
                    setSelected(s);
                  }}
                />
                <span className="flex-1 truncate">{t.title}</span>
                {t.visibility === 'all' ? <Badge>All clients</Badge> : t.status !== 'published' ? <Badge tone="blue">Draft</Badge> : null}
              </label>
            ))}
          </div>
          {allClients.length > 0 && <p className="mt-2 text-xs text-slate-500">Templates marked "All clients" are available to everyone and cannot be revoked here.</p>}
        </>
      )}
    </Modal>
  );
}
