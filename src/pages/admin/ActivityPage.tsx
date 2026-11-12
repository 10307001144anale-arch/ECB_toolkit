import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { Badge, Card, EmptyState, PageHeader, Spinner, Tabs } from '../../components/ui';
import { ACTIVITY_LABELS, formatDateTime } from '../../lib/format';
import type { ActivityItem, BatchRecord } from '../../../shared/types';
import { Activity } from 'lucide-react';

export function BatchStatusBadge({ status }: { status: BatchRecord['status'] }) {
  const map = {
    completed: <Badge tone="green">Completed</Badge>,
    partial: <Badge tone="amber">Partly completed</Badge>,
    running: <Badge tone="blue">In progress</Badge>,
    cancelled: <Badge>Cancelled</Badge>,
    failed: <Badge tone="red">Failed</Badge>,
  } as const;
  return map[status];
}

export default function ActivityPage() {
  const { query } = useRouter();
  const userFilter = query.get('user');
  const [tab, setTab] = useState<'batches' | 'log'>(userFilter ? 'log' : 'batches');
  const [batches, setBatches] = useState<BatchRecord[] | null>(null);
  const [log, setLog] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<BatchRecord[]>('/api/admin/batches?limit=200').then(setBatches).catch((e) => setError(e.message));
    api
      .get<ActivityItem[]>(`/api/admin/activity?limit=200${userFilter ? `&userId=${encodeURIComponent(userFilter)}` : ''}`)
      .then(setLog)
      .catch((e) => setError(e.message));
  }, [userFilter]);

  return (
    <>
      <PageHeader title="Activity" description="Certificate generation across all clients, and a log of account and template changes." />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'batches', label: 'Generation', count: batches?.length },
            { value: 'log', label: userFilter ? 'Activity log (filtered)' : 'Activity log', count: log?.length },
          ]}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {tab === 'batches' &&
        (!batches ? (
          <Spinner />
        ) : batches.length === 0 ? (
          <EmptyState icon={<Activity className="h-6 w-6" />} title="No certificates generated yet" />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 font-medium">Client</th>
                    <th className="px-4 py-3 font-medium">Template</th>
                    <th className="px-4 py-3 font-medium">Certificates</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{b.name}</td>
                      <td className="px-4 py-3 text-slate-700">{b.clientName}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {b.templateTitle} <span className="text-slate-400">v{b.templateVersionNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {b.success.toLocaleString()} / {b.total.toLocaleString()}
                        {b.failed > 0 && <span className="text-red-600"> · {b.failed} failed</span>}
                      </td>
                      <td className="px-4 py-3">
                        <BatchStatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateTime(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      {tab === 'log' &&
        (!log ? (
          <Spinner />
        ) : log.length === 0 ? (
          <EmptyState icon={<Activity className="h-6 w-6" />} title="No activity recorded" />
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {log.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p>
                      <span className="font-medium text-slate-900">{a.userName || 'System'}</span>{' '}
                      <span className="text-slate-700">{ACTIVITY_LABELS[a.action] || a.action}</span>
                    </p>
                    {a.detail && <p className="truncate text-slate-500">{a.detail}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
    </>
  );
}
