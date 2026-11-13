import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Copy, Eye, EyeOff, FileUp, LayoutTemplate, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { api, fileUrl } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { Alert, Badge, Button, Card, EmptyState, Field, IconButton, Input, Menu, Modal, PageHeader, Spinner, Tabs, Textarea, useConfirm } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { emptyLayout } from '../../../shared/layout';
import type { TemplateDetail, TemplateStatus, TemplateSummary } from '../../../shared/types';
import { processArtwork, processReference } from '../../engine/artwork';
import { AccessModal } from './AccessModal';
import { checkReferenceAlignment } from '../../../shared/layout';
import { formatDateOnly } from '../../lib/format';

export function StatusBadge({ t }: { t: Pick<TemplateSummary, 'status' | 'hasUnpublishedChanges' | 'currentVersionNumber'> }) {
  if (t.status === 'archived') return <Badge tone="gray">Archived</Badge>;
  if (t.status === 'published')
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge tone="green">Published · v{t.currentVersionNumber}</Badge>
        {t.hasUnpublishedChanges && <Badge tone="amber">Changes not published yet</Badge>}
      </span>
    );
  if (t.currentVersionNumber) return <Badge tone="amber">Hidden from clients</Badge>;
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
  const [accessFor, setAccessFor] = useState<TemplateSummary | null>(null);

  const load = useCallback(() => {
    api
      .get<TemplateSummary[]>('/api/admin/templates')
      .then(setItems)
      .catch((e) => showToast(e.message, 'error'));
  }, [showToast]);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c = { all: 0, draft: 0, published: 0, archived: 0 };
    for (const t of items || []) {
      c[t.status]++;
      if (t.status !== 'archived') c.all++;
    }
    return c;
  }, [items]);

  const visible = (items || []).filter(
    (t) => (tab === 'all' ? t.status !== 'archived' : t.status === tab) && (!q || t.title.toLowerCase().includes(q.toLowerCase()))
  );

  const act = async (t: TemplateSummary, action: string) => {
    try {
      if (action === 'delete') {
        const ok = await confirm({ title: 'Delete template?', message: `"${t.title}" will be permanently deleted. This cannot be undone.`, confirmLabel: 'Delete', danger: true });
        if (!ok) return;
        await api.del(`/api/admin/templates/${t.id}`);
        showToast('Template deleted', 'success');
      } else if (action === 'archive') {
        const ok = await confirm({ title: 'Archive template?', message: 'It will no longer be available in the certificate generator. Generation history is kept. You can restore it later.', confirmLabel: 'Archive' });
        if (!ok) return;
        await api.post(`/api/admin/templates/${t.id}/archive`);
        showToast('Template archived', 'success');
      } else if (action === 'unpublish') {
        const ok = await confirm({ title: 'Hide this template?', message: 'Visitors will no longer see it in the certificate generator until you publish it again. Existing certificates stay valid.', confirmLabel: 'Hide' });
        if (!ok) return;
        await api.post(`/api/admin/templates/${t.id}/unpublish`);
        showToast('Template hidden from clients', 'success');
      } else if (action === 'republish') {
        await api.post(`/api/admin/templates/${t.id}/publish`);
        showToast('Template published — visible to everyone with the link', 'success');
      } else if (action === 'unarchive') {
        await api.post(`/api/admin/templates/${t.id}/unarchive`);
        showToast('Template restored as draft', 'success');
      } else if (action === 'duplicate') {
        const d = await api.post<TemplateDetail>(`/api/admin/templates/${t.id}/duplicate`);
        showToast('Template duplicated', 'success');
        navigate(`/admin/templates/${d.id}`);
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
        description="Certificate designs with empty boxes. Published templates are public; users write their own wording when they generate."
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
            { value: 'all', label: 'All', count: counts.all },
            { value: 'draft', label: 'Drafts', count: counts.draft },
            { value: 'published', label: 'Published', count: counts.published },
            { value: 'archived', label: 'Archived', count: counts.archived },
          ]}
        />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates" className="pl-9" aria-label="Search templates" />
        </div>
      </div>

      {!items ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title={q ? 'No matching templates' : tab === 'archived' ? 'No archived templates' : 'No templates yet'}
          description={q ? 'Try a different search.' : 'Upload a certificate design to create a reusable template.'}
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
            <Card key={t.id} className="flex flex-col overflow-hidden">
              <button onClick={() => navigate(`/admin/templates/${t.id}`)} className="block aspect-[1.414] w-full overflow-hidden border-b border-slate-100 bg-slate-100" aria-label={`Open ${t.title}`}>
                {t.thumbnailFileId ? (
                  <img src={fileUrl(t.thumbnailFileId)} alt="" className="h-full w-full object-contain" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">No artwork yet</div>
                )}
              </button>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate font-medium text-slate-900">{t.title}</h3>
                  <Menu
                    trigger={(toggle) => (
                      <IconButton label="More actions" onClick={toggle}>
                        <MoreHorizontal className="h-4 w-4" />
                      </IconButton>
                    )}
                    items={[
                      { label: 'Edit design', icon: <Pencil className="h-4 w-4" />, onClick: () => navigate(`/admin/templates/${t.id}`), disabled: t.status === 'archived' },
                      { label: 'Client access', icon: <Users className="h-4 w-4" />, onClick: () => setAccessFor(t) },
                      { label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onClick: () => act(t, 'duplicate') },
                      ...(t.status === 'published'
                        ? [{ label: 'Hide from clients', icon: <EyeOff className="h-4 w-4" />, onClick: () => act(t, 'unpublish') }]
                        : t.status === 'draft' && t.currentVersionId
                          ? [{ label: `Show to clients again (v${t.currentVersionNumber})`, icon: <Eye className="h-4 w-4" />, onClick: () => act(t, 'republish') }]
                          : []),
                      'divider' as const,
                      t.status === 'archived'
                        ? { label: 'Restore from archive', icon: <ArchiveRestore className="h-4 w-4" />, onClick: () => act(t, 'unarchive') }
                        : { label: 'Archive', icon: <Archive className="h-4 w-4" />, onClick: () => act(t, 'archive') },
                      { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => act(t, 'delete'), danger: true, disabled: (t.usageCount || 0) > 0 },
                    ]}
                  />
                </div>
                <div className="mt-2">
                  <StatusBadge t={t} />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {t.boxCount} {t.boxCount === 1 ? 'box' : 'boxes'} · {t.status !== 'published' ? 'Not visible to clients' : t.visibility === 'all' ? 'All clients' : 'Assigned clients only'} · Updated {formatDateOnly(t.updatedAt)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewTemplateModal open={newOpen} onClose={() => setNewOpen(false)} />
      {accessFor && <AccessModal templateId={accessFor.id} title={accessFor.title} onClose={() => setAccessFor(null)} onSaved={load} />}
    </>
  );
}

function FileDrop({ label, hint, file, onPick, id }: { label: string; hint: string; file: File | null; onPick: (f: File | undefined) => void; id: string }) {
  const [drag, setDrag] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onPick(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ${drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400'}`}
      >
        <FileUp className="h-6 w-6 text-slate-400" />
        {file ? (
          <span className="font-medium text-slate-800">{file.name}</span>
        ) : (
          <span className="text-slate-600">
            <span className="font-medium text-brand-700">Choose a file</span> or drag it here
          </span>
        )}
        <input id={id} type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => onPick(e.target.files?.[0])} />
      </label>
    </Field>
  );
}

export function NewTemplateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigate } = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState<File | null>(null);
  const [blank, setBlank] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = (f: File | undefined, set: (f: File) => void) => {
    if (!f) return;
    setError(null);
    if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) return setError('Upload a PDF, PNG or JPG file.');
    set(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b(blank|complete|reference|sample)\b/gi, '').trim());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Enter a template name.');
    if (!blank) return setError('Upload the blank certificate design (Upload B).');
    if (!reference) return setError('Upload the complete reference certificate (Upload A).');
    setError(null);
    try {
      let draft = emptyLayout();
      draft = { ...draft, ...(await processArtwork(blank, setStatus)) };
      draft = { ...draft, ...(await processReference(reference, setStatus)) };
      setStatus('Creating template…');
      const t = await api.post<TemplateDetail>('/api/admin/templates', { title, description, draft });
      onClose();
      setTitle('');
      setDescription('');
      setBlank(null);
      setReference(null);
      const align = checkReferenceAlignment(t.draft);
      navigate(`/admin/templates/${t.id}${align.problems.length ? '?align=1' : ''}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStatus(null);
    }
  };

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
          <Textarea id="tpl-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Shown to clients when they choose a template" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <FileDrop
            id="tpl-reference"
            label="Upload A — Complete reference certificate"
            hint="The finished example with sample name, wording, photo, signatures and QR code. Used only as a guide; never printed."
            file={reference}
            onPick={(f) => check(f, setReference)}
          />
          <FileDrop
            id="tpl-blank"
            label="Upload B — Blank certificate design"
            hint="The same design without any names, wording, photos, signatures or QR codes. This is the background of every certificate."
            file={blank}
            onPick={(f) => check(f, setBlank)}
          />
        </div>
        <p className="text-xs text-slate-500">PDF, PNG or JPG, up to 25 MB each. Both files should have the same page size and orientation.</p>
        {status && <p className="text-sm text-slate-600">{status}</p>}
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}
