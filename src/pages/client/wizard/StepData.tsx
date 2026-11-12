import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudDownload, Download, FileSpreadsheet, Link2, Link2Off, RefreshCw, Search, Sheet, Upload } from 'lucide-react';
import { api } from '../../../lib/api';
import { Alert, Badge, Button, Card, Input, Spinner, cx } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { downloadExcelTemplate, readSpreadsheetFile, sampleFor, type ParticipantData, type TemplateColumn } from '../../../engine/spreadsheet';
import { SYSTEM_PLACEHOLDERS } from '../../../../shared/placeholders';
import { formatDateTime } from '../../../lib/format';
import type { StepProps } from './state';

export function StepData({ w, d, set }: StepProps) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = (data: ParticipantData) => {
    set({ data, excluded: new Set(), overflow: new Map(), overflowChecked: false, confirmSkipErrors: false });
    showToast(`${data.rows.length.toLocaleString()} participants imported`, 'success');
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      accept(await readSpreadsheetFile(f));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Columns the template + wording need, used for the downloadable Excel template.
  const columns: TemplateColumn[] = useMemo(() => {
    const cols: TemplateColumn[] = [];
    for (const p of d.placeholders) {
      if (p.system || SYSTEM_PLACEHOLDERS[p.key]) continue;
      cols.push({ name: p.name, description: `Used in: ${p.uses.map((u) => u.label).join(', ')}`, samples: [sampleFor(p.name, 0), sampleFor(p.name, 1)] });
    }
    for (const b of w.template?.layout.boxes || []) {
      if (b.type === 'photo') cols.push({ name: b.key === 'photo' ? 'photo' : `${b.key}_file`, description: `File name of the photo for "${b.label}", e.g. karma.jpg. Upload the images on the photos step.`, samples: ['karma.jpg', 'sonam.jpg'] });
      if (b.type === 'signature' && b.source !== 'fixed') cols.push({ name: `${b.key}_file`, description: `Only if each participant has their own signature for "${b.label}": the image file name.`, samples: ['karma_sign.png', 'sonam_sign.png'] });
    }
    return cols;
  }, [d.placeholders, w.template]);

  return (
    <div className="space-y-6">
      {w.data ? (
        <LoadedData data={w.data} onReplace={() => set({ data: null })} onRefreshed={accept} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold">Upload a spreadsheet</h2>
            </div>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                onFile(e.dataTransfer.files[0]);
              }}
              className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center text-sm', drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400')}
            >
              {busy ? <Spinner label="Reading file…" className="py-0" /> : <Upload className="h-6 w-6 text-slate-400" />}
              <span className="text-slate-600">
                <span className="font-medium text-brand-700">Choose a file</span> or drag it here
              </span>
              <span className="text-xs text-slate-500">.xlsx, .xls or .csv · up to 20,000 rows</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {error && (
              <Alert tone="error" className="mt-3">
                {error}
              </Alert>
            )}
            <p className="mt-3 text-xs text-slate-500">The file is read in your browser. Participant data is not uploaded to the server.</p>
          </Card>
          <MicrosoftPanel onImported={accept} />
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">How to prepare your participant list</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
              <li>Put column headings in the first row and one participant per row underneath.</li>
              <li>Your wording uses these fields — include a column for each (names don't have to match exactly; you can match them on the next step).</li>
              <li>For photos or signatures, add a column with each image's file name (e.g. karma.jpg).</li>
            </ul>
          </div>
          <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadExcelTemplate(columns, w.template?.title || 'participants')} disabled={!columns.length}>
            Download Excel template
          </Button>
        </div>
        {columns.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  {columns.map((c) => (
                    <th key={c.name} className="border-b border-slate-200 px-3 py-2 font-medium normal-case">
                      <code className="text-slate-800">{c.name}</code>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-slate-600">
                {[0, 1].map((r) => (
                  <tr key={r}>
                    {columns.map((c) => (
                      <td key={c.name} className="border-b border-slate-100 px-3 py-2">
                        {c.samples[r as 0 | 1]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Your wording does not use any participant fields yet. Go back and insert fields like {'{{name}}'} to personalise each certificate.</p>
        )}
      </Card>
    </div>
  );
}

function LoadedData({ data, onReplace, onRefreshed }: { data: ParticipantData; onReplace: () => void; onRefreshed: (d: ParticipantData) => void }) {
  const { showToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const src = data.source;
  const empty = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const h of data.headers) counts[h] = data.rows.filter((r) => !String(r[h] || '').trim()).length;
    return counts;
  }, [data]);

  const refresh = async () => {
    if (src.kind !== 'microsoft') return;
    setRefreshing(true);
    try {
      const r = await api.get<{ headers: string[]; rows: Record<string, string>[] }>(
        `/api/integrations/microsoft/workbooks/${encodeURIComponent(src.driveId)}/${encodeURIComponent(src.itemId)}/worksheets/${encodeURIComponent(src.worksheet)}/rows`
      );
      if (!r.rows.length) throw new Error('The worksheet has no participant rows.');
      onRefreshed({ ...data, headers: r.headers, rows: r.rows, importedAt: Date.now() });
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">{src.kind === 'microsoft' ? <CloudDownload className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}</div>
          <div>
            <p className="font-medium text-slate-900">{src.kind === 'microsoft' ? `${src.workbook} › ${src.worksheet}` : src.fileName}</p>
            <p className="text-xs text-slate-500">
              {data.rows.length.toLocaleString()} participants · {data.headers.length} columns · imported {formatDateTime(data.importedAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {src.kind === 'microsoft' && (
            <Button size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={refresh} loading={refreshing}>
              Re-import
            </Button>
          )}
          <Button size="sm" onClick={onReplace}>
            Use different data
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              {data.headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                  {empty[h] > 0 && (
                    <Badge tone="amber" className="ml-1.5">
                      {empty[h]} empty
                    </Badge>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.slice(0, 8).map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                {data.headers.map((h) => (
                  <td key={h} className="max-w-56 truncate whitespace-nowrap px-3 py-2 text-slate-700">
                    {r[h] || <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.rows.length > 8 && <p className="px-5 py-3 text-xs text-slate-500">Showing the first 8 of {data.rows.length.toLocaleString()} rows.</p>}
    </Card>
  );
}

interface MsStatus {
  requiresAccount?: boolean;
  configured: boolean;
  connected: boolean;
  accountName: string | null;
}
interface Workbook {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
  lastModified: string | null;
  location: string;
  shared: boolean;
}

function MicrosoftPanel({ onImported }: { onImported: (d: ParticipantData) => void }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<MsStatus | null>(null);
  const [q, setQ] = useState('');
  const [workbooks, setWorkbooks] = useState<Workbook[] | null>(null);
  const [selected, setSelected] = useState<Workbook | null>(null);
  const [sheets, setSheets] = useState<{ name: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    api
      .get<MsStatus>('/api/integrations/microsoft/status')
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(loadStatus, [loadStatus]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'certigen-microsoft') return;
      if (e.data.status === 'connected') {
        showToast('Microsoft account connected', 'success');
        loadStatus();
      } else setError('Microsoft sign-in did not complete. Please try again.');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadStatus, showToast]);

  const search = useCallback(async (query: string) => {
    setBusy('search');
    setError(null);
    try {
      setWorkbooks(await api.get<Workbook[]>(`/api/integrations/microsoft/workbooks?q=${encodeURIComponent(query)}`));
    } catch (e: any) {
      setError(e.message);
      if (e.status === 401) loadStatus();
    } finally {
      setBusy(null);
    }
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected && !workbooks) search('');
  }, [status, workbooks, search]);

  const openWorkbook = async (wb: Workbook) => {
    setSelected(wb);
    setSheets(null);
    setBusy('sheets');
    setError(null);
    try {
      setSheets(await api.get(`/api/integrations/microsoft/workbooks/${encodeURIComponent(wb.driveId)}/${encodeURIComponent(wb.itemId)}/worksheets`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const importSheet = async (sheet: string) => {
    if (!selected) return;
    setBusy(`import:${sheet}`);
    setError(null);
    try {
      const r = await api.get<{ headers: string[]; rows: Record<string, string>[] }>(
        `/api/integrations/microsoft/workbooks/${encodeURIComponent(selected.driveId)}/${encodeURIComponent(selected.itemId)}/worksheets/${encodeURIComponent(sheet)}/rows`
      );
      if (!r.headers.length || !r.rows.length) throw new Error('That worksheet has no participant rows under the heading row.');
      onImported({
        headers: r.headers,
        rows: r.rows,
        source: { kind: 'microsoft', workbook: selected.name, worksheet: sheet, driveId: selected.driveId, itemId: selected.itemId },
        importedAt: Date.now(),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const connect = () => {
    const win = window.open('/api/integrations/microsoft/connect', 'certigen-microsoft', 'width=520,height=700');
    if (!win) setError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
  };

  const disconnect = async () => {
    await api.post('/api/integrations/microsoft/disconnect');
    setWorkbooks(null);
    setSelected(null);
    loadStatus();
  };

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sheet className="h-5 w-5 text-brand-600" />
        <h2 className="font-semibold">Microsoft Excel (OneDrive / SharePoint)</h2>
      </div>
      {!status ? (
        <Spinner />
      ) : status.requiresAccount && status.configured ? (
        <Alert tone="info" title="Needs a client account">
          Connecting Microsoft Excel requires signing in with a client account from your administrator. You can still download your workbook as .xlsx and upload it here.
        </Alert>
      ) : !status.configured ? (
        <Alert tone="info" title="Not available on this server">
          Microsoft Excel has not been set up by your administrator. Download your workbook as .xlsx and upload it instead.
        </Alert>
      ) : !status.connected ? (
        <div className="flex flex-1 flex-col items-start gap-3">
          <p className="text-sm text-slate-600">Sign in with your Microsoft account to pick a workbook. You sign in on Microsoft's own page — your password is never shared with this application.</p>
          <Button variant="primary" icon={<Link2 className="h-4 w-4" />} onClick={connect}>
            Connect Microsoft Excel
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="truncate">Connected as {status.accountName || 'your Microsoft account'}</span>
            <button onClick={disconnect} className="inline-flex items-center gap-1 hover:text-slate-800">
              <Link2Off className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
          {!selected ? (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  search(q);
                }}
              >
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workbooks" className="h-9" aria-label="Search workbooks" />
                <Button size="sm" type="submit" icon={<Search className="h-4 w-4" />} loading={busy === 'search'} className="h-9">
                  Search
                </Button>
              </form>
              <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {busy === 'search' && !workbooks ? (
                  <Spinner />
                ) : !workbooks || workbooks.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">No .xlsx workbooks found.</p>
                ) : (
                  workbooks.map((wb) => (
                    <button key={wb.itemId} onClick={() => openWorkbook(wb)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">{wb.name}</span>
                        <span className="block truncate text-xs text-slate-500">{wb.location}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div>
              <button onClick={() => setSelected(null)} className="mb-2 text-xs font-medium text-brand-700 hover:underline">
                ← All workbooks
              </button>
              <p className="mb-2 text-sm font-medium text-slate-800">{selected.name}</p>
              <p className="mb-2 text-xs text-slate-500">Choose the worksheet with your participants:</p>
              {busy === 'sheets' ? (
                <Spinner />
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {(sheets || []).map((s) => (
                    <div key={s.name} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{s.name}</span>
                      <Button size="sm" variant="subtle" loading={busy === `import:${s.name}`} onClick={() => importSheet(s.name)}>
                        Import
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </Card>
  );
}
