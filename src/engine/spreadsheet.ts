// Spreadsheet reading (CSV / XLSX / XLS) and the downloadable Excel template.
// Uploaded files, Microsoft Excel and Google Sheets all become the same
// ParticipantData via shared/table.ts and go through the same validation.

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { gridToTable } from '../../shared/table';
import { SYSTEM_PLACEHOLDERS } from '../../shared/placeholders';
import type { ContentConfig, TemplateLayout } from '../../shared/types';
import type { PlaceholderInfo } from './batch';

export type CloudProvider = 'microsoft' | 'google';

export interface ParticipantData {
  headers: string[];
  rows: Record<string, string>[];
  source: { kind: 'upload'; fileName: string } | { kind: 'cloud'; provider: CloudProvider; fileId: string; fileName: string; sheet: string };
  importedAt: number;
}

/** Only a file-size safety limit; there is no limit on the number of participants. */
export const MAX_SPREADSHEET_BYTES = 50 * 1024 * 1024;

export async function readSpreadsheetFile(file: File): Promise<ParticipantData> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_SPREADSHEET_BYTES) throw new Error('The file is larger than 50 MB. Split it into smaller files or remove unused sheets and columns.');
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
  return toParticipantData(gridToTable(grid), { kind: 'upload', fileName: file.name });
}

export function toParticipantData(table: { headers: string[]; rows: Record<string, string>[] }, source: ParticipantData['source']): ParticipantData {
  if (table.headers.length === 0) throw new Error('The sheet is empty.');
  if (table.rows.length === 0) throw new Error('The sheet has column headings but no participant rows.');
  return { headers: table.headers, rows: table.rows, source, importedAt: Date.now() };
}

// ------------------------------------------------------------------ Excel template

export interface TemplateColumn {
  name: string;
  description: string;
  samples: [string, string];
}

const SAMPLES: Record<string, [string, string]> = {
  name: ['Participant One', 'Participant Two'],
  full_name: ['Participant One', 'Participant Two'],
  recipient_name: ['Participant One', 'Participant Two'],
  cid: ['10701000001', '10701000002'],
  workshop: ['UX Workshop', 'Web Development'],
  programme: ['Digital Skills Programme', 'Digital Skills Programme'],
  program: ['Digital Skills Programme', 'Digital Skills Programme'],
  course: ['Web Development', 'Data Analysis'],
  college: ['Gyalpozhing College of IT', 'Gyalpozhing College of IT'],
  date: ['12 November 2026', '13 November 2026'],
  email: ['participant.one@example.org', 'participant.two@example.org'],
};

function sampleFor(column: string, i: 0 | 1): string {
  const k = column.toLowerCase();
  if (SAMPLES[k]) return SAMPLES[k][i];
  if (/date/.test(k)) return SAMPLES.date[i];
  if (/name/.test(k)) return SAMPLES.name[i];
  return i === 0 ? 'Example value' : 'Another value';
}

/**
 * Columns needed for the chosen template + wording: one per placeholder
 * (named exactly like the placeholder), always `cid`, `photo` when the
 * template has photos, and `signature` when signatures come per participant.
 */
export function templateColumns(placeholders: PlaceholderInfo[], layout: TemplateLayout, content: ContentConfig): TemplateColumn[] {
  const cols: TemplateColumn[] = [];
  const add = (c: TemplateColumn) => {
    if (!cols.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) cols.push(c);
  };
  for (const p of placeholders) {
    if (p.system || SYSTEM_PLACEHOLDERS[p.key]) continue;
    add({ name: p.name, description: `Fills {{${p.name}}} in: ${p.uses.map((u) => u.label).join(', ')}.`, samples: [sampleFor(p.name, 0), sampleFor(p.name, 1)] });
  }
  add({
    name: 'cid',
    description: 'Unique participant ID (Citizenship ID). Always included: photos can be named after it (e.g. 10701000001.jpg). It is only printed if your wording uses {{cid}}. If participants have no CID, use another unique ID here.',
    samples: [SAMPLES.cid[0], SAMPLES.cid[1]],
  });
  const photos = layout.boxes.filter((b) => b.type === 'photo');
  photos.forEach((b, i) => {
    add({
      name: photos.length === 1 ? 'photo' : `photo_${i + 1}`,
      description: `Photo file name for "${b.label}", e.g. 10701000001.jpg. Optional when photos are named after the CID.`,
      samples: [`${SAMPLES.cid[0]}.jpg`, `${SAMPLES.cid[1]}.jpg`],
    });
  });
  for (const b of layout.boxes) {
    if (b.type === 'signature' && content.signatures[b.key]?.mode === 'column') {
      add({ name: 'signature', description: `Signature image file name for "${b.label}" (one per participant).`, samples: ['signature_one.png', 'signature_two.png'] });
    }
  }
  return cols;
}

export function downloadExcelTemplate(columns: TemplateColumn[], fileBase: string) {
  const wb = XLSX.utils.book_new();
  const data = [columns.map((c) => c.name), columns.map((c) => c.samples[0]), columns.map((c) => c.samples[1])];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(14, c.name.length + 4) }));
  // Keep IDs as text so leading zeros survive.
  const cidIdx = columns.findIndex((c) => c.name === 'cid');
  if (cidIdx >= 0) {
    for (let r = 1; r <= 2; r++) {
      const ref = XLSX.utils.encode_cell({ r, c: cidIdx });
      if (ws[ref]) ws[ref].t = 's';
    }
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Participants');
  const help = [
    ['Column', 'What to enter'],
    ...columns.map((c) => [c.name, c.description]),
    [],
    ['How to fill this in', ''],
    ['1', 'Keep the first row (the column names) exactly as it is.'],
    ['2', 'Replace the two example rows with your participants — one participant per row. There is no limit on the number of rows.'],
    ['3', 'Photos are matched by the file name in the "photo" column, or by the participant\'s CID (e.g. 10701000001.jpg) — never by upload order.'],
    ['4', 'Type CID numbers as text (or format the column as Text) so leading zeros are kept.'],
  ];
  const hs = XLSX.utils.aoa_to_sheet(help);
  hs['!cols'] = [{ wch: 22 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, hs, 'Instructions');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${fileBase.replace(/[^\w\- ]+/g, '').trim() || 'participants'} - participant template.xlsx`
  );
}
