// Application database: PostgreSQL (Supabase).
//
// Connection: SUPABASE_DB_URL — the Supabase "Session pooler" connection
// string (works from Render's IPv4 network). Uses the `pg` driver in
// production; the automated tests use a small built-in client (pgmini.ts).
//
// SQL in this code base uses `?` placeholders; they are converted to $1, $2…
// Timestamps are stored as BIGINT milliseconds since 1970 (the API and the
// frontend use the same numbers). JSON documents are stored as TEXT.

import crypto from 'node:crypto';

export interface Queryable {
  all<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = any>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<number>;
}

interface RawClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  release(): void;
}
interface RawPool {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
  connect(): Promise<RawClient>;
  end(): Promise<void>;
}

let pool: RawPool | null = null;

export function dbUrl() {
  return (process.env.SUPABASE_DB_URL || '').trim();
}

/** Converts `?` placeholders (outside quotes) to $1, $2, … */
export function toPg(sql: string): string {
  let n = 0;
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === '?') out += `$${++n}`;
    else out += ch;
  }
  return out;
}

function wrap(q: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>): Queryable {
  return {
    async all(sql, params = []) {
      return (await q(toPg(sql), params)).rows;
    },
    async one(sql, params = []) {
      return (await q(toPg(sql), params)).rows[0];
    },
    async run(sql, params = []) {
      return (await q(toPg(sql), params)).rowCount ?? 0;
    },
  };
}

function getPool(): RawPool {
  if (!pool) throw new Error('Database not initialised — call initDb() first.');
  return pool;
}

/** Shared query helpers bound to the connection pool. */
export const db: Queryable = wrap((text, params) => getPool().query(text, params));

/** Runs fn inside a transaction on one connection. */
export async function tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(wrap((text, params) => client.query(text, params)));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function createPool(url: string): Promise<RawPool> {
  if (process.env.PG_DRIVER === 'mini') {
    const { MiniPool } = await import('./pgmini.ts');
    return new MiniPool(url) as unknown as RawPool;
  }
  let pg: any;
  try {
    pg = (await import('pg')).default;
  } catch {
    throw new Error('The "pg" package is missing. Run "npm install" first.');
  }
  pg.types.setTypeParser(20, (v: string) => Number(v)); // BIGINT → number (timestamps, counts)
  pg.types.setTypeParser(1700, (v: string) => Number(v)); // NUMERIC → number
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || /sslmode=disable/.test(url);
  const p = new pg.Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/g, ''),
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_SIZE || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
  });
  p.on('error', (e: Error) => console.error('[db] idle connection error:', e.message));
  return p;
}

// ------------------------------------------------------------------ schema

const MIGRATIONS: string[] = [
  // 1 — initial PostgreSQL schema
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','client')),
    organisation TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    created_at BIGINT NOT NULL,
    updated_at BIGINT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    last_login_at BIGINT
  );
  CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL
  );
  CREATE INDEX sessions_user_idx ON sessions(user_id);
  CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

  CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
    visibility TEXT NOT NULL DEFAULT 'assigned' CHECK (visibility IN ('all','assigned')),
    draft_json TEXT NOT NULL,
    draft_updated_at BIGINT NOT NULL,
    current_version_id TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX templates_status_idx ON templates(status, updated_at);

  CREATE TABLE template_versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    layout_json TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    published_at BIGINT NOT NULL,
    published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (template_id, version_number)
  );
  ALTER TABLE templates ADD CONSTRAINT templates_current_version_fk
    FOREIGN KEY (current_version_id) REFERENCES template_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

  -- Files live in Supabase Storage; this table keeps their metadata and path.
  CREATE TABLE files (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('artwork','reference','preview','signature','font','asset')),
    mime TEXT NOT NULL,
    size BIGINT NOT NULL CHECK (size >= 0),
    sha256 TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    template_id TEXT REFERENCES templates(id) ON DELETE SET NULL,
    original_name TEXT,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at BIGINT NOT NULL
  );
  CREATE INDEX files_template_idx ON files(template_id);

  CREATE TABLE template_access (
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    granted_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (template_id, client_id)
  );
  CREATE INDEX template_access_client_idx ON template_access(client_id);

  CREATE TABLE presets (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX presets_client_idx ON presets(client_id, template_id);

  CREATE TABLE batches (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL REFERENCES templates(id),
    template_version_id TEXT NOT NULL REFERENCES template_versions(id),
    name TEXT NOT NULL,
    content_json TEXT NOT NULL,
    mapping_json TEXT NOT NULL,
    total INTEGER NOT NULL CHECK (total >= 0),
    success INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('running','completed','partial','failed','cancelled')),
    replaced_by TEXT REFERENCES batches(id) ON DELETE SET NULL,
    created_at BIGINT NOT NULL,
    completed_at BIGINT
  );
  CREATE INDEX batches_client_idx ON batches(client_id, created_at);
  CREATE INDEX batches_template_idx ON batches(template_id);

  CREATE TABLE certificates (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    recipient_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','void','revoked')),
    issued_at BIGINT NOT NULL
  );
  CREATE INDEX certificates_batch_idx ON certificates(batch_id);

  CREATE TABLE oauth_connections (
    owner TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('microsoft','google')),
    account_name TEXT,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT,
    expires_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (owner, provider)
  );

  CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL
  );
  CREATE INDEX activity_date_idx ON activity(created_at);
  `,
  // 2 — lock the tables against Supabase's public REST API. The app connects
  // as the table owner (which bypasses RLS); the anon/authenticated API keys
  // get no access at all.
  `
  DO $$
  DECLARE t TEXT;
  BEGIN
    FOREACH t IN ARRAY ARRAY['users','sessions','templates','template_versions','files','template_access','presets','batches','certificates','oauth_connections','activity','schema_version']
    LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    END IF;
  END $$;
  `,
];

async function migrate() {
  await db.run('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  // Only one server instance migrates at a time.
  await tx(async (q) => {
    await q.run('LOCK TABLE schema_version IN EXCLUSIVE MODE');
    const row = await q.one<{ version: number }>('SELECT version FROM schema_version');
    let current = row?.version ?? 0;
    if (!row) await q.run('INSERT INTO schema_version (version) VALUES (0)');
    while (current < MIGRATIONS.length) {
      await q.run(MIGRATIONS[current]);
      current++;
      await q.run('UPDATE schema_version SET version = ?', [current]);
    }
  });
}

/** Connects to PostgreSQL and brings the schema up to date. */
export async function initDb() {
  const url = dbUrl();
  if (!url) {
    throw new Error(
      'SUPABASE_DB_URL is not set. Create a Supabase project and set SUPABASE_DB_URL to its "Session pooler" connection string (see README → Supabase setup).'
    );
  }
  pool = await createPool(url);
  await db.one('SELECT 1');
  await migrate();
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

export function newId(prefix = ''): string {
  return prefix + crypto.randomBytes(12).toString('base64url');
}

export function now(): number {
  return Date.now();
}

export async function logActivity(userId: string | null, action: string, detail = '') {
  await db.run('INSERT INTO activity (id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)', [
    newId('act_'),
    userId,
    action,
    detail.slice(0, 500),
    now(),
  ]);
}
