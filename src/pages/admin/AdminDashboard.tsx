import React, { useEffect, useState } from 'react';
import { Award, FileCheck2, FilePen, Plus, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { Link, useRouter } from '../../lib/router';
import { Alert, Button, Card, EmptyState, PageHeader, Spinner, StatTile } from '../../components/ui';
import { ACTIVITY_LABELS, timeAgo } from '../../lib/format';
import type { ActivityItem } from '../../../shared/types';
import { NewTemplateModal } from './TemplatesPage';

interface Stats {
  templates: number;
  published: number;
  drafts: number;
  archived: number;
  clients: number;
  activeClients: number;
  certificates: number;
  batches: number;
  frequentTemplates: { id: string; title: string; batches: number; certificates: number }[];
  storage?: { persistent: boolean; dataDir: string };
}

export default function AdminDashboard() {
  const { navigate } = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Stats>('/api/admin/stats'), api.get<ActivityItem[]>('/api/admin/activity?limit=8')])
      .then(([s, a]) => {
        setStats(s);
        setActivity(a);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Manage the certificate designs available in the public certificate generator."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
            New template
          </Button>
        }
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {stats?.storage && !stats.storage.persistent && (
        <Alert tone="error" className="mb-5" title="Templates are not stored permanently">
          The server is saving data in <code>{stats.storage.dataDir}</code>, which is wiped on every restart or redeploy, so published templates would disappear. On Render, add a
          persistent disk mounted at <code>/var/data</code> and set <code>DATA_DIR=/var/data</code>.
        </Alert>
      )}
      {!stats ? (
        !error && <Spinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Templates" value={stats.templates} hint={`${stats.drafts} draft · ${stats.archived} archived`} icon={<FilePen className="h-5 w-5" />} />
            <StatTile label="Published" value={stats.published} hint="Visible to everyone with the link" icon={<FileCheck2 className="h-5 w-5" />} />
            <StatTile label="Batches" value={stats.batches.toLocaleString()} hint="Generation runs" icon={<Users className="h-5 w-5" />} />
            <StatTile label="Certificates generated" value={stats.certificates.toLocaleString()} hint="Valid certificates issued" icon={<Award className="h-5 w-5" />} />
          </div>

          {stats.templates === 0 && (
            <div className="mt-6">
              <EmptyState
                icon={<FilePen className="h-6 w-6" />}
                title="Create your first template"
                description="Upload an existing certificate design, then draw empty boxes where the client's wording, QR code, photo and signature will go."
                action={
                  <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
                    New template
                  </Button>
                }
              />
            </div>
          )}

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold">Recent activity</h2>
                <Link to="/admin/activity" className="text-sm font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              </div>
              {activity.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activity.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-slate-900">
                          <span className="font-medium">{a.userName || 'System'}</span> · {ACTIVITY_LABELS[a.action] || a.action}
                        </p>
                        {a.detail && <p className="truncate text-slate-500">{a.detail}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">{timeAgo(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="lg:col-span-2">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold">Most used templates</h2>
              </div>
              {stats.frequentTemplates.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No certificates generated yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {stats.frequentTemplates.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => navigate(`/admin/templates/${t.id}`)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm hover:bg-slate-50">
                        <span className="truncate font-medium text-slate-900">{t.title}</span>
                        <span className="shrink-0 text-slate-500">{Number(t.certificates).toLocaleString()} certificates</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
      <NewTemplateModal open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}
