// Spreadsheet reading (CSV / XLSX / XLS) and Excel template generation.
// Both manual uploads and Microsoft Excel imports end up as the same
// ParticipantData structure and go through the same validation.

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export interface ParticipantData {
  headers: string[];
  rows: Record<string, string>[];
  source: { kind: 'upload'; fileName: string } | { kind: 'microsoft'; workbook: string; worksheet: string; driveId: string; itemId: string };
  importedAt: number;
}

export const MAX_ROWS = 20000;
export const MAX_SPREADSHEET_BYTES = 15 * 1024 * 1024;

function normaliseHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = String(h ?? '').replace(/\s+/g, ' ').trim() || `Column ${i + 1}`;
    const n = seen.get(name.toLowerCase()) || 0;
    seen.set(name.toLowerCase(), n + 1);
    if (n > 0) name = `${name} (${n + 1})`;
    return name;
  });
}

function gridToData(grid: unknown[][]): { headers: string[]; rows: Record<string, string>[] } {
  const nonEmpty = grid.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = normaliseHeaders(nonEmpty[0]);
  const body = nonEmpty.slice(1);
  if (body.length > MAX_ROWS) throw new Error(`The file has ${body.length.toLocaleString()} rows. The limit is ${MAX_ROWS.toLocaleString()} per batch.`);
  const rows = body.map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()])));
  return { headers, rows };
}

export async function readSpreadsheetFile(file: File): Promise<ParticipantData> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_SPREADSHEET_BYTES) throw new Error('The file is larger than 15 MB.');
  let grid: unknown[][];
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
    if (parsed.errors.length && parsed.data.length === 0) throw new Error('The CSV file could not be read.');
    grid = parsed.data;
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const sheetName = wb.SheetNames.find((n) => !/instruction/i.test(n)) || wb.SheetNames[0];
    if (!sheetName) throw new Error('The workbook has no worksheets.');
    // raw:false keeps values as displayed in Excel (dates, leading zeros in formatted cells).
    grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: '', blankrows: false });
  } else {
    throw new Error('Unsupported file. Upload an .xlsx, .xls or .csv file.');
  }
  const { headers, rows } = gridToData(grid);
  if (headers.length === 0) throw new Error('The file is empty.');
  if (rows.length === 0) throw new Error('The file has column headings but no participant rows.');
  return { headers, rows, source: { kind: 'upload', fileName: file.name }, importedAt: Date.now() };
}

// ------------------------------------------------------------------ template

export interface TemplateColumn {
  name: string;
  description: string;
  samples: [string, string];
}

const SAMPLE_VALUES: Record<string, [string, string]> = {
  name: ['Karma Dorji', 'Sonam Wangmo'],
  full_name: ['Karma Dorji', 'Sonam Wangmo'],
  recipient_name: ['Karma Dorji', 'Sonam Wangmo'],
  cid: ['107XXXXXXXX', '108XXXXXXXX'],
  workshop: ['UX Workshop', 'UX Workshop'],
  programme: ['Digital Skills Programme', 'Digital Skills Programme'],
  course: ['Web Development', 'Web Development'],
  college: ['Gyalpozhing College of IT', 'Gyalpozhing College of IT'],
  date: ['12/11/2026', '12/11/2026'],
  email: ['karma@example.org', 'sonam@example.org'],
  grade: ['Distinction', 'Merit'],
  photo: ['karma.jpg', 'sonam.jpg'],
  signature: ['karma_sign.png', 'sonam_sign.png'],
};

export function sampleFor(column: string, i: 0 | 1): string {
  const k = column.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (SAMPLE_VALUES[k]) return SAMPLE_VALUES[k][i];
  if (/date/.test(k)) return SAMPLE_VALUES.date[i];
  if (/name/.test(k)) return SAMPLE_VALUES.name[i];
  if (/photo|image|picture/.test(k)) return SAMPLE_VALUES.photo[i];
  if (/sign/.test(k)) return SAMPLE_VALUES.signature[i];
  return i === 0 ? 'Example value' : 'Another value';
}

export function downloadExcelTemplate(columns: TemplateColumn[], fileBase: string) {
  const wb = XLSX.utils.book_new();
  const data = [columns.map((c) => c.name), columns.map((c) => c.samples[0]), columns.map((c) => c.samples[1])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(14, c.name.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Participants');
  const help = [
    ['Column', 'What to enter'],
    ...columns.map((c) => [c.name, c.description]),
    [],
    ['Tips', ''],
    ['', 'Keep the first row as column headings. Add one participant per row below it.'],
    ['', 'Replace the two example rows with your participants.'],
    ['', 'Photo and signature columns must contain the exact file name of each image (e.g. karma.jpg).'],
    ['', 'Store ID numbers as text so leading zeros are kept.'],
  ];
  const hs = XLSX.utils.aoa_to_sheet(help);
  hs['!cols'] = [{ wch: 24 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, hs, 'Instructions');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase.replace(/[^\w\- ]+/g, '').trim() || 'participants'} - participant template.xlsx`);
}
