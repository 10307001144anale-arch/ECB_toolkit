import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useLive } from '../../lib/live';
import { Link, useRouter } from '../../lib/router';
import { Button, EmptyState, IconButton, Menu, PageHeader, SearchInput, Select, SkeletonRows, TableCard, td, th, useConfirm } from '../shared/ui';
import { useToast } from '../../context/ToastContext';
import { formatDateOnly } from '../../lib/format';
import { ACTIVITY_STATUS, ActivityModal, ActivityStatusBadge } from './dialogs';
import type { ActivityRecord, ActivityStatus, UserAccount } from '../../../shared/types';

export async function deleteActivity(a: ActivityRecord, confirm: ReturnType<typeof useConfirm>, showToast: (m: string, t?: any) => void) {
  const ok = await confirm({
    title: `Delete “${a.name}”?`,
    message: `${a.certificateCount ? `The ${a.certificateCount.toLocaleString()} certificates generated in it stay valid and remain in the user's history. ` : ''}Archive it instead to keep it for reference.`,
    confirmLabel: 'Delete activity',
    danger: true,
  });
  if (!ok) return false;
  try {
    await api.del(`/api/admin/activities/${a.id}`);
    showToast('Activity deleted', 'success');
    return true;
  } catch (e: any) {
    showToast(e.message, 'error');
    return false;
  }
}

export default function ActivitiesPage() {
  const { query, navigate } = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<ActivityRecord[] | null>(null);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [q, setQ] = useState('');
  const [userFilter, setUserFilter] = useState(query.get('user') || '');
  const [status, setStatus] = useState<'' | ActivityStatus>('');
  const [editing, setEditing] = useState<ActivityRecord | 'new' | null>(query.get('new') ? 'new' : null);

  const load = useCallback(() => {
    Promise.all([api.get<ActivityRecord[]>('/api/admin/activities'), api.get<UserAccount[]>('/api/admin/users')])
      .then(([a, u]) => {
        setItems(a);
        setUsers(u);
      })
      .catch((e) => showToast(e.message, 'error'));
  }, [showToast]);
  useEffect(load, [load]);
  useLive(['activities', 'users', 'batches'], load);

  const visible = useMemo(
    () =>
      (items || []).filter(
        (a) => (!userFilter || a.userId === userFilter) && (!status || a.status === status) && (!q || `${a.name} ${a.userName} ${a.description}`.toLowerCase().includes(q.toLowerCase()))
      ),
    [items, userFilter, status, q]
  );

  return (
    <>
      <PageHeader
        title="Activities"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Activities' }]}
        description="Events, workshops and programmes of each user."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')} disabled={items !== null && users.length === 0}>
            New activity
          </Button>
        }
      />
      {items && users.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="Create a user first"
          description="Activities belong to a user."
          action={
            <Link to="/admin/users?new=1" className="text-sm font-medium text-brand-700 hover:underline">
              New user
            </Link>
          }
        />
      ) : items && items.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="No activities yet"
          description="Add an activity (for example a workshop) to a user."
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New activity
            </Button>
          }
        />
      ) : (
        <TableCard
          toolbar={
            <>
              <SearchInput value={q} onChange={setQ} placeholder="Search activities" className="w-full sm:w-64" />
              <Select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className="w-full sm:w-52" aria-label="User filter">
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
              <Select value={status} onChange={(e) => setStatus(e.target.value as any)} className="w-full sm:w-40" aria-label="Status filter">
                <option value="">All statuses</option>
                {(Object.keys(ACTIVITY_STATUS) as ActivityStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {ACTIVITY_STATUS[s].label}
                  </option>
                ))}
              </Select>
            </>
          }
        >
          {!items ? (
            <SkeletonRows cols={5} />
          ) : (
            <ActivityTable
              rows={visible}
              showUser
              onEdit={setEditing}
              onDelete={async (a) => (await deleteActivity(a, confirm, showToast)) && load()}
            />
          )}
        </TableCard>
      )}
      {editing && <ActivityModal activity={editing === 'new' ? null : editing} userId={editing === 'new' ? userFilter || undefined : undefined} users={users} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}

export function ActivityTable({
  rows,
  showUser,
  onEdit,
  onDelete,
}: {
  rows: ActivityRecord[];
  showUser?: boolean;
  onEdit: (a: ActivityRecord) => void;
  onDelete: (a: ActivityRecord) => void;
}) {
  return (
    <table className="w-full min-w-[720px]">
      <thead className="bg-slate-50">
        <tr>
          <th className={th}>Activity</th>
          {showUser && <th className={th}>User</th>}
          <th className={th}>Date</th>
          <th className={th}>Certificates</th>
          <th className={th}>Status</th>
          <th className={th} />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((a) => (
          <tr key={a.id} className="hover:bg-slate-50">
            <td className={td}>
              <p className="font-medium text-slate-900">{a.name}</p>
              {a.description && <p className="line-clamp-1 max-w-xs text-xs text-slate-500">{a.description}</p>}
            </td>
            {showUser && (
              <td className={td}>
                <Link to={`/admin/users/${a.userId}`} className="hover:underline">
                  {a.userName}
                </Link>
              </td>
            )}
            <td className={td}>{a.date ? formatDateOnly(Date.parse(a.date)) : <span className="text-slate-400">—</span>}</td>
            <td className={`${td} tabular-nums`}>{(a.certificateCount ?? 0).toLocaleString()}</td>
            <td className={td}>
              <ActivityStatusBadge status={a.status} />
            </td>
            <td className={`${td} text-right`}>
              <Menu
                trigger={(t) => (
                  <IconButton label="Actions" onClick={t}>
                    <MoreHorizontal className="h-4 w-4" />
                  </IconButton>
                )}
                items={[
                  { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => onEdit(a) },
                  'divider',
                  { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => onDelete(a) },
                ]}
              />
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={showUser ? 6 : 5} className="px-4 py-10 text-center text-sm text-slate-500">
              No activities match your filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
