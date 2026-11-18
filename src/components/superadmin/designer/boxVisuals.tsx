// Box styles and the WYSIWYG text/signer rendering used inside the designer's
// workspace (see Workspace.tsx). Boxes are stored as percentages of the page.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ImageIcon, PenLine, QrCode, Type } from 'lucide-react';
import type { BoxType, SignatureBox, TextBox } from '../../../../shared/types';
import { signatureSplit } from '../../../../shared/layout';
import { applyTransform, TEXT_PADDING } from '../../../engine/textLayout';
import { cx } from '../../../components/shared/ui';

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

// ---------------------------------------------------------------- text inside a box

const CSS_FONT: Record<string, string> = { Helvetica: 'LiberationSans', Times: 'LiberationSerif', 'Times New Roman': 'Times New Roman Cert', Courier: 'LiberationMono', Roboto: 'Roboto', 'DDC Uchen': 'DDC Uchen' };

/**
 * Text drawn the way a design tool does: it wraps at the box edge, follows the
 * horizontal / vertical alignment, and (with "Fit text automatically") shrinks
 * between the maximum and minimum size until it fits — matching the PDF.
 */
export function CanvasText({ box, scale }: { box: TextBox; scale: number }) {
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
        className={placeholder ? 'italic opacity-70' : 'opacity-95'}
        style={{
          fontFamily: `"${family}", "${box.fontFamily}", "DDC Uchen", sans-serif`,
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
export function CanvasSigner({ box, scale, boxHpt }: { box: SignatureBox; scale: number; boxHpt: number }) {
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
