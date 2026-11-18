// Super Admin → Test template: a full-screen sandbox inside the Super Admin
// portal. No User, Admin or Activity is needed and it works on drafts too.
//   Single — a form built from the template's fields with a live preview.
//   Bulk   — CSV/Excel upload, column mapping, validation, paginated preview.
// Test PDFs are named TEST_…, generated in the browser, never saved to any
// history or count, and released when the view is closed.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet, Play, FlaskConical, ImagePlus, Loader2, Pencil, RotateCcw, X, XCircle } from 'lucide-react';
import { api, getConfig, verifyBaseUrl } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { usePortalAccent } from '../../lib/theme';
import { Alert, Badge, Button, Card, Field, IconButton, Input, ProgressBar, Segmented, Select, Spinner, Textarea, cx, td, th } from '../shared/ui';
import { PortalBadge } from '../shared/AppShell';
import { RibbonDivider } from '../shared/brand';
import { CertificatePreview } from '../shared/CertificatePreview';
import { useToast } from '../../context/ToastContext';
import { collectPlaceholders, findPlaceholders, isSystemPlaceholder, normKey } from '../../../shared/placeholders';
import type { ContentConfig, TemplateDetail, TemplateLayout, TemplateVersion, TextBox } from '../../../shared/types';
import type { CertificateRenderer, ResolvedCertificate } from '../../engine/renderer';
import { emptyContent } from '../../engine/batch';
import { realisticCertificate, sampleValue } from '../../engine/samples';
import { loadRenderer, renderTestPdf, TEST_CERT_ID } from '../../engine/sampleRender';
import { readSpreadsheetFile } from '../../engine/spreadsheet';
import { downloadBlob, safeFileBase } from '../../engine/generate';
import { renderPdfPage } from '../../engine/pdfRaster';
import { Modal } from '../shared/ui';

const MAX_TEST_ROWS = 500;
const PAGE = 10;

interface FieldDef {
  key: string;
  name: string;
  required: boolean;
}
interface RowCheck {
  values: Record<string, string>;
  errors: string[];
  warnings: string[];
}
/** A generated test certificate, kept only as on-screen images (no file to download). */
interface TestFile {
  name: string;
  /** Object URLs of the rendered page images. */
  pages: string[];
}

/** Renders every page of a certificate PDF to an image for viewing in the app. */
async function pdfToImages(bytes: Uint8Array, pageCount: number): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    const canvas = await renderPdfPage(bytes, i, 1400, undefined, 1);
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Rendering failed'))), 'image/png'));
    out.push(URL.createObjectURL(blob));
  }
  return out;
}

const RESULT_PAGE = 6;

export default function TemplateTestPage({ id }: { id: string }) {
  usePortalAccent('superadmin');
  const { navigate } = useRouter();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [published, setPublished] = useState<TemplateVersion | null>(null);
  const [source, setSource] = useState<'draft' | 'published'>('draft');
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [renderer, setRenderer] = useState<CertificateRenderer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [content, setContent] = useState<ContentConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<{ name: string; headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [rowIndex, setRowIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const [cert, setCert] = useState<ResolvedCertificate | null>(null);
  const [editWording, setEditWording] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [files, setFiles] = useState<TestFile[]>([]);
  const cancel = useRef(false);
  const filesRef = useRef<TestFile[]>([]);
  filesRef.current = files;

  // Test files only live while this view is open.
  useEffect(() => () => filesRef.current.forEach((f) => f.pages.forEach((u) => URL.revokeObjectURL(u))), []);
  const [viewing, setViewing] = useState<TestFile | null>(null);
  const [single, setSingle] = useState<TestFile | null>(null);
  const [resultPage, setResultPage] = useState(0);
  const clearFiles = () => {
    files.forEach((f) => f.pages.forEach((u) => URL.revokeObjectURL(u)));
    setFiles([]);
    setResultPage(0);
  };

  useEffect(() => {
    document.title = 'Test template · CertiGen';
    api
      .get<TemplateDetail>(`/api/superadmin/templates/${id}`)
      .then(async (d) => {
        setDetail(d);
        if (d.currentVersionId) {
          const versions = await api.get<TemplateVersion[]>(`/api/superadmin/templates/${id}/versions`);
          setPublished(versions.find((v) => v.id === d.currentVersionId) || null);
        }
      })
      .catch((e) => setLoadError(e.message));
  }, [id]);

  const layout: TemplateLayout | null = source === 'published' && published ? published.layout : detail?.draft || null;

  useEffect(() => {
    if (!layout) return;
    setRenderer(null);
    setLoadError(null);
    if (!layout.artworkFileId) {
      setLoadError('Upload the blank design in the designer first.');
      return;
    }
    let cancelled = false;
    loadRenderer(layout)
      .then((r) => !cancelled && setRenderer(r))
      .catch((e) => !cancelled && setLoadError(e.message));
    setContent(emptyContent(layout));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, published, source]);

  // The template's fields: placeholders used in the wording (system fields are filled automatically).
  const fields: FieldDef[] = useMemo(() => {
    if (!content || !layout) return [];
    const texts = [...Object.values(content.texts), ...Object.values(content.qr).map((q) => q.value)];
    const required = new Set<string>();
    for (const b of layout.boxes) {
      if (b.type === 'text' && b.required) for (const t of findPlaceholders(content.texts[b.key] || '')) required.add(t.key);
    }
    return [...collectPlaceholders(texts)].filter(([, name]) => !isSystemPlaceholder(name)).map(([key, name]) => ({ key, name, required: required.has(key) }));
  }, [content, layout]);

  // Bulk: automatic column matching whenever a file is loaded or the fields change.
  useEffect(() => {
    if (!sheet) return;
    setMapping((prev) => {
      const next: Record<string, string> = {};
      for (const f of fields) next[f.key] = prev[f.key] && sheet.headers.includes(prev[f.key]) ? prev[f.key] : sheet.headers.find((h) => normKey(h) === f.key) || '';
      return next;
    });
  }, [sheet, fields]);

  const rowValues = (row: Record<string, string>) => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.key] = mapping[f.key] ? (row[mapping[f.key]] ?? '').trim() : '';
    return v;
  };

  const checks: RowCheck[] = useMemo(() => {
    if (!sheet) return [];
    return sheet.rows.map((row) => {
      const v = rowValues(row);
      const errors: string[] = [];
      const warnings: string[] = [];
      for (const f of fields) {
        if (!mapping[f.key]) (f.required ? errors : warnings).push(`No column for {{${f.name}}}`);
        else if (!v[f.key]) (f.required ? errors : warnings).push(`{{${f.name}}} is empty`);
      }
      return { values: v, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet, mapping, fields]);

  const validRows = checks.map((c, i) => (c.errors.length ? -1 : i)).filter((i) => i >= 0);

  // Values of the certificate being previewed.
  const current = useMemo(() => {
    if (mode === 'bulk' && sheet) return checks[rowIndex]?.values || {};
    const out: Record<string, string> = {};
    for (const f of fields) out[f.key] = values[f.key] ?? sampleValue(f.name);
    return out;
  }, [mode, sheet, checks, rowIndex, values, fields]);

  useEffect(() => {
    if (!renderer || !content) return;
    let cancelled = false;
    (async () => {
      const cfg = await getConfig().catch(() => null);
      const c = await realisticCertificate(renderer.layout, content, verifyBaseUrl(cfg), (k) => renderer.fixedSignature(k), undefined, {
        exampleTextForEmptyBoxes: true,
        values: current,
        certificateId: TEST_CERT_ID,
        photo,
      });
      if (!cancelled) setCert(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [renderer, content, current, photo]);

  const base = `TEST_${safeFileBase(detail?.title || 'template').replace(/\s+/g, '_')}`;

  const loadSheet = async (f: File | undefined) => {
    if (!f) return;
    try {
      const data = await readSpreadsheetFile(f);
      if (data.rows.length > MAX_TEST_ROWS) showToast(`Only the first ${MAX_TEST_ROWS} rows are used for testing.`, 'info');
      setSheet({ name: f.name, headers: data.headers, rows: data.rows.slice(0, MAX_TEST_ROWS) });
      setRowIndex(0);
      setPage(0);
      clearFiles();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  /** CSV with one column per field key and two sample rows. */
  const downloadSampleCsv = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const head = fields.map((f) => f.name);
    const row1 = fields.map((f) => sampleValue(f.name));
    const row2 = fields.map((f) => (/name/i.test(f.name) ? 'Sonam Wangmo' : sampleValue(f.name)));
    const csv = '﻿' + [head, row1, row2].map((r) => r.map(esc).join(',')).join('\r\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${base}_sample.csv`);
  };

  const generateSingle = async () => {
    if (!renderer || !content) return;
    setBusy('single');
    try {
      const bytes = await renderTestPdf(renderer, { content, values: current, photo });
      if (single) single.pages.forEach((u) => URL.revokeObjectURL(u));
      const result = { name: `${base}`, pages: await pdfToImages(bytes, renderer.pageCount) };
      setSingle(result);
      setViewing(result);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const generateBulk = async () => {
    if (!renderer || !content || !sheet || !validRows.length) return;
    clearFiles();
    setBusy('bulk');
    cancel.current = false;
    const out: TestFile[] = [];
    setProgress({ done: 0, total: validRows.length });
    try {
      const pad = String(sheet.rows.length).length;
      for (let n = 0; n < validRows.length; n++) {
        if (cancel.current) break;
        const i = validRows[n];
        const v = checks[i].values;
        const bytes = await renderTestPdf(renderer, { content, values: v, photo });
        const label = (v.name || v.fullname || Object.values(v)[0] || '').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 60);
        out.push({ name: `TEST_${String(i + 1).padStart(Math.max(3, pad), '0')}${label ? `_${label.replace(/\s+/g, '_')}` : ''}`, pages: await pdfToImages(bytes, renderer.pageCount) });
        setProgress({ done: n + 1, total: validRows.length });
        await new Promise((r) => setTimeout(r, 0));
      }
      setFiles(out);
      showToast(`${out.length} test certificate${out.length === 1 ? '' : 's'} ready`, 'success');
    } catch (e: any) {
      out.forEach((f) => f.pages.forEach((u) => URL.revokeObjectURL(u)));
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const textBoxes = (layout?.boxes || []).filter((b): b is TextBox => b.type === 'text' && !b.date);
  const pageRows = sheet ? sheet.rows.slice(page * PAGE, page * PAGE + PAGE) : [];
  const pages = sheet ? Math.max(1, Math.ceil(sheet.rows.length / PAGE)) : 1;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/superadmin/templates')}>
          Templates
        </Button>
        <PortalBadge portal="superadmin" />
        <p className="min-w-0 truncate text-sm font-bold text-navy">Test: {detail?.title || '…'}</p>
        <Badge tone="amber" className="hidden shrink-0 sm:inline-flex" icon={<FlaskConical className="h-3 w-3" />}>
          Test mode — nothing is saved
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/superadmin/templates/${id}`)}>
            Open designer
          </Button>
        </div>
      </header>

      {loadError && !renderer ? (
        <div className="mx-auto mt-10 w-full max-w-xl px-4">
          <Alert tone="error" title="This template cannot be tested yet">
            {loadError}
          </Alert>
        </div>
      ) : !detail ? (
        <Spinner className="flex-1" />
      ) : (
        <div className="grid flex-1 gap-6 p-4 lg:grid-cols-[24rem_1fr] lg:p-6">
          <aside className="space-y-4">
            <Card className="space-y-4 p-4">
              <div>
                <h1 className="text-h2 text-navy">Test template</h1>
                <RibbonDivider className="mt-2" />
              </div>
              <p className="text-xs text-slate-500">
                No User or Activity needed. Test certificates use the ID {TEST_CERT_ID}, are shown only in this view (no download), never appear in any history or count, and are discarded when you leave.
              </p>
              <div className="flex flex-wrap gap-2">
                <Segmented
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setRowIndex(0);
                  }}
                  options={[
                    { value: 'single', label: 'Single' },
                    { value: 'bulk', label: 'Bulk' },
                  ]}
                />
                {published && (
                  <Segmented
                    value={source}
                    onChange={setSource}
                    options={[
                      { value: 'draft', label: 'Draft' },
                      { value: 'published', label: `Published v${published.versionNumber}` },
                    ]}
                  />
                )}
              </div>
              {detail.status !== 'published' && <p className="text-xs text-amber-700">This template is not published yet — test it before publishing.</p>}
            </Card>

            {mode === 'single' ? (
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-h3 text-navy">Field values</h2>
                  <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setValues({})}>
                    Sample values
                  </Button>
                </div>
                {fields.length === 0 ? (
                  <p className="text-sm text-slate-500">The wording has no fields. Add {'{{name}}'} etc. in the designer, or edit the wording below.</p>
                ) : (
                  fields.map((f) => (
                    <Field key={f.key} label={<span className="font-mono text-xs">{`{{${f.name}}}`}{f.required && <span className="text-red-600"> *</span>}</span>} htmlFor={`v-${f.key}`}>
                      <Input id={`v-${f.key}`} value={current[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                    </Field>
                  ))
                )}
                <PhotoPicker photo={photo} setPhoto={setPhoto} />
                <Button variant="primary" className="w-full" icon={<Play className="h-4 w-4" />} loading={busy === 'single'} disabled={!renderer || !!busy} onClick={generateSingle}>
                  Generate test certificate
                </Button>
                {single && (
                  <Button className="w-full" icon={<Eye className="h-4 w-4" />} onClick={() => setViewing(single)}>
                    View last generated certificate
                  </Button>
                )}
                <p className="text-xs text-slate-500">Test certificates are shown here only. They cannot be downloaded.</p>
              </Card>
            ) : (
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-h3 text-navy">Participants file</h2>
                  <Button size="sm" variant="ghost" icon={<Download className="h-3.5 w-3.5" />} onClick={downloadSampleCsv} disabled={!fields.length}>
                    Download sample CSV
                  </Button>
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600 hover:border-orange">
                  <FileSpreadsheet className="h-4 w-4" /> {sheet ? `${sheet.name} · ${sheet.rows.length} rows — replace` : 'Upload CSV or Excel'}
                  <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={(e) => loadSheet(e.target.files?.[0])} />
                </label>
                {sheet && (
                  <>
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Column mapping</p>
                      <div className="space-y-2">
                        {fields.map((f) => (
                          <div key={f.key} className="flex items-center gap-2">
                            <span className="w-28 shrink-0 truncate font-mono text-xs text-slate-600" title={f.name}>
                              {`{{${f.name}}}`}
                              {f.required && <span className="text-red-600">*</span>}
                            </span>
                            <Select value={mapping[f.key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))} className="h-9 flex-1">
                              <option value="">— not mapped —</option>
                              {sheet.headers.map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge tone="green">
                        {validRows.length} ready
                      </Badge>
                      {checks.length - validRows.length > 0 && (
                        <Badge tone="red">
                          {checks.length - validRows.length} with errors (skipped)
                        </Badge>
                      )}
                      {checks.some((c) => !c.errors.length && c.warnings.length) && (
                        <Badge tone="amber">
                          warnings
                        </Badge>
                      )}
                    </div>
                  </>
                )}
                <PhotoPicker photo={photo} setPhoto={setPhoto} />
                {progress ? (
                  <div className="space-y-2">
                    <ProgressBar value={(progress.done / progress.total) * 100} />
                    <div className="flex items-center justify-between text-xs text-slate-600">
                      <span>
                        {progress.done} / {progress.total}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => (cancel.current = true)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="primary" className="w-full" icon={<Play className="h-4 w-4" />} loading={busy === 'bulk'} disabled={!renderer || !validRows.length || !!busy} onClick={generateBulk}>
                    Generate {validRows.length || ''} test certificates
                  </Button>
                )}
                {files.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
                    <span className="text-slate-700">{files.length} test certificates generated — shown on the right</span>
                    <button type="button" className="text-xs font-medium text-navy hover:underline" onClick={clearFiles}>
                      <X className="mr-1 inline h-3 w-3" />
                      Discard
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-500">Test certificates are shown here only. They cannot be downloaded.</p>
              </Card>
            )}

            {content && textBoxes.length > 0 && (
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-h3 text-navy">Wording</h2>
                  <Button size="sm" variant="ghost" onClick={() => setEditWording((v) => !v)}>
                    {editWording ? 'Done' : 'Edit for this test'}
                  </Button>
                </div>
                {textBoxes.map((b) => (
                  <Field key={b.id} label={b.label}>
                    {editWording ? (
                      <Textarea
                        rows={2}
                        value={content.texts[b.key] || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setContent((c) => {
                            if (!c) return c;
                            const rich = { ...(c.rich || {}) };
                            delete rich[b.key];
                            return { ...c, texts: { ...c.texts, [b.key]: v }, rich };
                          });
                        }}
                      />
                    ) : (
                      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{content.texts[b.key] || <span className="text-slate-400">Empty — example text is shown</span>}</p>
                    )}
                  </Field>
                ))}
              </Card>
            )}
          </aside>

          <section className="min-w-0 space-y-4">
            {mode === 'bulk' && sheet && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  Previewing row <b>{rowIndex + 1}</b> of {sheet.rows.length}
                </p>
                <div className="flex items-center gap-1">
                  <IconButton label="Previous certificate" disabled={rowIndex === 0} onClick={() => setRowIndex(rowIndex - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Next certificate" disabled={rowIndex >= sheet.rows.length - 1} onClick={() => setRowIndex(rowIndex + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            )}
            <Card className="p-3 sm:p-4">
              {renderer ? (
                <CertificatePreview renderer={renderer} cert={cert} />
              ) : (
                <div className="flex aspect-[1.414] items-center justify-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading template…
                </div>
              )}
            </Card>
            {mode === 'bulk' && sheet && (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className={th}>#</th>
                        {fields.slice(0, 3).map((f) => (
                          <th key={f.key} className={th}>{`{{${f.name}}}`}</th>
                        ))}
                        <th className={th}>Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pageRows.map((_, j) => {
                        const i = page * PAGE + j;
                        const c = checks[i];
                        return (
                          <tr key={i} className={cx('cursor-pointer', i === rowIndex ? 'bg-brand-50' : 'hover:bg-slate-50')} onClick={() => setRowIndex(i)}>
                            <td className={td}>{i + 1}</td>
                            {fields.slice(0, 3).map((f) => (
                              <td key={f.key} className={cx(td, 'max-w-[12rem] truncate')}>
                                {c?.values[f.key] || <span className="text-slate-400">—</span>}
                              </td>
                            ))}
                            <td className={td}>
                              {c?.errors.length ? (
                                <span className="text-xs text-red-600">{c.errors[0]}</span>
                              ) : c?.warnings.length ? (
                                <span className="text-xs text-amber-700">{c.warnings[0]}</span>
                              ) : (
                                <span className="text-xs text-emerald-700">Ready</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
                  <span>
                    Page {page + 1} of {pages}
                  </span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              </Card>
            )}
            {mode === 'bulk' && files.length > 0 && (
              <Card className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-h3 text-navy">Generated test certificates</h2>
                  <span className="text-xs text-slate-500">
                    {files.length} certificates · page {resultPage + 1} of {Math.max(1, Math.ceil(files.length / RESULT_PAGE))}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {files.slice(resultPage * RESULT_PAGE, resultPage * RESULT_PAGE + RESULT_PAGE).map((f) => (
                    <button
                      key={f.name}
                      type="button"
                      onClick={() => setViewing(f)}
                      className="overflow-hidden rounded-lg border border-slate-200 text-left transition hover:-translate-y-0.5 hover:shadow-float"
                    >
                      <img src={f.pages[0]} alt={f.name} className="paper aspect-[1.414] w-full object-contain" draggable={false} onContextMenu={(e) => e.preventDefault()} />
                      <p className="truncate px-3 py-2 text-xs text-slate-700">{f.name}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" disabled={resultPage === 0} onClick={() => setResultPage(resultPage - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" variant="ghost" disabled={(resultPage + 1) * RESULT_PAGE >= files.length} onClick={() => setResultPage(resultPage + 1)}>
                    Next
                  </Button>
                </div>
              </Card>
            )}
          </section>
        </div>
      )}
      {viewing && <TestViewer file={viewing} list={mode === 'bulk' ? files : [viewing]} onChange={setViewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

/** Large in-app view of a test certificate. There is deliberately no download. */
function TestViewer({ file, list, onChange, onClose }: { file: TestFile; list: TestFile[]; onChange: (f: TestFile) => void; onClose: () => void }) {
  const i = list.findIndex((f) => f.name === file.name);
  return (
    <Modal
      open
      onClose={onClose}
      title={file.name}
      description="Test certificate — view only, never saved or counted."
      size="xl"
      footer={
        list.length > 1 ? (
          <>
            <span className="mr-auto self-center text-xs text-slate-500">
              {i + 1} of {list.length}
            </span>
            <Button size="sm" icon={<ChevronLeft className="h-4 w-4" />} disabled={i <= 0} onClick={() => onChange(list[i - 1])}>
              Previous
            </Button>
            <Button size="sm" disabled={i >= list.length - 1} onClick={() => onChange(list[i + 1])}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3" onContextMenu={(e) => e.preventDefault()}>
        {file.pages.map((u, n) => (
          <img key={u} src={u} alt={`${file.name} page ${n + 1}`} className="paper w-full rounded border border-slate-200" draggable={false} />
        ))}
      </div>
    </Modal>
  );
}

function PhotoPicker({ photo, setPhoto }: { photo: File | null; setPhoto: (f: File | null) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-orange">
      <ImagePlus className="h-4 w-4" /> {photo ? `Photo: ${photo.name}` : 'Use my own test photo (optional)'}
      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
    </label>
  );
}
