// Admin "Audit log": the templates the Super Admin has published, view only.
// Admins can open a template to see its reference and blank certificate, and
// mark one as Recommended ("use this template") for Users.

import React, { useCallback, useEffect, useState } from 'react';
import { Eye, LayoutTemplate, ScrollText, Star } from 'lucide-react';
import { api, fileUrl } from '../../lib/api';
import { useLive } from '../../lib/live';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, SearchInput, Segmented, SkeletonCards, Tabs } from '../shared/ui';
import { RecommendedBadge } from '../shared/RecommendedBadge';
import { ACTIVITY_LABELS, formatDateOnly, formatDateTime } from '../../lib/format';
import type { TemplateSummary } from '../../../shared/types';

type LogTemplate = TemplateSummary & { referencePreviewFileId: string | null; blankPreviewFileId: string | null; pageCount: number };
type LogEvent = { id: string; userName: string | null; action: string; detail: string | null; createdAt: number };

const refImage = (t: LogTemplate) => t.referenceImageFileId || t.referencePreviewFileId;
const blankImage = (t: LogTemplate) => t.blankPreviewFileId || t.thumbnailFileId;

function Status({ t }: { t: LogTemplate }) {
  if (t.status === 'archived') return <Badge tone="gray">Archived</Badge>;
  if (t.status === 'published') return <Badge tone="green">Published · v{t.currentVersionNumber}</Badge>;
  return <Badge tone="blue">Draft — not published</Badge>;
}

export default function TemplateAuditPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<{ templates: LogTemplate[]; events: LogEvent[] } | null>(null);
  const [tab, setTab] = useState<'templates' | 'events'>('templates');
  const [q, setQ] = useState('');
  const [viewing, setViewing] = useState<LogTemplate | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<{ templates: LogTemplate[]; events: LogEvent[] }>('/api/admin/template-log').then(setData);
  }, []);
  useEffect(load, [load]);
  useLive(['templates'], load);

  const recommend = async (t: LogTemplate, on: boolean) => {
    setBusy(t.id);
    try {
      await api.put(`/api/admin/templates/${t.id}/recommend`, { recommended: on });
      showToast(on ? `“${t.title}” is now recommended to Users.` : `Removed the recommendation from “${t.title}”.`, 'success');
      load();
      if (viewing?.id === t.id) setViewing(null);
    } catch (e: any) {
      showToast(e.message || 'Could not update the recommendation.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const templates = (data?.templates || []).filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()));
  const events = (data?.events || []).filter((e) => !q || `${e.detail} ${e.userName}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Audit log"
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Audit log' }]}
        description="Templates published by the Super Admin. View a template, and mark the one Users should use as Recommended."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'templates', label: 'Templates', count: data?.templates.length },
            { value: 'events', label: 'Template activity', count: data?.events.length },
          ]}
        />
        <SearchInput value={q} onChange={setQ} placeholder={tab === 'templates' ? 'Search templates' : 'Search activity'} className="w-full sm:w-72" />
      </div>

      {!data ? (
        <SkeletonCards />
      ) : tab === 'templates' ? (
        templates.length === 0 ? (
          <EmptyState icon={<LayoutTemplate className="h-6 w-6" />} title={q ? 'No matching templates' : 'No published templates yet'} description="Templates appear here as soon as the Super Admin publishes them." />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((t) => {
              const img = refImage(t) || blankImage(t);
              return (
                <Card key={t.id} className="flex flex-col overflow-hidden">
                  <button type="button" onClick={() => setViewing(t)} className="paper relative block aspect-[1.414] w-full overflow-hidden border-b border-slate-100" aria-label={`View ${t.title}`}>
                    {img ? <img src={fileUrl(img)} alt="" className="h-full w-full object-contain" loading="lazy" /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">No image yet</div>}
                    {t.recommendedAt && <RecommendedBadge by={t.recommendedByName} overlay className="absolute left-2 top-2" />}
                  </button>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="truncate font-medium text-slate-900">{t.title}</h3>
                    <div className="mt-1.5">
                      <Status t={t} />
                    </div>
                    <dl className="mt-3 space-y-0.5 text-xs text-slate-600">
                      <div>
                        Uploaded {formatDateOnly(t.createdAt)}
                        {t.createdByName ? ` by ${t.createdByName}` : ''}
                      </div>
                      {t.status !== 'draft' && <div>Last updated {formatDateOnly(t.updatedAt)}</div>}
                      {t.recommendedAt && (
                        <div>
                          Recommended {formatDateOnly(t.recommendedAt)}
                          {t.recommendedByName ? ` by ${t.recommendedByName}` : ''}
                        </div>
                      )}
                    </dl>
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      <Button size="sm" icon={<Eye className="h-4 w-4" />} onClick={() => setViewing(t)}>
                        View
                      </Button>
                      {t.recommendedAt ? (
                        <Button size="sm" loading={busy === t.id} onClick={() => recommend(t, false)}>
                          Remove recommendation
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={<Star className="h-4 w-4" />}
                          loading={busy === t.id}
                          onClick={() => recommend(t, true)}
                        >
                          Recommend
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : events.length === 0 ? (
        <EmptyState icon={<ScrollText className="h-6 w-6" />} title="No template activity yet" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
              <span className="text-slate-700">
                <span className="font-medium text-slate-900">{e.userName || 'System'}</span> · {ACTIVITY_LABELS[e.action] || e.action}
                {e.detail && <span className="text-slate-900"> — {e.detail}</span>}
              </span>
              <span className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
            </div>
          ))}
        </Card>
      )}

      {viewing && <ViewTemplateModal t={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function ViewTemplateModal({ t, onClose }: { t: LogTemplate; onClose: () => void }) {
  const [which, setWhich] = useState<'reference' | 'blank'>(refImage(t) ? 'reference' : 'blank');
  const id = which === 'reference' ? refImage(t) : blankImage(t);
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t.title}
      description="View only — templates are uploaded and edited by the Super Admin."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          size="sm"
          ariaLabel="Image to show"
          value={which}
          onChange={setWhich}
          options={[
            { value: 'reference', label: 'Reference certificate' },
            { value: 'blank', label: 'Blank template' },
          ]}
        />
        <span className="flex items-center gap-2">
          {t.recommendedAt && <RecommendedBadge by={t.recommendedByName} />}
          <Status t={t} />
        </span>
      </div>
      <div className="paper overflow-hidden rounded-lg border border-slate-200">
        {id ? (
          <img src={fileUrl(id)} alt={`${which === 'reference' ? 'Reference' : 'Blank'} certificate for ${t.title}`} className="w-full object-contain" />
        ) : (
          <p className="px-4 py-16 text-center text-sm text-slate-500">{which === 'reference' ? 'No reference certificate was uploaded.' : 'No blank template image yet.'}</p>
        )}
      </div>
      {t.description && <p className="mt-3 text-sm text-slate-700">{t.description}</p>}
    </Modal>
  );
}
