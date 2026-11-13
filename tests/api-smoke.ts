// End-to-end API smoke test against a running server (PostgreSQL + Storage).
//   node tests/api-smoke.ts http://localhost:3999 [storage-mock-url]
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
r = await admin.req('POST', '/api/admin/files?kind=reference&name=complete.png', undefined, { raw: PNG });
assert.equal(r.status, 200); const refId = r.json.id; ok('reference certificate uploaded');
r = await admin.req('POST', '/api/admin/files?kind=preview&role=reference', undefined, { raw: PNG });
const refPrevId = r.json.id;

r = await admin.req('POST', '/api/admin/templates', { title: 'Participation', description: 'Test' });
assert.equal(r.status, 201); const tplId = r.json.id; ok('template created as draft');
r = await admin.req('POST', `/api/admin/templates/${tplId}/publish`, {});
assert.equal(r.status, 400); ok('publishing empty template blocked');
const STORAGE = process.argv[3];
async function storedPaths(): Promise<string[]> {
  if (!STORAGE) return [];
  return (await (await fetch(`${STORAGE}/__stats`, { headers: { authorization: 'Bearer test-service-key', apikey: 'test-service-key' } })).json()).objects;
}

const draft = {
  artworkFileId: artId, artworkMime: 'image/png',
  pages: [{ width: 842, height: 595, previewFileId: prevId }],
  boxes: [
    { id: 'b1', type: 'text', key: 'recipient_name', label: 'Recipient name', x: 10, y: 40, w: 80, h: 10,
      text: 'SNEAKY WORDING', defaultValue: 'Karma', content: 'x', defaultText: 'Awarded to {{name}}', fontFamily: 'Helvetica' },
    { id: 'b2', type: 'qr', key: 'qr', label: 'QR', x: 80, y: 80, w: 10, h: 14 },
    // Created in the order right, left, middle — must be numbered 1, 2, 3 from left to right.
    { id: 's3', type: 'signature', key: 'signature', label: 'Signature', x: 70, y: 70, w: 15, h: 10, source: 'client' },
    { id: 's1', type: 'signature', key: 'signature_2', label: 'Signature 2', x: 5, y: 70, w: 15, h: 10, source: 'client' },
    { id: 's2', type: 'signature', key: 'signature_3', label: 'Principal', x: 40, y: 70, w: 15, h: 10, source: 'client' },
  ] as any[],
  fonts: [],
  referenceFileId: refId, referenceMime: 'image/png',
  referencePages: [{ width: 842, height: 595, previewFileId: refPrevId }],
  referenceOverlay: { opacity: 0.4, offsetX: 0, offsetY: 0, scale: 1, alignmentConfirmed: false },
};
r = await admin.req('PUT', `/api/admin/templates/${tplId}`, { draft });
assert.equal(r.status, 200);
const savedBox = r.json.draft.boxes[0];
assert.equal(savedBox.text, undefined); assert.equal(savedBox.defaultValue, undefined); assert.equal(savedBox.content, undefined);
ok('unknown wording fields stripped server-side');
assert.equal(savedBox.defaultText, 'Awarded to {{name}}'); ok('admin default wording saved');
{
  const sigs = r.json.draft.boxes.filter((x: any) => x.type === 'signature');
  assert.deepEqual(sigs.map((x: any) => x.id), ['s1', 's2', 's3']);
  assert.deepEqual(sigs.map((x: any) => x.key), ['signature_1', 'signature_2', 'signature_3']);
  assert.deepEqual(sigs.map((x: any) => x.label), ['Signature 1', 'Principal', 'Signature 3']);
  ok('signature boxes ordered and numbered 1, 2, 3 from left to right (custom label kept)');
}
assert.equal(r.json.draft.referenceFileId, refId); ok('reference certificate stored in the layout');
if (STORAGE) {
  const paths = await storedPaths();
  assert.ok(paths.some((x) => x.includes(`templates/${tplId}/blank/${artId}`)), 'blank artwork moved into template folder');
  assert.ok(paths.some((x) => x.includes(`templates/${tplId}/reference/${refId}`)), 'reference stored in reference folder');
  assert.ok(paths.some((x) => x.includes(`templates/${tplId}/reference/previews/${refPrevId}`)));
  ok('files organised in Storage: templates/{id}/blank, reference, previews');
}
// Mismatched reference (portrait vs landscape) blocks publishing until confirmed.
r = await admin.req('PUT', `/api/admin/templates/${tplId}`, { draft: { ...draft, referencePages: [{ width: 595, height: 842, previewFileId: refPrevId }] } });
r = await admin.req('POST', `/api/admin/templates/${tplId}/publish`, {});
assert.equal(r.status, 400); assert.match(r.json.error, /portrait/); ok('mismatched reference certificate blocks publishing');
r = await admin.req('PUT', `/api/admin/templates/${tplId}`, { draft });

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
r = await a.req('GET', '/api/client/templates'); assert.equal(r.json.length, 0); ok('new template is not visible until assigned');
r = await new Client().req('GET', '/api/client/templates'); assert.equal(r.status, 401); ok('visitors must sign in (no public access)');
r = await admin.req('PUT', `/api/admin/templates/${tplId}/access`, { visibility: 'assigned', clientIds: [clientA] });
assert.deepEqual(r.json.assignedClientIds, [clientA]); ok('template assigned to client A');
r = await a.req('GET', '/api/client/templates'); assert.equal(r.json.length, 1);
assert.equal(r.json[0].layout.boxes[0].type, 'text'); ok('assigned client sees the template');
assert.equal(r.json[0].layout.referenceFileId, null); assert.equal(r.json[0].layout.referencePages.length, 0); ok('reference certificate is never sent to clients');
r = await b.req('GET', '/api/client/templates'); assert.equal(r.json.length, 0); ok('unassigned client does not see it');
r = await b.req('GET', `/api/client/templates/${tplId}`); assert.equal(r.status, 404); ok('unassigned client cannot open it by direct link');
r = await admin.req('PUT', `/api/admin/clients/${clientB}/templates`, { templateIds: [tplId] });
r = await b.req('GET', '/api/client/templates'); assert.equal(r.json.length, 1); ok('assigning from the client page works too');
r = await admin.req('PUT', `/api/admin/templates/${tplId}`, { title: 'Renamed draft title' }); r = await a.req('GET', '/api/client/templates'); assert.equal(r.json.length, 1); ok('saving draft changes keeps the template visible');
await admin.req('PUT', `/api/admin/templates/${tplId}`, { title: 'Participation' });
await admin.req('POST', `/api/admin/templates/${tplId}/archive`, {}); r = await a.req('GET', '/api/client/templates'); assert.equal(r.json.length, 0); ok('archived template hidden');
r = await a.req('GET', `/api/client/templates/${tplId}`); assert.equal(r.status, 404); ok('archived template cannot be opened by direct link');
await admin.req('POST', `/api/admin/templates/${tplId}/unarchive`, {}); r = await a.req('GET', '/api/client/templates'); assert.equal(r.json.length, 0); ok('restored template stays hidden until published');
await admin.req('POST', `/api/admin/templates/${tplId}/publish`, {}); r = await a.req('GET', '/api/client/templates'); assert.equal(r.json.length, 1); ok('published again → visible again');
r = await admin.req('GET', '/api/admin/stats'); assert.equal(r.json.storage.persistent, true); ok('storage reported');
r = await a.req('GET', `/api/files/${artId}`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); ok('client can download blank artwork of an assigned template (from Storage)');
r = await a.req('GET', `/api/files/${refId}`); assert.equal(r.status, 404); ok('clients cannot download the reference certificate');
r = await admin.req('GET', `/api/files/${refId}`); assert.equal(r.status, 200); ok('admin can view the reference certificate');
r = await admin.req('POST', '/api/admin/files?kind=artwork', undefined, { raw: PNG }); r = await b.req('GET', `/api/files/${r.json.id}`); assert.equal(r.status, 404); ok('files not used by a published template are private');
r = await new Client().req('GET', `/api/files/${artId}`); assert.equal(r.status, 401); ok('anonymous visitors cannot load files');

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

r = await new Client().req('GET', '/api/admin/templates'); assert.equal(r.status, 401); ok('anonymous visitor blocked from admin API');
r = await b.req('GET', '/api/integrations/google/status'); assert.equal(r.status, 200); assert.equal(r.json.configured, false); assert.equal(r.json.connected, false); ok('Google Sheets reports not configured (no fake connection)');
r = await b.req('GET', '/api/integrations/google/files'); assert.equal(r.status, 503); ok('Google endpoints refuse when unconfigured');
r = await new Client().req('GET', '/api/integrations/google/status'); assert.equal(r.status, 401); ok('integrations require sign-in');
r = await b.req('GET', '/api/public/config'); assert.equal(r.json.googleConfigured, false); ok('config exposes googleConfigured');
r = await b.req('GET', '/api/integrations/microsoft/status'); assert.equal(r.json.configured, false); ok('Microsoft reports not configured (no fake connection)');
r = await b.req('GET', '/api/integrations/microsoft/files'); assert.equal(r.status, 503); ok('Graph endpoints refuse when unconfigured');

r = await admin.req('GET', '/api/admin/stats'); assert.equal(r.json.certificates, 2); ok('admin stats');
// Replace flow and large batch
{
  r = await b.req('POST', '/api/client/batches', { name: 'Big', templateId: tplId, versionId: (await b.req('GET', `/api/client/templates/${tplId}`)).json.versionId, content, mapping: {},
    recipients: Array.from({ length: 2500 }, (_, i) => `Person ${i}`) });
  assert.equal(r.status, 201); assert.equal(r.json.certificateIds.length, 2500); ok('2,500 certificate IDs issued in one batch (no quantity limit)');
  const big = r.json.batch.id;
  r = await b.req('POST', `/api/client/batches/${big}/complete`, { successRows: Array.from({ length: 2500 }, (_, i) => i), failedCount: 0 });
  assert.equal(r.json.status, 'completed'); assert.equal(r.json.success, 2500); ok('large batch completed');
}
r = await admin.req('POST', `/api/admin/certificates/${ids[1]}/revoke`, {});
r = await new Client().req('GET', `/api/public/verify/${ids[1]}`); assert.equal(r.json.status, 'revoked'); ok('revoked certificate reported');
r = await admin.req('POST', '/api/auth/logout', {});
r = await admin.req('GET', '/api/admin/stats'); assert.equal(r.status, 401); ok('logout ends session');

console.log(`\n${passed} checks passed.`);
