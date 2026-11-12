import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Wraps an async route so thrown errors reach the error handler. */
export function h(fn: (req: any, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
  };
}

/**
 * CSRF protection for cookie-authenticated APIs: state-changing requests must
 * carry a custom header, which browsers never attach to cross-site form posts.
 * Combined with SameSite=Lax cookies this blocks cross-site request forgery.
 */
export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.headers['x-requested-with'] !== 'certigen') {
    return res.status(403).json({ error: 'Request blocked (missing CSRF header).' });
  }
  next();
}

export function securityHeaders(isProd: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          "img-src 'self' data: blob:",
          // Fonts for PDF embedding are fetched from jsDelivr.
          "connect-src 'self' https://cdn.jsdelivr.net",
          "worker-src 'self' blob:",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self' https://login.microsoftonline.com https://accounts.google.com",
        ].join('; ')
      );
      res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    }
    next();
  };
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The uploaded file is too large.' });
  }
  // Log only the message and stack, never request bodies (they may contain personal data).
  console.error('[error]', err?.message || err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
}

export function requireString(v: unknown, field: string, max = 200): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} is required.`);
  if (v.length > max) throw new HttpError(400, `${field} is too long.`);
  return v.trim();
}

export function optionalString(v: unknown, max = 500): string {
  if (v == null) return '';
  if (typeof v !== 'string') throw new HttpError(400, 'Invalid text value.');
  return v.slice(0, max).trim();
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 200;
}
