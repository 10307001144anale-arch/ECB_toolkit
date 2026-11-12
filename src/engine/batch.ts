// Client-side batch logic: placeholder analysis, column mapping, value
// formatting, row validation and resolving each participant into the values
// the renderer draws. Participant data never leaves the browser.

import {
  collectPlaceholders,
  columnToPlaceholder,
  findMalformedPlaceholders,
  findPlaceholders,
  isSystemPlaceholder,
  matchColumn,
  normKey,
  resolvePlaceholders,
  SYSTEM_PLACEHOLDERS,
} from '../../shared/placeholders';
import type {
  ContentConfig,
  PhotoCrop,
  MappingConfig,
  PlaceholderSetting,
  PlaceholderType,
  TemplateLayout,
  TextBox,
  SignatureBox,
  SignatureContent,
} from '../../shared/types';
import type { ImageLibrary } from './images';
import type { ResolvedCertificate } from './renderer';

export const PREVIEW_CERT_ID = 'CG-PREV-IEW0-0000';

export function emptyContent(layout: TemplateLayout): ContentConfig {
  const c: ContentConfig = { texts: {}, qr: {}, signatures: {}, photos: {} };
  for (const b of layout.boxes) {
    if (b.type === 'text') c.texts[b.key] = b.defaultText || '';
    if (b.type === 'qr') c.qr[b.key] = { mode: b.contentMode === 'client' ? 'custom' : 'verification', value: '' };
    if (b.type === 'photo') c.photos[b.key] = { column: '' };
    if (b.type === 'signature') {
      const mode = b.source === 'client' ? 'single' : b.fixedSignatureFileId ? 'fixed' : 'single';
      c.signatures[b.key] = { mode: b.required ? mode : b.source === 'client' ? 'none' : mode, column: '', fileName: '', scale: 1, offsetX: 0, offsetY: 0 };
    }
  }
  return c;
}

/** Keeps only content that matches the template's current boxes (e.g. when loading a preset). */
export function fitContentToLayout(layout: TemplateLayout, content: Partial<ContentConfig> | null | undefined): ContentConfig {
  const base = emptyContent(layout);
  if (!content) return base;
  for (const b of layout.boxes) {
    if (b.type === 'text' && typeof content.texts?.[b.key] === 'string') base.texts[b.key] = content.texts[b.key];
    if (b.type === 'qr' && content.qr?.[b.key]) {
      const q = content.qr[b.key];
      const mode = b.contentMode === 'client' ? 'custom' : b.contentMode === 'verification' ? 'verification' : q.mode;
      base.qr[b.key] = { mode, value: q.value || '' };
    }
    if (b.type === 'photo' && content.photos?.[b.key]) base.photos[b.key] = { column: content.photos[b.key].column || '' };
    if (b.type === 'signature' && content.signatures?.[b.key]) {
      const s = content.signatures[b.key];
      let mode = s.mode;
      if (mode === 'fixed' && (b.source === 'client' || !b.fixedSignatureFileId)) mode = 'single';
      if ((mode === 'single' || mode === 'column') && b.source === 'fixed') mode = 'fixed';
      base.signatures[b.key] = { mode, column: s.column || '', fileName: s.fileName || '', scale: s.scale ?? 1, offsetX: s.offsetX ?? 0, offsetY: s.offsetY ?? 0 };
    }
  }
  return base;
}

// ------------------------------------------------------------------ placeholders

export interface PlaceholderUse {
  boxKey: string;
  label: string;
  required: boolean;
  kind: 'text' | 'qr';
}

export interface PlaceholderInfo {
  key: string;
  name: string;
  system: boolean;
  uses: PlaceholderUse[];
}

/** Names accepted in the (name) alternative syntax: column-derived names, system names and {{}} names already used. */
export function registeredNames(content: ContentConfig, headers: string[]): Set<string> {
  const set = new Set<string>(Object.keys(SYSTEM_PLACEHOLDERS));
  for (const h of headers) set.add(columnToPlaceholder(h));
  const curly = collectPlaceholders([...Object.values(content.texts), ...Object.values(content.qr).map((q) => q.value)]);
  for (const k of curly.keys()) set.add(k);
  return set;
}

export function analysePlaceholders(layout: TemplateLayout, content: ContentConfig, registered: Set<string>): PlaceholderInfo[] {
  const map = new Map<string, PlaceholderInfo>();
  const add = (text: string, use: PlaceholderUse) => {
    for (const t of findPlaceholders(text, registered)) {
      let p = map.get(t.key);
      if (!p) {
        p = { key: t.key, name: t.name, system: isSystemPlaceholder(t.key), uses: [] };
        map.set(t.key, p);
      }
      if (!p.uses.some((u) => u.boxKey === use.boxKey)) p.uses.push(use);
    }
  };
  for (const b of layout.boxes) {
    if (b.type === 'text') add(content.texts[b.key] || '', { boxKey: b.key, label: b.label, required: b.required, kind: 'text' });
    if (b.type === 'qr' && content.qr[b.key]?.mode === 'custom') add(content.qr[b.key].value || '', { boxKey: b.key, label: b.label, required: b.required, kind: 'qr' });
  }
  return [...map.values()];
}

export interface ContentIssue {
  boxKey: string;
  level: 'error' | 'warning';
  message: string;
}

/** Problems with the wording itself (before any participant data). */
export function contentIssues(layout: TemplateLayout, content: ContentConfig): ContentIssue[] {
  const issues: ContentIssue[] = [];
  for (const b of layout.boxes) {
    if (b.type === 'text') {
      const t = content.texts[b.key] || '';
      if (b.required && !t.trim()) issues.push({ boxKey: b.key, level: 'error', message: `"${b.label}" is required.` });
      for (const m of findMalformedPlaceholders(t)) {
        issues.push({ boxKey: b.key, level: 'error', message: `${m} is not a valid placeholder. Use letters, numbers and underscores only, e.g. {{full_name}}.` });
      }
      if (/\{\{[^}]*$/.test(t) || /^[^{]*\}\}/.test(t)) issues.push({ boxKey: b.key, level: 'warning', message: 'A placeholder is missing its opening {{ or closing }}.' });
      if (!b.multiline && /\n/.test(t)) issues.push({ boxKey: b.key, level: 'warning', message: 'Line breaks are not allowed in this box and will be replaced by spaces.' });
    }
    if (b.type === 'qr') {
      const q = content.qr[b.key];
      if (q?.mode === 'custom' && b.required && !q.value.trim()) issues.push({ boxKey: b.key, level: 'error', message: `Enter the content for "${b.label}".` });
      if (q?.mode === 'custom' && q.value.length > 1500) issues.push({ boxKey: b.key, level: 'error', message: 'QR content is too long (max 1,500 characters).' });
    }
  }
  return issues;
}

// ------------------------------------------------------------------ mapping

export function autoMapping(placeholders: PlaceholderInfo[], headers: string[], previous?: MappingConfig | null): MappingConfig {
  const out: MappingConfig = { placeholders: {}, recipientColumn: null, idColumn: null };
  const taken = new Set<string>();
  for (const p of placeholders) {
    if (p.system) continue;
    const prev = previous?.placeholders[p.key];
    let column = prev?.column && headers.includes(prev.column) ? prev.column : null;
    if (!column) column = matchColumn(p.name, headers, taken);
    if (column) taken.add(column);
    out.placeholders[p.key] = {
      column,
      type: prev?.type || (/date/i.test(p.key) ? 'date' : 'text'),
      dateFormat: prev?.dateFormat || 'D MMMM YYYY',
    };
  }
  const prevRecipient = previous?.recipientColumn;
  out.recipientColumn =
    prevRecipient && headers.includes(prevRecipient)
      ? prevRecipient
      : out.placeholders['name']?.column || out.placeholders['full_name']?.column || out.placeholders['recipient_name']?.column || matchColumn('name', headers) || null;
  // Participant ID (normally CID) is always looked for, even if it is not printed: photos can be named after it.
  const prevId = previous?.idColumn;
  out.idColumn = prevId && headers.includes(prevId) ? prevId : out.placeholders['cid']?.column || matchColumn('cid', headers) || null;
  return out;
}

// ------------------------------------------------------------------ value formatting

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const DATE_FORMATS = [
  { value: 'D MMMM YYYY', example: '12 November 2026' },
  { value: 'Do MMMM YYYY', example: '12th November 2026' },
  { value: 'MMMM D, YYYY', example: 'November 12, 2026' },
  { value: 'DD/MM/YYYY', example: '12/11/2026' },
  { value: 'MM/DD/YYYY', example: '11/12/2026' },
  { value: 'YYYY-MM-DD', example: '2026-11-12' },
  { value: 'D MMM YYYY', example: '12 Nov 2026' },
  { value: 'as-is', example: 'Keep as written' },
];

/** Parses common spreadsheet date forms. Slash dates are read day-first (DD/MM/YYYY). */
export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 20000 && serial < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return utc(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    let [d, mo, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += 2000;
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return utc(y, mo, d);
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m![2].toLowerCase().slice(0, 3)));
    if (mi >= 0) return utc(+m[3], mi + 1, +m[1]);
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m) {
    const mi = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m![1].toLowerCase().slice(0, 3)));
    if (mi >= 0) return utc(+m[3], mi + 1, +m[2]);
  }
  return null;
}

function utc(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatDate(d: Date, fmt: string): string {
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  return fmt.replace(/YYYY|MMMM|MMM|MM|Do|DD|D/g, (t) => {
    switch (t) {
      case 'YYYY': return String(year);
      case 'MMMM': return MONTHS[month];
      case 'MMM': return MONTHS[month].slice(0, 3);
      case 'MM': return String(month + 1).padStart(2, '0');
      case 'Do': return ordinal(day);
      case 'DD': return String(day).padStart(2, '0');
      default: return String(day);
    }
  });
}

export function formatValue(raw: string, setting: PlaceholderSetting | undefined): { value: string; error?: string } {
  const v = (raw ?? '').trim();
  if (!v || !setting) return { value: v };
  if (setting.type === 'number') {
    const n = Number(v.replace(/[,\s]/g, ''));
    if (!Number.isFinite(n)) return { value: v, error: `"${v}" is not a number` };
    return { value: v };
  }
  if (setting.type === 'date') {
    if (setting.dateFormat === 'as-is') return { value: v };
    const d = parseDate(v);
    if (!d) return { value: v, error: `"${v}" is not a recognised date (use e.g. 12/11/2026 or 2026-11-12)` };
    return { value: formatDate(d, setting.dateFormat || 'D MMMM YYYY') };
  }
  return { value: v };
}

// ------------------------------------------------------------------ rows

export interface BatchContext {
  layout: TemplateLayout;
  content: ContentConfig;
  mapping: MappingConfig;
  placeholders: PlaceholderInfo[];
  registered: Set<string>;
  images: ImageLibrary;
  hasFixedSignature: (boxKey: string) => boolean;
  verifyBaseUrl: string;
  today: string;
  /** Manual photo crops, keyed `${photoBoxKey}|${imageFileName}`. */
  crops: Record<string, PhotoCrop>;
}

/** Column that holds photo file names for a photo box ('' = none chosen). */
export function photoColumn(ctx: Pick<BatchContext, 'content'>, boxKey: string): string {
  return ctx.content.photos[boxKey]?.column || '';
}

/**
 * Finds a participant's photo: first by the file name in the photo column,
 * then by the participant ID (e.g. 10701000001.jpg). Never by upload order.
 */
export function findPhoto(ctx: Pick<BatchContext, 'content' | 'mapping' | 'images'>, boxKey: string, row: Record<string, string>) {
  const col = photoColumn(ctx, boxKey);
  const byName = col ? ctx.images.find(row[col]) : null;
  if (byName) return { entry: byName, tried: row[col] || '' };
  const id = ctx.mapping.idColumn ? (row[ctx.mapping.idColumn] || '').trim() : '';
  const byId = id ? ctx.images.find(id) : null;
  if (byId) return { entry: byId, tried: id };
  return { entry: null, tried: (col && row[col]) || id || '' };
}

export interface RowCheck {
  errors: string[];
  warnings: string[];
}

/** Placeholder values for one row (formatted). */
export function rowValues(ctx: BatchContext, row: Record<string, string>, index: number, certificateId: string): { values: Record<string, string>; errors: string[] } {
  const values: Record<string, string> = { certificateid: certificateId, row: String(index + 1), today: ctx.today };
  const errors: string[] = [];
  for (const p of ctx.placeholders) {
    if (p.system) continue;
    const s = ctx.mapping.placeholders[p.key];
    const raw = s?.column ? row[s.column] ?? '' : '';
    const f = formatValue(raw, s);
    if (f.error) errors.push(`${s?.column || p.name}: ${f.error}`);
    values[p.key] = f.value;
  }
  return { values, errors };
}

function sigBlob(ctx: BatchContext, boxKey: string, row: Record<string, string>, fixed: (k: string) => Blob | null): { blob: Blob | null; problem?: string } {
  const s = ctx.content.signatures[boxKey];
  if (!s || s.mode === 'none') return { blob: null };
  if (s.mode === 'fixed') return { blob: fixed(boxKey), problem: fixed(boxKey) ? undefined : 'The administrator signature is not available' };
  if (s.mode === 'single') {
    const e = ctx.images.find(s.fileName);
    return { blob: e?.blob || null, problem: e ? undefined : 'Upload the signature image' };
  }
  const name = row[s.column] || '';
  if (!name.trim()) return { blob: null, problem: `No signature file name in "${s.column}"` };
  const e = ctx.images.find(name);
  return { blob: e?.blob || null, problem: e ? undefined : `Signature "${name}" was not uploaded` };
}

/**
 * Validates every row. Errors block a row from generation; warnings do not.
 * Duplicate checks run across all rows.
 */
export function validateRows(ctx: BatchContext, rows: Record<string, string>[]): RowCheck[] {
  const textBoxes = ctx.layout.boxes.filter((b): b is TextBox => b.type === 'text');
  const dupKeys = ctx.placeholders.filter((p) => !p.system && /cert|serial|reg(istration)?_?no/i.test(p.key));
  const seen = new Map<string, Map<string, number>>();
  for (const p of dupKeys) seen.set(p.key, new Map());
  const checks: RowCheck[] = rows.map((row, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const { values, errors: fmtErrors } = rowValues(ctx, row, i, PREVIEW_CERT_ID);
    errors.push(...fmtErrors);
    for (const b of textBoxes) {
      const text = ctx.content.texts[b.key] || '';
      if (!text.trim()) continue;
      const r = resolvePlaceholders(text, values, ctx.registered);
      if (r.missing.length) {
        const cols = r.missing.map((m) => ctx.mapping.placeholders[normKey(m)]?.column || `{{${m}}}`);
        if (b.required) errors.push(`"${b.label}" needs a value for ${[...new Set(cols)].join(', ')}`);
        else warnings.push(`"${b.label}" will be left empty (missing ${[...new Set(cols)].join(', ')})`);
      } else if (b.maxChars && r.text.length > b.maxChars) {
        errors.push(`"${b.label}" is ${r.text.length} characters (maximum ${b.maxChars})`);
      }
    }
    for (const b of ctx.layout.boxes) {
      if (b.type === 'qr') {
        const q = ctx.content.qr[b.key];
        if (q?.mode === 'custom' && q.value.trim()) {
          const r = resolvePlaceholders(q.value, values, ctx.registered);
          if (r.missing.length) (b.required ? errors : warnings).push(`QR "${b.label}" is missing ${r.missing.join(', ')}`);
        }
      } else if (b.type === 'photo') {
        const { entry, tried } = findPhoto(ctx, b.key, row);
        if (!entry) {
          if (!tried) (b.required ? errors : warnings).push(`No photo for "${b.label}" (no file name or ID)`);
          else (b.required ? errors : warnings).push(`Photo "${tried}" was not uploaded`);
        }
      } else if (b.type === 'signature') {
        const res = sigBlob(ctx, b.key, row, (k) => (ctx.hasFixedSignature(k) ? new Blob() : null));
        if (res.problem) (b.required || ctx.content.signatures[b.key]?.mode !== 'column' ? errors : warnings).push(res.problem);
      }
    }
    for (const p of dupKeys) {
      const v = values[p.key];
      if (v) seen.get(p.key)!.set(v, (seen.get(p.key)!.get(v) || 0) + 1);
    }
    return { errors, warnings };
  });
  // Second pass for duplicates.
  rows.forEach((row, i) => {
    const { values } = rowValues(ctx, row, i, PREVIEW_CERT_ID);
    for (const p of dupKeys) {
      const v = values[p.key];
      if (v && (seen.get(p.key)!.get(v) || 0) > 1) checks[i].errors.push(`Duplicate ${ctx.mapping.placeholders[p.key]?.column || p.name}: "${v}"`);
    }
  });
  return checks;
}

/** Turns one participant row into exactly what is drawn on the certificate. */
export function resolveCertificate(
  ctx: BatchContext,
  row: Record<string, string>,
  index: number,
  certificateId: string,
  fixedSignature: (boxKey: string) => Blob | null
): ResolvedCertificate {
  const { values } = rowValues(ctx, row, index, certificateId);
  const cert: ResolvedCertificate = { texts: {}, qr: {}, images: {} };
  for (const b of ctx.layout.boxes) {
    if (b.type === 'text') {
      const text = ctx.content.texts[b.key] || '';
      const r = resolvePlaceholders(text, values, ctx.registered);
      cert.texts[b.key] = r.missing.length && !b.required ? '' : r.text;
    } else if (b.type === 'qr') {
      const q = ctx.content.qr[b.key];
      if (!q) cert.qr[b.key] = null;
      else if (q.mode === 'verification') cert.qr[b.key] = `${ctx.verifyBaseUrl}/verify/${certificateId}`;
      else {
        const r = resolvePlaceholders(q.value, values, ctx.registered);
        cert.qr[b.key] = r.missing.length ? null : r.text;
      }
    } else if (b.type === 'photo') {
      const { entry } = findPhoto(ctx, b.key, row);
      cert.images[b.key] = entry?.blob || null;
      const manual = entry ? ctx.crops[`${b.key}|${entry.name}`] : undefined;
      if (manual) (cert.crops ||= {})[b.key] = manual;
    } else {
      cert.images[b.key] = sigBlob(ctx, b.key, row, fixedSignature).blob;
      const sc = ctx.content.signatures[b.key];
      if (sc) (cert.placements ||= {})[b.key] = { scale: sc.scale ?? 1, offsetX: sc.offsetX ?? 0, offsetY: sc.offsetY ?? 0 };
      const signer = signerFor(b, sc);
      if (signer) (cert.signers ||= {})[b.key] = signer;
    }
  }
  return cert;
}

/** Name/title printed under a signature (client's override, else the administrator's). */
export function signerFor(box: SignatureBox, sc: SignatureContent | undefined): { name: string; title: string } | null {
  const c = box.caption;
  if (!c?.enabled || sc?.mode === 'none') return null;
  // The administrator's own signature always keeps the administrator's signer name.
  const own = c.clientEditable && sc?.mode !== 'fixed';
  const name = (own && sc?.signerName !== undefined ? sc.signerName : c.name).trim();
  const title = (own && sc?.signerTitle !== undefined ? sc.signerTitle : c.title).trim();
  return name || title ? { name, title } : null;
}

/** Content shown while the client is still writing (placeholders visible as typed). */
export function draftCertificate(layout: TemplateLayout, content: ContentConfig, verifyBaseUrl: string, fixedSignature: (k: string) => Blob | null, images?: ImageLibrary): ResolvedCertificate {
  const cert: ResolvedCertificate = { texts: {}, qr: {}, images: {} };
  for (const b of layout.boxes) {
    if (b.type === 'text') cert.texts[b.key] = content.texts[b.key] || '';
    else if (b.type === 'qr') {
      const q = content.qr[b.key];
      cert.qr[b.key] = q ? (q.mode === 'verification' ? `${verifyBaseUrl}/verify/${PREVIEW_CERT_ID}` : q.value || null) : null;
    } else if (b.type === 'signature') {
      const s = content.signatures[b.key];
      cert.images[b.key] = s?.mode === 'fixed' ? fixedSignature(b.key) : s?.mode === 'single' && images ? images.find(s.fileName)?.blob || null : null;
      if (s) (cert.placements ||= {})[b.key] = { scale: s.scale ?? 1, offsetX: s.offsetX ?? 0, offsetY: s.offsetY ?? 0 };
      const signer = signerFor(b, s);
      if (signer) (cert.signers ||= {})[b.key] = signer;
    } else cert.images[b.key] = null;
  }
  return cert;
}

/** Safe, unique PDF file names: "001 - Karma Dorji.pdf". */
export function makeFileNames(rows: Record<string, string>[], indices: number[], nameColumn: string | null): Map<number, string> {
  const out = new Map<number, string>();
  const used = new Set<string>();
  const pad = String(rows.length).length;
  for (const i of indices) {
    const label = nameColumn ? (rows[i][nameColumn] || '').trim() : '';
    let base = `${String(i + 1).padStart(Math.max(3, pad), '0')}${label ? ` - ${label}` : ''}`
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
      .slice(0, 120)
      .trim();
    let name = `${base}.pdf`;
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${n++}).pdf`;
    used.add(name.toLowerCase());
    out.set(i, name);
  }
  return out;
}

export function placeholderTypeLabel(t: PlaceholderType) {
  return t === 'date' ? 'Date' : t === 'number' ? 'Number' : 'Text';
}
