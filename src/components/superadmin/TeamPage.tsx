// Super Admin → Admin accounts. Admins manage clients, activities and users.

import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Link2, MoreHorizontal, Pencil, Plus, Power, UserCog } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Button, EmptyState, IconButton, Menu, PageHeader, SearchInput, SkeletonRows, TableCard, td, th } from '../shared/ui';
import { AccountModal, PasswordModal } from '../shared/AccountDialogs';
import { PasswordHelpPanel, ResetLinkModal } from '../shared/PasswordHelp';
import { useLive } from '../../lib/live';
import { useToast } from '../../context/ToastContext';
import { formatDateOnly, timeAgo } from '../../lib/format';
import type { PublicUser } from '../../../shared/types';

export default function TeamPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<PublicUser[] | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<PublicUser | 'new' | null>(null);
  const [pwFor, setPwFor] = useState<PublicUser | null>(null);
  const [linkFor, setLinkFor] = useState<PublicUser | null>(null);

  const load = useCallback(() => {
    api
      .get<PublicUser[]>('/api/superadmin/admins')
      .then(setItems)
      .catch((e) => showToast(e.message, 'error'));
  }, [showToast]);
  useEffect(load, [load]);
  useLive(['admins'], load);

  const visible = (items || []).filter((u) => !q || `${u.name} ${u.email} ${u.organisation || ''}`.toLowerCase().includes(q.toLowerCase()));

  const toggle = async (u: PublicUser) => {
    try {
      await api.put(`/api/superadmin/admins/${u.id}`, { active: !u.active });
      showToast(u.active ? 'Admin deactivated' : 'Admin activated', 'success');
      load();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Admin accounts"
        breadcrumbs={[{ label: 'Super Admin', to: '/superadmin' }, { label: 'Admin accounts' }]}
        description="Admins manage clients, activities and user accounts, and assign your published templates to activities."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New admin
          </Button>
        }
      />
      <PasswordHelpPanel kind="admin" onSetPassword={(r) => setPwFor((items || []).find((u) => u.id === r.userId) || null)} />
      {items && items.length === 0 ? (
        <EmptyState
          icon={<UserCog className="h-6 w-6" />}
          title="No Admin accounts yet"
          description="Create an Admin so someone can set up clients, activities and users."
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New admin
            </Button>
          }
        />
      ) : (
        <TableCard toolbar={<SearchInput value={q} onChange={setQ} placeholder="Search admins" className="w-full sm:w-72" />}>
          {!items ? (
            <SkeletonRows cols={4} />
          ) : (
            <table className="w-full min-w-[640px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Organisation</th>
                  <th className={th}>Status</th>
                  <th className={th}>Last sign-in</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className={td}>
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className={td}>{u.organisation || '—'}</td>
                    <td className={td}>{u.active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}</td>
                    <td className={td}>{u.lastLoginAt ? timeAgo(u.lastLoginAt) : `Created ${formatDateOnly(u.createdAt)}`}</td>
                    <td className={`${td} text-right`}>
                      <Menu
                        trigger={(t) => (
                          <IconButton label="Actions" onClick={t}>
                            <MoreHorizontal className="h-4 w-4" />
                          </IconButton>
                        )}
                        items={[
                          { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(u) },
                          { label: 'Create reset link', icon: <Link2 className="h-4 w-4" />, onClick: () => setLinkFor(u), disabled: !u.active },
                          { label: 'Set new password', icon: <KeyRound className="h-4 w-4" />, onClick: () => setPwFor(u) },
                          { label: u.active ? 'Deactivate' : 'Activate', icon: <Power className="h-4 w-4" />, onClick: () => toggle(u), danger: u.active },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                      No admins match “{q}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </TableCard>
      )}
      {editing && <AccountModal kind="admin" account={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={load} />}
      {linkFor && <ResetLinkModal kind="admin" account={linkFor} onClose={() => setLinkFor(null)} />}
      {pwFor && <PasswordModal kind="admin" account={pwFor} onClose={() => setPwFor(null)} />}
    </>
  );
}
