# CertiGen — template-based bulk certificate generation

CertiGen has two portals:

| Portal | Who | What they control |
| --- | --- | --- |
| **Admin portal** (`/admin`) | Administrators | Certificate artwork, box positions and styling, publishing, versions, client accounts and access |
| **Client portal** (`/app`) | Anyone — no sign-in needed (or a named client account) | The certificate **wording**, placeholders such as `{{name}}`, participant data, photos and signatures, generation and downloads |

> **The administrator controls the design and layout. The client controls the wording and the participant data. The system generates the certificates.**

Text boxes are always saved **empty** in a template. The server enforces this: every saved layout is rebuilt from an allow-list of position and styling properties, so wording can never be stored in a template.

### Public access (no sign-in)

The client portal opens without signing in. Visitors use the built-in **Public** client; each browser gets an anonymous cookie, so visitors only see their own presets and history. The sidebar has an **Admin portal** link (admins must sign in) and the admin portal has an **Open client portal** link.

- New templates are visible to everyone ("All clients"). Use **Client access** on a template to limit it to named client accounts.
- **Clients → Public (no sign-in) → Turn off public access** makes the client portal require a client account again.
- Rename the Public client or set its organisation to control the issuer shown on the verification page.
- Microsoft Excel needs a named client account; public visitors upload .xlsx/.csv files instead.
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
4. **Client access**: per template, either all clients or selected clients. **Clients** page: create accounts, edit, deactivate (signs them out), reset passwords, assign templates, view activity.
5. Unpublish, archive/restore, duplicate, delete (only when the template has no generation history).

### Client (guided workflow)

1. **Select template**
2. **Write wording** for every text box, with **Insert field** to add placeholders without typing the syntax. Recognised fields are shown as chips. A live preview highlights the box being edited. Save or load **content presets**.
3. **Add participants**: upload `.xlsx`, `.xls` or `.csv`, or **Connect Microsoft Excel** and pick a OneDrive/SharePoint workbook and worksheet. **Download Excel template** builds a workbook with exactly the columns the wording needs, plus an instructions sheet.
4. **Match columns**: automatic matching (e.g. *Full Name → {{name}}*, *Citizenship ID → {{cid}}*, *Programme → {{workshop}}*), manual override, text/number/date types and date formats.
5. **Photos & signatures** (only when the template has them): upload images or a ZIP; files are matched by the file names in the spreadsheet, never by order. Missing and unused images are reported.
6. **Preview & check**: every row is validated (missing values, invalid numbers/dates, unknown placeholders, duplicate certificate numbers, missing images, text that does not fit). Fix rows inline or exclude them. Rows with errors are never generated.
7. **Generate**: one certificate at a time with progress, remaining count, ETA and **Cancel**. Each finished PDF is saved immediately, so cancelling or a single failure never loses completed work. Download a **ZIP**, **one combined PDF** or **individual PDFs**.

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
- Generated PDFs are stored in the browser's IndexedDB on that device for **7 days** and then deleted automatically. Clients can delete them sooner from **History**.
- The server stores: accounts, templates, presets (wording), batch records (wording + column mapping snapshot, counts) and, per certificate, the ID, status and — only if the client chooses a column for it — the recipient name shown on the verification page.
- Microsoft Excel rows pass through the server to the signed-in client's browser and are not stored or logged.
- No participant data is ever sent to Google/Gemini. The optional AI box suggestion sends only the blank template image, after the administrator ticks a consent box.
- Server logs contain error messages only, never request bodies.

## Security

- Passwords hashed with scrypt; minimum 10 characters with letters and numbers.
- Sessions: random 256-bit tokens in `HttpOnly`, `SameSite=Lax` cookies (`Secure` over HTTPS); only a SHA-256 hash is stored. 7-day sliding expiry. Deactivating a user or changing a password ends their sessions.
- CSRF: every state-changing API request must carry `X-Requested-With: certigen`.
- Role checks on every route (`/api/admin/*` admin only, `/api/client/*` client only). Clients can only see published templates assigned to them and only their own presets and batches. Template files are served only to users entitled to them.
- Login throttling (8 failures per 15 minutes per IP + email).
- Uploads are checked by their real content (magic bytes) and size, not by the file name.
- Microsoft tokens are encrypted at rest (AES-256-GCM with `APP_SECRET`) and never sent to the browser.
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

Notes: the Graph workbook API reads **.xlsx** files only. A worksheet is limited to 20,000 rows.

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
