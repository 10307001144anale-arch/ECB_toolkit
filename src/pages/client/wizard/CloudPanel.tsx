// Import participants from Microsoft Excel (OneDrive / SharePoint) or Google
// Sheets. Both providers use the same server routes and the same import
// pipeline as uploaded files; access is read-only and tokens stay on the server.

import React, { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, Link2, Link2Off, Search, Sheet } from 'lucide-react';
import { api } from '../../../lib/api';
import { Alert, Button, Card, Input, Spinner } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { toParticipantData, type CloudProvider, type ParticipantData } from '../../../engine/spreadsheet';

interface Status {
  configured: boolean;
  connected: boolean;
  accountName: string | null;
}
interface CloudFile {
  id: string;
  name: string;
  location: string;
  modified: string | null;
}

export const PROVIDERS: Record<CloudProvider, { title: string; product: string; fileWord: string; sheetWord: string; color: string }> = {
  microsoft: { title: 'Microsoft Excel', product: 'OneDrive / SharePoint', fileWord: 'workbook', sheetWord: 'worksheet', color: 'text-emerald-700' },
  google: { title: 'Google Sheets', product: 'Google Drive', fileWord: 'spreadsheet', sheetWord: 'sheet', color: 'text-green-600' },
};

export async function fetchCloudRows(provider: CloudProvider, fileId: string, sheet: string, fileName: string): Promise<ParticipantData> {
  const r = await api.get<{ headers: string[]; rows: Record<string, string>[] }>(
    `/api/integrations/${provider}/files/${encodeURIComponent(fileId)}/sheets/${encodeURIComponent(sheet)}/rows`
  );
  return toParticipantData(r, { kind: 'cloud', provider, fileId, fileName, sheet });
}

export function CloudPanel({ provider, onImported }: { provider: CloudProvider; onImported: (d: ParticipantData) => void }) {
  const P = PROVIDERS[provider];
  const { showToast } = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<CloudFile[] | null>(null);
  const [selected, setSelected] = useState<CloudFile | null>(null);
  const [sheets, setSheets] = useState<{ name: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/integrations/${provider}`;

  const loadStatus = useCallback(() => {
    api
      .get<Status>(`${base}/status`)
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, [base]);
  useEffect(loadStatus, [loadStatus]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'certigen-oauth' || e.data.provider !== provider) return;
      if (e.data.status === 'connected') {
        showToast(`${P.title} connected`, 'success');
        setFiles(null);
        loadStatus();
      } else setError(`${P.title} sign-in did not complete. Please try again.`);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadStatus, showToast, provider, P.title]);

  const search = useCallback(
    async (query: string) => {
      setBusy('search');
      setError(null);
      try {
        setFiles(await api.get<CloudFile[]>(`${base}/files?q=${encodeURIComponent(query)}`));
      } catch (e: any) {
        setError(e.message);
        if (e.status === 401) loadStatus();
      } finally {
        setBusy(null);
      }
    },
    [base, loadStatus]
  );

  useEffect(() => {
    if (status?.connected && !files) search('');
  }, [status, files, search]);

  const openFile = async (f: CloudFile) => {
    setSelected(f);
    setSheets(null);
    setBusy('sheets');
    setError(null);
    try {
      setSheets(await api.get(`${base}/files/${encodeURIComponent(f.id)}/sheets`));
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
      onImported(await fetchCloudRows(provider, selected.id, sheet, selected.name));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const connect = () => {
    const win = window.open(`${base}/connect`, `certigen-${provider}`, 'width=520,height=700');
    if (!win) setError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
  };

  const disconnect = async () => {
    try {
      await api.post(`${base}/disconnect`);
    } finally {
      setFiles(null);
      setSelected(null);
      loadStatus();
    }
  };

  return (
    <Card className="flex flex-col p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sheet className={`h-5 w-5 ${P.color}`} />
        <h2 className="font-semibold">{P.title}</h2>
        <span className="text-xs text-slate-500">{P.product}</span>
      </div>
      {!status ? (
        <Spinner />
      ) : !status.configured ? (
        <Alert tone="info" title="Not set up on this server">
          {P.title} import has not been configured by the administrator yet. Download the file as .xlsx or .csv and upload it instead.
        </Alert>
      ) : !status.connected ? (
        <div className="flex flex-1 flex-col items-start gap-3">
          <p className="text-sm text-slate-600">
            Sign in on {provider === 'google' ? "Google's" : "Microsoft's"} own page to pick a {P.fileWord}. Access is read-only and your password is never shared with this application.
          </p>
          <Button variant="primary" icon={<Link2 className="h-4 w-4" />} onClick={connect}>
            Connect {P.title}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="truncate">Connected as {status.accountName || `your ${provider === 'google' ? 'Google' : 'Microsoft'} account`}</span>
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
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${P.fileWord}s`} className="h-9" aria-label={`Search ${P.fileWord}s`} />
                <Button size="sm" type="submit" icon={<Search className="h-4 w-4" />} loading={busy === 'search'} className="h-9">
                  Search
                </Button>
              </form>
              <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {busy === 'search' && !files ? (
                  <Spinner />
                ) : !files || files.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">No {P.fileWord}s found.</p>
                ) : (
                  files.map((f) => (
                    <button key={f.id} onClick={() => openFile(f)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">{f.name}</span>
                        <span className="block truncate text-xs text-slate-500">{f.location}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div>
              <button onClick={() => setSelected(null)} className="mb-2 text-xs font-medium text-brand-700 hover:underline">
                ← All {P.fileWord}s
              </button>
              <p className="mb-2 text-sm font-medium text-slate-800">{selected.name}</p>
              <p className="mb-2 text-xs text-slate-500">Choose the {P.sheetWord} with your participants:</p>
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
