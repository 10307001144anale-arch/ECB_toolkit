// Shared OAuth plumbing for the spreadsheet integrations (Microsoft Excel, Google Sheets).
//
// - A connection belongs to a signed-in user ("usr:<id>") or, for visitors
//   using the public client portal, to their anonymous browser ("dev:<id>").
// - The OAuth state + PKCE verifier travel in a short-lived, encrypted,
//   HttpOnly cookie, so no server session is needed.
// - Tokens are encrypted at rest (AES-256-GCM) and never sent to the browser.

import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { db, now } from './db.ts';
import { decrypt, encrypt } from './secret.ts';
import { HttpError } from './http.ts';
import type { AuthedRequest } from './auth.ts';

export type Provider = 'microsoft' | 'google';

export function ownerOf(req: AuthedRequest): string {
  if (!req.user) throw new HttpError(401, 'Please sign in.');
  return `usr:${req.user.id}`;
}

// ------------------------------------------------------------------ OAuth state cookie

const STATE_COOKIE = 'cg_oauth';

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function beginOAuth(req: Request, res: Response, provider: Provider, owner: string) {
  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const payload = encrypt(JSON.stringify({ state, verifier, provider, owner, exp: now() + 10 * 60_000 }));
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true';
  res.cookie(STATE_COOKIE, payload, { httpOnly: true, sameSite: 'lax', secure, maxAge: 10 * 60_000, path: '/api/integrations' });
  return { state, challenge };
}

/** Validates the callback's state and returns the PKCE verifier and owner. */
export function finishOAuth(req: Request, res: Response, provider: Provider): { verifier: string; owner: string } | null {
  const raw = readCookie(req, STATE_COOKIE);
  res.clearCookie(STATE_COOKIE, { path: '/api/integrations' });
  if (!raw) return null;
  try {
    const data = JSON.parse(decrypt(raw));
    const state = String(req.query.state || '');
    if (data.provider !== provider || data.exp < now() || !state || state.length !== data.state.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(state), Buffer.from(data.state))) return null;
    return { verifier: data.verifier, owner: data.owner };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ token storage

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function saveConnection(owner: string, provider: Provider, tokens: TokenSet, accountName: string | null) {
  const existing = await getConnectionRow(owner, provider);
  await db.run(
    `INSERT INTO oauth_connections (owner, provider, account_name, access_token_enc, refresh_token_enc, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner, provider) DO UPDATE SET account_name = excluded.account_name, access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc, expires_at = excluded.expires_at, updated_at = excluded.updated_at`,
    [
    owner,
    provider,
    accountName ?? existing?.account_name ?? null,
    encrypt(tokens.access_token),
    tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refresh_token_enc ?? null,
    now() + (Number(tokens.expires_in) || 3600) * 1000,
    now(),
    ]
  );
}

async function getConnectionRow(owner: string, provider: Provider) {
  return db.one<{ account_name: string | null; access_token_enc: string; refresh_token_enc: string | null; expires_at: number }>(
    'SELECT * FROM oauth_connections WHERE owner = ? AND provider = ?',
    [owner, provider]
  );
}

export async function connectionStatus(owner: string, provider: Provider) {
  const row = await getConnectionRow(owner, provider);
  return { connected: !!row, accountName: row?.account_name ?? null };
}

export async function deleteConnection(owner: string, provider: Provider): Promise<string | null> {
  const row = await getConnectionRow(owner, provider);
  await db.run('DELETE FROM oauth_connections WHERE owner = ? AND provider = ?', [owner, provider]);
  try {
    return row?.refresh_token_enc ? decrypt(row.refresh_token_enc) : row ? decrypt(row.access_token_enc) : null;
  } catch {
    return null;
  }
}

/** A valid access token, refreshing it when it is about to expire. */
export async function accessTokenFor(owner: string, provider: Provider, refresh: (refreshToken: string) => Promise<TokenSet>): Promise<string> {
  const row = await getConnectionRow(owner, provider);
  const label = provider === 'google' ? 'Google' : 'Microsoft';
  if (!row) throw new HttpError(401, `Connect your ${label} account first.`);
  if (row.expires_at - 60_000 > now()) return decrypt(row.access_token_enc);
  if (!row.refresh_token_enc) {
    await deleteConnection(owner, provider);
    throw new HttpError(401, `Your ${label} session expired. Please connect again.`);
  }
  try {
    const tokens = await refresh(decrypt(row.refresh_token_enc));
    await saveConnection(owner, provider, tokens, null);
    return tokens.access_token;
  } catch {
    await deleteConnection(owner, provider);
    throw new HttpError(401, `Your ${label} session expired. Please connect again.`);
  }
}

/** Separator between Microsoft drive id and item id in a file reference. */
export const REF_SEP = '~';
