# CertiGen — template-based bulk certificate generation

CertiGen has two portals:

| Portal | Who | What they control |
| --- | --- | --- |
| **Admin portal** (`/admin`) | Administrators | Certificate artwork, box positions and styling, publishing, versions, client accounts and access |
| **Client portal** (`/app`) | Anyone — no sign-in needed (or a named client account) | The certificate **wording**, placeholders such as `{{name}}`, participant data, photos and signatures, generation and downloads |

> **The administrator controls the design and layout. The client controls the wording and the participant data. The system generates the certificates.**

A text box can carry the administrator's **default wording** (a suggestion clients can keep or edit). Everything else in a saved layout is rebuilt from an allow-list of position and styling properties. Client edits never change the template — each batch stores its own copy of the wording.

### Public access (no sign-in)

The client portal opens without signing in. Visitors use the built-in **Public** client; each browser gets an anonymous cookie, so visitors only see their own presets and history. The sidebar has an **Admin portal** link (admins must sign in) and the admin portal has an **Open client portal** link.

- Every published template is public — visible to every visitor of the client portal.
- **Clients → Public (no sign-in) → Turn off public access** makes the client portal require a client account again.
- Rename the Public client or set its organisation to control the issuer shown on the verification page.
- Microsoft Excel and Google Sheets connections are kept per browser for public visitors.
- Public visitors can start at most 30 batches per hour per browser.

---

## Requirements

- **Node.js 22.13 or newer** (the database uses Node's built-in `node:sqlite`; no native modules to compile)
- npm

## Quick start

```bash
npm install
cp .env.example .env          # then edit: APP_URL, ADMIN_EMAIL, ADMIN_PASSWORD (and APP_SECRET for production)
npm run dev                   # http://localhost:3000
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

Data (the SQLite database and uploaded template files) is stored in `DATA_DIR` (default `./data`). Back up that folder.

---

## How it works

### Administrator

1. **Templates → New template**: upload the blank design (PDF, PNG or JPG, up to 25 MB, up to 10 pages). The original file is stored unchanged.
2. **Designer**: choose a box type (Text, QR code, Photo, Signature) and drag on the artwork to draw it. Move, resize (8 handles), nudge with the arrow keys, duplicate (Ctrl+D), delete, undo/redo (Ctrl+Z / Ctrl+Shift+Z), save (Ctrl+S).
   - Text boxes: label, internal key, help text, required, font (built-in or uploaded TTF/OTF), weight, italic, colour, automatic fitting between a minimum and maximum size, horizontal and vertical alignment, wrapping, line breaks, text case, line and letter spacing, maximum characters.
   - QR boxes: content mode (verification link / client text / client chooses), error-correction level, size, quiet zone, colours.
   - Photo boxes: fill/fit/stretch, crop anchor, rectangle/rounded/circle, border.
   - Signature boxes: administrator signature, client-provided, or either.
   - **Preview** renders the real PDF with sample wording; nothing is saved into the template.
3. **Publish**: creates version 1, 2, 3… Editing a published template changes only its draft; clients keep using the published version until you publish again. Every batch stays linked to the version it was generated with. **Version history** lets you restore an older version into the draft.
4. Unpublish, archive/restore, duplicate, delete (only when the template has no generation history).

### Client (guided workflow — 3 steps, no sign-in)

1. **Template & wording** — pick a published template. Every text box opens with the administrator's **suggested wording** (set in the designer as *Default wording*); keep it or edit it. Use **Insert field** to add placeholders such as `{{name}}`, `{{cid}}`, `{{workshop}}` without typing the syntax (green chips = recognised, red = malformed). Live preview, and **content presets** to save/reuse wording. Editing never changes the template — each batch saves its own copy of the wording.
2. **Participant data** — one page:
   - **Upload** `.xlsx`, `.xls` or `.csv`, or import from **Microsoft Excel** (OneDrive/SharePoint) or **Google Sheets**. All sources go through the same import and validation.
   - **Download Excel template**: the column names are exactly the placeholder keys used in your wording, plus `cid` (always — it is only *printed* if the wording uses `{{cid}}`) and `photo` when the template has a photo box. It contains two sample rows and an *Instructions* sheet.
   - **Automatic column matching** is shown as a small summary (e.g. *{{name}} ← Full Name*); open it to correct a column, set text/number/date types and date formats, choose the participant-ID column and the name shown on the verification page. There is no separate mapping page.
   - **Photos**: upload images or a ZIP. A photo is matched by the file name in the `photo` column, or by the participant's CID (e.g. `10701000001.jpg`) — never by upload order. Photos are cropped automatically around the face (browser face detection where available, otherwise a skin-tone/portrait heuristic).
   - **Signatures**: draw with mouse, finger or stylus (thickness, colour, undo/redo, clear) or upload PNG / JPG / JPEG / WebP. Empty margins are trimmed, transparency is kept (white paper of JPG scans is made transparent), and the signature can be resized and moved inside the box with an exact preview. Per-participant signature files via a column are also supported.
3. **Preview & generate** — every participant is validated (missing values, invalid dates/numbers, duplicate certificate numbers, missing photos, text that does not fit). Navigate participant by participant, see warnings, use the **fix links** (edit row, back to data, back to wording), **Adjust photo** (drag, zoom, rotate, reset to automatic, confirm), exclude rows. Rows with errors are never generated. Generation runs one certificate at a time with progress, ETA and **Cancel**; finished PDFs are saved immediately and processed-image memory is released afterwards. Download a **ZIP**, **one combined PDF** or **individual PDFs**.

**Editing later:** in **History**, click **Edit** on a batch (or **Edit** next to a single certificate under **Files**). The batch reopens with its wording, participants, photos, signatures and crops, at the preview step. Change anything and generate again. The corrected certificates get new IDs; by default the old batch is marked as *replaced*, so its QR codes show “no longer valid”.

There is **no limit on the number of certificates** per batch (only a 50 MB spreadsheet file-size safety limit, and the abuse limit of 30 batches per hour per browser for public visitors).

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
- Microsoft and Google tokens are encrypted at rest (AES-256-GCM with `APP_SECRET`), stored per browser (public visitors) or per account, and never sent to the browser. Disconnecting deletes them (Google tokens are also revoked).
- Production adds a Content-Security-Policy, HSTS and other security headers.

---

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
  db.ts                   SQLite schema + migrations (node:sqlite)
  auth.ts                 Password hashing, sessions, role guards, login throttling
  http.ts                 Errors, CSRF guard, security headers
  files.ts                Upload validation, storage, access checks
  templates.ts            Template/version helpers, content sanitising
  secret.ts               Token encryption
  routes/                 auth, admin, client, public (verify + files), microsoft, ai
  scripts/create-admin.ts
shared/                   Types, placeholder parser, layout sanitiser (used by server and browser)
src/
  engine/                 Rendering engine (single code path for preview and PDF), text fitting,
                          fonts, images, spreadsheets, batch validation, generation, local storage
  pages/admin/            Dashboard, Templates, Designer, Clients, Activity
  pages/client/           Home, BatchWizard (+ wizard/ steps), History, Presets
  pages/                  Login, Verify, OAuth completion
  components/             UI kit, app shell
tests/api-smoke.ts        End-to-end API test (43 checks)
legacy/                   Previous single-page version, kept for reference (not built)
```

### What was reused from the previous version

pdf-lib + fontkit PDF generation, the qrcode library, jszip ZIP downloads, chunked generation with progress and cancellation, xlsx/papaparse parsing and pdf.js rendering were kept and reworked. Changes: the preview is now the real PDF rasterised (previously a separate canvas renderer that could differ from the PDF), QR codes are vector and no longer point to a fake `verify.certigen.org`, the pdf.js worker is bundled locally, WEBP/other images are converted before embedding, and image artwork is wrapped once so large batches are faster.

The old browser-only app (IndexedDB templates, admin PIN, admin-written "smart sentences") and the unused Illustrator-style editor (`CertificateDesignerApp.tsx`, `components/designer/*`) were moved to `legacy/`. They are excluded from the build and type check. Delete the folder when you no longer need it; `fabric`, `jspdf`, `html2canvas` and `motion` are only used there and can then be removed from `package.json`.

## Testing

```bash
npm run lint                                  # type check
# API end-to-end test against a throw-away database:
API_ONLY=true PORT=3999 DATA_DIR=./data-test ADMIN_EMAIL=admin@test.local ADMIN_PASSWORD=AdminPass123 npx tsx server.ts
npm run test:api                              # in a second terminal
```

## Troubleshooting

- **`No such built-in module: node:sqlite`** — upgrade Node.js to 22.13 or newer.
- **"No administrator account exists yet"** — set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` or run `npm run create-admin`.
- **Microsoft "not available on this server"** — `MS_CLIENT_ID`, `MS_CLIENT_SECRET` and `APP_URL` (or `MS_REDIRECT_URI`) must be set.
- **Password-protected PDF** — export an unprotected copy of the design and upload that.
