import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, newId, now } from './db.ts';
import type { PublicUser, Role } from '../shared/types.ts';

const SESSION_COOKIE = 'cg_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;

// ---------------------------------------------------------------- passwords

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length < 10) return 'Password must be at least 10 characters.';
  if (password.length > 200) return 'Password is too long.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain letters and numbers.';
  return null;
}

// Dummy hash so failed logins for unknown emails take the same time.
const DUMMY_HASH = hashPassword('dummy-password-0');

// ---------------------------------------------------------------- users

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: Role;
  organisation: string | null;
  active: number;
  created_at: number;
  last_login_at: number | null;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    organisation: row.organisation,
    active: !!row.active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function getUserById(id: string): Promise<UserRow | undefined> {
  return db.one<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  return db.one<UserRow>('SELECT * FROM users WHERE lower(email) = lower(?)', [String(email || '').trim()]);
}

export async function authenticate(email: string, password: string): Promise<UserRow | null> {
  const row = await getUserByEmail(email);
  if (!row || row.password_hash === 'disabled') {
    verifyPassword(password, DUMMY_HASH);
    return null;
  }
  if (!verifyPassword(password, row.password_hash)) return null;
  if (!row.active) return null;
  return row;
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
  role: Role;
  organisation?: string | null;
  createdBy?: string | null;
}): Promise<UserRow> {
  const id = newId('usr_');
  await db.run(
    'INSERT INTO users (id, email, name, password_hash, role, organisation, active, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
    [id, input.email.trim().toLowerCase(), input.name.trim(), hashPassword(input.password), input.role, input.organisation?.trim() || null, now(), now(), input.createdBy || null]
  );
  return (await getUserById(id))!;
}

// ---------------------------------------------------------------- sessions

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function isSecureRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true';
}

export async function startSession(req: Request, res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  await db.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [sha256(token), userId, t, t + SESSION_TTL_MS]);
  await db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [t, userId]);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export async function endSession(req: Request, res: Response) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function endAllSessionsForUser(userId: string) {
  await db.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export interface AuthedRequest extends Request {
  user?: PublicUser;
  sessionTokenHash?: string;
}

/** Attaches req.user when a valid session cookie is present. */
export function sessionMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return next();
  const hash = sha256(token);
  (async () => {
    const row = await db.one<UserRow & { expires_at: number }>(
      'SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
      [hash]
    );
    if (row && row.expires_at > now() && row.active) {
      req.user = toPublicUser(row);
      req.sessionTokenHash = hash;
      // Sliding expiry: extend when less than half the lifetime remains.
      if (row.expires_at - now() < SESSION_TTL_MS / 2) {
        await db.run('UPDATE sessions SET expires_at = ? WHERE token_hash = ?', [now() + SESSION_TTL_MS, hash]);
      }
    } else if (row) {
      await db.run('DELETE FROM sessions WHERE token_hash = ?', [hash]);
    }
  })().then(() => next(), next);
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  next();
}

export function requireRole(role: Role) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
    if (req.user.role !== role) return res.status(403).json({ error: 'You do not have access to this area.' });
    next();
  };
}

export async function purgeExpiredSessions() {
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [now()]);
}

// ---------------------------------------------------------------- login throttling

const attempts = new Map<string, { count: number; first: number; lockedUntil: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export function loginThrottle(key: string): { allowed: boolean; retryAfterSec: number } {
  const t = now();
  const a = attempts.get(key);
  if (a && a.lockedUntil > t) return { allowed: false, retryAfterSec: Math.ceil((a.lockedUntil - t) / 1000) };
  return { allowed: true, retryAfterSec: 0 };
}

export function recordLoginFailure(key: string) {
  const t = now();
  const a = attempts.get(key);
  if (!a || t - a.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: t, lockedUntil: 0 });
    return;
  }
  a.count++;
  if (a.count >= MAX_ATTEMPTS) a.lockedUntil = t + WINDOW_MS;
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
