import express, { Router } from 'express';
import { createUser, endAllSessionsForUser, getUserByEmail, hashPassword, passwordProblem, requireRole, toPublicUser, type AuthedRequest } from '../auth.ts';
import { db, logActivity, newId, now, tx } from '../db.ts';
import { h, HttpError, isEmail, optionalString, requireString } from '../http.ts';
import { attachLayoutFiles, saveFile, type FileKind } from '../files.ts';
import { BUCKET, deleteObjects, putObject } from '../storage.ts';
import { checkReferenceAlignment, emptyLayout, publishProblems, sanitizeLayout } from '../../shared/layout.ts';
import { passwordHelpRoutes, resolveHelpRequests } from '../passwordResets.ts';
import { getTemplateRow, layoutJson, syncCoverImage, parseLayout, templateUsage, toDetail, toSummary, toVersion, type TemplateRow, type VersionRow } from '../templates.ts';
import { batchToRecord, BATCH_SELECT } from './user.ts';

// Super Admin portal API: templates (upload, design, publish, test, archive),
// the audit log and the Admin accounts. No client or activity management.
export const superadminRouter = Router();
superadminRouter.use(requireRole('superadmin'));
const adminRouter = superadminRouter;

async function mustTemplate(id: string): Promise<TemplateRow> {
  const row = await getTemplateRow(id);
  if (!row) throw new HttpError(404, 'Template not found.');
  return row;
}

async function detail(id: string) {
  return toDetail((await getTemplateRow(id))!);
}

// ------------------------------------------------------------------ dashboard

adminRouter.get(
  '/stats',
  h(async (_req, res) => {
    const count = async (sql: string, ...p: unknown[]) => Number((await db.one<{ n: number }>(sql, p))?.n) || 0;
    const frequent = await db.all(
      `SELECT t.id, t.title, COUNT(b.id) AS batches, COALESCE(SUM(b.success),0) AS certificates
         FROM batches b JOIN templates t ON t.id = b.template_id
        GROUP BY t.id, t.title ORDER BY certificates DESC LIMIT 5`
    );
    res.json({
      templates: await count('SELECT COUNT(*) n FROM templates WHERE status != ?', 'archived'),
      published: await count('SELECT COUNT(*) n FROM templates WHERE status = ?', 'published'),
      drafts: await count('SELECT COUNT(*) n FROM templates WHERE status = ?', 'draft'),
      archived: await count('SELECT COUNT(*) n FROM templates WHERE status = ?', 'archived'),
      admins: await count("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND active = 1"),
      users: await count("SELECT COUNT(*) n FROM users WHERE role = 'user' AND active = 1 AND password_hash <> 'disabled'"),
      certificates: await count('SELECT COALESCE(SUM(success),0) n FROM batches'),
      batches: await count('SELECT COUNT(*) n FROM batches'),
      frequentTemplates: frequent.map((f) => ({ ...f, batches: Number(f.batches), certificates: Number(f.certificates) })),
      storage: { persistent: true, provider: 'supabase', bucket: BUCKET },
    });
  })
);

adminRouter.get(
  '/activity',
  h(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
    const rows = await db.all(
      `SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id
        ${userId ? 'WHERE a.user_id = ?' : ''} ORDER BY a.created_at DESC LIMIT ?`,
      userId ? [userId, limit] : [limit]
    );
    res.json(rows.map((r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, action: r.action, detail: r.detail, createdAt: r.created_at })));
  })
);

adminRouter.get(
  '/batches',
  h(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const rows = await db.all(`${BATCH_SELECT} ORDER BY b.created_at DESC LIMIT ?`, [limit]);
    res.json(rows.map(batchToRecord));
  })
);

adminRouter.post(
  '/certificates/:id/revoke',
  h(async (req: AuthedRequest, res) => {
    const n = await db.run("UPDATE certificates SET status = 'revoked' WHERE id = ? AND status = 'valid'", [req.params.id]);
    if (!n) throw new HttpError(404, 'No valid certificate with that ID.');
    await logActivity(req.user!.id, 'certificate_revoked', req.params.id);
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ files

const FILE_KINDS: FileKind[] = ['artwork', 'reference', 'preview', 'signature', 'font', 'refimage'];

adminRouter.post(
  '/files',
  express.raw({ type: () => true, limit: '26mb' }),
  h(async (req: AuthedRequest, res) => {
    const kind = String(req.query.kind || '') as FileKind;
    if (!FILE_KINDS.includes(kind)) throw new HttpError(400, 'Unknown file kind.');
    const name = typeof req.query.name === 'string' ? req.query.name : null;
    const templateId = typeof req.query.templateId === 'string' ? req.query.templateId : null;
    const role = req.query.role === 'reference' ? 'reference' : null;
    const saved = await saveFile(req.body as Buffer, kind, req.user!.id, name, { templateId, role });
    res.json(saved);
  })
);

// ------------------------------------------------------------------ templates

adminRouter.get(
  '/templates',
  h(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const rows = status
      ? await db.all<TemplateRow>('SELECT * FROM templates WHERE status = ? ORDER BY updated_at DESC', [status])
      : await db.all<TemplateRow>('SELECT * FROM templates ORDER BY updated_at DESC');
    res.json(await Promise.all(rows.map(toSummary)));
  })
);

adminRouter.post(
  '/templates',
  express.json({ limit: '2mb' }),
  h(async (req: AuthedRequest, res) => {
    const title = requireString(req.body?.title, 'Template name', 120);
    const description = optionalString(req.body?.description, 500);
    const id = newId('tpl_');
    const t = now();
    const layout = req.body?.draft ? sanitizeLayout(req.body.draft, { renumberSignatures: true }) : emptyLayout();
    await db.run(
      `INSERT INTO templates (id, title, description, status, visibility, draft_json, draft_updated_at, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', 'assigned', ?, ?, ?, ?, ?, ?)`,
      [id, title, description, layoutJson(layout), t, req.user!.id, req.user!.id, t, t]
    );
    await attachLayoutFiles(id, layout);
    await syncCoverImage(id);
    await logActivity(req.user!.id, 'template_created', title);
    res.status(201).json(await detail(id));
  })
);

adminRouter.get(
  '/templates/:id',
  h(async (req, res) => {
    res.json(await toDetail(await mustTemplate(req.params.id)));
  })
);

/** Save draft: title/description/layout. Published versions are never changed by this. */
adminRouter.put(
  '/templates/:id',
  express.json({ limit: '2mb' }),
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    if (row.status === 'archived') throw new HttpError(409, 'Restore this template from the archive before editing it.');
    const title = req.body?.title !== undefined ? requireString(req.body.title, 'Template name', 120) : row.title;
    const description = req.body?.description !== undefined ? optionalString(req.body.description, 500) : row.description;
    let draft = row.draft_json;
    if (req.body?.draft !== undefined) {
      const layout = sanitizeLayout(req.body.draft, { renumberSignatures: true });
      draft = layoutJson(layout);
      await attachLayoutFiles(row.id, layout);
    }
    const t = now();
    await db.run('UPDATE templates SET title = ?, description = ?, draft_json = ?, draft_updated_at = ?, updated_at = ?, updated_by = ? WHERE id = ?', [
      title,
      description,
      draft,
      t,
      t,
      req.user!.id,
      row.id,
    ]);
    await syncCoverImage(row.id);
    res.json(await detail(row.id));
  })
);

adminRouter.post(
  '/templates/:id/publish',
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    if (row.status === 'archived') throw new HttpError(409, 'Archived templates cannot be published. Restore it first.');
    const layout = parseLayout(row.draft_json);
    const problems = publishProblems(layout);
    if (problems.length) throw new HttpError(400, problems.join(' '));
    const notes = optionalString(req.body?.notes, 500);
    const json = layoutJson(layout);
    const current = row.current_version_id ? await db.one<VersionRow>('SELECT * FROM template_versions WHERE id = ?', [row.current_version_id]) : undefined;
    let versionId = current?.id;
    let created = false;
    await tx(async (q) => {
      // Only create a new version when the layout actually changed.
      if (!current || current.layout_json !== json) {
        const max = await q.one<{ n: number }>('SELECT COALESCE(MAX(version_number),0) AS n FROM template_versions WHERE template_id = ?', [row.id]);
        versionId = newId('ver_');
        created = true;
        await q.run(
          'INSERT INTO template_versions (id, template_id, version_number, layout_json, notes, published_at, published_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [versionId, row.id, Number(max?.n || 0) + 1, json, notes, now(), req.user!.id]
        );
      }
      await q.run("UPDATE templates SET status = 'published', current_version_id = ?, draft_json = ?, updated_at = ?, updated_by = ? WHERE id = ?", [
        versionId!,
        json,
        now(),
        req.user!.id,
        row.id,
      ]);
    });
    if (created) {
      // A copy of each published layout next to the template's files (backup / audit).
      await putObject(`templates/${row.id}/versions/${versionId}/layout.json`, Buffer.from(json), 'application/json').catch((e) =>
        console.warn('[storage] version manifest not saved:', e.message)
      );
    }
    // Upload A (complete reference certificate) becomes the reference image shown
    // to Admins and Users — unless the Super Admin uploaded or generated a custom one.
    await syncCoverImage(row.id);
    await logActivity(req.user!.id, 'template_published', row.title);
    res.json(await detail(row.id));
  })
);

/** Alignment check between the reference certificate and the blank design. */
adminRouter.get(
  '/templates/:id/alignment',
  h(async (req, res) => {
    const row = await mustTemplate(req.params.id);
    res.json(checkReferenceAlignment(parseLayout(row.draft_json)));
  })
);

function setStatus(status: 'draft' | 'archived' | 'published', action: string) {
  return h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    if (status === 'published' && !row.current_version_id) throw new HttpError(400, 'This template has never been published.');
    await db.run('UPDATE templates SET status = ?, updated_at = ?, updated_by = ? WHERE id = ?', [status, now(), req.user!.id, row.id]);
    await logActivity(req.user!.id, action, row.title);
    res.json(await detail(row.id));
  });
}
adminRouter.post('/templates/:id/unpublish', setStatus('draft', 'template_unpublished'));
adminRouter.post('/templates/:id/archive', setStatus('archived', 'template_archived'));
adminRouter.post('/templates/:id/unarchive', setStatus('draft', 'template_unarchived'));

adminRouter.post(
  '/templates/:id/duplicate',
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    const id = newId('tpl_');
    const t = now();
    await db.run(
      `INSERT INTO templates (id, title, description, status, visibility, draft_json, draft_updated_at, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
      [id, `Copy of ${row.title}`.slice(0, 120), row.description, row.visibility, row.draft_json, t, req.user!.id, req.user!.id, t, t]
    );
    await syncCoverImage(id);
    await logActivity(req.user!.id, 'template_duplicated', row.title);
    res.status(201).json(await detail(id));
  })
);

/** What a template is linked to — shown in the delete confirmation. */
adminRouter.get(
  '/templates/:id/usage',
  h(async (req, res) => {
    await mustTemplate(req.params.id);
    res.json(await templateUsage(req.params.id));
  })
);

/** Sample reference image shown to users (uploaded, auto-generated in the browser, or null to remove). */
adminRouter.put(
  '/templates/:id/reference-image',
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    const fileId = typeof req.body?.fileId === 'string' ? req.body.fileId : null;
    if (fileId) {
      const f = await db.one<{ kind: string }>('SELECT kind FROM files WHERE id = ?', [fileId]);
      if (!f || !['refimage', 'preview'].includes(f.kind)) throw new HttpError(400, 'Upload a PNG or JPG image first.');
      await db.run('UPDATE files SET template_id = ? WHERE id = ? AND template_id IS NULL', [row.id, fileId]);
    }
    await db.run('UPDATE templates SET reference_image_file_id = ?, updated_at = ?, updated_by = ? WHERE id = ?', [fileId, now(), req.user!.id, row.id]);
    await logActivity(req.user!.id, fileId ? 'template_reference_image_set' : 'template_reference_image_removed', row.title);
    res.json(await detail(row.id));
  })
);

/**
 * Permanent delete. Blocked when certificates were generated (archive instead).
 * When the template is assigned to activities the caller must confirm with ?confirm=linked.
 */
adminRouter.delete(
  '/templates/:id',
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    const usage = await templateUsage(row.id);
    if (usage.batches > 0) {
      throw new HttpError(409, 'This template has generation history, so it cannot be deleted. Archive it instead.');
    }

    const files = await db.all<{ id: string; storage_path: string }>('SELECT id, storage_path FROM files WHERE template_id = ?', [row.id]);
    await tx(async (q) => {
      await q.run('DELETE FROM files WHERE template_id = ?', [row.id]);
      await q.run('UPDATE templates SET current_version_id = NULL WHERE id = ?', [row.id]);
      await q.run('DELETE FROM templates WHERE id = ?', [row.id]);
    });
    await deleteObjects(files.map((f) => f.storage_path)).catch((e) => console.warn('[storage] cleanup failed:', e.message));
    await logActivity(req.user!.id, 'template_deleted', row.title);
    res.json({ ok: true });
  })
);

adminRouter.get(
  '/templates/:id/versions',
  h(async (req, res) => {
    await mustTemplate(req.params.id);
    const rows = await db.all<VersionRow & { batch_count: number }>(
      `SELECT v.*, (SELECT COUNT(*) FROM batches b WHERE b.template_version_id = v.id) AS batch_count
         FROM template_versions v WHERE v.template_id = ? ORDER BY v.version_number DESC`,
      [req.params.id]
    );
    res.json(rows.map((r) => ({ ...toVersion(r), batchCount: Number(r.batch_count) })));
  })
);

/** Copies an older version into the draft. Publishing afterwards creates a new version; history is never rewritten. */
adminRouter.post(
  '/templates/:id/versions/:versionId/restore',
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    const v = await db.one<VersionRow>('SELECT * FROM template_versions WHERE id = ? AND template_id = ?', [req.params.versionId, row.id]);
    if (!v) throw new HttpError(404, 'Version not found.');
    await db.run('UPDATE templates SET draft_json = ?, draft_updated_at = ?, updated_at = ?, updated_by = ? WHERE id = ?', [
      v.layout_json,
      now(),
      now(),
      req.user!.id,
      row.id,
    ]);
    await syncCoverImage(row.id);
    await logActivity(req.user!.id, 'template_version_restored', `${row.title} v${v.version_number}`);
    res.json(await detail(row.id));
  })
);

/** all = available in every activity; assigned = only where an Admin assigned it. */
adminRouter.put(
  '/templates/:id/visibility',
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    const visibility = req.body?.visibility === 'all' ? 'all' : 'assigned';
    await db.run('UPDATE templates SET visibility = ?, updated_at = ?, updated_by = ? WHERE id = ?', [visibility, now(), req.user!.id, row.id]);
    await logActivity(req.user!.id, 'template_visibility_changed', `${row.title}: ${visibility}`);
    res.json(await detail(row.id));
  })
);

// ------------------------------------------------------------------ admin accounts (team)

async function adminRow(id: string) {
  const r = await db.one("SELECT * FROM users WHERE id = ? AND role = 'admin'", [id]);
  if (!r) throw new HttpError(404, 'Admin account not found.');
  return r;
}

adminRouter.get(
  '/admins',
  h(async (_req, res) => {
    const rows = await db.all("SELECT * FROM users WHERE role = 'admin' ORDER BY lower(name)");
    res.json(rows.map(toPublicUser));
  })
);

adminRouter.post(
  '/admins',
  h(async (req: AuthedRequest, res) => {
    const name = requireString(req.body?.name, 'Name', 120);
    const email = requireString(req.body?.email, 'Email', 200).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
    if (await getUserByEmail(email)) throw new HttpError(409, 'An account with this email already exists.');
    const user = await createUser({ email, name, password, role: 'admin', organisation: optionalString(req.body?.organisation, 200), createdBy: req.user!.id });
    await logActivity(req.user!.id, 'admin_created', `${name} <${email}>`);
    res.status(201).json(toPublicUser(user));
  })
);

adminRouter.put(
  '/admins/:id',
  h(async (req: AuthedRequest, res) => {
    const r = await adminRow(req.params.id);
    const name = req.body?.name !== undefined ? requireString(req.body.name, 'Name', 120) : r.name;
    let email = r.email;
    if (req.body?.email !== undefined) {
      email = requireString(req.body.email, 'Email', 200).toLowerCase();
      if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
      if (await db.one('SELECT id FROM users WHERE lower(email) = ? AND id <> ?', [email, r.id])) throw new HttpError(409, 'Another account already uses this email.');
    }
    const organisation = req.body?.organisation !== undefined ? optionalString(req.body.organisation, 200) || null : r.organisation;
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : r.active;
    await db.run('UPDATE users SET name = ?, email = ?, organisation = ?, active = ?, updated_at = ? WHERE id = ?', [name, email, organisation, active, now(), r.id]);
    if (!active) await endAllSessionsForUser(r.id);
    await logActivity(req.user!.id, r.active !== active ? (active ? 'admin_activated' : 'admin_deactivated') : 'admin_updated', name);
    res.json(toPublicUser(await adminRow(r.id)));
  })
);

adminRouter.post(
  '/admins/:id/password',
  h(async (req: AuthedRequest, res) => {
    const r = await adminRow(req.params.id);
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(password), now(), r.id]);
    await endAllSessionsForUser(r.id);
    await resolveHelpRequests(r.id, req.user!.id);
    await logActivity(req.user!.id, 'admin_password_reset', r.name);
    res.json({ ok: true });
  })
);


// ------------------------------------------------------------------ forgotten passwords of Admins
passwordHelpRoutes(adminRouter, 'admin');
