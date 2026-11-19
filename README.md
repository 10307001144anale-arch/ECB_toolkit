# CertiGen — Certificate Generation Toolkit of the Election Commission of Bhutan

CertiGen has three connected portals, each with its own sign-in page and a role badge in the header:

| Portal | Path | Sign in | Badge | Who |
| --- | --- | --- | --- | --- |
| **Super Admin** | `/superadmin` | `/superadmin/login` | navy | Owns the certificate templates: upload, field design, testing, publishing |
| **Admin** | `/admin` | `/admin/login` | orange | Manages Users and their Activities; generates certificates on a User's behalf |
| **User** | `/` | `/login` | yellow | Picks a published template, writes the wording, adds one participant or a list, and generates |

> **The Super Admin designs and publishes the templates. Admins look after the Users and their Activities. Users (or Admins for them) write the wording and supply the participants. The system generates the certificates.**

All three portals share one data layer (PostgreSQL + Storage). Every signed-in browser keeps a live connection (`/api/events`, Server-Sent Events); after any change the server says *which* data changed (templates, users, activities, batches…) and open pages reload it — a template published by the Super Admin appears in the Admin and User portals without a manual reload.

### Role permissions

| Capability | Super Admin | Admin | User |
| --- | :---: | :---: | :---: |
| Upload templates (PDF, PNG, JPG, SVG) | ✅ | — | — |
| Configure fields, fonts, sizes, colours, alignment (designer) | ✅ | — | — |
| Rename templates (inline) | ✅ | — | — |
| Test templates — Single and Bulk, also before publishing (never saved or counted) | ✅ | — | — |
| Publish / unpublish, version history, restore, archive | ✅ | — | — |
| Delete templates (confirmation; blocked once certificates exist — archive instead) | ✅ | — | — |
| Upload or auto-generate the reference template shown to Admins and Users | ✅ | — | — |
| Create / edit / deactivate **Admin** accounts | ✅ | — | — |
| Add, edit, delete **Users** (name, organization, contact email, logo, notes, status) | — | ✅ | — |
| Add, edit, delete **Activities** of each User (name, date, description, status) | — | ✅ | — |
| Generate certificates for a User (and optionally one of their Activities) | — | ✅ | — |
| Dashboard: users, activities, published templates, certificates per activity | — | ✅ | — |
| Generate certificates for themself (Single or Bulk), history, wording presets | — | — | ✅ |
| Audit log, revoke certificates | ✅ | — | — |

Roles are enforced in the browser's route guards (a signed-in account that opens another portal sees a “this area is for … accounts” page; each role can only sign in on its own sign-in page) **and** in the data layer: `/api/superadmin/*`, `/api/admin/*` (incl. `/api/admin/gen/*`) and `/api/user/*` each accept exactly one role. Only **published** templates can be used by Admins and Users; Admins cannot upload, edit or delete templates; the Super Admin has no User or Activity management.

### Reference template

Wherever Admins and Users see a template (cards, galleries, selection screen) they see the **reference template** — a filled-in sample certificate — never the blank design. The reference is the image the Super Admin uploaded or generated; when publishing a template without one, it is generated automatically from sample data. It also stays visible in a side panel (with the ECB side bands) while entering data. The blank design is only used in the Super Admin editor and for the final PDF.

### Data model

| Table | Fields (main) | Notes |
| --- | --- | --- |
| `users` | id, name, email (sign-in + contact), role (`superadmin` / `admin` / `user`), organisation, logo_file_id, notes, active (status) | “User” = the former *Client* |
| `activities` | id, user_id, name, date, description, status (`planned` / `active` / `completed` / `archived`) | Belong to a User |
| `templates` | id, title (editable), layout (file, fields, guides), reference_image_file_id, status (`draft` / `published` / `archived`), created_by | Published = available to everyone |
| `batches` (history) | id, client_id (= the User), activity_id (optional), created_by (Admin who generated it, or empty), template, totals, created_at | Test runs are never stored |
| `certificates` | id, batch_id, status | Verification |

**Migrations** run automatically on start. v3 introduced the three portals; **v4** turns each former *Client* into its Users: Users inherit the client's organisation and logo, every activity moves to a User of its client (other users of the same client get their own copy, with their batches), and batches record which Admin generated them. The old `clients`, `assignments` and `user_clients` tables are kept untouched for reference.

The auth layer (`server/auth.ts`, `src/lib/auth.tsx`) is self-contained (sessions in PostgreSQL) so it can be swapped for Supabase Auth or Firebase later without touching the portals.

### ECB brand

- **Colours** (theme tokens in `src/index.css`): White (60%), Naval Abyss `#002F6C` (20%), Joyful Orange `#F68D2E` (10%), Middle Yellow `#FFE900` (5%), neutrals Jet Black / Gray `#3A3A3A` / Mid Gray `#808080` / Light Gray `#E6E6E6`, plus the allowed tints, tones and shades (`navy-tint`, `orange-shade`…). Primary buttons are Naval Abyss, accent buttons Joyful Orange.
- **Typography**: Roboto for the interface (bundled in `public/fonts`, Apache 2.0), utilities `text-display`, `text-h1`, `text-h2`, `text-h3` follow the ECB scale. Times New Roman for official documents and certificate text (drawn in PDFs with its metric-compatible twin Liberation Serif, because Times New Roman itself may not be redistributed). **DDC Uchen** (bundled) for Dzongkha in the interface, previews and PDFs. All three are in the designer's font list.
- **Logo**: full-colour ECB logo (`public/brand/ecb-logo.png`) on white or Naval Abyss; the EB submark (`public/brand/eb-submark.png`) for the collapsed sidebar, favicon and small spaces. Header lockup = logo, orange divider, Dzongkha name, “Election Commission of Bhutan”. Logos are never stretched, recoloured or given effects.
- **ECB ribbon** (`src/components/shared/brand.tsx`): flat navy curve with orange and yellow edges rising left to right — at the bottom of the sign-in screens and as the footer band with the tagline and www.ecb.bt; a small navy/orange/yellow bar divider under page titles; yellow/orange and navy side bands on the reference panel.
- **Components**: navy sidebar with an orange active marker, white top bar with the role badge, soft shadows only on floating elements; the editor uses a Light Gray canvas, white artboard, Naval Abyss panels and orange handles and guides.

### Where data lives

| Data | Stored in |
| --- | --- |
| Accounts (incl. User organisation/notes), activities, templates, versions, field configuration, presets, batch records, certificate IDs and verification status, OAuth tokens (encrypted), audit log | **Supabase PostgreSQL** |
| Blank and reference certificate files, page previews, reference images, fonts, admin signatures, User logos | **Supabase Storage** (private bucket) — paths recorded in PostgreSQL |
| Participant spreadsheets, photos, user signatures, generated PDFs | **The user's browser only** (never uploaded) |

---

## Requirements

- **Node.js 22.13 or newer** and npm
- A **Supabase** project (free tier is enough) — see *Supabase setup* below

## Quick start

```bash
npm install
cp .env.example .env          # then edit: SUPABASE_*, APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD (APP_SECRET for production)
npm run dev                   # opens http://localhost:3001/ (User portal); /admin and /superadmin for the others
```

On the first start the **Super Admin** in `ADMIN_EMAIL` / `ADMIN_PASSWORD` is created (only when no Super Admin exists yet). Remove `ADMIN_PASSWORD` from `.env` afterwards. Sign in at `/superadmin/login`, then create Admin accounts under **Admin accounts**; Admins create the User accounts. You can also create or reset a Super Admin at any time:

```bash
npm run create-admin -- admin@example.org "Full Name"
```

Production:

```bash
npm run build
npm start                     # serves dist/ and the API; APP_SECRET must be set
```

On start the server connects to Supabase, creates/updates the database tables (migrations run automatically) and creates the private Storage bucket if it is missing.

---

## How it works

### Super Admin

1. **Templates → New template**: upload **two versions of the same design** (PDF, PNG, JPG or SVG, up to 25 MB, up to 10 pages; SVG drawings are converted to a high-resolution image in the browser):
   - **Upload A — complete reference certificate**: the finished example. A locked visual guide; never printed.
   - **Upload B — blank certificate design**: the background of every certificate; stored unchanged.
2. **Rename** inline: click the template name (or the pencil), press Enter or click away.
3. **Designer** — a design-tool workspace (see *Template editor*).
4. **Test** (the *Test* button): a full-screen test view inside the Super Admin portal — no User, Admin or Activity needed, and it works on drafts:
   - **Single**: a form built from the template's fields with a live preview that updates while typing; *Generate test PDF*.
   - **Bulk**: upload CSV/Excel, map columns to fields (automatic, adjustable), validation per row, a paginated table and certificate-by-certificate preview, **Download sample CSV** (columns = the template's field keys); generate all valid rows, then download each PDF or a ZIP.
   - Test files are named `TEST_…`, carry the ID `CG-TEST-0000-0000`, are never saved to any history or count, and are discarded when the view closes.
5. **Reference template** (template menu): upload an image, generate one from sample data, or reuse Upload A. Publishing generates one automatically when there is none.
6. **Publish**: creates version 1, 2, 3…; the template immediately appears in the Admin and User portals. Unpublish or archive hides it again.
7. **Delete**: a confirmation dialog shows the users, batches and certificates linked to the template. Templates with certificates can only be archived (restore any time from *Archived*).
8. **Admin accounts**: create the Admins.

### Admin

1. **Users** (formerly *Clients*): add, edit, set inactive or delete Users — name, organization (printed as the issuer on the verification page), contact email (also the sign-in), logo, notes and status. Users with generated certificates can only be set to inactive.
2. **Activities**: each User's events or programmes — name, date, description, status. Add them from the User's page or the Activities page.
3. **Generate certificates**: the same flow as the User portal, with one extra choice first — **the User** and, optionally, **one of their Activities**. The batch is saved to that User (and Activity) and appears in the User's history, marked as generated by the Admin.
4. **History** of every User's batches, **Templates** gallery (published templates, shown as reference certificates) and the **Dashboard** (certificates per activity).

### User (guided workflow — 3 steps)

1. **Template & wording** — choose a published template (shown as its reference certificate, with a larger reference panel beside the list), keep or edit the suggested wording, format it, insert fields such as `{{name}}`; wording presets.
2. **Participant data** — **Single certificate** (a form for one participant, with an optional photo) or **Bulk**: upload `.xlsx`, `.xls` or `.csv`, or import from Microsoft Excel or Google Sheets; automatic column matching; photos and signatures. The reference certificate stays visible beside the form.
3. **Preview & generate** — validation, preview, generation with progress and Cancel; download individual PDFs, one combined PDF or a ZIP.

**Editing later:** in **History**, click **Edit** on a batch. The corrected certificates get new IDs; the old batch can be marked as *replaced*.

There is **no limit on the number of certificates** per batch (only a 50 MB spreadsheet file-size safety limit, and an abuse limit of 30 batch starts per hour per account).

### Template editor

| Area | What it does |
| --- | --- |
| **Tool rail** (left) | Select `V`, Hand `H`, Zoom `Z`, Text `T`, Date `D`, QR `Q`, Photo `P`, Signature `S` |
| **Artboard** | The page on a grey canvas. Pan with **Space + drag**, the middle mouse button, the Hand tool or the mouse wheel; zoom with **Ctrl + wheel**, the Zoom tool (Alt = out), `Ctrl +` / `Ctrl −`, **Fit** (`Ctrl+0`) and **100%** (`Ctrl+1`) |
| **Selection** | Click, **Shift+click** to add, drag on empty canvas to box-select, `Ctrl+A` all. 8 resize handles (Shift keeps proportions), a **rotate** handle (Shift = 15° steps), arrow keys nudge (Shift = 10×), Shift while dragging constrains to an axis |
| **Rulers, guides, grid** | Rulers in **px, mm, cm or in**, synced with zoom and pan. Drag from a ruler to create a guide; drag it back onto the ruler or double-click it to remove it. **Grid** toggle (`Ctrl+'`) with adjustable size |
| **Snapping** | To the grid (when shown), guides, page edges/centre and other fields' edges and centres, with navy **smart alignment lines**; selection handles and guides are orange |
| **Align & distribute** | Left, centre, right, top, middle, bottom (one field → page, several → each other); distribute horizontally/vertically (3+) |
| **Edit** | Undo `Ctrl+Z`, redo `Ctrl+Y` / `Ctrl+Shift+Z`, duplicate `Ctrl+D`, copy / cut / paste `Ctrl+C/X/V`, delete `Del`, save `Ctrl+S` |
| **Right panel** | **Properties** (X, Y, W, H in the chosen unit, rotation, field settings, font, size, colour, alignment) · **Layers** (show/hide and lock — editor only, still printed —, double-click to rename, drag or arrows to reorder) · **Document** (design files, view mode, description, guides, fonts, reference calibration, publish checklist) |
| **Status bar** | Zoom %, cursor X/Y and selection size in the chosen unit, artboard view (Blank / Overlay / Reference), pages |

Rotation is printed exactly as shown: the PDF renderer rotates each field around its centre.

### Placeholders

- Standard syntax: `{{field_name}}` — letters, numbers and underscores, e.g. `{{name}}`, `{{cid}}`, `{{workshop}}`, `{{date}}`.
- Several placeholders per box; all other text is kept exactly as written.
- Alternative syntax `(field_name)` is recognised **only** for registered names (spreadsheet columns, system fields and fields already used with `{{ }}`), so ordinary text in brackets is never replaced.
- System fields: `{{certificateId}}`, `{{row}}`, `{{today}}`.

### Verification

Each generated certificate gets a unique ID (e.g. `CG-7K3M-9QX2-PL4D`) stored in the database. QR boxes in verification mode link to `APP_URL/verify/<id>`, a public page that shows whether the certificate is **valid**, **revoked** or **not found**. Rows that failed or were cancelled are marked void. Administrators can revoke a certificate (`POST /api/admin/certificates/:id/revoke`).

---

## Privacy and data handling

- Spreadsheets, photos and signatures are processed **in the browser**. PDFs are generated in the browser.
- Generated PDFs — and the batch's working data (participant rows, photos, signatures, crops) so it can be **edited and generated again from History** — are stored in the browser's IndexedDB on that device for **7 days** and then deleted automatically. Users can delete them sooner from **History**. None of this is uploaded.
- The server stores: accounts, templates, presets (wording), batch records (wording + column mapping snapshot, counts) and, per certificate, the ID, status and — only if the user chooses a column for it — the recipient name shown on the verification page.
- Microsoft Excel and Google Sheets rows pass through the server to the user's browser and are not stored or logged. Access is read-only.
- No participant data is ever sent to Google/Gemini. The optional AI box suggestion sends only the blank template image, after the Super Admin ticks a consent box.
- Server logs contain error messages only, never request bodies.

## Security

- Passwords hashed with scrypt; minimum 10 characters with letters and numbers.
- Sessions: random 256-bit tokens in `HttpOnly`, `SameSite=Lax` cookies (`Secure` over HTTPS); only a SHA-256 hash is stored. 7-day sliding expiry. Deactivating a user or changing a password ends their sessions.
- CSRF: every state-changing API request must carry `X-Requested-With: certigen`.
- Role checks on every route (`/api/superadmin/*` Super Admin only, `/api/admin/*` Admin only, `/api/user/*` User only) and per-portal sign-in. Users only see active clients they are linked to, their non-archived activities, published templates assigned to those activities, and only their own presets and batches. Template files are served only to accounts entitled to them.
- Login throttling (8 failures per 15 minutes per IP + email).
- **My profile** (all portals, sidebar → My profile): profile photo, name, sign-in email (needs the current password) and password.
- **Forgot password** (link on every sign-in page, all three portals): email → 6-digit code → new password.
  - The code is emailed with **Resend** (`RESEND_API_KEY`, `MAIL_FROM`; SMTP also works). It is generated with `crypto.randomInt`, stored only as an HMAC-SHA256 (keyed with `APP_SECRET`), expires after **5 minutes**, works **once**, and is locked after **5 wrong tries**. A new code replaces the old one; **Resend code** has a 60-second cooldown.
  - A correct code is exchanged for a **10-minute reset token** (random 256-bit, SHA-256 stored). The new password must have 10+ characters with letters and numbers and match the confirmation; it is hashed with scrypt like every password. Afterwards every code, token and link of the account stops working and all its sessions end.
  - Anti-abuse: the same answer whether or not the email has an account; 30 requests/hour per IP and 5 per email; 30 code checks per 15 minutes per IP and 10 per email; codes never appear in API responses or logs.
  - **Inbox ownership is required, for every role.** The account is found by its registered email in `users` (case-insensitive) and the code goes only to that stored address — recipient, role or id fields sent by the browser are ignored. There is no other self-service way in: without working email (or when delivery fails) nothing is sent and nobody else is asked to approve it.
  - Changing an account's email (My profile, Admin → Users, Super Admin → Admin accounts) or deactivating it cancels every pending code, token and link, so a code sent to an old inbox stops working.
  - The answer is sent before the email goes out, and unknown emails do the same work as real ones, so response times do not reveal which emails have accounts.
  - Administrators keep their normal account tools (**Set new password**, **Create reset link**). Super Admin without email: `npm run create-admin -- email "Name"`.
  - Check the email settings with `npm run test-email -- you@example.com`.
- Uploads are checked by their real content (magic bytes) and size, not by the file name.
- Microsoft and Google tokens are encrypted at rest (AES-256-GCM with `APP_SECRET`), stored per account, and never sent to the browser. Disconnecting deletes them (Google tokens are also revoked).
- Production adds a Content-Security-Policy, HSTS and other security headers.

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (choose a region near your users, e.g. Singapore). Save the database password.
2. **Project Settings → API**: copy the **Project URL** → `SUPABASE_URL`, and the **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is used only by the server; never put it in frontend code or commit it.
3. **Connect** (top bar) → **Connection string → Session pooler**: copy the URI and put your database password in it → `SUPABASE_DB_URL`
   (e.g. `postgresql://postgres.abcd1234:PASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`). Use the *Session pooler* — Render cannot reach the IPv6-only direct connection.
4. Put the three values in `.env` (local) and in Render → **Environment**. Start the app: tables, indexes and the private bucket `certificate-templates` are created automatically.

Security set-up done by the app:

- Every table has **Row Level Security enabled with no policies**, and the `anon` / `authenticated` roles have no table privileges — Supabase's public REST API cannot read or change anything. The server connects as the database owner.
- The Storage bucket is **private**. Files are served only through the app's `/api/files/:id`, which checks the signed-in user: Super Admins and Admins see everything; Users only files of published templates available to them, their templates' reference images and their clients' logos (never Upload A unless the Super Admin chose it as the reference image). Short-lived signed URLs are available server-side (`signedUrl()` in `server/storage.ts`).
- Uploads are checked by their real content (magic bytes), type and size before they reach Storage.

Storage layout: `templates/{template_id}/blank/…`, `reference/…`, `blank/previews/`, `reference/previews/`, `fonts/…`, `assets/…` (admin signatures), `versions/{version_id}/layout.json` (copy of each published layout). Uploads made before a template exists go to `templates/_unassigned/` and are moved into the template folder when it is saved.

## Migrating from the old SQLite version

The previous version stored data in `data/certigen.sqlite` and `data/files/` (or in Neon). Move it once:

```bash
# .env must contain SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run migrate:supabase                  # from ./data (or DATA_DIR)
npm run migrate:supabase -- --from-neon   # or: from the Neon copy (needs DATABASE_URL)
npm run migrate:supabase -- --verify      # only compare again
```

What it does: copies a **backup** of the old database and files to `backups/<date>/`; copies users, templates, versions, access, presets, batches, certificates, OAuth connections and activity (existing rows are skipped, so it is safe to run again); uploads every file to Storage under its template's folder with a SHA-256 checksum; then **verifies** row counts and downloads every file back to compare checksums, writing `backups/migration-report-*.json`. The old database and files are never changed or deleted.

Notes: the old *Public (no sign-in)* account is kept (deactivated) so its history and certificate verification keep working. Migrated templates are open to *all clients* until you assign them. Published versions keep working as they are; to publish again, add the reference certificate (Upload A).

**Backups:** Supabase makes daily database backups on paid plans; on the free plan run `pg_dump "$SUPABASE_DB_URL" > backup.sql` regularly, and download the bucket from the Storage page if needed. Published layouts are also saved as JSON in Storage.

**Rollback:** keep the old `data/` folder (or Neon) until you have checked the new deployment. To roll back, redeploy the previous Git commit (before the Supabase change) with its old environment variables — the old data was not modified. The Supabase project can stay in place.

## Microsoft Excel integration

The integration uses Microsoft Graph with the OAuth 2.0 authorisation-code flow (with PKCE). Users sign in on Microsoft's own page; the app never sees their password. Until it is configured, the User portal says it is unavailable instead of pretending to connect.

1. Sign in to the Azure portal → **Microsoft Entra ID → App registrations → New registration**.
2. Name: `CertiGen`. Supported account types: choose who may connect (your organisation only, or any organisation/personal accounts).
3. Redirect URI: platform **Web**, value `https://YOUR-DOMAIN/api/integrations/microsoft/callback` (for local testing `http://localhost:3000/api/integrations/microsoft/callback`).
4. **Certificates & secrets → New client secret**; copy the value.
5. **API permissions → Add → Microsoft Graph → Delegated**: `User.Read`, `Files.Read.All`, `offline_access`. (`Files.Read.All` lets users open workbooks shared with them on OneDrive/SharePoint. If you only need the user's own OneDrive, set `MS_SCOPES="offline_access User.Read Files.Read"`.) Grant admin consent if your tenant requires it.
6. Set in `.env`: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` (`common`, `organizations`, or your tenant ID), `APP_URL` (or `MS_REDIRECT_URI`), and restart.

Notes: the Graph workbook API reads **.xlsx** files only.

## Google Sheets integration

Uses Google OAuth 2.0 (authorisation code + PKCE) with **read-only** scopes. Until it is configured, the User portal says it is not set up — there is no fake connection.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create (or pick) a project.
2. **APIs & Services → Library**: enable the **Google Drive API** and the **Google Sheets API**.
3. **APIs & Services → OAuth consent screen**: User type *External* (or *Internal* for a Workspace organisation). Add app name, support email, and the scopes `openid`, `email`, `.../auth/drive.metadata.readonly`, `.../auth/spreadsheets.readonly`. While the app is in *Testing*, add the Google accounts that may connect as **test users** (or publish the app).
4. **Credentials → Create credentials → OAuth client ID** → *Web application*. Authorised redirect URI: `https://YOUR-DOMAIN/api/integrations/google/callback` (locally `http://localhost:3001/api/integrations/google/callback`).
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (and `APP_URL`, or `GOOGLE_REDIRECT_URI`) in `.env` — on Render under **Environment** — and restart.

Users then click **Connect Google Sheets**, sign in on Google's page, search their spreadsheets, choose a sheet and import. **Re-import** refreshes the rows later.

## Fonts

**Roboto** and **DDC Uchen** (Dzongkha) are bundled; **Times New Roman**, Helvetica, Times and Courier are drawn with the bundled metric-compatible **Liberation** fonts (metric-compatible, SIL Open Font License, see `public/fonts/LICENSE-Liberation.txt`), so fonts are always embedded and work offline. Other built-in families (Montserrat, Poppins, Playfair Display, Cinzel, Great Vibes, Alex Brush, JetBrains Mono, Noto Sans Tibetan…) are downloaded from jsDelivr (Fontsource) when generating; if unavailable, Liberation Sans is used. Administrators can upload their own TTF/OTF fonts per template. Dzongkha text (and characters a font cannot draw) is shaped by the browser with the field's font, falling back to DDC Uchen, and embedded as a high-resolution image inside the box.

---

## Project structure

```
server.ts                 Express entry (API + Vite in dev, dist/ in production)
server/
  db.ts                   PostgreSQL (Supabase) connection, schema migrations (incl. v3: three portals), RLS lock-down
  storage.ts              Supabase Storage (private bucket) via its REST API
  auth.ts                 Password hashing, sessions, role guards, login throttling
  http.ts                 Errors, CSRF guard, security headers
  files.ts                Upload validation, storage, per-role file access
  templates.ts            Template/version helpers, template availability per user/activity
  routes/
    superadmin.ts         /api/superadmin — templates, versions, reference image, Admin accounts, audit
    admin.ts              /api/admin — Users, Activities, published templates (read-only), logos, dashboard
    user.ts               /api/user and /api/admin/gen — published templates, presets, batches (generation)
  live.ts                 /api/events — live updates pushed to every open portal
    auth.ts, public.ts    sign-in (per portal), verification, files
    microsoft.ts, google.ts, ai.ts
shared/                   Types, placeholder parser, layout sanitiser, rich-text model (server and browser)
src/
  App.tsx                 Routing and role guards for the three portals
  lib/                    api, auth, router, portals (navigation), theme (light/dark), live (shared updates),
                          generation (User vs Admin generation flow)
  engine/                 Rendering engine (single code path for preview and PDF, incl. rotation), samples,
                          sampleRender (test sandbox / reference images), fonts, images, spreadsheets, batches
  components/
    superadmin/           Dashboard, Templates, TemplateDesigner (+ designer/: Workspace, rulers, layers,
                          properties, units), TemplateTestPage, TeamPage, audit log
    admin/                Dashboard, Users, UserDetail (+ activities), Activities, AdminPages (generate, history,
                          templates gallery), dialogs
    user/                 Home, BatchWizard (+ wizard/ steps), ReferencePanel, History, Presets
    shared/               UI kit, brand (logo, lockup, ECB ribbon), AppShell, LoginPage, VerifyPage, CertificatePreview,
                          RichTextEditor, UserLogo, account dialogs
tests/api-smoke.ts        End-to-end API test (92 checks, all three portals and live updates)
legacy/                   Previous single-page version, kept for reference (not built)
```

### What was reused from the previous version

pdf-lib + fontkit PDF generation, the qrcode library, jszip ZIP downloads, chunked generation with progress and cancellation, xlsx/papaparse parsing and pdf.js rendering were kept and reworked. Changes: the preview is now the real PDF rasterised (previously a separate canvas renderer that could differ from the PDF), QR codes are vector and no longer point to a fake `verify.certigen.org`, the pdf.js worker is bundled locally, WEBP/other images are converted before embedding, and image artwork is wrapped once so large batches are faster.

The old browser-only app (IndexedDB templates, admin PIN, admin-written "smart sentences") and the unused Illustrator-style editor (`CertificateDesignerApp.tsx`, `components/designer/*`) were moved to `legacy/`. They are excluded from the build and type check. Delete the folder when you no longer need it; `fabric`, `jspdf`, `html2canvas` and `motion` are only used there and can then be removed from `package.json`.

## Testing

```bash
npm run lint                                  # type check
# API end-to-end test against a throw-away, EMPTY database:
# Use a separate (test) Supabase project or a local PostgreSQL in SUPABASE_DB_URL — the test creates data.
API_ONLY=true PORT=3999 ADMIN_EMAIL=admin@test.local ADMIN_PASSWORD=AdminPass123 npx tsx server.ts
npm run test:api                              # in a second terminal
```

The first account (`ADMIN_EMAIL`) is the **Super Admin**; the test creates an Admin, Users and Activities itself.

Forgot password with emailed codes (33 checks: delivery, hashing, expiry, single use, resend cooldown, wrong-code lock, rate limits, delivery failure, every role, registered email only, email change and deactivation, no codes in logs). The server uses the real Resend SDK; `RESEND_BASE_URL` points it at a small receiver inside the test that reads the email like an inbox:

```bash
# fresh, empty test database
API_ONLY=true PORT=3999 ADMIN_EMAIL=admin@test.local ADMIN_PASSWORD=AdminPass123 \
  RESEND_API_KEY=re_test RESEND_BASE_URL=http://localhost:55498 npx tsx server.ts > server.log
OTP_CAPTURE_PORT=55498 SMOKE_DB_URL="$SUPABASE_DB_URL" SMOKE_SERVER_LOG=server.log npm run test:otp
```

## Troubleshooting

- **"SUPABASE_DB_URL is not set"** — add the three Supabase values to `.env` / Render (see *Supabase setup*).
- **`connect ENETUNREACH` / timeout to `db.….supabase.co`** — you used the direct connection; use the **Session pooler** string.
- **"password authentication failed"** — the password in `SUPABASE_DB_URL` is wrong (reset it under Project Settings → Database). Special characters in the password must be URL-encoded.
- **"The \"pg\" package is missing"** — run `npm install`.
- **"No Super Admin account exists yet"** — set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` or run `npm run create-admin`.
- **"This account belongs to the … portal"** — each role signs in on its own page: `/superadmin/login`, `/admin/login` or `/login`.
- **Microsoft "not available on this server"** — `MS_CLIENT_ID`, `MS_CLIENT_SECRET` and `APP_URL` (or `MS_REDIRECT_URI`) must be set.
- **Password-protected PDF** — export an unprotected copy of the design and upload that.
