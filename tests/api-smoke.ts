// End-to-end API smoke test against a running server (PostgreSQL + Storage).
//   node tests/api-smoke.ts http://localhost:3999 [storage-mock-url]
// Needs a fresh database: the first Super Admin is admin@test.local / AdminPass123.
import assert from 'node:assert/strict';

const BASE = process.argv[2] || 'http://localhost:3999';
let passed = 0;
function ok(name: string) { passed++; console.log(`  ✓ ${name}`); }

class Client {
  cookie = '';
  jar = new Map<string, string>();
  async req(method: string, path: string, body?: any, opts: { raw?: Buffer; csrf?: boolean; type?: string; portal?: string } = {}) {
    const headers: Record<string, string> = {};
    if (opts.portal) headers['x-portal'] = opts.portal;
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

// ------------------------------------------------------------------ Super Admin sign-in
const sa = new Client();
let r = await sa.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'wrong-password1' });
assert.equal(r.status, 401); ok('wrong password rejected');
r = await sa.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123' }, { csrf: false });
assert.equal(r.status, 403); ok('CSRF header required on POST');
r = await sa.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123', portal: 'admin' });
assert.equal(r.status, 403); assert.match(r.json.error, /Super Admin portal/); ok('Super Admin cannot sign in on the Admin portal');
r = await sa.req('GET', '/api/auth/me'); assert.equal(r.json.user, null); ok('no session after wrong-portal sign-in');
r = await sa.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123', portal: 'superadmin' });
assert.equal(r.status, 200); assert.equal(r.json.user.role, 'superadmin'); ok('Super Admin login');
assert.match(r.headers.get('set-cookie') || '', /HttpOnly/i); ok('session cookie is HttpOnly');

// ------------------------------------------------------------------ Super Admin: files & templates
r = await sa.req('POST', '/api/superadmin/files?kind=artwork&name=cert.png', undefined, { raw: Buffer.from('not an image at all') });
assert.equal(r.status, 415); ok('non-image upload rejected by magic bytes');
r = await sa.req('POST', '/api/superadmin/files?kind=artwork&name=cert.png', undefined, { raw: PNG });
assert.equal(r.status, 200); const artId = r.json.id; ok('artwork uploaded');
r = await sa.req('POST', '/api/superadmin/files?kind=preview', undefined, { raw: PNG });
const prevId = r.json.id;
r = await sa.req('POST', '/api/superadmin/files?kind=reference&name=complete.png', undefined, { raw: PNG });
assert.equal(r.status, 200); const refId = r.json.id; ok('reference certificate uploaded');
r = await sa.req('POST', '/api/superadmin/files?kind=preview&role=reference', undefined, { raw: PNG });
const refPrevId = r.json.id;

r = await sa.req('POST', '/api/superadmin/templates', { title: 'Participation', description: 'Test' });
assert.equal(r.status, 201); const tplId = r.json.id; assert.equal(r.json.createdByRole, 'superadmin'); ok('template created as draft (owned by Super Admin)');
r = await sa.req('POST', `/api/superadmin/templates/${tplId}/publish`, {});
assert.equal(r.status, 400); ok('publishing empty template blocked');

const draft = {
  artworkFileId: artId, artworkMime: 'image/png',
  pages: [{ width: 842, height: 595, previewFileId: prevId }],
  boxes: [
    { id: 'b1', type: 'text', key: 'recipient_name', label: 'Recipient name', x: 10, y: 40, w: 80, h: 10,
      text: 'SNEAKY WORDING', defaultValue: 'Karma', content: 'x', defaultText: 'Awarded to {{name}}', fontFamily: 'Helvetica', rotation: 15, locked: true },
    { id: 'b2', type: 'qr', key: 'qr', label: 'QR', x: 80, y: 80, w: 10, h: 14, hidden: true },
    // Created in the order right, left, middle — must be numbered 1, 2, 3 from left to right.
    { id: 's3', type: 'signature', key: 'signature', label: 'Signature', x: 70, y: 70, w: 15, h: 10, source: 'client' },
    { id: 's1', type: 'signature', key: 'signature_2', label: 'Signature 2', x: 5, y: 70, w: 15, h: 10, source: 'client' },
    { id: 's2', type: 'signature', key: 'signature_3', label: 'Principal', x: 40, y: 70, w: 15, h: 10, source: 'client' },
  ] as any[],
  fonts: [],
  referenceFileId: refId, referenceMime: 'image/png',
  referencePages: [{ width: 842, height: 595, previewFileId: refPrevId }],
  referenceOverlay: { opacity: 0.4, offsetX: 0, offsetY: 0, scale: 1, alignmentConfirmed: false },
  guides: [{ id: 'g1', page: 0, axis: 'x', pos: 50 }, { axis: 'z', pos: 3 }],
};
r = await sa.req('PUT', `/api/superadmin/templates/${tplId}`, { draft });
assert.equal(r.status, 200);
const savedBox = r.json.draft.boxes[0];
assert.equal(savedBox.text, undefined); assert.equal(savedBox.defaultValue, undefined); assert.equal(savedBox.content, undefined);
ok('unknown wording fields stripped server-side');
assert.equal(savedBox.defaultText, 'Awarded to {{name}}'); ok('default wording saved');
assert.equal(savedBox.rotation, 15); assert.equal(savedBox.locked, true); assert.equal(r.json.draft.boxes[1].hidden, true); ok('rotation, lock and hide flags kept');
assert.equal(r.json.draft.guides.length, 1); assert.equal(r.json.draft.guides[0].pos, 50); ok('guides kept, invalid guides dropped');
{
  const sigs = r.json.draft.boxes.filter((x: any) => x.type === 'signature');
  assert.deepEqual(sigs.map((x: any) => x.key), ['signature_1', 'signature_2', 'signature_3']);
  assert.deepEqual(sigs.map((x: any) => x.label), ['Signature 1', 'Principal', 'Signature 3']);
  ok('signature boxes ordered and numbered 1, 2, 3 from left to right (custom label kept)');
}
r = await sa.req('PUT', `/api/superadmin/templates/${tplId}`, { draft: { ...draft, referencePages: [{ width: 595, height: 842, previewFileId: refPrevId }] } });
r = await sa.req('POST', `/api/superadmin/templates/${tplId}/publish`, {});
assert.equal(r.status, 400); assert.match(r.json.error, /portrait/); ok('mismatched reference certificate blocks publishing');
r = await sa.req('PUT', `/api/superadmin/templates/${tplId}`, { draft }); assert.equal(r.json.referenceImageFileId, refPrevId); ok('Upload A becomes the cover image as soon as it is saved');
r = await sa.req('POST', `/api/superadmin/templates/${tplId}/publish`, { notes: 'first' });
assert.equal(r.status, 200); assert.equal(r.json.status, 'published'); assert.equal(r.json.currentVersionNumber, 1); ok('published v1'); assert.equal(r.json.referenceImageFileId, refPrevId); ok('publishing makes Upload A the reference image');
const v1 = r.json.currentVersionId;
r = await sa.req('PUT', `/api/superadmin/templates/${tplId}`, { title: 'Participation — renamed' });
assert.equal(r.json.title, 'Participation — renamed'); ok('template renamed');

// Reference image for users
r = await sa.req('POST', `/api/superadmin/files?kind=refimage&templateId=${tplId}`, undefined, { raw: PNG });
const refImgId = r.json.id;
r = await sa.req('PUT', `/api/superadmin/templates/${tplId}/reference-image`, { fileId: refImgId });
assert.equal(r.json.referenceImageFileId, refImgId); ok('reference image set');

// ------------------------------------------------------------------ Admin accounts (Super Admin)
r = await sa.req('POST', '/api/superadmin/admins', { name: 'Ada Admin', email: 'ada@test.local', password: 'short' });
assert.equal(r.status, 400); ok('weak password rejected');
r = await sa.req('POST', '/api/superadmin/admins', { name: 'Ada Admin', email: 'ada@test.local', password: 'AdminPass456' });
assert.equal(r.status, 201); assert.equal(r.json.role, 'admin'); ok('Admin account created by Super Admin');
r = await sa.req('GET', '/api/admin/users'); assert.ok([401, 403].includes(r.status), String(r.status)); ok('Super Admin cannot manage Users or Activities');

const ad = new Client();
r = await ad.req('POST', '/api/auth/login', { email: 'ada@test.local', password: 'AdminPass456', portal: 'admin' });
assert.equal(r.status, 200); ok('Admin login');
r = await ad.req('GET', '/api/superadmin/templates'); assert.ok([401, 403].includes(r.status), String(r.status)); ok('Admin blocked from Super Admin API');
r = await ad.req('PUT', `/api/superadmin/templates/${tplId}`, { draft: { ...draft, boxes: [] } }); assert.ok([401, 403].includes(r.status), String(r.status)); ok('Admin cannot edit field configuration');
r = await ad.req('POST', '/api/admin/templates', { title: 'x' }); assert.equal(r.status, 404); ok('Admin cannot upload templates');
r = await ad.req('POST', '/api/admin/files?kind=artwork', undefined, { raw: PNG }); assert.equal(r.status, 400); ok('Admin can only upload logos');
r = await ad.req('DELETE', `/api/admin/templates/${tplId}`); assert.equal(r.status, 404); ok('Admin cannot delete templates');

// ------------------------------------------------------------------ live updates
{
  const res = await fetch(BASE + '/api/events', { headers: { cookie: ad.cookie } });
  assert.equal(res.headers.get('content-type'), 'text/event-stream'); ok('live update stream opens for signed-in accounts');
  const reader = res.body!.getReader();
  const got = (async () => {
    let text = '';
    const dec = new TextDecoder();
    while (!text.includes('event: change')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value);
    }
    return text;
  })();
  await sa.req('PUT', `/api/superadmin/templates/${tplId}`, { title: 'Participation' });
  const text = await Promise.race([got, new Promise<string>((res2) => setTimeout(() => res2(''), 3000))]);
  assert.match(text, /"templates"/); ok('a change by the Super Admin is pushed to the Admin portal');
  await reader.cancel();
}
r = await new Client().req('GET', '/api/events'); assert.equal(r.status, 401); ok('live updates require sign-in');

// ------------------------------------------------------------------ Admin: Users and Activities
r = await ad.req('POST', '/api/admin/users', { name: 'User A', email: 'bad-email', password: 'ClientPass123' });
assert.equal(r.status, 400); ok('invalid email rejected');
r = await ad.req('POST', '/api/admin/users', { name: 'User A', email: 'a@test.local', password: 'ClientPass123', organisation: 'Gyalpozhing College', notes: 'n' });
assert.equal(r.status, 201); assert.equal(r.json.organisation, 'Gyalpozhing College'); const userA = r.json.id; ok('user created with organization and notes');
r = await ad.req('POST', '/api/admin/files?kind=logo&name=logo.png', undefined, { raw: PNG }); const logoId = r.json.id;
r = await ad.req('PUT', `/api/admin/users/${userA}`, { logoFileId: logoId }); assert.equal(r.json.logoFileId, logoId); ok('user logo set');
r = await ad.req('POST', '/api/admin/users', { name: 'User B', email: 'b@test.local', password: 'ClientPass123' }); const userB = r.json.id;
r = await ad.req('POST', `/api/admin/users/${userA}/activities`, { name: 'UX Workshop', date: '2026-11-01', description: 'd', status: 'active' });
assert.equal(r.status, 201); assert.equal(r.json.userId, userA); const actA = r.json.id; ok('activity created under the user');
r = await ad.req('POST', `/api/admin/users/${userA}/activities`, { name: 'Bad date', date: '01/11/2026' }); assert.equal(r.status, 400); ok('invalid activity date rejected');
r = await ad.req('POST', `/api/admin/users/${userB}/activities`, { name: 'Other event' }); const actB = r.json.id;
r = await ad.req('GET', `/api/admin/activities?userId=${userA}`); assert.deepEqual(r.json.map((x: any) => x.id), [actA]); ok('activities listed per user');

const a = new Client(); const b = new Client();
r = await a.req('POST', '/api/auth/login', { email: 'a@test.local', password: 'ClientPass123', portal: 'superadmin' }); assert.equal(r.status, 403); ok('User cannot sign in on the Super Admin portal');
await a.req('POST', '/api/auth/login', { email: 'a@test.local', password: 'ClientPass123', portal: 'user' });
await b.req('POST', '/api/auth/login', { email: 'b@test.local', password: 'ClientPass123', portal: 'user' });
r = await a.req('GET', '/api/admin/users'); assert.ok([401, 403].includes(r.status), String(r.status)); ok('User blocked from Admin API');
r = await a.req('GET', '/api/admin/gen/templates'); assert.ok([401, 403].includes(r.status), String(r.status)); ok('User blocked from Admin generation API');
r = await new Client().req('GET', '/api/user/templates'); assert.equal(r.status, 401); ok('visitors must sign in (no public access)');

// Published templates are available to every User and Admin.
r = await a.req('GET', '/api/user/templates'); assert.equal(r.json.length, 1);
assert.equal(r.json[0].referenceImageFileId, refImgId); ok('published template visible to users, with its reference image');
assert.equal(r.json[0].layout.referenceFileId, null); assert.equal(r.json[0].layout.referencePages.length, 0); ok('Upload A is never sent to users');
r = await b.req('GET', '/api/user/templates'); assert.equal(r.json.length, 1); ok('every user sees published templates (no assignment step)');
r = await ad.req('GET', '/api/admin/template-log'); assert.equal(r.status, 200); assert.ok(r.json.templates.some((t: any) => t.id === tplId)); assert.ok(r.json.templates.every((t: any) => t.status === 'published')); assert.ok(r.json.events.some((e: any) => e.action === 'template_published')); ok('Admin audit log lists Super Admin templates and activity');
assert.equal(r.json.templates.find((t: any) => t.id === tplId).referenceImageFileId, refImgId); ok('custom reference image is kept on publish');
r = await ad.req('PUT', `/api/admin/templates/${tplId}/recommend`, { recommended: true }); assert.equal(r.status, 200); assert.ok(r.json.recommendedAt); ok('Admin can mark a template as recommended');
r = await a.req('GET', '/api/user/templates'); assert.ok(r.json.find((t: any) => t.id === tplId)?.recommendedAt); ok('Users see the recommended mark');
r = await a.req('PUT', `/api/admin/templates/${tplId}/recommend`, { recommended: true }); assert.ok([401, 403].includes(r.status), String(r.status)); ok('Users cannot recommend templates');
r = await ad.req('PUT', `/api/admin/templates/${tplId}/recommend`, { recommended: false }); assert.equal(r.json.recommendedAt, null); ok('Admin can remove the recommendation');

// Files
r = await a.req('GET', `/api/files/${artId}`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/png'); ok('user can download blank artwork of a published template (for rendering)');
r = await a.req('GET', `/api/files/${refImgId}`); assert.equal(r.status, 200); ok('user can load the reference image');
r = await a.req('GET', `/api/files/${refId}`); assert.equal(r.status, 404); ok('users cannot download Upload A');
r = await a.req('GET', `/api/files/${logoId}`); assert.equal(r.status, 200); ok('user can load their own logo');
r = await b.req('GET', `/api/files/${logoId}`); assert.equal(r.status, 404); ok("users cannot load another user's logo");
r = await new Client().req('GET', `/api/files/${artId}`); assert.equal(r.status, 401); ok('anonymous visitors cannot load files');

// Unpublished / archived templates disappear from every portal.
await sa.req('POST', `/api/superadmin/templates/${tplId}/unpublish`, {});
r = await a.req('GET', '/api/user/templates'); assert.equal(r.json.length, 0);
r = await ad.req('GET', '/api/admin/gen/templates'); assert.equal(r.json.length, 0); ok('unpublished template hidden from Admin and User');
r = await a.req('GET', `/api/files/${refImgId}`); assert.equal(r.status, 404); ok('reference image private once unpublished');
await sa.req('POST', `/api/superadmin/templates/${tplId}/publish`, {});
await sa.req('POST', `/api/superadmin/templates/${tplId}/archive`, {});
r = await a.req('GET', '/api/user/templates'); assert.equal(r.json.length, 0); ok('archived template hidden');
await sa.req('POST', `/api/superadmin/templates/${tplId}/unarchive`, {});
await sa.req('POST', `/api/superadmin/templates/${tplId}/publish`, {});
r = await a.req('GET', '/api/user/templates'); assert.equal(r.json.length, 1); ok('restored and published again → visible again');

// ------------------------------------------------------------------ User: presets & batches
const content = { texts: { recipient_name: '{{name}}' }, qr: { qr: { mode: 'verification', value: '' } }, signatures: {}, photos: {} };
r = await a.req('POST', '/api/user/presets', { name: 'Participation', templateId: tplId, content });
assert.equal(r.status, 201); const presetId = r.json.id; ok('preset saved');
r = await b.req('PUT', `/api/user/presets/${presetId}`, { name: 'hijack' }); assert.equal(r.status, 404); ok("user cannot edit another user's preset");

r = await a.req('POST', '/api/user/batches', { name: 'Workshop', templateId: tplId, versionId: v1, content,
  mapping: { placeholders: { name: { column: 'Full Name', type: 'text', dateFormat: '' } }, recipientColumn: 'Full Name' },
  recipients: ['Karma Dorji', 'Sonam Wangmo', 'Pema'] });
assert.equal(r.status, 201); assert.equal(r.json.certificateIds.length, 3); assert.equal(r.json.batch.activityId, null);
const batchId = r.json.batch.id; const ids = r.json.certificateIds;
ok('user generates without choosing a client or activity');
r = await a.req('POST', '/api/user/batches', { name: 'x', templateId: tplId, versionId: v1, activityId: actB, content, mapping: {}, recipients: ['x'] });
assert.equal(r.status, 400); ok("user cannot file a batch under another user's activity");
r = await new Client().req('GET', `/api/public/verify/${ids[0]}`); assert.equal(r.json.valid, false); ok('pending certificate not yet valid');
r = await a.req('POST', `/api/user/batches/${batchId}/complete`, { successRows: [0, 1], failedCount: 1 });
assert.equal(r.json.status, 'partial'); assert.equal(r.json.success, 2); ok('batch completed (partial)');
r = await new Client().req('GET', `/api/public/verify/${ids[0]}`);
assert.equal(r.json.valid, true); assert.equal(r.json.recipientName, 'Karma Dorji'); assert.equal(r.json.issuer, 'Gyalpozhing College'); ok("public verification: valid, issuer is the user's organization");
r = await new Client().req('GET', `/api/public/verify/${ids[2]}`); assert.equal(r.json.status, 'void'); ok('failed row is void');
r = await new Client().req('GET', '/api/public/verify/CG-AAAA-BBBB-CCCC'); assert.equal(r.json.status, 'not_found'); ok('unknown ID not found');
r = await b.req('GET', `/api/user/batches/${batchId}`); assert.equal(r.status, 404); ok("user cannot read another user's batch");

// ------------------------------------------------------------------ Admins view history but do not generate
r = await ad.req('POST', '/api/admin/gen/batches', { name: 'Admin batch', templateId: tplId, versionId: v1, content, mapping: {}, recipients: ['Tashi', 'Yangchen'] });
assert.equal(r.status, 403); ok('Admins cannot generate certificates');
r = await ad.req('GET', '/api/admin/gen/batches'); assert.equal(r.status, 200); assert.ok(r.json.some((x: any) => x.id === batchId)); ok("Admin history lists the Users' batches");
r = await ad.req('GET', '/api/admin/stats');
assert.equal(r.json.certificates, 2); ok('Admin dashboard counts all certificates');

// Versions
draft.boxes[0].x = 5;
await sa.req('PUT', `/api/superadmin/templates/${tplId}`, { draft });
r = await a.req('GET', `/api/user/templates/${tplId}`); assert.equal(r.json.layout.boxes[0].x, 10); ok('users keep the published layout while the draft changes');
r = await sa.req('POST', `/api/superadmin/templates/${tplId}/publish`, {}); assert.equal(r.json.currentVersionNumber, 2); ok('republish creates v2');
r = await a.req('POST', '/api/user/batches', { name: 'x', templateId: tplId, versionId: v1, content, mapping: {}, recipients: ['x'] });
assert.equal(r.status, 409); ok('stale version rejected for new batches');
r = await sa.req('POST', `/api/superadmin/templates/${tplId}/versions/${v1}/restore`, {}); assert.equal(r.json.draft.boxes[0].x, 10); ok('restore v1 into draft');

// ------------------------------------------------------------------ deleting templates
r = await sa.req('GET', `/api/superadmin/templates/${tplId}/usage`);
assert.deepEqual(r.json, { users: 1, batches: 1, certificates: 2 }); ok('usage reported before delete');
r = await sa.req('DELETE', `/api/superadmin/templates/${tplId}`); assert.equal(r.status, 409); ok('template with history cannot be deleted');
r = await sa.req('POST', `/api/superadmin/templates/${tplId}/duplicate`, {}); const dupId = r.json.id; assert.equal(r.json.status, 'draft'); ok('duplicate');
r = await sa.req('DELETE', `/api/superadmin/templates/${dupId}`); assert.equal(r.status, 200); ok('template without history deleted');

// Users and activities
r = await ad.req('DELETE', `/api/admin/users/${userA}`); assert.equal(r.status, 409); ok('user with history cannot be deleted');
r = await ad.req('DELETE', `/api/admin/activities/${actA}`); assert.equal(r.status, 200);
r = await new Client().req('GET', `/api/public/verify/${ids[0]}`); assert.equal(r.json.valid, true); ok('deleting an activity keeps its certificates valid');
r = await ad.req('PUT', `/api/admin/users/${userA}`, { active: false });
r = await a.req('GET', '/api/auth/me'); assert.equal(r.json.user, null); ok('inactive user is signed out');
r = await a.req('POST', '/api/auth/login', { email: 'a@test.local', password: 'ClientPass123' }); assert.equal(r.status, 401); ok('inactive user cannot sign in');
r = await ad.req('DELETE', `/api/admin/users/${userB}`); assert.equal(r.status, 200); ok('user without history deleted (with their activities)');

// Integrations
r = await b.req('GET', '/api/integrations/google/status'); assert.equal(r.status, 401); ok('deleted user signed out of integrations');
const c = new Client();
await ad.req('POST', '/api/admin/users', { name: 'User C', email: 'c@test.local', password: 'ClientPass123' });
await c.req('POST', '/api/auth/login', { email: 'c@test.local', password: 'ClientPass123' });
r = await c.req('GET', '/api/integrations/google/status'); assert.equal(r.status, 200); assert.equal(r.json.configured, false); ok('Google Sheets reports not configured (no fake connection)');
r = await c.req('GET', '/api/integrations/microsoft/files'); assert.equal(r.status, 503); ok('Graph endpoints refuse when unconfigured');
r = await ad.req('GET', '/api/integrations/google/status'); assert.equal(r.status, 401); ok('integrations are for users only');

r = await sa.req('POST', `/api/superadmin/certificates/${ids[1]}/revoke`, {});
r = await new Client().req('GET', `/api/public/verify/${ids[1]}`); assert.equal(r.json.status, 'revoked'); ok('revoked certificate reported');
// ------------------------------------------------------------------ one session per portal
const multi = new Client();
await multi.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123', portal: 'superadmin' });
await multi.req('POST', '/api/auth/login', { email: 'ada@test.local', password: 'AdminPass456', portal: 'admin' });
r = await multi.req('GET', '/api/superadmin/stats'); assert.equal(r.status, 200);
r = await multi.req('GET', '/api/admin/stats'); assert.equal(r.status, 200); ok('signed in to two portals in the same browser');
r = await multi.req('GET', '/api/auth/me', undefined, { portal: 'admin' }); assert.equal(r.json.user.role, 'admin');
r = await multi.req('GET', '/api/auth/me', undefined, { portal: 'superadmin' }); assert.equal(r.json.user.role, 'superadmin');
r = await multi.req('GET', '/api/auth/me', undefined, { portal: 'user' }); assert.equal(r.json.user, null); ok('each portal reports its own account');
await multi.req('POST', '/api/auth/logout', {}, { portal: 'admin' });
r = await multi.req('GET', '/api/admin/stats'); assert.equal(r.status, 401);
r = await multi.req('GET', '/api/superadmin/stats'); assert.equal(r.status, 200); ok('signing out of one portal keeps the other signed in');

// ------------------------------------------------------------------ profile, email, photo, forgot password
r = await ad.req('PUT', '/api/auth/profile', { name: 'Ada Wangmo' }); assert.equal(r.json.user.name, 'Ada Wangmo'); ok('profile name updated');
r = await ad.req('POST', '/api/auth/change-email', { newEmail: 'ada2@test.local', currentPassword: 'wrong-pass-1' }); assert.equal(r.status, 400); ok('email change needs the current password');
r = await ad.req('POST', '/api/auth/change-email', { newEmail: 'admin@test.local', currentPassword: 'AdminPass456' }); assert.equal(r.status, 409); ok('email already in use is rejected');
r = await ad.req('POST', '/api/auth/change-email', { newEmail: 'ada2@test.local', currentPassword: 'AdminPass456' }); assert.equal(r.json.user.email, 'ada2@test.local'); ok('email changed with the current password');
r = await new Client().req('POST', '/api/auth/login', { email: 'ada2@test.local', password: 'AdminPass456', portal: 'admin' }); assert.equal(r.status, 200); ok('sign in with the new email');
r = await ad.req('POST', '/api/auth/avatar', undefined, { raw: PNG, type: 'image/png' }); assert.ok(r.json.user.avatarFileId); const avatarId = r.json.user.avatarFileId; ok('profile photo uploaded');
r = await ad.req('GET', `/api/files/${avatarId}`); assert.equal(r.status, 200); ok('profile photo can be shown');
r = await ad.req('POST', '/api/auth/avatar', undefined, { raw: Buffer.from('not an image'), type: 'image/png' }); assert.equal(r.status, 415); ok('non-image profile photo rejected');
r = await ad.req('DELETE', '/api/auth/avatar'); assert.equal(r.json.user.avatarFileId, null); ok('profile photo removed');
r = await new Client().req('POST', '/api/auth/forgot-password', { email: 'nobody@test.local' }); assert.equal(r.status, 200); const sameMsg = r.json.message; ok('forgot password does not reveal unknown emails');
r = await new Client().req('GET', '/api/auth/reset-password/not-a-real-token'); assert.equal(r.json.valid, false); ok('bogus reset link is invalid');
r = await new Client().req('POST', '/api/auth/reset-password', { token: 'not-a-real-token', newPassword: 'NewPass12345' }); assert.equal(r.status, 400); ok('bogus reset token rejected');
r = await new Client().req('POST', '/api/auth/forgot-password', { email: 'ada2@test.local' }); assert.equal(r.json.message, sameMsg); ok('forgot password answers the same for real accounts');
// Email is not configured on the test server: the request goes to the administrator instead.
assert.equal(r.json.emailEnabled, false); assert.match(r.json.message, /not available/);
r = await sa.req('GET', '/api/superadmin/password-requests'); assert.ok(!r.json.some((x: any) => x.email === 'ada2@test.local')); ok('without email, forgot password does not hand the account to an administrator');
r = await ad.req('GET', '/api/admin/password-requests'); assert.ok(!r.json.some((x: any) => x.email === 'ada2@test.local')); ok('Admin requests are not shown to Admins');
const adaId = r.json && (await sa.req('GET', '/api/superadmin/admins')).json.find((x: any) => x.email === 'ada2@test.local').id;
r = await ad.req('POST', `/api/superadmin/password-requests/${adaId}/link`); assert.ok([401, 403].includes(r.status)); ok('only the Super Admin can create an Admin reset link');
r = await sa.req('POST', `/api/superadmin/password-requests/${adaId}/link`); assert.match(r.json.link, /\/reset-password\?token=/); const token = new URL(r.json.link).searchParams.get('token')!; ok('Super Admin creates a reset link');
r = await sa.req('GET', '/api/superadmin/password-requests'); assert.ok(!r.json.some((x: any) => x.email === 'ada2@test.local')); ok('no open request after the link');
r = await new Client().req('GET', `/api/auth/reset-password/${token}`); assert.equal(r.json.valid, true); assert.equal(r.json.role, 'admin'); ok('reset link is valid');
r = await new Client().req('POST', '/api/auth/reset-password', { token, newPassword: 'short' }); assert.equal(r.status, 400); ok('weak new password rejected');
r = await new Client().req('POST', '/api/auth/reset-password', { token, newPassword: 'ResetPass789' }); assert.equal(r.json.role, 'admin'); ok('password reset with the link');
r = await ad.req('GET', '/api/admin/stats'); assert.equal(r.status, 401); ok('reset signs out existing sessions');
r = await new Client().req('POST', '/api/auth/login', { email: 'ada2@test.local', password: 'ResetPass789', portal: 'admin' }); assert.equal(r.status, 200); const ad2 = new Client(); await ad2.req('POST', '/api/auth/login', { email: 'ada2@test.local', password: 'ResetPass789', portal: 'admin' }); ok('sign in with the new password');
r = await new Client().req('POST', '/api/auth/reset-password', { token, newPassword: 'ResetPass000' }); assert.equal(r.status, 400); ok('reset link works only once');
// A User's request goes to the Admins.
r = await ad2.req('POST', '/api/admin/users', { name: 'Reset Tester', email: 'reset@test.local', password: 'ClientPass123' }); assert.equal(r.status, 201);
const resetUser = new Client(); await resetUser.req('POST', '/api/auth/login', { email: 'reset@test.local', password: 'ClientPass123', portal: 'user' });
r = await new Client().req('POST', '/api/auth/forgot-password', { email: 'reset@test.local' }); assert.equal(r.json.emailEnabled, false);
r = await new Client().req('POST', '/api/auth/forgot-password', { email: 'a@test.local' }); assert.equal(r.status, 200);
r = await ad2.req('GET', '/api/admin/password-requests'); assert.ok(!r.json.some((x: any) => x.email === 'reset@test.local' || x.email === 'a@test.local')); ok("a User's forgot-password request does not reach the Admins");
const resetId = (await ad2.req('GET', '/api/admin/users')).json.find((x: any) => x.email === 'reset@test.local').id;
r = await resetUser.req('GET', '/api/admin/password-requests'); assert.ok([401, 403].includes(r.status)); ok('Users cannot see password requests');
r = await ad2.req('POST', `/api/admin/password-requests/${resetId}/link`); assert.match(r.json.link, /reset-password\?token=/); ok('Admins keep their account tool to create a reset link');

r = await sa.req('POST', '/api/auth/logout', {});
r = await sa.req('GET', '/api/superadmin/stats'); assert.equal(r.status, 401); ok('logout ends session');

console.log(`\n${passed} checks passed.`);
