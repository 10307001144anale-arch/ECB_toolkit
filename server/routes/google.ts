// Google Sheets import (Google Drive + Sheets APIs, read-only).
// OAuth 2.0 authorisation-code flow with PKCE, run on the server. Tokens are
// encrypted at rest and never reach the browser. Sheet rows are passed
// straight to the requesting browser and are not stored.

import { Router } from 'express';
import type { AuthedRequest } from '../auth.ts';
import { h, HttpError } from '../http.ts';
import { accessTokenFor, beginOAuth, connectionStatus, deleteConnection, finishOAuth, ownerOf, saveConnection, type TokenSet } from '../connections.ts';
import { gridToTable } from '../../shared/table.ts';

function appUrl() {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
}
function redirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  return appUrl() ? `${appUrl()}/api/integrations/google/callback` : '';
}
export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && redirectUri());
}
// Read-only: list spreadsheet files (metadata only) and read their cells.
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
].join(' ');

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.access_token) throw new Error(`Token endpoint error: ${json.error || resp.status}`);
  return json;
}

async function gapi(token: string, url: string): Promise<any> {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.ok) return resp.json();
  const err: any = await resp.json().catch(() => ({}));
  const reason = err?.error?.status || err?.error?.errors?.[0]?.reason || resp.status;
  if (resp.status === 401) throw new HttpError(401, 'Google rejected the request. Please reconnect your account.');
  if (resp.status === 403) {
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(JSON.stringify(err))) {
      throw new HttpError(503, 'The Google Drive or Sheets API is not enabled for this application. Ask your administrator to enable it.');
    }
    throw new HttpError(403, 'Your Google account does not have permission to open this spreadsheet.');
  }
  if (resp.status === 404) throw new HttpError(404, 'The spreadsheet or tab could not be found.');
  throw new HttpError(502, `Google API error (${reason}).`);
}

function token(req: AuthedRequest) {
  if (!googleConfigured()) throw new HttpError(503, 'Google Sheets is not configured on this server.');
  return accessTokenFor(ownerOf(req), 'google', (rt) => tokenRequest({ grant_type: 'refresh_token', refresh_token: rt }));
}

function fileId(id: string) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) throw new HttpError(400, 'Invalid spreadsheet reference.');
  return id;
}

export const googleRouter = Router();

googleRouter.get(
  '/callback',
  h(async (req: AuthedRequest, res) => {
    const done = (status: string) => res.redirect(`/oauth/complete?provider=google&status=${encodeURIComponent(status)}`);
    const st = finishOAuth(req, res, 'google');
    if (req.query.error) return done(String(req.query.error) === 'access_denied' ? 'denied' : 'error');
    if (!st) return done('state_mismatch');
    try {
      const tokens = await tokenRequest({ grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: redirectUri(), code_verifier: st.verifier });
      const me: any = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((r) => (r.ok ? r.json() : null));
      saveConnection(st.owner, 'google', tokens, me?.email || me?.name || null);
      done('connected');
    } catch (err: any) {
      console.error('[google] token exchange failed:', err?.message);
      done('error');
    }
  })
);

googleRouter.get('/status', (req: AuthedRequest, res) => {
  res.json({ configured: googleConfigured(), ...connectionStatus(ownerOf(req), 'google') });
});

googleRouter.get(
  '/connect',
  h(async (req: AuthedRequest, res) => {
    if (!googleConfigured()) throw new HttpError(503, 'Google Sheets is not configured on this server.');
    const { state, challenge } = beginOAuth(req, res, 'google', ownerOf(req));
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent select_account',
      include_granted_scopes: 'true',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  })
);

googleRouter.post(
  '/disconnect',
  h(async (req: AuthedRequest, res) => {
    const tok = deleteConnection(ownerOf(req), 'google');
    // Revoke at Google too, so the app's access is fully removed.
    if (tok) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok)}`, { method: 'POST' }).catch(() => {});
    res.json({ ok: true });
  })
);

googleRouter.get(
  '/files',
  h(async (req: AuthedRequest, res) => {
    const t = await token(req);
    const q = String(req.query.q || '').slice(0, 100).replace(/['\\]/g, '');
    const query = ["mimeType='application/vnd.google-apps.spreadsheet'", 'trashed=false', ...(q ? [`name contains '${q}'`] : [])].join(' and ');
    const params = new URLSearchParams({
      q: query,
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      fields: 'files(id,name,modifiedTime,owners(displayName),shared)',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    const data = await gapi(t, `https://www.googleapis.com/drive/v3/files?${params}`);
    res.json(
      (data.files || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        location: f.shared ? `Shared · ${f.owners?.[0]?.displayName || ''}`.trim() : 'My Drive',
        modified: f.modifiedTime || null,
      }))
    );
  })
);

googleRouter.get(
  '/files/:id/sheets',
  h(async (req: AuthedRequest, res) => {
    const data = await gapi(await token(req), `https://sheets.googleapis.com/v4/spreadsheets/${fileId(req.params.id)}?fields=sheets.properties(title,index,hidden)`);
    res.json((data.sheets || []).filter((s: any) => !s.properties?.hidden).map((s: any) => ({ name: s.properties.title })));
  })
);

googleRouter.get(
  '/files/:id/sheets/:sheet/rows',
  h(async (req: AuthedRequest, res) => {
    const range = `'${String(req.params.sheet).replace(/'/g, "''")}'`;
    const data = await gapi(
      await token(req),
      `https://sheets.googleapis.com/v4/spreadsheets/${fileId(req.params.id)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json(gridToTable(Array.isArray(data.values) ? data.values : []));
  })
);
