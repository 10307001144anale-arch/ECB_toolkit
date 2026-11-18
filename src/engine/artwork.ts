// Admin artwork upload: validates the file, measures its pages exactly as the
// renderer will, uploads the untouched original and a PNG preview per page.

import { PDFDocument } from 'pdf-lib';
import { api } from '../lib/api';
import type { TemplateLayout } from '../../shared/types';
import { readArtworkPages } from './renderer';
import { canvasToPngBlob, renderPdfPage } from './pdfRaster';

export const MAX_ARTWORK_BYTES = 25 * 1024 * 1024;
const MAX_PAGES = 10;

function sniff(bytes: Uint8Array): 'application/pdf' | 'image/png' | 'image/jpeg' | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

/** True when the file is an SVG drawing (checked by content, not by name). */
export async function isSvg(file: Blob): Promise<boolean> {
  const head = (await file.slice(0, 1024).text()).trimStart().toLowerCase();
  return head.startsWith('<svg') || ((head.startsWith('<?xml') || head.startsWith('<!--')) && head.includes('<svg'));
}

/**
 * Converts an SVG design to a high-resolution PNG (about 300 dpi on A4), so it
 * can be used as artwork like any other image. SVG files are never stored as-is
 * (they can contain scripts).
 */
export async function svgToPng(file: File): Promise<File> {
  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('This SVG file could not be read.');
  // Size from width/height, else the viewBox.
  const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  const unit = (v: string | null) => {
    if (!v) return NaN;
    const n = parseFloat(v);
    if (/mm$/.test(v)) return (n * 96) / 25.4;
    if (/cm$/.test(v)) return (n * 96) / 2.54;
    if (/in$/.test(v)) return n * 96;
    if (/pt$/.test(v)) return (n * 96) / 72;
    if (/%$/.test(v)) return NaN;
    return n;
  };
  let w = unit(svg.getAttribute('width'));
  let h = unit(svg.getAttribute('height'));
  if (!(w > 0 && h > 0) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    w = vb[2];
    h = vb[3];
  }
  if (!(w > 0 && h > 0)) throw new Error('The SVG has no size. Set width/height or a viewBox and export it again.');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  // Scripts and event handlers are removed before drawing.
  doc.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
  const clean = new XMLSerializer().serializeToString(doc);
  const url = URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('This SVG file could not be drawn. Fonts or images it links to may be missing.'));
      img.src = url;
    });
    const scale = Math.min(8, 3508 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToPngBlob(canvas);
    return new File([blob], file.name.replace(/\.svg$/i, '') + '.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type ArtworkResult = Pick<TemplateLayout, 'artworkFileId' | 'artworkMime' | 'pages'>;
export type ReferenceResult = Pick<TemplateLayout, 'referenceFileId' | 'referenceMime' | 'referencePages'>;

/** Uploads the complete reference certificate (visual guide only — never printed). */
export async function processReference(file: File, onStatus?: (s: string) => void, templateId?: string): Promise<ReferenceResult> {
  const r = await processArtwork(file, onStatus, { reference: true, templateId });
  return { referenceFileId: r.artworkFileId, referenceMime: r.artworkMime, referencePages: r.pages };
}

/** Uploads the blank design (the PDF background). */
export async function processArtwork(
  file: File,
  onStatus?: (s: string) => void,
  opts: { reference?: boolean; templateId?: string; uploadUrl?: string } = {}
): Promise<ArtworkResult> {
  const upload = opts.uploadUrl || '/api/superadmin/files';
  if (await isSvg(file)) {
    onStatus?.('Converting the SVG drawing…');
    file = await svgToPng(file);
  }
  const kind = opts.reference ? 'reference' : 'artwork';
  const tq = opts.templateId ? `&templateId=${encodeURIComponent(opts.templateId)}` : '';
  const what = opts.reference ? 'reference certificate' : 'blank design';
  if (file.size > MAX_ARTWORK_BYTES) throw new Error('The file is larger than 25 MB.');
  const buf = await file.arrayBuffer();
  const mime = sniff(new Uint8Array(buf.slice(0, 8)));
  if (!mime) throw new Error('Unsupported file. Upload a PDF, PNG, JPG or SVG certificate design.');

  onStatus?.(`Reading the ${what}…`);
  if (mime === 'application/pdf') {
    // Validate before upload.
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    if (doc.isEncrypted) throw new Error('This PDF is password-protected or encrypted. Export an unprotected copy and try again.');
    if (doc.getPageCount() > MAX_PAGES) throw new Error(`The PDF has ${doc.getPageCount()} pages. Certificates can have at most ${MAX_PAGES} pages.`);
  }
  const geometry = await readArtworkPages(buf, mime);

  onStatus?.(`Uploading the ${what}…`);
  const art = await api.upload<{ id: string }>(`${upload}?kind=${kind}&name=${encodeURIComponent(file.name)}${tq}`, file);

  const pages: TemplateLayout['pages'] = [];
  if (mime === 'application/pdf') {
    for (let i = 0; i < geometry.length; i++) {
      onStatus?.(`Creating ${what} preview ${i + 1} of ${geometry.length}…`);
      const canvas = await renderPdfPage(buf, i, 1800, undefined, 1);
      const png = await canvasToPngBlob(canvas);
      const prev = await api.upload<{ id: string }>(`${upload}?kind=preview${opts.reference ? '&role=reference' : ''}${tq}`, png);
      pages.push({ width: geometry[i].width, height: geometry[i].height, previewFileId: prev.id });
    }
  } else {
    pages.push({ width: geometry[0].width, height: geometry[0].height, previewFileId: art.id });
  }
  return { artworkFileId: art.id, artworkMime: mime, pages };
}
