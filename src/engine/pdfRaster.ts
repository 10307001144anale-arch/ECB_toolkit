// pdf.js helpers: rasterise PDF pages for previews. The worker is bundled
// locally by Vite (no CDN dependency).

import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export function openPdf(bytes: ArrayBuffer | Uint8Array) {
  // pdf.js transfers (detaches) the buffer it receives, so always pass a copy.
  const data = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  return pdfjsLib.getDocument({ data });
}

/**
 * Renders one page into the given canvas (or a new one) at `targetWidth` CSS
 * pixels, multiplied by devicePixelRatio for sharpness.
 */
export async function renderPdfPage(
  bytes: ArrayBuffer | Uint8Array,
  pageIndex: number,
  targetWidth: number,
  canvas?: HTMLCanvasElement,
  dpr = Math.min(2, window.devicePixelRatio || 1)
): Promise<HTMLCanvasElement> {
  const task = openPdf(bytes);
  const pdf = await task.promise;
  try {
    const page = await pdf.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = (targetWidth / base.width) * dpr;
    const viewport = page.getViewport({ scale });
    const c = canvas || document.createElement('canvas');
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport, canvas: c } as any).promise;
    return c;
  } finally {
    task.destroy();
  }
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Rendering failed'))), 'image/png'));
}
