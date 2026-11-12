// End-to-end API smoke test. Run against a server started with API_ONLY=true:
//   node tests/api-smoke.ts http://localhost:3999
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:3999';
let passed = 0;
function ok(name: string) { passed++; console.log(`  ✓ ${name}`); }

class Client {
  cookie = '';
  jar = new Map<string, string>();
  async req(method: string, path: string, body?: any, opts: { raw?: Buffer; csrf?: boolean; type?: string } = {}) {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (opts.csrf !== false) headers['x-requested-with'] = 'certigen';
    let payload: any;
    if (opts.raw) { payload = opts.raw; headers['content-type'] = opts.type || 'application/octet-stream'; }
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const r = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      this.jar.set(k.trim(), v);
      if (!v) this.jar.delete(k.trim());
    }
    this.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const text = await r.text();
    let json: any = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, headers: r.headers };
  }
}

// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const admin = new Client();
let r = await admin.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'wrong-password1' });
assert.equal(r.status, 401); ok('wrong password rejected');
r = await admin.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123' }, { csrf: false });
assert.equal(r.status, 403); ok('CSRF header required on POST');
r = await admin.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123' });
assert.equal(r.status, 200); assert.equal(r.json.user.role, 'admin'); ok('admin login');
assert.match(r.headers.get('set-cookie') || '', /HttpOnly/i); ok('session cookie is HttpOnly');

r = await admin.req('POST', '/api/admin/files?kind=artwork&name=cert.png', undefined, { raw: Buffer.from('not an image at all') });
assert.equal(r.status, 415); ok('non-image upload rejected by magic bytes');
r = await admin.req('POST', '/api/admin/files?kind=artwork&name=cert.png', undefined, { raw: PNG });
assert.equal(r.status, 200); const artId = r.json.id; ok('artwork uploaded');
r = await admin.req('POST', '/api/admin/files?kind=preview', undefined, { raw: PNG });
const prevId = r.json.id;

r = await admin.req('POST', '/api/admin/templates', { title: 'Participation', description: 'Test' });
assert.equal(r.status, 201); const tplId = r.json.id; ok('template created as draft');
r = await admin.req('POST', `/api/admin/templates/${tplId}/publish`, {});
assert.equal(r.status, 400); ok('publishing empty template blocked');

const draft = {
  artworkFileId: artId, artworkMime: 'image/png',
  pages: [{ width: 842, height: 595, previewFileId: prevId }],
  boxes: [
    { id: 'b1', type: 'text', key: 'recipient_name', label: 'Recipient name', x: 10, y: 40, w: 80, h: 10,
      text: 'SNEAKY WORDING', defaultValue: 'Karma', content: 'x', fontFamily: 'Helvetica' },
    { id: 'b2', type: 'qr', key: 'qr', label: 'QR', x: 80, y: 80, w: 10, h: 14 },
  ],
  fonts: [],
};
r = await admin.req('PUT', `/api/admin/templates/${tplId}`, { draft });
assert.equal(r.status, 200);
const savedBox = r.json.draft.boxes[0];
assert.equal(savedBox.text, undefined); assert.equal(savedBox.defaultValue, undefined); assert.equal(savedBox.content, undefined);
ok('text boxes saved empty (wording stripped server-side)');

r = await admin.req('POST', `/api/admin/templates/${tplId}/publish`, { notes: 'first' });
assert.equal(r.status, 200); assert.equal(r.json.status, 'published'); assert.equal(r.json.currentVersionNumber, 1); ok('published v1');
const v1 = r.json.currentVersionId;

r = await admin.req('POST', '/api/admin/clients', { name: 'Client A', email: 'a@test.local', password: 'short' });
assert.equal(r.status, 400); ok('weak client password rejected');
r = await admin.req('POST', '/api/admin/clients', { name: 'Client A', email: 'a@test.local', password: 'ClientPass123', organisation: 'GCIT' });
assert.equal(r.status, 201); const clientA = r.json.id;
r = await admin.req('POST', '/api/admin/clients', { name: 'Client B', email: 'b@test.local', password: 'ClientPass123' });
const clientB = r.json.id; ok('client accounts created');

const a = new Client(); const b = new Client();
await a.req('POST', '/api/auth/login', { email: 'a@test.local', password: 'ClientPass123' });
await b.req('POST', '/api/auth/login', { email: 'b@test.local', password: 'ClientPass123' });
r = await a.req('GET', '/api/admin/templates'); assert.equal(r.status, 403); ok('client blocked from admin API');
await admin.req('POST', `/api/admin/templates/${tplId}/unpublish`, {});
r = await a.req('GET', '/api/client/templates'); assert.equal(r.json.length, 0); ok('unpublished template hidden');
r = await admin.req('POST', `/api/admin/templates/${tplId}/publish`, {}); assert.equal(r.json.currentVersionNumber, 1); ok('re-publishing unchanged layout keeps v1');
r = await a.req('GET', '/api/client/templates'); assert.equal(r.json.length, 1);
assert.equal(r.json[0].layout.boxes[0].type, 'text'); ok('published template is public');
r = await b.req('GET', '/api/client/templates'); assert.equal(r.json.length, 1); ok('every client sees it');
r = await a.req('GET', `/api/files/${artId}`); assert.equal(r.status, 200); ok('client can download artwork of accessible template');
r = await admin.req('POST', '/api/admin/files?kind=artwork', undefined, { raw: PNG }); r = await b.req('GET', `/api/files/${r.json.id}`); assert.equal(r.status, 404); ok('files not used by a published template are private');
r = await new Client().req('GET', `/api/files/${artId}`); assert.equal(r.status, 200); ok('public visitor can load published artwork');

const content = { texts: { recipient_name: '{{name}}' }, qr: { qr: { mode: 'verification', value: '' } }, signatures: {}, photos: {} };
r = await a.req('POST', '/api/client/presets', { name: 'Participation', templateId: tplId, content });
assert.equal(r.status, 201); const presetId = r.json.id; ok('preset saved');
r = await b.req('PUT', `/api/client/presets/${presetId}`, { name: 'hijack' }); assert.equal(r.status, 404); ok("client cannot edit another client's preset");

r = await a.req('POST', '/api/client/batches', { name: 'Workshop', templateId: tplId, versionId: v1, content,
  mapping: { placeholders: { name: { column: 'Full Name', type: 'text', dateFormat: '' } }, recipientColumn: 'Full Name' },
  recipients: ['Karma Dorji', 'Sonam Wangmo', 'Pema'] });
assert.equal(r.status, 201); assert.equal(r.json.certificateIds.length, 3); const batchId = r.json.batch.id; const ids = r.json.certificateIds;
ok('batch started, 3 certificate IDs issued');
r = await new Client().req('GET', `/api/public/verify/${ids[0]}`); assert.equal(r.json.valid, false); ok('pending certificate not yet valid');
r = await a.req('POST', `/api/client/batches/${batchId}/complete`, { successRows: [0, 1], failedCount: 1 });
assert.equal(r.json.status, 'partial'); assert.equal(r.json.success, 2); ok('batch completed (partial)');
r = await new Client().req('GET', `/api/public/verify/${ids[0]}`);
assert.equal(r.json.valid, true); assert.equal(r.json.recipientName, 'Karma Dorji'); ok('public verification: valid');
r = await new Client().req('GET', `/api/public/verify/${ids[2]}`); assert.equal(r.json.valid, false); assert.equal(r.json.status, 'void'); ok('failed row is void');
r = await new Client().req('GET', `/api/public/verify/CG-AAAA-BBBB-CCCC`); assert.equal(r.json.status, 'not_found'); ok('unknown ID not found');
r = await b.req('GET', `/api/client/batches/${batchId}`); assert.equal(r.status, 404); ok("client cannot read another client's batch");

// New version must not change existing batch
draft.boxes[0].x = 5;
await admin.req('PUT', `/api/admin/templates/${tplId}`, { draft });
r = await admin.req('GET', '/api/admin/templates'); assert.equal(r.json[0].hasUnpublishedChanges, true); ok('draft edits flagged as unpublished');
r = await a.req('GET', '/api/client/templates'); assert.equal(r.json[0].layout.boxes[0].x, 10); ok('clients keep seeing published layout while draft changes');
r = await admin.req('POST', `/api/admin/templates/${tplId}/publish`, {}); assert.equal(r.json.currentVersionNumber, 2); ok('republish creates v2');
r = await a.req('GET', `/api/client/batches/${batchId}`); assert.equal(r.json.batch.templateVersionNumber, 1); ok('old batch stays linked to v1');
r = await a.req('POST', '/api/client/batches', { name: 'x', templateId: tplId, versionId: v1, content, mapping: {}, recipients: ['x'] });
assert.equal(r.status, 409); ok('stale version rejected for new batches');
r = await admin.req('GET', `/api/admin/templates/${tplId}/versions`); assert.equal(r.json.length, 2);
r = await admin.req('POST', `/api/admin/templates/${tplId}/versions/${v1}/restore`, {}); assert.equal(r.json.draft.boxes[0].x, 10); ok('restore v1 into draft');
r = await admin.req('DELETE', `/api/admin/templates/${tplId}`); assert.equal(r.status, 409); ok('template with history cannot be deleted');
r = await admin.req('POST', `/api/admin/templates/${tplId}/duplicate`, {}); assert.equal(r.json.status, 'draft'); ok('duplicate');

r = await admin.req('PUT', `/api/admin/clients/${clientA}`, { active: false });
r = await a.req('GET', '/api/auth/me'); assert.equal(r.json.user, null); ok('deactivated client is signed out');
r = await a.req('POST', '/api/auth/login', { email: 'a@test.local', password: 'ClientPass123' }); assert.equal(r.status, 401); ok('deactivated client cannot sign in');

// Public (no sign-in) access
const g1 = new Client(); const g2 = new Client();
r = await g1.req('GET', '/api/client/templates'); assert.equal(r.status, 200); assert.equal(r.json.length, 1); ok('public visitor sees published template without signing in');


r = await g1.req('GET', '/api/admin/templates'); assert.equal(r.status, 401); ok('public visitor blocked from admin API');
r = await g1.req('POST', '/api/client/presets', { name: 'Mine', templateId: tplId, content });
assert.equal(r.status, 201); const gp = r.json.id;
r = await g2.req('GET', '/api/client/presets'); assert.equal(r.json.length, 0); ok("public visitors don't see each other's presets");
r = await g2.req('PUT', `/api/client/presets/${gp}`, { name: 'x' }); assert.equal(r.status, 404); ok("public visitor cannot edit another browser's preset");
r = await g1.req('GET', '/api/client/presets'); assert.equal(r.json.length, 1); ok('public visitor keeps own preset');
r = await g1.req('GET', '/api/integrations/microsoft/status'); assert.equal(r.json.requiresAccount, true); ok('Microsoft requires a named account for public visitors');
r = await admin.req('GET', '/api/admin/clients'); const pub = r.json.find((c: any) => c.isPublic); assert.ok(pub); ok('public client listed for admins');
await admin.req('PUT', `/api/admin/clients/${pub.id}`, { active: false });
r = await g1.req('GET', '/api/client/templates'); assert.equal(r.status, 401); ok('turning off public access requires sign-in');
await admin.req('PUT', `/api/admin/clients/${pub.id}`, { active: true });
r = await new Client().req('POST', '/api/auth/login', { email: 'public@guest.invalid', password: 'disabled' }); assert.equal(r.status, 401); ok('public client cannot be signed into');

r = await b.req('GET', '/api/integrations/microsoft/status'); assert.equal(r.json.configured, false); ok('Microsoft reports not configured (no fake connection)');
r = await b.req('GET', '/api/integrations/microsoft/workbooks'); assert.equal(r.status, 503); ok('Graph endpoints refuse when unconfigured');

r = await admin.req('GET', '/api/admin/stats'); assert.equal(r.json.certificates, 2); ok('admin stats');
r = await admin.req('POST', `/api/admin/certificates/${ids[1]}/revoke`, {});
r = await new Client().req('GET', `/api/public/verify/${ids[1]}`); assert.equal(r.json.status, 'revoked'); ok('revoked certificate reported');
r = await admin.req('POST', '/api/auth/logout', {});
r = await admin.req('GET', '/api/admin/stats'); assert.equal(r.status, 401); ok('logout ends session');

console.log(`\n${passed} checks passed.`);
