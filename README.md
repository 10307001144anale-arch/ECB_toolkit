# CertiGen — Bulk Certificate Generation Toolkit

A client-side bulk certificate generation toolkit built with React, TypeScript, Tailwind CSS, and IndexedDB.

CertiGen follows a core principle: **Templates are already designed**. The application never alters the base artwork—it overlays high-fidelity vector typography into admin-defined bounding boxes at generation time.

---

## 🌟 Key Features

### 🛡️ Role 1: Admin Studio (`/admin`)
- **Template Management**:
  - Upload certificate artwork in **PDF**, **PNG**, **JPG**, or **WEBP** formats.
  - Files are stored persistently in IndexedDB as original `Blob`s.
  - Template actions: Rename, Duplicate, Delete (with warning if history exists), and JSON Export/Import.
  - Custom font uploader (`.ttf` / `.otf`) with instant browser font-face registration.
- **Visual Field Configuration Canvas**:
  - Interactive canvas with Zoom controls (Fit, 50%, 75%, 100%, 150%).
  - Click & drag on empty canvas space to draw new text regions.
  - 8 resize handles (`NW`, `N`, `NE`, `E`, `SE`, `S`, `SW`, `W`) for precision adjustments.
  - Arrow key nudging (`0.2%` or `1%` with `Shift`) and keyboard deletion (`Backspace`/`Delete`).
  - **Live Preview Mode**: Switch between visual handle editing and real-time certificate preview.
- **Field Typography & Rules Configuration**:
  - **Variable Key** (e.g. `student_name`, `certificate_no`) matching spreadsheet headers.
  - **Display Label** and **Field Types** (`text`, `date`, `number`).
  - **Font Family Selection**: Google Fonts (`Playfair Display`, `Montserrat`, `Great Vibes`, `Poppins`, `Cinzel`, `Alex Brush`, `Plus Jakarta Sans`, `JetBrains Mono`) plus custom uploaded fonts.
  - **Font Size**, **Weight** (`300`–`700`), **Hex Color Picker**, and **Text Alignment** (`left`, `center`, `right`).
  - **Auto-shrink to fit**: Proportional font scaling to prevent overflowing box boundaries.
  - **Multi-line Wrapping**: Automatic word wrapping for long course titles or statements.
  - **Text Transformations**: `UPPERCASE`, `lowercase`, `Title Case`, or `As Typed`.
  - **Date Formatters**: `MMMM D, YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, `D MMM YYYY`, etc.
  - **Certificate Sequence Number Generator**: Automatic prefix (`CERT-2025-`), start number, and zero-padding (`0001`).

---

### 🎓 Role 2: User Flow (`/`)
- **Step 1 — Select Template**:
  - Visual gallery of pre-configured templates with real-time thumbnail previews and field count badges.
- **Step 2 — Mode Choice & Data Input**:
  - **Single Certificate**: Auto-generated form based strictly on admin-defined fields with a live canvas preview updating as the user types.
  - **Bulk Generation**:
    - Download sample `.csv` or `.xlsx` files generated directly from the template's field keys.
    - Upload `.csv` / `.xlsx` files with automatic column name fuzzy matching.
    - Column mapping interface with manual overrides.
- **Step 3 — Preview & Data Validation**:
  - Validation metrics strip: Total rows, Valid rows, and Errors.
  - Interactive validation table with **inline cell editing** to fix errors without re-uploading.
  - Option to skip invalid rows automatically.
  - **Paginated Live Preview**: Previous/Next controls, Jump to Row, and instant recipient search.
- **Step 4 — Generation & Output**:
  - Non-blocking batch processing engine with animated progress bar and chunked rendering.
  - **Vector PDF generation** using `pdf-lib` and `@pdf-lib/fontkit` preserving exact page size.
  - **Customizable ZIP Naming Pattern** (e.g. `{certificate_no}_{student_name}.pdf`).
  - **Merged Multi-Page PDF**: Combine all certificates into one document.
  - Generation summary report.

---

### 🔒 Security & Persistence
- **Admin PIN Protection**: Protected by default PIN `1234` (configurable in the UI).
- **Client-Side Privacy**: Runs 100% in the user's browser. No data or student names are sent to any external server.
- **IndexedDB**: Templates, field configurations, custom fonts, and generation history survive page refreshes.

---

## 🧪 Built-in Test Samples

The application comes pre-loaded with **2 programmatic sample templates** and a downloadable **5-record test CSV**:
1. **Classical Academic Honors** (Ivory parchment, gold foil emblem, ornate border, calligraphy name field).
2. **Modern Tech Workshop** (Clean modern vector design, geometric polygons, emerald & navy accents).
3. **Quick Test**: Click *"Load 5 Test Records"* in Step 2 to immediately populate realistic data and test bulk generation in seconds!
