// Participant photographs and signatures: loading, ZIP extraction, filename
// matching and preparation for the PDF (crop / fit / shape). Images never
// leave the browser.

import JSZip from 'jszip';
import type { PhotoBox, SignatureBox } from '../../shared/types';

export interface ImageFileEntry {
  name: string; // original file name (basename)
  blob: Blob;
  size: number;
}

export interface PreparedImage {
  bytes: Uint8Array;
  kind: 'png' | 'jpg';
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function baseName(p: string): string {
  return p.split(/[\\/]/).pop()!.trim();
}

/** Normalised key used for matching: lower-case basename, and the same without extension. */
export function imageKeys(name: string): string[] {
  const b = baseName(name).toLowerCase();
  const noExt = b.replace(/\.[a-z0-9]{2,5}$/, '');
  return b === noExt ? [b] : [b, noExt];
}

export interface ImageAddResult {
  added: ImageFileEntry[];
  skipped: { name: string; reason: string }[];
}

/** Accepts image files and ZIP archives containing images. */
export async function readImageFiles(files: File[]): Promise<ImageAddResult> {
  const added: ImageFileEntry[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || f.type === 'application/zip' || f.type === 'application/x-zip-compressed') {
      try {
        const zip = await JSZip.loadAsync(f);
        const entries = Object.values(zip.files).filter((e) => !e.dir && !/(^|\/)(__MACOSX|\.)/.test(e.name));
        for (const e of entries) {
          if (!IMAGE_EXT.test(e.name)) {
            skipped.push({ name: e.name, reason: 'Not an image' });
            continue;
          }
          const blob = await e.async('blob');
          if (blob.size > MAX_IMAGE_BYTES) {
            skipped.push({ name: e.name, reason: 'Larger than 10 MB' });
            continue;
          }
          const type = /\.png$/i.test(e.name) ? 'image/png' : /\.webp$/i.test(e.name) ? 'image/webp' : /\.gif$/i.test(e.name) ? 'image/gif' : /\.bmp$/i.test(e.name) ? 'image/bmp' : 'image/jpeg';
          added.push({ name: baseName(e.name), blob: new Blob([blob], { type }), size: blob.size });
        }
      } catch {
        skipped.push({ name: f.name, reason: 'Could not open ZIP file' });
      }
      continue;
    }
    if (!IMAGE_EXT.test(f.name) && !f.type.startsWith('image/')) {
      skipped.push({ name: f.name, reason: 'Not an image' });
      continue;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      skipped.push({ name: f.name, reason: 'Larger than 10 MB' });
      continue;
    }
    added.push({ name: baseName(f.name), blob: f, size: f.size });
  }
  return { added, skipped };
}

export class ImageLibrary {
  private byKey = new Map<string, ImageFileEntry>();
  readonly entries: ImageFileEntry[] = [];

  constructor(entries: ImageFileEntry[] = []) {
    for (const e of entries) this.add(e);
  }

  add(e: ImageFileEntry) {
    const existing = this.entries.findIndex((x) => x.name.toLowerCase() === e.name.toLowerCase());
    if (existing >= 0) this.entries.splice(existing, 1, e);
    else this.entries.push(e);
    for (const k of imageKeys(e.name)) this.byKey.set(k, e);
  }

  find(value: string | undefined | null): ImageFileEntry | null {
    if (!value || !String(value).trim()) return null;
    for (const k of imageKeys(String(value))) {
      const hit = this.byKey.get(k);
      if (hit) return hit;
    }
    return null;
  }

  get size() {
    return this.entries.length;
  }
}

// ---------------------------------------------------------------- preparation

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error('The image could not be read. Use JPG or PNG files.');
  }
}

function canvasToBytes(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg'): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      async (b) => {
        if (!b) return reject(new Error('Image conversion failed.'));
        resolve(new Uint8Array(await b.arrayBuffer()));
      },
      type,
      0.92
    )
  );
}

const prepCache = new Map<string, Promise<PreparedImage>>();
const blobIds = new WeakMap<Blob, number>();
let nextBlobId = 1;
function blobId(b: Blob) {
  let id = blobIds.get(b);
  if (!id) {
    id = nextBlobId++;
    blobIds.set(b, id);
  }
  return id;
}

/**
 * Produces an image that exactly fills the box (cover / contain / stretch,
 * alignment, rounded or circular mask) at roughly 300 DPI.
 */
export function prepareImage(blob: Blob, box: PhotoBox | SignatureBox, boxWpt: number, boxHpt: number): Promise<PreparedImage> {
  const fit = box.type === 'photo' ? box.fit : box.fit;
  const shape = box.type === 'photo' ? box.shape : 'rectangle';
  const align = box.type === 'photo' ? box.align : box.align;
  const key = `${blobId(blob)}|${fit}|${shape}|${align}|${boxWpt.toFixed(1)}x${boxHpt.toFixed(1)}`;
  let p = prepCache.get(key);
  if (!p) {
    p = (async () => {
      const bmp = await decode(blob);
      const scale = Math.min(300 / 72, 1600 / Math.max(boxWpt, boxHpt));
      const W = Math.max(8, Math.round(boxWpt * scale));
      const H = Math.max(8, Math.round(boxHpt * scale));
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      if (shape !== 'rectangle') {
        ctx.beginPath();
        if (shape === 'circle') ctx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
        else {
          const r = Math.min(W, H) * 0.08;
          ctx.roundRect(0, 0, W, H, r);
        }
        ctx.clip();
      }
      const iw = bmp.width;
      const ih = bmp.height;
      let dx = 0, dy = 0, dw = W, dh = H;
      if (fit !== 'stretch') {
        const s = fit === 'cover' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
        dw = iw * s;
        dh = ih * s;
        const hx = align === 'left' ? 0 : align === 'right' ? 1 : 0.5;
        const vy = align === 'top' ? 0 : align === 'bottom' ? 1 : 0.5;
        dx = (W - dw) * hx;
        dy = (H - dh) * vy;
      }
      ctx.drawImage(bmp, dx, dy, dw, dh);
      bmp.close?.();
      // JPEG keeps photos small; PNG is required for transparency (signatures, masks, contain).
      const transparent = box.type === 'signature' || shape !== 'rectangle' || fit === 'contain' || blob.type === 'image/png';
      const type = transparent ? 'image/png' : 'image/jpeg';
      return { bytes: await canvasToBytes(canvas, type), kind: type === 'image/png' ? 'png' : 'jpg' } as PreparedImage;
    })();
    // Small LRU so large batches do not keep every processed photo in memory.
    if (prepCache.size >= 120) prepCache.delete(prepCache.keys().next().value!);
    prepCache.set(key, p);
    p.catch(() => prepCache.delete(key));
  }
  return p;
}

export function clearPreparedImages() {
  prepCache.clear();
}
