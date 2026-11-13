// Keeps the app's data in an external Postgres database (Neon, free tier) so
// templates, uploaded artwork and certificate records survive Render
// restarts, redeploys and sleep — without a paid disk.
//
// How it works: the app keeps using its fast local SQLite file. When the
// server starts it restores the latest copy from Postgres; while it runs it
// saves a fresh copy a few seconds after every change, and once more when
// Render stops the server. Uploaded files (artwork, previews, fonts,
// signatures) are saved once each.
//
// Talks to Neon over HTTPS ("SQL over HTTP"), so no database driver is needed.
// Enabled only when DATABASE_URL is set.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

const CHUNK = 3 * 1024 * 1024; // raw bytes per row (≈4 MB as base64)
const SYNC_EVERY_MS = 5000;

export function cloudConfigured() {
  return !!process.env.DATABASE_URL?.trim();
}

function dataDir() {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
}

// ------------------------------------------------------------------ SQL over HTTP

function endpoint(conn: string) {
  const u = new URL(conn.replace(/^postgres(ql)?:/, 'https:'));
  return process.env.DATABASE_HTTP_URL || `https://${u.hostname}/sql`;
}

async function sql(query: string, params: unknown[] = []): Promise<string[][]> {
  const conn = process.env.DATABASE_URL!.trim();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(endpoint(conn), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Neon-Connection-String': conn,
          'Neon-Raw-Text-Output': 'true',
          'Neon-Array-Mode': 'true',
        },
        body: JSON.stringify({ query, params }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text.slice(0, 300);
        try {
          msg = JSON.parse(text).message || msg;
        } catch {
          /* not JSON */
        }
        const err = new Error(`Cloud database error (${res.status}): ${msg}`);
        if (res.status >= 400 && res.status < 500) throw Object.assign(err, { fatal: true });
        throw err;
      }
      const json = JSON.parse(text);
      return (json.rows || []).map((r: unknown[]) => r.map((v) => (v === null || v === undefined ? '' : String(v))));
    } catch (e: any) {
      lastErr = e;
      if (e?.fatal) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); // the free database may be waking up
    }
  }
  throw lastErr;
}

async function ensureSchema() {
  await sql('CREATE TABLE IF NOT EXISTS certigen_store (name TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (name, part))');
  await sql('CREATE TABLE IF NOT EXISTS certigen_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
}

async function putBlob(name: string, buf: Buffer) {
  await sql('DELETE FROM certigen_store WHERE name = $1', [name]);
  const parts = Math.max(1, Math.ceil(buf.length / CHUNK));
  for (let i = 0; i < parts; i++) {
    await sql('INSERT INTO certigen_store (name, part, data) VALUES ($1, $2, $3)', [name, i, buf.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64')]);
  }
  return parts;
}

async function getBlob(name: string, parts: number): Promise<Buffer> {
  const out: Buffer[] = [];
  for (let i = 0; i < parts; i++) {
    const rows = await sql('SELECT data FROM certigen_store WHERE name = $1 AND part = $2', [name, i]);
    if (!rows[0]) throw new Error(`Cloud copy is incomplete (${name} part ${i} missing).`);
    out.push(Buffer.from(rows[0][0], 'base64'));
  }
  return Buffer.concat(out);
}

async function setMeta(key: string, value: string) {
  await sql('INSERT INTO certigen_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value]);
}

interface DbPointer {
  gen: string;
  parts: number;
  sha: string;
  savedAt: number;
}

async function readPointer(): Promise<DbPointer | null> {
  const rows = await sql("SELECT value FROM certigen_meta WHERE key = 'db'");
  if (!rows[0]) return null;
  const [gen, parts, sha, savedAt] = rows[0][0].split('|');
  return { gen, parts: Number(parts), sha, savedAt: Number(savedAt) };
}

async function remoteFiles(): Promise<Map<string, number>> {
  const rows = await sql("SELECT key, value FROM certigen_meta WHERE key LIKE 'file:%'");
  return new Map(rows.map(([k, v]) => [k.slice(5), Number(v)]));
}

// ------------------------------------------------------------------ restore at startup

let uploadedFiles = new Set<string>();

/**
 * Called before the local database is opened. Replaces the local data with
 * the latest cloud copy (if there is one) and downloads missing files.
 */
export async function restoreFromCloud(): Promise<void> {
  if (!cloudConfigured()) return;
  const dir = dataDir();
  const filesDir = path.join(dir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });
  console.log('[cloud] Connecting to the cloud database…');
  await ensureSchema();
  const ptr = await readPointer();
  const files = await remoteFiles();
  if (!ptr) {
    console.log('[cloud] The cloud database is empty — this server\'s data will be saved to it.');
    return;
  }
  const buf = await getBlob(`db:${ptr.gen}`, ptr.parts);
  if (crypto.createHash('sha256').update(buf).digest('hex') !== ptr.sha) throw new Error('[cloud] The cloud copy of the database is damaged (checksum mismatch).');
  const dbPath = path.join(dir, 'certigen.sqlite');
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });
  fs.writeFileSync(dbPath, buf);
  let downloaded = 0;
  for (const [id, parts] of files) {
    const target = path.join(filesDir, id);
    if (!fs.existsSync(target)) {
      fs.writeFileSync(target, await getBlob(`file:${id}`, parts));
      downloaded++;
    }
  }
  uploadedFiles = new Set(files.keys());
  console.log(`[cloud] Restored data saved ${new Date(ptr.savedAt).toISOString()} (${files.size} files, ${downloaded} downloaded).`);
}

// ------------------------------------------------------------------ continuous saving

let lastChanges = -1;
let running: Promise<void> | null = null;
let lastError: string | null = null;
let lastSavedAt: number | null = null;

export function cloudStatus() {
  return { enabled: cloudConfigured(), lastSavedAt, lastError };
}

async function saveNow(db: DatabaseSync, force = false) {
  const changes = Number((db.prepare('SELECT total_changes() AS n').get() as any).n);
  if (!force && changes === lastChanges) return;
  const dir = dataDir();
  const filesDir = path.join(dir, 'files');
  // 1. New files first, so the database never points at a file the cloud doesn't have.
  for (const id of fs.existsSync(filesDir) ? fs.readdirSync(filesDir) : []) {
    if (uploadedFiles.has(id) || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) continue;
    const parts = await putBlob(`file:${id}`, fs.readFileSync(path.join(filesDir, id)));
    await setMeta(`file:${id}`, String(parts));
    uploadedFiles.add(id);
  }
  // 2. A consistent copy of the database, written under a new generation and then switched to.
  const snap = path.join(dir, `.snapshot-${process.pid}.sqlite`);
  fs.rmSync(snap, { force: true });
  db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
  const buf = fs.readFileSync(snap);
  fs.rmSync(snap, { force: true });
  const old = await readPointer();
  const gen = `${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  const parts = await putBlob(`db:${gen}`, buf);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  await setMeta('db', `${gen}|${parts}|${sha}|${Date.now()}`);
  if (old) await sql('DELETE FROM certigen_store WHERE name = $1', [`db:${old.gen}`]);
  lastChanges = changes;
  lastSavedAt = Date.now();
  lastError = null;
}

function save(db: DatabaseSync, force = false) {
  if (!running) {
    running = saveNow(db, force)
      .catch((e) => {
        lastError = e?.message || String(e);
        console.error('[cloud] Save failed:', lastError);
      })
      .finally(() => {
        running = null;
      });
  }
  return running;
}

/** Saves changes every few seconds and once more when the server is stopped. */
export function startCloudSync(db: DatabaseSync) {
  if (!cloudConfigured()) return;
  const timer = setInterval(() => save(db), SYNC_EVERY_MS);
  timer.unref();
  void save(db, true);
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[cloud] ${signal} received — saving the latest data before shutting down…`);
    clearInterval(timer);
    try {
      if (running) await running;
      await save(db, true);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

/** Waits for any pending save (used by tests and the upload script). */
export async function flushCloud(db: DatabaseSync) {
  if (running) await running;
  await save(db, true);
  if (lastError) throw new Error(lastError);
}

/** One-time upload of this computer's data to the cloud database (replaces the cloud copy). */
export async function uploadLocalToCloud(db: DatabaseSync) {
  await ensureSchema();
  uploadedFiles = new Set((await remoteFiles()).keys());
  await flushCloud(db);
  return { files: uploadedFiles.size, savedAt: lastSavedAt };
}
