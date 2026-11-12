import React, { useEffect, useState } from 'react';
import { CheckCircle2, LayoutTemplate } from 'lucide-react';
import { api, fileUrl } from '../../../lib/api';
import { Card, EmptyState, Spinner, cx } from '../../../components/ui';
import type { ClientTemplate, ContentPreset } from '../../../../shared/types';
import type { StepProps } from './state';

export function StepTemplate({ w, goTo, onChoose }: StepProps & { onChoose: (t: ClientTemplate, preset?: ContentPreset) => void }) {
  const [templates, setTemplates] = useState<ClientTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ClientTemplate[]>('/api/client/templates')
      .then(setTemplates)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!templates) return <Spinner />;
  if (templates.length === 0)
    return (
      <EmptyState
        icon={<LayoutTemplate className="h-6 w-6" />}
        title="No templates available yet"
        description="Your administrator has not given you access to any published certificate templates. Contact them to get started."
      />
    );

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Choose a certificate design</h2>
      <p className="mb-5 text-sm text-slate-600">You will write your own wording on the next step. The design and layout are managed by your administrator.</p>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => {
          const selected = w.template?.id === t.id;
          const textBoxes = t.layout.boxes.filter((b) => b.type === 'text').length;
          return (
            <Card key={t.id} className={cx('overflow-hidden transition-shadow', selected ? 'ring-2 ring-brand-600' : 'hover:shadow-md')}>
              <button
                className="block w-full text-left"
                onClick={() => {
                  onChoose(t);
                  goTo('content');
                }}
              >
                <div className="aspect-[1.414] w-full border-b border-slate-100 bg-slate-100">
                  {t.thumbnailFileId && <img src={fileUrl(t.thumbnailFileId)} alt="" className="h-full w-full object-contain" loading="lazy" />}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-slate-900">{t.title}</h3>
                    {selected && <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-600" />}
                  </div>
                  {t.description && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{t.description}</p>}
                  <p className="mt-2 text-xs text-slate-500">
                    {textBoxes} text {textBoxes === 1 ? 'box' : 'boxes'}
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
    </div>
  );
}
