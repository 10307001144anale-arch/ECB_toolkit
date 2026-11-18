import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLive } from '../../lib/live';
import { Award, CalendarDays, LayoutTemplate, Plus, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { Button, Card, EmptyState, PageHeader, SearchInput, Skeleton, StatTile, td, th } from '../shared/ui';
import { ActivityStatusBadge } from './dialogs';
import { formatDateOnly } from '../../lib/format';
import { PasswordHelpPanel } from '../shared/PasswordHelp';
import type { ActivityStatus } from '../../../shared/types';

interface Stats {
  users: number;
  activeUsers: number;
  activities: number;
  publishedTemplates: number;
  certificates: number;
  batches: number;
  perActivity: { id: string; name: string; date: string; status: ActivityStatus; userId: string; userName: string; batches: number; certificates: number }[];
}

export default function AdminDashboard() {
  const { navigate } = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api
      .get<Stats>('/api/admin/stats')
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  useLive(['users', 'activities', 'batches', 'templates'], load);

  const rows = useMemo(() => (stats?.perActivity || []).filter((a) => !q || `${a.name} ${a.userName}`.toLowerCase().includes(q.toLowerCase())), [stats, q]);
  const max = Math.max(1, ...rows.map((r) => r.certificates));

  return (
    <>
      <PageHeader
        title="Dashboard"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Dashboard' }]}
        description="Users, their activities and the certificates generated for them."
        actions={
          <>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/users?new=1')}>
              New user
            </Button>
          </>
        }
      />
      <PasswordHelpPanel kind="user" />
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {!stats ? (
        !error && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Users" value={stats.users} hint={`${stats.activeUsers} active`} icon={<Users className="h-4 w-4" />} />
            <StatTile label="Activities" value={stats.activities} hint="Not archived" icon={<CalendarDays className="h-4 w-4" />} />
            <StatTile label="Published templates" value={stats.publishedTemplates} hint={`${stats.batches.toLocaleString()} batches generated`} icon={<LayoutTemplate className="h-4 w-4" />} />
            <StatTile label="Certificates generated" value={stats.certificates.toLocaleString()} hint="Valid certificates issued" icon={<Award className="h-4 w-4" />} />
          </div>

          {stats.users === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="Add your first user"
                description="Create a user, add their activities, then generate certificates for them, or let them generate their own."
                action={
                  <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/users?new=1')}>
                    New user
                  </Button>
                }
              />
            </div>
          ) : (
            <Card className="mt-6 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Certificates per activity</h2>
                  <p className="text-xs text-slate-500">Certificates generated in each activity.</p>
                </div>
                <SearchInput value={q} onChange={setQ} placeholder="Filter activities" className="w-full sm:w-64" />
              </div>
              {rows.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-slate-500">No activities yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className={th}>Activity</th>
                        <th className={th}>User</th>
                        <th className={th}>Status</th>
                        <th className={th}>Batches</th>
                        <th className={`${th} w-1/4`}>Certificates</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((a) => (
                        <tr key={a.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/users/${a.userId}`)}>
                          <td className={td}>
                            <p className="font-medium text-slate-900">{a.name}</p>
                            {a.date && <p className="text-xs text-slate-500">{formatDateOnly(Date.parse(a.date))}</p>}
                          </td>
                          <td className={td}>{a.userName}</td>
                          <td className={td}>
                            <ActivityStatusBadge status={a.status} />
                          </td>
                          <td className={td}>{a.batches}</td>
                          <td className={td}>
                            <div className="flex items-center gap-3">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-orange" style={{ width: `${(a.certificates / max) * 100}%` }} />
                              </div>
                              <span className="w-14 text-right tabular-nums text-slate-900">{a.certificates.toLocaleString()}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" /> Users can also generate their own certificates in the User portal; everything appears here.
          </p>
        </>
      )}
    </>
  );
}
