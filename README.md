# CertiGen — template-based bulk certificate generation

CertiGen has two portals:

| Portal | Who | What they control |
| --- | --- | --- |
| **Admin portal** (`/admin`) | Administrators | Certificate artwork, box positions and styling, publishing, versions, client accounts and access |
| **Client portal** (`/app`) | Client accounts (created by the administrator) | The certificate **wording** and its formatting, placeholders such as `{{name}}`, participant data, photos and signatures, generation and downloads |

> **The administrator controls the design and layout. The client controls the wording and the participant data. The system generates the certificates.**

A text box can carry the administrator's **default wording** (with formatting). Clients can keep it or rewrite it and format important words (bold, italic, underline, colour, highlight, size, alignment — the administrator decides which are allowed per box). Client edits never change the template — each batch stores its own copy of the wording.

### Accounts and access

- Clients sign in at `/login` with an account the administrator creates under **Clients**.
- Each template is either **assigned** to selected clients (default for new templates) or open to **all clients** — set under **Templates → ⋯ → Client access**, or per client on the Clients page.
- Clients only see published templates they have access to, and never the reference certificate.
- Abuse protection: at most 30 batch starts per hour per account (no limit on the number of certificates).

### Where data lives

| Data | Stored in |
| --- | --- |
| Accounts, templates, versions, box configuration, default wording, presets, batch records, certificate IDs and verification status, OAuth tokens (encrypted), activity | **Supabase PostgreSQL** |
| Blank and reference certificate files, page previews, fonts, admin signatures | **Supabase Storage** (private bucket) — paths recorded in PostgreSQL |
| Participant spreadsheets, photos, client signatures, generated PDFs | **The client's browser only** (never uploaded) |

---

## Requirements

- **Node.js 22.13 or newer** and npm
- A **Supabase** project (free tier is enough) — see *Supabase setup* below

## Quick start

```bash
npm install
cp .env.example .env          # then edit: SUPABASE_*, APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD (APP_SECRET for production)
npm run dev                   # opens http://localhost:3001/app
```

On the first start the administrator in `ADMIN_EMAIL` / `ADMIN_PASSWORD` is created (only when no administrator exists yet). Remove `ADMIN_PASSWORD` from `.env` afterwards. You can also create or reset an administrator at any time:

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

### Administrator

1. **Templates → New template**: upload **two versions of the same design** (PDF, PNG or JPG, up to 25 MB, up to 10 pages):
   - **Upload A — complete reference certificate**: the finished example with sample name, wording, photo, signatures and QR code. A locked visual guide only; never printed and never shown to clients.
   - **Upload B — blank certificate design**: the same design without names, wording, photos, signatures or QR codes. The **only** background used in generated PDFs; stored unchanged.
   The designer compares their page count, orientation and proportions. If they differ it warns you, offers **calibration** (move/scale the overlay) and blocks publishing until you confirm the alignment.
   In the designer, switch between **Blank**, **Overlay** (reference over the blank design, adjustable opacity) and **Reference** views while drawing boxes. Boxes are separate overlay objects; the artwork is never modified.
2. **Designer**: choose a box type (Text, QR code, Photo, Signature) and drag on the artwork to draw it. Move, resize (8 handles), nudge with the arrow keys, duplicate (Ctrl+D), delete, undo/redo (Ctrl+Z / Ctrl+Shift+Z), save (Ctrl+S).
   - Text boxes: label, internal key, help text, required, font (built-in or uploaded TTF/OTF), weight, italic, colour, automatic fitting between a minimum and maximum size, horizontal and vertical alignment, wrapping, line breaks, text case, line and letter spacing, maximum characters.
   - QR boxes: content mode (verification link / client text / client chooses), error-correction level, size, quiet zone, colours.
   - Photo boxes: fill/fit/stretch, crop anchor, rectangle/rounded/circle, border.
   - Signature boxes: administrator signature, client-provided, or either.
   - **Preview** renders the real PDF with sample wording; nothing is saved into the template.
3. **Publish**: creates version 1, 2, 3… Editing a published template changes only its draft; clients keep using the published version until you publish again. Every batch stays linked to the version it was generated with. **Version history** lets you restore an older version into the draft.
4. Unpublish, archive/restore, duplicate, delete (only when the template has no generation history).

### Client (guided workflow — 3 steps)

1. **Template & wording** — pick a template assigned to you. The live preview shows a **realistic finished certificate** (example name such as *Karma Dorji*, example photo, signature and QR code; tick *Show field names* to see the placeholders). Every text box opens with the administrator's **suggested wording**; keep it or edit it. Select words and use the toolbar for **bold, italic, underline, colour, highlight, size and alignment** — e.g. bold `{{name}}`, which stays bold after it is replaced with each participant's name. Formatting is stored as structured runs (never HTML) and rendered in the PDF with embedded bold/italic fonts. Use **Insert field** to add placeholders such as `{{name}}`, `{{cid}}`, `{{workshop}}` without typing the syntax (green chips = recognised, red = malformed). Live preview, and **content presets** to save/reuse wording. Editing never changes the template — each batch saves its own copy of the wording.
2. **Participant data** — one page:
   - **Upload** `.xlsx`, `.xls` or `.csv`, or import from **Microsoft Excel** (OneDrive/SharePoint) or **Google Sheets**. All sources go through the same import and validation.
   - **Download Excel template**: the column names are exactly the placeholder keys used in your wording, plus `cid` (always — it is only *printed* if the wording uses `{{cid}}`) and `photo` when the template has a photo box. It contains two sample rows and an *Instructions* sheet.
   - **Automatic column matching** is shown as a small summary (e.g. *{{name}} ← Full Name*); open it to correct a column, set text/number/date types and date formats, choose the participant-ID column and the name shown on the verification page. There is no separate mapping page.
   - **Photos**: upload images or a ZIP. A photo is matched by the file name in the `photo` column, or by the participant's CID (e.g. `10701000001.jpg`) — never by upload order. Photos are cropped automatically around the face (browser face detection where available, otherwise a skin-tone/portrait heuristic).
   - **Signatures**: draw with mouse, finger or stylus (thickness, colour, undo/redo, clear) or upload PNG / JPG / JPEG / WebP. Empty margins are trimmed, transparency is kept (white paper of JPG scans is made transparent), and the signature can be resized and moved inside the box with an exact preview. Per-participant signature files via a column are also supported.
3. **Preview & generate** — every participant is validated (missing values, invalid dates/numbers, duplicate certificate numbers, missing photos, text that does not fit). Navigate participant by participant, see warnings, use the **fix links** (edit row, back to data, back to wording), **Adjust photo** (drag, zoom, rotate, reset to automatic, confirm), exclude rows. Rows with errors are never generated. Generation runs one certificate at a time with progress, ETA and **Cancel**; finished PDFs are saved immediately and processed-image memory is released afterwards. Download a **ZIP**, **one combined PDF** or **individual PDFs**.

**Editing later:** in **History**, click **Edit** on a batch (or **Edit** next to a single certificate under **Files**). The batch reopens with its wording, participants, photos, signatures and crops, at the preview step. Change anything and generate again. The corrected certificates get new IDs; by default the old batch is marked as *replaced*, so its QR codes show “no longer valid”.

There is **no limit on the number of certificates** per batch (only a 50 MB spreadsheet file-size safety limit, and the abuse limit of 30 batch starts per hour per account).

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
- Generated PDFs — and the batch's working data (participant rows, photos, signatures, crops) so it can be **edited and generated again from History** — are stored in the browser's IndexedDB on that device for **7 days** and then deleted automatically. Clients can delete them sooner from **History**. None of this is uploaded.
- The server stores: accounts, templates, presets (wording), batch records (wording + column mapping snapshot, counts) and, per certificate, the ID, status and — only if the client chooses a column for it — the recipient name shown on the verification page.
- Microsoft Excel and Google Sheets rows pass through the server to the client's browser and are not stored or logged. Access is read-only.
- No participant data is ever sent to Google/Gemini. The optional AI box suggestion sends only the blank template image, after the administrator ticks a consent box.
- Server logs contain error messages only, never request bodies.

## Security

- Passwords hashed with scrypt; minimum 10 characters with letters and numbers.
- Sessions: random 256-bit tokens in `HttpOnly`, `SameSite=Lax` cookies (`Secure` over HTTPS); only a SHA-256 hash is stored. 7-day sliding expiry. Deactivating a user or changing a password ends their sessions.
- CSRF: every state-changing API request must carry `X-Requested-With: certigen`.
- Role checks on every route (`/api/admin/*` admin only, `/api/client/*` client only). Clients can only see published templates assigned to them and only their own presets and batches. Template files are served only to users entitled to them.
- Login throttling (8 failures per 15 minutes per IP + email).
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
- The Storage bucket is **private**. Files are served only through the app's `/api/files/:id`, which checks the signed-in user: admins see everything; clients only files of published templates assigned to them (never the reference certificate). Short-lived signed URLs are available server-side (`signedUrl()` in `server/storage.ts`).
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

The integration uses Microsoft Graph with the OAuth 2.0 authorisation-code flow (with PKCE). Users sign in on Microsoft's own page; the app never sees their password. Until it is configured, the client portal says it is unavailable instead of pretending to connect.

1. Sign in to the Azure portal → **Microsoft Entra ID → App registrations → New registration**.
2. Name: `CertiGen`. Supported account types: choose who may connect (your organisation only, or any organisation/personal accounts).
3. Redirect URI: platform **Web**, value `https://YOUR-DOMAIN/api/integrations/microsoft/callback` (for local testing `http://localhost:3000/api/integrations/microsoft/callback`).
4. **Certificates & secrets → New client secret**; copy the value.
5. **API permissions → Add → Microsoft Graph → Delegated**: `User.Read`, `Files.Read.All`, `offline_access`. (`Files.Read.All` lets users open workbooks shared with them on OneDrive/SharePoint. If you only need the user's own OneDrive, set `MS_SCOPES="offline_access User.Read Files.Read"`.) Grant admin consent if your tenant requires it.
6. Set in `.env`: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` (`common`, `organizations`, or your tenant ID), `APP_URL` (or `MS_REDIRECT_URI`), and restart.

Notes: the Graph workbook API reads **.xlsx** files only.

## Google Sheets integration

Uses Google OAuth 2.0 (authorisation code + PKCE) with **read-only** scopes. Until it is configured, the client page says it is not set up — there is no fake connection.

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create (or pick) a project.
2. **APIs & Services → Library**: enable the **Google Drive API** and the **Google Sheets API**.
3. **APIs & Services → OAuth consent screen**: User type *External* (or *Internal* for a Workspace organisation). Add app name, support email, and the scopes `openid`, `email`, `.../auth/drive.metadata.readonly`, `.../auth/spreadsheets.readonly`. While the app is in *Testing*, add the Google accounts that may connect as **test users** (or publish the app).
4. **Credentials → Create credentials → OAuth client ID** → *Web application*. Authorised redirect URI: `https://YOUR-DOMAIN/api/integrations/google/callback` (locally `http://localhost:3001/api/integrations/google/callback`).
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (and `APP_URL`, or `GOOGLE_REDIRECT_URI`) in `.env` — on Render under **Environment** — and restart.

Clients then click **Connect Google Sheets**, sign in on Google's page, search their spreadsheets, choose a sheet and import. **Re-import** refreshes the rows later.

## Fonts

Helvetica, Times and Courier are drawn with the bundled **Liberation** fonts (metric-compatible, SIL Open Font License, see `public/fonts/LICENSE-Liberation.txt`), so fonts are always embedded and work offline. Other built-in families (Montserrat, Poppins, Playfair Display, Cinzel, Great Vibes, Alex Brush, JetBrains Mono, Noto Sans Tibetan…) are downloaded from jsDelivr (Fontsource) when generating; if unavailable, Liberation Sans is used. Administrators can upload their own TTF/OTF fonts per template. Dzongkha/Tibetan text and characters a font cannot draw are shaped by the browser and embedded as a high-resolution image inside the box.

---

## Project structure

```
server.ts                 Express entry (API + Vite in dev, dist/ in production)
server/
  db.ts                   PostgreSQL (Supabase) connection, schema migrations, RLS lock-down
  storage.ts              Supabase Storage (private bucket) via its REST API
  pgmini.ts               Tiny PostgreSQL client used only by the automated tests
  auth.ts                 Password hashing, sessions, role guards, login throttling
  http.ts                 Errors, CSRF guard, security headers
  files.ts                Upload validation, storage, access checks
  templates.ts            Template/version helpers, content sanitising
  secret.ts               Token encryption
  routes/                 auth, admin, client, public (verify + files), microsoft, ai
  scripts/create-admin.ts, scripts/migrate-to-supabase.ts
shared/                   Types, placeholder parser, layout sanitiser, rich-text model (used by server and browser)
src/
  engine/                 Rendering engine (single code path for preview and PDF), text fitting,
                          fonts, images, spreadsheets, batch validation, generation, local storage
  pages/admin/            Dashboard, Templates, Designer, Clients, Activity
  pages/client/           Home, BatchWizard (+ wizard/ steps), History, Presets
  pages/                  Login, Verify, OAuth completion
  components/             UI kit, app shell
tests/api-smoke.ts        End-to-end API test (71 checks)
legacy/                   Previous single-page version, kept for reference (not built)
```

### What was reused from the previous version

pdf-lib + fontkit PDF generation, the qrcode library, jszip ZIP downloads, chunked generation with progress and cancellation, xlsx/papaparse parsing and pdf.js rendering were kept and reworked. Changes: the preview is now the real PDF rasterised (previously a separate canvas renderer that could differ from the PDF), QR codes are vector and no longer point to a fake `verify.certigen.org`, the pdf.js worker is bundled locally, WEBP/other images are converted before embedding, and image artwork is wrapped once so large batches are faster.

The old browser-only app (IndexedDB templates, admin PIN, admin-written "smart sentences") and the unused Illustrator-style editor (`CertificateDesignerApp.tsx`, `components/designer/*`) were moved to `legacy/`. They are excluded from the build and type check. Delete the folder when you no longer need it; `fabric`, `jspdf`, `html2canvas` and `motion` are only used there and can then be removed from `package.json`.

## Testing

```bash
npm run lint                                  # type check
# API end-to-end test against a throw-away database:
# Use a separate (test) Supabase project or a local PostgreSQL in SUPABASE_DB_URL — the test creates data.
API_ONLY=true PORT=3999 ADMIN_EMAIL=admin@test.local ADMIN_PASSWORD=AdminPass123 npx tsx server.ts
npm run test:api                              # in a second terminal
```

## Troubleshooting

- **"SUPABASE_DB_URL is not set"** — add the three Supabase values to `.env` / Render (see *Supabase setup*).
- **`connect ENETUNREACH` / timeout to `db.….supabase.co`** — you used the direct connection; use the **Session pooler** string.
- **"password authentication failed"** — the password in `SUPABASE_DB_URL` is wrong (reset it under Project Settings → Database). Special characters in the password must be URL-encoded.
- **"The \"pg\" package is missing"** — run `npm install`.
- **"No administrator account exists yet"** — set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` or run `npm run create-admin`.
- **Microsoft "not available on this server"** — `MS_CLIENT_ID`, `MS_CLIENT_SECRET` and `APP_URL` (or `MS_REDIRECT_URI`) must be set.
- **Password-protected PDF** — export an unprotected copy of the design and upload that.
