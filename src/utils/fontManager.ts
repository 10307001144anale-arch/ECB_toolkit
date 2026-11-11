import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { CertificateTemplate, TemplateField } from '../types';

// Cache fetched TTF array buffers by font name
const fontBufferCache = new Map<string, ArrayBuffer>();

// Fallback font URLs on reliable CDNs for common Google Fonts
const GOOGLE_FONT_TTF_URLS: Record<string, string> = {
  'Playfair Display': 'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf',
  'Montserrat': 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf',
  'Montserrat Bold': 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-700-normal.ttf',
  'Poppins': 'https://cdn.jsdelivr.net/fontsource/fonts/poppins@latest/latin-400-normal.ttf',
  'Great Vibes': 'https://cdn.jsdelivr.net/fontsource/fonts/great-vibes@latest/latin-400-normal.ttf',
  'Cinzel': 'https://cdn.jsdelivr.net/fontsource/fonts/cinzel@latest/latin-600-normal.ttf',
  'Alex Brush': 'https://cdn.jsdelivr.net/fontsource/fonts/alex-brush@latest/latin-400-normal.ttf',
  'JetBrains Mono': 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest/latin-400-normal.ttf',
  'Plus Jakarta Sans': 'https://cdn.jsdelivr.net/fontsource/fonts/plus-jakarta-sans@latest/latin-400-normal.ttf',
  'Noto Sans Tibetan': 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-tibetan@latest/tibetan-400-normal.ttf',
};

export async function getFontBuffer(fontFamily: string, template?: CertificateTemplate): Promise<ArrayBuffer | null> {
  // Check if template has custom uploaded font matching this name
  if (template?.customFonts) {
    const custom = template.customFonts.find(f => f.name.toLowerCase() === fontFamily.toLowerCase());
    if (custom && custom.dataUrl) {
      try {
        const res = await fetch(custom.dataUrl);
        return await res.arrayBuffer();
      } catch {
        // Fallback
      }
    }
  }

  // Check cache
  if (fontBufferCache.has(fontFamily)) {
    return fontBufferCache.get(fontFamily)!;
  }

  // Check Google fonts CDN
  const url = GOOGLE_FONT_TTF_URLS[fontFamily];
  if (url) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        fontBufferCache.set(fontFamily, buf);
        return buf;
      }
    } catch {
      // Network failure or offline
    }
  }

  return null;
}

export async function embedFontForField(
  pdfDoc: PDFDocument,
  field: TemplateField,
  template?: CertificateTemplate
): Promise<PDFFont> {
  try {
    // Register fontkit
    // @ts-ignore
    pdfDoc.registerFontkit(fontkit);

    const fontBuffer = await getFontBuffer(field.fontFamily, template);
    if (fontBuffer) {
      return await pdfDoc.embedFont(fontBuffer, { subset: true });
    }
  } catch (err) {
    console.warn(`Could not embed custom TTF for ${field.fontFamily}, falling back to standard font:`, err);
  }

  // Fallback to standard PDF fonts based on font family style
  const family = field.fontFamily.toLowerCase();
  const isBold = field.fontWeight === '600' || field.fontWeight === '700';

  if (family.includes('serif') || family.includes('playfair') || family.includes('cinzel') || family.includes('vibes') || family.includes('brush')) {
    return isBold
      ? await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
      : await pdfDoc.embedFont(StandardFonts.TimesRoman);
  } else if (family.includes('mono') || family.includes('code')) {
    return isBold
      ? await pdfDoc.embedFont(StandardFonts.CourierBold)
      : await pdfDoc.embedFont(StandardFonts.Courier);
  } else {
    return isBold
      ? await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      : await pdfDoc.embedFont(StandardFonts.Helvetica);
  }
}
