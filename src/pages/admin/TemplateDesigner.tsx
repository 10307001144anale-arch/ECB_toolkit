import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  History,
  ImageIcon,
  ImagePlus,
  Loader2,
  Maximize,
  Minus,
  MoreHorizontal,
  MousePointer2,
  PenLine,
  Plus,
  QrCode,
  Redo2,
  Rocket,
  Save,
  Sparkles,
  Type,
  Undo2,
  Users,
  Copy,
  Archive,
} from 'lucide-react';
import { api, fetchFile, getConfig, type AppConfig } from '../../lib/api';
import { setNavigationBlocker, useRouter } from '../../lib/router';
import { Alert, Badge, Button, Field, IconButton, Input, Menu, Modal, Spinner, Textarea, cx, useConfirm } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { newBox, publishProblems, sanitizeLayout, uniqueKey } from '../../../shared/layout';
import type { BoxType, TemplateBox, TemplateDetail, TemplateLayout, TemplateVersion } from '../../../shared/types';
import { BOX_STYLE, DesignCanvas, type Rect, type Tool } from './designer/DesignCanvas';
import { BoxProperties, FontManager, Section } from './designer/BoxProperties';
import { StatusBadge } from './TemplatesPage';
import { processArtwork } from '../../engine/artwork';
import { CertificateRenderer } from '../../engine/renderer';
import { renderPdfPage } from '../../engine/pdfRaster';
import { formatDateTime } from '../../lib/format';

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode; key: string }[] = [
  { tool: 'select', label: 'Select & move', icon: <MousePointer2 className="h-4 w-4" />, key: 'V' },
  { tool: 'text', label: 'Text box', icon: <Type className="h-4 w-4" />, key: 'T' },
  { tool: 'qr', label: 'QR code box', icon: <QrCode className="h-4 w-4" />, key: 'Q' },
  { tool: 'photo', label: 'Photo box', icon: <ImageIcon className="h-4 w-4" />, key: 'P' },
  { tool: 'signature', label: 'Signature box', icon: <PenLine className="h-4 w-4" />, key: 'S' },
];

const uid = () => `box_${Math.random().toString(36).slice(2, 10)}`;

/** A box that existed when the template was last loaded from a published version. */
function selectedWasPublished(tpl: TemplateDetail, boxId: string) {
  return tpl.draft.boxes.some((b) => b.id === boxId);
}

export default function TemplateDesigner({ id }: { id: string }) {
  const { navigate } = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [tpl, setTpl] = useState<TemplateDetail | null>(null);
  const [layout, setLayout] = useState<TemplateLayout | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [fitScale, setFitScale] = useState(1);
  const [preview, setPreview] = useState<{ url: string; page: number } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [artBusy, setArtBusy] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const undo = useRef<TemplateLayout[]>([]);
  const redo = useRef<TemplateLayout[]>([]);
  const committed = useRef<TemplateLayout | null>(null);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const applyDetail = useCallback((d: TemplateDetail) => {
    setTpl(d);
    setLayout(d.draft);
    committed.current = d.draft;
    setTitle(d.title);
    setDescription(d.description);
    setDirty(false);
    document.title = `${d.title} · Designer · CertiGen`;
  }, []);

  useEffect(() => {
    api
      .get<TemplateDetail>(`/api/admin/templates/${id}`)
      .then(applyDetail)
      .catch((e) => setLoadError(e.message));
  }, [id, applyDetail]);

  // Warn about unsaved changes.
  useEffect(() => {
    if (!dirty) {
      setNavigationBlocker(null);
      return;
    }
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBefore);
    setNavigationBlocker(() => window.confirm('You have unsaved changes. Leave without saving?'));
    return () => {
      window.removeEventListener('beforeunload', onBefore);
      setNavigationBlocker(null);
    };
  }, [dirty]);

  /** Updates the layout. commit=true records an undo step. */
  const update = useCallback((fn: (l: TemplateLayout) => TemplateLayout, commit = true) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (commit) {
        if (committed.current && committed.current !== next) {
          undo.current.push(committed.current);
          if (undo.current.length > 60) undo.current.shift();
          redo.current = [];
        }
        committed.current = next;
      }
      return next;
    });
    setDirty(true);
    setPreview(null);
  }, []);

  const doUndo = useCallback(() => {
    const prev = undo.current.pop();
    if (!prev || !layout) return;
    redo.current.push(committed.current || layout);
    committed.current = prev;
    setLayout(prev);
    setDirty(true);
    setPreview(null);
  }, [layout]);
  const doRedo = useCallback(() => {
    const next = redo.current.pop();
    if (!next || !layout) return;
    undo.current.push(committed.current || layout);
    committed.current = next;
    setLayout(next);
    setDirty(true);
    setPreview(null);
  }, [layout]);

  const selected = layout?.boxes.find((b) => b.id === selectedId) || null;

  const patchBox = useCallback(
    (boxId: string, patch: Partial<TemplateBox>, commit = true) => update((l) => ({ ...l, boxes: l.boxes.map((b) => (b.id === boxId ? ({ ...b, ...patch } as TemplateBox) : b)) }), commit),
    [update]
  );

  const createBox = useCallback(
    (type: BoxType, rect: Rect) => {
      if (!layout) return;
      const id = uid();
      const taken = new Set(layout.boxes.map((b) => b.key));
      const box = newBox(type, id, { page, ...rect }, taken);
      update((l) => ({ ...l, boxes: [...l.boxes, box] }));
      setSelectedId(id);
      setTool('select');
    },
    [layout, page, update]
  );

  const deleteBox = useCallback(
    (boxId: string) => {
      update((l) => ({ ...l, boxes: l.boxes.filter((b) => b.id !== boxId) }));
      setSelectedId(null);
    },
    [update]
  );

  const duplicateBox = useCallback(
    (boxId: string) => {
      if (!layout) return;
      const b = layout.boxes.find((x) => x.id === boxId);
      if (!b) return;
      const id = uid();
      const taken = new Set(layout.boxes.map((x) => x.key));
      const copy = { ...b, id, key: uniqueKey(b.key, taken), label: `${b.label} copy`, x: Math.min(100 - b.w, b.x + 2), y: Math.min(100 - b.h, b.y + 2) } as TemplateBox;
      update((l) => ({ ...l, boxes: [...l.boxes, copy] }));
      setSelectedId(id);
    },
    [layout, update]
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!layout) return false;
    if (!title.trim()) {
      showToast('Enter a template name before saving.', 'error');
      return false;
    }
    const keys = layout.boxes.map((b) => b.key);
    if (keys.some((k) => !/^[a-z][a-z0-9_]{0,47}$/.test(k)) || new Set(keys).size !== keys.length) {
      showToast('Each box needs a unique internal key (lower-case letters, numbers, underscores).', 'error');
      return false;
    }
    setSaving(true);
    try {
      const d = await api.put<TemplateDetail>(`/api/admin/templates/${id}`, { title, description, draft: layout });
      setTpl(d);
      committed.current = d.draft;
      setLayout(d.draft);
      setDirty(false);
      showToast('Draft saved', 'success');
      return true;
    } catch (e: any) {
      showToast(e.message, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  }, [layout, title, description, id, showToast]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (typing || document.querySelector('[role="dialog"]')) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        doRedo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && selected) {
        e.preventDefault();
        duplicateBox(selected.id);
        return;
      }
      if (mod) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        deleteBox(selected.id);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setTool('select');
      } else if (selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        patchBox(selected.id, {
          x: Math.round(Math.min(100 - selected.w, Math.max(0, selected.x + dx)) * 100) / 100,
          y: Math.round(Math.min(100 - selected.h, Math.max(0, selected.y + dy)) * 100) / 100,
        });
      } else {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (t && layout?.pages.length) setTool(t.tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, doUndo, doRedo, selected, duplicateBox, deleteBox, patchBox, layout]);

  const replaceArtwork = async (file: File | undefined) => {
    if (!file || !layout) return;
    if (layout.boxes.length) {
      const ok = await confirm({ title: 'Replace artwork?', message: 'Boxes keep their positions relative to the page. Check them after replacing.', confirmLabel: 'Replace' });
      if (!ok) return;
    }
    try {
      const art = await processArtwork(file, setArtBusy);
      update((l) => ({ ...l, ...art, boxes: l.boxes.map((b) => (b.page >= art.pages.length ? { ...b, page: art.pages.length - 1 } : b)) }));
      setPage(0);
      showToast('Artwork uploaded. Remember to save.', 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setArtBusy(null);
    }
  };

  const togglePreview = async () => {
    if (preview) return setPreview(null);
    if (!layout) return;
    setPreviewBusy(true);
    try {
      const clean = sanitizeLayout(layout);
      const renderer = await CertificateRenderer.load(clean, fetchFile);
      const texts: Record<string, string> = {};
      const qr: Record<string, string> = {};
      const images: Record<string, Blob | null> = {};
      for (const b of clean.boxes) {
        if (b.type === 'text') texts[b.key] = b.defaultText || (b.multiline ? `${b.label}\nSecond line of sample text` : `Sample: ${b.label}`);
        if (b.type === 'qr') qr[b.key] = `${window.location.origin}/verify/CG-SAMP-LE00-0000`;
        if (b.type === 'signature') images[b.key] = renderer.fixedSignature(b.key);
        if (b.type === 'photo') images[b.key] = null;
      }
      const { bytes } = await renderer.renderSingle({ texts, qr, images }, { placeholders: true });
      const canvas = await renderPdfPage(bytes, page, 1600, undefined, 1);
      setPreview({ url: canvas.toDataURL('image/png'), page });
    } catch (e: any) {
      showToast(`Preview failed: ${e.message}`, 'error');
    } finally {
      setPreviewBusy(false);
    }
  };

  const zoomBy = (f: number) => setZoom((z) => Math.min(4, Math.max(0.1, (z === 'fit' ? fitScale : z) * f)));
  const scale = zoom === 'fit' ? fitScale : zoom;

  const problems = useMemo(() => (layout ? publishProblems(layout) : []), [layout]);

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <Alert tone="error" title="Could not open the template">
          {loadError}
        </Alert>
        <Button onClick={() => navigate('/admin/templates')}>Back to templates</Button>
      </div>
    );
  }
  if (!tpl || !layout) return <Spinner className="min-h-screen" label="Opening designer…" />;

  const archived = tpl.status === 'archived';
  const pageBoxes = layout.boxes.filter((b) => b.page === page);

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3">
        <IconButton label="Back to templates" onClick={() => navigate('/admin/templates')}>
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          aria-label="Template name"
          className="h-9 max-w-xs border-transparent font-medium shadow-none hover:border-slate-300"
          maxLength={120}
        />
        <div className="hidden md:block">
          <StatusBadge t={{ ...tpl, hasUnpublishedChanges: tpl.hasUnpublishedChanges || dirty }} />
        </div>
        <span className="hidden text-xs text-slate-500 lg:inline">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <IconButton label="Undo (Ctrl+Z)" onClick={doUndo} disabled={!undo.current.length}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" onClick={doRedo} disabled={!redo.current.length}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <Button size="sm" variant={preview ? 'subtle' : 'ghost'} onClick={togglePreview} loading={previewBusy} disabled={!layout.pages.length} icon={preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}>
            {preview ? 'Exit preview' : 'Preview'}
          </Button>
          <Button size="sm" onClick={save} loading={saving} disabled={archived} icon={<Save className="h-4 w-4" />}>
            Save draft
          </Button>
          <Button size="sm" variant="primary" disabled={archived} onClick={() => setPublishOpen(true)} icon={<Rocket className="h-4 w-4" />}>
            Publish
          </Button>
          <Menu
            trigger={(t) => (
              <IconButton label="More" onClick={t}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            )}
            items={[
              { label: 'Version history', icon: <History className="h-4 w-4" />, onClick: () => setVersionsOpen(true) },
              {
                label: 'Duplicate template',
                icon: <Copy className="h-4 w-4" />,
                onClick: async () => {
                  if (dirty && !(await save())) return;
                  const d = await api.post<TemplateDetail>(`/api/admin/templates/${id}/duplicate`);
                  navigate(`/admin/templates/${d.id}`);
                },
              },
              {
                label: 'Archive template',
                icon: <Archive className="h-4 w-4" />,
                disabled: archived,
                onClick: async () => {
                  if (!(await confirm({ title: 'Archive template?', message: 'It will no longer be available in the certificate generator. History is kept.', confirmLabel: 'Archive' }))) return;
                  await api.post(`/api/admin/templates/${id}/archive`);
                  setDirty(false);
                  navigate('/admin/templates');
                },
              },
            ]}
          />
        </div>
      </header>

      {archived && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          This template is archived and read-only. Restore it from the Templates page to edit it.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-3">
            <label className={cx('flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium', layout.pages.length ? 'border-slate-300 text-slate-700 hover:bg-slate-50' : 'border-brand-600 bg-brand-700 text-white hover:bg-brand-800')}>
              {artBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {artBusy ? 'Uploading…' : layout.pages.length ? 'Replace artwork' : 'Upload artwork'}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only" disabled={!!artBusy || archived} onChange={(e) => replaceArtwork(e.target.files?.[0])} />
            </label>
            {artBusy && <p className="mt-1.5 text-xs text-slate-500">{artBusy}</p>}
          </div>
          <div className="border-b border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Add a box</p>
            <div className="grid grid-cols-1 gap-1">
              {TOOLS.map((t) => (
                <button
                  key={t.tool}
                  onClick={() => setTool(t.tool)}
                  disabled={!layout.pages.length || archived || (!!preview && t.tool !== 'select')}
                  className={cx(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm disabled:opacity-40',
                    tool === t.tool ? 'bg-brand-50 font-medium text-brand-800 ring-1 ring-brand-200' : 'text-slate-700 hover:bg-slate-50'
                  )}
                  title={`${t.label} (${t.key})`}
                >
                  {t.icon}
                  <span className="flex-1 text-left">{t.label}</span>
                  <kbd className="rounded border border-slate-200 px-1 text-[10px] text-slate-400">{t.key}</kbd>
                </button>
              ))}
            </div>
            {tool !== 'select' && <p className="mt-2 text-xs text-slate-500">Drag on the certificate to draw the box, or click to place it.</p>}
            {config?.aiDetectionAvailable && layout.pages.length > 0 && (
              <Button size="sm" variant="ghost" className="mt-2 w-full justify-start" icon={<Sparkles className="h-4 w-4" />} onClick={() => setAiOpen(true)} disabled={archived}>
                Suggest boxes with AI
              </Button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Elements on this page ({pageBoxes.length})</p>
            {pageBoxes.length === 0 ? (
              <p className="text-xs text-slate-500">{layout.pages.length ? 'No boxes yet. Choose a box type above, then draw it on the certificate.' : 'Upload the certificate artwork to begin.'}</p>
            ) : (
              <ul className="space-y-0.5">
                {pageBoxes.map((b) => (
                  <li key={b.id}>
                    <button
                      onClick={() => setSelectedId(b.id)}
                      className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm', b.id === selectedId ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50')}
                    >
                      <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded text-white', BOX_STYLE[b.type].chip)}>{BOX_STYLE[b.type].icon}</span>
                      <span className="truncate">{b.label}</span>
                      {b.required && <span className="ml-auto text-[10px] text-slate-400">required</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Centre */}
        <section className="relative flex min-w-0 flex-1 flex-col">
          {layout.pages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <label className="flex max-w-md cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-10 py-14 text-center hover:border-brand-400">
                <ImagePlus className="h-8 w-8 text-slate-400" />
                <span className="text-base font-semibold text-slate-900">Upload the certificate design</span>
                <span className="text-sm text-slate-500">PDF, PNG or JPG. The original artwork is never changed — you only draw empty boxes on top of it.</span>
                <span className="mt-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white">{artBusy || 'Choose file'}</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="sr-only" onChange={(e) => replaceArtwork(e.target.files?.[0])} />
              </label>
            </div>
          ) : (
            <DesignCanvas
              layout={layout}
              page={page}
              zoom={zoom}
              onFitScale={setFitScale}
              tool={archived ? 'select' : tool}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCreate={createBox}
              onRectChange={(bid, rect, commit) => !archived && patchBox(bid, rect, commit)}
              previewUrl={preview && preview.page === page ? preview.url : null}
            />
          )}
          {layout.pages.length > 0 && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-200 bg-white/95 px-2 py-1 shadow-md">
              {layout.pages.length > 1 && (
                <>
                  <IconButton label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </IconButton>
                  <span className="px-1 text-xs text-slate-600">
                    Page {page + 1} / {layout.pages.length}
                  </span>
                  <IconButton label="Next page" disabled={page >= layout.pages.length - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </IconButton>
                  <span className="mx-1 h-5 w-px bg-slate-200" />
                </>
              )}
              <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
                <Minus className="h-4 w-4" />
              </IconButton>
              <span className="w-12 text-center text-xs tabular-nums text-slate-600">{Math.round(scale * 100)}%</span>
              <IconButton label="Zoom in" onClick={() => zoomBy(1.2)}>
                <Plus className="h-4 w-4" />
              </IconButton>
              <IconButton label="Fit to screen" onClick={() => setZoom('fit')}>
                <Maximize className="h-4 w-4" />
              </IconButton>
            </div>
          )}
          {preview && (
            <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-white">
              Preview with default wording (sample text where a box has none)
            </div>
          )}
        </section>

        {/* Right sidebar */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white">
          {selected ? (
            <BoxProperties
              key={selected.id}
              box={selected}
              layout={layout}
              published={!!tpl.currentVersionId && !!layout.boxes.length && selectedWasPublished(tpl, selected.id)}
              onChange={(patch, commit) => !archived && patchBox(selected.id, patch, commit)}
              onDelete={() => deleteBox(selected.id)}
              onDuplicate={() => duplicateBox(selected.id)}
            />
          ) : (
            <div className="text-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <p className="font-semibold text-slate-900">Template settings</p>
                <p className="text-xs text-slate-500">Select a box to edit its properties.</p>
              </div>
              <Section title="Details">
                <Field label="Description" optional hint="Shown to users when they choose a template.">
                  <Textarea
                    rows={3}
                    value={description}
                    maxLength={500}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setDirty(true);
                    }}
                  />
                </Field>
                {layout.pages.length > 0 && (
                  <p className="text-xs text-slate-500">
                    {layout.artworkMime === 'application/pdf' ? 'PDF' : layout.artworkMime === 'image/png' ? 'PNG' : 'JPG'} artwork · {layout.pages.length} page{layout.pages.length > 1 ? 's' : ''} ·{' '}
                    {Math.round((layout.pages[0].width / 72) * 25.4)} × {Math.round((layout.pages[0].height / 72) * 25.4)} mm
                  </p>
                )}
              </Section>
              <Section title="Uploaded fonts" defaultOpen={layout.fonts.length > 0}>
                <p className="text-xs text-slate-500">Upload your organisation's fonts if the built-in ones don't match the design.</p>
                <FontManager fonts={layout.fonts} onChange={(fonts) => update((l) => ({ ...l, fonts }))} />
              </Section>
              <Section title="Before publishing">
                {problems.length === 0 ? (
                  <Alert tone="success">Ready to publish.</Alert>
                ) : (
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-slate-500">Default wording is optional. Clients can keep it or rewrite it for their own batch; the template itself never changes.</p>
              </Section>
            </div>
          )}
        </aside>
      </div>

      {publishOpen && (
        <PublishModal
          tpl={tpl}
          problems={problems}
          dirty={dirty}
          onClose={() => setPublishOpen(false)}
          onPublish={async (notes) => {
            if (dirty && !(await save())) return;
            try {
              const d = await api.post<TemplateDetail>(`/api/admin/templates/${id}/publish`, { notes });
              applyDetail(d);
              setPublishOpen(false);
              showToast(`Published version ${d.currentVersionNumber}`, 'success');
            } catch (e: any) {
              showToast(e.message, 'error');
            }
          }}
        />
      )}
      {versionsOpen && (
        <VersionsModal
          templateId={id}
          currentVersionId={tpl.currentVersionId}
          onClose={() => setVersionsOpen(false)}
          onRestore={async (v) => {
            if (dirty && !(await confirm({ title: 'Discard unsaved changes?', message: 'Restoring a version replaces the current draft.', confirmLabel: 'Restore', danger: true }))) return;
            const d = await api.post<TemplateDetail>(`/api/admin/templates/${id}/versions/${v.id}/restore`);
            applyDetail(d);
            undo.current = [];
            redo.current = [];
            setVersionsOpen(false);
            showToast(`Version ${v.versionNumber} restored into the draft. Publish to make it live.`, 'success');
          }}
        />
      )}
      {aiOpen && (
        <AiDetectModal
          layout={layout}
          page={page}
          onClose={() => setAiOpen(false)}
          onBoxes={(boxes) => {
            const taken = new Set(layout.boxes.map((b) => b.key));
            const created = boxes.map((s) => {
              const b = newBox(s.type, uid(), { page, x: s.x, y: s.y, w: Math.max(1, s.w), h: Math.max(1, s.h) }, taken);
              taken.add(b.key);
              if (s.label) {
                b.label = s.label;
                const k = uniqueKey(s.label, new Set([...taken].filter((x) => x !== b.key)));
                taken.delete(b.key);
                b.key = k;
                taken.add(k);
              }
              return b;
            });
            update((l) => sanitizeLayout({ ...l, boxes: [...l.boxes, ...created] }));
            showToast(`${created.length} boxes added. Check their positions before saving.`, 'success');
          }}
        />
      )}
    </div>
  );
}

function PublishModal({ tpl, problems, dirty, onClose, onPublish }: { tpl: TemplateDetail; problems: string[]; dirty: boolean; onClose: () => void; onPublish: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const next = (tpl.currentVersionNumber || 0) + (tpl.hasUnpublishedChanges || dirty || !tpl.currentVersionNumber ? 1 : 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={tpl.currentVersionNumber ? `Publish version ${next}` : 'Publish template'}
      description="Published templates are public: anyone using the certificate generator can choose them."
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

function VersionsModal({ templateId, currentVersionId, onClose, onRestore }: { templateId: string; currentVersionId: string | null; onClose: () => void; onRestore: (v: TemplateVersion) => void }) {
  const [versions, setVersions] = useState<(TemplateVersion & { batchCount: number })[] | null>(null);
  useEffect(() => {
    api.get<(TemplateVersion & { batchCount: number })[]>(`/api/admin/templates/${templateId}/versions`).then(setVersions);
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

function AiDetectModal({ layout, page, onClose, onBoxes }: { layout: TemplateLayout; page: number; onClose: () => void; onBoxes: (b: { type: BoxType; label: string; x: number; y: number; w: number; h: number }[]) => void }) {
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
      const r = await api.post<{ boxes: any[] }>('/api/admin/ai/detect-boxes', { imageBase64: dataUrl.split(',')[1], mimeType, consent: true });
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
