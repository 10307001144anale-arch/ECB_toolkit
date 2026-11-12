// The certificate rendering engine. One code path produces every PDF and every
// preview (previews are rasterised copies of the PDF produced here).
//
// - The original artwork is embedded unchanged (vector PDF pages are embedded
//   as Form XObjects; PNG/JPG artwork as a full-page image).
// - Text is drawn as real vector text with embedded, subset fonts.
// - QR codes are drawn as vector squares.
// - Photos and signatures are inserted as images.
// Everything is clipped to its admin-defined box.

import {
  PDFDocument,
  PDFEmbeddedPage,
  PDFImage,
  PDFPage,
  degrees,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  type Color,
} from 'pdf-lib';
import QRCode from 'qrcode';
import type { PhotoBox, QrBox, SignatureBox, TemplateLayout, TextBox } from '../../shared/types';
import { FontEmbedder, registerBrowserFont, type EmbeddedFont, type FileFetcher } from './fonts';
import { layoutText, TEXT_PADDING, type Measurer } from './textLayout';
import { prepareImage } from './images';

export interface ResolvedCertificate {
  /** Final text per text-box key ('' leaves the box empty). */
  texts: Record<string, string>;
  /** QR content per QR-box key (null/empty = no QR). */
  qr: Record<string, string | null>;
  /** Image per photo/signature box key. */
  images: Record<string, Blob | null>;
}

export interface RenderWarning {
  boxKey: string;
  label: string;
  kind: 'overflow' | 'missing-image' | 'font-fallback';
  message: string;
}

export interface RenderOptions {
  /** Draw grey placeholders for missing images instead of failing (previews only). */
  placeholders?: boolean;
}

export interface PageGeometry {
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  crop: { x: number; y: number; width: number; height: number };
}

/** Reads page sizes the same way the renderer places the artwork. */
export async function readArtworkPages(bytes: ArrayBuffer, mime: string): Promise<PageGeometry[]> {
  if (mime === 'application/pdf') {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return src.getPages().map(pageGeometry);
  }
  const blob = new Blob([bytes], { type: mime });
  const bmp = await createImageBitmap(blob);
  const long = Math.max(bmp.width, bmp.height);
  // Images are mapped to A4 size on their long side (842 pt), never enlarged.
  const s = long > 842 ? 842 / long : 1;
  const g: PageGeometry = {
    width: Math.round(bmp.width * s * 100) / 100,
    height: Math.round(bmp.height * s * 100) / 100,
    rotation: 0,
    crop: { x: 0, y: 0, width: bmp.width * s, height: bmp.height * s },
  };
  bmp.close?.();
  return [g];
}

function pageGeometry(p: PDFPage): PageGeometry {
  const crop = p.getCropBox();
  const angle = (((p.getRotation().angle % 360) + 360) % 360) as 0 | 90 | 180 | 270;
  const swap = angle === 90 || angle === 270;
  return {
    width: swap ? crop.height : crop.width,
    height: swap ? crop.width : crop.height,
    rotation: angle,
    crop,
  };
}

function hexColor(hex: string): Color {
  const n = parseInt(hex.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

interface DocContext {
  doc: PDFDocument;
  fonts: FontEmbedder;
  art: { kind: 'pdf'; pages: PDFEmbeddedPage[] } | { kind: 'image'; image: PDFImage };
  imageCache: Map<Blob, PDFImage>;
}

export class CertificateRenderer {
  readonly layout: TemplateLayout;
  private artworkBytes: ArrayBuffer;
  private source: PDFDocument | null = null;
  private geometry: PageGeometry[] = [];
  private fetchFile: FileFetcher;
  private fixedSignatures = new Map<string, Blob>();
  private measureCtx: DocContext | null = null;

  private constructor(layout: TemplateLayout, artworkBytes: ArrayBuffer, fetchFile: FileFetcher) {
    this.layout = layout;
    this.artworkBytes = artworkBytes;
    this.fetchFile = fetchFile;
  }

  static async load(layout: TemplateLayout, fetchFile: FileFetcher): Promise<CertificateRenderer> {
    if (!layout.artworkFileId || !layout.artworkMime) throw new Error('This template has no artwork.');
    const bytes = await fetchFile(layout.artworkFileId);
    const r = new CertificateRenderer(layout, bytes, fetchFile);
    if (layout.artworkMime === 'application/pdf') {
      r.source = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      r.geometry = r.source.getPages().map(pageGeometry);
    } else {
      // Wrap PNG/JPG artwork in a one-page PDF once. Every certificate then
      // embeds that page directly, instead of decoding the image again.
      const g = (await readArtworkPages(bytes, layout.artworkMime))[0];
      const wrapper = await PDFDocument.create();
      const img = layout.artworkMime === 'image/jpeg' ? await wrapper.embedJpg(bytes) : await wrapper.embedPng(bytes);
      wrapper.addPage([g.width, g.height]).drawImage(img, { x: 0, y: 0, width: g.width, height: g.height });
      r.source = await PDFDocument.load(await wrapper.save());
      r.geometry = r.source.getPages().map(pageGeometry);
    }
    for (const b of layout.boxes) {
      if (b.type === 'signature' && b.fixedSignatureFileId) {
        const buf = await fetchFile(b.fixedSignatureFileId);
        r.fixedSignatures.set(b.key, new Blob([buf]));
      }
    }
    return r;
  }

  get pageCount() {
    return this.geometry.length;
  }

  pageSize(i: number) {
    const g = this.geometry[i] || this.geometry[0];
    return { width: g.width, height: g.height };
  }

  fixedSignature(boxKey: string): Blob | null {
    return this.fixedSignatures.get(boxKey) || null;
  }

  private async newContext(): Promise<DocContext> {
    const doc = await PDFDocument.create();
    doc.setProducer('CertiGen');
    doc.setCreator('CertiGen');
    const fonts = new FontEmbedder(doc, this.layout.fonts, this.fetchFile);
    let art: DocContext['art'];
    if (this.source) {
      const pages = this.source.getPages();
      const embedded: PDFEmbeddedPage[] = [];
      for (let i = 0; i < pages.length; i++) {
        const c = this.geometry[i].crop;
        embedded.push(await doc.embedPage(pages[i], { left: c.x, bottom: c.y, right: c.x + c.width, top: c.y + c.height }));
      }
      art = { kind: 'pdf', pages: embedded };
    } else {
      const image = this.layout.artworkMime === 'image/jpeg' ? await doc.embedJpg(this.artworkBytes) : await doc.embedPng(this.artworkBytes);
      art = { kind: 'image', image };
    }
    return { doc, fonts, art, imageCache: new Map() };
  }

  private drawArtwork(ctx: DocContext, page: PDFPage, i: number) {
    const g = this.geometry[i];
    if (ctx.art.kind === 'image') {
      page.drawImage(ctx.art.image, { x: 0, y: 0, width: g.width, height: g.height });
      return;
    }
    const ep = ctx.art.pages[i];
    const w = g.crop.width;
    const h = g.crop.height;
    // Reproduce the page's /Rotate so the artwork appears exactly as in a viewer.
    switch (g.rotation) {
      case 90:
        page.drawPage(ep, { x: 0, y: w, width: w, height: h, rotate: degrees(-90) });
        break;
      case 180:
        page.drawPage(ep, { x: w, y: h, width: w, height: h, rotate: degrees(180) });
        break;
      case 270:
        page.drawPage(ep, { x: h, y: 0, width: w, height: h, rotate: degrees(90) });
        break;
      default:
        page.drawPage(ep, { x: 0, y: 0, width: w, height: h });
    }
  }

  /** Draws one certificate (all artwork pages) into the context's document. */
  private async drawCertificate(ctx: DocContext, cert: ResolvedCertificate, opts: RenderOptions = {}): Promise<RenderWarning[]> {
    const warnings: RenderWarning[] = [];
    for (let i = 0; i < this.geometry.length; i++) {
      const g = this.geometry[i];
      const page = ctx.doc.addPage([g.width, g.height]);
      this.drawArtwork(ctx, page, i);
      for (const box of this.layout.boxes) {
        if (box.page !== i) continue;
        const rect = {
          x: (box.x / 100) * g.width,
          top: g.height - (box.y / 100) * g.height,
          w: (box.w / 100) * g.width,
          h: (box.h / 100) * g.height,
        };
        if (box.type === 'text') {
          const value = cert.texts[box.key];
          if (value && value.trim()) warnings.push(...(await this.drawText(ctx, page, box, rect, value)));
        } else if (box.type === 'qr') {
          const value = cert.qr[box.key];
          if (value && value.trim()) this.drawQr(page, box, rect, value);
        } else {
          const blob = cert.images[box.key];
          if (blob) await this.drawImageBox(ctx, page, box, rect, blob);
          else if (opts.placeholders) {
            // Preview only: show where the image will go.
            page.drawRectangle({
              x: rect.x,
              y: rect.top - rect.h,
              width: rect.w,
              height: rect.h,
              color: rgb(0.94, 0.95, 0.97),
              opacity: 0.85,
              borderColor: rgb(0.58, 0.64, 0.72),
              borderWidth: 0.75,
              borderDashArray: [3, 2],
            });
          } else if (box.required) {
            throw new Error(`No image for the required box "${box.label}".`);
          }
        }
      }
    }
    return warnings;
  }

  private canvasMeasurer(family: string, box: TextBox): Measurer {
    const c = document.createElement('canvas').getContext('2d')!;
    return {
      width(text, size) {
        c.font = `${box.italic ? 'italic ' : ''}${box.fontWeight} ${size}px "${family}", "Noto Sans Tibetan", sans-serif`;
        return c.measureText(text).width;
      },
    };
  }

  private async layoutFor(ctx: DocContext, box: TextBox, rect: { w: number; h: number }, value: string) {
    const font = await ctx.fonts.get(box);
    // Scripts needing complex shaping (e.g. Dzongkha/Tibetan) or characters
    // missing from the font are drawn by the browser instead (see drawRaster).
    const raster = /[ༀ-࿿]/.test(value) || !font.supports(value);
    let measurer: Measurer;
    let browserFamily = box.fontFamily;
    if (raster) {
      browserFamily = await registerBrowserFont(box.fontFamily, font.bytes, box.fontWeight, box.italic);
      measurer = this.canvasMeasurer(browserFamily, box);
    } else {
      measurer = { width: (t, s) => font.font.widthOfTextAtSize(t, s) };
    }
    return { font, raster, browserFamily, measurer, result: layoutText(value, box, rect.w, rect.h, measurer) };
  }

  private async drawText(
    ctx: DocContext,
    page: PDFPage,
    box: TextBox,
    rect: { x: number; top: number; w: number; h: number },
    value: string
  ): Promise<RenderWarning[]> {
    const warnings: RenderWarning[] = [];
    const { font, raster, browserFamily, measurer, result } = await this.layoutFor(ctx, box, rect, value);
    if (result.overflow) {
      warnings.push({
        boxKey: box.key,
        label: box.label,
        kind: 'overflow',
        message: `"${box.label}" is too long to fit, even at the smallest font size. It was shortened.`,
      });
    }
    const { lines, fontSize, lineHeight } = result;
    const blockH = (lines.length - 1) * lineHeight + fontSize;
    const innerH = rect.h - TEXT_PADDING * 2;
    const offset = box.vAlign === 'top' ? 0 : box.vAlign === 'bottom' ? innerH - blockH : (innerH - blockH) / 2;
    const ascentRatio = ascent(font);
    const firstBaseline = rect.top - TEXT_PADDING - offset - fontSize * ascentRatio;
    const lineX = (line: string) => {
      const chars = [...line].length;
      const w = measurer.width(line, fontSize) + (chars > 1 ? box.letterSpacing * (chars - 1) : 0);
      const inner = rect.w - TEXT_PADDING * 2;
      const left = rect.x + TEXT_PADDING;
      return box.align === 'center' ? left + (inner - w) / 2 : box.align === 'right' ? left + inner - w : left;
    };

    if (raster) {
      await this.drawRaster(ctx, page, box, rect, lines, fontSize, lineHeight, firstBaseline, browserFamily, lineX);
      return warnings;
    }

    const color = hexColor(box.color);
    page.pushOperators(pushGraphicsState());
    if (box.letterSpacing) page.pushOperators(setCharacterSpacing(box.letterSpacing));
    lines.forEach((line, i) => {
      if (!line) return;
      page.drawText(line, { x: lineX(line), y: firstBaseline - i * lineHeight, size: fontSize, font: font.font, color });
    });
    page.pushOperators(popGraphicsState());
    return warnings;
  }

  /** Browser-shaped text, embedded as a high-resolution transparent image. */
  private async drawRaster(
    ctx: DocContext,
    page: PDFPage,
    box: TextBox,
    rect: { x: number; top: number; w: number; h: number },
    lines: string[],
    fontSize: number,
    lineHeight: number,
    firstBaseline: number,
    family: string,
    lineX: (l: string) => number
  ) {
    const scale = 4; // ~288 DPI
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(4, Math.ceil(rect.w * scale));
    canvas.height = Math.max(4, Math.ceil(rect.h * scale));
    const c = canvas.getContext('2d')!;
    c.scale(scale, scale);
    c.fillStyle = box.color;
    c.font = `${box.italic ? 'italic ' : ''}${box.fontWeight} ${fontSize}px "${family}", "Noto Sans Tibetan", sans-serif`;
    (c as any).letterSpacing = `${box.letterSpacing}px`;
    c.textBaseline = 'alphabetic';
    lines.forEach((line, i) => {
      const x = lineX(line) - rect.x;
      const y = rect.top - (firstBaseline - i * lineHeight);
      c.fillText(line, x, y);
    });
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Text rendering failed'))), 'image/png'));
    const img = await ctx.doc.embedPng(await blob.arrayBuffer());
    page.drawImage(img, { x: rect.x, y: rect.top - rect.h, width: rect.w, height: rect.h });
  }

  private drawQr(page: PDFPage, box: QrBox, rect: { x: number; top: number; w: number; h: number }, value: string) {
    const qr = QRCode.create(value, { errorCorrectionLevel: box.errorCorrection });
    const n = qr.modules.size;
    const total = n + box.margin * 2;
    const side = (Math.min(rect.w, rect.h) * box.sizePercent) / 100;
    const unit = side / total;
    const x0 = rect.x + (rect.w - side) / 2;
    const yTop = rect.top - (rect.h - side) / 2;
    page.drawRectangle({ x: x0, y: yTop - side, width: side, height: side, color: hexColor(box.bgColor) });
    // Merge horizontal runs of dark modules into one SVG path.
    let path = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.modules.get(r, c)) {
          c++;
          continue;
        }
        const start = c;
        while (c < n && qr.modules.get(r, c)) c++;
        path += `M${start + box.margin} ${r + box.margin}h${c - start}v1h${start - c}z`;
      }
    }
    page.drawSvgPath(path, { x: x0, y: yTop, scale: unit, color: hexColor(box.fgColor), borderWidth: 0 });
  }

  private async drawImageBox(
    ctx: DocContext,
    page: PDFPage,
    box: PhotoBox | SignatureBox,
    rect: { x: number; top: number; w: number; h: number },
    blob: Blob
  ) {
    const prepared = await prepareImage(blob, box, rect.w, rect.h);
    const img = prepared.kind === 'png' ? await ctx.doc.embedPng(prepared.bytes) : await ctx.doc.embedJpg(prepared.bytes);
    const y = rect.top - rect.h;
    page.drawImage(img, { x: rect.x, y, width: rect.w, height: rect.h });
    if (box.type === 'photo' && box.borderWidth > 0) {
      const color = hexColor(box.borderColor);
      const bw = box.borderWidth;
      if (box.shape === 'circle') {
        page.drawEllipse({ x: rect.x + rect.w / 2, y: y + rect.h / 2, xScale: rect.w / 2 - bw / 2, yScale: rect.h / 2 - bw / 2, borderColor: color, borderWidth: bw });
      } else if (box.shape === 'rounded') {
        const r = Math.min(rect.w, rect.h) * 0.08;
        const w = rect.w - bw;
        const h = rect.h - bw;
        const p = `M${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h - r}Q${w} ${h} ${w - r} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`;
        page.drawSvgPath(p, { x: rect.x + bw / 2, y: rect.top - bw / 2, borderColor: color, borderWidth: bw });
      } else {
        page.drawRectangle({ x: rect.x + bw / 2, y: y + bw / 2, width: rect.w - bw, height: rect.h - bw, borderColor: color, borderWidth: bw });
      }
    }
  }

  // ------------------------------------------------------------------ public API

  /** One certificate as its own PDF. */
  async renderSingle(cert: ResolvedCertificate, opts: RenderOptions = {}): Promise<{ bytes: Uint8Array; warnings: RenderWarning[] }> {
    const ctx = await this.newContext();
    const warnings = await this.drawCertificate(ctx, cert, opts);
    const bytes = await ctx.doc.save({ useObjectStreams: true });
    return { bytes, warnings };
  }

  /**
   * Many certificates in ONE PDF. The artwork is embedded once and reused on
   * every page, so the combined file stays small.
   */
  async renderCombined(
    count: number,
    getCert: (i: number) => Promise<ResolvedCertificate | null>,
    onProgress?: (done: number) => void,
    signal?: { cancelled: boolean }
  ): Promise<Uint8Array> {
    const ctx = await this.newContext();
    for (let i = 0; i < count; i++) {
      if (signal?.cancelled) throw new Error('Cancelled');
      const cert = await getCert(i);
      if (cert) await this.drawCertificate(ctx, cert);
      onProgress?.(i + 1);
      if (i % 5 === 4) await yieldToBrowser();
    }
    return ctx.doc.save({ useObjectStreams: true });
  }

  /** Fast overflow check for text boxes only (no PDF is produced). */
  async checkText(texts: Record<string, string>): Promise<RenderWarning[]> {
    if (!this.measureCtx) {
      const doc = await PDFDocument.create();
      this.measureCtx = { doc, fonts: new FontEmbedder(doc, this.layout.fonts, this.fetchFile), art: { kind: 'pdf', pages: [] }, imageCache: new Map() };
    }
    const out: RenderWarning[] = [];
    for (const box of this.layout.boxes) {
      if (box.type !== 'text') continue;
      const value = texts[box.key];
      if (!value || !value.trim()) continue;
      const g = this.geometry[box.page] || this.geometry[0];
      const rect = { w: (box.w / 100) * g.width, h: (box.h / 100) * g.height };
      const { result } = await this.layoutFor(this.measureCtx, box, rect, value);
      if (result.overflow) {
        out.push({ boxKey: box.key, label: box.label, kind: 'overflow', message: `"${box.label}" does not fit in its box.` });
      }
    }
    return out;
  }
}

function ascent(f: EmbeddedFont): number {
  try {
    const a = f.font.heightAtSize(1000, { descender: false });
    const full = f.font.heightAtSize(1000);
    if (full > 0 && a > 0) return Math.min(0.95, Math.max(0.6, a / full));
  } catch {
    /* fall through */
  }
  return 0.78;
}

/** Lets the browser paint and handle input between certificates. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}
