// Template persistence helpers shared by the admin and client routes.

import { db } from './db.ts';
import { emptyLayout, sanitizeLayout } from '../shared/layout.ts';
import type {
  ClientTemplate,
  ContentConfig,
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

export function getTemplateRow(id: string): TemplateRow | undefined {
  return db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined;
}

export function getVersionRow(id: string): VersionRow | undefined {
  return db.prepare('SELECT * FROM template_versions WHERE id = ?').get(id) as VersionRow | undefined;
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

export function toSummary(row: TemplateRow): TemplateSummary {
  const draft = parseLayout(row.draft_json);
  const version = row.current_version_id ? getVersionRow(row.current_version_id) : undefined;
  const usage = db.prepare('SELECT COALESCE(SUM(success),0) AS n FROM batches WHERE template_id = ?').get(row.id) as { n: number };
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

export function toDetail(row: TemplateRow): TemplateDetail {
  const access = db.prepare('SELECT client_id FROM template_access WHERE template_id = ?').all(row.id) as { client_id: string }[];
  return { ...toSummary(row), draft: parseLayout(row.draft_json), assignedClientIds: access.map((a) => a.client_id) };
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

/** Published templates. Every published template is public. */
export function clientTemplates(_user: PublicUser, templateId?: string): ClientTemplate[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.title, t.description, v.id AS version_id, v.version_number, v.layout_json, v.published_at
         FROM templates t JOIN template_versions v ON v.id = t.current_version_id
        WHERE t.status = 'published'
          ${templateId ? 'AND t.id = ?' : ''}
        ORDER BY t.title COLLATE NOCASE`
    )
    .all(...(templateId ? [templateId] : [])) as any[];
  return rows.map((r) => {
    const layout = parseLayout(r.layout_json);
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
    signatures[k] = { mode, column: cleanColumn(v?.column), fileName: cleanColumn(v?.fileName) };
  }
  for (const [k, v] of Object.entries(src.photos || {}).slice(0, 50) as [string, any][]) {
    if (!keyOk(k)) continue;
    photos[k] = { column: cleanColumn(v?.column) };
  }
  return { texts, qr, signatures, photos };
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
  };
}
