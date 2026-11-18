import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, Copy, Eye, EyeOff, FlaskConical, Image as ImageIcon, LayoutTemplate, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, fileUrl } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { Alert, Badge, Button, Card, EmptyState, Field, IconButton, InlineEdit, Input, Menu, Modal, PageHeader, SearchInput, Select, SkeletonCards, Tabs, Textarea, cx, useConfirm } from '../../components/shared/ui';
import { useToast } from '../../context/ToastContext';
import { emptyLayout } from '../../../shared/layout';
import type { TemplateDetail, TemplateStatus, TemplateSummary } from '../../../shared/types';
import { processArtwork, processReference } from '../../engine/artwork';
import { UploadZone } from '../shared/UploadZone';
import { CheckCircle2 } from 'lucide-react';
import { DeleteTemplateModal, ensureReferenceImage, ReferenceImageModal } from './TemplateDialogs';
import { useLive } from '../../lib/live';
import { checkReferenceAlignment } from '../../../shared/layout';
import { formatDateOnly } from '../../lib/format';
import { RecommendedBadge } from '../shared/RecommendedBadge';

export function StatusBadge({ t }: { t: Pick<TemplateSummary, 'status' | 'hasUnpublishedChanges' | 'currentVersionNumber'> }) {
  if (t.status === 'archived') return <Badge tone="gray">Archived</Badge>;
  if (t.status === 'published')
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone="green">Published · v{t.currentVersionNumber}</Badge>
        {t.hasUnpublishedChanges && <Badge tone="amber">Changes not published yet</Badge>}
      </span>
    );
  if (t.currentVersionNumber) return <Badge tone="amber">Hidden from users</Badge>;
  return <Badge tone="blue">Draft — not published</Badge>;
}

export default function TemplatesPage() {
  const { navigate } = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<TemplateSummary[] | null>(null);
  const [tab, setTab] = useState<'all' | TemplateStatus>('all');
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);
  const [refFor, setRefFor] = useState<TemplateSummary | null>(null);

  const load = useCallback(() => {
    api
      .get<TemplateSummary[]>('/api/superadmin/templates')
      .then(setItems)
      .catch((e) => showToast(e.message, 'error'));
  }, [showToast]);
  useEffect(load, [load]);
  useLive(['templates', 'batches'], load);

  const counts = useMemo(() => {
    const c = { all: 0, draft: 0, published: 0, archived: 0 };
    for (const t of items || []) {
      c[t.status]++;
      if (t.status !== 'archived') c.all++;
    }
    return c;
  }, [items]);

  const visible = (items || []).filter(
    (t) =>
      (tab === 'all' ? t.status !== 'archived' : t.status === tab) &&
      (!q || t.title.toLowerCase().includes(q.toLowerCase()) || t.description.toLowerCase().includes(q.toLowerCase()))
  );

  const rename = async (t: TemplateSummary, title: string) => {
    try {
      await api.put(`/api/superadmin/templates/${t.id}`, { title });
      setItems((list) => list?.map((x) => (x.id === t.id ? { ...x, title } : x)) || null);
      showToast('Template renamed', 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
      throw e;
    }
  };

  const act = async (t: TemplateSummary, action: string) => {
    try {
      if (action === 'unpublish') {
        const ok = await confirm({ title: 'Hide this template?', message: 'Users will no longer see it until you publish it again. Existing certificates stay valid.', confirmLabel: 'Hide' });
        if (!ok) return;
        await api.post(`/api/superadmin/templates/${t.id}/unpublish`);
        showToast('Template hidden from users', 'success');
      } else if (action === 'republish') {
        const d = await api.post<TemplateDetail>(`/api/superadmin/templates/${t.id}/publish`);
        showToast('Template published — visible in the Admin and User portals', 'success');
        ensureReferenceImage(d).then((made) => made && load()).catch(() => {});
      } else if (action === 'unarchive') {
        await api.post(`/api/superadmin/templates/${t.id}/unarchive`);
        showToast('Template restored as draft', 'success');
      } else if (action === 'duplicate') {
        const d = await api.post<TemplateDetail>(`/api/superadmin/templates/${t.id}/duplicate`);
        showToast('Template duplicated', 'success');
        navigate(`/superadmin/templates/${d.id}`);
        return;
      }
      load();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Templates"
        breadcrumbs={[{ label: 'Super Admin', to: '/superadmin' }, { label: 'Templates' }]}
        description="Upload certificate designs, configure their fields, test them and publish. Published templates appear in the Admin and User portals."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
            New template
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'all', label: 'Active', count: counts.all },
            { value: 'draft', label: 'Drafts', count: counts.draft },
            { value: 'published', label: 'Published', count: counts.published },
            { value: 'archived', label: 'Archived', count: counts.archived },
          ]}
        />
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <SearchInput value={q} onChange={setQ} placeholder="Search templates" className="w-full sm:w-64" />
        </div>
      </div>

      {!items ? (
        <SkeletonCards />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title={q ? 'No matching templates' : tab === 'archived' ? 'No archived templates' : 'No templates yet'}
          description={q ? 'Try a different search.' : tab === 'archived' ? 'Archived templates appear here and can be restored.' : 'Upload a certificate design to create a reusable template.'}
          action={
            !q && tab !== 'archived' ? (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
                New template
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((t) => (
            <Card key={t.id} className="group flex flex-col overflow-hidden transition duration-150 hover:-translate-y-0.5 hover:shadow-float">
              <button
                onClick={() => t.status !== 'archived' && navigate(`/superadmin/templates/${t.id}`)}
                className="paper relative block aspect-[1.414] w-full overflow-hidden border-b border-slate-100"
                aria-label={`Open ${t.title}`}
              >
                {t.referenceImageFileId || t.thumbnailFileId ? (
                  <img src={fileUrl(t.referenceImageFileId || t.thumbnailFileId)} alt="" className="h-full w-full object-contain" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No artwork yet</div>
                )}
                {t.recommendedAt && <RecommendedBadge by={t.recommendedByName} overlay className="absolute right-2 top-2" />}
                {!t.referenceImageFileId && t.thumbnailFileId && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow">
                    <ImageIcon className="h-3 w-3" /> Blank design — no reference yet
                  </span>
                )}
              </button>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  {t.status === 'archived' ? (
                    <h3 className="truncate font-medium text-slate-900">{t.title}</h3>
                  ) : (
                    <InlineEdit value={t.title} onSave={(v) => rename(t, v)} className="font-medium text-slate-900" label="Rename template" />
                  )}
                  <Menu
                    trigger={(toggle) => (
                      <IconButton label="More actions" onClick={toggle}>
                        <MoreHorizontal className="h-4 w-4" />
                      </IconButton>
                    )}
                    items={[
                      { label: 'Edit design', icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/superadmin/templates/${t.id}`), disabled: t.status === 'archived' },
                      { label: 'Test template', icon: <FlaskConical className="h-4 w-4" />, onClick: () => navigate(`/superadmin/templates/${t.id}/test`), disabled: t.status === 'archived' || !t.thumbnailFileId },
                      { label: 'Reference image for users', icon: <ImageIcon className="h-4 w-4" />, onClick: () => setRefFor(t), disabled: t.status === 'archived' },
                      { label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onClick: () => act(t, 'duplicate') },
                      ...(t.status === 'published'
                        ? [{ label: 'Unpublish (hide from Admins and Users)', icon: <EyeOff className="h-4 w-4" />, onClick: () => act(t, 'unpublish') }]
                        : t.status === 'draft'
                          ? [{ label: t.currentVersionId ? 'Publish (latest draft)' : 'Publish', icon: <Eye className="h-4 w-4" />, onClick: () => act(t, 'republish') }]
                          : []),
                      'divider' as const,
                      ...(t.status === 'archived' ? [{ label: 'Restore from archive', icon: <ArchiveRestore className="h-4 w-4" />, onClick: () => act(t, 'unarchive') }] : []),
                      { label: t.status === 'archived' ? 'Delete…' : 'Delete or archive…', icon: <Trash2 className="h-4 w-4" />, onClick: () => setDeleting(t), danger: true },
                    ]}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusBadge t={t} />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {t.boxCount} {t.boxCount === 1 ? 'field' : 'fields'} · {(t.usageCount || 0).toLocaleString()} issued · Updated{' '}
                  {formatDateOnly(t.updatedAt)}
                </p>
                <div className="mt-auto flex gap-2 pt-4">
                  {t.status === 'archived' ? (
                    <>
                      <Button size="sm" icon={<ArchiveRestore className="h-4 w-4" />} onClick={() => act(t, 'unarchive')}>
                        Restore
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-auto text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleting(t)}>
                        Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="subtle" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/superadmin/templates/${t.id}`)}>
                        Edit
                      </Button>
                      <Button size="sm" icon={<FlaskConical className="h-4 w-4" />} onClick={() => navigate(`/superadmin/templates/${t.id}/test`)} disabled={!t.thumbnailFileId}>
                        Test
                      </Button>
                      <IconButton label={`Delete ${t.title}`} className="ml-auto text-red-600 hover:bg-red-50" onClick={() => setDeleting(t)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewTemplateModal open={newOpen} onClose={() => setNewOpen(false)} />
      {deleting && <DeleteTemplateModal template={deleting} onClose={() => setDeleting(null)} onDone={load} />}
      {refFor && <ReferenceImageModal template={refFor} onClose={() => setRefFor(null)} onDone={load} />}
    </>
  );
}

const ART_ACCEPT = '.pdf,.png,.jpg,.jpeg,.svg,application/pdf,image/png,image/jpeg,image/svg+xml';

export function NewTemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigate } = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState<File | null>(null);
  const [blank, setBlank] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which file is uploading now, which are on the server, and which one failed. */
  const [stage, setStage] = useState<'reference' | 'blank' | null>(null);
  const [uploaded, setUploaded] = useState<{ reference: boolean; blank: boolean }>({ reference: false, blank: false });
  const [failed, setFailed] = useState<{ which: 'reference' | 'blank'; message: string } | null>(null);

  const check = (f: File | undefined, set: (f: File) => void, which: 'reference' | 'blank') => {
    if (!f) return;
    setError(null);
    setFailed(null);
    setUploaded((u) => ({ ...u, [which]: false }));
    if (!/\.(pdf|png|jpe?g|svg)$/i.test(f.name)) return setFailed({ which, message: 'Choose a PDF, PNG, JPG or SVG file.' });
    set(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b(blank|complete|reference|sample)\b/gi, '').trim());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Enter a template name.');
    if (!blank) return setError('Upload the blank certificate design (Upload B).');
    if (!reference) return setError('Upload the complete reference certificate (Upload A).');
    setError(null);
    setFailed(null);
    let current: 'reference' | 'blank' | 'create' = 'blank';
    try {
      let draft = emptyLayout();
      setStage('blank');
      draft = { ...draft, ...(await processArtwork(blank, setStatus)) };
      setUploaded((u) => ({ ...u, blank: true }));
      current = 'reference';
      setStage('reference');
      draft = { ...draft, ...(await processReference(reference, setStatus)) };
      setUploaded((u) => ({ ...u, reference: true }));
      setStage(null);
      current = 'create';
      setStatus('Creating template…');
      const t = await api.post<TemplateDetail>('/api/superadmin/templates', { title, description, draft });
      onClose();
      setTitle('');
      setDescription('');
      setBlank(null);
      setReference(null);
      setUploaded({ reference: false, blank: false });
      const align = checkReferenceAlignment(t.draft);
      navigate(`/superadmin/templates/${t.id}${align.problems.length ? '?align=1' : ''}`);
    } catch (err: any) {
      if (current === 'create') setError(err.message);
      else setFailed({ which: current, message: err.message });
    } finally {
      setStatus(null);
      setStage(null);
    }
  };

  const zoneState = (which: 'reference' | 'blank', file: File | null) =>
    failed?.which === which ? 'error' : stage === which ? 'uploading' : file ? 'done' : 'empty';
  const zoneLabel = (which: 'reference' | 'blank') => (uploaded[which] ? 'Uploaded' : 'Selected — ready to upload');
  const count = (reference ? 1 : 0) + (blank ? 1 : 0);

  return (
    <Modal
      open={open}
      onClose={() => !status && onClose()}
      title="New template"
      description="Upload two versions of the same design: the finished example and the blank background."
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={!!status}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-template" loading={!!status}>
            Create and open designer
          </Button>
        </>
      }
    >
      <form id="new-template" onSubmit={submit} className="space-y-4">
        <Field label="Template name" htmlFor="tpl-title">
          <Input id="tpl-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Certificate of Participation — Blue" maxLength={120} />
        </Field>
        <Field label="Description" htmlFor="tpl-desc" optional>
          <Textarea id="tpl-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Shown to users when they choose a template" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Upload A — Complete reference certificate" hint="The finished example with sample name, wording, photo, signatures and QR code. Used only as a guide; never printed.">
            <UploadZone
              id="tpl-reference"
              accept={ART_ACCEPT}
              state={zoneState('reference', reference)}
              fileName={reference?.name}
              fileSize={reference?.size}
              doneLabel={zoneLabel('reference')}
              busyText={stage === 'reference' ? status : null}
              error={failed?.which === 'reference' ? failed.message : null}
              disabled={!!status}
              onPick={(f) => check(f, setReference, 'reference')}
            />
          </Field>
          <Field label="Upload B — Blank certificate design" hint="The same design without any names, wording, photos, signatures or QR codes. This is the background of every certificate.">
            <UploadZone
              id="tpl-blank"
              accept={ART_ACCEPT}
              state={zoneState('blank', blank)}
              fileName={blank?.name}
              fileSize={blank?.size}
              doneLabel={zoneLabel('blank')}
              busyText={stage === 'blank' ? status : null}
              error={failed?.which === 'blank' ? failed.message : null}
              disabled={!!status}
              onPick={(f) => check(f, setBlank, 'blank')}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">PDF, PNG, JPG or SVG, up to 25 MB each (SVG drawings are converted to a high-resolution image). Both files should have the same page size and orientation.</p>
        <p className={cx('flex items-center gap-2 text-sm font-medium', count === 2 ? 'text-emerald-700' : 'text-slate-500')}>
          {count === 2 ? <CheckCircle2 className="h-4 w-4" /> : <span className="h-4 w-4 rounded-full border-2 border-slate-300" />}
          {count} of 2 files selected{status && !stage ? ` · ${status}` : ''}
        </p>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
