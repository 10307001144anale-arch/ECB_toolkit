// Template persistence helpers shared by the admin and client routes.

import { db } from './db.ts';
import { emptyLayout, sanitizeLayout } from '../shared/layout.ts';
import { hasFormatting, richToPlain, sanitizeRich, type RichDoc } from '../shared/rich.ts';
import { sanitizeDateChoice } from '../shared/dates.ts';
import type {
  ClientTemplate,
  ContentConfig,
  DateChoice,
  MappingConfig,
  PublicUser,
  TemplateDetail,
  TemplateLayout,
  TemplateSummary,
  TemplateVersion,
} from '../shared/types.ts';

export interface TemplateRow {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'archived';
  visibility: 'all' | 'assigned';
  draft_json: string;
  draft_updated_at: number;
  current_version_id: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
  updated_by?: string | null;
}

export interface VersionRow {
  id: string;
  template_id: string;
  version_number: number;
  layout_json: string;
  notes: string;
  published_at: number;
  published_by: string | null;
}

export async function getTemplateRow(id: string): Promise<TemplateRow | undefined> {
  return db.one<TemplateRow>('SELECT * FROM templates WHERE id = ?', [id]);
}

export async function getVersionRow(id: string): Promise<VersionRow | undefined> {
  return db.one<VersionRow>('SELECT * FROM template_versions WHERE id = ?', [id]);
}

export function parseLayout(json: string | null | undefined): TemplateLayout {
  if (!json) return emptyLayout();
  try {
    return sanitizeLayout(JSON.parse(json));
  } catch {
    return emptyLayout();
  }
}

/** Canonical JSON so draft and published layouts can be compared for changes. */
export function layoutJson(layout: TemplateLayout): string {
  return JSON.stringify(sanitizeLayout(layout));
}

export async function toSummary(row: TemplateRow): Promise<TemplateSummary> {
  const draft = parseLayout(row.draft_json);
  const version = row.current_version_id ? await getVersionRow(row.current_version_id) : undefined;
  const usage = (await db.one<{ n: number }>('SELECT COALESCE(SUM(success),0) AS n FROM batches WHERE template_id = ?', [row.id]))!;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    visibility: row.visibility,
    currentVersionId: row.current_version_id,
    currentVersionNumber: version?.version_number ?? null,
    hasUnpublishedChanges: !version || version.layout_json !== row.draft_json,
    thumbnailFileId: draft.pages[0]?.previewFileId ?? null,
    boxCount: draft.boxes.length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    usageCount: Number(usage.n) || 0,
  };
}

export async function toDetail(row: TemplateRow): Promise<TemplateDetail> {
  const access = await db.all<{ client_id: string }>('SELECT client_id FROM template_access WHERE template_id = ?', [row.id]);
  return { ...(await toSummary(row)), draft: parseLayout(row.draft_json), assignedClientIds: access.map((a) => a.client_id) };
}

export function toVersion(v: VersionRow): TemplateVersion {
  return {
    id: v.id,
    templateId: v.template_id,
    versionNumber: v.version_number,
    layout: parseLayout(v.layout_json),
    notes: v.notes,
    publishedAt: v.published_at,
    publishedBy: v.published_by,
  };
}

/** Removes the admin-only reference certificate before a layout is sent to a client. */
export function clientLayout(layout: TemplateLayout): TemplateLayout {
  return { ...layout, referenceFileId: null, referenceMime: null, referencePages: [] };
}

/** Published templates this client may use: open to all clients, or assigned to them. */
export async function clientTemplates(user: PublicUser, templateId?: string): Promise<ClientTemplate[]> {
  const rows = await db.all(
    `SELECT t.id, t.title, t.description, v.id AS version_id, v.version_number, v.layout_json, v.published_at
       FROM templates t JOIN template_versions v ON v.id = t.current_version_id
      WHERE t.status = 'published'
        AND (t.visibility = 'all' OR EXISTS (SELECT 1 FROM template_access a WHERE a.template_id = t.id AND a.client_id = ?))
        ${templateId ? 'AND t.id = ?' : ''}
      ORDER BY lower(t.title)`,
    [user.id, ...(templateId ? [templateId] : [])]
  );
  return rows.map((r) => {
    const layout = clientLayout(parseLayout(r.layout_json));
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      versionId: r.version_id,
      versionNumber: r.version_number,
      layout,
      thumbnailFileId: layout.pages[0]?.previewFileId ?? null,
      publishedAt: r.published_at,
    };
  });
}

// ---------------------------------------------------------------- client content

function cleanText(v: unknown, max = 5000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}
function cleanColumn(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, 200) : '';
}

export function sanitizeContent(input: any): ContentConfig {
  const src = input && typeof input === 'object' ? input : {};
  const texts: Record<string, string> = {};
  const qr: ContentConfig['qr'] = {};
  const signatures: ContentConfig['signatures'] = {};
  const photos: ContentConfig['photos'] = {};
  const keyOk = (k: string) => /^[a-z][a-z0-9_]{0,47}$/.test(k);
  for (const [k, v] of Object.entries(src.texts || {}).slice(0, 200)) if (keyOk(k)) texts[k] = cleanText(v);
  for (const [k, v] of Object.entries(src.qr || {}).slice(0, 50) as [string, any][]) {
    if (!keyOk(k)) continue;
    qr[k] = { mode: v?.mode === 'verification' ? 'verification' : 'custom', value: cleanText(v?.value, 2000) };
  }
  for (const [k, v] of Object.entries(src.signatures || {}).slice(0, 50) as [string, any][]) {
    if (!keyOk(k)) continue;
    const mode = ['fixed', 'single', 'column', 'none'].includes(v?.mode) ? v.mode : 'none';
    const n = (x: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(x)) ? Math.min(hi, Math.max(lo, Number(x))) : d);
    signatures[k] = {
      mode,
      column: cleanColumn(v?.column),
      fileName: cleanColumn(v?.fileName),
      scale: n(v?.scale, 1, 0.3, 1),
      offsetX: n(v?.offsetX, 0, -1, 1),
      offsetY: n(v?.offsetY, 0, -1, 1),
      ...(typeof v?.signerName === 'string' ? { signerName: cleanText(v.signerName, 120) } : {}),
      ...(typeof v?.signerTitle === 'string' ? { signerTitle: cleanText(v.signerTitle, 160) } : {}),
    };
  }
  for (const [k, v] of Object.entries(src.photos || {}).slice(0, 50) as [string, any][]) {
    if (!keyOk(k)) continue;
    photos[k] = { column: cleanColumn(v?.column) };
  }
  // Formatting (structured runs only — never HTML). Kept only when it matches the plain wording.
  const rich: Record<string, RichDoc> = {};
  for (const [k, v] of Object.entries(src.rich || {}).slice(0, 200)) {
    if (!keyOk(k) || texts[k] === undefined) continue;
    const doc = sanitizeRich(v, 5000);
    if (doc && hasFormatting(doc) && richToPlain(doc) === texts[k]) rich[k] = doc;
  }
  const dates: Record<string, DateChoice> = {};
  for (const [k, v] of Object.entries(src.dates || {}).slice(0, 50)) {
    const c = keyOk(k) ? sanitizeDateChoice(v) : null;
    if (c) dates[k] = c;
  }
  const out: ContentConfig = { texts, qr, signatures, photos };
  if (Object.keys(rich).length) out.rich = rich;
  if (Object.keys(dates).length) out.dates = dates;
  return out;
}

export function sanitizeMapping(input: any): MappingConfig {
  const src = input && typeof input === 'object' ? input : {};
  const placeholders: MappingConfig['placeholders'] = {};
  for (const [k, v] of Object.entries(src.placeholders || {}).slice(0, 200) as [string, any][]) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(k)) continue;
    placeholders[k] = {
      column: typeof v?.column === 'string' ? v.column.slice(0, 200) : null,
      type: ['text', 'number', 'date'].includes(v?.type) ? v.type : 'text',
      dateFormat: typeof v?.dateFormat === 'string' ? v.dateFormat.slice(0, 40) : 'D MMMM YYYY',
    };
  }
  return {
    placeholders,
    recipientColumn: typeof src.recipientColumn === 'string' ? src.recipientColumn.slice(0, 200) : null,
    idColumn: typeof src.idColumn === 'string' ? src.idColumn.slice(0, 200) : null,
  };
}

/** Removes formatting the administrator does not allow in a box (checked again on the server). */
export function enforceFormatting(content: ContentConfig, layout: TemplateLayout): ContentConfig {
  if (!content.rich) return content;
  const rich: Record<string, RichDoc> = {};
  for (const b of layout.boxes) {
    if (b.type !== 'text' || !content.rich[b.key]) continue;
    const doc = sanitizeRich(content.rich[b.key], 5000, b.formatting);
    if (doc && hasFormatting(doc)) rich[b.key] = doc;
  }
  return { ...content, rich };
}
