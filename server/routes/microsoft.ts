// Microsoft Excel (OneDrive / SharePoint) import through Microsoft Graph.
// OAuth 2.0 authorisation-code flow with PKCE, run on the server. Tokens are
// encrypted at rest and never reach the browser. Workbook rows are passed
// straight to the requesting browser and are not stored.

import { Router } from 'express';
import type { AuthedRequest } from '../auth.ts';
import { logActivity } from '../db.ts';
import { h, HttpError } from '../http.ts';
import { accessTokenFor, beginOAuth, connectionStatus, deleteConnection, finishOAuth, ownerOf, REF_SEP, saveConnection, type TokenSet } from '../connections.ts';
import { gridToTable } from '../../shared/table.ts';

const GRAPH = 'https://graph.microsoft.com/v1.0';

function appUrl() {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
}
function redirectUri(): string {
  if (process.env.MS_REDIRECT_URI) return process.env.MS_REDIRECT_URI;
  return appUrl() ? `${appUrl()}/api/integrations/microsoft/callback` : '';
}
export function msConfigured(): boolean {
  return !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && redirectUri());
}
const tenant = () => process.env.MS_TENANT_ID || 'common';
// Files.Read.All: read workbooks the user can open, including ones shared with them.
const scopes = () => process.env.MS_SCOPES || 'offline_access User.Read Files.Read.All';

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const resp = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!, scope: scopes(), ...body }),
  });
  const json: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.access_token) throw new Error(`Token endpoint error: ${json.error || resp.status}`);
  return json;
}

async function graph(token: string, path: string): Promise<any> {
  const resp = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.ok) return resp.json();
  const err: any = await resp.json().catch(() => ({}));
  if (resp.status === 401) throw new HttpError(401, 'Microsoft rejected the request. Please reconnect your account.');
  if (resp.status === 403) throw new HttpError(403, 'Your Microsoft account does not have permission to open this file.');
  if (resp.status === 404) throw new HttpError(404, 'The workbook or worksheet could not be found.');
  throw new HttpError(502, `Microsoft Graph error (${err?.error?.code || resp.status}).`);
}

function token(req: AuthedRequest) {
  if (!msConfigured()) throw new HttpError(503, 'Microsoft Excel is not configured on this server.');
  return accessTokenFor(ownerOf(req), 'microsoft', (rt) => tokenRequest({ grant_type: 'refresh_token', refresh_token: rt }));
}

function itemPath(ref: string) {
  const [driveId, itemId] = ref.split(REF_SEP);
  if (!driveId || !itemId || !/^[A-Za-z0-9!_\-.]+$/.test(driveId) || !/^[A-Za-z0-9!_\-.]+$/.test(itemId)) throw new HttpError(400, 'Invalid workbook reference.');
  return `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`;
}

export const microsoftRouter = Router();

microsoftRouter.get(
  '/callback',
  h(async (req: AuthedRequest, res) => {
    const done = (status: string) => res.redirect(`/oauth/complete?provider=microsoft&status=${encodeURIComponent(status)}`);
    const st = finishOAuth(req, res, 'microsoft');
    if (req.query.error) return done(String(req.query.error) === 'access_denied' ? 'denied' : 'error');
    if (!st) return done('state_mismatch');
    try {
      const tokens = await tokenRequest({ grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: redirectUri(), code_verifier: st.verifier });
      const me: any = await fetch(`${GRAPH}/me?$select=displayName,userPrincipalName,mail`, { headers: { Authorization: `Bearer ${tokens.access_token}` } }).then((r) => (r.ok ? r.json() : null));
      saveConnection(st.owner, 'microsoft', tokens, me ? `${me.displayName || ''} (${me.mail || me.userPrincipalName || ''})`.trim() : null);
      done('connected');
    } catch (err: any) {
      console.error('[microsoft] token exchange failed:', err?.message);
      done('error');
    }
  })
);

microsoftRouter.get('/status', (req: AuthedRequest, res) => {
  res.json({ configured: msConfigured(), ...connectionStatus(ownerOf(req), 'microsoft') });
});

microsoftRouter.get(
  '/connect',
  h(async (req: AuthedRequest, res) => {
    if (!msConfigured()) throw new HttpError(503, 'Microsoft Excel is not configured on this server.');
    const { state, challenge } = beginOAuth(req, res, 'microsoft', ownerOf(req));
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

microsoftRouter.post('/disconnect', (req: AuthedRequest, res) => {
  deleteConnection(ownerOf(req), 'microsoft');
  if (req.user && !req.guest) logActivity(req.user.id, 'microsoft_disconnected', '');
  res.json({ ok: true });
});

microsoftRouter.get(
  '/files',
  h(async (req: AuthedRequest, res) => {
    const t = await token(req);
    const qRaw = String(req.query.q || '').slice(0, 100);
    const q = qRaw.replace(/'/g, "''") || '.xlsx';
    const [own, shared] = await Promise.all([
      graph(t, `/me/drive/root/search(q='${encodeURIComponent(q)}')?$top=100&$select=id,name,webUrl,lastModifiedDateTime,parentReference,file`),
      graph(t, `/me/drive/sharedWithMe?$top=100`).catch(() => ({ value: [] })),
    ]);
    const out: any[] = [];
    const seen = new Set<string>();
    for (const [list, isShared] of [[own.value, false], [shared.value, true]] as const) {
      for (const it of list || []) {
        const r = it.remoteItem || it;
        const name: string = r.name || it.name || '';
        const driveId = r.parentReference?.driveId || it.parentReference?.driveId;
        if (!/\.xlsx$/i.test(name) || !driveId || !r.id || seen.has(r.id)) continue; // Graph workbook API reads .xlsx only
        if (qRaw && !name.toLowerCase().includes(qRaw.toLowerCase())) continue;
        seen.add(r.id);
        out.push({
          id: `${driveId}${REF_SEP}${r.id}`,
          name,
          location: isShared ? 'Shared with me' : decodeURIComponent((r.parentReference?.path || '').replace(/^\/drive\/root:?/, '') || '/'),
          modified: r.lastModifiedDateTime || it.lastModifiedDateTime || null,
        });
      }
    }
    out.sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
    res.json(out.slice(0, 200));
  })
);

microsoftRouter.get(
  '/files/:id/sheets',
  h(async (req: AuthedRequest, res) => {
    const data = await graph(await token(req), `${itemPath(req.params.id)}/workbook/worksheets?$select=name,position,visibility`);
    res.json((data.value || []).filter((w: any) => w.visibility !== 'Hidden').map((w: any) => ({ name: w.name })));
  })
);

microsoftRouter.get(
  '/files/:id/sheets/:sheet/rows',
  h(async (req: AuthedRequest, res) => {
    const sheet = String(req.params.sheet).replace(/'/g, "''");
    const data = await graph(await token(req), `${itemPath(req.params.id)}/workbook/worksheets('${encodeURIComponent(sheet)}')/usedRange(valuesOnly=true)?$select=text`);
    res.setHeader('Cache-Control', 'no-store');
    res.json(gridToTable(Array.isArray(data.text) ? data.text : []));
  })
);
