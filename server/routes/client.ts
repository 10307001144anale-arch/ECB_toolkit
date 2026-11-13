import { Router } from 'express';
import crypto from 'node:crypto';
import { requireRole, type AuthedRequest } from '../auth.ts';
import { db, logActivity, newId, now, tx } from '../db.ts';
import { h, HttpError, requireString } from '../http.ts';
import { clientTemplates, enforceFormatting, getTemplateRow, getVersionRow, parseLayout, sanitizeContent, sanitizeMapping } from '../templates.ts';
import type { BatchRecord, BatchStatus, ContentPreset } from '../../shared/types.ts';

export const clientRouter = Router();
clientRouter.use(requireRole('client'));

// ------------------------------------------------------------------ templates

clientRouter.get(
  '/templates',
  h(async (req: AuthedRequest, res) => {
    res.json(await clientTemplates(req.user!));
  })
);

clientRouter.get(
  '/templates/:id',
  h(async (req: AuthedRequest, res) => {
    const [t] = await clientTemplates(req.user!, req.params.id);
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

async function ownPreset(req: AuthedRequest, id: string) {
  const r = await db.one(
    `SELECT p.*, t.title AS template_title FROM presets p JOIN templates t ON t.id = p.template_id
      WHERE p.id = ? AND p.client_id = ?`,
    [id, req.user!.id]
  );
  if (!r) throw new HttpError(404, 'Preset not found.');
  return r;
}

async function assertTemplateAccess(req: AuthedRequest, templateId: string) {
  if (!(await clientTemplates(req.user!, templateId)).length) throw new HttpError(403, 'This template is not available to your account.');
}

clientRouter.get(
  '/presets',
  h(async (req: AuthedRequest, res) => {
    const tid = typeof req.query.templateId === 'string' ? req.query.templateId : null;
    const params: string[] = [req.user!.id];
    if (tid) params.push(tid);
    const rows = await db.all(
      `SELECT p.*, t.title AS template_title FROM presets p JOIN templates t ON t.id = p.template_id
        WHERE p.client_id = ? ${tid ? 'AND p.template_id = ?' : ''} ORDER BY p.updated_at DESC`,
      params
    );
    res.json(rows.map(presetToJson));
  })
);

clientRouter.post(
  '/presets',
  h(async (req: AuthedRequest, res) => {
    const name = requireString(req.body?.name, 'Preset name', 100);
    const templateId = requireString(req.body?.templateId, 'Template', 64);
    await assertTemplateAccess(req, templateId);
    const id = newId('pre_');
    const t = now();
    await db.run('INSERT INTO presets (id, client_id, template_id, name, content_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      id,
      req.user!.id,
      templateId,
      name,
      JSON.stringify(sanitizeContent(req.body?.content)),
      t,
      t,
    ]);
    await logActivity(req.user!.id, 'preset_saved', name);
    res.status(201).json(presetToJson(await ownPreset(req, id)));
  })
);

clientRouter.put(
  '/presets/:id',
  h(async (req: AuthedRequest, res) => {
    const p = await ownPreset(req, req.params.id);
    const name = req.body?.name !== undefined ? requireString(req.body.name, 'Preset name', 100) : p.name;
    const content = req.body?.content !== undefined ? JSON.stringify(sanitizeContent(req.body.content)) : p.content_json;
    await db.run('UPDATE presets SET name = ?, content_json = ?, updated_at = ? WHERE id = ?', [name, content, now(), p.id]);
    res.json(presetToJson(await ownPreset(req, p.id)));
  })
);

clientRouter.delete(
  '/presets/:id',
  h(async (req: AuthedRequest, res) => {
    const p = await ownPreset(req, req.params.id);
    await db.run('DELETE FROM presets WHERE id = ?', [p.id]);
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

async function ownBatch(req: AuthedRequest, id: string) {
  const r = await db.one(`${BATCH_SELECT} WHERE b.id = ? AND b.client_id = ?`, [id, req.user!.id]);
  if (!r) throw new HttpError(404, 'Batch not found.');
  return r;
}

clientRouter.get(
  '/batches',
  h(async (req: AuthedRequest, res) => {
    const rows = await db.all(`${BATCH_SELECT} WHERE b.client_id = ? ORDER BY b.created_at DESC LIMIT 500`, [req.user!.id]);
    res.json(rows.map(batchToRecord));
  })
);

clientRouter.get(
  '/batches/:id',
  h(async (req: AuthedRequest, res) => {
    const b = await ownBatch(req, req.params.id);
    const certs = await db.all('SELECT id, row_index, status FROM certificates WHERE batch_id = ? ORDER BY row_index', [b.id]);
    res.json({ batch: batchToRecord(b), certificates: certs });
  })
);

/** Abuse protection: at most 30 batch starts per hour per account. Not a limit on certificates. */
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
    guestBatchLimit(req.user!.id);
    const name = requireString(req.body?.name, 'Batch name', 120);
    const templateId = requireString(req.body?.templateId, 'Template', 64);
    const versionId = requireString(req.body?.versionId, 'Template version', 64);
    await assertTemplateAccess(req, templateId);
    const tpl = (await getTemplateRow(templateId))!;
    const version = await getVersionRow(versionId);
    if (!version || version.template_id !== templateId) throw new HttpError(400, 'Unknown template version.');
    if (tpl.current_version_id !== versionId) {
      throw new HttpError(409, 'The administrator has published a newer version of this template. Reload the template and try again.');
    }
    const recipients: unknown[] = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    const total = recipients.length;
    if (total < 1) throw new HttpError(400, 'There are no participants to generate.');
    const id = newId('bat_');
    const t = now();
    const ids: string[] = [];
    const used = new Set<string>();
    const recipientNames = recipients.map((r) => (typeof r === 'string' ? r.trim().slice(0, 200) || null : null));
    for (let i = 0; i < total; i++) {
      let cid = certificateId();
      while (used.has(cid)) cid = certificateId();
      used.add(cid);
      ids.push(cid);
    }
    await tx(async (q) => {
      await q.run(
        `INSERT INTO batches (id, client_id, template_id, template_version_id, name, content_json, mapping_json, total, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
        [id, req.user!.id, templateId, versionId, name, JSON.stringify(enforceFormatting(sanitizeContent(req.body?.content), parseLayout(version.layout_json))), JSON.stringify(sanitizeMapping(req.body?.mapping)), total, t]
      );
      // Insert certificate IDs in chunks (fast for very large batches).
      for (let start = 0; start < total; start += 500) {
        const end = Math.min(total, start + 500);
        const values: unknown[] = [];
        const rows: string[] = [];
        for (let i = start; i < end; i++) {
          rows.push("(?, ?, ?, ?, 'pending', ?)");
          values.push(ids[i], id, i, recipientNames[i], t);
        }
        await q.run(`INSERT INTO certificates (id, batch_id, row_index, recipient_name, status, issued_at) VALUES ${rows.join(',')}`, values);
      }
    });
    await logActivity(req.user!.id, 'batch_started', `${name} (${total})`);
    res.status(201).json({ batch: batchToRecord(await ownBatch(req, id)), certificateIds: ids });
  })
);

/**
 * Marks the certificates of an earlier batch as replaced (void) after the
 * client generated a corrected version. Their QR codes then show "not valid".
 */
clientRouter.post(
  '/batches/:id/replace',
  h(async (req: AuthedRequest, res) => {
    const old = await ownBatch(req, req.params.id);
    const by = await ownBatch(req, String(req.body?.replacementId || ''));
    if (by.id === old.id) throw new HttpError(400, 'A batch cannot replace itself.');
    if (!['completed', 'partial', 'cancelled'].includes(by.status) || by.success === 0) throw new HttpError(409, 'The new batch has no generated certificates yet.');
    const voided = await tx(async (q) => {
      const n = await q.run("UPDATE certificates SET status = 'void' WHERE batch_id = ? AND status = 'valid'", [old.id]);
      await q.run('UPDATE batches SET replaced_by = ? WHERE id = ?', [by.id, old.id]);
      return n;
    });
    await logActivity(req.user!.id, 'batch_replaced', `${old.name} replaced by ${by.name} (${voided} certificates voided)`);
    res.json({ voided });
  })
);

/** Records the outcome. Successful rows become valid certificates; failed or skipped rows are voided. */
clientRouter.post(
  '/batches/:id/complete',
  h(async (req: AuthedRequest, res) => {
    const b = await ownBatch(req, req.params.id);
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
    await tx(async (q) => {
      await q.run("UPDATE certificates SET status = 'void' WHERE batch_id = ?", [b.id]);
      const rows = [...new Set(successRows)];
      for (let i = 0; i < rows.length; i += 5000) {
        await q.run("UPDATE certificates SET status = 'valid' WHERE batch_id = ? AND row_index = ANY(?::int[])", [b.id, rows.slice(i, i + 5000)]);
      }
      await q.run('UPDATE batches SET success = ?, failed = ?, status = ?, completed_at = ? WHERE id = ?', [success, failed, status, now(), b.id]);
    });
    await logActivity(req.user!.id, 'batch_completed', `${b.name}: ${success} generated, ${failed} failed`);
    res.json(batchToRecord(await ownBatch(req, b.id)));
  })
);
