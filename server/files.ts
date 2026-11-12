import fs from 'node:fs';
import path from 'node:path';
import { db, FILES_DIR, newId, now } from './db.ts';
import { HttpError } from './http.ts';
import type { PublicUser, TemplateLayout } from '../shared/types.ts';

export type FileKind = 'artwork' | 'preview' | 'signature' | 'font';

const MAX_SIZE: Record<FileKind, number> = {
  artwork: 25 * 1024 * 1024,
  preview: 15 * 1024 * 1024,
  signature: 3 * 1024 * 1024,
  font: 5 * 1024 * 1024,
};

const ALLOWED: Record<FileKind, string[]> = {
  artwork: ['application/pdf', 'image/png', 'image/jpeg'],
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

function filePath(id: string): string {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new HttpError(400, 'Invalid file id.');
  return path.join(FILES_DIR, id);
}

export function saveFile(buf: Buffer, kind: FileKind, ownerId: string | null, originalName: string | null) {
  if (!buf || buf.length === 0) throw new HttpError(400, 'The file is empty.');
  if (buf.length > MAX_SIZE[kind]) {
    throw new HttpError(413, `The file is too large (maximum ${Math.round(MAX_SIZE[kind] / 1024 / 1024)} MB).`);
  }
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED[kind].includes(mime)) {
    const allowed = ALLOWED[kind].map((m) => m.split('/')[1].toUpperCase()).join(', ');
    throw new HttpError(415, `Unsupported file type. Allowed: ${allowed}.`);
  }
  const id = newId('f_');
  fs.writeFileSync(filePath(id), buf);
  const safeName = originalName ? originalName.replace(/[^\w.\- ]+/g, '_').slice(0, 120) : null;
  db.prepare('INSERT INTO files (id, kind, mime, size, original_name, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    kind,
    mime,
    buf.length,
    safeName,
    ownerId,
    now()
  );
  return { id, mime, size: buf.length };
}

export function getFileMeta(id: string) {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id) as
    | { id: string; kind: FileKind; mime: string; size: number; original_name: string | null }
    | undefined;
}

export function readFileStream(id: string) {
  return fs.createReadStream(filePath(id));
}

export function layoutFileIds(layout: TemplateLayout): Set<string> {
  const ids = new Set<string>();
  if (layout.artworkFileId) ids.add(layout.artworkFileId);
  for (const p of layout.pages) if (p.previewFileId) ids.add(p.previewFileId);
  for (const f of layout.fonts) ids.add(f.fileId);
  for (const b of layout.boxes) if (b.type === 'signature' && b.fixedSignatureFileId) ids.add(b.fixedSignatureFileId);
  return ids;
}

/**
 * Admins can read every file. Clients can read a file only if it belongs to a
 * template version they are allowed to use (current published version, or a
 * version used by one of their own batches).
 */
export function canReadFile(user: PublicUser, fileId: string): boolean {
  if (user.role === 'admin') return true;
  const rows = db
    .prepare(
      `SELECT v.layout_json FROM templates t
         JOIN template_versions v ON v.id = t.current_version_id
        WHERE t.status = 'published'
       UNION
       SELECT v.layout_json FROM batches b JOIN template_versions v ON v.id = b.template_version_id WHERE b.client_id = ?`
    )
    .all(user.id) as { layout_json: string }[];
  for (const r of rows) {
    if (!r.layout_json.includes(fileId)) continue;
    if (layoutFileIds(JSON.parse(r.layout_json)).has(fileId)) return true;
  }
  return false;
}
