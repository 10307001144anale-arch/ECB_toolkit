// Visual box editor over the certificate artwork. Boxes are stored as
// percentages of the page, so they are independent of screen size.

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImageIcon, PenLine, QrCode, Type } from 'lucide-react';
import type { BoxType, SignatureBox, TemplateBox, TemplateLayout, TextBox } from '../../../../shared/types';
import { signatureOrder, signatureSplit } from '../../../../shared/layout';
import { applyTransform, TEXT_PADDING } from '../../../engine/textLayout';
import { fileUrl } from '../../../lib/api';
import { cx } from '../../../components/ui';

export type Tool = 'select' | BoxType;
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const BOX_STYLE: Record<BoxType, { border: string; bg: string; chip: string; icon: React.ReactNode; name: string }> = {
  text: { border: 'border-sky-500', bg: 'bg-sky-400/10', chip: 'bg-sky-600', icon: <Type className="h-3 w-3" />, name: 'Text box' },
  qr: { border: 'border-violet-500', bg: 'bg-violet-400/10', chip: 'bg-violet-600', icon: <QrCode className="h-3 w-3" />, name: 'QR code box' },
  photo: { border: 'border-emerald-500', bg: 'bg-emerald-400/10', chip: 'bg-emerald-600', icon: <ImageIcon className="h-3 w-3" />, name: 'Photo box' },
  signature: { border: 'border-amber-500', bg: 'bg-amber-400/10', chip: 'bg-amber-600', icon: <PenLine className="h-3 w-3" />, name: 'Signature box' },
};

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];
const HANDLE_POS: Record<Handle, string> = {
  nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
  n: 'left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize',
  ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
  e: '-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize',
  se: '-right-1.5 -bottom-1.5 cursor-nwse-resize',
  s: 'left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize',
  sw: '-left-1.5 -bottom-1.5 cursor-nesw-resize',
  w: '-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize',
};

const MIN = 0.8; // minimum box size in %

function clampRect(r: Rect): Rect {
  const w = Math.min(100, Math.max(MIN, r.w));
  const h = Math.min(100, Math.max(MIN, r.h));
  return { x: Math.min(100 - w, Math.max(0, r.x)), y: Math.min(100 - h, Math.max(0, r.y)), w, h };
}
const round = (n: number) => Math.round(n * 100) / 100;
const roundRect = (r: Rect): Rect => ({ x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) });

interface Props {
  layout: TemplateLayout;
  page: number;
  zoom: number | 'fit';
  onFitScale: (s: number) => void;
  tool: Tool;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (type: BoxType, rect: Rect) => void;
  onRectChange: (id: string, rect: Rect, commit: boolean) => void;
  previewUrl: string | null;
  /** blank = design used for PDFs; reference = finished example; overlay = example over the blank design. */
  view?: 'blank' | 'reference' | 'overlay';
}

type Drag =
  | { kind: 'draw'; type: BoxType; startX: number; startY: number; rect: Rect }
  | { kind: 'move'; id: string; startX: number; startY: number; orig: Rect; moved: boolean }
  | { kind: 'resize'; id: string; handle: Handle; startX: number; startY: number; orig: Rect };

export function DesignCanvas({ layout, page, zoom, onFitScale, tool, selectedId, onSelect, onCreate, onRectChange, previewUrl, view = 'blank' }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const pg = layout.pages[page];

  // Fit-to-screen scale.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pg) return;
    const compute = () => {
      const pad = 64;
      const s = Math.min((el.clientWidth - pad) / pg.width, (el.clientHeight - pad) / pg.height);
      const v = Math.max(0.1, s);
      setFitScale(v);
      onFitScale(v);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pg?.width, pg?.height, onFitScale]);

  const scale = zoom === 'fit' ? fitScale : zoom;

  const toPct = useCallback((clientX: number, clientY: number) => {
    const r = paperRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
  }, []);

  const onPaperPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if (tool === 'select') {
      onSelect(null);
      return;
    }
    const p = toPct(e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: 'draw', type: tool, startX: p.x, startY: p.y, rect: { x: p.x, y: p.y, w: 0, h: 0 } });
  };

  const onBoxPointerDown = (e: React.PointerEvent, b: TemplateBox) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(b.id);
    const p = toPct(e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: 'move', id: b.id, startX: p.x, startY: p.y, orig: { x: b.x, y: b.y, w: b.w, h: b.h }, moved: false });
  };

  const onHandlePointerDown = (e: React.PointerEvent, b: TemplateBox, handle: Handle) => {
    e.stopPropagation();
    const p = toPct(e.clientX, e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: 'resize', id: b.id, handle, startX: p.x, startY: p.y, orig: { x: b.x, y: b.y, w: b.w, h: b.h } });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toPct(e.clientX, e.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (drag.kind === 'draw') {
      const x = Math.max(0, Math.min(drag.startX, p.x));
      const y = Math.max(0, Math.min(drag.startY, p.y));
      const x2 = Math.min(100, Math.max(drag.startX, p.x));
      const y2 = Math.min(100, Math.max(drag.startY, p.y));
      setDrag({ ...drag, rect: { x, y, w: x2 - x, h: y2 - y } });
    } else if (drag.kind === 'move') {
      if (!drag.moved && Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return;
      setDrag({ ...drag, moved: true });
      onRectChange(drag.id, roundRect(clampRect({ ...drag.orig, x: drag.orig.x + dx, y: drag.orig.y + dy })), false);
    } else {
      const o = drag.orig;
      let { x, y, w, h } = o;
      const hd = drag.handle;
      if (hd.includes('e')) w = Math.min(100 - o.x, Math.max(MIN, o.w + dx));
      if (hd.includes('s')) h = Math.min(100 - o.y, Math.max(MIN, o.h + dy));
      if (hd.includes('w')) {
        const nx = Math.min(o.x + o.w - MIN, Math.max(0, o.x + dx));
        w = o.w + (o.x - nx);
        x = nx;
      }
      if (hd.includes('n')) {
        const ny = Math.min(o.y + o.h - MIN, Math.max(0, o.y + dy));
        h = o.h + (o.y - ny);
        y = ny;
      }
      onRectChange(drag.id, roundRect({ x, y, w, h }), false);
    }
  };

  const stopMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    onPointerMove(e);
  };
  const stopUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    onPointerUp();
  };

  const onPointerUp = () => {
    if (!drag) return;
    if (drag.kind === 'draw') {
      let r = drag.rect;
      // A simple click creates a sensibly sized box at that point.
      if (r.w < 1.5 || r.h < 1.5) {
        const def = drag.type === 'text' ? { w: 40, h: 7 } : drag.type === 'qr' ? { w: (12 * pg.height) / pg.width, h: 12 } : drag.type === 'photo' ? { w: 11, h: (14 * pg.width) / pg.height } : { w: 18, h: 8 };
        r = { x: drag.startX - def.w / 2, y: drag.startY - def.h / 2, ...def };
      }
      onCreate(drag.type, roundRect(clampRect(r)));
    } else if (drag.kind === 'move') {
      const b = layout.boxes.find((x) => x.id === drag.id);
      if (b && drag.moved) onRectChange(b.id, { x: b.x, y: b.y, w: b.w, h: b.h }, true);
    } else {
      const b = layout.boxes.find((x) => x.id === drag.id);
      if (b) onRectChange(b.id, { x: b.x, y: b.y, w: b.w, h: b.h }, true);
    }
    setDrag(null);
  };

  if (!pg) return null;
  const boxes = layout.boxes.filter((b) => b.page === page);
  const refPg = layout.referencePages?.[page];
  const refImg = refPg?.previewFileId ? fileUrl(refPg.previewFileId) : null;
  const img = view === 'reference' && refImg && !previewUrl ? refImg : previewUrl || fileUrl(pg.previewFileId);
  const ov = layout.referenceOverlay;
  const sigNumber = new Map(signatureOrder(layout.boxes).map((b, i) => [b.id, i + 1]));

  return (
    <div ref={scrollRef} className="checkerboard relative flex-1 overflow-auto">
      <div className="flex min-h-full min-w-full items-center justify-center p-8">
        <div
          ref={paperRef}
          className={cx('relative shrink-0 select-none bg-white shadow-lg ring-1 ring-slate-300', tool !== 'select' && 'cursor-crosshair')}
          style={{ width: pg.width * scale, height: pg.height * scale, touchAction: 'none' }}
          onPointerDown={onPaperPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {img && <img src={img} alt="Certificate artwork" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />}
          {view === 'overlay' && refImg && (
            // Locked, non-editable reference layer.
            <img
              src={refImg}
              alt="Reference certificate overlay"
              className="pointer-events-none absolute left-0 top-0 h-full w-full select-none"
              style={{ opacity: ov?.opacity ?? 0.5, transformOrigin: '0 0', transform: `translate(${ov?.offsetX ?? 0}%, ${ov?.offsetY ?? 0}%) scale(${ov?.scale ?? 1})` }}
              draggable={false}
            />
          )}
          {boxes.map((b) => {
            const st = BOX_STYLE[b.type];
            const selected = b.id === selectedId;
            return (
              <div
                key={b.id}
                onPointerDown={(e) => onBoxPointerDown(e, b)}
                onPointerMove={stopMove}
                onPointerUp={stopUp}
                className={cx(
                  'group absolute border-2',
                  previewUrl ? 'border-dashed bg-transparent opacity-60' : st.bg,
                  st.border,
                  selected ? 'z-20 ring-2 ring-white/70' : 'z-10 hover:z-20',
                  tool === 'select' ? 'cursor-move' : 'cursor-crosshair'
                )}
                style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}
                role="button"
                aria-label={`${st.name}: ${b.label}`}
                aria-pressed={selected}
              >
                <span className={cx('pointer-events-none absolute -top-5 left-[-2px] flex max-w-[200%] items-center gap-1 truncate rounded-t px-1.5 py-0.5 text-[10px] font-medium text-white', st.chip, !selected && 'opacity-80')}>
                  {st.icon}
                  {b.type === 'signature' && <span className="rounded bg-white/30 px-1">{sigNumber.get(b.id)}</span>}
                  {b.label}
                  {b.required && b.type === 'text' ? ' *' : ''}
                </span>
                {!previewUrl && b.type === 'text' && <CanvasText box={b} scale={scale} />}
                {!previewUrl && b.type === 'signature' && b.caption?.enabled && <CanvasSigner box={b} scale={scale} boxHpt={(b.h / 100) * pg.height} />}
                {!previewUrl && b.type !== 'text' && !(b.type === 'signature' && b.caption?.enabled) && (
                  <div className="pointer-events-none flex h-full w-full items-center justify-center text-slate-500/70">{React.cloneElement(st.icon as React.ReactElement<any>, { className: 'h-5 w-5' })}</div>
                )}
                {selected &&
                  !previewUrl &&
                  HANDLES.map((hd) => (
                    <span
                      key={hd}
                      onPointerDown={(e) => onHandlePointerDown(e, b, hd)}
                      onPointerMove={stopMove}
                      onPointerUp={stopUp}
                      className={cx('absolute z-30 h-3 w-3 rounded-sm border border-slate-700 bg-white', HANDLE_POS[hd])}
                    />
                  ))}
              </div>
            );
          })}
          {drag?.kind === 'draw' && (
            <div
              className={cx('pointer-events-none absolute border-2 border-dashed', BOX_STYLE[drag.type].border, BOX_STYLE[drag.type].bg)}
              style={{ left: `${drag.rect.x}%`, top: `${drag.rect.y}%`, width: `${drag.rect.w}%`, height: `${drag.rect.h}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- text inside a box

const CSS_FONT: Record<string, string> = { Helvetica: 'LiberationSans', Times: 'LiberationSerif', Courier: 'LiberationMono' };

/**
 * Text drawn the way a design tool does: it wraps at the box edge, follows the
 * horizontal / vertical alignment, and (with "Fit text automatically") shrinks
 * between the maximum and minimum size until it fits — matching the PDF.
 */
function CanvasText({ box, scale }: { box: TextBox; scale: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const placeholder = !box.defaultText;
  const raw = placeholder ? box.label : box.defaultText;
  const text = applyTransform(box.multiline ? raw : raw.replace(/\s*\r?\n\s*/g, ' '), box.transform);
  const maxPt = box.autoFit ? box.maxFontSize : box.fontSize;
  const minPt = box.autoFit ? Math.min(box.minFontSize, box.maxFontSize) : box.fontSize;
  const [pt, setPt] = useState(maxPt);
  const [overflow, setOverflow] = useState(false);
  const family = CSS_FONT[box.fontFamily] || box.fontFamily;
  const pad = TEXT_PADDING * scale;

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fitsAt = (size: number) => {
      i.style.fontSize = `${size * scale}px`;
      return i.scrollHeight <= o.clientHeight - 2 * pad + 0.5 && i.scrollWidth <= o.clientWidth - 2 * pad + 0.5;
    };
    let size = maxPt;
    if (box.autoFit) {
      while (size > minPt && !fitsAt(size)) size = Math.max(minPt, Math.round((size - 0.5) * 2) / 2);
    }
    const ok = fitsAt(size);
    setPt(size);
    setOverflow(!ok);
  }, [text, box, scale, maxPt, minPt, pad]);

  // Re-measure once the certificate fonts have loaded.
  const [, bump] = useState(0);
  useEffect(() => {
    document.fonts?.ready.then(() => bump((n) => n + 1));
  }, []);

  return (
    <div
      ref={outer}
      className={cx('pointer-events-none absolute inset-0 flex flex-col overflow-hidden', overflow && 'bg-red-500/10')}
      style={{ padding: pad, justifyContent: box.vAlign === 'top' ? 'flex-start' : box.vAlign === 'bottom' ? 'flex-end' : 'center' }}
      title={overflow ? 'This text does not fit in the box' : undefined}
    >
      <div
        ref={inner}
        className={placeholder ? 'italic opacity-40' : 'opacity-90'}
        style={{
          fontFamily: `"${family}", "${box.fontFamily}", sans-serif`,
          fontWeight: Number(box.fontWeight),
          fontStyle: box.italic && !placeholder ? 'italic' : undefined,
          color: box.color,
          fontSize: pt * scale,
          lineHeight: box.lineHeight,
          letterSpacing: box.letterSpacing ? box.letterSpacing * scale : undefined,
          textAlign: box.align,
          whiteSpace: box.wrap ? (box.multiline ? 'pre-wrap' : 'normal') : box.multiline ? 'pre' : 'nowrap',
          overflowWrap: box.wrap ? 'anywhere' : undefined,
          width: '100%',
        }}
      >
        {box.defaultRich && !placeholder
          ? box.defaultRich.paragraphs.map((p, pi) => (
              <div key={pi} style={{ textAlign: p.align || box.align, minHeight: '1em' }}>
                {p.runs.map((r, ri) => (
                  <span
                    key={ri}
                    style={{
                      fontWeight: r.b === undefined ? undefined : r.b ? 700 : 400,
                      fontStyle: r.i === undefined ? undefined : r.i ? 'italic' : 'normal',
                      textDecoration: r.u ? 'underline' : undefined,
                      color: r.color,
                      backgroundColor: r.bg,
                      fontSize: r.size && r.size !== 1 ? `${r.size}em` : undefined,
                    }}
                  >
                    {applyTransform(r.text, box.transform)}
                  </span>
                ))}
              </div>
            ))
          : text}
      </div>
    </div>
  );
}

/** Signature box with the signer's line, name and title, as they will be printed. */
function CanvasSigner({ box, scale, boxHpt }: { box: SignatureBox; scale: number; boxHpt: number }) {
  const c = box.caption;
  const name = c.name || 'Signer name';
  const sp = signatureSplit(box, boxHpt, !!c.title);
  if (!sp) return null;
  const family = CSS_FONT[c.fontFamily] || c.fontFamily;
  const just = box.align === 'left' ? 'flex-start' : box.align === 'right' ? 'flex-end' : 'center';
  const lineStyle = { position: 'absolute' as const, left: 0, right: 0, display: 'flex', justifyContent: just, whiteSpace: 'nowrap' as const, overflow: 'hidden', color: c.color, fontFamily: `"${family}", "${c.fontFamily}", sans-serif` };
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-0 flex items-center justify-center text-slate-500/70" style={{ height: sp.imageH * scale }}>
        <PenLine className="h-5 w-5" />
      </div>
      {sp.lineY !== null && (
        <div style={{ position: 'absolute', top: sp.lineY * scale, left: box.align === 'left' ? 0 : box.align === 'right' ? '10%' : '5%', width: '90%', borderTop: `${Math.max(1, sp.nameSize * 0.06 * scale)}px solid ${c.color}` }} />
      )}
      <div style={{ ...lineStyle, top: sp.nameTop * scale, fontSize: sp.nameSize * scale, lineHeight: 1.15, fontWeight: c.bold ? 700 : 400, opacity: c.name ? 1 : 0.5 }}>{name}</div>
      {c.title && <div style={{ ...lineStyle, top: sp.titleTop * scale, fontSize: sp.titleSize * scale, lineHeight: 1.15 }}>{c.title}</div>}
    </div>
  );
}
