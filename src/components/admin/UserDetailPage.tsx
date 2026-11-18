import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useLive } from '../../lib/live';
import { useRouter } from '../../lib/router';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, SkeletonRows, StatTile, useConfirm } from '../shared/ui';
import { UserLogo } from '../shared/UserLogo';
import { useToast } from '../../context/ToastContext';
import { ActivityModal, UserModal } from './dialogs';
import { ActivityTable, deleteActivity } from './ActivitiesPage';
import { deleteUser } from './UsersPage';
import type { ActivityRecord, UserAccount } from '../../../shared/types';

export default function UserDetailPage({ id }: { id: string }) {
  const { navigate } = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [user, setUser] = useState<UserAccount | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editUser, setEditUser] = useState(false);
  const [editing, setEditing] = useState<ActivityRecord | 'new' | null>(null);

  const load = useCallback(() => {
    Promise.all([api.get<UserAccount>(`/api/admin/users/${id}`), api.get<ActivityRecord[]>(`/api/admin/activities?userId=${encodeURIComponent(id)}`)])
      .then(([u, a]) => {
        setUser(u);
        setActivities(a);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  useLive(['users', 'activities', 'batches'], load);

  if (error) return <EmptyState title="User not found" description={error} />;

  return (
    <>
      <PageHeader
        title={user?.name || 'User'}
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Users', to: '/admin/users' }, { label: user?.name || '…' }]}
        actions={
          user && (
            <>
              <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditUser(true)}>
                Edit user
              </Button>
              <Button variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} disabled={user.batchCount > 0} onClick={async () => (await deleteUser(user, confirm, showToast)) && navigate('/admin/users')}>
                Delete
              </Button>
            </>
          )
        }
      />
      {!user ? (
        <Skeleton className="h-32" />
      ) : (
        <Card className="mb-6 flex flex-wrap items-start gap-5 p-5">
          <UserLogo user={user} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {user.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
              {user.organisation && <span className="text-sm text-slate-600">{user.organisation}</span>}
            </div>
            <a href={`mailto:${user.email}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
              <Mail className="h-4 w-4" /> {user.email}
            </a>
            {user.notes && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm text-slate-600">{user.notes}</p>}
          </div>
          <div className="grid w-full grid-cols-3 gap-3 sm:w-auto">
            <StatTile label="Activities" value={user.activityCount} />
            <StatTile label="Batches" value={user.batchCount} />
            <StatTile label="Certificates" value={user.certificateCount.toLocaleString()} />
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-h2 text-navy">Activities</h2>
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          New activity
        </Button>
      </div>
      {!activities ? (
        <Card>
          <SkeletonRows />
        </Card>
      ) : activities.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="No activities yet"
          description="Add the events or programmes this user issues certificates for."
          action={
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              New activity
            </Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto">
          <ActivityTable
            rows={activities}
            onEdit={setEditing}
            onDelete={async (a) => (await deleteActivity(a, confirm, showToast)) && load()}
          />
        </Card>
      )}

      {editUser && user && <UserModal user={user} onClose={() => setEditUser(false)} onSaved={load} />}
      {editing && <ActivityModal activity={editing === 'new' ? null : editing} userId={id} onClose={() => setEditing(null)} onSaved={load} />}
    </>
  );
}
