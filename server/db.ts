// Persistent storage using Node's built-in SQLite (node:sqlite, Node >= 22.13).
// No native npm module is needed.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
export const FILES_DIR = path.join(DATA_DIR, 'files');
fs.mkdirSync(FILES_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'certigen.sqlite');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','client')),
    organisation TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ms_oauth_state TEXT,
    ms_code_verifier TEXT
  );
  CREATE INDEX idx_sessions_user ON sessions(user_id);

  CREATE TABLE files (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    original_name TEXT,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
    visibility TEXT NOT NULL DEFAULT 'assigned' CHECK (visibility IN ('all','assigned')),
    draft_json TEXT NOT NULL,
    draft_updated_at INTEGER NOT NULL,
    current_version_id TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE template_versions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    layout_json TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    published_at INTEGER NOT NULL,
    published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE (template_id, version_number)
  );

  CREATE TABLE template_access (
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (template_id, client_id)
  );

  CREATE TABLE presets (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_presets_client ON presets(client_id);

  CREATE TABLE batches (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL REFERENCES templates(id),
    template_version_id TEXT NOT NULL REFERENCES template_versions(id),
    name TEXT NOT NULL,
    content_json TEXT NOT NULL,
    mapping_json TEXT NOT NULL,
    total INTEGER NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );
  CREATE INDEX idx_batches_client ON batches(client_id, created_at);

  CREATE TABLE certificates (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    recipient_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','valid','void','revoked')),
    issued_at INTEGER NOT NULL
  );
  CREATE INDEX idx_certificates_batch ON certificates(batch_id);

  CREATE TABLE ms_connections (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    account_name TEXT,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE activity (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_activity_date ON activity(created_at);
  `,
  // 2 — public (no sign-in) client access
  `
  ALTER TABLE presets ADD COLUMN device_id TEXT;
  ALTER TABLE batches ADD COLUMN device_id TEXT;
  CREATE INDEX idx_presets_device ON presets(device_id);
  CREATE INDEX idx_batches_device ON batches(device_id);
  INSERT OR IGNORE INTO users (id, email, name, password_hash, role, organisation, active, created_at)
    VALUES ('usr_public_guest', 'public@guest.invalid', 'Public (no sign-in)', 'disabled', 'client', NULL, 1, CAST(strftime('%s','now') AS INTEGER) * 1000);
  UPDATE templates SET visibility = 'all' WHERE visibility = 'assigned' AND NOT EXISTS (SELECT 1 FROM template_access a WHERE a.template_id = templates.id);
  `,
  // 3 — OAuth connections (Microsoft, Google) owned by a user OR an anonymous browser
  `
  CREATE TABLE oauth_connections (
    owner TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('microsoft','google')),
    account_name TEXT,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner, provider)
  );
  INSERT INTO oauth_connections (owner, provider, account_name, access_token_enc, refresh_token_enc, expires_at, updated_at)
    SELECT 'usr:' || user_id, 'microsoft', account_name, access_token_enc, refresh_token_enc, expires_at, updated_at FROM ms_connections;
  `,
];

/** Built-in client used by visitors who are not signed in. */
export const GUEST_ID = 'usr_public_guest';

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let current = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (current < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[current]);
      current++;
      db.prepare('UPDATE schema_version SET version = ?').run(current);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
migrate();

export function newId(prefix = ''): string {
  return prefix + crypto.randomBytes(12).toString('base64url');
}

export function now(): number {
  return Date.now();
}

/** Runs fn inside a transaction. */
export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function logActivity(userId: string | null, action: string, detail = '') {
  db.prepare('INSERT INTO activity (id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)').run(
    newId('act_'),
    userId,
    action,
    detail.slice(0, 500),
    now()
  );
}
