// End-to-end test of "Forgot password" with emailed verification codes.
//
// The server under test uses the real Resend SDK; RESEND_BASE_URL points it at
// the small receiver below, which plays the part of Resend's API and an inbox
// so the test can read the code exactly as a person would read the email.
//
// Run (see README → Testing):
//   OTP_CAPTURE_PORT=55498 SMOKE_DB_URL=postgresql://… SMOKE_SERVER_LOG=server.log \
//   node tests/otp-smoke.ts http://localhost:3996
// with the server started with RESEND_API_KEY=re_test RESEND_BASE_URL=http://localhost:55498

import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const BASE = process.argv[2] || 'http://localhost:3996';
const CAPTURE_PORT = Number(process.env.OTP_CAPTURE_PORT || 55498);
let passed = 0;
const ok = (m: string) => {
  passed++;
  console.log(`  ✓ ${m}`);
};

// ---------------------------------------------------------------- inbox (Resend API stand-in)
type Mail = { to: string; subject: string; html: string; text: string };
const inbox: Mail[] = [];
const receiver = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const m = JSON.parse(body || '{}');
    const to = Array.isArray(m.to) ? m.to[0] : m.to;
    if (String(to).startsWith('fail')) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ name: 'application_error', message: 'Simulated delivery failure', statusCode: 500 }));
    }
    inbox.push({ to, subject: m.subject, html: m.html, text: m.text });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: `email_${inbox.length}` }));
  });
});
await new Promise<void>((r) => receiver.listen(CAPTURE_PORT, r));
const mailsTo = (to: string) => inbox.filter((m) => m.to === to);
const codeIn = (m: Mail) => m.subject.match(/^(\d{6}) /)![1];
const lastCode = (to: string) => codeIn(mailsTo(to).at(-1)!);

const db = new pg.Client({ connectionString: process.env.SMOKE_DB_URL });
await db.connect();
const userId = async (email: string) => (await db.query('SELECT id FROM users WHERE lower(email) = $1', [email])).rows[0].id as string;
/** Lets the next "send code" through without waiting a minute. */
const skipCooldown = async (email: string) =>
  db.query("UPDATE password_resets SET created_at = created_at - 120000 WHERE user_id = $1 AND kind = 'otp'", [await userId(email)]);

class Client {
  jar = new Map<string, string>();
  async req(method: string, path: string, body?: any, portal?: string) {
    const headers: Record<string, string> = { 'x-requested-with': 'certigen', 'content-type': 'application/json' };
    if (portal) headers['x-portal'] = portal;
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of r.headers.getSetCookie()) {
      const [k, v] = c.split(';')[0].split('=');
      if (v) this.jar.set(k.trim(), v);
      else this.jar.delete(k.trim());
    }
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: r.status, json, text };
  }
}
const anon = () => new Client();

try {
  // ---------------------------------------------------------------- accounts
  const sa = new Client();
  let r = await sa.req('POST', '/api/auth/login', { email: 'admin@test.local', password: 'AdminPass123', portal: 'superadmin' });
  assert.equal(r.status, 200);
  await sa.req('POST', '/api/superadmin/admins', { name: 'OTP Admin', email: 'otpadmin@test.local', password: 'AdminPass456' });
  const ad = new Client();
  r = await ad.req('POST', '/api/auth/login', { email: 'otpadmin@test.local', password: 'AdminPass456', portal: 'admin' });
  assert.equal(r.status, 200);
  for (const [name, email] of [
    ['Pema', 'pema@test.local'],
    ['Karma', 'karma@test.local'],
    ['Sonam', 'sonam@test.local'],
    ['Fail', 'fail@test.local'],
  ]) {
    r = await ad.req('POST', '/api/admin/users', { name, email, password: 'ClientPass123' });
    assert.equal(r.status, 201);
  }

  // ---------------------------------------------------------------- 1. request a code
  r = await anon().req('POST', '/api/auth/forgot-password', { email: 'nobody@test.local' });
  assert.equal(r.status, 200);
  const generic = r.json.message;
  assert.equal(inbox.length, 0);
  ok('unknown email: same answer, no email sent');

  r = await anon().req('POST', '/api/auth/forgot-password', { email: 'Pema@Test.local' });
  assert.equal(r.status, 200);
  assert.equal(r.json.message, generic);
  assert.equal(r.json.emailEnabled, true);
  assert.equal(r.json.resendAfterSeconds, 60);
  assert.equal(mailsTo('pema@test.local').length, 1);
  ok('registered email: same answer, one email sent to the registered address');
  const code1 = lastCode('pema@test.local');
  assert.match(code1, /^\d{6}$/);
  assert.ok(!r.text.includes(code1));
  ok('six-digit code is in the email, never in the API response');
  const mail = mailsTo('pema@test.local')[0];
  assert.ok(mail.html.includes(code1) && mail.html.includes('5 minutes') && /never share/i.test(mail.html));
  ok('email shows the code, the 5-minute expiry and safety advice');

  const stored = await db.query("SELECT token_hash, expires_at - created_at AS ttl FROM password_resets WHERE user_id = $1 AND kind = 'otp'", [await userId('pema@test.local')]);
  assert.equal(stored.rows.length, 1);
  assert.notEqual(stored.rows[0].token_hash, code1);
  assert.ok(!String(stored.rows[0].token_hash).includes(code1));
  assert.equal(Number(stored.rows[0].ttl), 5 * 60 * 1000);
  ok('database stores only a hash of the code, expiring after 5 minutes');

  // ---------------------------------------------------------------- 2. resend cooldown
  r = await anon().req('POST', '/api/auth/forgot-password', { email: 'pema@test.local' });
  assert.equal(r.status, 200);
  assert.equal(mailsTo('pema@test.local').length, 1);
  ok('resend within the 60-second cooldown sends nothing');

  // ---------------------------------------------------------------- 3. verify
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'pema@test.local', code: 'abc' });
  assert.equal(r.status, 400);
  ok('non-numeric code rejected');
  const wrong = code1 === '000000' ? '000001' : '000000';
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'pema@test.local', code: wrong });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /wrong or has expired/);
  ok('wrong code rejected');
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'nobody@test.local', code: code1 });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /wrong or has expired/);
  ok('unknown email gets the same "wrong code" answer');
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'pema@test.local', code: code1 });
  assert.equal(r.status, 200);
  const resetToken = r.json.resetToken;
  assert.ok(resetToken && resetToken.length >= 40);
  ok('correct code accepted and exchanged for a reset token');
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'pema@test.local', code: code1 });
  assert.equal(r.status, 400);
  ok('a code works only once');

  // ---------------------------------------------------------------- 4. new password
  r = await anon().req('POST', '/api/auth/reset-password', { token: resetToken, newPassword: 'NewPema12345', confirmPassword: 'NewPema99999' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /do not match/);
  ok('passwords that do not match are rejected');
  r = await anon().req('POST', '/api/auth/reset-password', { token: resetToken, newPassword: 'short', confirmPassword: 'short' });
  assert.equal(r.status, 400);
  ok('weak password rejected');
  const pemaSession = new Client();
  await pemaSession.req('POST', '/api/auth/login', { email: 'pema@test.local', password: 'ClientPass123', portal: 'user' });
  r = await anon().req('POST', '/api/auth/reset-password', { token: resetToken, newPassword: 'NewPema12345', confirmPassword: 'NewPema12345' });
  assert.equal(r.status, 200);
  assert.equal(r.json.role, 'user');
  ok('password changed with the reset token');
  r = await anon().req('POST', '/api/auth/reset-password', { token: resetToken, newPassword: 'Another12345', confirmPassword: 'Another12345' });
  assert.equal(r.status, 400);
  ok('reset token works only once');
  r = await pemaSession.req('GET', '/api/user/templates');
  assert.equal(r.status, 401);
  ok('existing sessions were signed out');
  r = await anon().req('POST', '/api/auth/login', { email: 'pema@test.local', password: 'ClientPass123', portal: 'user' });
  assert.equal(r.status, 401);
  r = await anon().req('POST', '/api/auth/login', { email: 'pema@test.local', password: 'NewPema12345', portal: 'user' });
  assert.equal(r.status, 200);
  ok('old password no longer works; the new one signs in');

  // ---------------------------------------------------------------- 5. expiry and replacement
  await anon().req('POST', '/api/auth/forgot-password', { email: 'karma@test.local' });
  const karmaA = lastCode('karma@test.local');
  await db.query("UPDATE password_resets SET expires_at = $2 WHERE user_id = $1 AND kind = 'otp'", [await userId('karma@test.local'), Date.now() - 1000]);
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'karma@test.local', code: karmaA });
  assert.equal(r.status, 400);
  ok('expired code rejected');
  await skipCooldown('karma@test.local');
  await anon().req('POST', '/api/auth/forgot-password', { email: 'karma@test.local' });
  const karmaB = lastCode('karma@test.local');
  await skipCooldown('karma@test.local');
  await anon().req('POST', '/api/auth/forgot-password', { email: 'karma@test.local' });
  const karmaC = lastCode('karma@test.local');
  assert.equal(mailsTo('karma@test.local').length, 3);
  ok('resend after the cooldown sends a fresh code');
  const otpRows = await db.query("SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND kind = 'otp'", [await userId('karma@test.local')]);
  assert.equal(otpRows.rows[0].n, 1);
  if (karmaB !== karmaC) {
    r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'karma@test.local', code: karmaB });
    assert.equal(r.status, 400);
  }
  ok('a new code replaces the previous one');
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'karma@test.local', code: karmaC });
  assert.equal(r.status, 200);
  ok('latest code accepted');

  // ---------------------------------------------------------------- 6. brute force
  await anon().req('POST', '/api/auth/forgot-password', { email: 'sonam@test.local' });
  const sonam = lastCode('sonam@test.local');
  const bad = sonam === '111111' ? '222222' : '111111';
  for (let i = 1; i <= 4; i++) {
    r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'sonam@test.local', code: bad });
    assert.equal(r.status, 400);
  }
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'sonam@test.local', code: bad });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /Too many wrong codes/);
  ok('5 wrong codes lock the code');
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'sonam@test.local', code: sonam });
  assert.equal(r.status, 400);
  ok('after the lock even the right code is refused');
  for (let i = 0; i < 4; i++) await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'sonam@test.local', code: bad });
  r = await anon().req('POST', '/api/auth/forgot-password/verify', { email: 'sonam@test.local', code: bad });
  assert.equal(r.status, 429);
  ok('too many tries for one email are rate-limited');

  // ---------------------------------------------------------------- 7. delivery failure
  r = await anon().req('POST', '/api/auth/forgot-password', { email: 'fail@test.local' });
  assert.equal(r.status, 200);
  assert.equal(r.json.message, generic);
  const failRows = await db.query("SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND kind = 'otp'", [await userId('fail@test.local')]);
  assert.equal(failRows.rows[0].n, 0);
  ok('delivery failure: same answer, the unsent code is discarded');
  r = await ad.req('GET', '/api/admin/password-requests');
  assert.ok(r.json.some((x: any) => x.email === 'fail@test.local'));
  ok('delivery failure: the Admin is asked to help instead');

  // ---------------------------------------------------------------- 8. codes never in logs
  if (process.env.SMOKE_SERVER_LOG) {
    const log = readFileSync(process.env.SMOKE_SERVER_LOG, 'utf8');
    for (const m of inbox) assert.ok(!log.includes(codeIn(m)), 'a code appeared in the server log');
    ok('no code appears in the server log');
  }

  console.log(`\n${passed} checks passed.`);
} finally {
  await db.end();
  receiver.close();
}
