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
  opts: { reference?: boolean; templateId?: string } = {}
): Promise<ArtworkResult> {
  const kind = opts.reference ? 'reference' : 'artwork';
  const tq = opts.templateId ? `&templateId=${encodeURIComponent(opts.templateId)}` : '';
  const what = opts.reference ? 'reference certificate' : 'blank design';
  if (file.size > MAX_ARTWORK_BYTES) throw new Error('The file is larger than 25 MB.');
  const buf = await file.arrayBuffer();
  const mime = sniff(new Uint8Array(buf.slice(0, 8)));
  if (!mime) throw new Error('Unsupported file. Upload a PDF, PNG or JPG certificate design.');

  onStatus?.(`Reading the ${what}…`);
  if (mime === 'application/pdf') {
    // Validate before upload.
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    if (doc.isEncrypted) throw new Error('This PDF is password-protected or encrypted. Export an unprotected copy and try again.');
    if (doc.getPageCount() > MAX_PAGES) throw new Error(`The PDF has ${doc.getPageCount()} pages. Certificates can have at most ${MAX_PAGES} pages.`);
  }
  const geometry = await readArtworkPages(buf, mime);

  onStatus?.(`Uploading the ${what}…`);
  const art = await api.upload<{ id: string }>(`/api/admin/files?kind=${kind}&name=${encodeURIComponent(file.name)}${tq}`, file);

  const pages: TemplateLayout['pages'] = [];
  if (mime === 'application/pdf') {
    for (let i = 0; i < geometry.length; i++) {
      onStatus?.(`Creating ${what} preview ${i + 1} of ${geometry.length}…`);
      const canvas = await renderPdfPage(buf, i, 1800, undefined, 1);
      const png = await canvasToPngBlob(canvas);
      const prev = await api.upload<{ id: string }>(`/api/admin/files?kind=preview${opts.reference ? '&role=reference' : ''}${tq}`, png);
      pages.push({ width: geometry[i].width, height: geometry[i].height, previewFileId: prev.id });
    }
  } else {
    pages.push({ width: geometry[0].width, height: geometry[0].height, previewFileId: art.id });
  }
  return { artworkFileId: art.id, artworkMime: mime, pages };
}
