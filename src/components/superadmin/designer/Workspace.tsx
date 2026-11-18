// The designer's artboard: a grey canvas with the certificate page, rulers,
// guides, grid, snapping with smart alignment lines, pan/zoom, multi-select,
// move / resize (8 handles) / rotate, and drawing new fields.
//
// Geometry is computed in PDF points; boxes are stored as page percentages.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, Lock } from 'lucide-react';
import type { BoxType, Guide, TemplateBox, TemplateLayout } from '../../../../shared/types';
import { signatureOrder } from '../../../../shared/layout';
import { fileUrl } from '../../../lib/api';
import { cx } from '../../shared/ui';
import { BOX_STYLE, CanvasSigner, CanvasText } from './boxVisuals';
import { boxToPt, intersects, niceStep, ptToBox, ptToUnit, rotatedBounds, snap1D, unionRect, type PtRect, type SnapTarget, type Unit } from './units';

export type WorkTool = 'select' | 'hand' | 'zoom' | BoxType | 'date';

export interface Viewport {
  zoom: number; // screen px per pt
  panX: number; // artboard origin inside the view, px
  panY: number;
}

export interface BoxPatch {
  id: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
}

/** Imperative zoom controls for the toolbar and status bar. */
export interface WorkspaceControl {
  zoomAt: (factor: number, clientX?: number, clientY?: number) => void;
  setZoom: (zoom: number) => void;
  fit: () => void;
}

export const RULER = 22; // ruler thickness, px
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];
const HANDLE_CURSOR: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const HANDLE_POS: Record<Handle, [number, number]> = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
const SNAP_PX = 6;
const MIN_PT = 4;

interface Props {
  layout: TemplateLayout;
  page: number;
  vp: Viewport;
  setVp: (v: Viewport | ((v: Viewport) => Viewport)) => void;
  controlRef: React.MutableRefObject<WorkspaceControl | null>;
  tool: WorkTool;
  readOnly: boolean;
  selection: string[];
  onSelect: (ids: string[]) => void;
  onCreate: (type: BoxType, rectPct: { x: number; y: number; w: number; h: number }) => void;
  onBoxes: (patches: BoxPatch[], commit: boolean) => void;
  onGuides: (guides: Guide[], commit: boolean) => void;
  onCursor: (p: { x: number; y: number } | null) => void;
  showRulers: boolean;
  showGrid: boolean;
  gridPt: number;
  snap: boolean;
  unit: Unit;
  view: 'blank' | 'reference' | 'overlay';
  previewUrl: string | null;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { kind: 'draw'; type: BoxType; start: { x: number; y: number }; rect: PtRect }
  | { kind: 'move'; start: { x: number; y: number }; orig: Map<string, PtRect>; moved: boolean }
  | { kind: 'resize'; id: string; handle: Handle; start: { x: number; y: number }; orig: PtRect; rot: number }
  | { kind: 'rotate'; id: string; center: { x: number; y: number }; orig: number }
  | { kind: 'marquee'; start: { x: number; y: number }; rect: PtRect; base: string[] }
  | { kind: 'guide'; guide: Guide; isNew: boolean };

export function Workspace(props: Props) {
  const { layout, page, vp, setVp, controlRef, tool, readOnly, selection, onSelect, onCreate, onBoxes, onGuides, onCursor, showRulers, showGrid, gridPt, snap, unit, view, previewUrl } = props;
  const outerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [lines, setLines] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [cursorPt, setCursorPt] = useState<{ x: number; y: number } | null>(null);
  const [space, setSpace] = useState(false);
  const pg = layout.pages[page];
  const W = pg?.width || 1;
  const H = pg?.height || 1;
  const z = vp.zoom;
  const off = showRulers ? RULER : 0;

  // ------------------------------------------------------------ size & fit
  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [showRulers]);

  const fit = useCallback(() => {
    if (!size.w || !size.h || !pg) return;
    const pad = 48;
    const zoom = Math.max(0.05, Math.min((size.w - pad * 2) / W, (size.h - pad * 2) / H));
    setVp({ zoom, panX: (size.w - W * zoom) / 2, panY: (size.h - H * zoom) / 2 });
  }, [size.w, size.h, W, H, pg, setVp]);

  // Fit when the workspace first gets a size, and when the page changes.
  useEffect(() => {
    if (size.w) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size.w > 0, W, H]);

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const r = viewRef.current?.getBoundingClientRect();
      if (!r) return;
      const cx = clientX === undefined ? r.width / 2 : clientX - r.left;
      const cy = clientY === undefined ? r.height / 2 : clientY - r.top;
      setVp((v) => {
        const nz = Math.min(16, Math.max(0.05, v.zoom * factor));
        const k = nz / v.zoom;
        return { zoom: nz, panX: cx - (cx - v.panX) * k, panY: cy - (cy - v.panY) * k };
      });
    },
    [setVp]
  );
  controlRef.current = { zoomAt, fit, setZoom: (nz: number) => zoomAt(nz / vp.zoom) };

  // Space bar = temporary hand tool.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e) && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Ctrl + wheel zooms around the pointer; wheel pans (Shift = horizontal).
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setVp((v) => ({ ...v, panX: v.panX - dx, panY: v.panY - dy }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt, setVp]);

  // ------------------------------------------------------------ coordinates
  const toPt = useCallback(
    (clientX: number, clientY: number) => {
      const r = viewRef.current!.getBoundingClientRect();
      return { x: (clientX - r.left - vp.panX) / z, y: (clientY - r.top - vp.panY) / z };
    },
    [vp.panX, vp.panY, z]
  );

  const pageBoxes = layout.boxes.filter((b) => b.page === page);
  const rectOf = (b: TemplateBox) => boxToPt(b, pg);
  const guides = (layout.guides || []).filter((g) => g.page === page);

  const targets = useCallback(
    (exclude: Set<string>): { x: SnapTarget[]; y: SnapTarget[] } => {
      const x: SnapTarget[] = [
        { pos: 0, kind: 'page' },
        { pos: W / 2, kind: 'page' },
        { pos: W, kind: 'page' },
      ];
      const y: SnapTarget[] = [
        { pos: 0, kind: 'page' },
        { pos: H / 2, kind: 'page' },
        { pos: H, kind: 'page' },
      ];
      for (const g of guides) (g.axis === 'x' ? x : y).push({ pos: (g.pos / 100) * (g.axis === 'x' ? W : H), kind: 'guide' });
      for (const b of pageBoxes) {
        if (exclude.has(b.id) || b.hidden) continue;
        const r = rotatedBounds(rectOf(b), b.rotation);
        x.push({ pos: r.x, kind: 'box' }, { pos: r.x + r.w / 2, kind: 'box' }, { pos: r.x + r.w, kind: 'box' });
        y.push({ pos: r.y, kind: 'box' }, { pos: r.y + r.h / 2, kind: 'box' }, { pos: r.y + r.h, kind: 'box' });
      }
      return { x, y };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout, page, W, H]
  );
  const threshold = SNAP_PX / z;
  const gridSnap = snap && showGrid ? gridPt : null;

  // ------------------------------------------------------------ pointer handling
  // Window listeners are attached right away (not in an effect) so no pointer
  // event between "down" and the next render is lost; they always call the
  // latest handlers through `handlers`.
  const handlers = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void }>({ move: () => {}, up: () => {} });
  const begin = (d: Drag) => {
    dragRef.current = d;
    setDrag(d);
    const move = (e: PointerEvent) => handlers.current.move(e);
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      handlers.current.up(e);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!pg) return;
    const target = e.target as HTMLElement;
    const p = toPt(e.clientX, e.clientY);
    // Pan: hand tool, Space, or middle mouse button.
    if (e.button === 1 || tool === 'hand' || space) {
      e.preventDefault();
      begin({ kind: 'pan', sx: e.clientX, sy: e.clientY, ox: vp.panX, oy: vp.panY });
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'zoom') {
      zoomAt(e.altKey ? 1 / 1.5 : 1.5, e.clientX, e.clientY);
      return;
    }
    const guideId = target.closest<HTMLElement>('[data-guide]')?.dataset.guide;
    if (guideId && !readOnly) {
      const g = (layout.guides || []).find((x) => x.id === guideId);
      if (g) begin({ kind: 'guide', guide: g, isNew: false });
      return;
    }
    if (readOnly && tool !== 'select') return;
    if (tool !== 'select') {
      const type: BoxType = tool === 'date' ? 'text' : (tool as BoxType);
      const s = snap ? snapPoint(p) : p;
      begin({ kind: 'draw', type, start: s, rect: { x: s.x, y: s.y, w: 0, h: 0 } });
      return;
    }
    const handleEl = target.closest<HTMLElement>('[data-handle]');
    const rotateEl = target.closest<HTMLElement>('[data-rotate]');
    const boxEl = target.closest<HTMLElement>('[data-box]');
    if (!readOnly && rotateEl) {
      const b = layout.boxes.find((x) => x.id === rotateEl.dataset.rotate)!;
      const r = rectOf(b);
      begin({ kind: 'rotate', id: b.id, center: { x: r.x + r.w / 2, y: r.y + r.h / 2 }, orig: b.rotation || 0 });
      return;
    }
    if (!readOnly && handleEl) {
      const b = layout.boxes.find((x) => x.id === handleEl.dataset.box)!;
      begin({ kind: 'resize', id: b.id, handle: handleEl.dataset.handle as Handle, start: p, orig: rectOf(b), rot: b.rotation || 0 });
      return;
    }
    if (boxEl) {
      const id = boxEl.dataset.box!;
      const b = layout.boxes.find((x) => x.id === id)!;
      let sel = selection;
      if (e.shiftKey) {
        sel = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id];
        onSelect(sel);
        return;
      }
      if (!selection.includes(id)) {
        sel = [id];
        onSelect(sel);
      }
      if (readOnly || b.locked) return;
      const movable = layout.boxes.filter((x) => sel.includes(x.id) && !x.locked);
      begin({ kind: 'move', start: p, orig: new Map(movable.map((x) => [x.id, rectOf(x)])), moved: false });
      return;
    }
    // Empty canvas: marquee selection.
    begin({ kind: 'marquee', start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 }, base: e.shiftKey ? selection : [] });
    if (!e.shiftKey) onSelect([]);
  };

  const snapPoint = (p: { x: number; y: number }) => {
    const t = targets(new Set());
    const sx = snap1D([p.x], t.x, threshold, gridSnap);
    const sy = snap1D([p.y], t.y, threshold, gridSnap);
    return { x: p.x + sx.delta, y: p.y + sy.delta };
  };

  const startRulerGuide = (axis: 'x' | 'y', e: React.PointerEvent) => {
    if (readOnly || e.button !== 0 || !pg) return;
    e.stopPropagation();
    const p = toPt(e.clientX, e.clientY);
    const g: Guide = { id: `g_${Math.random().toString(36).slice(2, 10)}`, page, axis, pos: axis === 'x' ? (p.x / W) * 100 : (p.y / H) * 100 };
    begin({ kind: 'guide', guide: g, isNew: true });
  };

  {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const p = toPt(e.clientX, e.clientY);
      setCursorPt(p);
      onCursor(p);
      if (d.kind === 'pan') {
        setVp((v) => ({ ...v, panX: d.ox + (e.clientX - d.sx), panY: d.oy + (e.clientY - d.sy) }));
      } else if (d.kind === 'draw') {
        const q = snap ? snapPoint(p) : p;
        const x = Math.max(0, Math.min(d.start.x, q.x));
        const y = Math.max(0, Math.min(d.start.y, q.y));
        const x2 = Math.min(W, Math.max(d.start.x, q.x));
        const y2 = Math.min(H, Math.max(d.start.y, q.y));
        const nd = { ...d, rect: { x, y, w: x2 - x, h: y2 - y } };
        dragRef.current = nd;
        setDrag(nd);
      } else if (d.kind === 'move') {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        if (!d.moved && Math.abs(dx) * z < 3 && Math.abs(dy) * z < 3) return;
        if (e.shiftKey) {
          // Constrain to horizontal / vertical.
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const u = unionRect([...d.orig.values()])!;
        let ln = { x: [] as number[], y: [] as number[] };
        if (snap) {
          const t = targets(new Set(d.orig.keys()));
          const moved = { x: u.x + dx, y: u.y + dy };
          const sx = snap1D([moved.x, moved.x + u.w / 2, moved.x + u.w], t.x, threshold, gridSnap);
          const sy = snap1D([moved.y, moved.y + u.h / 2, moved.y + u.h], t.y, threshold, gridSnap);
          dx += sx.delta;
          dy += sy.delta;
          ln = { x: sx.lines, y: sy.lines };
        }
        // Keep the group on the page.
        dx = Math.min(W - (u.x + u.w), Math.max(-u.x, dx));
        dy = Math.min(H - (u.y + u.h), Math.max(-u.y, dy));
        setLines(ln);
        dragRef.current = { ...d, moved: true };
        onBoxes(
          [...d.orig].map(([id, r]) => ({ id, ...ptToBox({ ...r, x: r.x + dx, y: r.y + dy }, pg) })),
          false
        );
      } else if (d.kind === 'resize') {
        const o = d.orig;
        const hd = d.handle;
        const a = (d.rot * Math.PI) / 180;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        // Pointer movement in the box's own (unrotated) frame.
        let mx = p.x - d.start.x;
        let my = p.y - d.start.y;
        const lx = mx * cos + my * sin;
        const ly = -mx * sin + my * cos;
        let l = -o.w / 2;
        let r = o.w / 2;
        let t = -o.h / 2;
        let b = o.h / 2;
        if (hd.includes('e')) r += lx;
        if (hd.includes('w')) l += lx;
        if (hd.includes('s')) b += ly;
        if (hd.includes('n')) t += ly;
        // Shift on a corner keeps the proportions.
        if (e.shiftKey && hd.length === 2) {
          const ratio = o.w / o.h;
          const w = r - l;
          const h = b - t;
          if (Math.abs(w / o.w) > Math.abs(h / o.h)) {
            const nh = w / ratio;
            if (hd.includes('n')) t = b - nh;
            else b = t + nh;
          } else {
            const nw = h * ratio;
            if (hd.includes('w')) l = r - nw;
            else r = l + nw;
          }
        }
        let ln = { x: [] as number[], y: [] as number[] };
        if (snap && !d.rot) {
          // Snap the moving edges (unrotated boxes only).
          const t2 = targets(new Set([d.id]));
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          if (hd.includes('e') || hd.includes('w')) {
            const edge = hd.includes('e') ? cx + r : cx + l;
            const s = snap1D([edge], t2.x, threshold, gridSnap);
            if (hd.includes('e')) r += s.delta;
            else l += s.delta;
            ln.x = s.lines;
          }
          if (hd.includes('n') || hd.includes('s')) {
            const edge = hd.includes('s') ? cy + b : cy + t;
            const s = snap1D([edge], t2.y, threshold, gridSnap);
            if (hd.includes('s')) b += s.delta;
            else t += s.delta;
            ln.y = s.lines;
          }
        }
        if (r - l < MIN_PT) hd.includes('w') ? (l = r - MIN_PT) : (r = l + MIN_PT);
        if (b - t < MIN_PT) hd.includes('n') ? (t = b - MIN_PT) : (b = t + MIN_PT);
        // New centre back in page coordinates.
        mx = (l + r) / 2;
        my = (t + b) / 2;
        const ncx = o.x + o.w / 2 + mx * cos - my * sin;
        const ncy = o.y + o.h / 2 + mx * sin + my * cos;
        const w = r - l;
        const h = b - t;
        setLines(ln);
        onBoxes([{ id: d.id, ...ptToBox({ x: ncx - w / 2, y: ncy - h / 2, w, h }, pg) }], false);
      } else if (d.kind === 'rotate') {
        let deg = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI + 90;
        deg = ((deg % 360) + 360) % 360;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        else {
          for (const s of [0, 90, 180, 270, 360]) if (Math.abs(deg - s) < 3) deg = s;
          deg = Math.round(deg * 2) / 2;
        }
        if (deg >= 180) deg -= 360;
        if (deg === -180) deg = 180;
        onBoxes([{ id: d.id, rotation: deg }], false);
      } else if (d.kind === 'marquee') {
        const x = Math.min(d.start.x, p.x);
        const y = Math.min(d.start.y, p.y);
        const rect = { x, y, w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
        const nd = { ...d, rect };
        dragRef.current = nd;
        setDrag(nd);
        const hit = pageBoxes.filter((b) => !b.hidden && intersects(rect, rotatedBounds(rectOf(b), b.rotation))).map((b) => b.id);
        onSelect([...new Set([...d.base, ...hit])]);
      } else if (d.kind === 'guide') {
        const pos = d.guide.axis === 'x' ? (p.x / W) * 100 : (p.y / H) * 100;
        const g = { ...d.guide, pos: Math.round(pos * 100) / 100 };
        dragRef.current = { ...d, guide: g };
        setDrag({ ...d, guide: g });
      }
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setLines({ x: [], y: [] });
      if (!d) return;
      if (d.kind === 'draw') {
        let r = d.rect;
        if (r.w * z < 6 || r.h * z < 6) {
          // A click places a sensibly sized field centred on the pointer.
          const def = d.type === 'text' ? { w: W * 0.4, h: H * 0.07 } : d.type === 'qr' ? { w: H * 0.12, h: H * 0.12 } : d.type === 'photo' ? { w: W * 0.11, h: W * 0.14 } : { w: W * 0.18, h: H * 0.08 };
          r = { x: d.start.x - def.w / 2, y: d.start.y - def.h / 2, ...def };
        }
        onCreate(d.type, ptToBox(r, pg));
      } else if (d.kind === 'move' && d.moved) {
        onBoxes([], true);
      } else if (d.kind === 'resize' || d.kind === 'rotate') {
        onBoxes([], true);
      } else if (d.kind === 'guide') {
        // Dropping a guide back on the ruler (or off the page area) removes it.
        const vr = viewRef.current!.getBoundingClientRect();
        const outside = d.guide.axis === 'x' ? e.clientX < vr.left : e.clientY < vr.top;
        const all = (layout.guides || []).filter((g) => g.id !== d.guide.id);
        if (outside) {
          if (!d.isNew) onGuides(all, true);
        } else onGuides([...all, d.guide], true);
      }
    };
    handlers.current = { move, up };
  }

  if (!pg) return null;

  const refPg = layout.referencePages?.[page];
  const refImg = refPg?.previewFileId ? fileUrl(refPg.previewFileId) : null;
  const img = view === 'reference' && refImg && !previewUrl ? refImg : previewUrl || fileUrl(pg.previewFileId);
  const ov = layout.referenceOverlay;
  const sigNumber = new Map(signatureOrder(layout.boxes).map((b, i) => [b.id, i + 1]));
  const selectedBoxes = pageBoxes.filter((b) => selection.includes(b.id));
  const single = selectedBoxes.length === 1 ? selectedBoxes[0] : null;
  const groupRect = selectedBoxes.length > 1 ? unionRect(selectedBoxes.map((b) => rotatedBounds(rectOf(b), b.rotation))) : null;
  const shownGuides = drag?.kind === 'guide' ? [...guides.filter((g) => g.id !== drag.guide.id), drag.guide] : guides;
  const cursor = drag?.kind === 'pan' ? 'grabbing' : tool === 'hand' || space ? 'grab' : tool === 'zoom' ? 'zoom-in' : tool !== 'select' ? 'crosshair' : 'default';

  return (
    <div ref={outerRef} className="relative min-h-0 flex-1 select-none overflow-hidden bg-[var(--color-canvas)]" style={{ cursor }}>
      {showRulers && (
        <>
          <Ruler axis="x" length={size.w} pan={vp.panX} zoom={z} unit={unit} cursor={cursorPt?.x ?? null} pageLen={W} onPointerDown={(e) => startRulerGuide('y', e)} />
          <Ruler axis="y" length={size.h} pan={vp.panY} zoom={z} unit={unit} cursor={cursorPt?.y ?? null} pageLen={H} onPointerDown={(e) => startRulerGuide('x', e)} />
          <div className="absolute left-0 top-0 z-30 flex items-center justify-center border-b border-r border-slate-300 bg-white text-[9px] font-bold uppercase text-navy" style={{ width: RULER, height: RULER }}>
            {unit}
          </div>
        </>
      )}
      <div
        ref={viewRef}
        className="absolute overflow-hidden"
        style={{ left: off, top: off, right: 0, bottom: 0, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          if (!drag) {
            const p = toPt(e.clientX, e.clientY);
            setCursorPt(p);
            onCursor(p);
          }
        }}
        onPointerLeave={() => {
          if (!drag) {
            setCursorPt(null);
            onCursor(null);
          }
        }}
        onDoubleClick={(e) => {
          const gid = (e.target as HTMLElement).closest<HTMLElement>('[data-guide]')?.dataset.guide;
          if (gid && !readOnly) onGuides((layout.guides || []).filter((g) => g.id !== gid), true);
        }}
      >
        {/* Artboard */}
        <div className="paper absolute shadow-[0_2px_16px_rgba(0,0,0,0.25)] ring-1 ring-black/10" style={{ left: vp.panX, top: vp.panY, width: W * z, height: H * z }}>
          {img && <img src={img} alt="Certificate artwork" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />}
          {view === 'overlay' && refImg && !previewUrl && (
            <img
              src={refImg}
              alt="Reference certificate overlay"
              className="pointer-events-none absolute left-0 top-0 h-full w-full"
              style={{ opacity: ov?.opacity ?? 0.5, transformOrigin: '0 0', transform: `translate(${ov?.offsetX ?? 0}%, ${ov?.offsetY ?? 0}%) scale(${ov?.scale ?? 1})` }}
              draggable={false}
            />
          )}
          {showGrid && gridPt * z >= 4 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: 'linear-gradient(to right, rgba(0,47,108,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,47,108,0.14) 1px, transparent 1px)',
                backgroundSize: `${gridPt * z}px ${gridPt * z}px`,
              }}
            />
          )}
          {pageBoxes.map((b) => {
            if (b.hidden) return null;
            const isDate = b.type === 'text' && !!b.date;
            const st = isDate ? { ...BOX_STYLE.text, chip: 'bg-teal-600', border: 'border-teal-500', icon: <CalendarDays className="h-3 w-3" /> } : BOX_STYLE[b.type];
            const sel = selection.includes(b.id);
            const r = rectOf(b);
            return (
              <div
                key={b.id}
                data-box={b.id}
                className={cx('absolute border', previewUrl ? 'border-dashed bg-transparent opacity-50' : st.bg, st.border, sel ? 'z-20' : 'z-10', tool === 'select' && !b.locked && !readOnly ? 'cursor-move' : '')}
                style={{ left: r.x * z, top: r.y * z, width: r.w * z, height: r.h * z, transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined, borderWidth: sel ? 0 : 1.5 }}
                role="button"
                aria-label={`${st.name}: ${b.label}`}
                aria-pressed={sel}
              >
                {!previewUrl && (
                  <span className={cx('pointer-events-none absolute -top-[18px] left-[-1px] flex max-w-[260px] items-center gap-1 truncate rounded-t px-1.5 py-px text-[10px] font-medium text-white', st.chip, !sel && 'opacity-75')}>
                    {st.icon}
                    {b.type === 'signature' && <span className="rounded bg-white/30 px-1">{sigNumber.get(b.id)}</span>}
                    {b.label}
                    {b.locked && <Lock className="h-2.5 w-2.5" />}
                  </span>
                )}
                {!previewUrl && b.type === 'text' && <CanvasText box={b} scale={z} />}
                {!previewUrl && b.type === 'signature' && b.caption?.enabled && <CanvasSigner box={b} scale={z} boxHpt={r.h} />}
                {!previewUrl && b.type !== 'text' && !(b.type === 'signature' && b.caption?.enabled) && (
                  <div className="pointer-events-none flex h-full w-full items-center justify-center text-slate-500/70">{React.cloneElement(st.icon as React.ReactElement<any>, { className: 'h-5 w-5' })}</div>
                )}
                {sel && <div className="pointer-events-none absolute inset-0 outline outline-2 outline-offset-1 outline-orange-shade" />}
                {single?.id === b.id && !readOnly && !b.locked && !previewUrl && (
                  <>
                    {HANDLES.map((hd) => (
                      <span
                        key={hd}
                        data-handle={hd}
                        data-box={b.id}
                        className="absolute z-30 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-navy bg-orange"
                        style={{ left: `${HANDLE_POS[hd][0] * 100}%`, top: `${HANDLE_POS[hd][1] * 100}%`, cursor: HANDLE_CURSOR[hd] }}
                      />
                    ))}
                    <span className="pointer-events-none absolute left-1/2 top-[-22px] h-[22px] w-0.5 -translate-x-1/2 bg-orange-shade" />
                    <span
                      data-rotate={b.id}
                      title="Rotate (Shift = 15° steps)"
                      className="absolute left-1/2 top-[-30px] z-30 h-3 w-3 -translate-x-1/2 rounded-full border border-navy bg-orange"
                      style={{ cursor: 'grab' }}
                    />
                  </>
                )}
              </div>
            );
          })}
          {groupRect && (
            <div className="pointer-events-none absolute z-30 border-2 border-dashed border-orange-shade" style={{ left: groupRect.x * z, top: groupRect.y * z, width: groupRect.w * z, height: groupRect.h * z }} />
          )}
          {drag?.kind === 'draw' && (
            <div
              className={cx('pointer-events-none absolute z-30 border-2 border-dashed', BOX_STYLE[drag.type].border, BOX_STYLE[drag.type].bg)}
              style={{ left: drag.rect.x * z, top: drag.rect.y * z, width: drag.rect.w * z, height: drag.rect.h * z }}
            />
          )}
          {/* Smart alignment lines */}
          {lines.x.map((x) => (
            <div key={`sx${x}`} className="pointer-events-none absolute top-0 z-40 h-full w-px bg-navy-tint" style={{ left: x * z }} />
          ))}
          {lines.y.map((y) => (
            <div key={`sy${y}`} className="pointer-events-none absolute left-0 z-40 h-px w-full bg-navy-tint" style={{ top: y * z }} />
          ))}
        </div>

        {/* Guides span the whole view, like a design tool. */}
        {shownGuides.map((g) =>
          g.axis === 'x' ? (
            <div key={g.id} data-guide={g.id} className="absolute inset-y-0 z-40 w-[7px] -translate-x-[3px] cursor-ew-resize" style={{ left: vp.panX + (g.pos / 100) * W * z }} title="Drag to move · double-click or drag onto the ruler to remove">
              <div className="mx-auto h-full w-0.5 bg-orange-shade" />
            </div>
          ) : (
            <div key={g.id} data-guide={g.id} className="absolute inset-x-0 z-40 h-[7px] -translate-y-[3px] cursor-ns-resize" style={{ top: vp.panY + (g.pos / 100) * H * z }} title="Drag to move · double-click or drag onto the ruler to remove">
              <div className="my-[2.5px] h-0.5 w-full bg-orange-shade" />
            </div>
          )
        )}

        {drag?.kind === 'marquee' && (
          <div
            className="pointer-events-none absolute z-50 border-2 border-orange-shade bg-orange/10"
            style={{ left: vp.panX + drag.rect.x * z, top: vp.panY + drag.rect.y * z, width: drag.rect.w * z, height: drag.rect.h * z }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- rulers

function Ruler({
  axis,
  length,
  pan,
  zoom,
  unit,
  cursor,
  pageLen,
  onPointerDown,
}: {
  axis: 'x' | 'y';
  length: number;
  pan: number;
  zoom: number;
  unit: Unit;
  cursor: number | null;
  pageLen: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || length <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    const along = length;
    c.width = Math.round((axis === 'x' ? along : RULER) * dpr);
    c.height = Math.round((axis === 'x' ? RULER : along) * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dark = document.documentElement.classList.contains('dark');
    const bg = dark ? '#111a2b' : '#f8fafc';
    const fg = dark ? '#b5c3d8' : '#3a3a3a';
    const pageBg = dark ? '#172033' : '#ffffff';
    g.fillStyle = bg;
    g.fillRect(0, 0, axis === 'x' ? along : RULER, axis === 'x' ? RULER : along);
    // Page extent highlighted.
    g.fillStyle = pageBg;
    if (axis === 'x') g.fillRect(pan, 0, pageLen * zoom, RULER);
    else g.fillRect(0, pan, RULER, pageLen * zoom);
    const pxPerUnit = ptToUnit(1, unit) ? zoom / ptToUnit(1, unit) : zoom;
    const step = niceStep(pxPerUnit);
    const minor = step / (String(step).startsWith('2') || String(step).startsWith('0.2') ? 4 : 5);
    const startU = Math.floor(-pan / pxPerUnit / step) * step;
    const endU = (along - pan) / pxPerUnit;
    g.strokeStyle = fg;
    g.fillStyle = fg;
    g.lineWidth = 1;
    g.font = '10px Roboto, ui-sans-serif, system-ui, sans-serif';
    g.textBaseline = 'top';
    g.beginPath();
    for (let u = startU; u <= endU; u += minor) {
      const pos = Math.round(pan + u * pxPerUnit) + 0.5;
      const isMajor = Math.abs(u / step - Math.round(u / step)) < 1e-6;
      const len = isMajor ? RULER : RULER * 0.3;
      if (axis === 'x') {
        g.moveTo(pos, RULER);
        g.lineTo(pos, RULER - len);
      } else {
        g.moveTo(RULER, pos);
        g.lineTo(RULER - len, pos);
      }
      if (isMajor) {
        const label = String(Math.round(u * 100) / 100);
        if (axis === 'x') g.fillText(label, pos + 3, 2);
        else {
          g.save();
          g.translate(2, pos + 3);
          g.rotate(Math.PI / 2);
          g.fillText(label, 0, -9);
          g.restore();
        }
      }
    }
    g.stroke();
    if (cursor !== null) {
      const pos = Math.round(pan + cursor * zoom) + 0.5;
      g.strokeStyle = '#F68D2E';
      g.beginPath();
      if (axis === 'x') {
        g.moveTo(pos, 0);
        g.lineTo(pos, RULER);
      } else {
        g.moveTo(0, pos);
        g.lineTo(RULER, pos);
      }
      g.stroke();
    }
    // Border towards the canvas.
    g.strokeStyle = dark ? '#36445b' : '#cbd5e1';
    g.beginPath();
    if (axis === 'x') {
      g.moveTo(0, RULER - 0.5);
      g.lineTo(along, RULER - 0.5);
    } else {
      g.moveTo(RULER - 0.5, 0);
      g.lineTo(RULER - 0.5, along);
    }
    g.stroke();
  }, [axis, length, pan, zoom, unit, cursor, pageLen]);

  return (
    <canvas
      ref={ref}
      onPointerDown={onPointerDown}
      title={axis === 'x' ? 'Drag down to add a horizontal guide' : 'Drag right to add a vertical guide'}
      className="absolute z-20"
      style={
        axis === 'x'
          ? { left: RULER, top: 0, width: length, height: RULER, cursor: 'ns-resize' }
          : { left: 0, top: RULER, width: RULER, height: length, cursor: 'ew-resize' }
      }
    />
  );
}
