// Template layout defaults, sanitising and publish validation.
// The sanitiser rebuilds every box from an allow-list of properties. Text boxes
// may carry admin "default wording"; clients edit a copy of it per batch, never
// the template itself.

import type {
  BoxType,
  CustomFontRef,
  LayoutPage,
  PhotoBox,
  QrBox,
  SignatureBox,
  TemplateBox,
  TemplateLayout,
  TextBox,
} from './types.ts';

export const FONT_FAMILIES = [
  'Helvetica',
  'Times',
  'Courier',
  'Montserrat',
  'Poppins',
  'Plus Jakarta Sans',
  'Playfair Display',
  'Cinzel',
  'Great Vibes',
  'Alex Brush',
  'JetBrains Mono',
  'Noto Sans Tibetan',
] as const;

const KEY_RE = /^[a-z][a-z0-9_]{0,47}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function emptyLayout(): TemplateLayout {
  return { artworkFileId: null, artworkMime: null, pages: [], boxes: [], fonts: [] };
}

export function makeKey(label: string): string {
  let k = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!k || !/^[a-z]/.test(k)) k = `field_${k}`.replace(/_+$/, '');
  return k.slice(0, 48);
}

export function uniqueKey(base: string, taken: Set<string>): string {
  let key = makeKey(base);
  if (!taken.has(key)) return key;
  let i = 2;
  while (taken.has(`${key}_${i}`)) i++;
  return `${key}_${i}`;
}

const TYPE_LABEL: Record<BoxType, string> = {
  text: 'Text',
  qr: 'QR code',
  photo: 'Photo',
  signature: 'Signature',
};

export function newBox(type: BoxType, id: string, rect: { page: number; x: number; y: number; w: number; h: number }, taken: Set<string>): TemplateBox {
  const n = [...taken].filter((k) => k.startsWith(type)).length + 1;
  const label = `${TYPE_LABEL[type]} ${n}`;
  const base = {
    id,
    key: uniqueKey(type === 'text' ? `text_${n}` : `${type}_${n}`, taken),
    label,
    description: '',
    required: type === 'text',
    ...rect,
  };
  switch (type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        defaultText: '',
        fontFamily: 'Helvetica',
        fontWeight: '400',
        italic: false,
        color: '#1f2937',
        align: 'center',
        vAlign: 'middle',
        wrap: true,
        multiline: false,
        autoFit: true,
        fontSize: 18,
        minFontSize: 8,
        maxFontSize: 28,
        lineHeight: 1.25,
        letterSpacing: 0,
        transform: 'none',
        maxChars: null,
      };
    case 'qr':
      return { ...base, type: 'qr', required: false, errorCorrection: 'M', contentMode: 'either', sizePercent: 100, margin: 1, fgColor: '#000000', bgColor: '#ffffff' };
    case 'photo':
      return { ...base, type: 'photo', required: false, fit: 'cover', align: 'center', shape: 'rectangle', borderColor: '#ffffff', borderWidth: 0 };
    case 'signature':
      return { ...base, type: 'signature', required: false, source: 'either', fixedSignatureFileId: null, fit: 'contain', align: 'center' };
  }
}

// ---------------------------------------------------------------------------

function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function str(v: unknown, def: string, maxLen = 200): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : def;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return (allowed as readonly string[]).includes(v as string) ? (v as T) : def;
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}
function hex(v: unknown, def: string): string {
  return typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : def;
}
function fileId(v: unknown): string | null {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v) ? v : null;
}

export function sanitizeLayout(input: any): TemplateLayout {
  const src = input && typeof input === 'object' ? input : {};
  const pages: LayoutPage[] = Array.isArray(src.pages)
    ? src.pages.slice(0, 50).map((p: any) => ({
        width: num(p?.width, 842, 10, 20000),
        height: num(p?.height, 595, 10, 20000),
        previewFileId: fileId(p?.previewFileId),
      }))
    : [];
  const pageCount = Math.max(1, pages.length);
  const fonts: CustomFontRef[] = Array.isArray(src.fonts)
    ? src.fonts.slice(0, 30).flatMap((f: any) => {
        const id = fileId(f?.fileId);
        const family = str(f?.family, '', 60).trim();
        if (!id || !family) return [];
        return [{ family, fileId: id, weight: oneOf(f?.weight, ['400', '700'] as const, '400'), italic: bool(f?.italic, false) }];
      })
    : [];

  const taken = new Set<string>();
  const ids = new Set<string>();
  const boxes: TemplateBox[] = [];
  for (const b of Array.isArray(src.boxes) ? src.boxes.slice(0, 200) : []) {
    const type = oneOf(b?.type, ['text', 'qr', 'photo', 'signature'] as const, 'text');
    let id = str(b?.id, '', 64);
    if (!id || ids.has(id)) id = `box_${boxes.length + 1}_${Math.random().toString(36).slice(2, 8)}`;
    ids.add(id);
    let key = str(b?.key, '', 48).trim().toLowerCase();
    if (!KEY_RE.test(key) || taken.has(key)) key = uniqueKey(key || `${type}_${boxes.length + 1}`, taken);
    taken.add(key);
    const w = num(b?.w, 20, 0.5, 100);
    const h = num(b?.h, 8, 0.5, 100);
    const base = {
      id,
      key,
      label: str(b?.label, key, 80).trim() || key,
      description: str(b?.description, '', 300),
      required: bool(b?.required, type === 'text'),
      page: Math.floor(num(b?.page, 0, 0, pageCount - 1)),
      x: num(b?.x, 0, 0, 100 - w),
      y: num(b?.y, 0, 0, 100 - h),
      w,
      h,
    };
    if (type === 'text') {
      const minFontSize = num(b?.minFontSize, 8, 4, 200);
      const maxFontSize = num(b?.maxFontSize, 28, minFontSize, 300);
      const box: TextBox = {
        ...base,
        type: 'text',
        defaultText: str(b?.defaultText, '', 5000),
        fontFamily: str(b?.fontFamily, 'Helvetica', 60) || 'Helvetica',
        fontWeight: oneOf(b?.fontWeight, ['400', '700'] as const, '400'),
        italic: bool(b?.italic, false),
        color: hex(b?.color, '#1f2937'),
        align: oneOf(b?.align, ['left', 'center', 'right'] as const, 'center'),
        vAlign: oneOf(b?.vAlign, ['top', 'middle', 'bottom'] as const, 'middle'),
        wrap: bool(b?.wrap, true),
        multiline: bool(b?.multiline, false),
        autoFit: bool(b?.autoFit, true),
        fontSize: num(b?.fontSize, 18, 4, 300),
        minFontSize,
        maxFontSize,
        lineHeight: num(b?.lineHeight, 1.25, 0.8, 3),
        letterSpacing: num(b?.letterSpacing, 0, -5, 50),
        transform: oneOf(b?.transform, ['none', 'uppercase', 'lowercase', 'titlecase'] as const, 'none'),
        maxChars: b?.maxChars == null || b?.maxChars === '' ? null : Math.round(num(b?.maxChars, 0, 1, 5000)),
      };
      boxes.push(box);
    } else if (type === 'qr') {
      const box: QrBox = {
        ...base,
        type: 'qr',
        errorCorrection: oneOf(b?.errorCorrection, ['L', 'M', 'Q', 'H'] as const, 'M'),
        contentMode: oneOf(b?.contentMode, ['client', 'verification', 'either'] as const, 'either'),
        sizePercent: num(b?.sizePercent, 100, 20, 100),
        margin: Math.round(num(b?.margin, 1, 0, 8)),
        fgColor: hex(b?.fgColor, '#000000'),
        bgColor: hex(b?.bgColor, '#ffffff'),
      };
      boxes.push(box);
    } else if (type === 'photo') {
      const box: PhotoBox = {
        ...base,
        type: 'photo',
        fit: oneOf(b?.fit, ['cover', 'contain', 'stretch'] as const, 'cover'),
        align: oneOf(b?.align, ['center', 'top', 'bottom', 'left', 'right'] as const, 'center'),
        shape: oneOf(b?.shape, ['rectangle', 'rounded', 'circle'] as const, 'rectangle'),
        borderColor: hex(b?.borderColor, '#ffffff'),
        borderWidth: num(b?.borderWidth, 0, 0, 20),
      };
      boxes.push(box);
    } else {
      const source = oneOf(b?.source, ['fixed', 'client', 'either'] as const, 'either');
      const box: SignatureBox = {
        ...base,
        type: 'signature',
        source,
        fixedSignatureFileId: source === 'client' ? null : fileId(b?.fixedSignatureFileId),
        fit: oneOf(b?.fit, ['contain', 'stretch'] as const, 'contain'),
        align: oneOf(b?.align, ['left', 'center', 'right'] as const, 'center'),
      };
      boxes.push(box);
    }
  }

  return {
    artworkFileId: fileId(src.artworkFileId),
    artworkMime: oneOf(src.artworkMime, ['application/pdf', 'image/png', 'image/jpeg'] as const, 'image/png') as TemplateLayout['artworkMime'],
    pages,
    boxes,
    fonts,
  };
}

/** Problems that block publishing. */
export function publishProblems(layout: TemplateLayout): string[] {
  const problems: string[] = [];
  if (!layout.artworkFileId || layout.pages.length === 0) problems.push('Upload the certificate artwork first.');
  if (layout.boxes.length === 0) problems.push('Add at least one box.');
  if (!layout.boxes.some((b) => b.type === 'text')) problems.push('Add at least one text box so clients can enter wording.');
  for (const b of layout.boxes) {
    if (b.type === 'signature' && b.source === 'fixed' && !b.fixedSignatureFileId) {
      problems.push(`Signature box "${b.label}" is set to use a fixed signature, but no signature image was uploaded.`);
    }
  }
  return problems;
}
