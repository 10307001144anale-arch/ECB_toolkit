import crypto from 'node:crypto';
import { db, newId, now } from './db.ts';
import { cacheLocally, moveObject, putObject, readCached } from './storage.ts';
import { HttpError } from './http.ts';
import type { PublicUser, TemplateLayout } from '../shared/types.ts';

export type FileKind = 'artwork' | 'reference' | 'preview' | 'signature' | 'font';

const MAX_SIZE: Record<FileKind, number> = {
  artwork: 25 * 1024 * 1024,
  reference: 25 * 1024 * 1024,
  preview: 15 * 1024 * 1024,
  signature: 3 * 1024 * 1024,
  font: 5 * 1024 * 1024,
};

const ALLOWED: Record<FileKind, string[]> = {
  artwork: ['application/pdf', 'image/png', 'image/jpeg'],
  reference: ['application/pdf', 'image/png', 'image/jpeg'],
  preview: ['image/png', 'image/jpeg'],
  signature: ['image/png', 'image/jpeg'],
  font: ['font/ttf', 'font/otf'],
};

/** Detects the real file type from its first bytes; the browser-supplied type is not trusted. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 8) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const sig = buf.readUInt32BE(0);
  if (sig === 0x00010000 || buf.subarray(0, 4).toString('latin1') === 'true') return 'font/ttf';
  if (buf.subarray(0, 4).toString('latin1') === 'OTTO') return 'font/otf';
  return null;
}

function checkId(id: string) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new HttpError(400, 'Invalid file id.');
}

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'font/ttf': 'ttf', 'font/otf': 'otf' };

/** Folder inside templates/{id}/ for each kind of file. */
function folderFor(kind: FileKind, role: string | null) {
  switch (kind) {
    case 'artwork':
      return 'blank';
    case 'reference':
      return 'reference';
    case 'preview':
      return role === 'reference' ? 'reference/previews' : 'blank/previews';
    case 'font':
      return 'fonts';
    default:
      return 'assets';
  }
}

export function objectPath(templateId: string | null, kind: FileKind, role: string | null, id: string, mime: string) {
  return `templates/${templateId || '_unassigned'}/${folderFor(kind, role)}/${id}.${EXT[mime] || 'bin'}`;
}

/**
 * Validates an upload by its real content, stores it in Supabase Storage and
 * records its metadata (path, size, checksum) in PostgreSQL.
 */
export async function saveFile(
  buf: Buffer,
  kind: FileKind,
  ownerId: string | null,
  originalName: string | null,
  opts: { templateId?: string | null; role?: string | null } = {}
) {
  if (!buf || buf.length === 0) throw new HttpError(400, 'The file is empty.');
  if (buf.length > MAX_SIZE[kind]) {
    throw new HttpError(413, `The file is too large (maximum ${Math.round(MAX_SIZE[kind] / 1024 / 1024)} MB).`);
  }
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED[kind].includes(mime)) {
    const allowed = ALLOWED[kind].map((m) => m.split('/')[1].toUpperCase()).join(', ');
    throw new HttpError(415, `Unsupported file type. Allowed: ${allowed}.`);
  }
  let templateId = opts.templateId || null;
  if (templateId && !(await db.one('SELECT 1 FROM templates WHERE id = ?', [templateId]))) templateId = null;
  const id = newId('f_');
  const storagePath = objectPath(templateId, kind, opts.role || null, id, mime);
  await putObject(storagePath, buf, mime);
  cacheLocally(id, buf);
  const safeName = originalName ? originalName.replace(/[^\w.\- ]+/g, '_').slice(0, 120) : null;
  await db.run(
    'INSERT INTO files (id, kind, mime, size, sha256, storage_path, template_id, original_name, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, kind, mime, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), storagePath, templateId, safeName, ownerId, now()]
  );
  return { id, mime, size: buf.length };
}

export interface FileMeta {
  id: string;
  kind: FileKind;
  mime: string;
  size: number;
  sha256: string;
  storage_path: string;
  template_id: string | null;
  original_name: string | null;
}

export async function getFileMeta(id: string) {
  checkId(id);
  return db.one<FileMeta>('SELECT * FROM files WHERE id = ?', [id]);
}

export async function readFile(meta: FileMeta): Promise<Buffer> {
  return readCached(meta.id, meta.storage_path);
}

/**
 * Files uploaded before a template existed (or copied from another template)
 * are moved into templates/{template_id}/… once the layout is saved.
 */
export async function attachLayoutFiles(templateId: string, layout: TemplateLayout) {
  const ids = [...layoutFileIds(layout)];
  if (!ids.length) return;
  const rows = await db.all<FileMeta>(`SELECT * FROM files WHERE id IN (${ids.map(() => '?').join(',')}) AND (template_id IS NULL OR template_id <> ?)`, [
    ...ids,
    templateId,
  ]);
  for (const f of rows) {
    if (f.template_id) {
      // Belongs to another template (e.g. duplicated): share the object, record the link only if unassigned.
      continue;
    }
    const role = layout.referencePages?.some((p) => p.previewFileId === f.id) ? 'reference' : null;
    const dest = objectPath(templateId, f.kind, role, f.id, f.mime);
    try {
      await moveObject(f.storage_path, dest);
      await db.run('UPDATE files SET template_id = ?, storage_path = ? WHERE id = ?', [templateId, dest, f.id]);
    } catch (e: any) {
      console.warn(`[storage] Could not move ${f.storage_path}: ${e.message}`);
    }
  }
}

export function layoutFileIds(layout: TemplateLayout): Set<string> {
  const ids = new Set<string>();
  if (layout.artworkFileId) ids.add(layout.artworkFileId);
  for (const p of layout.pages) if (p.previewFileId) ids.add(p.previewFileId);
  if (layout.referenceFileId) ids.add(layout.referenceFileId);
  for (const p of layout.referencePages || []) if (p.previewFileId) ids.add(p.previewFileId);
  for (const f of layout.fonts) ids.add(f.fileId);
  for (const b of layout.boxes) if (b.type === 'signature' && b.fixedSignatureFileId) ids.add(b.fixedSignatureFileId);
  return ids;
}

/**
 * Admins can read every file. Clients can read a file only if it belongs to a
 * template version they are allowed to use (current published version, or a
 * version used by one of their own batches).
 */
export async function canReadFile(user: PublicUser, fileId: string): Promise<boolean> {
  if (user.role === 'admin') return true;
  const rows = await db.all<{ layout_json: string }>(
    `SELECT v.layout_json FROM templates t
       JOIN template_versions v ON v.id = t.current_version_id
      WHERE t.status = 'published'
        AND (t.visibility = 'all' OR EXISTS (SELECT 1 FROM template_access a WHERE a.template_id = t.id AND a.client_id = ?))
     UNION
     SELECT v.layout_json FROM batches b JOIN template_versions v ON v.id = b.template_version_id WHERE b.client_id = ?`,
    [user.id, user.id]
  );
  for (const r of rows) {
    if (!r.layout_json.includes(fileId)) continue;
    const layout = JSON.parse(r.layout_json) as TemplateLayout;
    // Clients never need the reference certificate (it is only a guide for the administrator).
    if (layout.referenceFileId === fileId || (layout.referencePages || []).some((p) => p.previewFileId === fileId)) continue;
    if (layoutFileIds(layout).has(fileId)) return true;
  }
  return false;
}
