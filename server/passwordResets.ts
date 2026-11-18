// Password reset links and "I forgot my password" requests.
//
// A reset link is a one-hour, single-use token (only its SHA-256 hash is
// stored). It is emailed when SMTP is configured. When email cannot be sent,
// the request goes to the account's administrator instead — Users to the
// Admins, Admins to the Super Admin — who can create the same reset link and
// pass it on (e.g. by chat), or set a new password directly.

import crypto from 'node:crypto';
import { Router } from 'express';
import { db, logActivity, newId, now } from './db.ts';
import { h, HttpError } from './http.ts';
import { appUrl } from './mail.ts';
import { broadcast } from './live.ts';
import type { AuthedRequest } from './auth.ts';
import type { Role } from '../shared/types.ts';

export const RESET_TTL_MS = 60 * 60 * 1000;
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Creates a reset token for the account and returns the raw token (shown once). */
export async function createResetToken(userId: string): Promise<{ token: string; expiresAt: number }> {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  await db.run('DELETE FROM password_resets WHERE user_id = ? AND (used_at IS NOT NULL OR expires_at < ?)', [userId, t]);
  await db.run('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [sha256(token), userId, t, t + RESET_TTL_MS]);
  return { token, expiresAt: t + RESET_TTL_MS };
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
