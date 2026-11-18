// Admin → Users (formerly "Clients"): the people and organisations
// certificates are issued for. Each User signs in to the User portal and has
// their own Activities.

import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, ChevronRight, KeyRound, Link2, MoreHorizontal, Pencil, Plus, Power, Trash2, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useLive } from '../../lib/live';
import { useRouter } from '../../lib/router';
import { Badge, Button, EmptyState, IconButton, Menu, PageHeader, SearchInput, Select, SkeletonRows, TableCard, cx, td, th, useConfirm } from '../shared/ui';
import { PasswordModal } from '../shared/AccountDialogs';
import { PasswordHelpPanel, ResetLinkModal } from '../shared/PasswordHelp';
import { UserLogo } from '../shared/UserLogo';
import { useToast } from '../../context/ToastContext';
import { timeAgo } from '../../lib/format';
import { UserModal } from './dialogs';
import type { UserAccount } from '../../../shared/types';

export async function deleteUser(u: UserAccount, confirm: ReturnType<typeof useConfirm>, showToast: (m: string, t?: any) => void) {
  const ok = await confirm({
    title: `Delete ${u.name}?`,
    message: `The account${u.activityCount ? ` and its ${u.activityCount} activit${u.activityCount === 1 ? 'y' : 'ies'}` : ''} will be removed permanently. Users who generated certificates can only be set to inactive.`,
    confirmLabel: 'Delete user',
    danger: true,
  });
  if (!ok) return false;
  try {
    await api.del(`/api/admin/users/${u.id}`);
    showToast('User deleted', 'success');
    return true;
  } catch (e: any) {
    showToast(e.message, 'error');
    return false;
  }
}

export default function UsersPage() {
  const { navigate, query } = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<UserAccount[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [editing, setEditing] = useState<UserAccount | 'new' | null>(query.get('new') ? 'new' : null);
  const [pwFor, setPwFor] = useState<UserAccount | null>(null);
  const [linkFor, setLinkFor] = useState<UserAccount | null>(null);

  const load = useCallback(() => {
    api
      .get<UserAccount[]>('/api/admin/users')
      .then(setItems)
      .catch((e) => showToast(e.message, 'error'));
  }, [showToast]);
  useEffect(load, [load]);
  useLive(['users', 'activities', 'batches'], load);

  const visible = (items || []).filter(
    (u) => (status === 'all' || (status === 'active') === u.active) && (!q || `${u.name} ${u.email} ${u.organisation || ''}`.toLowerCase().includes(q.toLowerCase()))
  );

  const toggle = async (u: UserAccount) => {
    try {
      await api.put(`/api/admin/users/${u.id}`, { active: !u.active });
      showToast(u.active ? 'User set to inactive' : 'User activated', 'success');
      load();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Users"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Users' }]}
        description="The people and organisations certificates are issued for. Each user can sign in to the User portal and has their own activities."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New user
          </Button>
        }
      />
      <PasswordHelpPanel kind="user" onSetPassword={(r) => setPwFor((items || []).find((u) => u.id === r.userId) || null)} />
      {items && items.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No users yet"
          description="Add a user, then create their activities and generate certificates for them."
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New user
            </Button>
          }
        />
      ) : (
        <TableCard
          toolbar={
            <>
              <SearchInput value={q} onChange={setQ} placeholder="Search users" className="w-full sm:w-72" />
              <Select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full sm:w-40" aria-label="Status filter">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
              {items && <span className="ml-auto text-sm text-slate-500">{visible.length} of {items.length}</span>}
            </>
          }
        >
          {!items ? (
            <SkeletonRows cols={5} />
          ) : (
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>User</th>
                  <th className={th}>Organization</th>
                  <th className={th}>Activities</th>
                  <th className={th}>Certificates</th>
                  <th className={th}>Last generated</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((u) => (
                  <tr key={u.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/users/${u.id}`)}>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <UserLogo user={u} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{u.name}</p>
                          <p className="truncate text-xs text-slate-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className={td}>{u.organisation || <span className="text-slate-400">—</span>}</td>
                    <td className={td}>{u.activityCount}</td>
                    <td className={cx(td, 'tabular-nums')}>{u.certificateCount.toLocaleString()}</td>
                    <td className={td}>{u.lastGeneratedAt ? timeAgo(u.lastGeneratedAt) : '—'}</td>
                    <td className={td}>{u.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    <td className={`${td} text-right`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Menu
                          trigger={(t) => (
                            <IconButton label="Actions" onClick={t}>
                              <MoreHorizontal className="h-4 w-4" />
                            </IconButton>
                          )}
                          items={[
                            { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => setEditing(u) },
                            { label: 'Activities', icon: <CalendarDays className="h-4 w-4" />, onClick: () => navigate(`/admin/users/${u.id}`) },
                            { label: 'Create reset link', icon: <Link2 className="h-4 w-4" />, onClick: () => setLinkFor(u), disabled: !u.active },
                            { label: 'Set new password', icon: <KeyRound className="h-4 w-4" />, onClick: () => setPwFor(u) },
                            { label: u.active ? 'Set inactive' : 'Activate', icon: <Power className="h-4 w-4" />, onClick: () => toggle(u) },
                            'divider',
                            { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, danger: true, disabled: u.batchCount > 0, onClick: async () => (await deleteUser(u, confirm, showToast)) && load() },
                          ]}
                        />
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </TableCard>
      )}
      {editing && (
        <UserModal
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            load();
            if (editing === 'new') navigate(`/admin/users/${u.id}`);
          }}
        />
      )}
      {linkFor && <ResetLinkModal kind="user" account={linkFor} onClose={() => setLinkFor(null)} />}
      {pwFor && <PasswordModal kind="user" account={pwFor} onClose={() => setPwFor(null)} />}
    </>
  );
}
