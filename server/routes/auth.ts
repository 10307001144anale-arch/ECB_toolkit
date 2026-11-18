import express, { Router } from 'express';
import {
  authenticate,
  clearLoginFailures,
  endAllSessionsForUser,
  endSession,
  getUserById,
  hashPassword,
  loginThrottle,
  passwordProblem,
  recordLoginFailure,
  requireAuth,
  startSession,
  toPublicUser,
  verifyPassword,
  type AuthedRequest,
} from '../auth.ts';
import { db, logActivity, now } from '../db.ts';
import { saveFile, deleteFileRecord } from '../files.ts';
import { appUrl, mailConfigured, sendMail } from '../mail.ts';
import { createResetToken, openHelpRequest, resolveHelpRequests, RESET_TTL_MS, sha256 } from '../passwordResets.ts';
import { h, HttpError } from '../http.ts';

export const authRouter = Router();

const PORTAL_NAMES = { superadmin: 'Super Admin', admin: 'Admin', user: 'User' } as const;
const PORTAL_LOGIN = { superadmin: '/superadmin/login', admin: '/admin/login', user: '/login' } as const;

authRouter.post(
  '/login',
  h(async (req: AuthedRequest, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const throttleKey = `${req.ip}|${email}`;
    const t = loginThrottle(throttleKey);
    if (!t.allowed) {
      throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil(t.retryAfterSec / 60)} minutes.`);
    }
    if (!email || !password) throw new HttpError(400, 'Enter your email and password.');
    const user = await authenticate(email, password);
    if (!user) {
      recordLoginFailure(throttleKey);
      throw new HttpError(401, 'Incorrect email or password, or the account is deactivated.');
    }
    clearLoginFailures(throttleKey);
    // Each portal has its own sign-in page; an account can only sign in to its own portal.
    const portal = req.body?.portal;
    if (portal && ['superadmin', 'admin', 'user'].includes(portal) && portal !== user.role) {
      throw new HttpError(403, `This account belongs to the ${PORTAL_NAMES[user.role]} portal. Sign in at ${PORTAL_LOGIN[user.role]}.`);
    }
    await startSession(req, res, user.id);
    await logActivity(user.id, 'login', '');
    res.json({ user: toPublicUser(user) });
  })
);

authRouter.post(
  '/logout',
  h(async (req, res) => {
    await endSession(req, res);
    res.json({ ok: true });
  })
);

authRouter.get('/me', (req: AuthedRequest, res) => {
  res.json({ user: req.user || null });
});

authRouter.post(
  '/change-password',
  requireAuth,
  h(async (req: AuthedRequest, res) => {
    const current = String(req.body?.currentPassword || '');
    const next = String(req.body?.newPassword || '');
    const row = (await getUserById(req.user!.id))!;
    if (!verifyPassword(current, row.password_hash)) throw new HttpError(400, 'Your current password is incorrect.');
    const problem = passwordProblem(next);
    if (problem) throw new HttpError(400, problem);
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(next), Date.now(), row.id]);
    await endAllSessionsForUser(row.id);
    await startSession(req, res, row.id);
    await logActivity(row.id, 'password_changed', '');
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ profile

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Change display name. */
authRouter.put(
  '/profile',
  requireAuth,
  h(async (req: AuthedRequest, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new HttpError(400, 'Enter your name.');
    if (name.length > 120) throw new HttpError(400, 'The name is too long.');
    await db.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [name, now(), req.user!.id]);
    await logActivity(req.user!.id, 'profile_updated', '');
    res.json({ user: toPublicUser((await getUserById(req.user!.id))!) });
  })
);

/** Change sign-in email; the current password is required. */
authRouter.post(
  '/change-email',
  requireAuth,
  h(async (req: AuthedRequest, res) => {
    const email = String(req.body?.newEmail || '').trim().toLowerCase();
    const current = String(req.body?.currentPassword || '');
    const row = (await getUserById(req.user!.id))!;
    if (!verifyPassword(current, row.password_hash)) throw new HttpError(400, 'Your current password is incorrect.');
    if (!EMAIL_RE.test(email) || email.length > 200) throw new HttpError(400, 'Enter a valid email address.');
    if (email === row.email.toLowerCase()) throw new HttpError(400, 'This is already your email address.');
    if (await db.one('SELECT 1 FROM users WHERE lower(email) = ? AND id <> ?', [email, row.id])) throw new HttpError(409, 'Another account already uses this email address.');
    await db.run('UPDATE users SET email = ?, updated_at = ? WHERE id = ?', [email, now(), row.id]);
    await logActivity(row.id, 'email_changed', `${row.email} → ${email}`);
    res.json({ user: toPublicUser((await getUserById(row.id))!) });
  })
);

/** Upload (or replace) the profile photo: PNG or JPG, up to 3 MB. */
authRouter.post(
  '/avatar',
  requireAuth,
  express.raw({ type: () => true, limit: '4mb' }),
  h(async (req: AuthedRequest, res) => {
    const saved = await saveFile(req.body as Buffer, 'avatar', req.user!.id, 'profile-photo', {});
    const old = (await getUserById(req.user!.id))!.avatar_file_id;
    await db.run('UPDATE users SET avatar_file_id = ?, updated_at = ? WHERE id = ?', [saved.id, now(), req.user!.id]);
    if (old) await deleteFileRecord(old).catch(() => {});
    res.json({ user: toPublicUser((await getUserById(req.user!.id))!) });
  })
);

authRouter.delete(
  '/avatar',
  requireAuth,
  h(async (req: AuthedRequest, res) => {
    const old = (await getUserById(req.user!.id))!.avatar_file_id;
    await db.run('UPDATE users SET avatar_file_id = NULL, updated_at = ? WHERE id = ?', [now(), req.user!.id]);
    if (old) await deleteFileRecord(old).catch(() => {});
    res.json({ user: toPublicUser((await getUserById(req.user!.id))!) });
  })
);

// ------------------------------------------------------------------ forgot password

const resetRequests = new Map<string, number[]>();
/** At most `max` requests per key in the last hour. */
function resetAllowed(key: string, max: number): boolean {
  const t = Date.now();
  const recent = (resetRequests.get(key) || []).filter((x) => t - x < RESET_TTL_MS);
  if (recent.length >= max) return false;
  recent.push(t);
  resetRequests.set(key, recent);
  return true;
}

/**
 * Emails a one-hour reset link. When this server cannot send email, the request
 * goes to the account's administrator instead (Users → Admins, Admins → Super
 * Admin). Always answers the same way, so it never reveals which emails have accounts.
 */
authRouter.post(
  '/forgot-password',
  h(async (req: AuthedRequest, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (!resetAllowed(`ip|${req.ip}`, 10)) throw new HttpError(429, 'Too many requests. Try again later.');
    // emailEnabled says only whether this server can send email at all — never whether the account exists.
    const emailEnabled = mailConfigured();
    const done = {
      ok: true,
      emailEnabled,
      message: emailEnabled
        ? 'If an account uses this email, a link to reset the password has been sent to it. The link works for one hour.'
        : 'If an account uses this email, your administrator has been asked to help you reset the password.',
    };
    const user = (await db.one<any>('SELECT * FROM users WHERE lower(email) = ?', [email])) as any;
    if (!user || !user.active || user.password_hash === 'disabled' || !resetAllowed(`email|${email}`, 3)) return res.json(done);
    await logActivity(user.id, 'password_reset_requested', '');
    const base = appUrl(req);
    if (!emailEnabled || !base) {
      if (!base) console.warn('[mail] APP_URL is not set; cannot build a password reset link.');
      await openHelpRequest(user.id, user.role);
      return res.json(done);
    }
    const { token } = await createResetToken(user.id);
    const link = `${base}/reset-password?token=${token}`;
    const sent = await sendMail(
      user.email,
      'Reset your CertiGen password',
      `Hello ${user.name},\n\nSomeone asked to reset the password of your CertiGen (Election Commission of Bhutan) account.\nOpen this link within one hour to choose a new password:\n\n${link}\n\nIf you did not ask for this, ignore this email; your password stays the same.`,
      `<p>Hello ${escapeHtml(user.name)},</p><p>Someone asked to reset the password of your CertiGen (Election Commission of Bhutan) account. Open this link within one hour to choose a new password:</p><p><a href="${link}">Reset my password</a></p><p>If you did not ask for this, ignore this email; your password stays the same.</p>`
    );
    // Sending failed (wrong SMTP settings, mail server down): let the administrator help.
    if (!sent) await openHelpRequest(user.id, user.role);
    res.json(done);
  })
);

/** Checks a reset link before the form is shown. */
authRouter.get(
  '/reset-password/:token',
  h(async (req, res) => {
    const row = await db.one<{ expires_at: number; used_at: number | null; role: string }>(
      'SELECT r.expires_at, r.used_at, u.role FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?',
      [sha256(req.params.token)]
    );
    const valid = !!row && !row.used_at && row.expires_at > now();
    res.json({ valid, role: valid ? row!.role : null });
  })
);

authRouter.post(
  '/reset-password',
  h(async (req, res) => {
    const token = String(req.body?.token || '');
    const next = String(req.body?.newPassword || '');
    const row = token ? await db.one<{ user_id: string; expires_at: number; used_at: number | null }>('SELECT * FROM password_resets WHERE token_hash = ?', [sha256(token)]) : undefined;
    if (!row || row.used_at || row.expires_at <= now()) throw new HttpError(400, 'This reset link has expired or was already used. Ask for a new one.');
    const problem = passwordProblem(next);
    if (problem) throw new HttpError(400, problem);
    const user = await getUserById(row.user_id);
    if (!user || !user.active) throw new HttpError(400, 'This account is deactivated. Contact your administrator.');
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(next), now(), user.id]);
    await db.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [now(), user.id]);
    await resolveHelpRequests(user.id, user.id);
    await endAllSessionsForUser(user.id);
    await logActivity(user.id, 'password_reset', '');
    res.json({ ok: true, role: user.role });
  })
);

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
