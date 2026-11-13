import React, { useEffect, useState } from 'react';
import { FilePlus2, LayoutTemplate } from 'lucide-react';
import { api, fileUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Link, useRouter } from '../../lib/router';
import { Button, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import type { BatchRecord, ClientTemplate } from '../../../shared/types';
import { formatDateOnly } from '../../lib/format';
import { BatchStatusBadge } from '../admin/ActivityPage';

export default function ClientHome() {
  const { user } = useAuth();
  const { navigate } = useRouter();
  const [templates, setTemplates] = useState<ClientTemplate[] | null>(null);
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      Promise.all([api.get<ClientTemplate[]>('/api/client/templates'), api.get<BatchRecord[]>('/api/client/batches')])
        .then(([t, b]) => {
          setTemplates(t);
          setBatches(b.slice(0, 5));
          setError(null);
        })
        .catch((e) => setError(e.message));
    load();
    // Show newly published (or hidden) templates when the visitor comes back to the tab.
    const onFocus = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, []);

  return (
    <>
      <PageHeader
        title={user?.role === 'client' ? `Welcome, ${user.name.split(' ')[0]}` : 'Create certificates'}
        description="Create personalised certificates from your participant list in a few steps."
        actions={
          <Button variant="primary" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => navigate('/app/new')}>
            New batch
          </Button>
        }
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!templates ? (
        !error && <Spinner />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Your certificate templates</h2>
            {templates.length === 0 ? (
              <EmptyState icon={<LayoutTemplate className="h-6 w-6" />} title="No templates yet" description="Your administrator has not shared any templates with you yet." />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((t) => (
                  <Card key={t.id} className="overflow-hidden">
                    <div className="aspect-[1.414] border-b border-slate-100 bg-slate-100">{t.thumbnailFileId && <img src={fileUrl(t.thumbnailFileId)} alt="" className="h-full w-full object-contain" loading="lazy" />}</div>
                    <div className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{t.title}</p>
                        {t.description && <p className="truncate text-xs text-slate-500">{t.description}</p>}
                      </div>
                      <Button size="sm" variant="subtle" onClick={() => navigate(`/app/new?template=${t.id}`)}>
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
              <h2 className="text-sm font-semibold text-slate-700">Recent batches</h2>
              {batches.length > 0 && (
                <Link to="/app/history" className="text-sm font-medium text-brand-700 hover:underline">
                  View history
                </Link>
              )}
            </div>
            {batches.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">You haven't generated any certificates yet.</p>
            ) : (
              <Card>
                <ul className="divide-y divide-slate-100">
                  {batches.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{b.name}</p>
                        <p className="text-xs text-slate-500">
                          {b.templateTitle} · {formatDateOnly(b.createdAt)} · {b.success.toLocaleString()} certificates
                        </p>
                      </div>
                      <BatchStatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>
      )}
    </>
  );
}
