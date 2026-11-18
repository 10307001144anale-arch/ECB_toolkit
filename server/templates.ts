// Template persistence helpers shared by the admin and client routes.

import { db } from './db.ts';
import { PUBLISHED } from './files.ts';
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
  reference_image_file_id?: string | null;
  recommended_by?: string | null;
  recommended_at?: number | null;
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

/**
 * Upload A (the complete reference certificate) is the template's cover image
 * in every portal. Called whenever the draft changes; a custom image the Super
 * Admin uploaded (kind 'refimage') is never replaced.
 */
export async function syncCoverImage(templateId: string): Promise<void> {
  const row = await getTemplateRow(templateId);
  if (!row) return;
  const refPreview = parseLayout(row.draft_json).referencePages?.[0]?.previewFileId;
  if (!refPreview || row.reference_image_file_id === refPreview) return;
  if (!(await db.one('SELECT 1 FROM files WHERE id = ?', [refPreview]))) return;
  if (row.reference_image_file_id) {
    const current = await db.one<{ kind: string }>('SELECT kind FROM files WHERE id = ?', [row.reference_image_file_id]);
    if (current && current.kind !== 'preview') return;
  }
  await db.run('UPDATE templates SET reference_image_file_id = ? WHERE id = ?', [refPreview, templateId]);
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
  const creator = row.created_by ? await db.one<{ name: string; role: any }>('SELECT name, role FROM users WHERE id = ?', [row.created_by]) : undefined;
  const recommender = row.recommended_by ? await db.one<{ name: string }>('SELECT name FROM users WHERE id = ?', [row.recommended_by]) : undefined;
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
    referenceImageFileId: row.reference_image_file_id ?? null,
    createdBy: row.created_by,
    createdByName: creator?.name ?? null,
    createdByRole: creator?.role ?? null,
    recommendedAt: row.recommended_at ?? null,
    recommendedByName: row.recommended_at ? recommender?.name ?? 'An Admin' : null,
  };
}

/** What is linked to a template (shown before deleting it). */
export async function templateUsage(id: string) {
  const r = await db.one(
    `SELECT (SELECT COUNT(DISTINCT client_id) FROM batches WHERE template_id = ?) AS users,
            (SELECT COUNT(*) FROM batches WHERE template_id = ?) AS batches,
            (SELECT COALESCE(SUM(success),0) FROM batches WHERE template_id = ?) AS certificates`,
    [id, id, id]
  );
  return { users: Number(r?.users) || 0, batches: Number(r?.batches) || 0, certificates: Number(r?.certificates) || 0 };
}

export async function toDetail(row: TemplateRow): Promise<TemplateDetail> {
  return { ...(await toSummary(row)), draft: parseLayout(row.draft_json) };
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

/** Published templates (every User and Admin may generate with any published template). */
export async function clientTemplates(_user: PublicUser, templateId?: string): Promise<ClientTemplate[]> {
  const params: unknown[] = [];
  const cond = PUBLISHED;
  if (templateId) params.push(templateId);
  const rows = await db.all(
    `SELECT t.id, t.title, t.description, t.reference_image_file_id, t.recommended_at, ru.name AS recommended_by_name,
            v.id AS version_id, v.version_number, v.layout_json, v.published_at
       FROM templates t JOIN template_versions v ON v.id = t.current_version_id
       LEFT JOIN users ru ON ru.id = t.recommended_by
      WHERE t.status = 'published' AND ${cond}
        ${templateId ? 'AND t.id = ?' : ''}
      ORDER BY (t.recommended_at IS NULL), lower(t.title)`,
    params
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
      referenceImageFileId: r.reference_image_file_id ?? null,
      publishedAt: r.published_at,
      recommendedAt: r.recommended_at ?? null,
      recommendedByName: r.recommended_at ? r.recommended_by_name ?? 'An Admin' : null,
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
