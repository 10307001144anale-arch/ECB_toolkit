// Bulk generation runner: renders one certificate at a time, yields to the
// browser between certificates (no freezing), reports progress and ETA,
// supports cancellation, isolates per-certificate failures and saves every
// finished PDF immediately so completed work is never lost.

import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { saveAs } from 'file-saver';
import { resolveCertificate, type BatchContext } from './batch';
import { CertificateRenderer, yieldToBrowser } from './renderer';
import { finishLocalBatch, listOutputs, saveOutput, startLocalBatch } from './localStore';

export interface GenerationProgress {
  total: number;
  done: number; // succeeded + failed
  succeeded: number;
  failed: number;
  etaSeconds: number | null;
  ratePerSecond: number | null;
}

export interface GenerationResult {
  /** Positions (0-based, within the batch) that were generated. */
  successPositions: number[];
  failures: { position: number; rowIndex: number; message: string }[];
  cancelled: boolean;
}

export interface GenerationJob {
  batchId: string;
  batchName: string;
  renderer: CertificateRenderer;
  ctx: BatchContext;
  rows: Record<string, string>[];
  /** Spreadsheet row index for each batch position. */
  rowIndices: number[];
  certificateIds: string[];
  fileNames: Map<number, string>;
}

export async function runGeneration(
  job: GenerationJob,
  onProgress: (p: GenerationProgress) => void,
  signal: { cancelled: boolean }
): Promise<GenerationResult> {
  await startLocalBatch(job.batchId, job.batchName);
  const total = job.rowIndices.length;
  const successPositions: number[] = [];
  const failures: GenerationResult['failures'] = [];
  const started = performance.now();
  let lastPaint = 0;
  const fixed = (k: string) => job.renderer.fixedSignature(k);

  for (let pos = 0; pos < total; pos++) {
    if (signal.cancelled) break;
    const rowIndex = job.rowIndices[pos];
    try {
      const cert = resolveCertificate(job.ctx, job.rows[rowIndex], rowIndex, job.certificateIds[pos], fixed);
      const { bytes } = await job.renderer.renderSingle(cert);
      await saveOutput(job.batchId, pos, job.fileNames.get(rowIndex) || `${pos + 1}.pdf`, bytes);
      successPositions.push(pos);
    } catch (err: any) {
      failures.push({ position: pos, rowIndex, message: err?.message || 'Unknown error' });
    }
    const done = pos + 1;
    const elapsed = (performance.now() - started) / 1000;
    const rate = elapsed > 0.5 ? done / elapsed : null;
    const nowMs = performance.now();
    if (nowMs - lastPaint > 120 || done === total) {
      lastPaint = nowMs;
      onProgress({
        total,
        done,
        succeeded: successPositions.length,
        failed: failures.length,
        ratePerSecond: rate,
        etaSeconds: rate ? Math.max(0, Math.round((total - done) / rate)) : null,
      });
    }
    // Yield every certificate; give the browser a full frame every few.
    if (done % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    else await yieldToBrowser();
  }
  await finishLocalBatch(job.batchId);
  return { successPositions, failures, cancelled: signal.cancelled };
}

// ------------------------------------------------------------------ downloads

export function downloadBlob(blob: Blob, name: string) {
  saveAs(blob, name);
}

export function safeFileBase(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 100) || 'certificates';
}

/** ZIP of the individual PDFs saved for a batch on this device. */
export async function downloadZip(batchId: string, batchName: string, onProgress?: (pct: number) => void) {
  const files = await listOutputs(batchId);
  if (!files.length) throw new Error('No certificates are stored on this device for this batch.');
  const zip = new JSZip();
  const folder = zip.folder(safeFileBase(batchName))!;
  for (const f of files) folder.file(f.fileName, f.blob);
  // PDFs are already compressed; storing is much faster and nearly as small.
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true }, (m) => onProgress?.(m.percent));
  downloadBlob(blob, `${safeFileBase(batchName)}.zip`);
}

/**
 * Combined PDF built from the stored individual PDFs (used after a page reload,
 * when participant data is no longer in memory).
 */
export async function downloadCombinedFromStored(batchId: string, batchName: string, onProgress?: (pct: number) => void) {
  const files = await listOutputs(batchId);
  if (!files.length) throw new Error('No certificates are stored on this device for this batch.');
  const out = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    const src = await PDFDocument.load(await files[i].blob.arrayBuffer());
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
    onProgress?.(((i + 1) / files.length) * 100);
    if (i % 5 === 4) await yieldToBrowser();
  }
  const bytes = await out.save({ useObjectStreams: true });
  downloadBlob(new Blob([bytes as BlobPart], { type: 'application/pdf' }), `${safeFileBase(batchName)} - combined.pdf`);
}
