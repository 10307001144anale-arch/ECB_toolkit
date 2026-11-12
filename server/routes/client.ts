import { Router } from 'express';
import crypto from 'node:crypto';
import { requireRole, type AuthedRequest } from '../auth.ts';
import { db, logActivity, newId, now, tx } from '../db.ts';
import { h, HttpError, requireString } from '../http.ts';
import { clientTemplates, getTemplateRow, getVersionRow, sanitizeContent, sanitizeMapping } from '../templates.ts';
import type { BatchRecord, BatchStatus, ContentPreset } from '../../shared/types.ts';

export const clientRouter = Router();
clientRouter.use(requireRole('client'));

// ------------------------------------------------------------------ templates

clientRouter.get(
  '/templates',
  h(async (req: AuthedRequest, res) => {
    res.json(clientTemplates(req.user!));
  })
);

clientRouter.get(
  '/templates/:id',
  h(async (req: AuthedRequest, res) => {
    const [t] = clientTemplates(req.user!, req.params.id);
    if (!t) throw new HttpError(404, 'This template is not available to your account.');
    res.json(t);
  })
);

// ------------------------------------------------------------------ presets

function presetToJson(r: any): ContentPreset {
  return {
    id: r.id,
    templateId: r.template_id,
    templateTitle: r.template_title,
    name: r.name,
    content: sanitizeContent(JSON.parse(r.content_json)),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Public visitors only see rows created from their own browser. */
function deviceOf(req: AuthedRequest): string | null {
  return req.guest ? req.deviceId || '-' : null;
}

function ownPreset(req: AuthedRequest, id: string) {
  const dev = deviceOf(req);
  const r = db
    .prepare(
      `SELECT p.*, t.title AS template_title FROM presets p JOIN templates t ON t.id = p.template_id
        WHERE p.id = ? AND p.client_id = ? ${dev ? 'AND p.device_id = ?' : ''}`
    )
    .get(...(dev ? [id, req.user!.id, dev] : [id, req.user!.id]));
  if (!r) throw new HttpError(404, 'Preset not found.');
  return r as any;
}

function assertTemplateAccess(req: AuthedRequest, templateId: string) {
  if (!clientTemplates(req.user!, templateId).length) throw new HttpError(403, 'This template is not available to your account.');
}

clientRouter.get(
  '/presets',
  h(async (req: AuthedRequest, res) => {
    const tid = typeof req.query.templateId === 'string' ? req.query.templateId : null;
    const dev = deviceOf(req);
    const params: string[] = [req.user!.id];
    if (dev) params.push(dev);
    if (tid) params.push(tid);
    const rows = db
      .prepare(
        `SELECT p.*, t.title AS template_title FROM presets p JOIN templates t ON t.id = p.template_id
          WHERE p.client_id = ? ${dev ? 'AND p.device_id = ?' : ''} ${tid ? 'AND p.template_id = ?' : ''} ORDER BY p.updated_at DESC`
      )
      .all(...params);
    res.json(rows.map(presetToJson));
  })
);

clientRouter.post(
  '/presets',
  h(async (req: AuthedRequest, res) => {
    const name = requireString(req.body?.name, 'Preset name', 100);
    const templateId = requireString(req.body?.templateId, 'Template', 64);
    assertTemplateAccess(req, templateId);
    const id = newId('pre_');
    const t = now();
    db.prepare('INSERT INTO presets (id, client_id, template_id, name, content_json, created_at, updated_at, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      req.user!.id,
      templateId,
      name,
      JSON.stringify(sanitizeContent(req.body?.content)),
      t,
      t,
      deviceOf(req)
    );
    logActivity(req.user!.id, 'preset_saved', name);
    res.status(201).json(presetToJson(ownPreset(req, id)));
  })
);

clientRouter.put(
  '/presets/:id',
  h(async (req: AuthedRequest, res) => {
    const p = ownPreset(req, req.params.id);
    const name = req.body?.name !== undefined ? requireString(req.body.name, 'Preset name', 100) : p.name;
    const content = req.body?.content !== undefined ? JSON.stringify(sanitizeContent(req.body.content)) : p.content_json;
    db.prepare('UPDATE presets SET name = ?, content_json = ?, updated_at = ? WHERE id = ?').run(name, content, now(), p.id);
    res.json(presetToJson(ownPreset(req, p.id)));
  })
);

clientRouter.delete(
  '/presets/:id',
  h(async (req: AuthedRequest, res) => {
    const p = ownPreset(req, req.params.id);
    db.prepare('DELETE FROM presets WHERE id = ?').run(p.id);
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ batches

export function batchToRecord(r: any): BatchRecord {
  return {
    id: r.id,
    name: r.name,
    clientId: r.client_id,
    clientName: r.client_name,
    templateId: r.template_id,
    templateTitle: r.template_title,
    templateVersionId: r.template_version_id,
    templateVersionNumber: r.version_number,
    content: sanitizeContent(JSON.parse(r.content_json)),
    mapping: sanitizeMapping(JSON.parse(r.mapping_json)),
    total: r.total,
    success: r.success,
    failed: r.failed,
    status: r.status,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}

const BATCH_SELECT = `SELECT b.*, t.title AS template_title, v.version_number FROM batches b
  JOIN templates t ON t.id = b.template_id JOIN template_versions v ON v.id = b.template_version_id`;

function ownBatch(req: AuthedRequest, id: string) {
  const dev = deviceOf(req);
  const r = db
    .prepare(`${BATCH_SELECT} WHERE b.id = ? AND b.client_id = ? ${dev ? 'AND b.device_id = ?' : ''}`)
    .get(...(dev ? [id, req.user!.id, dev] : [id, req.user!.id]));
  if (!r) throw new HttpError(404, 'Batch not found.');
  return r as any;
}

clientRouter.get(
  '/batches',
  h(async (req: AuthedRequest, res) => {
    const dev = deviceOf(req);
    const rows = db
      .prepare(`${BATCH_SELECT} WHERE b.client_id = ? ${dev ? 'AND b.device_id = ?' : ''} ORDER BY b.created_at DESC LIMIT 500`)
      .all(...(dev ? [req.user!.id, dev] : [req.user!.id]));
    res.json(rows.map(batchToRecord));
  })
);

clientRouter.get(
  '/batches/:id',
  h(async (req: AuthedRequest, res) => {
    const b = ownBatch(req, req.params.id);
    const certs = db.prepare('SELECT id, row_index, status FROM certificates WHERE batch_id = ? ORDER BY row_index').all(b.id);
    res.json({ batch: batchToRecord(b), certificates: certs });
  })
);

/** Public visitors may start at most 30 batches per hour per browser/IP. */
const guestStarts = new Map<string, number[]>();
function guestBatchLimit(key: string) {
  const t = now();
  const list = (guestStarts.get(key) || []).filter((x) => t - x < 3600_000);
  if (list.length >= 30) throw new HttpError(429, 'Too many batches started. Please wait a while and try again.');
  list.push(t);
  guestStarts.set(key, list);
}

/** Readable, unambiguous certificate IDs such as CG-7K3M-9QX2-PL4D. */
function certificateId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += alphabet[bytes[i] % alphabet.length];
  return `CG-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

/**
 * Starts a batch: stores a snapshot of the content + mapping and issues one
 * certificate ID per participant row. Participant data itself stays in the
 * browser; only the optional recipient name is stored for verification.
 */
clientRouter.post(
  '/batches',
  h(async (req: AuthedRequest, res) => {
    if (req.guest) guestBatchLimit(`${req.ip}|${req.deviceId}`);
    const name = requireString(req.body?.name, 'Batch name', 120);
    const templateId = requireString(req.body?.templateId, 'Template', 64);
    const versionId = requireString(req.body?.versionId, 'Template version', 64);
    assertTemplateAccess(req, templateId);
    const tpl = getTemplateRow(templateId)!;
    const version = getVersionRow(versionId);
    if (!version || version.template_id !== templateId) throw new HttpError(400, 'Unknown template version.');
    if (tpl.current_version_id !== versionId) {
      throw new HttpError(409, 'The administrator has published a newer version of this template. Reload the template and try again.');
    }
    const recipients: unknown[] = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    const total = recipients.length;
    if (total < 1) throw new HttpError(400, 'There are no participants to generate.');
    if (total > 20000) throw new HttpError(400, 'A single batch is limited to 20,000 certificates.');
    const id = newId('bat_');
    const t = now();
    const ids: string[] = [];
    tx(() => {
      db.prepare(
        `INSERT INTO batches (id, client_id, template_id, template_version_id, name, content_json, mapping_json, total, status, created_at, device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`
      ).run(
        id,
        req.user!.id,
        templateId,
        versionId,
        name,
        JSON.stringify(sanitizeContent(req.body?.content)),
        JSON.stringify(sanitizeMapping(req.body?.mapping)),
        total,
        t,
        deviceOf(req)
      );
      const ins = db.prepare('INSERT INTO certificates (id, batch_id, row_index, recipient_name, status, issued_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (let i = 0; i < total; i++) {
        const rn = typeof recipients[i] === 'string' ? (recipients[i] as string).trim().slice(0, 200) || null : null;
        let cid = certificateId();
        while (ids.includes(cid)) cid = certificateId();
        ins.run(cid, id, i, rn, 'pending', t);
        ids.push(cid);
      }
    });
    logActivity(req.user!.id, 'batch_started', `${name} (${total})`);
    res.status(201).json({ batch: batchToRecord(ownBatch(req, id)), certificateIds: ids });
  })
);

/** Records the outcome. Successful rows become valid certificates; failed or skipped rows are voided. */
clientRouter.post(
  '/batches/:id/complete',
  h(async (req: AuthedRequest, res) => {
    const b = ownBatch(req, req.params.id);
    if (b.status !== 'running') throw new HttpError(409, 'This batch has already been completed.');
    const successRows: number[] = Array.isArray(req.body?.successRows)
      ? req.body.successRows.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < b.total)
      : [];
    const cancelled = !!req.body?.cancelled;
    const success = new Set(successRows).size;
    const failed = Math.max(0, Number(req.body?.failedCount) || 0);
    let status: BatchStatus = 'completed';
    if (success === 0) status = cancelled ? 'cancelled' : 'failed';
    else if (cancelled) status = 'cancelled';
    else if (success < b.total) status = 'partial';
    tx(() => {
      db.prepare("UPDATE certificates SET status = 'void' WHERE batch_id = ?").run(b.id);
      const upd = db.prepare("UPDATE certificates SET status = 'valid' WHERE batch_id = ? AND row_index = ?");
      for (const r of new Set(successRows)) upd.run(b.id, r);
      db.prepare('UPDATE batches SET success = ?, failed = ?, status = ?, completed_at = ? WHERE id = ?').run(success, failed, status, now(), b.id);
    });
    logActivity(req.user!.id, 'batch_completed', `${b.name}: ${success} generated, ${failed} failed`);
    res.json(batchToRecord(ownBatch(req, b.id)));
  })
);
