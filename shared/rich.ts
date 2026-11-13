// Structured rich text for certificate wording (no HTML is ever stored).
//
// A document is a list of paragraphs; each paragraph is a list of runs with
// optional formatting. Placeholders such as {{name}} are ordinary text inside
// runs, so when they are replaced the value keeps the formatting of the
// placeholder (bold {{name}} → bold "Karma Dorji").

import { findPlaceholders } from './placeholders.ts';

export type RichAlign = 'left' | 'center' | 'right';

export interface RichRun {
  text: string;
  /** undefined = use the box's default style. */
  b?: boolean;
  i?: boolean;
  u?: boolean;
  color?: string; // #rrggbb
  bg?: string; // highlight #rrggbb
  /** Size relative to the box size (0.5 – 2). */
  size?: number;
}

export interface RichParagraph {
  align?: RichAlign;
  runs: RichRun[];
}

export interface RichDoc {
  paragraphs: RichParagraph[];
}

/** Which formatting clients may use in a text box (set by the administrator). */
export interface FormattingPermissions {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: boolean;
  highlight: boolean;
  size: boolean;
  align: boolean;
}

export const ALL_FORMATTING: FormattingPermissions = { bold: true, italic: true, underline: true, color: true, highlight: true, size: true, align: true };

const HEX = /^#[0-9a-f]{6}$/i;

export function plainToRich(text: string): RichDoc {
  return { paragraphs: (text || '').split(/\r?\n/).map((t) => ({ runs: t ? [{ text: t }] : [] })) };
}

export function richToPlain(doc: RichDoc | null | undefined): string {
  if (!doc) return '';
  return doc.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
}

function runHasStyle(r: RichRun) {
  return r.b !== undefined || r.i !== undefined || r.u !== undefined || !!r.color || !!r.bg || (r.size !== undefined && r.size !== 1);
}

/** True when the document carries any formatting (otherwise plain text is enough). */
export function hasFormatting(doc: RichDoc | null | undefined): boolean {
  return !!doc && doc.paragraphs.some((p) => !!p.align || p.runs.some(runHasStyle));
}

function sameStyle(a: RichRun, b: RichRun) {
  return a.b === b.b && a.i === b.i && a.u === b.u && a.color === b.color && a.bg === b.bg && (a.size ?? 1) === (b.size ?? 1);
}

/** Merges neighbouring runs with the same style and drops empty runs. */
export function normalizeRich(doc: RichDoc): RichDoc {
  return {
    paragraphs: doc.paragraphs.map((p) => {
      const runs: RichRun[] = [];
      for (const r of p.runs) {
        if (!r.text) continue;
        const last = runs[runs.length - 1];
        if (last && sameStyle(last, r)) last.text += r.text;
        else runs.push({ ...r });
      }
      return p.align ? { align: p.align, runs } : { runs };
    }),
  };
}

/** Validates untrusted input (from the browser or the database). */
export function sanitizeRich(input: any, maxChars = 5000, perms: FormattingPermissions = ALL_FORMATTING): RichDoc | null {
  if (!input || typeof input !== 'object' || !Array.isArray(input.paragraphs)) return null;
  let budget = maxChars;
  const paragraphs: RichParagraph[] = [];
  for (const p of input.paragraphs.slice(0, 200)) {
    const runs: RichRun[] = [];
    for (const r of Array.isArray(p?.runs) ? p.runs.slice(0, 500) : []) {
      if (typeof r?.text !== 'string' || budget <= 0) continue;
      const text = r.text.replace(/[\r\n]+/g, ' ').slice(0, budget);
      budget -= text.length;
      const run: RichRun = { text };
      if (perms.bold && typeof r.b === 'boolean') run.b = r.b;
      if (perms.italic && typeof r.i === 'boolean') run.i = r.i;
      if (perms.underline && typeof r.u === 'boolean') run.u = r.u;
      if (perms.color && typeof r.color === 'string' && HEX.test(r.color)) run.color = r.color.toLowerCase();
      if (perms.highlight && typeof r.bg === 'string' && HEX.test(r.bg)) run.bg = r.bg.toLowerCase();
      if (perms.size && typeof r.size === 'number' && Number.isFinite(r.size)) {
        const s = Math.min(2, Math.max(0.5, Math.round(r.size * 100) / 100));
        if (s !== 1) run.size = s;
      }
      runs.push(run);
    }
    const para: RichParagraph = { runs };
    if (perms.align && (p?.align === 'left' || p?.align === 'center' || p?.align === 'right')) para.align = p.align;
    paragraphs.push(para);
  }
  if (!paragraphs.length) paragraphs.push({ runs: [] });
  return normalizeRich({ paragraphs });
}

/**
 * Replaces placeholders inside a rich document. Each replacement keeps the
 * style of the first character of its placeholder, even if the placeholder's
 * characters were formatted differently.
 */
export function substituteRich(doc: RichDoc, resolve: (placeholderText: string) => string, registered?: Set<string>): RichDoc {
  return normalizeRich({
    paragraphs: doc.paragraphs.map((p) => {
      const full = p.runs.map((r) => r.text).join('');
      const tokens = findPlaceholders(full, registered);
      if (!tokens.length) return { ...p, runs: p.runs.map((r) => ({ ...r })) };
      // Style of every character.
      const styleAt: RichRun[] = [];
      for (const r of p.runs) for (let k = 0; k < r.text.length; k++) styleAt.push(r);
      const out: RichRun[] = [];
      const push = (text: string, style: RichRun) => {
        if (!text) return;
        const { text: _t, ...st } = style;
        out.push({ ...st, text });
      };
      let cursor = 0;
      // Copy text between placeholders run by run, preserving its formatting.
      const copy = (from: number, to: number) => {
        let k = from;
        while (k < to) {
          const st = styleAt[k];
          let e = k + 1;
          while (e < to && styleAt[e] === st) e++;
          push(full.slice(k, e), st);
          k = e;
        }
      };
      for (const tok of tokens) {
        copy(cursor, tok.start);
        push(resolve(full.slice(tok.start, tok.end)), styleAt[tok.start]);
        cursor = tok.end;
      }
      copy(cursor, full.length);
      return { ...p, runs: out };
    }),
  });
}

/** Replaces the text of a rich document while keeping formatting where the text is unchanged (used when plain text is edited elsewhere). */
export function richForText(text: string, previous: RichDoc | null | undefined): RichDoc | null {
  if (!previous) return null;
  return richToPlain(previous) === text ? previous : null;
}
