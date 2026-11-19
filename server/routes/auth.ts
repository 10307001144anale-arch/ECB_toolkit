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
import { db, logActivity, now, tx } from '../db.ts';
import { saveFile, deleteFileRecord } from '../files.ts';
import { mailConfigured, otpEmail, sendMail } from '../mail.ts';
import { discardOtp, issueOtp, openHelpRequest, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS, otpCooldownLeft, resolveHelpRequests, RESET_TTL_MS, sha256, verifyOtp } from '../passwordResets.ts';
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

const RATE_WINDOW_MS = 15 * 60 * 1000;
const verifyRequests = new Map<string, number[]>();
/** At most `max` verification tries per key in 15 minutes (on top of 5 wrong tries per code). */
function verifyAllowed(key: string, max: number): boolean {
  const t = Date.now();
  const recent = (verifyRequests.get(key) || []).filter((x) => t - x < RATE_WINDOW_MS);
  if (recent.length >= max) return false;
  recent.push(t);
  verifyRequests.set(key, recent);
  return true;
}

const CODE_MINUTES = OTP_TTL_MS / 60000;
const RESEND_SECONDS = OTP_RESEND_COOLDOWN_MS / 1000;

/**
 * Step 1 (and "Resend code"): emails a six-digit verification code to the
 * account. When this server cannot send email, the request goes to the
 * account's administrator instead (Users → Admins, Admins → Super Admin).
 * The answer is always the same, so it never reveals which emails have accounts.
 */
authRouter.post(
  '/forgot-password',
  h(async (req: AuthedRequest, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 200) throw new HttpError(400, 'Enter a valid email address.');
    if (!resetAllowed(`ip|${req.ip}`, 10)) throw new HttpError(429, 'Too many requests. Try again later.');
    // emailEnabled says only whether this server can send email at all — never whether the account exists.
    const emailEnabled = mailConfigured();
    const done = {
      ok: true,
      emailEnabled,
      codeMinutes: CODE_MINUTES,
      resendAfterSeconds: RESEND_SECONDS,
      message: emailEnabled
        ? `If an account uses this email, we have sent it a 6-digit verification code. The code expires in ${CODE_MINUTES} minutes.`
        : 'If an account uses this email, your administrator has been asked to help you reset the password.',
    };
    const user = (await db.one<any>('SELECT * FROM users WHERE lower(email) = ?', [email])) as any;
    if (!user || !user.active || user.password_hash === 'disabled') return res.json(done);
    // Resend cooldown and an hourly cap per account; silent, like an unknown email.
    if ((await otpCooldownLeft(user.id)) > 0 || !resetAllowed(`email|${email}`, 5)) return res.json(done);
    await logActivity(user.id, 'password_reset_requested', '');
    if (!emailEnabled) {
      await openHelpRequest(user.id, user.role);
      return res.json(done);
    }
    const { code } = await issueOtp(user.id);
    const mail = otpEmail(user.name, code, CODE_MINUTES);
    const sent = await sendMail(user.email, mail.subject, mail.text, mail.html);
    if (!sent) {
      // Delivery failed (wrong API key, unverified sender, provider down): the code is
      // thrown away and the administrator is asked to help instead.
      await discardOtp(user.id);
      await openHelpRequest(user.id, user.role);
      await logActivity(user.id, 'password_code_failed', '');
    }
    res.json(done);
  })
);

/** Step 2: checks the code and, when it is right, hands out a 10-minute reset token. */
authRouter.post(
  '/forgot-password/verify',
  h(async (req: AuthedRequest, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\s+/g, '');
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter the 6-digit code from the email.');
    if (!verifyAllowed(`ip|${req.ip}`, 30) || !verifyAllowed(`email|${email}`, 10)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes, then ask for a new code.');
    const user = (await db.one<any>('SELECT id, role, active, password_hash FROM users WHERE lower(email) = ?', [email])) as any;
    const wrong = 'This code is wrong or has expired. Check the latest email, or ask for a new code.';
    if (!user || !user.active || user.password_hash === 'disabled') throw new HttpError(400, wrong);
    const r = await verifyOtp(user.id, code);
    if (!r.ok) throw new HttpError(400, r.reason === 'locked' ? 'Too many wrong codes. Ask for a new code.' : wrong);
    await logActivity(user.id, 'password_code_verified', '');
    res.json({ ok: true, resetToken: r.resetToken, expiresAt: r.expiresAt, role: user.role });
  })
);

/** Checks a reset token or administrator link before the new-password form is shown. */
authRouter.get(
  '/reset-password/:token',
  h(async (req, res) => {
    const row = await db.one<{ expires_at: number; used_at: number | null; role: string }>(
      "SELECT r.expires_at, r.used_at, u.role FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.kind IN ('link', 'reset')",
      [sha256(req.params.token)]
    );
    const valid = !!row && !row.used_at && row.expires_at > now();
    res.json({ valid, role: valid ? row!.role : null });
  })
);

/** Step 3: sets the new password with a reset token (after the code) or an administrator link. */
authRouter.post(
  '/reset-password',
  h(async (req, res) => {
    const token = String(req.body?.token || '');
    const next = String(req.body?.newPassword || '');
    const confirm = req.body?.confirmPassword;
    if (confirm !== undefined && String(confirm) !== next) throw new HttpError(400, 'The passwords do not match.');
    const problem = passwordProblem(next);
    if (problem) throw new HttpError(400, problem);
    const user = await tx(async (q) => {
      // Lock the token so it can be used only once, even with two requests at the same time.
      const row = token
        ? await q.one<{ user_id: string; expires_at: number; used_at: number | null }>(
            "SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ? AND kind IN ('link', 'reset') FOR UPDATE",
            [sha256(token)]
          )
        : undefined;
      if (!row || row.used_at || Number(row.expires_at) <= now()) throw new HttpError(400, 'This reset link or session has expired or was already used. Start again to get a new code.');
      const u = await q.one<{ id: string; role: string; active: number }>('SELECT id, role, active FROM users WHERE id = ?', [row.user_id]);
      if (!u || !u.active) throw new HttpError(400, 'This account is deactivated. Contact your administrator.');
      await q.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(next), now(), u.id]);
      // Every code, token and link of the account stops working.
      await q.run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', [now(), u.id]);
      return u;
    });
    await resolveHelpRequests(user.id, user.id);
    await endAllSessionsForUser(user.id);
    await logActivity(user.id, 'password_reset', '');
    res.json({ ok: true, role: user.role });
  })
);
