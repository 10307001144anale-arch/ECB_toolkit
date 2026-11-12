// Participant photographs and signatures: loading, ZIP extraction, matching
// (by file name or participant ID such as CID — never by upload order),
// automatic face/subject cropping, manual crop correction, signature
// trimming and placement. Images never leave the browser.

import JSZip from 'jszip';
import type { PhotoBox, PhotoCrop, SignatureBox } from '../../shared/types';

export interface ImageFileEntry {
  name: string; // original file name (basename)
  blob: Blob;
  size: number;
}

export interface PreparedImage {
  bytes: Uint8Array;
  kind: 'png' | 'jpg';
}

export interface SignaturePlacement {
  scale: number; // 0.3 – 1 of the box
  offsetX: number; // -1 … 1
  offsetY: number; // -1 … 1
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function baseName(p: string): string {
  return p.split(/[\\/]/).pop()!.trim();
}

/** Normalised keys used for matching: lower-case basename, and the same without extension. */
export function imageKeys(name: string): string[] {
  const b = baseName(name).toLowerCase();
  const noExt = b.replace(/\.[a-z0-9]{2,5}$/, '');
  return b === noExt ? [b] : [b, noExt];
}

export interface ImageAddResult {
  added: ImageFileEntry[];
  skipped: { name: string; reason: string }[];
}

function typeFromName(n: string) {
  return /\.png$/i.test(n) ? 'image/png' : /\.webp$/i.test(n) ? 'image/webp' : /\.gif$/i.test(n) ? 'image/gif' : /\.bmp$/i.test(n) ? 'image/bmp' : 'image/jpeg';
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
            skipped.push({ name: e.name, reason: 'Larger than 15 MB' });
            continue;
          }
          added.push({ name: baseName(e.name), blob: new Blob([blob], { type: typeFromName(e.name) }), size: blob.size });
        }
      } catch {
        skipped.push({ name: f.name, reason: 'Could not open ZIP file' });
      }
      continue;
    }
    if (!IMAGE_EXT.test(f.name) && !/^image\/(png|jpe?g|webp|gif|bmp)$/.test(f.type)) {
      skipped.push({ name: f.name, reason: 'Not a supported image (use JPG, PNG or WebP)' });
      continue;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      skipped.push({ name: f.name, reason: 'Larger than 15 MB' });
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

// ---------------------------------------------------------------- decoding

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error('The image could not be read. Use JPG, PNG or WebP files.');
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image conversion failed.'))), type, 0.92));
}

/** Image rotated by 0/90/180/270 degrees, as a canvas. */
function rotated(bmp: ImageBitmap, rotate: number): CanvasImageSource & { width: number; height: number } {
  if (!rotate) return bmp;
  const c = document.createElement('canvas');
  const swap = rotate === 90 || rotate === 270;
  c.width = swap ? bmp.height : bmp.width;
  c.height = swap ? bmp.width : bmp.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  return c;
}

// ---------------------------------------------------------------- automatic focus (face / subject)

const focusCache = new WeakMap<Blob, Promise<{ x: number; y: number }>>();

/**
 * Finds the face (or, failing that, the main subject) in a photo.
 * Uses the browser's built-in FaceDetector when available; otherwise a
 * skin-tone heuristic, falling back to the upper centre that suits portrait
 * and passport photos. Returns the point to keep in view (0–1 of the image).
 */
export function detectFocus(blob: Blob): Promise<{ x: number; y: number }> {
  let p = focusCache.get(blob);
  if (!p) {
    p = (async () => {
      const bmp = await decode(blob);
      try {
        const FD = (window as any).FaceDetector;
        if (FD) {
          try {
            const faces: any[] = await new FD({ fastMode: true, maxDetectedFaces: 3 }).detect(bmp);
            if (faces.length) {
              const f = faces.sort((a, b) => b.boundingBox.width * b.boundingBox.height - a.boundingBox.width * a.boundingBox.height)[0].boundingBox;
              // Centre slightly below the face centre keeps head and shoulders in frame.
              return { x: (f.x + f.width / 2) / bmp.width, y: Math.min(1, (f.y + f.height * 0.65) / bmp.height) };
            }
          } catch {
            /* fall through to heuristic */
          }
        }
        return skinFocus(bmp);
      } finally {
        bmp.close?.();
      }
    })().catch(() => ({ x: 0.5, y: 0.42 }));
    focusCache.set(blob, p);
  }
  return p;
}

function skinFocus(bmp: ImageBitmap): { x: number; y: number } {
  const S = 96;
  const s = S / Math.max(bmp.width, bmp.height);
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  let sx = 0, sy = 0, n = 0, minY = h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (cb > 77 && cb < 127 && cr > 135 && cr < 175 && r > 60 && r > b) {
        sx += x;
        sy += y;
        n++;
        if (y < minY) minY = y;
      }
    }
  }
  const portraitDefault = { x: 0.5, y: 0.42 };
  if (n < w * h * 0.03) return portraitDefault;
  // Skin includes neck/hands: lean towards the top of the skin area (the face).
  const cx = sx / n / w;
  const cy = (sy / n * 0.6 + minY * 0.4) / h + 0.05;
  return { x: Math.min(0.85, Math.max(0.15, cx)), y: Math.min(0.75, Math.max(0.2, cy)) };
}

export function autoCrop(focus: { x: number; y: number }): PhotoCrop {
  return { x: focus.x, y: focus.y, zoom: 1, rotate: 0 };
}

/**
 * Draws a photo filling a W×H frame: rotated, scaled by `zoom` beyond "just
 * covers", centred on the crop point but never leaving empty edges.
 */
export function drawCroppedPhoto(ctx: CanvasRenderingContext2D, bmp: ImageBitmap, W: number, H: number, crop: PhotoCrop) {
  const src = rotated(bmp, crop.rotate);
  const iw = src.width;
  const ih = src.height;
  const s = Math.max(W / iw, H / ih) * Math.max(1, crop.zoom);
  const dw = iw * s;
  const dh = ih * s;
  let dx = W / 2 - crop.x * dw;
  let dy = H / 2 - crop.y * dh;
  dx = Math.min(0, Math.max(W - dw, dx));
  dy = Math.min(0, Math.max(H - dh, dy));
  ctx.drawImage(src, dx, dy, dw, dh);
}

// ---------------------------------------------------------------- signatures

/**
 * Removes empty margins around a signature (transparent or near-white pixels)
 * and returns a PNG. Transparency is preserved.
 */
export async function trimSignature(blob: Blob, opts: { clearBackground?: boolean } = {}): Promise<Blob> {
  const bmp = await decode(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      const light = data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235;
      if (a > 24 && !light) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) throw new Error('The signature image looks empty.');
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.03) + 2;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const out = document.createElement('canvas');
  out.width = right - left + 1;
  out.height = bottom - top + 1;
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.drawImage(c, left, top, out.width, out.height, 0, 0, out.width, out.height);
  if (opts.clearBackground) {
    // Photos/scans of a signature on paper (JPG): fade the white paper to transparent.
    const img = octx.getImageData(0, 0, out.width, out.height);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      const l = Math.min(px[i], px[i + 1], px[i + 2]);
      if (l >= 235) px[i + 3] = 0;
      else if (l > 190) px[i + 3] = Math.round(px[i + 3] * ((235 - l) / 45));
    }
    octx.putImageData(img, 0, 0);
  }
  return canvasToBlob(out, 'image/png');
}

// ---------------------------------------------------------------- preparation for the PDF

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

export interface PrepareOptions {
  crop?: PhotoCrop;
  placement?: SignaturePlacement;
}

/**
 * Produces an image exactly the size of its box (~300 DPI). Photos use the
 * crop (automatic or manual) when the box fills; signatures keep their
 * proportions and use the client's size/position inside the box.
 */
export function prepareImage(blob: Blob, box: PhotoBox | SignatureBox, boxWpt: number, boxHpt: number, opts: PrepareOptions = {}): Promise<PreparedImage> {
  const shape = box.type === 'photo' ? box.shape : 'rectangle';
  const key = `${blobId(blob)}|${box.type}|${box.fit}|${shape}|${box.align}|${boxWpt.toFixed(1)}x${boxHpt.toFixed(1)}|${JSON.stringify(opts)}`;
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
        else ctx.roundRect(0, 0, W, H, Math.min(W, H) * 0.08);
        ctx.clip();
      }
      if (box.type === 'photo' && box.fit === 'cover') {
        drawCroppedPhoto(ctx, bmp, W, H, opts.crop || { x: 0.5, y: 0.5, zoom: 1, rotate: 0 });
      } else if (box.fit === 'stretch' && !opts.placement) {
        ctx.drawImage(bmp, 0, 0, W, H);
      } else {
        // Keep proportions inside the box (photo "contain" or signature).
        const pl = opts.placement || { scale: 1, offsetX: box.type === 'signature' ? (box.align === 'left' ? -1 : box.align === 'right' ? 1 : 0) : 0, offsetY: 0 };
        const fit = Math.min(W / bmp.width, H / bmp.height) * Math.min(1, Math.max(0.3, pl.scale));
        const dw = bmp.width * fit;
        const dh = bmp.height * fit;
        const align = box.type === 'photo' ? box.align : 'center';
        const hx = box.type === 'photo' ? (align === 'left' ? 0 : align === 'right' ? 1 : 0.5) : (pl.offsetX + 1) / 2;
        const vy = box.type === 'photo' ? (align === 'top' ? 0 : align === 'bottom' ? 1 : 0.5) : (pl.offsetY + 1) / 2;
        ctx.drawImage(bmp, (W - dw) * hx, (H - dh) * vy, dw, dh);
      }
      bmp.close?.();
      // JPEG keeps photos small; PNG is required for transparency (signatures, masks, contain).
      const transparent = box.type === 'signature' || shape !== 'rectangle' || box.fit !== 'cover' || blob.type === 'image/png';
      const out = await canvasToBlob(canvas, transparent ? 'image/png' : 'image/jpeg');
      return { bytes: new Uint8Array(await out.arrayBuffer()), kind: transparent ? 'png' : 'jpg' } as PreparedImage;
    })();
    // Small LRU so large batches do not keep every processed photo in memory.
    if (prepCache.size >= 120) prepCache.delete(prepCache.keys().next().value!);
    prepCache.set(key, p);
    p.catch(() => prepCache.delete(key));
  }
  return p;
}

/** Frees processed-image memory (called after generation). */
export function clearPreparedImages() {
  prepCache.clear();
}
