// Font loading and embedding for pdf-lib.
// Standard PDF fonts (Helvetica/Times/Courier) need no download. Google fonts
// are fetched once as TTF from jsDelivr (Fontsource) and cached; custom fonts
// uploaded by the administrator come from the server.

import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { CustomFontRef, TextBox } from '../../shared/types';

interface WebFontSource {
  slug: string;
  subset: string;
  weights: number[];
  italic: boolean;
}

const WEB_FONTS: Record<string, WebFontSource> = {
  Montserrat: { slug: 'montserrat', subset: 'latin', weights: [400, 700], italic: true },
  Poppins: { slug: 'poppins', subset: 'latin', weights: [400, 700], italic: true },
  'Plus Jakarta Sans': { slug: 'plus-jakarta-sans', subset: 'latin', weights: [400, 700], italic: true },
  'Playfair Display': { slug: 'playfair-display', subset: 'latin', weights: [400, 700], italic: true },
  Cinzel: { slug: 'cinzel', subset: 'latin', weights: [400, 700], italic: false },
  'Great Vibes': { slug: 'great-vibes', subset: 'latin', weights: [400], italic: false },
  'Alex Brush': { slug: 'alex-brush', subset: 'latin', weights: [400], italic: false },
  'JetBrains Mono': { slug: 'jetbrains-mono', subset: 'latin', weights: [400, 700], italic: true },
  'Noto Sans Tibetan': { slug: 'noto-sans-tibetan', subset: 'tibetan', weights: [400, 700], italic: false },
};

/**
 * Helvetica / Times / Courier are drawn with the bundled, metric-compatible
 * Liberation fonts (SIL OFL) so the font is embedded in every PDF and works
 * offline. The built-in PDF fonts are only a last-resort fallback.
 */
type Style = 'Regular' | 'Bold' | 'Italic' | 'BoldItalic';
const family4 = (base: string): Record<Style, string> => ({ Regular: `${base}-Regular`, Bold: `${base}-Bold`, Italic: `${base}-Italic`, BoldItalic: `${base}-BoldItalic` });

/**
 * Fonts bundled in /public/fonts. "Times New Roman" (ECB official documents)
 * uses Liberation Serif, which has identical metrics. Roboto (ECB interface
 * typeface) has no bold italic file, so bold italic uses Roboto Bold.
 * DDC Uchen (Dzongkha) has a single style.
 */
const LOCAL_FONTS: Record<string, Record<Style, string>> = {
  Helvetica: family4('LiberationSans'),
  Times: family4('LiberationSerif'),
  'Times New Roman': family4('LiberationSerif'),
  Courier: family4('LiberationMono'),
  Roboto: { Regular: 'Roboto-Regular', Bold: 'Roboto-Bold', Italic: 'Roboto-Italic', BoldItalic: 'Roboto-Bold' },
  'DDC Uchen': { Regular: 'DDC_Uchen', Bold: 'DDC_Uchen', Italic: 'DDC_Uchen', BoldItalic: 'DDC_Uchen' },
};

async function fetchLocalFont(family: string, weight: number, italic: boolean): Promise<ArrayBuffer | null> {
  const style: Style = weight >= 700 ? (italic ? 'BoldItalic' : 'Bold') : italic ? 'Italic' : 'Regular';
  const file = LOCAL_FONTS[family]?.[style];
  if (!file) return null;
  try {
    const r = await fetch(`/fonts/${file}.ttf`);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

const STANDARD: Record<string, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  // [regular, bold, italic, bold-italic]
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  'Times New Roman': [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

export function isStandardFamily(family: string) {
  return family in STANDARD;
}

const bytesCache = new Map<string, Promise<ArrayBuffer | null>>();

export type FileFetcher = (fileId: string) => Promise<ArrayBuffer>;

async function fetchWebFont(src: WebFontSource, weight: number, italic: boolean): Promise<ArrayBuffer | null> {
  const w = src.weights.includes(weight) ? weight : 400;
  const style = italic && src.italic ? 'italic' : 'normal';
  const url = `https://cdn.jsdelivr.net/fontsource/fonts/${src.slug}@latest/${src.subset}-${w}-${style}.ttf`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.arrayBuffer();
  } catch {
    return null;
  }
}

/** Raw TTF/OTF bytes for a box's font, or null when only a built-in PDF font is available. */
export function getFontBytes(box: Pick<TextBox, 'fontFamily' | 'fontWeight' | 'italic'>, custom: CustomFontRef[], fetchFile: FileFetcher): Promise<ArrayBuffer | null> {
  const weight = box.fontWeight === '700' ? 700 : 400;
  const key = `${box.fontFamily}|${weight}|${box.italic ? 1 : 0}`;
  const cached = bytesCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    const candidates = custom.filter((f) => f.family.toLowerCase() === box.fontFamily.toLowerCase());
    if (candidates.length) {
      const best =
        candidates.find((f) => f.weight === box.fontWeight && f.italic === box.italic) ||
        candidates.find((f) => f.weight === box.fontWeight) ||
        candidates[0];
      try {
        return await fetchFile(best.fileId);
      } catch {
        return null;
      }
    }
    if (LOCAL_FONTS[box.fontFamily]) return fetchLocalFont(box.fontFamily, weight, box.italic);
    const web = WEB_FONTS[box.fontFamily];
    if (web) return fetchWebFont(web, weight, box.italic);
    return null;
  })();
  bytesCache.set(key, p);
  // Do not cache failures permanently (e.g. temporary network issue).
  p.then((b) => {
    if (!b) bytesCache.delete(key);
  });
  return p;
}

export interface EmbeddedFont {
  font: PDFFont;
  /** Unicode code points the font can draw. */
  supports(text: string): boolean;
  isStandard: boolean;
  bytes: ArrayBuffer | null;
}

/** Embeds fonts into one PDF document, caching per document. */
export class FontEmbedder {
  private cache = new Map<string, Promise<EmbeddedFont>>();
  private doc: PDFDocument;
  private custom: CustomFontRef[];
  private fetchFile: FileFetcher;

  constructor(doc: PDFDocument, custom: CustomFontRef[], fetchFile: FileFetcher) {
    this.doc = doc;
    this.custom = custom;
    this.fetchFile = fetchFile;
    doc.registerFontkit(fontkit);
  }

  get(box: Pick<TextBox, 'fontFamily' | 'fontWeight' | 'italic'>): Promise<EmbeddedFont> {
    const key = `${box.fontFamily}|${box.fontWeight}|${box.italic ? 1 : 0}`;
    let p = this.cache.get(key);
    if (!p) {
      p = this.load(box);
      this.cache.set(key, p);
    }
    return p;
  }

  private async load(box: Pick<TextBox, 'fontFamily' | 'fontWeight' | 'italic'>): Promise<EmbeddedFont> {
    const bold = box.fontWeight === '700';
    {
      const bytes = await getFontBytes(box, this.custom, this.fetchFile);
      if (bytes) {
        try {
          const font = await this.doc.embedFont(bytes, { subset: true });
          const set = new Set(font.getCharacterSet());
          return { font, isStandard: false, bytes, supports: (t) => [...t].every((c) => c === '\n' || set.has(c.codePointAt(0)!)) };
        } catch (err) {
          console.warn(`Could not embed font ${box.fontFamily}; using a standard font instead.`);
        }
      }
    }
    // Standard font (also the fallback when a web font cannot be loaded).
    const fam = STANDARD[box.fontFamily] || (/(playfair|cinzel|vibes|brush|serif|times)/i.test(box.fontFamily) ? STANDARD.Times : /mono|courier/i.test(box.fontFamily) ? STANDARD.Courier : STANDARD.Helvetica);
    const idx = (bold ? 1 : 0) + (box.italic ? 2 : 0);
    const font = await this.doc.embedFont(fam[idx]);
    const set = new Set(font.getCharacterSet());
    return { font, isStandard: true, bytes: null, supports: (t) => [...t].every((c) => c === '\n' || set.has(c.codePointAt(0)!)) };
  }
}

/** Registers a font with the browser so the canvas fallback renderer can use it. */
const registeredFaces = new Map<string, Promise<string>>();
/**
 * Makes sure DDC Uchen (bundled) is available to the browser, so Dzongkha text
 * is drawn with it in previews and PDFs whatever the field's font is.
 */
let dzReady: Promise<void> | null = null;
export function ensureDzongkhaFont(): Promise<void> {
  dzReady ||= (async () => {
    try {
      if ([...(document.fonts as any)].some((f: FontFace) => f.family.replace(/"/g, '') === 'DDC Uchen' && f.status === 'loaded')) return;
      const bytes = await fetchLocalFont('DDC Uchen', 400, false);
      if (!bytes) return;
      const face = new FontFace('DDC Uchen', bytes);
      await face.load();
      (document.fonts as any).add(face);
    } catch {
      /* fall back to the system font */
    }
  })();
  return dzReady;
}

export function registerBrowserFont(family: string, bytes: ArrayBuffer | null, weight: string, italic: boolean): Promise<string> {
  if (!bytes) return Promise.resolve(family);
  const alias = `cg-${family.replace(/\W+/g, '-')}-${weight}-${italic ? 'i' : 'n'}`;
  let p = registeredFaces.get(alias);
  if (!p) {
    p = (async () => {
      try {
        const face = new FontFace(alias, bytes.slice(0));
        await face.load();
        (document.fonts as any).add(face);
        return alias;
      } catch {
        return family;
      }
    })();
    registeredFaces.set(alias, p);
  }
  return p;
}
