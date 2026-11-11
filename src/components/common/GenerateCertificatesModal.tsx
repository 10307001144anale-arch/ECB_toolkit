import React, { useState } from 'react';
import { Download, X, FileText, Image as ImageIcon, Archive, CheckCircle2, AlertCircle } from 'lucide-react';
import { CertificateTemplate, DataRow } from '../../types';
import { GenerationProgress } from '../../utils/pdfGenerator';

interface GenerateCertificatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: CertificateTemplate;
  rows: DataRow[];
  currentRowIndex: number;
  onDownloadSinglePng: (rowIndex: number) => Promise<void>;
  onDownloadSinglePdf: (rowIndex: number) => Promise<void>;
  onDownloadAllPdf: (range?: { start: number; end: number }) => Promise<void>;
  onDownloadAllZip: (range?: { start: number; end: number }) => Promise<void>;
  isGenerating: boolean;
  progress: GenerationProgress | null;
  onCancelGeneration?: () => void;
}

export const GenerateCertificatesModal: React.FC<GenerateCertificatesModalProps> = ({
  isOpen,
  onClose,
  template,
  rows,
  currentRowIndex,
  onDownloadSinglePng,
  onDownloadSinglePdf,
  onDownloadAllPdf,
  onDownloadAllZip,
  isGenerating,
  progress,
  onCancelGeneration,
}) => {
  const [scope, setScope] = useState<'current' | 'all' | 'range'>('all');
  const validRowsCount = rows.filter((r) => r.__isValid !== false).length;
  const currentRow = rows[currentRowIndex] || {};
  const recipientName = currentRow.name || currentRow.recipient_name || currentRow.student_name || `Recipient #${currentRowIndex + 1}`;

  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(Math.min(500, rows.length || 1));

  if (!isOpen) return null;

  const handleBatchZip = () => {
    if (scope === 'range') {
      const s = Math.max(1, Math.min(rangeStart, rows.length));
      const e = Math.max(s, Math.min(rangeEnd, rows.length));
      onDownloadAllZip({ start: s, end: e });
    } else {
      onDownloadAllZip();
    }
  };

  const handleBatchPdf = () => {
    if (scope === 'range') {
      const s = Math.max(1, Math.min(rangeStart, rows.length));
      const e = Math.max(s, Math.min(rangeEnd, rows.length));
      onDownloadAllPdf({ start: s, end: e });
    } else {
      onDownloadAllPdf();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#002C6A] flex items-center justify-center text-white">
              <Download className="w-4 h-4 text-[#FFF005]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#002C6A] dark:text-white">
                Generate Official Certificates
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {template.name} · Supports up to 10,000 Certificates
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Progress bar if generating */}
          {isGenerating && progress && (
            <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-[#002C6A] dark:text-blue-300">
                <span className="truncate max-w-[280px]">{progress.status}</span>
                <span className="font-mono">{progress.percent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-blue-100 dark:bg-blue-900 overflow-hidden">
                <div
                  className="h-full bg-[#002C6A] transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                <span>
                  Processing {progress.current} of {progress.total} certificates (300 DPI vectors)
                </span>
                {onCancelGeneration && (
                  <button
                    type="button"
                    onClick={onCancelGeneration}
                    className="px-2 py-0.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Scope selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Select Output Scope
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScope('current')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  scope === 'current'
                    ? 'border-[#002C6A] bg-blue-50/50 dark:bg-slate-800 ring-2 ring-[#002C6A]/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Single</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
                <p className="text-[10px] text-slate-500 truncate font-mono">
                  #{currentRowIndex + 1}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('all')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  scope === 'all'
                    ? 'border-[#002C6A] bg-blue-50/50 dark:bg-slate-800 ring-2 ring-[#002C6A]/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">All</span>
                  <span className="text-[10px] px-1 py-0.2 rounded font-mono bg-blue-100 dark:bg-blue-900 text-[#002C6A]">
                    {rows.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  All {rows.length} rows
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('range')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  scope === 'range'
                    ? 'border-[#002C6A] bg-blue-50/50 dark:bg-slate-800 ring-2 ring-[#002C6A]/20'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Range</span>
                  <span className="text-[10px] text-slate-400">Chunk</span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Custom span
                </p>
              </button>
            </div>

            {scope === 'range' && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3 text-xs">
                <span className="text-slate-600 dark:text-slate-400 font-semibold">From row:</span>
                <input
                  type="number"
                  min="1"
                  max={rows.length}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(parseInt(e.target.value, 10) || 1)}
                  className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                />
                <span className="text-slate-600 dark:text-slate-400 font-semibold">To row:</span>
                <input
                  type="number"
                  min="1"
                  max={rows.length}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(parseInt(e.target.value, 10) || 1)}
                  className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-mono"
                />
                <span className="text-[11px] text-slate-400 ml-auto font-mono">
                  ({Math.max(0, rangeEnd - rangeStart + 1)} certs)
                </span>
              </div>
            )}
          </div>

          {/* Export formats */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Download Format
            </label>

            {scope === 'current' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => onDownloadSinglePdf(currentRowIndex)}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#002C6A] bg-white dark:bg-slate-900 hover:shadow-sm text-left flex items-start gap-3 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Official PDF Document
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Standard vector PDF for printing & archival
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => onDownloadSinglePng(currentRowIndex)}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#002C6A] bg-white dark:bg-slate-900 hover:shadow-sm text-left flex items-start gap-3 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Hi-Res PNG (300 DPI)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      3508 × 2480 px pristine graphic
                    </p>
                  </div>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleBatchZip}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#002C6A] bg-white dark:bg-slate-900 hover:shadow-sm text-left flex items-start gap-3 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Archive className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      ZIP Archive (.zip)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Individual PDFs inside single zip
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleBatchPdf}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-[#002C6A] bg-white dark:bg-slate-900 hover:shadow-sm text-left flex items-start gap-3 transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-[#F59119] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Merged Multi-Page PDF
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Single file with 1 page per recipient
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Cryptographic client-side rendering</span>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
