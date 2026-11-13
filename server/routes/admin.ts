import express, { Router } from 'express';
import { createUser, endAllSessionsForUser, hashPassword, passwordProblem, requireRole, toPublicUser, type AuthedRequest } from '../auth.ts';
import { DATA_DIR, db, GUEST_ID, logActivity, newId, now, tx } from '../db.ts';
import { h, HttpError, isEmail, optionalString, requireString } from '../http.ts';
import { saveFile, type FileKind } from '../files.ts';
import { emptyLayout, publishProblems, sanitizeLayout } from '../../shared/layout.ts';
import { getTemplateRow, layoutJson, parseLayout, toDetail, toSummary, toVersion, type TemplateRow, type VersionRow } from '../templates.ts';
import { batchToRecord } from './client.ts';

export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

function mustTemplate(id: string): TemplateRow {
  const row = getTemplateRow(id);
  if (!row) throw new HttpError(404, 'Template not found.');
  return row;
}

// ------------------------------------------------------------------ dashboard

/**
 * On Render, only a mounted disk survives restarts and redeploys. If the data
 * folder is inside the app directory, templates would disappear after the
 * next deploy — warn the administrator.
 */
function storageStatus() {
  const onRender = !!process.env.RENDER;
  const inAppDir = DATA_DIR.startsWith(process.cwd());
  return { persistent: !(onRender && inAppDir), dataDir: DATA_DIR };
}

adminRouter.get(
  '/stats',
  h(async (_req, res) => {
    const count = (sql: string, ...p: any[]) => Number((db.prepare(sql).get(...p) as any).n) || 0;
    const frequent = db
      .prepare(
        `SELECT t.id, t.title, COUNT(b.id) AS batches, COALESCE(SUM(b.success),0) AS certificates
           FROM batches b JOIN templates t ON t.id = b.template_id
          GROUP BY t.id ORDER BY certificates DESC LIMIT 5`
      )
      .all();
    res.json({
      templates: count('SELECT COUNT(*) n FROM templates WHERE status != ?', 'archived'),
      published: count('SELECT COUNT(*) n FROM templates WHERE status = ?', 'published'),
      drafts: count('SELECT COUNT(*) n FROM templates WHERE status = ?', 'draft'),
      archived: count('SELECT COUNT(*) n FROM templates WHERE status = ?', 'archived'),
      clients: count("SELECT COUNT(*) n FROM users WHERE role = 'client'"),
      activeClients: count("SELECT COUNT(*) n FROM users WHERE role = 'client' AND active = 1"),
      certificates: count('SELECT COALESCE(SUM(success),0) n FROM batches'),
      batches: count('SELECT COUNT(*) n FROM batches'),
      frequentTemplates: frequent,
      storage: storageStatus(),
    });
  })
);

adminRouter.get(
  '/activity',
  h(async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
    const rows = db
      .prepare(
        `SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id
          ${userId ? 'WHERE a.user_id = ?' : ''} ORDER BY a.created_at DESC LIMIT ?`
      )
      .all(...(userId ? [userId, limit] : [limit])) as any[];
    res.json(
      rows.map((r) => ({ id: r.id, userId: r.user_id, userName: r.user_name, action: r.action, detail: r.detail, createdAt: r.created_at }))
    );
  })
);

adminRouter.get(
  '/batches',
  h(async (req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const rows = db
      .prepare(
        `SELECT b.*, t.title AS template_title, v.version_number, u.name AS client_name
           FROM batches b JOIN templates t ON t.id = b.template_id
           JOIN template_versions v ON v.id = b.template_version_id
           JOIN users u ON u.id = b.client_id
          ORDER BY b.created_at DESC LIMIT ?`
      )
      .all(limit) as any[];
    res.json(rows.map(batchToRecord));
  })
);

adminRouter.post(
  '/certificates/:id/revoke',
  h(async (req: AuthedRequest, res) => {
    const r = db.prepare("UPDATE certificates SET status = 'revoked' WHERE id = ? AND status = 'valid'").run(req.params.id);
    if (!r.changes) throw new HttpError(404, 'No valid certificate with that ID.');
    logActivity(req.user!.id, 'certificate_revoked', req.params.id);
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ files

adminRouter.post(
  '/files',
  express.raw({ type: () => true, limit: '26mb' }),
  h(async (req: AuthedRequest, res) => {
    const kind = String(req.query.kind || '') as FileKind;
    if (!['artwork', 'preview', 'signature', 'font'].includes(kind)) throw new HttpError(400, 'Unknown file kind.');
    const name = typeof req.query.name === 'string' ? req.query.name : null;
    const saved = saveFile(req.body as Buffer, kind, req.user!.id, name);
    res.json(saved);
  })
);

// ------------------------------------------------------------------ templates

adminRouter.get(
  '/templates',
  h(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const rows = (
      status
        ? db.prepare('SELECT * FROM templates WHERE status = ? ORDER BY updated_at DESC').all(status)
        : db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all()
    ) as unknown as TemplateRow[];
    res.json(rows.map(toSummary));
  })
);

adminRouter.post(
  '/templates',
  h(async (req: AuthedRequest, res) => {
    const title = requireString(req.body?.title, 'Template name', 120);
    const description = optionalString(req.body?.description, 500);
    const id = newId('tpl_');
    const t = now();
    const layout = req.body?.draft ? sanitizeLayout(req.body.draft) : emptyLayout();
    db.prepare(
      `INSERT INTO templates (id, title, description, status, visibility, draft_json, draft_updated_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', 'all', ?, ?, ?, ?, ?)`
    ).run(id, title, description, layoutJson(layout), t, req.user!.id, t, t);
    logActivity(req.user!.id, 'template_created', title);
    res.status(201).json(toDetail(getTemplateRow(id)!));
  })
);

adminRouter.get(
  '/templates/:id',
  h(async (req, res) => {
    res.json(toDetail(mustTemplate(req.params.id)));
  })
);

/** Save draft: title/description/layout. The layout is sanitised so text boxes never contain wording. */
adminRouter.put(
  '/templates/:id',
  express.json({ limit: '2mb' }),
  h(async (req: AuthedRequest, res) => {
    const row = mustTemplate(req.params.id);
    if (row.status === 'archived') throw new HttpError(409, 'Restore this template from the archive before editing it.');
    const title = req.body?.title !== undefined ? requireString(req.body.title, 'Template name', 120) : row.title;
    const description = req.body?.description !== undefined ? optionalString(req.body.description, 500) : row.description;
    const draft = req.body?.draft !== undefined ? layoutJson(sanitizeLayout(req.body.draft)) : row.draft_json;
    const t = now();
    db.prepare('UPDATE templates SET title = ?, description = ?, draft_json = ?, draft_updated_at = ?, updated_at = ? WHERE id = ?').run(
      title,
      description,
      draft,
      t,
      t,
      row.id
    );
    res.json(toDetail(getTemplateRow(row.id)!));
  })
);

adminRouter.post(
  '/templates/:id/publish',
  h(async (req: AuthedRequest, res) => {
    const row = mustTemplate(req.params.id);
    if (row.status === 'archived') throw new HttpError(409, 'Archived templates cannot be published. Restore it first.');
    const layout = parseLayout(row.draft_json);
    const problems = publishProblems(layout);
    if (problems.length) throw new HttpError(400, problems.join(' '));
    const notes = optionalString(req.body?.notes, 500);
    const json = layoutJson(layout);
    const current = row.current_version_id
      ? (db.prepare('SELECT * FROM template_versions WHERE id = ?').get(row.current_version_id) as VersionRow | undefined)
      : undefined;
    let versionId = current?.id;
    tx(() => {
      // Only create a new version when the layout actually changed.
      if (!current || current.layout_json !== json) {
        const max = db.prepare('SELECT COALESCE(MAX(version_number),0) AS n FROM template_versions WHERE template_id = ?').get(row.id) as { n: number };
        versionId = newId('ver_');
        db.prepare(
          'INSERT INTO template_versions (id, template_id, version_number, layout_json, notes, published_at, published_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(versionId, row.id, Number(max.n) + 1, json, notes, now(), req.user!.id);
      }
      db.prepare("UPDATE templates SET status = 'published', current_version_id = ?, draft_json = ?, updated_at = ? WHERE id = ?").run(
        versionId!,
        json,
        now(),
        row.id
      );
    });
    logActivity(req.user!.id, 'template_published', row.title);
    res.json(toDetail(getTemplateRow(row.id)!));
  })
);

function setStatus(status: 'draft' | 'archived' | 'published', action: string) {
  return h(async (req: AuthedRequest, res) => {
    const row = mustTemplate(req.params.id);
    if (status === 'published' && !row.current_version_id) throw new HttpError(400, 'This template has never been published.');
    db.prepare('UPDATE templates SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), row.id);
    logActivity(req.user!.id, action, row.title);
    res.json(toDetail(getTemplateRow(row.id)!));
  });
}
adminRouter.post('/templates/:id/unpublish', setStatus('draft', 'template_unpublished'));
adminRouter.post('/templates/:id/archive', setStatus('archived', 'template_archived'));
adminRouter.post('/templates/:id/unarchive', setStatus('draft', 'template_unarchived'));

adminRouter.post(
  '/templates/:id/duplicate',
  h(async (req: AuthedRequest, res) => {
    const row = mustTemplate(req.params.id);
    const id = newId('tpl_');
    const t = now();
    db.prepare(
      `INSERT INTO templates (id, title, description, status, visibility, draft_json, draft_updated_at, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', 'all', ?, ?, ?, ?, ?)`
    ).run(id, `Copy of ${row.title}`.slice(0, 120), row.description, row.draft_json, t, req.user!.id, t, t);
    logActivity(req.user!.id, 'template_duplicated', row.title);
    res.status(201).json(toDetail(getTemplateRow(id)!));
  })
);

adminRouter.delete(
  '/templates/:id',
  h(async (req: AuthedRequest, res) => {
    const row = mustTemplate(req.params.id);
    const used = db.prepare('SELECT COUNT(*) AS n FROM batches WHERE template_id = ?').get(row.id) as { n: number };
    if (Number(used.n) > 0) {
      throw new HttpError(409, 'This template has generation history, so it cannot be deleted. Archive it instead.');
    }
    db.prepare('DELETE FROM templates WHERE id = ?').run(row.id);
    logActivity(req.user!.id, 'template_deleted', row.title);
    res.json({ ok: true });
  })
);

adminRouter.get(
  '/templates/:id/versions',
  h(async (req, res) => {
    mustTemplate(req.params.id);
    const rows = db
      .prepare(
        `SELECT v.*, (SELECT COUNT(*) FROM batches b WHERE b.template_version_id = v.id) AS batch_count
           FROM template_versions v WHERE v.template_id = ? ORDER BY v.version_number DESC`
      )
      .all(req.params.id) as unknown as (VersionRow & { batch_count: number })[];
    res.json(rows.map((r) => ({ ...toVersion(r), batchCount: Number(r.batch_count) })));
  })
);

/** Copies an older version into the draft. Publishing afterwards creates a new version; history is never rewritten. */
adminRouter.post(
  '/templates/:id/versions/:versionId/restore',
  h(async (req: AuthedRequest, res) => {
    const row = mustTemplate(req.params.id);
    const v = db.prepare('SELECT * FROM template_versions WHERE id = ? AND template_id = ?').get(req.params.versionId, row.id) as
      | VersionRow
      | undefined;
    if (!v) throw new HttpError(404, 'Version not found.');
    db.prepare('UPDATE templates SET draft_json = ?, draft_updated_at = ?, updated_at = ? WHERE id = ?').run(v.layout_json, now(), now(), row.id);
    logActivity(req.user!.id, 'template_version_restored', `${row.title} v${v.version_number}`);
    res.json(toDetail(getTemplateRow(row.id)!));
  })
);

adminRouter.put(
  '/templates/:id/access',
  h(async (req: AuthedRequest, res) => {
    const row = mustTemplate(req.params.id);
    const visibility = req.body?.visibility === 'all' ? 'all' : 'assigned';
    const ids: string[] = Array.isArray(req.body?.clientIds) ? req.body.clientIds.filter((x: unknown) => typeof x === 'string') : [];
    tx(() => {
      db.prepare('UPDATE templates SET visibility = ?, updated_at = ? WHERE id = ?').run(visibility, now(), row.id);
      db.prepare('DELETE FROM template_access WHERE template_id = ?').run(row.id);
      const ins = db.prepare(
        "INSERT INTO template_access (template_id, client_id) SELECT ?, id FROM users WHERE id = ? AND role = 'client'"
      );
      for (const cid of ids.slice(0, 1000)) ins.run(row.id, cid);
    });
    logActivity(req.user!.id, 'template_access_changed', row.title);
    res.json(toDetail(getTemplateRow(row.id)!));
  })
);

// ------------------------------------------------------------------ clients

function clientRow(id: string) {
  const r = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'client'").get(id) as any;
  if (!r) throw new HttpError(404, 'Client not found.');
  return r;
}

function clientWithStats(r: any) {
  const s = db
    .prepare('SELECT COUNT(*) AS batches, COALESCE(SUM(success),0) AS certificates, MAX(created_at) AS last FROM batches WHERE client_id = ?')
    .get(r.id) as any;
  const templateIds = (db.prepare('SELECT template_id FROM template_access WHERE client_id = ?').all(r.id) as any[]).map((x) => x.template_id);
  return {
    ...toPublicUser(r),
    isPublic: r.id === GUEST_ID,
    batchCount: Number(s.batches) || 0,
    certificateCount: Number(s.certificates) || 0,
    lastGeneratedAt: s.last ?? null,
    templateIds,
  };
}

adminRouter.get(
  '/clients',
  h(async (_req, res) => {
    const rows = db.prepare("SELECT * FROM users WHERE role = 'client' ORDER BY name COLLATE NOCASE").all() as any[];
    res.json(rows.map(clientWithStats));
  })
);

adminRouter.post(
  '/clients',
  h(async (req: AuthedRequest, res) => {
    const name = requireString(req.body?.name, 'Name', 120);
    const email = requireString(req.body?.email, 'Email', 200).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists.');
    const user = createUser({ email, name, password, role: 'client', organisation: optionalString(req.body?.organisation, 200) });
    const templateIds: string[] = Array.isArray(req.body?.templateIds) ? req.body.templateIds : [];
    const ins = db.prepare('INSERT OR IGNORE INTO template_access (template_id, client_id) SELECT id, ? FROM templates WHERE id = ?');
    for (const tid of templateIds.slice(0, 500)) if (typeof tid === 'string') ins.run(user.id, tid);
    logActivity(req.user!.id, 'client_created', `${name} <${email}>`);
    res.status(201).json(clientWithStats(user));
  })
);

adminRouter.put(
  '/clients/:id',
  h(async (req: AuthedRequest, res) => {
    const r = clientRow(req.params.id);
    const name = req.body?.name !== undefined ? requireString(req.body.name, 'Name', 120) : r.name;
    let email = r.email;
    if (req.body?.email !== undefined && r.id !== GUEST_ID) {
      email = requireString(req.body.email, 'Email', 200).toLowerCase();
      if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
      const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, r.id);
      if (clash) throw new HttpError(409, 'Another account already uses this email.');
    }
    const organisation = req.body?.organisation !== undefined ? optionalString(req.body.organisation, 200) || null : r.organisation;
    const active = req.body?.active !== undefined ? (req.body.active ? 1 : 0) : r.active;
    db.prepare('UPDATE users SET name = ?, email = ?, organisation = ?, active = ? WHERE id = ?').run(name, email, organisation, active, r.id);
    if (!active) endAllSessionsForUser(r.id);
    if (r.active !== active) logActivity(req.user!.id, active ? 'client_activated' : 'client_deactivated', name);
    else logActivity(req.user!.id, 'client_updated', name);
    res.json(clientWithStats(clientRow(r.id)));
  })
);

adminRouter.post(
  '/clients/:id/password',
  h(async (req: AuthedRequest, res) => {
    const r = clientRow(req.params.id);
    if (r.id === GUEST_ID) throw new HttpError(400, 'The public client has no password.');
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), r.id);
    endAllSessionsForUser(r.id);
    logActivity(req.user!.id, 'client_password_reset', r.name);
    res.json({ ok: true });
  })
);

adminRouter.put(
  '/clients/:id/templates',
  h(async (req: AuthedRequest, res) => {
    const r = clientRow(req.params.id);
    const ids: string[] = Array.isArray(req.body?.templateIds) ? req.body.templateIds.filter((x: unknown) => typeof x === 'string') : [];
    tx(() => {
      db.prepare('DELETE FROM template_access WHERE client_id = ?').run(r.id);
      const ins = db.prepare('INSERT INTO template_access (template_id, client_id) SELECT id, ? FROM templates WHERE id = ?');
      for (const tid of ids.slice(0, 1000)) ins.run(r.id, tid);
    });
    logActivity(req.user!.id, 'client_access_changed', r.name);
    res.json(clientWithStats(clientRow(r.id)));
  })
);
