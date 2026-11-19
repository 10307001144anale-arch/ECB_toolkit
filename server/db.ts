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
  // 3 — three portals: superadmin (templates), admin (clients, activities,
  // users), user (generates). Existing admins become Super Admins, existing
  // client accounts become Users; each old client organisation becomes a
  // Client with a default "General" activity that inherits its template
  // access and batch history.
  `
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  UPDATE users SET role = 'superadmin' WHERE role = 'admin';
  UPDATE users SET role = 'user' WHERE role = 'client';
  ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin','admin','user'));

  CREATE TABLE clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    organization TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    logo_file_id TEXT,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );

  CREATE TABLE activities (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','completed','archived')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  );
  CREATE INDEX activities_client_idx ON activities(client_id);

  CREATE TABLE assignments (
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (template_id, activity_id)
  );
  CREATE INDEX assignments_activity_idx ON assignments(activity_id);

  CREATE TABLE user_clients (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, client_id)
  );
  CREATE INDEX user_clients_client_idx ON user_clients(client_id);

  ALTER TABLE batches ADD COLUMN activity_id TEXT REFERENCES activities(id) ON DELETE SET NULL;
  CREATE INDEX batches_activity_idx ON batches(activity_id);
  ALTER TABLE templates ADD COLUMN reference_image_file_id TEXT;

  ALTER TABLE files DROP CONSTRAINT IF EXISTS files_kind_check;
  ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('artwork','reference','preview','signature','font','asset','logo','refimage'));

  DO $$
  DECLARE
    r RECORD;
    cid TEXT;
    aid TEXT;
    t BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  BEGIN
    FOR r IN SELECT DISTINCT COALESCE(NULLIF(trim(organisation), ''), name) AS org FROM users WHERE role = 'user' LOOP
      cid := 'cli_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
      aid := 'acv_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
      INSERT INTO clients (id, name, organization, email, logo_file_id, notes, status, created_by, created_at, updated_at)
        VALUES (cid, r.org, r.org, '', NULL, 'Created automatically from existing client accounts.', 'active', NULL, t, t);
      INSERT INTO activities (id, client_id, name, date, description, status, created_by, created_at, updated_at)
        VALUES (aid, cid, 'General', '', 'Created automatically; holds earlier certificates.', 'active', NULL, t, t);
      INSERT INTO user_clients (user_id, client_id)
        SELECT id, cid FROM users WHERE role = 'user' AND COALESCE(NULLIF(trim(organisation), ''), name) = r.org;
      INSERT INTO assignments (template_id, activity_id, assigned_by, assigned_at)
        SELECT DISTINCT a.template_id, aid, NULL::TEXT, t FROM template_access a JOIN users u ON u.id = a.client_id
         WHERE u.role = 'user' AND COALESCE(NULLIF(trim(u.organisation), ''), u.name) = r.org
        ON CONFLICT DO NOTHING;
      UPDATE batches SET activity_id = aid
       WHERE client_id IN (SELECT id FROM users WHERE role = 'user' AND COALESCE(NULLIF(trim(organisation), ''), name) = r.org);
    END LOOP;
  END $$;

  DO $$
  DECLARE t TEXT;
  BEGIN
    FOREACH t IN ARRAY ARRAY['clients','activities','assignments','user_clients']
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
  // 4 — "Client" becomes "User": Admins manage User accounts (with
  // organization, logo, notes, status) and the Activities of each User.
  // Published templates are available to every User (no assignments).
  // Batches remember the Admin who generated them on a User's behalf.
  `
  ALTER TABLE users ADD COLUMN logo_file_id TEXT;
  ALTER TABLE users ADD COLUMN notes TEXT NOT NULL DEFAULT '';
  ALTER TABLE activities ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE activities ALTER COLUMN client_id DROP NOT NULL;
  CREATE INDEX activities_user_idx ON activities(user_id);
  ALTER TABLE batches ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;

  -- Users inherit organisation and logo from the client they were linked to.
  UPDATE users u SET organisation = COALESCE(NULLIF(trim(u.organisation), ''), NULLIF(c.organization, ''), c.name),
                     logo_file_id = COALESCE(u.logo_file_id, c.logo_file_id)
    FROM user_clients uc JOIN clients c ON c.id = uc.client_id
   WHERE uc.user_id = u.id AND u.role = 'user';

  -- Each activity goes to one user of its client; other users of that client
  -- get their own copy, and their batches move with them.
  DO $$
  DECLARE
    a RECORD;
    uc RECORD;
    first_user TEXT;
    copy_id TEXT;
  BEGIN
    FOR a IN SELECT * FROM activities WHERE user_id IS NULL AND client_id IS NOT NULL LOOP
      first_user := NULL;
      FOR uc IN SELECT user_id FROM user_clients WHERE client_id = a.client_id ORDER BY user_id LOOP
        IF first_user IS NULL THEN
          first_user := uc.user_id;
          UPDATE activities SET user_id = uc.user_id WHERE id = a.id;
        ELSE
          copy_id := 'acv_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16);
          INSERT INTO activities (id, client_id, user_id, name, date, description, status, created_by, created_at, updated_at)
            VALUES (copy_id, a.client_id, uc.user_id, a.name, a.date, a.description, a.status, a.created_by, a.created_at, a.updated_at);
          UPDATE batches SET activity_id = copy_id WHERE activity_id = a.id AND client_id = uc.user_id;
        END IF;
      END LOOP;
    END LOOP;
  END $$;
  `,
  // 5 — Admins can mark a template as recommended ("use this template").
  `
  ALTER TABLE templates ADD COLUMN recommended_by TEXT REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE templates ADD COLUMN recommended_at BIGINT;
  `,
  // 6 — Upload A becomes the cover image of existing templates that have none.
  `
  UPDATE templates t
     SET reference_image_file_id = t.draft_json::jsonb #>> '{referencePages,0,previewFileId}'
   WHERE t.reference_image_file_id IS NULL
     AND EXISTS (SELECT 1 FROM files f WHERE f.id = t.draft_json::jsonb #>> '{referencePages,0,previewFileId}');
  `,
  // 7 — Profile photos and "forgot password" reset links.
  `
  ALTER TABLE users ADD COLUMN avatar_file_id TEXT;
  ALTER TABLE files DROP CONSTRAINT IF EXISTS files_kind_check;
  ALTER TABLE files ADD CONSTRAINT files_kind_check CHECK (kind IN ('artwork','reference','preview','signature','font','asset','logo','refimage','avatar'));
  CREATE TABLE password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at BIGINT
  );
  CREATE INDEX password_resets_user_idx ON password_resets(user_id);
  `,
  // 8 — "Forgot password" requests that go to an administrator when email cannot be sent.
  `
  CREATE TABLE password_help_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at BIGINT NOT NULL,
    resolved_at BIGINT,
    resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX password_help_requests_open_idx ON password_help_requests(user_id) WHERE resolved_at IS NULL;
  `,
  // 9 — Email verification codes (OTP) for "forgot password", in the existing password_resets table:
  //     kind 'otp' = 6-digit code (keyed hash), 'reset' = short-lived token after the code is verified,
  //     'link' = reset link created by an administrator.
  `
  ALTER TABLE password_resets ADD COLUMN kind TEXT NOT NULL DEFAULT 'link' CHECK (kind IN ('link','otp','reset'));
  ALTER TABLE password_resets ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX password_resets_user_kind_idx ON password_resets(user_id, kind);
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
