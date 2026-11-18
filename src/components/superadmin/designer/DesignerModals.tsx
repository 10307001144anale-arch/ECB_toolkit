// Dialogs of the template designer: publish, version history, AI suggestions.

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api, fetchFile } from '../../../lib/api';
import { Alert, Badge, Button, Field, Modal, Spinner, Textarea } from '../../shared/ui';
import { formatDateTime } from '../../../lib/format';
import type { BoxType, TemplateDetail, TemplateLayout, TemplateVersion } from '../../../../shared/types';

export function PublishModal({ tpl, problems, dirty, onClose, onPublish }: { tpl: TemplateDetail; problems: string[]; dirty: boolean; onClose: () => void; onPublish: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const next = (tpl.currentVersionNumber || 0) + (tpl.hasUnpublishedChanges || dirty || !tpl.currentVersionNumber ? 1 : 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={tpl.currentVersionNumber ? `Publish version ${next}` : 'Publish template'}
      description="Published templates can be assigned to activities by Admins and used by their users."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={problems.length > 0}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onPublish(notes);
              setBusy(false);
            }}
          >
            {dirty ? 'Save and publish' : 'Publish'}
          </Button>
        </>
      }
    >
      {problems.length > 0 ? (
        <Alert tone="warning" title="Fix these first">
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <div className="space-y-4">
          {tpl.currentVersionNumber ? (
            <Alert tone="info">Certificates already generated stay linked to the version they were made with. New batches will use version {next}.</Alert>
          ) : null}
          <Field label="What changed?" optional htmlFor="pub-notes">
            <Textarea id="pub-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Moved the date box and enlarged the QR code" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

export function VersionsModal({ templateId, currentVersionId, onClose, onRestore }: { templateId: string; currentVersionId: string | null; onClose: () => void; onRestore: (v: TemplateVersion) => void }) {
  const [versions, setVersions] = useState<(TemplateVersion & { batchCount: number })[] | null>(null);
  useEffect(() => {
    api.get<(TemplateVersion & { batchCount: number })[]>(`/api/superadmin/templates/${templateId}/versions`).then(setVersions);
  }, [templateId]);
  return (
    <Modal open onClose={onClose} title="Version history" description="Every publish creates a version. Older certificates stay linked to their version." size="lg">
      {!versions ? (
        <Spinner />
      ) : versions.length === 0 ? (
        <p className="text-sm text-slate-500">This template has not been published yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  Version {v.versionNumber} {v.id === currentVersionId && <Badge tone="green">Current</Badge>}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(v.publishedAt)} · {v.layout.boxes.length} boxes · used in {v.batchCount} batch{v.batchCount === 1 ? '' : 'es'}
                </p>
                {v.notes && <p className="mt-1 text-xs text-slate-600">{v.notes}</p>}
              </div>
              <Button size="sm" onClick={() => onRestore(v)}>
                Restore into draft
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export function AiDetectModal({ layout, page, onClose, onBoxes }: { layout: TemplateLayout; page: number; onClose: () => void; onBoxes: (b: { type: BoxType; label: string; x: number; y: number; w: number; h: number }[]) => void }) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = layout.pages[page]?.previewFileId;
      if (!id) throw new Error('No preview image for this page.');
      const buf = await fetchFile(id);
      const blob = new Blob([buf]);
      const dataUrl: string = await new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.readAsDataURL(blob);
      });
      const mimeType = layout.artworkMime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
      const r = await api.post<{ boxes: any[] }>('/api/superadmin/ai/detect-boxes', { imageBase64: dataUrl.split(',')[1], mimeType, consent: true });
      if (!r.boxes.length) throw new Error('No boxes were suggested for this design.');
      onBoxes(r.boxes);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Suggest boxes with AI"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!agree} loading={busy} onClick={run} icon={<Sparkles className="h-4 w-4" />}>
            Send and suggest
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        <p>This optional feature sends an image of this page of the blank certificate design to Google (Gemini) to suggest where boxes could go. Suggested boxes are added empty; you can move or delete them.</p>
        <p>No participant information or client wording is ever sent.</p>
        <label className="flex items-start gap-2 text-slate-800">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I agree to send this design image to Google for analysis.
        </label>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
