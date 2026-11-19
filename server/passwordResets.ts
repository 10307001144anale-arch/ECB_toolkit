// Password recovery: emailed verification codes, reset tokens, administrator
// reset links and "I forgot my password" requests. All live in password_resets:
//
//   kind 'otp'   — six-digit code sent by email; only a keyed hash is stored;
//                  5 minutes, single use, 5 wrong tries, a new code replaces the old.
//   kind 'reset' — random token given out after the code is verified; 10 minutes,
//                  single use; lets the person choose a new password.
//   kind 'link'  — one-hour reset link an administrator creates and passes on.
//
// When email cannot be sent, the request goes to the account's administrator
// instead — Users to the Admins, Admins to the Super Admin.

import crypto from 'node:crypto';
import { Router } from 'express';
import { db, logActivity, newId, now, tx } from './db.ts';
import { keyedHash } from './secret.ts';
import { h, HttpError } from './http.ts';
import { appUrl } from './mail.ts';
import { broadcast } from './live.ts';
import type { AuthedRequest } from './auth.ts';
import type { Role } from '../shared/types.ts';

export const RESET_TTL_MS = 60 * 60 * 1000;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const otpHash = (userId: string, code: string) => keyedHash('password-otp', `${userId}:${code}`);

/** Creates an administrator reset link token (one hour) and returns the raw token (shown once). */
export async function createResetToken(userId: string, kind: 'link' | 'reset' = 'link'): Promise<{ token: string; expiresAt: number }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  const ttl = kind === 'reset' ? RESET_TOKEN_TTL_MS : RESET_TTL_MS;
  await db.run('DELETE FROM password_resets WHERE user_id = ? AND (used_at IS NOT NULL OR expires_at < ?)', [userId, t]);
  await db.run('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at, kind) VALUES (?, ?, ?, ?, ?)', [sha256(token), userId, t, t + ttl, kind]);
  return { token, expiresAt: t + ttl };
}

/** Milliseconds until another code may be sent to this account (0 = now). */
export async function otpCooldownLeft(userId: string): Promise<number> {
  const last = await db.one<{ created_at: number }>("SELECT max(created_at) AS created_at FROM password_resets WHERE user_id = ? AND kind = 'otp'", [userId]);
  const at = Number(last?.created_at || 0);
  return Math.max(0, at + OTP_RESEND_COOLDOWN_MS - now());
}

/**
 * Creates a new six-digit code (crypto.randomInt, uniform 000000–999999). Every
 * earlier code and unused reset token of the account stops working.
 */
export async function issueOtp(userId: string): Promise<{ code: string; expiresAt: number }> {
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const t = now();
  await tx(async (q) => {
    await q.run("DELETE FROM password_resets WHERE user_id = ? AND kind = 'otp'", [userId]);
    await q.run("UPDATE password_resets SET used_at = ? WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL", [t, userId]);
    await q.run("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at, kind, attempts) VALUES (?, ?, ?, ?, 'otp', 0)", [
      otpHash(userId, code),
      userId,
      t,
      t + OTP_TTL_MS,
    ]);
  });
  return { code, expiresAt: t + OTP_TTL_MS };
}

/** Removes a code that could not be emailed. */
export async function discardOtp(userId: string) {
  await db.run("DELETE FROM password_resets WHERE user_id = ? AND kind = 'otp'", [userId]);
}

export type OtpResult = { ok: true; resetToken: string; expiresAt: number } | { ok: false; reason: 'invalid' | 'locked' };

/**
 * Checks a code. The row is locked while it is checked, so parallel guesses
 * cannot get around the attempt limit. A correct code is used up at once and
 * exchanged for a short-lived reset token; too many wrong codes end the code.
 */
export async function verifyOtp(userId: string, code: string): Promise<OtpResult> {
  const t = now();
  const result = await tx(async (q): Promise<OtpResult> => {
    const row = await q.one<{ token_hash: string; attempts: number; expires_at: number; used_at: number | null }>(
      "SELECT token_hash, attempts, expires_at, used_at FROM password_resets WHERE user_id = ? AND kind = 'otp' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [userId]
    );
    if (!row || row.used_at || Number(row.expires_at) <= t || row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'invalid' };
    const expected = Buffer.from(row.token_hash, 'hex');
    const given = Buffer.from(otpHash(userId, code), 'hex');
    if (!crypto.timingSafeEqual(expected, given)) {
      const attempts = row.attempts + 1;
      await q.run('UPDATE password_resets SET attempts = ?, used_at = ? WHERE token_hash = ?', [attempts, attempts >= OTP_MAX_ATTEMPTS ? t : null, row.token_hash]);
      return { ok: false, reason: attempts >= OTP_MAX_ATTEMPTS ? 'locked' : 'invalid' };
    }
    await q.run('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', [t, row.token_hash]);
    return { ok: true, resetToken: '', expiresAt: 0 };
  });
  if (!result.ok) return result;
  const { token, expiresAt } = await createResetToken(userId, 'reset');
  return { ok: true, resetToken: token, expiresAt };
}

/** Records that the account asked for help (once while a request is open) and tells its administrators. */
export async function openHelpRequest(userId: string, role: Role) {
  if (role === 'superadmin') return;
  const open = await db.one('SELECT 1 FROM password_help_requests WHERE user_id = ? AND resolved_at IS NULL', [userId]);
  if (!open) await db.run('INSERT INTO password_help_requests (id, user_id, created_at) VALUES (?, ?, ?)', [newId('pwh_'), userId, now()]);
  broadcast([role === 'user' ? 'users' : 'admins']);
}

export async function resolveHelpRequests(userId: string, byUserId: string) {
  await db.run('UPDATE password_help_requests SET resolved_at = ?, resolved_by = ? WHERE user_id = ? AND resolved_at IS NULL', [now(), byUserId, userId]);
}

export interface PasswordHelpRequest {
  id: string;
  userId: string;
  name: string;
  email: string;
  createdAt: number;
}

/**
 * Routes for the administrator of `target` accounts (Admins → Users,
 * Super Admin → Admins): list open requests, create a reset link, dismiss.
 */
export function passwordHelpRoutes(router: Router, target: 'user' | 'admin') {
  const mustTarget = async (id: string) => {
    const u = await db.one<{ id: string; name: string; role: Role; active: number; password_hash: string }>('SELECT id, name, role, active, password_hash FROM users WHERE id = ?', [id]);
    if (!u || u.role !== target || u.password_hash === 'disabled') throw new HttpError(404, 'Account not found.');
    return u;
  };

  router.get(
    '/password-requests',
    h(async (_req, res) => {
      const rows = await db.all<any>(
        `SELECT r.id, r.user_id, r.created_at, u.name, u.email FROM password_help_requests r JOIN users u ON u.id = r.user_id
          WHERE r.resolved_at IS NULL AND u.role = ? AND u.active = 1 ORDER BY r.created_at DESC`,
        [target]
      );
      res.json(rows.map((r): PasswordHelpRequest => ({ id: r.id, userId: r.user_id, name: r.name, email: r.email, createdAt: Number(r.created_at) })));
    })
  );

  /** A one-hour reset link to send to the person; they choose their own password. */
  router.post(
    '/password-requests/:userId/link',
    h(async (req: AuthedRequest, res) => {
      const u = await mustTarget(req.params.userId);
      if (!u.active) throw new HttpError(400, 'This account is deactivated. Activate it first.');
      const base = appUrl(req);
      if (!base) throw new HttpError(500, 'APP_URL is not set on the server, so a link cannot be created.');
      const { token, expiresAt } = await createResetToken(u.id);
      await resolveHelpRequests(u.id, req.user!.id);
      await logActivity(req.user!.id, 'password_link_created', u.name);
      broadcast([target === 'user' ? 'users' : 'admins']);
      res.json({ link: `${base}/reset-password?token=${token}`, expiresAt });
    })
  );

  router.post(
    '/password-requests/:userId/dismiss',
    h(async (req: AuthedRequest, res) => {
      const u = await mustTarget(req.params.userId);
      await resolveHelpRequests(u.id, req.user!.id);
      broadcast([target === 'user' ? 'users' : 'admins']);
      res.json({ ok: true });
    })
  );
}
