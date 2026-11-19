import express, { Router } from 'express';
import { createUser, endAllSessionsForUser, getUserByEmail, hashPassword, passwordProblem, requireRole, toPublicUser, type AuthedRequest } from '../auth.ts';
import { db, logActivity, newId, now } from '../db.ts';
import { h, HttpError, isEmail, optionalString, requireString } from '../http.ts';
import { saveFile } from '../files.ts';
import { invalidateResets, passwordHelpRoutes, resolveHelpRequests } from '../passwordResets.ts';
import { getTemplateRow, parseLayout, toSummary, type TemplateRow } from '../templates.ts';
import type { ActivityRecord, ActivityStatus, UserAccount } from '../../shared/types.ts';

// Admin portal API: Users (the people/organisations certificates are issued
// for — formerly "Clients"), the Activities of each User, a read-only list of
// published templates and the dashboard. Certificate generation on a User's
// behalf lives in routes/user.ts (/api/admin/gen). Admins never upload, edit
// or delete templates.
export const adminRouter = Router();
adminRouter.use(requireRole('admin'));

const ACTIVITY_STATUSES: ActivityStatus[] = ['planned', 'active', 'completed', 'archived'];

export function activityToJson(r: any): ActivityRecord {
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    name: r.name,
    date: r.date,
    description: r.description,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.batch_count !== undefined ? { batchCount: Number(r.batch_count) || 0 } : {}),
    ...(r.certificate_count !== undefined ? { certificateCount: Number(r.certificate_count) || 0 } : {}),
  };
}

function dateOrEmpty(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'Enter the date as YYYY-MM-DD.');
  return v;
}

async function logoFile(v: unknown): Promise<string | null> {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') throw new HttpError(400, 'Invalid logo.');
  if (!(await db.one("SELECT 1 FROM files WHERE id = ? AND kind = 'logo'", [v]))) throw new HttpError(400, 'Upload the logo again.');
  return v;
}

// ------------------------------------------------------------------ dashboard

adminRouter.get(
  '/stats',
  h(async (_req, res) => {
    const count = async (sql: string, ...p: unknown[]) => Number((await db.one<{ n: number }>(sql, p))?.n) || 0;
    const perActivity = await db.all(
      `SELECT a.id, a.name, a.date, a.status, u.id AS user_id, u.name AS user_name,
              COALESCE((SELECT SUM(b.success) FROM batches b WHERE b.activity_id = a.id), 0) AS certificates,
              (SELECT COUNT(*) FROM batches b WHERE b.activity_id = a.id) AS batches
         FROM activities a JOIN users u ON u.id = a.user_id
        ORDER BY certificates DESC, a.updated_at DESC LIMIT 50`
    );
    res.json({
      users: await count("SELECT COUNT(*) n FROM users WHERE role = 'user' AND password_hash <> 'disabled'"),
      activeUsers: await count("SELECT COUNT(*) n FROM users WHERE role = 'user' AND active = 1 AND password_hash <> 'disabled'"),
      activities: await count("SELECT COUNT(*) n FROM activities WHERE user_id IS NOT NULL AND status <> 'archived'"),
      publishedTemplates: await count("SELECT COUNT(*) n FROM templates WHERE status = 'published'"),
      certificates: await count('SELECT COALESCE(SUM(success),0) n FROM batches'),
      batches: await count('SELECT COUNT(*) n FROM batches'),
      perActivity: perActivity.map((r) => ({
        id: r.id,
        name: r.name,
        date: r.date,
        status: r.status,
        userId: r.user_id,
        userName: r.user_name,
        batches: Number(r.batches) || 0,
        certificates: Number(r.certificates) || 0,
      })),
    });
  })
);

// ------------------------------------------------------------------ files (User logos)

adminRouter.post(
  '/files',
  express.raw({ type: () => true, limit: '4mb' }),
  h(async (req: AuthedRequest, res) => {
    if (req.query.kind !== 'logo') throw new HttpError(400, 'Admins can only upload logos.');
    const name = typeof req.query.name === 'string' ? req.query.name : null;
    res.json(await saveFile(req.body as Buffer, 'logo', req.user!.id, name, {}));
  })
);

// ------------------------------------------------------------------ template audit log (view only)

/** Published templates (newest first), with their recommendation. Drafts and archived templates stay with the Super Admin. */
adminRouter.get(
  '/template-log',
  h(async (_req, res) => {
    const rows = await db.all<TemplateRow>("SELECT * FROM templates WHERE status = 'published' ORDER BY created_at DESC");
    const templates = await Promise.all(
      rows.map(async (r) => {
        const draft = parseLayout(r.draft_json);
        return {
          ...(await toSummary(r)),
          referencePreviewFileId: draft.referencePages[0]?.previewFileId ?? null,
          blankPreviewFileId: draft.pages[0]?.previewFileId ?? null,
          pageCount: draft.pages.length,
        };
      })
    );
    const events = await db.all(
      `SELECT a.*, u.name AS user_name FROM activity a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.action IN ('template_published', 'template_unpublished', 'template_recommended', 'template_unrecommended')
        ORDER BY a.created_at DESC LIMIT 100`
    );
    res.json({
      templates,
      events: events.map((e) => ({ id: e.id, userId: e.user_id, userName: e.user_name, action: e.action, detail: e.detail, createdAt: e.created_at })),
    });
  })
);

/** Mark (or unmark) a template as recommended: "use this template". */
adminRouter.put(
  '/templates/:id/recommend',
  h(async (req: AuthedRequest, res) => {
    const row = await getTemplateRow(req.params.id);
    if (!row) throw new HttpError(404, 'Template not found.');
    const on = !!req.body?.recommended;
    if (on && row.status !== 'published') throw new HttpError(400, 'Only published templates can be recommended.');
    await db.run('UPDATE templates SET recommended_by = ?, recommended_at = ? WHERE id = ?', [on ? req.user!.id : null, on ? now() : null, row.id]);
    await logActivity(req.user!.id, on ? 'template_recommended' : 'template_unrecommended', row.title);
    res.json(await toSummary((await getTemplateRow(row.id))!));
  })
);

// ------------------------------------------------------------------ users

const USER_SELECT = `SELECT u.*,
    (SELECT COUNT(*) FROM activities a WHERE a.user_id = u.id) AS activity_count,
    (SELECT COUNT(*) FROM batches b WHERE b.client_id = u.id) AS batch_count,
    COALESCE((SELECT SUM(b.success) FROM batches b WHERE b.client_id = u.id), 0) AS certificate_count,
    (SELECT MAX(b.created_at) FROM batches b WHERE b.client_id = u.id) AS last_generated
  FROM users u WHERE u.role = 'user' AND u.password_hash <> 'disabled'`;

function userJson(r: any): UserAccount {
  return {
    ...toPublicUser(r),
    logoFileId: r.logo_file_id ?? null,
    notes: r.notes ?? '',
    activityCount: Number(r.activity_count) || 0,
    batchCount: Number(r.batch_count) || 0,
    certificateCount: Number(r.certificate_count) || 0,
    lastGeneratedAt: r.last_generated ?? null,
  };
}

async function mustUser(id: string) {
  const r = await db.one(`${USER_SELECT} AND u.id = ?`, [id]);
  if (!r) throw new HttpError(404, 'User not found.');
  return r;
}

adminRouter.get(
  '/users',
  h(async (_req, res) => {
    const rows = await db.all(`${USER_SELECT} ORDER BY lower(u.name)`);
    res.json(rows.map(userJson));
  })
);

adminRouter.get(
  '/users/:id',
  h(async (req, res) => {
    res.json(userJson(await mustUser(req.params.id)));
  })
);

adminRouter.post(
  '/users',
  h(async (req: AuthedRequest, res) => {
    const name = requireString(req.body?.name, 'Name', 120);
    const email = requireString(req.body?.email, 'Email', 200).toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
    if (await getUserByEmail(email)) throw new HttpError(409, 'An account with this email already exists.');
    const user = await createUser({ email, name, password, role: 'user', organisation: optionalString(req.body?.organisation, 200), createdBy: req.user!.id });
    await db.run('UPDATE users SET logo_file_id = ?, notes = ?, active = ? WHERE id = ?', [
      await logoFile(req.body?.logoFileId),
      optionalString(req.body?.notes, 2000),
      req.body?.active === false ? 0 : 1,
      user.id,
    ]);
    await logActivity(req.user!.id, 'user_created', `${name} <${email}>`);
    res.status(201).json(userJson(await mustUser(user.id)));
  })
);

adminRouter.put(
  '/users/:id',
  h(async (req: AuthedRequest, res) => {
    const r = await mustUser(req.params.id);
    const b = req.body || {};
    const name = b.name !== undefined ? requireString(b.name, 'Name', 120) : r.name;
    let email = r.email;
    if (b.email !== undefined) {
      email = requireString(b.email, 'Email', 200).toLowerCase();
      if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
      if (await db.one('SELECT id FROM users WHERE lower(email) = ? AND id <> ?', [email, r.id])) throw new HttpError(409, 'Another account already uses this email.');
    }
    const organisation = b.organisation !== undefined ? optionalString(b.organisation, 200) || null : r.organisation;
    const logo = b.logoFileId !== undefined ? await logoFile(b.logoFileId) : r.logo_file_id;
    const notes = b.notes !== undefined ? optionalString(b.notes, 2000) : r.notes;
    const active = b.active !== undefined ? (b.active ? 1 : 0) : r.active;
    if (email !== r.email || !active) await invalidateResets(r.id);
    await db.run('UPDATE users SET name = ?, email = ?, organisation = ?, logo_file_id = ?, notes = ?, active = ?, updated_at = ? WHERE id = ?', [
      name,
      email,
      organisation,
      logo,
      notes,
      active,
      now(),
      r.id,
    ]);
    if (!active) await endAllSessionsForUser(r.id);
    await logActivity(req.user!.id, r.active !== active ? (active ? 'user_activated' : 'user_deactivated') : 'user_updated', name);
    res.json(userJson(await mustUser(r.id)));
  })
);

adminRouter.post(
  '/users/:id/password',
  h(async (req: AuthedRequest, res) => {
    const r = await mustUser(req.params.id);
    const password = String(req.body?.password || '');
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem);
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hashPassword(password), now(), r.id]);
    await endAllSessionsForUser(r.id);
    await resolveHelpRequests(r.id, req.user!.id);
    await logActivity(req.user!.id, 'user_password_reset', r.name);
    res.json({ ok: true });
  })
);

/** Users with generated certificates are deactivated instead (history and verification must stay linked). */
adminRouter.delete(
  '/users/:id',
  h(async (req: AuthedRequest, res) => {
    const r = await mustUser(req.params.id);
    if (Number(r.batch_count) > 0) throw new HttpError(409, 'This user has generated certificates. Deactivate the account instead.');
    await db.run('DELETE FROM users WHERE id = ?', [r.id]);
    await logActivity(req.user!.id, 'user_deleted', r.name);
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ activities (under each User)

const ACTIVITY_SELECT = `SELECT a.*, u.name AS user_name,
    (SELECT COUNT(*) FROM batches b WHERE b.activity_id = a.id) AS batch_count,
    COALESCE((SELECT SUM(b.success) FROM batches b WHERE b.activity_id = a.id), 0) AS certificate_count
  FROM activities a JOIN users u ON u.id = a.user_id`;

async function mustActivity(id: string) {
  const r = await db.one(`${ACTIVITY_SELECT} WHERE a.id = ?`, [id]);
  if (!r) throw new HttpError(404, 'Activity not found.');
  return r;
}

adminRouter.get(
  '/activities',
  h(async (req, res) => {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
    const rows = await db.all(`${ACTIVITY_SELECT} ${userId ? 'WHERE a.user_id = ?' : ''} ORDER BY a.date DESC, lower(a.name)`, userId ? [userId] : []);
    res.json(rows.map(activityToJson));
  })
);

function activityFields(b: any, prev?: any) {
  return {
    name: b.name !== undefined || !prev ? requireString(b.name, 'Activity name', 160) : prev.name,
    date: b.date !== undefined ? dateOrEmpty(b.date) : prev?.date ?? '',
    description: b.description !== undefined ? optionalString(b.description, 2000) : prev?.description ?? '',
    status: b.status !== undefined ? (ACTIVITY_STATUSES.includes(b.status) ? b.status : 'active') : prev?.status ?? 'active',
  };
}

adminRouter.post(
  '/users/:id/activities',
  h(async (req: AuthedRequest, res) => {
    const u = await mustUser(req.params.id);
    const f = activityFields(req.body || {});
    const id = newId('acv_');
    const t = now();
    await db.run('INSERT INTO activities (id, user_id, name, date, description, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      id,
      u.id,
      f.name,
      f.date,
      f.description,
      f.status,
      req.user!.id,
      t,
      t,
    ]);
    await logActivity(req.user!.id, 'activity_created', `${u.name}: ${f.name}`);
    res.status(201).json(activityToJson(await mustActivity(id)));
  })
);

adminRouter.put(
  '/activities/:id',
  h(async (req: AuthedRequest, res) => {
    const r = await mustActivity(req.params.id);
    const f = activityFields(req.body || {}, r);
    await db.run('UPDATE activities SET name = ?, date = ?, description = ?, status = ?, updated_at = ? WHERE id = ?', [f.name, f.date, f.description, f.status, now(), r.id]);
    await logActivity(req.user!.id, 'activity_updated', `${r.user_name}: ${f.name}`);
    res.json(activityToJson(await mustActivity(r.id)));
  })
);

/** Certificates generated in the activity stay valid; their batches simply lose the activity link. */
adminRouter.delete(
  '/activities/:id',
  h(async (req: AuthedRequest, res) => {
    const r = await mustActivity(req.params.id);
    await db.run('DELETE FROM activities WHERE id = ?', [r.id]);
    await logActivity(req.user!.id, 'activity_deleted', `${r.user_name}: ${r.name}`);
    res.json({ ok: true });
  })
);

// ------------------------------------------------------------------ forgotten passwords of Users
passwordHelpRoutes(adminRouter, 'user');
