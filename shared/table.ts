// One conversion from a 2-D grid of cells to participant rows, used for
// uploaded Excel/CSV files, Microsoft Excel and Google Sheets alike.

export interface ParticipantTable {
  headers: string[];
  rows: Record<string, string>[];
}

export function normaliseHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = String(h ?? '').replace(/\s+/g, ' ').trim() || `Column ${i + 1}`;
    const n = seen.get(name.toLowerCase()) || 0;
    seen.set(name.toLowerCase(), n + 1);
    if (n > 0) name = `${name} (${n + 1})`;
    return name;
  });
}

/** First non-empty row = headings; fully empty rows are dropped; every cell becomes trimmed text. */
export function gridToTable(grid: unknown[][]): ParticipantTable {
  const nonEmpty = grid.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = normaliseHeaders(nonEmpty[0]);
  const rows = nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()])));
  return { headers, rows };
}
