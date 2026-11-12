import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, GUEST_ID, newId, now } from './db.ts';
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

export function getUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function authenticate(email: string, password: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim()) as UserRow | undefined;
  if (!row || row.id === GUEST_ID) {
    verifyPassword(password, DUMMY_HASH);
    return null;
  }
  if (!verifyPassword(password, row.password_hash)) return null;
  if (!row.active) return null;
  return row;
}

export function createUser(input: { email: string; name: string; password: string; role: Role; organisation?: string | null }): UserRow {
  const id = newId('usr_');
  db.prepare(
    'INSERT INTO users (id, email, name, password_hash, role, organisation, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
  ).run(id, input.email.trim(), input.name.trim(), hashPassword(input.password), input.role, input.organisation?.trim() || null, now());
  return getUserById(id)!;
}

// ---------------------------------------------------------------- sessions

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function isSecureRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true';
}

export function startSession(req: Request, res: Response, userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    userId,
    t,
    t + SESSION_TTL_MS
  );
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(t, userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export function endSession(req: Request, res: Response) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function endAllSessionsForUser(userId: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
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
  /** Set when the request is served as the public (no sign-in) client. */
  guest?: boolean;
  /** Anonymous per-browser id, used to keep public visitors' presets and history apart. */
  deviceId?: string;
}

const DEVICE_COOKIE = 'cg_device';

/**
 * Client-portal API requests without a client session are served as the
 * built-in public client (if the administrator has not deactivated it).
 * Each browser gets an anonymous device id so visitors only see their own
 * presets and batches.
 */
export function guestMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === 'client') return next();
  const guest = getUserById(GUEST_ID);
  if (!guest || !guest.active) {
    if (!req.user) return res.status(401).json({ error: 'Public access is turned off. Please sign in.' });
    return next();
  }
  let device = readCookie(req, DEVICE_COOKIE);
  if (!device || !/^[A-Za-z0-9_-]{20,64}$/.test(device)) {
    device = crypto.randomBytes(24).toString('base64url');
    res.cookie(DEVICE_COOKIE, device, { httpOnly: true, sameSite: 'lax', secure: isSecureRequest(req), maxAge: 365 * 86400000, path: '/' });
  }
  req.user = toPublicUser(guest);
  req.guest = true;
  req.deviceId = device;
  next();
}

/** Attaches req.user when a valid session cookie is present. */
export function sessionMiddleware(req: AuthedRequest, _res: Response, next: NextFunction) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const hash = sha256(token);
    const row = db
      .prepare('SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?')
      .get(hash) as (UserRow & { expires_at: number }) | undefined;
    if (row && row.expires_at > now() && row.active) {
      req.user = toPublicUser(row);
      req.sessionTokenHash = hash;
      // Sliding expiry: extend when less than half the lifetime remains.
      if (row.expires_at - now() < SESSION_TTL_MS / 2) {
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(now() + SESSION_TTL_MS, hash);
      }
    } else if (row) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
    }
  }
  next();
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

export function purgeExpiredSessions() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
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
