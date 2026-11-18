// Dialogs used on the Super Admin templates page: delete (with usage
// warnings and the archive alternative) and the reference image shown to users.

import React, { useEffect, useState } from 'react';
import { Archive, ImagePlus, Sparkles, Trash2, Upload } from 'lucide-react';
import { api, fetchFile, fileUrl } from '../../lib/api';
import { Alert, Button, Modal, Spinner } from '../shared/ui';
import { UploadZone } from '../shared/UploadZone';
import { useToast } from '../../context/ToastContext';
import type { TemplateDetail, TemplateSummary, TemplateUsage } from '../../../shared/types';
import { isSvg, svgToPng } from '../../engine/artwork';
import { renderSamplePng } from '../../engine/sampleRender';

export function DeleteTemplateModal({ template, onClose, onDone }: { template: TemplateSummary; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [usage, setUsage] = useState<TemplateUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'delete' | 'archive' | null>(null);

  useEffect(() => {
    api
      .get<TemplateUsage>(`/api/superadmin/templates/${template.id}/usage`)
      .then(setUsage)
      .catch((e) => setError(e.message));
  }, [template.id]);

  const run = async (what: 'delete' | 'archive') => {
    setBusy(what);
    try {
      if (what === 'archive') {
        await api.post(`/api/superadmin/templates/${template.id}/archive`);
        showToast('Template archived — restore it any time from the Archived tab', 'success');
      } else {
        await api.del(`/api/superadmin/templates/${template.id}`);
        showToast('Template deleted', 'success');
      }
      onDone();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const hasHistory = !!usage && usage.batches > 0;
  const published = template.status === 'published';
  const archived = template.status === 'archived';

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete “${template.title}”?`}
      size="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {!archived && (
            <Button icon={<Archive className="h-4 w-4" />} loading={busy === 'archive'} onClick={() => run('archive')} disabled={!usage}>
              Archive instead
            </Button>
          )}
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} loading={busy === 'delete'} disabled={!usage || hasHistory} onClick={() => run('delete')}>
            Delete permanently
          </Button>
        </>
      }
    >
      {!usage && !error ? (
        <Spinner label="Checking where this template is used…" />
      ) : (
        <div className="space-y-3 text-sm text-slate-600">
          {usage && (
            <ul className="grid grid-cols-3 gap-2">
              {[
                ['Users', usage.users],
                ['Batches', usage.batches],
                ['Certificates', usage.certificates],
              ].map(([k, v]) => (
                <li key={k as string} className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">{k}</p>
                  <p className="text-lg font-semibold text-slate-900">{Number(v).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
          {hasHistory ? (
            <Alert tone="warning" title="This template has generation history">
              {usage!.certificates.toLocaleString()} certificates were generated with it, so it cannot be deleted (their records and QR verification must keep working). Archive it
              instead: it disappears from every portal and can be restored later.
            </Alert>
          ) : published ? (
            <Alert tone="warning" title="This template is published">
              Admins and Users can currently choose it. Deleting removes it from their portals immediately and permanently. Archiving hides it too, but it can be restored.
            </Alert>
          ) : (
            <p>Nothing is linked to this template. Deleting removes the template, its versions and its files permanently. This cannot be undone.</p>
          )}
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

/**
 * After publishing: when a template has no reference image yet, render one
 * from sample data so Admins and Users always see a filled-in example.
 */
export async function ensureReferenceImage(detail: TemplateDetail): Promise<boolean> {
  if (detail.referenceImageFileId || !detail.draft.artworkFileId) return false;
  const png = await renderSamplePng(detail.draft);
  const r = await api.upload<{ id: string }>(`/api/superadmin/files?kind=refimage&templateId=${detail.id}&name=sample.png`, png);
  await api.put(`/api/superadmin/templates/${detail.id}/reference-image`, { fileId: r.id });
  return true;
}

/**
 * The sample certificate users see while filling in their data: upload an
 * image, generate one from sample data, or reuse the reference certificate.
 */
export function ReferenceImageModal({ template, onClose, onDone }: { template: TemplateSummary; onClose: () => void; onDone: () => void }) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [current, setCurrent] = useState<string | null>(template.referenceImageFileId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TemplateDetail>(`/api/superadmin/templates/${template.id}`)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [template.id]);

  const save = async (fileId: string | null, msg: string) => {
    const d = await api.put<TemplateDetail>(`/api/superadmin/templates/${template.id}/reference-image`, { fileId });
    setCurrent(d.referenceImageFileId);
    showToast(msg, 'success');
    onDone();
  };

  const wrap = (label: string, fn: () => Promise<void>) => async () => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [uploadFailed, setUploadFailed] = useState<string | null>(null);
  const upload = (f: File | undefined) =>
    f &&
    wrap('upload', async () => {
      setUploadFailed(null);
      let file: File = f;
      if (await isSvg(file)) file = await svgToPng(file);
      if (!/^image\/(png|jpeg)$/.test(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) throw new Error('Upload a PNG, JPG or SVG image.');
      try {
        const r = await api.upload<{ id: string }>(`/api/superadmin/files?kind=refimage&templateId=${template.id}&name=${encodeURIComponent(file.name)}`, file);
        await save(r.id, 'Reference image uploaded');
        setUploadedFile({ name: f.name, size: f.size });
      } catch (e: any) {
        setUploadFailed(e.message);
        throw e;
      }
    })();

  const generate = wrap('generate', async () => {
    if (!detail) return;
    const layout = detail.draft;
    if (!layout.artworkFileId) throw new Error('Upload the blank design first.');
    const png = await renderSamplePng(layout);
    const r = await api.upload<{ id: string }>(`/api/superadmin/files?kind=refimage&templateId=${template.id}&name=sample.png`, png);
    await save(r.id, 'Sample certificate generated');
  });

  const useReference = wrap('reference', async () => {
    const id = detail?.draft.referencePages[0]?.previewFileId;
    if (!id) throw new Error('This template has no reference certificate (Upload A).');
    await fetchFile(id); // make sure it exists
    await save(id, 'Reference certificate will be shown to users');
  });

  const refPreview = detail?.draft.referencePages[0]?.previewFileId;

  return (
    <Modal open onClose={onClose} title="Reference certificate for users" description="Shown next to the form so users know what the finished certificate looks like." size="lg">
      <div className="grid gap-5 sm:grid-cols-[1fr_15rem]">
        <div className="paper flex aspect-[1.414] items-center justify-center overflow-hidden rounded-lg border border-slate-200">
          {busy === 'generate' ? (
            <Spinner label="Rendering sample…" />
          ) : current ? (
            <img src={fileUrl(current)} alt="Current reference image" className="h-full w-full object-contain" />
          ) : (
            <p className="px-6 text-center text-sm text-slate-500">No reference image yet. Users will see the template with sample text instead.</p>
          )}
        </div>
        <div className="space-y-2">
          <UploadZone
            compact
            id="ref-image-upload"
            accept="image/png,image/jpeg,.svg,image/svg+xml"
            state={busy === 'upload' ? 'uploading' : uploadFailed ? 'error' : uploadedFile ? 'done' : 'empty'}
            fileName={uploadedFile?.name}
            fileSize={uploadedFile?.size}
            doneLabel="Uploaded"
            emptyLabel="Upload image"
            busyText="Uploading image…"
            error={uploadFailed}
            disabled={!!busy && busy !== 'upload'}
            onPick={upload}
          />
          <Button className="w-full justify-start" icon={<Sparkles className="h-4 w-4" />} loading={busy === 'generate'} disabled={!detail || !!busy} onClick={generate}>
            Generate from sample data
          </Button>
          <Button className="w-full justify-start" icon={<ImagePlus className="h-4 w-4" />} loading={busy === 'reference'} disabled={!refPreview || !!busy} onClick={useReference}>
            Use reference certificate
          </Button>
          {current && (
            <Button variant="ghost" className="w-full justify-start text-red-600" icon={<Trash2 className="h-4 w-4" />} disabled={!!busy} onClick={wrap('remove', () => save(null, 'Reference image removed'))}>
              Remove
            </Button>
          )}
          <p className="pt-1 text-xs text-slate-500">“Generate” renders the current draft with example names, photo and signature. Upload A (the complete reference certificate) may show a real person — only use it if that is fine for users to see.</p>
        </div>
      </div>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
    </Modal>
  );
}
