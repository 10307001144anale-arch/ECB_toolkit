// Super Admin template editor — a design-tool workspace:
//   top bar (name, view toggles, align/distribute, undo/redo, save, publish),
//   slim tool rail (select, hand, zoom, field tools), central artboard with
//   rulers / guides / grid / snapping, right panel (properties, layers,
//   document) and a status bar (zoom, cursor position, selection, pages).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Archive,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  Grid3x3,
  Hand,
  History,
  ImageIcon,
  ImagePlus,
  Layers,
  Loader2,
  Magnet,
  Maximize,
  MoreHorizontal,
  MousePointer2,
  PenLine,
  QrCode,
  Redo2,
  Rocket,
  Ruler as RulerIcon,
  Save,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  FileText,
} from 'lucide-react';
import { api, fetchFile, getConfig, type AppConfig } from '../../lib/api';
import { setNavigationBlocker, useRouter } from '../../lib/router';
import { usePortalAccent } from '../../lib/theme';
import { Alert, Button, Field, IconButton, Menu, Segmented, Spinner, Textarea, Toggle, cx, useConfirm } from '../shared/ui';
import { PortalBadge } from '../shared/AppShell';
import { UploadZone } from '../shared/UploadZone';
import { useToast } from '../../context/ToastContext';
import { checkReferenceAlignment, newBox, newDateBox, publishProblems, sanitizeLayout, uniqueKey } from '../../../shared/layout';
import type { BoxType, Guide, TemplateBox, TemplateDetail, TemplateLayout } from '../../../shared/types';
import { BoxProperties, FontManager, Section } from './designer/BoxProperties';
import { LayersPanel } from './designer/LayersPanel';
import { RULER, Workspace, type BoxPatch, type Viewport, type WorkspaceControl, type WorkTool } from './designer/Workspace';
import { AiDetectModal, PublishModal, VersionsModal } from './designer/DesignerModals';
import { DeleteTemplateModal, ensureReferenceImage } from './TemplateDialogs';
import { boxToPt, DEFAULT_GRID, fmtUnit, ptToBox, ptToUnit, unionRect, unitStep, unitToPt, UNITS, type Unit } from './designer/units';
import { StatusBadge } from './TemplatesPage';
import { processArtwork, processReference } from '../../engine/artwork';
import { realisticCertificate } from '../../engine/samples';
import { emptyContent } from '../../engine/batch';
import { CertificateRenderer } from '../../engine/renderer';
import { renderPdfPage } from '../../engine/pdfRaster';

const TOOLS: { tool: WorkTool; label: string; icon: React.ReactNode; key: string; draws?: boolean }[] = [
  { tool: 'select', label: 'Select', icon: <MousePointer2 className="h-[18px] w-[18px]" />, key: 'V' },
  { tool: 'hand', label: 'Hand (hold Space)', icon: <Hand className="h-[18px] w-[18px]" />, key: 'H' },
  { tool: 'zoom', label: 'Zoom (Alt+click to zoom out)', icon: <ZoomIn className="h-[18px] w-[18px]" />, key: 'Z' },
  { tool: 'text', label: 'Text field', icon: <Type className="h-[18px] w-[18px]" />, key: 'T', draws: true },
  { tool: 'date', label: 'Date field', icon: <CalendarDays className="h-[18px] w-[18px]" />, key: 'D', draws: true },
  { tool: 'qr', label: 'QR code', icon: <QrCode className="h-[18px] w-[18px]" />, key: 'Q', draws: true },
  { tool: 'photo', label: 'Photo', icon: <ImageIcon className="h-[18px] w-[18px]" />, key: 'P', draws: true },
  { tool: 'signature', label: 'Signature', icon: <PenLine className="h-[18px] w-[18px]" />, key: 'S', draws: true },
];

const uid = () => `box_${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------- per-browser view preferences

interface Prefs {
  rulers: boolean;
  grid: boolean;
  snap: boolean;
  unit: Unit;
  gridPt: number;
}
const PREFS_KEY = 'certigen.designer';
function readPrefs(): Prefs {
  const d: Prefs = { rulers: true, grid: false, snap: true, unit: 'mm', gridPt: DEFAULT_GRID.mm };
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      rulers: typeof v.rulers === 'boolean' ? v.rulers : d.rulers,
      grid: typeof v.grid === 'boolean' ? v.grid : d.grid,
      snap: typeof v.snap === 'boolean' ? v.snap : d.snap,
      unit: UNITS.includes(v.unit) ? v.unit : d.unit,
      gridPt: Number(v.gridPt) > 0 ? Number(v.gridPt) : d.gridPt,
    };
  } catch {
    return d;
  }
}

/** Copied fields survive switching templates within this browser tab. */
let clipboard: TemplateBox[] = [];

export default function TemplateDesigner({ id }: { id: string }) {
  usePortalAccent('superadmin');
  const { navigate } = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [tpl, setTpl] = useState<TemplateDetail | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [layout, setLayout] = useState<TemplateLayout | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<WorkTool>('select');
  const [page, setPage] = useState(0);
  const [vp, setVp] = useState<Viewport>({ zoom: 1, panX: 0, panY: 0 });
  const control = useRef<WorkspaceControl | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);
  const [panel, setPanel] = useState<'properties' | 'layers' | 'document'>('document');
  const [preview, setPreview] = useState<{ url: string; page: number } | null>(null);
  const [view, setView] = useState<'blank' | 'reference' | 'overlay'>('blank');
  const viewInit = useRef(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [artBusy, setArtBusy] = useState<string | null>(null);
  /** Upload feedback for the Design files panel. */
  const [uploading, setUploading] = useState<'reference' | 'blank' | null>(null);
  const [uploadedNow, setUploadedNow] = useState<Partial<Record<'reference' | 'blank', { name: string; size: number }>>>({});
  const [uploadError, setUploadError] = useState<{ which: 'reference' | 'blank'; message: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const undo = useRef<TemplateLayout[]>([]);
  const redo = useRef<TemplateLayout[]>([]);
  const committed = useRef<TemplateLayout | null>(null);
  const [, forceRender] = useState(0);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: the choice lasts for this visit */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const applyDetail = useCallback((d: TemplateDetail) => {
    if (!viewInit.current) {
      viewInit.current = true;
      if (d.draft.referenceFileId) setView('overlay');
    }
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
      .get<TemplateDetail>(`/api/superadmin/templates/${id}`)
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

  // ---------------------------------------------------------------- history

  /** Updates the layout. commit=true records an undo step (drags send several uncommitted updates, then one commit). */
  const update = useCallback((fn: (l: TemplateLayout) => TemplateLayout, commit = true) => {
    setLayout((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      if (commit) {
        if (committed.current && committed.current !== next) {
          undo.current.push(committed.current);
          if (undo.current.length > 100) undo.current.shift();
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
    forceRender((n) => n + 1);
  }, [layout]);
  const doRedo = useCallback(() => {
    const next = redo.current.pop();
    if (!next || !layout) return;
    undo.current.push(committed.current || layout);
    committed.current = next;
    setLayout(next);
    setDirty(true);
    setPreview(null);
    forceRender((n) => n + 1);
  }, [layout]);

  // ---------------------------------------------------------------- box operations

  const selected = useMemo(() => (layout ? layout.boxes.filter((b) => selection.includes(b.id)) : []), [layout, selection]);
  const single = selected.length === 1 ? selected[0] : null;
  const archived = tpl?.status === 'archived';

  const select = useCallback((ids: string[]) => {
    setSelection(ids);
    if (ids.length) setPanel((p) => (p === 'document' ? 'properties' : p));
  }, []);

  const patchBoxes = useCallback(
    (patches: BoxPatch[] | { id: string; patch: Partial<TemplateBox> }[], commit = true) =>
      update((l) => {
        if (!patches.length) return l;
        const map = new Map(patches.map((p: any) => [p.id, 'patch' in p ? p.patch : p]));
        return { ...l, boxes: l.boxes.map((b) => (map.has(b.id) ? ({ ...b, ...map.get(b.id), id: b.id } as TemplateBox) : b)) };
      }, commit),
    [update]
  );
  const patchBox = useCallback((boxId: string, patch: Partial<TemplateBox>, commit = true) => patchBoxes([{ id: boxId, patch }], commit), [patchBoxes]);

  const createBox = useCallback(
    (type: BoxType, rect: { x: number; y: number; w: number; h: number }) => {
      if (!layout) return;
      const nid = uid();
      const taken = new Set(layout.boxes.map((b) => b.key));
      const box = tool === 'date' && type === 'text' ? newDateBox(nid, { page, ...rect }, taken) : newBox(type, nid, { page, ...rect }, taken);
      update((l) => ({ ...l, boxes: [...l.boxes, box] }));
      select([nid]);
      setPanel('properties');
      setTool('select');
    },
    [layout, page, update, tool, select]
  );

  const deleteSelected = useCallback(() => {
    if (!selection.length) return;
    update((l) => ({ ...l, boxes: l.boxes.filter((b) => !selection.includes(b.id) || b.locked) }));
    setSelection([]);
  }, [selection, update]);

  const pasteBoxes = useCallback(
    (source: TemplateBox[], offsetPct = 2) => {
      if (!layout || !source.length) return;
      const taken = new Set(layout.boxes.map((x) => x.key));
      const copies = source.map((b) => {
        const key = uniqueKey(b.key, taken);
        taken.add(key);
        return {
          ...b,
          id: uid(),
          key,
          label: b.label.endsWith(' copy') ? b.label : `${b.label} copy`,
          page: Math.min(page, layout.pages.length - 1),
          locked: false,
          hidden: false,
          x: Math.min(100 - b.w, b.x + offsetPct),
          y: Math.min(100 - b.h, b.y + offsetPct),
        } as TemplateBox;
      });
      update((l) => ({ ...l, boxes: [...l.boxes, ...copies] }));
      select(copies.map((c) => c.id));
    },
    [layout, page, update, select]
  );

  const reorder = useCallback((ids: string[]) => update((l) => ({ ...l, boxes: ids.map((i) => l.boxes.find((b) => b.id === i)!).filter(Boolean) })), [update]);
  const setGuides = useCallback((guides: Guide[], commit: boolean) => update((l) => ({ ...l, guides }), commit), [update]);

  // ---------------------------------------------------------------- align & distribute

  const pg = layout?.pages[page];
  const align = useCallback(
    (mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') => {
      if (!layout || !pg) return;
      const items = selected.filter((b) => !b.locked && b.page === page);
      if (!items.length) return;
      const rects = items.map((b) => ({ b, r: boxToPt(b, pg) }));
      // One field aligns to the page; several align to their combined bounds.
      const ref = items.length === 1 ? { x: 0, y: 0, w: pg.width, h: pg.height } : unionRect(rects.map((x) => x.r))!;
      patchBoxes(
        rects.map(({ b, r }) => {
          const n = { ...r };
          if (mode === 'left') n.x = ref.x;
          if (mode === 'hcenter') n.x = ref.x + ref.w / 2 - r.w / 2;
          if (mode === 'right') n.x = ref.x + ref.w - r.w;
          if (mode === 'top') n.y = ref.y;
          if (mode === 'vcenter') n.y = ref.y + ref.h / 2 - r.h / 2;
          if (mode === 'bottom') n.y = ref.y + ref.h - r.h;
          return { id: b.id, ...ptToBox(n, pg) };
        })
      );
    },
    [layout, pg, selected, page, patchBoxes]
  );

  const distribute = useCallback(
    (axis: 'x' | 'y') => {
      if (!pg) return;
      const items = selected.filter((b) => !b.locked && b.page === page).map((b) => ({ b, r: boxToPt(b, pg) }));
      if (items.length < 3) return;
      items.sort((a, c) => (axis === 'x' ? a.r.x - c.r.x : a.r.y - c.r.y));
      const first = items[0].r;
      const last = items[items.length - 1].r;
      const total = axis === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y;
      const sizes = items.reduce((n, it) => n + (axis === 'x' ? it.r.w : it.r.h), 0);
      const gap = (total - sizes) / (items.length - 1);
      let pos = axis === 'x' ? first.x : first.y;
      patchBoxes(
        items.map(({ b, r }) => {
          const n = { ...r, ...(axis === 'x' ? { x: pos } : { y: pos }) };
          pos += (axis === 'x' ? r.w : r.h) + gap;
          return { id: b.id, ...ptToBox(n, pg) };
        })
      );
    },
    [pg, selected, page, patchBoxes]
  );

  // ---------------------------------------------------------------- save

  const save = useCallback(async (): Promise<boolean> => {
    if (!layout) return false;
    if (!title.trim()) {
      showToast('Enter a template name before saving.', 'error');
      return false;
    }
    const keys = layout.boxes.map((b) => b.key);
    if (keys.some((k) => !/^[a-z][a-z0-9_]{0,47}$/.test(k)) || new Set(keys).size !== keys.length) {
      showToast('Each field needs a unique internal key (lower-case letters, numbers, underscores).', 'error');
      return false;
    }
    setSaving(true);
    try {
      const d = await api.put<TemplateDetail>(`/api/superadmin/templates/${id}`, { title, description, draft: layout });
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

  // ---------------------------------------------------------------- keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') {
        e.preventDefault();
        save();
        return;
      }
      if (typing || document.querySelector('[role="dialog"]')) return;
      if (mod && k === 'z') {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        doRedo();
      } else if (mod && k === 'd' && selected.length) {
        e.preventDefault();
        if (!archived) pasteBoxes(selected);
      } else if (mod && k === 'c' && selected.length) {
        clipboard = selected.map((b) => ({ ...b }));
        showToast(`${selected.length} field${selected.length === 1 ? '' : 's'} copied`, 'info');
      } else if (mod && k === 'x' && selected.length && !archived) {
        clipboard = selected.map((b) => ({ ...b }));
        deleteSelected();
      } else if (mod && k === 'v' && clipboard.length && !archived) {
        e.preventDefault();
        pasteBoxes(clipboard);
      } else if (mod && k === 'a') {
        e.preventDefault();
        if (layout) select(layout.boxes.filter((b) => b.page === page && !b.hidden).map((b) => b.id));
      } else if (mod && e.key === "'") {
        e.preventDefault();
        setPrefs({ grid: !prefs.grid });
      } else if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        control.current?.zoomAt(1.25);
      } else if (mod && e.key === '-') {
        e.preventDefault();
        control.current?.zoomAt(0.8);
      } else if (mod && e.key === '0') {
        e.preventDefault();
        control.current?.fit();
      } else if (mod && e.key === '1') {
        e.preventDefault();
        control.current?.setZoom(96 / 72);
      } else if (mod) {
        return;
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.length && !archived) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape') {
        setSelection([]);
        setTool('select');
      } else if (selected.length && e.key.startsWith('Arrow') && !archived && pg) {
        e.preventDefault();
        // 1 unit-step, Shift = 10×.
        const stepPt = unitToPt(unitStep(prefs.unit) * (prefs.unit === 'px' ? 1 : 2), prefs.unit) * (e.shiftKey ? 10 : 1);
        const dx = e.key === 'ArrowLeft' ? -stepPt : e.key === 'ArrowRight' ? stepPt : 0;
        const dy = e.key === 'ArrowUp' ? -stepPt : e.key === 'ArrowDown' ? stepPt : 0;
        patchBoxes(
          selected
            .filter((b) => !b.locked)
            .map((b) => {
              const r = boxToPt(b, layout!.pages[b.page] || pg);
              return { id: b.id, ...ptToBox({ ...r, x: r.x + dx, y: r.y + dy }, layout!.pages[b.page] || pg) };
            })
        );
      } else {
        const t = TOOLS.find((x) => x.key.toLowerCase() === k);
        if (t && layout?.pages.length && (!t.draws || !archived)) setTool(t.tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, doUndo, doRedo, selected, pasteBoxes, deleteSelected, patchBoxes, layout, page, pg, prefs, setPrefs, archived, select, showToast]);

  // ---------------------------------------------------------------- files & preview

  const replaceArtwork = async (file: File | undefined) => {
    if (!file || !layout) return;
    if (layout.boxes.length) {
      const ok = await confirm({ title: 'Replace artwork?', message: 'Fields keep their positions relative to the page. Check them after replacing.', confirmLabel: 'Replace' });
      if (!ok) return;
    }
    setUploading('blank');
    setUploadError(null);
    try {
      const art = await processArtwork(file, setArtBusy, { templateId: id });
      setUploadedNow((u) => ({ ...u, blank: { name: file.name, size: file.size } }));
      update((l) => ({
        ...l,
        ...art,
        referenceOverlay: { ...l.referenceOverlay, alignmentConfirmed: false },
        boxes: l.boxes.map((b) => (b.page >= art.pages.length ? { ...b, page: art.pages.length - 1 } : b)),
      }));
      setPage(0);
      showToast('Blank design uploaded. Remember to save.', 'success');
    } catch (e: any) {
      setUploadError({ which: 'blank', message: e.message });
      showToast(e.message, 'error');
    } finally {
      setArtBusy(null);
      setUploading(null);
    }
  };

  const replaceReference = async (file: File | undefined) => {
    if (!file || !layout) return;
    setUploading('reference');
    setUploadError(null);
    try {
      const ref = await processReference(file, setArtBusy, id);
      setUploadedNow((u) => ({ ...u, reference: { name: file.name, size: file.size } }));
      update((l) => ({ ...l, ...ref, referenceOverlay: { ...l.referenceOverlay, alignmentConfirmed: false, offsetX: 0, offsetY: 0, scale: 1 } }));
      setView('overlay');
      showToast('Reference certificate uploaded. Remember to save.', 'success');
    } catch (e: any) {
      setUploadError({ which: 'reference', message: e.message });
      showToast(e.message, 'error');
    } finally {
      setArtBusy(null);
      setUploading(null);
    }
  };

  const setOverlay = (patch: Partial<TemplateLayout['referenceOverlay']>, commit = true) => update((l) => ({ ...l, referenceOverlay: { ...l.referenceOverlay, ...patch } }), commit);

  const togglePreview = async () => {
    if (preview) return setPreview(null);
    if (!layout) return;
    setPreviewBusy(true);
    try {
      const clean = sanitizeLayout(layout);
      const renderer = await CertificateRenderer.load(clean, fetchFile);
      const cert = await realisticCertificate(clean, emptyContent(clean), window.location.origin, (k) => renderer.fixedSignature(k), undefined, { exampleTextForEmptyBoxes: true });
      const { bytes } = await renderer.renderSingle(cert, { placeholders: true });
      const canvas = await renderPdfPage(bytes, page, 1600, undefined, 1);
      setPreview({ url: canvas.toDataURL('image/png'), page });
    } catch (e: any) {
      showToast(`Preview failed: ${e.message}`, 'error');
    } finally {
      setPreviewBusy(false);
    }
  };

  const problems = useMemo(() => (layout ? publishProblems(layout) : []), [layout]);

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6">
        <Alert tone="error" title="Could not open the template">
          {loadError}
        </Alert>
        <Button onClick={() => navigate('/superadmin/templates')}>Back to templates</Button>
      </div>
    );
  }
  if (!tpl || !layout) return <Spinner className="min-h-screen" label="Opening designer…" />;

  const alignment = checkReferenceAlignment(layout);
  const multi = selected.filter((b) => b.page === page).length;
  const selBounds = pg && selected.length ? unionRect(selected.filter((b) => b.page === page).map((b) => boxToPt(b, pg))) : null;
  const zoomPct = Math.round((vp.zoom * 72) / 96 * 100); // 100% = actual size at 96 dpi

  const toggleBtn = (on: boolean, label: string, icon: React.ReactNode, onClick: () => void, shortcut?: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cx('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium', on ? 'bg-navy text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-navy')}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );

  const alignBtn = (label: string, icon: React.ReactNode, onClick: () => void, enabled: boolean) => (
    <IconButton label={label} onClick={onClick} disabled={!enabled || archived}>
      {icon}
    </IconButton>
  );

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* ------------------------------------------------ top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2">
        <IconButton label="Back to templates" onClick={() => navigate('/superadmin/templates')}>
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <PortalBadge portal="superadmin" className="hidden shrink-0 2xl:inline-flex" />
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label="Template name"
          title="Template name — click to rename"
          className="h-8 w-36 shrink-0 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold text-slate-900 hover:border-slate-300 focus:border-brand-500 focus:outline-none sm:w-52"
          maxLength={120}
        />
        <div className="hidden shrink-0 whitespace-nowrap 2xl:block">
          <StatusBadge t={{ ...tpl, hasUnpublishedChanges: tpl.hasUnpublishedChanges || dirty }} />
        </div>
        <span className={cx('h-2 w-2 shrink-0 rounded-full 2xl:hidden', dirty ? 'bg-amber-500' : 'bg-emerald-500')} title={dirty ? 'Unsaved changes' : 'All changes saved'} />
        <span className="hidden text-xs text-slate-400 2xl:inline">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>

        <div className="mx-1 hidden h-6 w-px bg-slate-200 lg:block" />
        <div className="hidden items-center gap-0.5 lg:flex">
          {toggleBtn(prefs.rulers, 'Rulers', <RulerIcon className="h-4 w-4" />, () => setPrefs({ rulers: !prefs.rulers }))}
          {toggleBtn(prefs.grid, 'Grid', <Grid3x3 className="h-4 w-4" />, () => setPrefs({ grid: !prefs.grid }), "Ctrl+'")}
          {toggleBtn(prefs.snap, 'Snap', <Magnet className="h-4 w-4" />, () => setPrefs({ snap: !prefs.snap }))}
          <select
            value={prefs.unit}
            onChange={(e) => {
              const u = e.target.value as Unit;
              setPrefs({ unit: u, gridPt: DEFAULT_GRID[u] });
            }}
            className="ml-1 h-8 rounded-md border border-slate-300 bg-white px-1.5 text-xs text-slate-800"
            aria-label="Units"
            title="Measurement units"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          {prefs.grid && (
            <label className="ml-1 flex items-center gap-1 text-xs text-slate-500" title="Grid size">
              <Grid3x3 className="h-3.5 w-3.5" />
              <input
                type="number"
                min={unitStep(prefs.unit)}
                step={unitStep(prefs.unit)}
                value={Number(fmtUnit(prefs.gridPt, prefs.unit))}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v > 0) setPrefs({ gridPt: unitToPt(v, prefs.unit) });
                }}
                className="h-8 w-16 rounded-md border border-slate-300 bg-white px-1.5 text-xs text-slate-900"
                aria-label="Grid size"
              />
            </label>
          )}
        </div>

        <div className="mx-1 hidden h-6 w-px bg-slate-200 xl:block" />
        <div className="hidden items-center xl:flex" aria-label="Align and distribute">
          {alignBtn('Align left', <AlignStartVertical className="h-4 w-4" />, () => align('left'), multi >= 1)}
          {alignBtn('Align centre', <AlignCenterVertical className="h-4 w-4" />, () => align('hcenter'), multi >= 1)}
          {alignBtn('Align right', <AlignEndVertical className="h-4 w-4" />, () => align('right'), multi >= 1)}
          {alignBtn('Align top', <AlignStartHorizontal className="h-4 w-4" />, () => align('top'), multi >= 1)}
          {alignBtn('Align middle', <AlignCenterHorizontal className="h-4 w-4" />, () => align('vcenter'), multi >= 1)}
          {alignBtn('Align bottom', <AlignEndHorizontal className="h-4 w-4" />, () => align('bottom'), multi >= 1)}
          {alignBtn('Distribute horizontally', <AlignHorizontalDistributeCenter className="h-4 w-4" />, () => distribute('x'), multi >= 3)}
          {alignBtn('Distribute vertically', <AlignVerticalDistributeCenter className="h-4 w-4" />, () => distribute('y'), multi >= 3)}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Undo (Ctrl+Z)" onClick={doUndo} disabled={!undo.current.length}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Y)" onClick={doRedo} disabled={!redo.current.length}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <Button size="sm" variant={preview ? 'subtle' : 'ghost'} onClick={togglePreview} loading={previewBusy} disabled={!layout.pages.length} icon={preview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}>
            <span className="hidden sm:inline">{preview ? 'Exit preview' : 'Preview'}</span>
          </Button>
          <Button size="sm" onClick={save} loading={saving} disabled={archived} icon={<Save className="h-4 w-4" />}>
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button size="sm" variant="primary" disabled={archived} onClick={() => setPublishOpen(true)} icon={<Rocket className="h-4 w-4" />}>
            <span className="hidden sm:inline">Publish</span>
          </Button>
          <Menu
            trigger={(t) => (
              <IconButton label="More" onClick={t}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            )}
            items={[
              {
                label: 'Test template',
                icon: <FlaskConical className="h-4 w-4" />,
                onClick: async () => {
                  if (dirty && !(await save())) return;
                  navigate(`/superadmin/templates/${id}/test`);
                },
              },
              { label: 'Version history', icon: <History className="h-4 w-4" />, onClick: () => setVersionsOpen(true) },
              {
                label: 'Duplicate template',
                icon: <Copy className="h-4 w-4" />,
                onClick: async () => {
                  if (dirty && !(await save())) return;
                  const d = await api.post<TemplateDetail>(`/api/superadmin/templates/${id}/duplicate`);
                  navigate(`/superadmin/templates/${d.id}`);
                },
              },
              {
                label: 'Archive template',
                icon: <Archive className="h-4 w-4" />,
                disabled: archived,
                onClick: async () => {
                  if (!(await confirm({ title: 'Archive template?', message: 'It is hidden from Admins and Users until restored. History is kept.', confirmLabel: 'Archive' }))) return;
                  await api.post(`/api/superadmin/templates/${id}/archive`);
                  setDirty(false);
                  navigate('/superadmin/templates');
                },
              },
              'divider',
              {
                label: 'Delete template…',
                icon: <Trash2 className="h-4 w-4" />,
                danger: true,
                disabled: !tpl,
                onClick: () => setDeleting(true),
              },
            ]}
          />
        </div>
      </header>

      {deleting && tpl && (
        <DeleteTemplateModal
          template={tpl}
          onClose={() => setDeleting(false)}
          onDone={() => {
            setDirty(false);
            navigate('/superadmin/templates');
          }}
        />
      )}
      {archived && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">This template is archived and read-only. Restore it from the Templates page to edit it.</div>}

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------------------------ tool rail */}
        <nav className="navy-panel flex w-12 shrink-0 flex-col items-center gap-1 py-2" aria-label="Tools">
          {TOOLS.map((t, i) => (
            <React.Fragment key={t.tool}>
              {i === 3 && <div className="my-1 h-px w-7 bg-white/20" />}
              <button
                type="button"
                onClick={() => setTool(t.tool)}
                disabled={!layout.pages.length || (archived && !!t.draws) || (!!preview && !!t.draws)}
                aria-pressed={tool === t.tool}
                title={`${t.label} (${t.key})`}
                className={cx(
                  'relative flex h-9 w-9 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-50',
                  tool === t.tool ? 'bg-orange text-navy' : 'text-white/80 hover:bg-white/10 hover:text-white'
                )}
              >
                {t.icon}
                <span className="absolute bottom-0.5 right-1 text-[8px] font-semibold opacity-80">{t.key}</span>
              </button>
            </React.Fragment>
          ))}
          {config?.aiDetectionAvailable && layout.pages.length > 0 && (
            <>
              <div className="my-1 h-px w-7 bg-slate-200" />
              <button type="button" title="Suggest fields with AI" onClick={() => setAiOpen(true)} disabled={archived} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                <Sparkles className="h-[18px] w-[18px]" />
              </button>
            </>
          )}
        </nav>

        {/* ------------------------------------------------ artboard */}
        <section className="relative flex min-w-0 flex-1 flex-col">
          {layout.pages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center bg-[var(--color-canvas)] p-8">
              <label className="flex max-w-md cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-10 py-14 text-center hover:border-brand-400">
                <ImagePlus className="h-8 w-8 text-slate-400" />
                <span className="text-base font-semibold text-slate-900">Upload the certificate design</span>
                <span className="text-sm text-slate-500">PDF, PNG, JPG or SVG. The original artwork is never changed — fields are drawn on top of it.</span>
                <span className="mt-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">{artBusy || 'Choose file'}</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.svg" className="sr-only" onChange={(e) => replaceArtwork(e.target.files?.[0])} />
              </label>
            </div>
          ) : (
            <Workspace
              layout={layout}
              page={page}
              vp={vp}
              setVp={setVp}
              controlRef={control}
              tool={tool}
              readOnly={archived || !!preview}
              selection={selection}
              onSelect={select}
              onCreate={createBox}
              onBoxes={(patches, commit) => patchBoxes(patches, commit)}
              onGuides={setGuides}
              onCursor={setCursor}
              showRulers={prefs.rulers}
              showGrid={prefs.grid}
              gridPt={prefs.gridPt}
              snap={prefs.snap}
              unit={prefs.unit}
              view={view}
              previewUrl={preview && preview.page === page ? preview.url : null}
            />
          )}
          {preview && (
            <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-white" style={{ marginLeft: prefs.rulers ? RULER / 2 : 0 }}>
              Preview with example details — fields are read-only until you exit preview
            </div>
          )}

          {/* ------------------------------------------------ status bar */}
          <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-slate-200 bg-white px-2 text-xs text-slate-600">
            <div className="flex items-center gap-0.5">
              <IconButton label="Zoom out (Ctrl+-)" className="h-6 w-6" onClick={() => control.current?.zoomAt(0.8)}>
                <span className="text-sm leading-none">−</span>
              </IconButton>
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'fit') control.current?.fit();
                  else if (v) control.current?.setZoom((Number(v) / 100) * (96 / 72));
                }}
                className="h-6 rounded border border-slate-200 bg-white px-1 text-xs tabular-nums text-slate-700"
                aria-label="Zoom level"
              >
                <option value="">{zoomPct}%</option>
                <option value="fit">Fit to screen</option>
                {[25, 50, 75, 100, 150, 200, 300, 400].map((z) => (
                  <option key={z} value={z}>
                    {z}%
                  </option>
                ))}
              </select>
              <IconButton label="Zoom in (Ctrl++)" className="h-6 w-6" onClick={() => control.current?.zoomAt(1.25)}>
                <span className="text-sm leading-none">+</span>
              </IconButton>
              <IconButton label="Fit to screen (Ctrl+0)" className="h-6 w-6" onClick={() => control.current?.fit()}>
                <Maximize className="h-3.5 w-3.5" />
              </IconButton>
              <button type="button" className="rounded px-1.5 py-0.5 hover:bg-slate-100" title="Actual size (Ctrl+1)" onClick={() => control.current?.setZoom(96 / 72)}>
                100%
              </button>
            </div>
            <span className="h-4 w-px bg-slate-200" />
            <span className="w-44 shrink-0 whitespace-nowrap tabular-nums" title="Cursor position">
              {cursor ? `X ${fmtUnit(cursor.x, prefs.unit)}  Y ${fmtUnit(cursor.y, prefs.unit)} ${prefs.unit}` : '—'}
            </span>
            {selBounds && (
              <span className="hidden shrink-0 whitespace-nowrap tabular-nums xl:inline" title="Selection size">
                {multi > 1 ? `${multi} selected · ` : ''}W {fmtUnit(selBounds.w, prefs.unit)} H {fmtUnit(selBounds.h, prefs.unit)} {prefs.unit}
              </span>
            )}
            <span className="hidden min-w-0 truncate text-slate-400 2xl:inline">
              {tool === 'select' ? 'Click to select · Shift+click to add · drag empty space to box-select · Space+drag to pan' : tool === 'hand' ? 'Drag to pan' : tool === 'zoom' ? 'Click to zoom in · Alt+click to zoom out' : 'Drag on the artboard to draw the field, or click to place it'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {layout.pages.length > 0 && (
                <Segmented
                  size="sm"
                  ariaLabel="Artboard view"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'blank', label: 'Blank', title: 'The blank design (used in the PDF)' },
                    { value: 'overlay', label: 'Overlay', title: 'Reference certificate over the blank design' },
                    { value: 'reference', label: 'Ref', title: 'The complete reference certificate' },
                  ]}
                />
              )}
              {layout.pages.length > 1 && (
                <div className="flex items-center">
                  <IconButton label="Previous page" className="h-6 w-6" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </IconButton>
                  <span className="px-1 tabular-nums">
                    {page + 1}/{layout.pages.length}
                  </span>
                  <IconButton label="Next page" className="h-6 w-6" disabled={page >= layout.pages.length - 1} onClick={() => setPage(page + 1)}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              )}
            </div>
          </footer>
        </section>

        {/* ------------------------------------------------ right panel */}
        <aside className="navy-panel flex w-[19rem] shrink-0 flex-col">
          <div className="flex shrink-0 border-b border-white/15" role="tablist">
            {(
              [
                ['properties', 'Properties', <SlidersHorizontal key="p" className="h-3.5 w-3.5" />],
                ['layers', 'Layers', <Layers key="l" className="h-3.5 w-3.5" />],
                ['document', 'Document', <FileText key="d" className="h-3.5 w-3.5" />],
              ] as const
            ).map(([k, label, icon]) => (
              <button
                key={k}
                role="tab"
                aria-selected={panel === k}
                onClick={() => setPanel(k)}
                className={cx('flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-xs font-medium', panel === k ? 'border-orange text-white' : 'border-transparent text-white/60 hover:text-white')}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {panel === 'layers' ? (
              <LayersPanel
                boxes={layout.boxes}
                page={page}
                selection={selection}
                readOnly={archived}
                onSelect={select}
                onPatch={(bid, patch) => {
                  patchBox(bid, patch);
                  if (patch.hidden) setSelection((s) => s.filter((x) => x !== bid));
                }}
                onReorder={reorder}
              />
            ) : panel === 'properties' ? (
              single ? (
                <BoxProperties
                  key={single.id}
                  box={single}
                  layout={layout}
                  unit={prefs.unit}
                  published={!!tpl.currentVersionId && tpl.draft.boxes.some((b) => b.id === single.id)}
                  onChange={(patch, commit) => !archived && patchBox(single.id, patch, commit)}
                  onDelete={deleteSelected}
                  onDuplicate={() => pasteBoxes([single])}
                />
              ) : selected.length > 1 ? (
                <div className="space-y-4 p-4 text-sm">
                  <p className="font-semibold text-slate-900">{selected.length} fields selected</p>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Align</p>
                    <div className="flex flex-wrap gap-0.5">
                      {alignBtn('Align left', <AlignStartVertical className="h-4 w-4" />, () => align('left'), true)}
                      {alignBtn('Align centre', <AlignCenterVertical className="h-4 w-4" />, () => align('hcenter'), true)}
                      {alignBtn('Align right', <AlignEndVertical className="h-4 w-4" />, () => align('right'), true)}
                      {alignBtn('Align top', <AlignStartHorizontal className="h-4 w-4" />, () => align('top'), true)}
                      {alignBtn('Align middle', <AlignCenterHorizontal className="h-4 w-4" />, () => align('vcenter'), true)}
                      {alignBtn('Align bottom', <AlignEndHorizontal className="h-4 w-4" />, () => align('bottom'), true)}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Distribute</p>
                    <div className="flex gap-0.5">
                      {alignBtn('Distribute horizontally', <AlignHorizontalDistributeCenter className="h-4 w-4" />, () => distribute('x'), selected.length >= 3)}
                      {alignBtn('Distribute vertically', <AlignVerticalDistributeCenter className="h-4 w-4" />, () => distribute('y'), selected.length >= 3)}
                    </div>
                    {selected.length < 3 && <p className="mt-1 text-xs text-slate-500">Select three or more fields to distribute.</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => pasteBoxes(selected)} disabled={archived}>
                      Duplicate
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={deleteSelected} disabled={archived}>
                      Delete
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">One field aligns to the page; several align to each other. Arrow keys move all selected fields.</p>
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Select a field on the artboard or in Layers to edit its position, font, size, colour and alignment.</p>
              )
            ) : (
              <DocumentPanel
                layout={layout}
                description={description}
                setDescription={(v) => {
                  setDescription(v);
                  setDirty(true);
                }}
                archived={archived}
                artBusy={artBusy}
                uploading={uploading}
                uploadedNow={uploadedNow}
                uploadError={uploadError}
                view={view}
                setView={setView}
                onReplaceArtwork={replaceArtwork}
                onReplaceReference={replaceReference}
                setOverlay={setOverlay}
                onFonts={(fonts) => update((l) => ({ ...l, fonts }))}
                problems={problems}
                alignment={alignment}
                unit={prefs.unit}
                onClearGuides={() => setGuides((layout.guides || []).filter((g) => g.page !== page), true)}
                guideCount={(layout.guides || []).filter((g) => g.page === page).length}
              />
            )}
          </div>
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
              const d = await api.post<TemplateDetail>(`/api/superadmin/templates/${id}/publish`, { notes });
              applyDetail(d);
              setPublishOpen(false);
              showToast(`Published version ${d.currentVersionNumber} — now visible in the Admin and User portals`, 'success');
              ensureReferenceImage(d)
                .then((made) => made && showToast('Reference certificate generated from sample data', 'info'))
                .catch(() => showToast('Could not generate the reference certificate. Add one from the template menu.', 'error'));
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
            const d = await api.post<TemplateDetail>(`/api/superadmin/templates/${id}/versions/${v.id}/restore`);
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
            showToast(`${created.length} fields added. Check their positions before saving.`, 'success');
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- document panel

function DocumentPanel({
  layout,
  description,
  setDescription,
  archived,
  artBusy,
  uploading,
  uploadedNow,
  uploadError,
  view,
  setView,
  onReplaceArtwork,
  onReplaceReference,
  setOverlay,
  onFonts,
  problems,
  alignment,
  unit,
  onClearGuides,
  guideCount,
}: {
  layout: TemplateLayout;
  description: string;
  setDescription: (v: string) => void;
  archived: boolean;
  artBusy: string | null;
  uploading: 'reference' | 'blank' | null;
  uploadedNow: Partial<Record<'reference' | 'blank', { name: string; size: number }>>;
  uploadError: { which: 'reference' | 'blank'; message: string } | null;
  view: 'blank' | 'reference' | 'overlay';
  setView: (v: 'blank' | 'reference' | 'overlay') => void;
  onReplaceArtwork: (f: File | undefined) => void;
  onReplaceReference: (f: File | undefined) => void;
  setOverlay: (patch: Partial<TemplateLayout['referenceOverlay']>, commit?: boolean) => void;
  onFonts: (fonts: TemplateLayout['fonts']) => void;
  problems: string[];
  alignment: ReturnType<typeof checkReferenceAlignment>;
  unit: Unit;
  onClearGuides: () => void;
  guideCount: number;
}) {
  const pg0 = layout.pages[0];
  return (
    <div className="text-sm">
      <Section title="Design files">
        <p className="text-xs font-medium text-slate-600">Upload A — reference certificate</p>
        <UploadZone
          compact
          id="doc-reference"
          accept=".pdf,.png,.jpg,.jpeg,.svg"
          state={uploading === 'reference' ? 'uploading' : uploadError?.which === 'reference' ? 'error' : layout.referenceFileId ? 'done' : 'empty'}
          fileName={uploadedNow.reference?.name || 'Reference certificate'}
          fileSize={uploadedNow.reference?.size}
          doneLabel={uploadedNow.reference ? 'Uploaded just now' : 'Uploaded'}
          emptyLabel="Upload reference (A)"
          busyText={uploading === 'reference' ? artBusy : null}
          error={uploadError?.which === 'reference' ? uploadError.message : null}
          disabled={archived || (!!uploading && uploading !== 'reference')}
          onPick={onReplaceReference}
        />
        <p className="text-xs font-medium text-slate-600">Upload B — blank design</p>
        <UploadZone
          compact
          id="doc-blank"
          accept=".pdf,.png,.jpg,.jpeg,.svg"
          state={uploading === 'blank' ? 'uploading' : uploadError?.which === 'blank' ? 'error' : layout.pages.length ? 'done' : 'empty'}
          fileName={uploadedNow.blank?.name || 'Blank design'}
          fileSize={uploadedNow.blank?.size}
          doneLabel={uploadedNow.blank ? 'Uploaded just now' : 'Uploaded'}
          emptyLabel="Upload blank design (B)"
          busyText={uploading === 'blank' ? artBusy : null}
          error={uploadError?.which === 'blank' ? uploadError.message : null}
          disabled={archived || (!!uploading && uploading !== 'blank')}
          onPick={onReplaceArtwork}
        />
        {pg0 && (
          <p className="text-xs text-slate-500">
            {layout.artworkMime === 'application/pdf' ? 'PDF' : layout.artworkMime === 'image/png' ? 'PNG' : 'JPG'} · {layout.pages.length} page{layout.pages.length > 1 ? 's' : ''} · {fmtUnit(pg0.width, unit)} × {fmtUnit(pg0.height, unit)} {unit}
          </p>
        )}
        {layout.referenceFileId && (
          <>
            <Segmented
              size="sm"
              ariaLabel="Artboard view"
              value={view}
              onChange={setView}
              options={[
                { value: 'blank', label: 'Blank' },
                { value: 'overlay', label: 'Overlay' },
                { value: 'reference', label: 'Reference' },
              ]}
            />
            {view === 'overlay' && (
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Opacity
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={Math.round(layout.referenceOverlay.opacity * 100)}
                  onChange={(e) => setOverlay({ opacity: +e.target.value / 100 }, false)}
                  onPointerUp={() => setOverlay({}, true)}
                  className="flex-1"
                  aria-label="Reference opacity"
                />
                <span className="w-8 text-right tabular-nums">{Math.round(layout.referenceOverlay.opacity * 100)}%</span>
              </label>
            )}
          </>
        )}
        <p className="text-[11px] leading-snug text-slate-500">The reference (A) is a locked guide for you only. The blank design (B) is the background of every certificate and is never changed.</p>
      </Section>
      <Section title="Details">
        <Field label="Description" optional hint="Shown to users when they choose a template.">
          <Textarea rows={3} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </Section>
      <Section title="Guides" defaultOpen={false}>
        <p className="text-xs text-slate-500">Drag from the rulers to add guides. Drag a guide back onto the ruler or double-click it to remove it. Guides are saved with the template but never printed.</p>
        <Button size="sm" variant="ghost" disabled={!guideCount || archived} onClick={onClearGuides}>
          Clear {guideCount} guide{guideCount === 1 ? '' : 's'} on this page
        </Button>
      </Section>
      <Section title="Uploaded fonts" defaultOpen={layout.fonts.length > 0}>
        <p className="text-xs text-slate-500">Upload your organisation's fonts if the built-in ones don't match the design.</p>
        <FontManager fonts={layout.fonts} onChange={onFonts} />
      </Section>
      {layout.referenceFileId && (
        <Section title="Reference alignment" defaultOpen={alignment.problems.length > 0}>
          {alignment.problems.length === 0 ? (
            <Alert tone="success">The reference certificate and the blank design have matching pages.</Alert>
          ) : (
            <Alert tone={alignment.ok ? 'info' : 'warning'} title={alignment.ok ? 'Alignment confirmed' : 'The two files do not match'}>
              <ul className="list-disc pl-4">
                {alignment.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Alert>
          )}
          {(
            [
              ['offsetX', 'Move left / right', -20, 20, 0.1, '%'],
              ['offsetY', 'Move up / down', -20, 20, 0.1, '%'],
              ['scale', 'Size', 0.8, 1.25, 0.005, '×'],
            ] as const
          ).map(([k, label, min, max, step, u]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-slate-600">
              <span className="w-24">{label}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={layout.referenceOverlay[k]}
                onChange={(e) => setOverlay({ [k]: +e.target.value } as any, false)}
                onPointerUp={() => setOverlay({}, true)}
                className="flex-1"
                aria-label={label}
                onFocus={() => setView('overlay')}
              />
              <span className="w-12 text-right tabular-nums">
                {k === 'scale' ? layout.referenceOverlay.scale.toFixed(3) : layout.referenceOverlay[k].toFixed(1)}
                {u}
              </span>
            </label>
          ))}
          <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setOverlay({ offsetX: 0, offsetY: 0, scale: 1 })}>
            Reset calibration
          </button>
          {alignment.problems.length > 0 && (
            <Toggle
              checked={layout.referenceOverlay.alignmentConfirmed}
              onChange={(v) => setOverlay({ alignmentConfirmed: v })}
              label="I checked the overlay — the fields line up"
              description="Required before publishing when the files differ."
            />
          )}
        </Section>
      )}
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
      </Section>
      <p className="px-4 py-3 text-[11px] text-slate-400">Units: {unit} · 1 {unit} = {(ptToUnit(1, unit) ? 1 / ptToUnit(1, unit) : 1).toFixed(3)} pt</p>
    </div>
  );
}
