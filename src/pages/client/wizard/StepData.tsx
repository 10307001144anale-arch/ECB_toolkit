// Step 2 — Participant data: upload a spreadsheet, or import from Microsoft
// Excel / Google Sheets; automatic column matching with inline correction;
// photos and signatures.

import React, { useMemo, useState } from 'react';
import { CloudDownload, Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { Alert, Badge, Button, Card, Spinner, cx } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { downloadExcelTemplate, readSpreadsheetFile, templateColumns, type ParticipantData } from '../../../engine/spreadsheet';
import { formatDateTime } from '../../../lib/format';
import { CloudPanel, fetchCloudRows, PROVIDERS } from './CloudPanel';
import { MatchSummary } from './MatchSummary';
import { ImagesPanel } from './ImagesPanel';
import type { StepProps } from './state';

export function StepData(props: StepProps) {
  const { w, d, set } = props;
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

  const columns = useMemo(() => (w.template ? templateColumns(d.placeholders, w.template.layout, w.content) : []), [d.placeholders, w.template, w.content]);

  return (
    <div className="space-y-6">
      {w.data ? (
        <LoadedData data={w.data} onReplace={() => set({ data: null })} onRefreshed={accept} />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold">Upload a file</h2>
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
                <span className="text-xs text-slate-500">Excel (.xlsx, .xls) or CSV · any number of rows</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {error && (
                <Alert tone="error" className="mt-3">
                  {error}
                </Alert>
              )}
              <p className="mt-3 text-xs text-slate-500">Read in your browser — participant data is not uploaded to the server.</p>
            </Card>
            <CloudPanel provider="microsoft" onImported={accept} />
            <CloudPanel provider="google" onImported={accept} />
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <h2 className="font-semibold">Start from our Excel template</h2>
                <p className="mt-1 text-sm text-slate-600">
                  The template's column names match the fields in your wording exactly, so everything is matched automatically. It always includes a <code>cid</code> column (participant ID) — the CID
                  is only printed if your wording uses {'{{cid}}'}, but photos named after it (e.g. <b>10701000001.jpg</b>) are matched automatically.
                </p>
              </div>
              <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadExcelTemplate(columns, w.template?.title || 'participants')}>
                Download Excel template
              </Button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    {columns.map((c) => (
                      <th key={c.name} className="border-b border-slate-200 px-3 py-2 font-medium" title={c.description}>
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
          </Card>
        </>
      )}

      {w.data && <MatchSummary {...props} />}
      {w.data && d.needsImages && <ImagesPanel {...props} />}
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
    if (src.kind !== 'cloud') return;
    setRefreshing(true);
    try {
      onRefreshed(await fetchCloudRows(src.provider, src.fileId, src.sheet, src.fileName));
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
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">{src.kind === 'cloud' ? <CloudDownload className="h-5 w-5" /> : <FileSpreadsheet className="h-5 w-5" />}</div>
          <div>
            <p className="font-medium text-slate-900">{src.kind === 'cloud' ? `${src.fileName} › ${src.sheet}` : src.fileName}</p>
            <p className="text-xs text-slate-500">
              {data.rows.length.toLocaleString()} participants · {data.headers.length} columns · {src.kind === 'cloud' ? `from ${PROVIDERS[src.provider].title}, ` : ''}imported {formatDateTime(data.importedAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {src.kind === 'cloud' && (
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
            {data.rows.slice(0, 5).map((r, i) => (
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
      {data.rows.length > 5 && <p className="px-5 py-3 text-xs text-slate-500">Showing the first 5 of {data.rows.length.toLocaleString()} rows.</p>}
    </Card>
  );
}
