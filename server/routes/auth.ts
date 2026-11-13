import { Router } from 'express';
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
import { db, logActivity } from '../db.ts';
import { h, HttpError } from '../http.ts';

export const authRouter = Router();

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
