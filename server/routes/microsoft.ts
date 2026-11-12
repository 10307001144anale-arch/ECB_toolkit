// Microsoft Excel (OneDrive / SharePoint) integration through Microsoft Graph.
//
// OAuth 2.0 authorisation-code flow with PKCE, run entirely on the server.
// Access and refresh tokens are encrypted at rest and are never sent to the
// browser or written to logs. Workbook rows are passed straight through to the
// signed-in client's browser and are not stored on the server.

import { Router } from 'express';
import crypto from 'node:crypto';
import { requireRole, type AuthedRequest } from '../auth.ts';
import { db, logActivity, now } from '../db.ts';
import { h, HttpError } from '../http.ts';
import { decrypt, encrypt } from '../secret.ts';

const GRAPH = 'https://graph.microsoft.com/v1.0';

export function msConfigured(): boolean {
  return !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && redirectUri());
}

function tenant() {
  return process.env.MS_TENANT_ID || 'common';
}
function redirectUri(): string {
  if (process.env.MS_REDIRECT_URI) return process.env.MS_REDIRECT_URI;
  const app = (process.env.APP_URL || '').replace(/\/+$/, '');
  return app && !app.includes('MY_APP_URL') ? `${app}/api/integrations/microsoft/callback` : '';
}
function scopes(): string {
  // Files.Read.All: read workbooks the user can open, including ones shared with them (SharePoint/OneDrive).
  return process.env.MS_SCOPES || 'offline_access User.Read Files.Read.All';
}

export const microsoftRouter = Router();

// The OAuth callback is reached by a top-level redirect from Microsoft, so it is
// registered before the role guard; it still requires the user's session cookie.
microsoftRouter.get(
  '/callback',
  h(async (req: AuthedRequest, res) => {
    const done = (status: string) => res.redirect(`/oauth/microsoft?status=${encodeURIComponent(status)}`);
    if (!req.user || req.user.role !== 'client' || !req.sessionTokenHash) return done('signed_out');
    const sess = db.prepare('SELECT ms_oauth_state, ms_code_verifier FROM sessions WHERE token_hash = ?').get(req.sessionTokenHash) as any;
    db.prepare('UPDATE sessions SET ms_oauth_state = NULL, ms_code_verifier = NULL WHERE token_hash = ?').run(req.sessionTokenHash);
    if (req.query.error) return done(String(req.query.error) === 'access_denied' ? 'denied' : 'error');
    const state = String(req.query.state || '');
    if (!sess?.ms_oauth_state || !state || state.length !== sess.ms_oauth_state.length ||
        !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(sess.ms_oauth_state))) {
      return done('state_mismatch');
    }
    const code = String(req.query.code || '');
    if (!code) return done('error');
    try {
      const tokens = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        code_verifier: sess.ms_code_verifier,
      });
      const me: any = await fetch(`${GRAPH}/me?$select=displayName,userPrincipalName,mail`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }).then((r) => (r.ok ? r.json() : null));
      const account = me ? `${me.displayName || ''} (${me.mail || me.userPrincipalName || ''})`.trim() : null;
      saveTokens(req.user.id, tokens, account);
      logActivity(req.user.id, 'microsoft_connected', '');
      done('connected');
    } catch (err: any) {
      console.error('[microsoft] token exchange failed:', err?.message);
      done('error');
    }
  })
);

microsoftRouter.use(requireRole('client'));
microsoftRouter.use((req: AuthedRequest, res, next) => {
  if (req.guest && req.path !== '/status') return res.status(403).json({ error: 'Sign in with a client account to connect Microsoft Excel.' });
  next();
});

microsoftRouter.get(
  '/status',
  h(async (req: AuthedRequest, res) => {
    if (req.guest) return res.json({ configured: msConfigured(), connected: false, accountName: null, requiresAccount: true });
    const row = db.prepare('SELECT account_name FROM ms_connections WHERE user_id = ?').get(req.user!.id) as any;
    res.json({ configured: msConfigured(), connected: !!row, accountName: row?.account_name ?? null, requiresAccount: false });
  })
);

microsoftRouter.get(
  '/connect',
  h(async (req: AuthedRequest, res) => {
    if (!msConfigured()) throw new HttpError(503, 'Microsoft Excel is not configured on this server.');
    const state = crypto.randomBytes(24).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    db.prepare('UPDATE sessions SET ms_oauth_state = ?, ms_code_verifier = ? WHERE token_hash = ?').run(state, verifier, req.sessionTokenHash!);
    const params = new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: redirectUri(),
      response_mode: 'query',
      scope: scopes(),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    res.redirect(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${params}`);
  })
);

microsoftRouter.post(
  '/disconnect',
  h(async (req: AuthedRequest, res) => {
    db.prepare('DELETE FROM ms_connections WHERE user_id = ?').run(req.user!.id);
    logActivity(req.user!.id, 'microsoft_disconnected', '');
    res.json({ ok: true });
  })
);

interface DriveItemOut {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  lastModified: string | null;
  location: string;
  shared: boolean;
}

function toItem(it: any, shared: boolean): DriveItemOut | null {
  const remote = it.remoteItem || it;
  const name: string = remote.name || it.name || '';
  if (!/\.xlsx$/i.test(name)) return null; // the Graph workbook API only supports .xlsx
  const driveId = remote.parentReference?.driveId || it.parentReference?.driveId;
  if (!driveId || !remote.id) return null;
  const pathStr: string = remote.parentReference?.path || '';
  return {
    driveId,
    itemId: remote.id,
    name,
    webUrl: remote.webUrl || it.webUrl || '',
    lastModified: remote.lastModifiedDateTime || it.lastModifiedDateTime || null,
    location: shared ? 'Shared with me' : decodeURIComponent(pathStr.replace(/^\/drive\/root:?/, '') || '/'),
    shared,
  };
}

microsoftRouter.get(
  '/workbooks',
  h(async (req: AuthedRequest, res) => {
    const token = await accessToken(req.user!.id);
    const q = String(req.query.q || '').replace(/'/g, "''").slice(0, 100) || '.xlsx';
    const [own, shared] = await Promise.all([
      graph(token, `/me/drive/root/search(q='${encodeURIComponent(q)}')?$top=100&$select=id,name,webUrl,lastModifiedDateTime,parentReference,file`),
      graph(token, `/me/drive/sharedWithMe?$top=100`).catch(() => ({ value: [] })),
    ]);
    const items: DriveItemOut[] = [];
    const seen = new Set<string>();
    const qLower = String(req.query.q || '').toLowerCase();
    for (const [list, isShared] of [[own.value, false], [shared.value, true]] as const) {
      for (const it of list || []) {
        const item = toItem(it, isShared);
        if (!item || seen.has(item.itemId)) continue;
        if (qLower && !item.name.toLowerCase().includes(qLower)) continue;
        seen.add(item.itemId);
        items.push(item);
      }
    }
    items.sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
    res.json(items.slice(0, 150));
  })
);

function itemPath(driveId: string, itemId: string) {
  if (!/^[A-Za-z0-9!_\-.]+$/.test(driveId) || !/^[A-Za-z0-9!_\-.]+$/.test(itemId)) throw new HttpError(400, 'Invalid workbook reference.');
  return `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;
}

microsoftRouter.get(
  '/workbooks/:driveId/:itemId/worksheets',
  h(async (req: AuthedRequest, res) => {
    const token = await accessToken(req.user!.id);
    const data = await graph(token, `${itemPath(req.params.driveId, req.params.itemId)}/workbook/worksheets?$select=name,position,visibility`);
    res.json((data.value || []).filter((w: any) => w.visibility !== 'Hidden').map((w: any) => ({ name: w.name, position: w.position })));
  })
);

microsoftRouter.get(
  '/workbooks/:driveId/:itemId/worksheets/:sheet/rows',
  h(async (req: AuthedRequest, res) => {
    const token = await accessToken(req.user!.id);
    const sheet = String(req.params.sheet).replace(/'/g, "''");
    const data = await graph(
      token,
      `${itemPath(req.params.driveId, req.params.itemId)}/workbook/worksheets('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=text,rowCount,columnCount`
    );
    const grid: string[][] = Array.isArray(data.text) ? data.text : [];
    if (grid.length === 0) return res.json({ headers: [], rows: [] });
    if (grid.length > 20001) throw new HttpError(413, 'This worksheet has more than 20,000 rows. Split it into smaller sheets.');
    // Headers: first row, de-duplicated, blanks named "Column N".
    const seen = new Map<string, number>();
    const headers = grid[0].map((h, i) => {
      let name = String(h ?? '').trim() || `Column ${i + 1}`;
      const n = seen.get(name) || 0;
      seen.set(name, n + 1);
      if (n > 0) name = `${name} (${n + 1})`;
      return name;
    });
    const rows = grid
      .slice(1)
      .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, String(r[i] ?? '').trim()])));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ headers, rows });
  })
);

// ------------------------------------------------------------------ helpers

async function tokenRequest(body: Record<string, string>): Promise<any> {
  const resp = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: scopes(),
      ...body,
    }),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.access_token) {
    // Only the error code is logged, never tokens.
    throw new Error(`Token endpoint error: ${json.error || resp.status}`);
  }
  return json;
}

function saveTokens(userId: string, tokens: any, accountName: string | null) {
  const existing = db.prepare('SELECT refresh_token_enc, account_name FROM ms_connections WHERE user_id = ?').get(userId) as any;
  const refresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refresh_token_enc ?? null;
  db.prepare(
    `INSERT INTO ms_connections (user_id, account_name, access_token_enc, refresh_token_enc, expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET account_name = excluded.account_name, access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc, expires_at = excluded.expires_at, updated_at = excluded.updated_at`
  ).run(
    userId,
    accountName ?? existing?.account_name ?? null,
    encrypt(tokens.access_token),
    refresh,
    now() + (Number(tokens.expires_in) || 3600) * 1000,
    now()
  );
}

async function accessToken(userId: string): Promise<string> {
  if (!msConfigured()) throw new HttpError(503, 'Microsoft Excel is not configured on this server.');
  const row = db.prepare('SELECT * FROM ms_connections WHERE user_id = ?').get(userId) as any;
  if (!row) throw new HttpError(401, 'Connect your Microsoft account first.');
  if (row.expires_at - 60_000 > now()) return decrypt(row.access_token_enc);
  if (!row.refresh_token_enc) {
    db.prepare('DELETE FROM ms_connections WHERE user_id = ?').run(userId);
    throw new HttpError(401, 'Your Microsoft session expired. Please connect again.');
  }
  try {
    const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decrypt(row.refresh_token_enc) });
    saveTokens(userId, tokens, null);
    return tokens.access_token;
  } catch {
    db.prepare('DELETE FROM ms_connections WHERE user_id = ?').run(userId);
    throw new HttpError(401, 'Your Microsoft session expired. Please connect again.');
  }
}

async function graph(token: string, path: string): Promise<any> {
  const resp = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.ok) return resp.json();
  const err: any = await resp.json().catch(() => ({}));
  const code = err?.error?.code || resp.status;
  if (resp.status === 401) throw new HttpError(401, 'Microsoft rejected the request. Please reconnect your account.');
  if (resp.status === 403) throw new HttpError(403, 'Your Microsoft account does not have permission to open this file.');
  if (resp.status === 404) throw new HttpError(404, 'The workbook or worksheet could not be found.');
  throw new HttpError(502, `Microsoft Graph error (${code}).`);
}
