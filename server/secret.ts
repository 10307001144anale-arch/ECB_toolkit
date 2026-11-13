import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));

/**
 * Server secret used to encrypt stored OAuth tokens. Set APP_SECRET in
 * production; in development a random key is created in data/secret.key (local only).
 */
function loadSecret(): Buffer {
  const env = process.env.APP_SECRET;
  if (env && env.length >= 32) return crypto.createHash('sha256').update(env).digest();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_SECRET must be set (at least 32 characters) in production.');
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return crypto.createHash('sha256').update(fs.readFileSync(file, 'utf8').trim()).digest();
}

const KEY = loadSecret();

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function decrypt(token: string): string {
  const [iv, tag, data] = token.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
