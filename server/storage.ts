// Supabase Storage (private bucket) for template files: blank and reference
// artwork, page previews, fonts and admin-managed signatures.
//
// Only the server talks to Storage, with the service-role key
// (SUPABASE_SERVICE_ROLE_KEY) — it is never sent to the browser. The bucket
// is private; browsers get files through the app's own authorised
// /api/files route (or short-lived signed URLs).
//
// Layout inside the bucket:
//   templates/{template_id}/blank/…        blank design (PDF background)
//   templates/{template_id}/reference/…    complete reference certificate
//   templates/{template_id}/previews/…     page images of both
//   templates/{template_id}/fonts/…
//   templates/{template_id}/assets/…       admin signatures and other assets
//   templates/{template_id}/versions/{version_id}/layout.json
//   templates/_unassigned/…                uploads not yet saved in a template

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const BUCKET = process.env.SUPABASE_BUCKET || 'certificate-templates';
const CACHE_DIR = path.join(os.tmpdir(), 'certigen-file-cache');

function cfg() {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see README → Supabase setup).');
  return { url, key };
}

export function storageConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function encodePath(p: string) {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function call(method: string, route: string, body?: BodyInit | object, headers: Record<string, string> = {}) {
  const { url, key } = cfg();
  const isJson = body !== undefined && !(body instanceof Buffer) && !(body instanceof Uint8Array) && typeof body === 'object';
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${url}/storage/v1${route}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          ...(isJson ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: isJson ? JSON.stringify(body) : (body as BodyInit | undefined),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status >= 500) throw new Error(`Storage error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function fail(res: Response, what: string): Promise<never> {
  let msg = (await res.text()).slice(0, 300);
  try {
    msg = JSON.parse(msg).message || JSON.parse(msg).error || msg;
  } catch {
    /* plain text */
  }
  throw new Error(`Storage ${what} failed (${res.status}): ${msg}`);
}

/** Creates the private bucket if it does not exist yet. */
export async function ensureBucket() {
  const res = await call('GET', `/bucket/${encodeURIComponent(BUCKET)}`);
  if (res.ok) {
    const b = await res.json();
    if (b.public) console.warn(`[storage] WARNING: bucket "${BUCKET}" is public. Make it private in Supabase → Storage.`);
    return;
  }
  const created = await call('POST', '/bucket', { id: BUCKET, name: BUCKET, public: false, file_size_limit: 30 * 1024 * 1024 });
  if (!created.ok && created.status !== 409) await fail(created, 'bucket creation');
}

export async function putObject(objectPath: string, data: Buffer, mime: string) {
  const res = await call('POST', `/object/${encodeURIComponent(BUCKET)}/${encodePath(objectPath)}`, data, {
    'Content-Type': mime,
    'x-upsert': 'true',
    'cache-control': '31536000',
  });
  if (!res.ok) await fail(res, 'upload');
}

export async function getObject(objectPath: string): Promise<Buffer> {
  const res = await call('GET', `/object/${encodeURIComponent(BUCKET)}/${encodePath(objectPath)}`);
  if (!res.ok) await fail(res, 'download');
  return Buffer.from(await res.arrayBuffer());
}

export async function moveObject(from: string, to: string) {
  const res = await call('POST', '/object/move', { bucketId: BUCKET, sourceKey: from, destinationKey: to });
  if (!res.ok) await fail(res, 'move');
}

export async function deleteObjects(paths: string[]) {
  if (!paths.length) return;
  const res = await call('DELETE', `/object/${encodeURIComponent(BUCKET)}`, { prefixes: paths });
  if (!res.ok) await fail(res, 'delete');
}

/** Short-lived signed download URL (seconds). */
export async function signedUrl(objectPath: string, expiresIn = 300): Promise<string> {
  const { url } = cfg();
  const res = await call('POST', `/object/sign/${encodeURIComponent(BUCKET)}/${encodePath(objectPath)}`, { expiresIn });
  if (!res.ok) await fail(res, 'signing');
  const j = await res.json();
  const rel: string = j.signedURL || j.signedUrl;
  return rel.startsWith('http') ? rel : `${url}/storage/v1${rel}`;
}

// ------------------------------------------------------------------ local read cache
// Template files never change after upload (a replacement gets a new id), so a
// local copy can be reused until the server restarts.

export async function readCached(fileId: string, objectPath: string): Promise<Buffer> {
  const local = path.join(CACHE_DIR, fileId);
  try {
    return fs.readFileSync(local);
  } catch {
    /* not cached */
  }
  const buf = await getObject(objectPath);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(local, buf);
  } catch {
    /* cache is optional */
  }
  return buf;
}

export function cacheLocally(fileId: string, buf: Buffer) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, fileId), buf);
  } catch {
    /* optional */
  }
}
