// Step 1 — Template & wording: choose a published template, then keep or edit
// the administrator's suggested wording with a live preview.

import React, { useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { Button, Card, Spinner } from '../../../components/ui';
import { fileUrl } from '../../../lib/api';
import type { ClientTemplate, ContentPreset } from '../../../../shared/types';
import { StepTemplate } from './StepTemplate';
import { StepContent } from './StepContent';
import type { StepProps } from './state';

export function StepDesign(props: StepProps & { onChoose: (t: ClientTemplate, preset?: ContentPreset) => void }) {
  const { w, onChoose } = props;
  const [picking, setPicking] = useState(!w.template);

  if (picking || !w.template) {
    return (
      <div className="space-y-4">
        {w.template && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPicking(false)}>
              Keep “{w.template.title}”
            </Button>
          </div>
        )}
        <StepTemplate
          {...props}
          onChoose={(t, p) => {
            onChoose(t, p);
            setPicking(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-4 p-3">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md bg-slate-100">
          {w.template.thumbnailFileId ? <img src={fileUrl(w.template.thumbnailFileId)} alt="" className="h-full w-full object-contain" /> : <LayoutTemplate className="m-auto mt-4 h-6 w-6 text-slate-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{w.template.title}</p>
          <p className="text-xs text-slate-500">The design is fixed by your administrator. Your wording is saved with your batch only — the template itself is never changed.</p>
        </div>
        <Button size="sm" onClick={() => setPicking(true)}>
          Change template
        </Button>
      </Card>
      {!w.renderer && !w.rendererError ? <Spinner label="Loading the template…" /> : w.renderer ? <StepContent {...props} /> : null}
    </div>
  );
}
