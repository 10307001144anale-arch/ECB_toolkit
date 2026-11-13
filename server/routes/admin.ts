import express, { Router } from 'express';
import { createUser, endAllSessionsForUser, getUserByEmail, hashPassword, passwordProblem, requireRole, toPublicUser, type AuthedRequest } from '../auth.ts';
import { db, logActivity, newId, now, tx } from '../db.ts';
import { h, HttpError, isEmail, optionalString, requireString } from '../http.ts';
import { attachLayoutFiles, saveFile, type FileKind } from '../files.ts';
import { BUCKET, deleteObjects, putObject } from '../storage.ts';
import { checkReferenceAlignment, emptyLayout, publishProblems, sanitizeLayout } from '../../shared/layout.ts';
import { getTemplateRow, layoutJson, parseLayout, toDetail, toSummary, toVersion, type TemplateRow, type VersionRow } from '../templates.ts';
import { batchToRecord } from './client.ts';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

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
      clients: await count("SELECT COUNT(*) n FROM users WHERE role = 'client'"),
      activeClients: await count("SELECT COUNT(*) n FROM users WHERE role = 'client' AND active = 1"),
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
    const rows = await db.all(
      `SELECT b.*, t.title AS template_title, v.version_number, u.name AS client_name
         FROM batches b JOIN templates t ON t.id = b.template_id
         JOIN template_versions v ON v.id = b.template_version_id
         JOIN users u ON u.id = b.client_id
        ORDER BY b.created_at DESC LIMIT ?`,
      [limit]
    );
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

const FILE_KINDS: FileKind[] = ['artwork', 'reference', 'preview', 'signature', 'font'];

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
    await logActivity(req.user!.id, 'template_duplicated', row.title);
    res.status(201).json(await detail(id));
  })
);

adminRouter.delete(
  '/templates/:id',
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    const used = await db.one<{ n: number }>('SELECT COUNT(*) AS n FROM batches WHERE template_id = ?', [row.id]);
    if (Number(used?.n) > 0) {
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
    await logActivity(req.user!.id, 'template_version_restored', `${row.title} v${v.version_number}`);
    res.json(await detail(row.id));
  })
);

adminRouter.put(
  '/templates/:id/access',
  h(async (req: AuthedRequest, res) => {
    const row = await mustTemplate(req.params.id);
    const visibility = req.body?.visibility === 'all' ? 'all' : 'assigned';
    const ids: string[] = Array.isArray(req.body?.clientIds) ? req.body.clientIds.filter((x: unknown) => typeof x === 'string') : [];
    await tx(async (q) => {
      await q.run('UPDATE templates SET visibility = ?, updated_at = ?, updated_by = ? WHERE id = ?', [visibility, now(), req.user!.id, row.id]);
      await q.run('DELETE FROM template_access WHERE template_id = ?', [row.id]);
      for (const cid of ids.slice(0, 1000)) {
        await q.run(
          "INSERT INTO template_access (template_id, client_id, granted_by, granted_at) SELECT ?, id, ?, ? FROM users WHERE id = ? AND role = 'client' ON CONFLICT DO NOTHING",
          [row.id, req.user!.id, now(), cid]
        );
      }
    });
    await logActivity(req.user!.id, 'template_access_changed', row.title);
    res.json(await detail(row.id));
  })
);

// ------------------------------------------------------------------ clients

async function clientRow(id: string) {
  const r = await db.one("SELECT * FROM users WHERE id = ? AND role = 'client'", [id]);
  if (!r) throw new HttpError(404, 'Client not found.');
  return r;
}

async function clientWithStats(r: any) {
  const s = await db.one('SELECT COUNT(*) AS batches, COALESCE(SUM(success),0) AS certificates, MAX(created_at) AS last FROM batches WHERE client_id = ?', [r.id]);
  const templateIds = (await db.all<{ template_id: string }>('SELECT template_id FROM template_access WHERE client_id = ?', [r.id])).map((x) => x.template_id);
  return {
    ...toPublicUser(r),
    isPublic: false,
    batchCount: Number(s?.batches) || 0,
    certificateCount: Number(s?.certificates) || 0,
    lastGeneratedAt: s?.last ?? null,
    templateIds,
  };
}

adminRouter.get(
  '/clients',
  h(async (_req, res) => {
    const rows = await db.all("SELECT * FROM users WHERE role = 'client' AND password_hash <> 'disabled' ORDER BY lower(name)");
    res.json(await Promise.all(rows.map(clientWithStats)));
  })
);

async function grantTemplates(q: Pick<typeof db, 'run'>, clientId: string, templateIds: string[], by: string) {
  for (const tid of templateIds.slice(0, 1000)) {
    if (typeof tid !== 'string') continue;
    await q.run('INSERT INTO template_access (template_id, client_id, granted_by, granted_at) SELECT id, ?, ?, ? FROM templates WHERE id = ? ON CONFLICT DO NOTHING', [
      clientId,
      by,
      now(),
      tid,
    ]);
  }
}

adminRouter.post(
  '/clients',
  h(async (req: AuthedRequest, res) => {
    const name = requireString(req.body?.name, 'Name', 120);
    const email = requireString(req.body?.email, 'Email', 200).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
    if (await getUserByEmail(email)) throw new HttpError(409, 'An account with this email already exists.');
    const user = await createUser({ email, name, password, role: 'client', organisation: optionalString(req.body?.organisation, 200), createdBy: req.user!.id });
    await grantTemplates(db, user.id, Array.isArray(req.body?.templateIds) ? req.body.templateIds : [], req.user!.id);
    await logActivity(req.user!.id, 'client_created', `${name} <${email}>`);
    res.status(201).json(await clientWithStats(user));
  })
);

adminRouter.put(
  '/clients/:id',
  h(async (req: AuthedRequest, res) => {
    const r = await clientRow(req.params.id);
    const name = req.body?.name !== undefined ? requireString(req.body.name, 'Name', 120) : r.name;
    let email = r.email;
    if (req.body?.email !== undefined) {
      email = requireString(req.body.email, 'Email', 200).toLowerCase();
      if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
      const clash = await db.one('SELECT id FROM users WHERE lower(email) = ? AND id <> ?', [email, r.id]);
      if (clash) throw new HttpError(409, 'Another account already uses this email.');
    }
    const organisation = req.body?.organisation !== undefined ? optionalString(req.body.organisation, 200) || null : r.organisation;
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : r.active;
    await db.run('UPDATE users SET name = ?, email = ?, organisation = ?, active = ?, updated_at = ? WHERE id = ?', [name, email, organisation, active, now(), r.id]);
    if (!active) await endAllSessionsForUser(r.id);
    if (r.active !== active) await logActivity(req.user!.id, active ? 'client_activated' : 'client_deactivated', name);
    else await logActivity(req.user!.id, 'client_updated', name);
    res.json(await clientWithStats(await clientRow(r.id)));
  })
);

adminRouter.post(
  '/clients/:id/password',
  h(async (req: AuthedRequest, res) => {
    const r = await clientRow(req.params.id);
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(password), now(), r.id]);
    await endAllSessionsForUser(r.id);
    await logActivity(req.user!.id, 'client_password_reset', r.name);
    res.json({ ok: true });
  })
);

adminRouter.put(
  '/clients/:id/templates',
  h(async (req: AuthedRequest, res) => {
    const r = await clientRow(req.params.id);
    const ids: string[] = Array.isArray(req.body?.templateIds) ? req.body.templateIds.filter((x: unknown) => typeof x === 'string') : [];
    await tx(async (q) => {
      await q.run('DELETE FROM template_access WHERE client_id = ?', [r.id]);
      await grantTemplates(q, r.id, ids, req.user!.id);
    });
    await logActivity(req.user!.id, 'client_access_changed', r.name);
    res.json(await clientWithStats(await clientRow(r.id)));
  })
);
