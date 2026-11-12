// Shows a certificate exactly as it will be generated: the real PDF is
// produced by the rendering engine and rasterised with pdf.js.

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { CertificateRenderer, RenderWarning, ResolvedCertificate } from '../../../engine/renderer';
import { renderPdfPage } from '../../../engine/pdfRaster';
import { IconButton, cx } from '../../../components/ui';

interface Props {
  renderer: CertificateRenderer;
  cert: ResolvedCertificate | null;
  highlightKey?: string | null;
  className?: string;
  onWarnings?: (w: RenderWarning[]) => void;
  debounceMs?: number;
}

export function CertificatePreview({ renderer, cert, highlightKey, className, onWarnings, debounceMs = 350 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<RenderWarning[]>([]);
  const [width, setWidth] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.clientWidth)));
    ro.observe(el);
    setWidth(Math.round(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // Jump to the page that holds the highlighted box.
  useEffect(() => {
    if (!highlightKey) return;
    const b = renderer.layout.boxes.find((x) => x.key === highlightKey);
    if (b && b.page !== page) setPage(b.page);
  }, [highlightKey, renderer, page]);

  useEffect(() => {
    if (!cert || width < 50) return;
    const my = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const { bytes, warnings } = await renderer.renderSingle(cert, { placeholders: true });
        if (my !== seq.current) return;
        // Render off-screen, then copy, so overlapping renders never share a canvas.
        const off = await renderPdfPage(bytes, Math.min(page, renderer.pageCount - 1), width);
        if (my !== seq.current) return;
        const c = canvasRef.current!;
        c.width = off.width;
        c.height = off.height;
        c.getContext('2d')!.drawImage(off, 0, 0);
        setWarnings(warnings);
        onWarnings?.(warnings);
        setError(null);
      } catch (e: any) {
        if (my === seq.current) setError(e.message || 'Preview failed');
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, debounceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cert, renderer, page, width]);

  const size = renderer.pageSize(page);
  const hl = highlightKey ? renderer.layout.boxes.find((b) => b.key === highlightKey && b.page === page) : null;

  return (
    <div className={className}>
      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-200" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label="Certificate preview" role="img" />
        {hl && (
          <div
            className="pointer-events-none absolute rounded-sm ring-2 ring-brand-500 ring-offset-1 transition-all"
            style={{ left: `${hl.x}%`, top: `${hl.y}%`, width: `${hl.w}%`, height: `${hl.h}%`, background: 'rgba(42,97,176,0.08)' }}
          />
        )}
        {busy && (
          <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-white/90 px-2 py-1 text-xs text-slate-600 shadow">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating
          </div>
        )}
        {error && <div className="absolute inset-x-2 bottom-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</div>}
      </div>
      {renderer.pageCount > 1 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-600">
          <IconButton label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          Page {page + 1} of {renderer.pageCount}
          <IconButton label="Next page" disabled={page >= renderer.pageCount - 1} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </IconButton>
        </div>
      )}
      {warnings.length > 0 && (
        <div className={cx('mt-2 space-y-1')}>
          {warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
