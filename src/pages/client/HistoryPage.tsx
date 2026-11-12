import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Copy, Eye, FileStack, FileText, History, MoreHorizontal, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useRouter } from '../../lib/router';
import { Badge, Button, Card, EmptyState, IconButton, Menu, Modal, PageHeader, Spinner, useConfirm } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { BatchRecord } from '../../../shared/types';
import { allLocalBatches, deleteLocalBatch, RETENTION_DAYS } from '../../engine/localStore';
import { downloadBlob, downloadCombinedFromStored, downloadZip, safeFileBase } from '../../engine/generate';
import { formatDateOnly, formatDateTime } from '../../lib/format';
import { BatchStatusBadge } from '../admin/ActivityPage';
import { FilesModal } from './wizard/StepGenerate';

export default function HistoryPage() {
  const { navigate } = useRouter();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [batches, setBatches] = useState<BatchRecord[] | null>(null);
  const [local, setLocal] = useState<Map<string, { expiresAt: number; count: number }>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [filesFor, setFilesFor] = useState<string | null>(null);
  const [details, setDetails] = useState<BatchRecord | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([api.get<BatchRecord[]>('/api/client/batches'), allLocalBatches().catch(() => [])]);
      setBatches(b);
      setLocal(new Map(l.filter((x) => x.expiresAt > Date.now()).map((x) => [x.batchId, x])));
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  }, [showToast]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (id: string, kind: string, fn: () => Promise<void>) => {
    setBusy(`${id}:${kind}`);
    try {
      await fn();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Generation history"
        description={`Every batch is listed here. Generated PDFs are kept in this browser for ${RETENTION_DAYS} days, then deleted automatically to protect participant data.`}
      />
      {!batches ? (
        <Spinner />
      ) : batches.length === 0 ? (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="No batches yet"
          description="Batches you generate will appear here."
          action={
            <Button variant="primary" onClick={() => navigate('/app/new')}>
              Start a batch
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Certificates</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Files on this device</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => {
                  const l = local.get(b.id);
                  return (
                    <tr key={b.id} className="align-top hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{b.name}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(b.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {b.templateTitle} <span className="text-slate-400">v{b.templateVersionNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {b.success.toLocaleString()} / {b.total.toLocaleString()}
                        {b.failed > 0 && <span className="block text-xs text-red-600">{b.failed} failed</span>}
                      </td>
                      <td className="px-4 py-3">
                        <BatchStatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3">
                        {l && l.count > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" icon={<Archive className="h-3.5 w-3.5" />} loading={busy === `${b.id}:zip`} onClick={() => run(b.id, 'zip', () => downloadZip(b.id, b.name))}>
                              ZIP
                            </Button>
                            <Button size="sm" icon={<FileStack className="h-3.5 w-3.5" />} loading={busy === `${b.id}:pdf`} onClick={() => run(b.id, 'pdf', () => downloadCombinedFromStored(b.id, b.name))}>
                              Combined
                            </Button>
                            <Button size="sm" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => setFilesFor(b.id)}>
                              Files
                            </Button>
                            <p className="w-full text-xs text-slate-400">Deleted after {formatDateOnly(l.expiresAt)}</p>
                          </div>
                        ) : (
                          <Badge>Not on this device</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Menu
                          trigger={(t) => (
                            <IconButton label={`Actions for ${b.name}`} onClick={t}>
                              <MoreHorizontal className="h-4 w-4" />
                            </IconButton>
                          )}
                          items={[
                            { label: 'View details', icon: <Eye className="h-4 w-4" />, onClick: () => setDetails(b) },
                            { label: 'Duplicate as new batch', icon: <Copy className="h-4 w-4" />, onClick: () => navigate(`/app/new?from=${b.id}`) },
                            {
                              label: 'Delete files from this device',
                              icon: <Trash2 className="h-4 w-4" />,
                              danger: true,
                              disabled: !l,
                              onClick: async () => {
                                if (!(await confirm({ title: 'Delete stored PDFs?', message: 'The generated PDFs are removed from this browser. The batch record and certificate verification stay.', confirmLabel: 'Delete', danger: true }))) return;
                                await deleteLocalBatch(b.id);
                                load();
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {filesFor && <FilesModal batchId={filesFor} onClose={() => setFilesFor(null)} />}
      {details && <BatchDetails batch={details} onClose={() => setDetails(null)} />}
    </>
  );
}

function BatchDetails({ batch, onClose }: { batch: BatchRecord; onClose: () => void }) {
  const [certs, setCerts] = useState<{ id: string; row_index: number; status: string }[] | null>(null);
  useEffect(() => {
    api.get<{ certificates: { id: string; row_index: number; status: string }[] }>(`/api/client/batches/${batch.id}`).then((r) => setCerts(r.certificates));
  }, [batch.id]);
  const exportIds = () => {
    const csv = ['position,certificate_id,status', ...(certs || []).map((c) => `${c.row_index + 1},${c.id},${c.status}`)].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv' }), `${safeFileBase(batch.name)} - certificate IDs.csv`);
  };
  return (
    <Modal open onClose={onClose} title={batch.name} description={`${batch.templateTitle} · version ${batch.templateVersionNumber} · ${formatDateTime(batch.createdAt)}`} size="lg">
      <h3 className="mb-2 text-sm font-semibold">Wording used</h3>
      <dl className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
        {Object.entries(batch.content.texts).filter(([, v]) => v.trim()).length === 0 && <p className="text-slate-500">No wording recorded.</p>}
        {Object.entries(batch.content.texts)
          .filter(([, v]) => v.trim())
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="whitespace-pre-wrap text-slate-900">{v}</dd>
            </div>
          ))}
      </dl>
      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Certificate IDs</h3>
        <Button size="sm" onClick={exportIds} disabled={!certs}>
          Export CSV
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {certs ? `${certs.filter((c) => c.status === 'valid').length} valid · ${certs.filter((c) => c.status !== 'valid').length} void or revoked` : 'Loading…'}
      </p>
    </Modal>
  );
}
