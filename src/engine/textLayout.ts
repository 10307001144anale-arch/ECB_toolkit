// Text fitting used by BOTH the preview and the final PDF (the preview is a
// rasterised copy of the real PDF), so what the client sees is what they get.

import type { TextBox, TextTransform } from '../../shared/types';

export interface Measurer {
  /** Width in points of `text` at `size` (letter spacing excluded). */
  width(text: string, size: number): number;
}

export interface TextLayoutResult {
  lines: string[];
  fontSize: number;
  lineHeight: number; // pt between baselines
  /** True when the text could not fit even at the minimum size (it was shortened). */
  overflow: boolean;
}

export function applyTransform(text: string, t: TextTransform): string {
  switch (t) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'titlecase':
      return text.replace(/\p{L}[\p{L}'’]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    default:
      return text;
  }
}

function spacedWidth(m: Measurer, s: string, size: number, spacing: number): number {
  const chars = [...s].length;
  return m.width(s, size) + (chars > 1 ? spacing * (chars - 1) : 0);
}

/** Breaks a single word that is wider than the box into pieces. */
function breakWord(word: string, maxW: number, m: Measurer, size: number, spacing: number): string[] {
  const parts: string[] = [];
  let cur = '';
  for (const ch of [...word]) {
    if (cur && spacedWidth(m, cur + ch, size, spacing) > maxW) {
      parts.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function wrapParagraph(p: string, maxW: number, m: Measurer, size: number, spacing: number): string[] {
  const words = p.split(/ +/).filter((w, i, a) => w !== '' || a.length === 1);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (spacedWidth(m, test, size, spacing) <= maxW) {
      cur = test;
      continue;
    }
    if (cur) lines.push(cur);
    if (spacedWidth(m, word, size, spacing) > maxW) {
      const pieces = breakWord(word, maxW, m, size, spacing);
      lines.push(...pieces.slice(0, -1));
      cur = pieces[pieces.length - 1] || '';
    } else cur = word;
  }
  lines.push(cur);
  return lines;
}

function buildLines(paragraphs: string[], box: TextBox, maxW: number, m: Measurer, size: number): string[] {
  if (!box.wrap) return paragraphs;
  return paragraphs.flatMap((p) => wrapParagraph(p, maxW, m, size, box.letterSpacing));
}

function fits(lines: string[], box: TextBox, maxW: number, maxH: number, m: Measurer, size: number): boolean {
  const lh = size * box.lineHeight;
  // Height uses the line pitch for all but the last line, plus the font size for the last one.
  const height = (lines.length - 1) * lh + size;
  if (height > maxH + 0.01) return false;
  return lines.every((l) => spacedWidth(m, l, size, box.letterSpacing) <= maxW + 0.01);
}

function ellipsize(line: string, maxW: number, m: Measurer, size: number, spacing: number): string {
  if (spacedWidth(m, `${line}…`, size, spacing) <= maxW) return `${line}…`;
  const chars = [...line];
  while (chars.length > 0 && spacedWidth(m, `${chars.join('')}…`, size, spacing) > maxW) chars.pop();
  return chars.length ? `${chars.join('').trimEnd()}…` : '';
}

/** Internal padding inside every text box, in points. */
export const TEXT_PADDING = 1;

export function layoutText(rawText: string, box: TextBox, boxW: number, boxH: number, m: Measurer): TextLayoutResult {
  const text = applyTransform(rawText, box.transform);
  const maxW = Math.max(1, boxW - TEXT_PADDING * 2);
  const maxH = Math.max(1, boxH - TEXT_PADDING * 2);
  const paragraphs = box.multiline ? text.split(/\r?\n/) : [text.replace(/\s*\r?\n\s*/g, ' ')];

  let size = box.autoFit ? box.maxFontSize : box.fontSize;
  const minSize = box.autoFit ? Math.min(box.minFontSize, box.maxFontSize) : box.fontSize;
  let lines = buildLines(paragraphs, box, maxW, m, size);

  if (box.autoFit) {
    while (!fits(lines, box, maxW, maxH, m, size) && size > minSize) {
      size = Math.max(minSize, Math.round((size - 0.5) * 2) / 2);
      lines = buildLines(paragraphs, box, maxW, m, size);
    }
  }

  let overflow = false;
  if (!fits(lines, box, maxW, maxH, m, size)) {
    overflow = true;
    const lh = size * box.lineHeight;
    const maxLines = Math.max(1, Math.floor((maxH - size) / lh) + 1);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = ellipsize(lines[maxLines - 1], maxW, m, size, box.letterSpacing);
    }
    lines = lines.map((l) => (spacedWidth(m, l, size, box.letterSpacing) > maxW ? ellipsize(l, maxW, m, size, box.letterSpacing) : l));
  }

  return { lines, fontSize: size, lineHeight: size * box.lineHeight, overflow };
}
