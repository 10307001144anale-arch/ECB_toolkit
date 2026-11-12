// Automatic column matching shown as a small summary with inline correction
// (no separate mapping page).

import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, Sparkles } from 'lucide-react';
import { Card, Select, cx } from '../../../components/ui';
import { DATE_FORMATS, formatValue } from '../../../engine/batch';
import { matchColumn } from '../../../../shared/placeholders';
import type { PlaceholderSetting } from '../../../../shared/types';
import type { StepProps } from './state';

export function MatchSummary({ w, d, set }: StepProps) {
  const headers = w.data?.headers || [];
  const first = w.data?.rows[0] || {};
  const user = d.placeholders.filter((p) => !p.system);
  const unmatched = user.filter((p) => !w.mapping.placeholders[p.key]?.column);
  const [open, setOpen] = useState(unmatched.length > 0);
  const show = open || unmatched.length > 0;

  const update = (key: string, patch: Partial<PlaceholderSetting>) =>
    set((s) => ({
      mapping: {
        ...s.mapping,
        placeholders: { ...s.mapping.placeholders, [key]: { ...{ column: null, type: 'text' as const, dateFormat: 'D MMMM YYYY' }, ...s.mapping.placeholders[key], ...patch } },
      },
    }));

  const colSelect = (value: string, onChange: (v: string | null) => void, label: string, empty: string, invalid = false) => (
    <div className="w-full sm:w-56">
    <Select value={value} onChange={(e) => onChange(e.target.value || null)} aria-label={label} className={cx('h-8 min-w-40 text-sm', invalid && 'border-red-300')}>
      <option value="">{empty}</option>
      {headers.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </Select>
    </div>
  );

  return (
    <Card className="p-5">
      <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={show}>
        {unmatched.length ? <CircleAlert className="h-5 w-5 shrink-0 text-red-500" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
        <span className="flex-1">
          <span className="font-medium text-slate-900">
            {user.length === 0
              ? 'Your wording does not use any spreadsheet fields'
              : unmatched.length
                ? `${user.length - unmatched.length} of ${user.length} fields matched — choose a column for ${unmatched.length === 1 ? 'the last one' : `the other ${unmatched.length}`}`
                : `All ${user.length} field${user.length === 1 ? '' : 's'} matched to your columns automatically`}
          </span>
          <span className="block text-xs text-slate-500">
            {user
              .filter((p) => w.mapping.placeholders[p.key]?.column)
              .slice(0, 6)
              .map((p) => `{{${p.name}}} ← ${w.mapping.placeholders[p.key]!.column}`)
              .join(' · ')}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-brand-700">
          {show ? 'Hide' : 'Review'} <ChevronDown className={cx('h-4 w-4 transition-transform', show && 'rotate-180')} />
        </span>
      </button>

      {show && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          {user.map((p) => {
            const m = w.mapping.placeholders[p.key];
            const col = m?.column || '';
            const auto = col && matchColumn(p.name, headers) === col;
            const sample = col ? formatValue(first[col] || '', m) : null;
            return (
              <div key={p.key} className={cx('flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5 text-sm', !col && 'bg-red-50')}>
                <code className="w-40 truncate rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">{`{{${p.name}}}`}</code>
                <span className="text-slate-400">←</span>
                {colSelect(col, (v) => update(p.key, { column: v }), `Column for ${p.name}`, '— Choose a column —', !col)}
                {auto && <Sparkles className="h-4 w-4 text-emerald-600" aria-label="Matched automatically" />}
                <div className="w-28">
                <Select value={m?.type || 'text'} onChange={(e) => update(p.key, { type: e.target.value as PlaceholderSetting['type'] })} className="h-8 w-24 text-sm" aria-label={`Type for ${p.name}`}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </Select>
                </div>
                {m?.type === 'date' && (
                  <div className="w-44">
                  <Select value={m.dateFormat} onChange={(e) => update(p.key, { dateFormat: e.target.value })} className="h-8 w-40 text-sm" aria-label="Date format">
                    {DATE_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.example}
                      </option>
                    ))}
                  </Select>
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                  {sample ? sample.error ? <span className="text-red-600">{sample.error}</span> : `e.g. ${sample.value || '(empty)'}` : null}
                </span>
              </div>
            );
          })}
          <div className="grid gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">Participant ID (CID) — used for photo matching</span>
              {colSelect(w.mapping.idColumn || '', (v) => set((s) => ({ mapping: { ...s.mapping, idColumn: v } })), 'Participant ID column', '— No ID column —')}
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-600">Name shown on the public verification page</span>
              {colSelect(w.mapping.recipientColumn || '', (v) => set((s) => ({ mapping: { ...s.mapping, recipientColumn: v } })), 'Verification name column', "Don't show a name")}
            </label>
          </div>
        </div>
      )}
    </Card>
  );
}
