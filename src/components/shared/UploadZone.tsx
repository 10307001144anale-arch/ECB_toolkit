// File upload area with clear states, so it is always obvious whether a file
// has been chosen or uploaded:
//   empty → dashed gray · dragging → navy · uploading → navy with spinner ·
//   done (chosen / uploaded) → green with a check, file name and size · error → red.

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { cx } from './ui';

export type UploadState = 'empty' | 'uploading' | 'done' | 'error';

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadZone({
  id,
  state,
  fileName,
  fileSize,
  doneLabel = 'File ready',
  emptyLabel = 'Choose a file',
  hint,
  busyText,
  error,
  accept,
  disabled,
  compact,
  onPick,
}: {
  id: string;
  state: UploadState;
  fileName?: string | null;
  fileSize?: number | null;
  /** Shown above the file name when done, e.g. "Uploaded" or "Ready to upload". */
  doneLabel?: string;
  emptyLabel?: string;
  hint?: string;
  busyText?: string | null;
  error?: string | null;
  accept: string;
  disabled?: boolean;
  /** One-line version for side panels. */
  compact?: boolean;
  onPick: (f: File | undefined) => void;
}) {
  const [drag, setDrag] = useState(false);
  const busy = state === 'uploading';
  const tone =
    state === 'error'
      ? 'border-red-600 bg-red-50'
      : busy
        ? 'border-navy bg-brand-50'
        : state === 'done'
          ? 'border-emerald-600 bg-emerald-50'
          : drag
            ? 'border-navy bg-brand-50'
            : 'border-dashed border-slate-300 bg-white hover:border-navy hover:bg-slate-50';

  const icon =
    state === 'error' ? (
      <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
    ) : busy ? (
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-navy" />
    ) : state === 'done' ? (
      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
    ) : (
      <FileUp className="h-5 w-5 shrink-0 text-slate-400" />
    );

  const text =
    state === 'error' ? (
      <span className="text-red-800">
        <span className="block font-medium">Upload failed</span>
        <span className="block text-xs">{error || 'Try another file.'}</span>
      </span>
    ) : busy ? (
      <span className="text-navy">
        <span className="block font-medium">{busyText || 'Uploading…'}</span>
        {fileName && <span className="block truncate text-xs text-slate-600">{fileName}</span>}
      </span>
    ) : state === 'done' ? (
      <span className="min-w-0 text-emerald-900">
        <span className="block text-xs font-semibold uppercase tracking-wide text-emerald-800">{doneLabel}</span>
        <span className="block truncate font-medium text-slate-900">{fileName || 'File uploaded'}</span>
        <span className="block text-xs text-slate-600">
          {fileSize ? `${formatBytes(fileSize)} · ` : ''}Click or drop to replace
        </span>
      </span>
    ) : (
      <span className="text-slate-600">
        <span className="font-medium text-navy underline-offset-2 group-hover:underline">{emptyLabel}</span> or drag it here
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    );

  return (
    <label
      htmlFor={id}
      aria-busy={busy}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled && !busy) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!disabled && !busy) onPick(e.dataTransfer.files[0]);
      }}
      className={cx(
        'light-surface group flex cursor-pointer rounded-lg border-2 text-sm transition-colors duration-200',
        compact ? 'items-center gap-3 px-3 py-2.5 text-left' : 'flex-col items-center justify-center gap-2 px-4 py-6 text-center',
        tone,
        (disabled || busy) && 'cursor-not-allowed',
        disabled && 'opacity-60'
      )}
    >
      {icon}
      {text}
      <input id={id} type="file" accept={accept} className="sr-only" disabled={disabled || busy} onChange={(e) => onPick(e.target.files?.[0])} />
    </label>
  );
}
