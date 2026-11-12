import React, { useEffect, useRef, useState } from 'react';
import { Archive, BookmarkPlus, CheckCircle2, Download, FileStack, FileText, History, PlayCircle, RotateCcw, XCircle } from 'lucide-react';
import { api } from '../../../lib/api';
import { useRouter } from '../../../lib/router';
import { Alert, Button, Card, Field, Input, Modal, ProgressBar, cx } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import type { BatchRecord, ContentPreset } from '../../../../shared/types';
import { makeFileNames, resolveCertificate } from '../../../engine/batch';
import { downloadBlob, downloadZip, runGeneration, safeFileBase, type GenerationProgress, type GenerationResult } from '../../../engine/generate';
import { listOutputs, RETENTION_DAYS } from '../../../engine/localStore';
import { formatDuration } from '../../../lib/format';
import type { StepProps } from './state';

interface Outcome {
  batch: BatchRecord;
  result: GenerationResult;
  rowIndices: number[];
  certificateIds: string[];
}

export function StepGenerate({ w, d, set, onNewBatch }: StepProps & { onNewBatch: () => void }) {
  const { navigate } = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState(w.batchName || `${w.template!.title} — ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [dl, setDl] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const signal = useRef({ cancelled: false });
  const renderer = w.renderer!;
  const ctx = d.ctx!;
  const rows = w.data!.rows;
  const total = d.readyRows.length;

  // Prevent leaving while generating.
  useEffect(() => {
    if (!running) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [running]);

  const start = async () => {
    if (!name.trim()) return setError('Give this batch a name.');
    setError(null);
    setRunning(true);
    signal.current = { cancelled: false };
    const rowIndices = [...d.readyRows];
    try {
      const recipients = rowIndices.map((i) => (w.mapping.recipientColumn ? rows[i][w.mapping.recipientColumn] || null : null));
      const created = await api.post<{ batch: BatchRecord; certificateIds: string[] }>('/api/client/batches', {
        name: name.trim(),
        templateId: w.template!.id,
        versionId: w.template!.versionId,
        content: w.content,
        mapping: w.mapping,
        recipients,
      });
      set({ generatedBatchId: created.batch.id, batchName: name.trim() });
      const fileNames = makeFileNames(rows, rowIndices, w.mapping.recipientColumn);
      setProgress({ total: rowIndices.length, done: 0, succeeded: 0, failed: 0, etaSeconds: null, ratePerSecond: null });
      const result = await runGeneration(
        { batchId: created.batch.id, batchName: name.trim(), renderer, ctx, rows, rowIndices, certificateIds: created.certificateIds, fileNames },
        setProgress,
        signal.current
      );
      const batch = await api.post<BatchRecord>(`/api/client/batches/${created.batch.id}/complete`, {
        successRows: result.successPositions,
        failedCount: result.failures.length,
        cancelled: result.cancelled,
      });
      setOutcome({ batch, result, rowIndices, certificateIds: created.certificateIds });
      if (result.cancelled) showToast(`Stopped. ${result.successPositions.length} certificates were completed and kept.`, 'info');
      else if (result.failures.length) showToast(`${result.successPositions.length} generated, ${result.failures.length} failed`, 'error');
      else showToast(`${result.successPositions.length} certificates generated`, 'success');
    } catch (e: any) {
      setError(e.message);
      if (!outcome) set({ generatedBatchId: null });
    } finally {
      setRunning(false);
    }
  };

  const downloadCombined = async () => {
    if (!outcome) return;
    setDl('combined');
    try {
      const positions = outcome.result.successPositions;
      const bytes = await renderer.renderCombined(positions.length, async (k) => {
        const pos = positions[k];
        const rowIndex = outcome.rowIndices[pos];
        return resolveCertificate(ctx, rows[rowIndex], rowIndex, outcome.certificateIds[pos], (key) => renderer.fixedSignature(key));
      });
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${safeFileBase(outcome.batch.name)} - combined.pdf`);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setDl(null);
    }
  };

  const downloadAll = async () => {
    if (!outcome) return;
    setDl('zip');
    try {
      await downloadZip(outcome.batch.id, outcome.batch.name);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setDl(null);
    }
  };

  // ---------------------------------------------------------------- views

  if (!outcome && !running) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Ready to generate</h2>
          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Template</dt>
            <dd className="text-slate-900">
              {w.template!.title} (version {w.template!.versionNumber})
            </dd>
            <dt className="text-slate-500">Certificates</dt>
            <dd className="font-medium text-slate-900">{total.toLocaleString()}</dd>
            {d.errorRows.length + w.excluded.size > 0 && (
              <>
                <dt className="text-slate-500">Skipped</dt>
                <dd className="text-slate-900">
                  {d.errorRows.length} with errors, {w.excluded.size} excluded
                </dd>
              </>
            )}
            <dt className="text-slate-500">Saved to</dt>
            <dd className="text-slate-900">This browser, for {RETENTION_DAYS} days</dd>
          </dl>
          <Field label="Batch name" htmlFor="batch-name" className="mt-5" hint="Shown in your history and on the verification page.">
            <Input id="batch-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          {error && (
            <Alert tone="error" className="mt-4">
              {error}
            </Alert>
          )}
          <Button variant="primary" size="lg" className="mt-5 w-full" icon={<PlayCircle className="h-5 w-5" />} onClick={start} disabled={total === 0}>
            Generate {total.toLocaleString()} certificate{total === 1 ? '' : 's'}
          </Button>
          <p className="mt-3 text-center text-xs text-slate-500">Certificates are created in your browser. Keep this tab open until it finishes.</p>
        </Card>
      </div>
    );
  }

  if (running) {
    const p = progress;
    const pct = p ? (p.done / Math.max(1, p.total)) * 100 : 0;
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Generating certificates…</h2>
          <ProgressBar value={pct} className="mt-5 h-3" />
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label="Completed" value={p?.succeeded ?? 0} />
            <Stat label="Remaining" value={p ? p.total - p.done : total} />
            <Stat label="Failed" value={p?.failed ?? 0} tone={p?.failed ? 'red' : undefined} />
            <div>
              <p className="text-slate-500">Time left</p>
              <p className="font-medium text-slate-900">{p ? formatDuration(p.etaSeconds) : 'starting…'}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              variant="danger"
              onClick={() => {
                signal.current.cancelled = true;
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500">If you cancel, certificates already finished are kept and can be downloaded.</p>
        </Card>
      </div>
    );
  }

  const o = outcome!;
  const ok = o.result.successPositions.length;
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex items-start gap-3">
          {o.result.failures.length === 0 && !o.result.cancelled ? <CheckCircle2 className="h-7 w-7 text-emerald-600" /> : <XCircle className="h-7 w-7 text-amber-500" />}
          <div>
            <h2 className="text-lg font-semibold">
              {o.result.cancelled ? 'Generation stopped' : o.result.failures.length ? 'Generation finished with some failures' : 'Your certificates are ready'}
            </h2>
            <p className="text-sm text-slate-600">
              {ok.toLocaleString()} of {o.rowIndices.length.toLocaleString()} certificates generated for “{o.batch.name}”.
            </p>
          </div>
        </div>

        {ok > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <DownloadCard icon={<Archive className="h-5 w-5" />} title="ZIP file" description="All certificates as separate PDFs" busy={dl === 'zip'} onClick={downloadAll} />
            <DownloadCard icon={<FileStack className="h-5 w-5" />} title="One combined PDF" description="Every certificate as a page — handy for printing" busy={dl === 'combined'} onClick={downloadCombined} />
            <DownloadCard icon={<FileText className="h-5 w-5" />} title="Individual PDFs" description="Pick single certificates to download" onClick={() => setFilesOpen(true)} />
          </div>
        )}

        {o.result.failures.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-red-700">Failed certificates</h3>
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-red-200 text-sm">
              {o.result.failures.map((f) => (
                <li key={f.position} className="px-3 py-2">
                  Row {f.rowIndex + 1}: <span className="text-slate-600">{f.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button icon={<BookmarkPlus className="h-4 w-4" />} onClick={() => setPresetOpen(true)}>
          Save wording as preset
        </Button>
        <Button icon={<RotateCcw className="h-4 w-4" />} onClick={onNewBatch}>
          New batch with this template
        </Button>
        <Button variant="ghost" icon={<History className="h-4 w-4" />} onClick={() => navigate('/app/history')}>
          Go to history
        </Button>
      </div>

      {filesOpen && <FilesModal batchId={o.batch.id} onClose={() => setFilesOpen(false)} />}
      {presetOpen && (
        <QuickPresetModal
          onClose={() => setPresetOpen(false)}
          onSave={async (n) => {
            await api.post<ContentPreset>('/api/client/presets', { name: n, templateId: w.template!.id, content: w.content });
            showToast(`Preset "${n}" saved`, 'success');
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'red' }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className={cx('font-medium', tone === 'red' ? 'text-red-600' : 'text-slate-900')}>{value.toLocaleString()}</p>
    </div>
  );
}

function DownloadCard({ icon, title, description, onClick, busy }: { icon: React.ReactNode; title: string; description: string; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-60">
      <span className="rounded-lg bg-brand-50 p-2 text-brand-700">{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium text-slate-900">
          {title} <Download className="h-3.5 w-3.5 text-slate-400" />
        </span>
        <span className="block text-xs text-slate-500">{busy ? 'Preparing…' : description}</span>
      </span>
    </button>
  );
}

export function FilesModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const [files, setFiles] = useState<Awaited<ReturnType<typeof listOutputs>> | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    listOutputs(batchId).then(setFiles);
  }, [batchId]);
  const shown = (files || []).filter((f) => !q || f.fileName.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open onClose={onClose} title="Individual certificates" size="lg">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name" className="mb-3" aria-label="Search files" />
      {!files ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-slate-500">No files are stored on this device for this batch.</p>
      ) : (
        <ul className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {shown.slice(0, 500).map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate">{f.fileName}</span>
              <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => downloadBlob(f.blob, f.fileName)}>
                Download
              </Button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 500 && <p className="mt-2 text-xs text-slate-500">Showing 500 of {shown.length}. Use search or download the ZIP.</p>}
    </Modal>
  );
}

function QuickPresetModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title="Save wording as a preset"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              if (!name.trim()) return setErr('Enter a name.');
              setBusy(true);
              try {
                await onSave(name.trim());
                onClose();
              } catch (e: any) {
                setErr(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <Field label="Preset name" error={err}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Certificate of Participation" data-autofocus />
      </Field>
    </Modal>
  );
}

