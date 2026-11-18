import React, { useCallback, useEffect, useState } from 'react';
import { Award, FilePlus2, History, LayoutTemplate } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLive } from '../../lib/live';
import { Link, useRouter } from '../../lib/router';
import { Button, Card, EmptyState, PageHeader, SkeletonCards, StatTile } from '../shared/ui';
import type { BatchRecord, ClientTemplate } from '../../../shared/types';
import { formatDateOnly } from '../../lib/format';
import { BatchStatusBadge } from '../superadmin/ActivityPage';
import { ReferenceThumb } from './ReferencePanel';
import { RecommendedBadge } from '../shared/RecommendedBadge';

export default function UserHome() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [templates, setTemplates] = useState<ClientTemplate[] | null>(null);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.get<ClientTemplate[]>('/api/user/templates'), api.get<BatchRecord[]>('/api/user/batches')])
      .then(([t, b]) => {
        setTemplates(t);
        setBatches(b);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  // Newly published templates and new history show up without a reload.
  useLive(['templates', 'batches'], load);

  const total = batches.reduce((n, b) => n + b.success, 0);

  return (
    <>
      <PageHeader
        title={user ? `Welcome, ${user.name.split(' ')[0]}` : 'Create certificates'}
        breadcrumbs={[{ label: 'Home' }]}
        description="Choose a template, write the wording, add one participant or a whole list, and download your certificates."
        actions={
          <Button variant="accent" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate('/new')}>
            New certificates
          </Button>
        }
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatTile label="Published templates" value={templates?.length ?? '—'} icon={<LayoutTemplate className="h-4 w-4" />} />
        <StatTile label="Batches" value={batches.length} icon={<History className="h-4 w-4" />} />
        <StatTile label="Certificates generated" value={total.toLocaleString()} icon={<Award className="h-4 w-4" />} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-h2 text-navy">Templates</h2>
        {!templates ? (
          <SkeletonCards count={3} />
        ) : templates.length === 0 ? (
          <EmptyState icon={<LayoutTemplate className="h-6 w-6" />} title="No templates yet" description="Templates appear here as soon as the Super Admin publishes them." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id} className="overflow-hidden transition duration-150 hover:-translate-y-0.5 hover:shadow-float">
                <div className="relative">
                  <ReferenceThumb template={t} className="border-b border-slate-100" />
                  {t.recommendedAt && <RecommendedBadge by={t.recommendedByName} overlay className="absolute left-2 top-2" />}
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{t.title}</p>
                    {t.description && <p className="truncate text-xs text-slate-500">{t.description}</p>}
                  </div>
                  <Button size="sm" variant="primary" onClick={() => navigate(`/new?template=${t.id}`)}>
                    Use
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-h2 text-navy">Recent batches</h2>
          {batches.length > 0 && (
            <Link to="/history" className="text-sm font-medium text-brand-700 hover:underline">
              View history
            </Link>
          )}
        </div>
        {batches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">No certificates generated yet.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {batches.slice(0, 5).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{b.name}</p>
                    <p className="text-xs text-slate-500">
                      {[b.activityName, b.templateTitle].filter(Boolean).join(' › ')} · {formatDateOnly(b.createdAt)} · {b.success.toLocaleString()} certificates
                      {b.createdByName ? ` · generated by ${b.createdByName}` : ''}
                    </p>
                  </div>
                  <BatchStatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
