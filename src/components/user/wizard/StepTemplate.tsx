// Step 1a — choose a published template (shown as its reference certificate),
// with the reference certificate in a side panel.

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, LayoutTemplate } from 'lucide-react';
import { api } from '../../../lib/api';
import { useGeneration } from '../../../lib/generation';
import { useLive } from '../../../lib/live';
import { Card, EmptyState, SkeletonCards, cx } from '../../shared/ui';
import { ReferencePanel, ReferenceThumb } from '../ReferencePanel';
import { RecommendedBadge } from '../../shared/RecommendedBadge';
import type { ClientTemplate, ContentPreset } from '../../../../shared/types';
import type { StepProps } from './state';

export function StepTemplate({ w, set, onChoose }: StepProps & { onChoose: (t: ClientTemplate, preset?: ContentPreset) => void }) {
  const gen = useGeneration();
  const [templates, setTemplates] = useState<ClientTemplate[] | null>(null);
  const [hover, setHover] = useState<ClientTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<ClientTemplate[]>(`${gen.api}/templates`)
      .then((list) => {
        setTemplates(list);
        // A template that was unpublished meanwhile cannot be used any more.
        if (w.template && !list.some((t) => t.id === w.template!.id)) set({ template: null, renderer: null, rendererError: null });
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gen.api, w.template?.id]);
  useEffect(load, [load]);
  useLive(['templates'], load);

  const shown = hover || (w.template && templates?.some((t) => t.id === w.template!.id) ? w.template : templates?.[0] || null);
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_24rem]">
      <div className="space-y-6">

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-h3 text-navy">
            <LayoutTemplate className="h-4 w-4 text-navy" /> Choose a template
          </h2>
          {!templates ? (
            <SkeletonCards count={3} />
          ) : templates.length === 0 ? (
            <EmptyState icon={<LayoutTemplate className="h-6 w-6" />} title="No published templates yet" description="Templates appear here as soon as the Super Admin publishes them." />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" onMouseLeave={() => setHover(null)}>
              {templates.map((t) => {
                const selected = w.template?.id === t.id;
                const textBoxes = t.layout.boxes.filter((b) => b.type === 'text').length;
                return (
                  <Card key={t.id} className={cx('overflow-hidden transition duration-150 hover:-translate-y-0.5 hover:shadow-float', selected && 'ring-2 ring-orange')}>
                    <button className="block w-full text-left" onMouseEnter={() => setHover(t)} onFocus={() => setHover(t)} onClick={() => onChoose(t)}>
                      <div className="relative">
                        <ReferenceThumb template={t} className="border-b border-slate-100" />
                        {t.recommendedAt && <RecommendedBadge by={t.recommendedByName} overlay className="absolute left-2 top-2" />}
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-slate-900">{t.title}</h3>
                          {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-navy" />}
                        </div>
                        {t.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{t.description}</p>}
                        <p className="mt-2 text-xs text-slate-500">
                          {textBoxes} text {textBoxes === 1 ? 'field' : 'fields'}
                          {t.layout.boxes.some((b) => b.type === 'qr') && ' · QR code'}
                          {t.layout.boxes.some((b) => b.type === 'photo') && ' · photo'}
                          {t.layout.boxes.some((b) => b.type === 'signature') && ' · signature'}
                        </p>
                      </div>
                    </button>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <ReferencePanel template={shown} />
      </aside>
    </div>
  );
}
