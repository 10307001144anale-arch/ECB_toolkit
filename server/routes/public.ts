import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../auth.ts';
import { db } from '../db.ts';
import { h, HttpError } from '../http.ts';
import { canReadFile, getFileMeta, readFileStream } from '../files.ts';
import { msConfigured } from './microsoft.ts';
import type { VerificationResult } from '../../shared/types.ts';

export const publicRouter = Router();

publicRouter.get('/config', (_req, res) => {
  res.json({
    appUrl: (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '') || null,
    microsoftConfigured: msConfigured(),
    aiDetectionAvailable: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    issuerName: process.env.ISSUER_NAME || null,
  });
});

/** Public certificate verification. Returns only what is needed to confirm authenticity. */
publicRouter.get(
  '/verify/:id',
  h(async (req, res) => {
    const id = String(req.params.id || '').trim().toUpperCase();
    const empty: VerificationResult = {
      valid: false,
      status: 'not_found',
      certificateId: id,
      recipientName: null,
      templateTitle: null,
      batchName: null,
      issuer: null,
      issuedAt: null,
    };
    if (!/^CG-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id)) return res.json(empty);
    const r = db
      .prepare(
        `SELECT c.id, c.status, c.recipient_name, c.issued_at, b.name AS batch_name, t.title AS template_title,
                u.organisation, u.name AS client_name
           FROM certificates c JOIN batches b ON b.id = c.batch_id
           JOIN templates t ON t.id = b.template_id JOIN users u ON u.id = b.client_id
          WHERE c.id = ?`
      )
      .get(id) as any;
    if (!r || r.status === 'pending') return res.json(empty);
    const result: VerificationResult = {
      valid: r.status === 'valid',
      status: r.status,
      certificateId: r.id,
      recipientName: r.status === 'valid' ? r.recipient_name : null,
      templateTitle: r.template_title,
      batchName: r.batch_name,
      issuer: r.organisation || r.client_name,
      issuedAt: r.issued_at,
    };
    res.setHeader('Cache-Control', 'no-store');
    res.json(result);
  })
);

export const filesRouter = Router();

/** Authenticated file download (artwork, previews, signatures, fonts). */
filesRouter.get(
  '/files/:id',
  requireAuth,
  h(async (req: AuthedRequest, res) => {
    const meta = getFileMeta(req.params.id);
    if (!meta || !canReadFile(req.user!, meta.id)) throw new HttpError(404, 'File not found.');
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Length', String(meta.size));
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('Content-Disposition', 'inline');
    readFileStream(meta.id).pipe(res);
  })
);
