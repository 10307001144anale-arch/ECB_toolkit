// One-time migration: old SQLite database + files on disk  →  Supabase
// PostgreSQL + Supabase Storage.
//
//   npm run migrate:supabase                 # from ./data (or DATA_DIR)
//   npm run migrate:supabase -- --from-neon  # from the Neon cloud copy (DATABASE_URL)
//   npm run migrate:supabase -- --verify     # only compare source and target
//
// Needs SUPABASE_DB_URL, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// Safe to run again: existing rows are skipped (ON CONFLICT DO NOTHING).
// The old database and files are never modified or deleted — a backup copy
// is written to backups/<date>/ first.

import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

dotenv.config();
const args = new Set(process.argv.slice(2));
const verifyOnly = args.has('--verify');

for (const v of ['SUPABASE_DB_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[v]) {
    console.error(`${v} is not set. Add it to .env (see README → Supabase setup).`);
    process.exit(1);
  }
}

// ------------------------------------------------------------------ source

let dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
if (args.has('--from-neon')) {
  if (!process.env.DATABASE_URL) {
    console.error('--from-neon needs DATABASE_URL (the Neon connection string).');
    process.exit(1);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certigen-neon-'));
  process.env.DATA_DIR = dataDir;
  const { restoreFromCloud } = await import('../cloudStore.ts');
  await restoreFromCloud();
}
const dbPath = path.join(dataDir, 'certigen.sqlite');
if (!fs.existsSync(dbPath)) {
  console.error(`No SQLite database found at ${dbPath}.`);
  process.exit(1);
}
const filesDir = path.join(dataDir, 'files');
const src = new DatabaseSync(dbPath, { readOnly: true } as any);
const has = (t: string) => !!src.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
const rows = (t: string): any[] => (has(t) ? (src.prepare(`SELECT * FROM ${t}`).all() as any[]) : []);

// ------------------------------------------------------------------ target

const { db, initDb, closeDb, tx } = await import('../db.ts');
const storage = await import('../storage.ts');
const { objectPath, layoutFileIds } = await import('../files.ts');
await initDb();
await storage.ensureBucket();

const GUEST_ID = 'usr_public_guest';
const report: Record<string, { source: number; target: number }> = {};

function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(process.cwd(), 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });
  src.exec(`VACUUM INTO '${path.join(dir, 'certigen.sqlite').replace(/'/g, "''")}'`);
  if (fs.existsSync(filesDir)) fs.cpSync(filesDir, path.join(dir, 'files'), { recursive: true });
  console.log(`Backup of the old data written to ${dir}`);
}

async function copy(table: string, cols: string[], list: any[], map: (r: any) => unknown[] = (r) => cols.map((c) => r[c] ?? null)) {
  let n = 0;
  await tx(async (q) => {
    for (let i = 0; i < list.length; i += 300) {
      const chunk = list.slice(i, i + 300);
      if (!chunk.length) continue;
      const values: unknown[] = [];
      const ph = chunk.map((r) => {
        values.push(...map(r));
        return `(${cols.map(() => '?').join(',')})`;
      });
      n += await q.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${ph.join(',')} ON CONFLICT DO NOTHING`, values);
    }
  });
  return n;
}

async function count(table: string) {
  return Number((await db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n) || 0;
}

if (!verifyOnly) {
  backup();
  console.log('Migrating records…');

  const users = rows('users');
  await copy('users', ['id', 'email', 'name', 'password_hash', 'role', 'organisation', 'active', 'created_at', 'updated_at', 'last_login_at'], users, (u) => [
    u.id,
    String(u.email).toLowerCase(),
    u.name,
    u.id === GUEST_ID ? 'disabled' : u.password_hash,
    u.role,
    u.organisation,
    u.id === GUEST_ID ? 0 : u.active, // the old public (no sign-in) account is kept only for its history
    u.created_at,
    u.created_at,
    u.last_login_at,
  ]);

  const templates = rows('templates');
  await copy(
    'templates',
    ['id', 'title', 'description', 'status', 'visibility', 'draft_json', 'draft_updated_at', 'current_version_id', 'created_by', 'updated_by', 'created_at', 'updated_at'],
    templates,
    // Previously every template was public; keep them visible to all clients until the admin assigns them.
    (t) => [t.id, t.title, t.description, t.status, 'all', t.draft_json, t.draft_updated_at, null, t.created_by, t.created_by, t.created_at, t.updated_at]
  );
  await copy('template_versions', ['id', 'template_id', 'version_number', 'layout_json', 'notes', 'published_at', 'published_by'], rows('template_versions'));
  for (const t of templates) {
    if (t.current_version_id) await db.run('UPDATE templates SET current_version_id = ? WHERE id = ? AND current_version_id IS NULL', [t.current_version_id, t.id]);
  }

  // Which template each file belongs to (from drafts and published versions).
  const owner = new Map<string, { templateId: string; reference: boolean }>();
  const layouts: { templateId: string; json: string }[] = [
    ...templates.map((t) => ({ templateId: t.id, json: t.draft_json })),
    ...rows('template_versions').map((v) => ({ templateId: v.template_id, json: v.layout_json })),
  ];
  for (const l of layouts) {
    try {
      const layout = JSON.parse(l.json);
      for (const id of layoutFileIds({ referencePages: [], ...layout })) if (!owner.has(id)) owner.set(id, { templateId: l.templateId, reference: false });
      for (const p of layout.referencePages || []) if (p.previewFileId) owner.set(p.previewFileId, { templateId: l.templateId, reference: true });
    } catch {
      /* skip unreadable layout */
    }
  }

  console.log('Uploading files to Supabase Storage…');
  const files = rows('files');
  let uploaded = 0;
  let missing = 0;
  for (const f of files) {
    const exists = await db.one('SELECT 1 FROM files WHERE id = ?', [f.id]);
    if (exists) continue;
    const local = path.join(filesDir, f.id);
    if (!fs.existsSync(local)) {
      console.warn(`  ! file ${f.id} (${f.original_name || f.kind}) is missing on disk — skipped`);
      missing++;
      continue;
    }
    const buf = fs.readFileSync(local);
    const o = owner.get(f.id);
    const p = objectPath(o?.templateId ?? null, f.kind, o?.reference ? 'reference' : null, f.id, f.mime);
    await storage.putObject(p, buf, f.mime);
    await db.run(
      'INSERT INTO files (id, kind, mime, size, sha256, storage_path, template_id, original_name, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      [f.id, f.kind, f.mime, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), p, o?.templateId ?? null, f.original_name, f.owner_id, f.created_at]
    );
    uploaded++;
    if (uploaded % 20 === 0) console.log(`  ${uploaded} files…`);
  }
  console.log(`  ${uploaded} uploaded${missing ? `, ${missing} missing on disk` : ''}.`);

  await copy('template_access', ['template_id', 'client_id', 'granted_at'], rows('template_access'), (a) => [a.template_id, a.client_id, 0]);
  await copy('presets', ['id', 'client_id', 'template_id', 'name', 'content_json', 'created_at', 'updated_at'], rows('presets'));
  await copy(
    'batches',
    ['id', 'client_id', 'template_id', 'template_version_id', 'name', 'content_json', 'mapping_json', 'total', 'success', 'failed', 'status', 'created_at', 'completed_at'],
    rows('batches')
  );
  const certs = rows('certificates');
  for (let i = 0; i < certs.length; i += 5000) {
    await copy('certificates', ['id', 'batch_id', 'row_index', 'recipient_name', 'status', 'issued_at'], certs.slice(i, i + 5000));
  }
  // Public-visitor (per-browser) connections are not carried over; signed-in users keep theirs.
  await copy(
    'oauth_connections',
    ['owner', 'provider', 'account_name', 'access_token_enc', 'refresh_token_enc', 'expires_at', 'updated_at'],
    rows('oauth_connections').filter((c) => String(c.owner).startsWith('usr:'))
  );
  await copy('activity', ['id', 'user_id', 'action', 'detail', 'created_at'], rows('activity'));
}

// ------------------------------------------------------------------ verification

console.log('\nVerifying…');
let problems = 0;
for (const t of ['users', 'templates', 'template_versions', 'template_access', 'presets', 'batches', 'certificates', 'activity', 'files']) {
  const source = rows(t).length;
  const target = await count(t);
  report[t] = { source, target };
  const ok = target >= source;
  if (!ok) problems++;
  console.log(`  ${ok ? '✓' : '✗'} ${t.padEnd(18)} source ${String(source).padStart(6)}  →  Supabase ${String(target).padStart(6)}`);
}
const targetFiles = await db.all<{ id: string; storage_path: string; sha256: string }>('SELECT id, storage_path, sha256 FROM files');
let checked = 0;
for (const f of targetFiles) {
  try {
    const buf = await storage.getObject(f.storage_path);
    if (crypto.createHash('sha256').update(buf).digest('hex') !== f.sha256) throw new Error('checksum mismatch');
    checked++;
  } catch (e: any) {
    problems++;
    console.log(`  ✗ file ${f.id} (${f.storage_path}): ${e.message}`);
  }
}
console.log(`  ✓ ${checked} of ${targetFiles.length} files downloaded back from Storage with matching checksums`);
const reportPath = path.join(process.cwd(), 'backups', `migration-report-${Date.now()}.json`);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), source: dbPath, tables: report, filesVerified: checked, problems }, null, 2));
console.log(`\n${problems ? `${problems} problem(s) found` : 'Migration verified'} — report: ${reportPath}`);
console.log('The old SQLite database and files were not changed.');
await closeDb();
process.exit(problems ? 1 : 0);
