// Date parsing/formatting shared by the designer, the client editor, the
// renderer and the server, plus the logic behind "Date" boxes.

import type { ContentConfig, DateBoxConfig, DateChoice, TextBox } from './types.ts';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const DATE_FORMATS = [
  { value: 'D MMMM YYYY', example: '12 November 2026' },
  { value: 'Do MMMM YYYY', example: '12th November 2026' },
  { value: 'Do [day of] MMMM YYYY', example: '12th day of November 2026' },
  { value: 'MMMM D, YYYY', example: 'November 12, 2026' },
  { value: 'DD/MM/YYYY', example: '12/11/2026' },
  { value: 'MM/DD/YYYY', example: '11/12/2026' },
  { value: 'DD-MM-YYYY', example: '12-11-2026' },
  { value: 'DD.MM.YYYY', example: '12.11.2026' },
  { value: 'YYYY-MM-DD', example: '2026-11-12' },
  { value: 'D MMM YYYY', example: '12 Nov 2026' },
  { value: 'MMMM YYYY', example: 'November 2026' },
  { value: 'as-is', example: 'Keep as written' },
];

/** Formats offered for Date boxes (everything except "keep as written"). */
export const DATE_BOX_FORMATS = DATE_FORMATS.filter((f) => f.value !== 'as-is');

function utc(y: number, m: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/** Parses common spreadsheet date forms. Slash dates are read day-first (DD/MM/YYYY). */
export function parseDate(raw: string): Date | null {
  const s = (raw || '').trim();
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

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Formats a UTC date. Text in [square brackets] is kept literally. */
export function formatDate(d: Date, fmt: string): string {
  const day = d.getUTCDate();
  const month = d.getUTCMonth();
  const year = d.getUTCFullYear();
  return fmt.replace(/\[([^\]]*)\]|YYYY|MMMM|MMM|MM|Do|DD|D/g, (t, lit) => {
    if (lit !== undefined) return lit;
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

/** Today's calendar date (in the viewer's time zone) as a UTC date for formatDate. */
export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** YYYY-MM-DD for <input type="date">. */
export function isoDay(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// --------------------------------------------------------------------------- Date boxes

export function defaultDateConfig(): DateBoxConfig {
  return { source: 'today', fixedDate: '', format: 'D MMMM YYYY', prefix: '', clientEditable: true };
}

/** Placeholder used when the date comes from a spreadsheet column. Contains "date" so it is treated as a date. */
export function dateColumnKey(box: Pick<TextBox, 'key'>): string {
  return /date/.test(box.key) ? box.key : `${box.key}_date`.slice(0, 64);
}

/** The date settings in force for a box: the client's choice when allowed, otherwise the administrator's. */
export function dateChoiceFor(box: TextBox, content?: Pick<ContentConfig, 'dates'> | null): DateChoice {
  const cfg = box.date || defaultDateConfig();
  const c = box.date?.clientEditable ? content?.dates?.[box.key] : undefined;
  return c ? { source: c.source, fixedDate: c.fixedDate, format: c.format } : { source: cfg.source, fixedDate: cfg.fixedDate, format: cfg.format };
}

/** The wording a Date box prints, e.g. "Date: 13 November 2026" or "Date: {{issue_date}}". */
export function dateBoxText(box: TextBox, choice: DateChoice, now = new Date()): string {
  const prefix = box.date?.prefix || '';
  if (choice.source === 'column') return `${prefix}{{${dateColumnKey(box)}}}`;
  const d = choice.source === 'today' ? todayUtc(now) : parseDate(choice.fixedDate);
  return d ? prefix + formatDate(d, choice.format || 'D MMMM YYYY') : '';
}

export function sanitizeDateChoice(v: any): DateChoice | null {
  if (!v || typeof v !== 'object') return null;
  const source = v.source === 'fixed' || v.source === 'column' ? v.source : 'today';
  const fixedDate = typeof v.fixedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.fixedDate) ? v.fixedDate : '';
  const format = DATE_BOX_FORMATS.some((f) => f.value === v.format) ? v.format : 'D MMMM YYYY';
  return { source, fixedDate, format };
}

export function sanitizeDateConfig(v: any): DateBoxConfig | null {
  if (!v || typeof v !== 'object') return null;
  const c = sanitizeDateChoice(v)!;
  const prefix = typeof v.prefix === 'string' ? v.prefix.replace(/[\u0000-\u001f]/g, '').slice(0, 60) : '';
  return { ...c, prefix, clientEditable: typeof v.clientEditable === 'boolean' ? v.clientEditable : true };
}
