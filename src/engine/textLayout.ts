// Text fitting used by BOTH the preview and the final PDF (the preview is a
// rasterised copy of the real PDF), so what the client sees is what they get.

import type { HAlign, TextBox, TextTransform } from '../../shared/types';
import type { RichDoc, RichRun } from '../../shared/rich';

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

// ------------------------------------------------------------------ rich text


export interface RichStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  bg: string | null;
  scale: number;
}

export interface StyledMeasurer {
  /** Width in points of `text` in `style` at `size` (the base size; the style's scale is applied by the caller). */
  width(text: string, size: number, style: RichStyle): number;
}

export interface RichFragment {
  text: string;
  style: RichStyle;
  width: number;
}

export interface RichLine {
  fragments: RichFragment[];
  width: number;
  maxScale: number;
  align: HAlign;
}

export interface RichLayoutResult {
  lines: RichLine[];
  fontSize: number;
  lineHeight: number; // multiplier of the line's size
  overflow: boolean;
  /** Distance from the top of the text block to each line's baseline (pt). */
  baselines: number[];
  height: number;
}

export function styleOf(run: RichRun, box: TextBox): RichStyle {
  return {
    bold: run.b ?? box.fontWeight === '700',
    italic: run.i ?? box.italic,
    underline: !!run.u,
    color: run.color || box.color,
    bg: run.bg || null,
    scale: run.size ?? 1,
  };
}

/** Same style for both fragments? (fragments of one style are measured and drawn together) */
function sameRichStyle(a: RichStyle, b: RichStyle) {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.color === b.color && a.bg === b.bg && a.scale === b.scale;
}

interface Atom {
  text: string;
  style: RichStyle;
  space: boolean;
}

function fragW(m: StyledMeasurer, text: string, style: RichStyle, size: number, spacing: number) {
  const s = size * style.scale;
  return m.width(text, s, style) + spacing * [...text].length;
}

function buildRichLines(paras: { align?: HAlign; atoms: Atom[] }[], box: TextBox, maxW: number, m: StyledMeasurer, size: number): RichLine[] {
  const sp = box.letterSpacing;
  const lines: RichLine[] = [];
  const finish = (frags: RichFragment[], align: HAlign) => {
    // Trim trailing spaces.
    while (frags.length && /^ +$/.test(frags[frags.length - 1].text)) frags.pop();
    const merged: RichFragment[] = [];
    for (const f of frags) {
      const last = merged[merged.length - 1];
      if (last && sameRichStyle(last.style, f.style)) {
        last.text += f.text;
        last.width = fragW(m, last.text, last.style, size, sp);
      } else merged.push({ ...f });
    }
    lines.push({
      fragments: merged,
      width: merged.reduce((a, f) => a + f.width, 0),
      maxScale: merged.length ? Math.max(...merged.map((f) => f.style.scale)) : 1,
      align,
    });
  };
  for (const p of paras) {
    const align = p.align || box.align;
    if (!box.wrap) {
      finish(
        p.atoms.map((a) => ({ text: a.text, style: a.style, width: fragW(m, a.text, a.style, size, sp) })),
        align
      );
      continue;
    }
    // Group atoms into words (no spaces inside) separated by space atoms.
    const words: { pre: Atom[]; parts: Atom[] }[] = [];
    let pre: Atom[] = [];
    let cur: Atom[] | null = null;
    for (const a of p.atoms) {
      if (a.space) {
        if (cur) {
          words.push({ pre, parts: cur });
          cur = null;
          pre = [];
        }
        pre.push(a);
      } else {
        (cur ||= []).push(a);
      }
    }
    if (cur) words.push({ pre, parts: cur });
    let line: RichFragment[] = [];
    let lineW = 0;
    const toFrags = (atoms: Atom[]) => atoms.map((a) => ({ text: a.text, style: a.style, width: fragW(m, a.text, a.style, size, sp) }));
    for (const w of words) {
      const preF = toFrags(w.pre);
      const partF = toFrags(w.parts);
      const preW = preF.reduce((s, f) => s + f.width, 0);
      const wordW = partF.reduce((s, f) => s + f.width, 0);
      if (line.length && lineW + preW + wordW <= maxW) {
        line.push(...preF, ...partF);
        lineW += preW + wordW;
        continue;
      }
      if (line.length) {
        finish(line, align);
        line = [];
        lineW = 0;
      }
      if (wordW <= maxW) {
        line.push(...partF);
        lineW = wordW;
        continue;
      }
      // A single word wider than the box: break it by characters.
      for (const f of partF) {
        for (const ch of [...f.text]) {
          const cw = fragW(m, ch, f.style, size, sp);
          if (line.length && lineW + cw > maxW) {
            finish(line, align);
            line = [];
            lineW = 0;
          }
          line.push({ text: ch, style: f.style, width: cw });
          lineW += cw;
        }
      }
    }
    finish(line, align);
  }
  return lines;
}

function richMetrics(lines: RichLine[], size: number, lh: number) {
  const baselines: number[] = [];
  let y = 0;
  lines.forEach((l, i) => {
    const s = size * (l.maxScale || 1);
    y += i === 0 ? s * 0.8 : s * lh;
    baselines.push(y);
  });
  const last = lines[lines.length - 1];
  const height = lines.length ? y + size * (last.maxScale || 1) * 0.2 : 0;
  return { baselines, height };
}

export function layoutRich(doc: RichDoc, box: TextBox, boxW: number, boxH: number, m: StyledMeasurer): RichLayoutResult {
  const maxW = Math.max(1, boxW - TEXT_PADDING * 2);
  const maxH = Math.max(1, boxH - TEXT_PADDING * 2);
  const toAtoms = (runs: RichRun[]): Atom[] =>
    runs.flatMap((r) => {
      const style = styleOf(r, box);
      return applyTransform(r.text, box.transform)
        .split(/( +)/)
        .filter(Boolean)
        .map((t) => ({ text: t, style, space: /^ +$/.test(t) }));
    });
  let paras: { align?: HAlign; atoms: Atom[] }[];
  if (box.multiline) paras = doc.paragraphs.map((p) => ({ align: p.align, atoms: toAtoms(p.runs) }));
  else {
    // Single-line boxes join paragraphs with a space.
    const runs: RichRun[] = [];
    doc.paragraphs.forEach((p, i) => {
      if (i > 0) runs.push({ text: ' ' });
      runs.push(...p.runs);
    });
    paras = [{ align: doc.paragraphs[0]?.align, atoms: toAtoms(runs) }];
  }

  let size = box.autoFit ? box.maxFontSize : box.fontSize;
  const minSize = box.autoFit ? Math.min(box.minFontSize, box.maxFontSize) : box.fontSize;
  const fitsNow = (lines: RichLine[], s: number) => richMetrics(lines, s, box.lineHeight).height <= maxH + 0.01 && lines.every((l) => l.width <= maxW + 0.01);
  let lines = buildRichLines(paras, box, maxW, m, size);
  if (box.autoFit) {
    while (!fitsNow(lines, size) && size > minSize) {
      size = Math.max(minSize, Math.round((size - 0.5) * 2) / 2);
      lines = buildRichLines(paras, box, maxW, m, size);
    }
  }
  let overflow = false;
  if (!fitsNow(lines, size)) {
    overflow = true;
    while (lines.length > 1 && richMetrics(lines, size, box.lineHeight).height > maxH + 0.01) lines = lines.slice(0, -1);
    const last = lines[lines.length - 1];
    if (last?.fragments.length) {
      const f = last.fragments[last.fragments.length - 1];
      f.text = `${f.text.replace(/\s+$/, '')}…`;
      // Shorten fragments that run past the right edge.
      for (const l of lines) {
        let w = 0;
        l.fragments = l.fragments.filter((fr) => {
          if (w >= maxW) return false;
          w += fr.width;
          return true;
        });
        l.width = Math.min(l.width, maxW);
      }
    }
  }
  const { baselines, height } = richMetrics(lines, size, box.lineHeight);
  return { lines, fontSize: size, lineHeight: box.lineHeight, overflow, baselines, height };
}
