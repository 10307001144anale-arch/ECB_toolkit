import React from 'react';
import { CheckCircle2, CircleAlert, Sparkles } from 'lucide-react';
import { Alert, Card, Field, Select, cx } from '../../../components/ui';
import { DATE_FORMATS, formatValue } from '../../../engine/batch';
import { matchColumn, SYSTEM_PLACEHOLDERS } from '../../../../shared/placeholders';
import type { PlaceholderSetting } from '../../../../shared/types';
import type { StepProps } from './state';

export function StepMapping({ w, d, set }: StepProps) {
  const headers = w.data?.headers || [];
  const first = w.data?.rows[0] || {};
  const user = d.placeholders.filter((p) => !p.system);
  const system = d.placeholders.filter((p) => p.system);

  const update = (key: string, patch: Partial<PlaceholderSetting>) =>
    set((s) => ({
      mapping: {
        ...s.mapping,
        placeholders: { ...s.mapping.placeholders, [key]: { ...{ column: null, type: 'text', dateFormat: 'D MMMM YYYY' }, ...s.mapping.placeholders[key], ...patch } },
      },
    }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Match your columns to the fields in your wording</h2>
        <p className="mt-1 text-sm text-slate-600">We matched what we could automatically. Check each row and change any that are wrong.</p>
      </div>

      {user.length === 0 ? (
        <Alert tone="info">Your wording does not use any spreadsheet fields, so every certificate will have the same text.</Alert>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Field in wording</th>
                  <th className="px-4 py-3 font-medium">Spreadsheet column</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Example (row 1)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {user.map((p) => {
                  const m = w.mapping.placeholders[p.key];
                  const col = m?.column || '';
                  const auto = col && matchColumn(p.name, headers) === col;
                  const sample = col ? formatValue(first[col] || '', m) : null;
                  return (
                    <tr key={p.key} className={cx(!col && 'bg-red-50/40')}>
                      <td className="px-4 py-3 align-top">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-800">{`{{${p.name}}}`}</code>
                        <p className="mt-1 text-xs text-slate-500">Used in {p.uses.map((u) => u.label).join(', ')}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <Select value={col} onChange={(e) => update(p.key, { column: e.target.value || null })} aria-label={`Column for ${p.name}`} className={cx('h-9 min-w-44', !col && 'border-red-300')}>
                            <option value="">— Choose a column —</option>
                            {headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </Select>
                          {col ? (
                            auto ? (
                              <span title="Matched automatically" className="text-emerald-600">
                                <Sparkles className="h-4 w-4" />
                              </span>
                            ) : (
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            )
                          ) : (
                            <CircleAlert className="h-4 w-4 text-red-500" aria-label="Not matched" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-2">
                          <Select value={m?.type || 'text'} onChange={(e) => update(p.key, { type: e.target.value as PlaceholderSetting['type'] })} className="h-9 w-32" aria-label={`Type for ${p.name}`}>
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                          </Select>
                          {m?.type === 'date' && (
                            <Select value={m.dateFormat} onChange={(e) => update(p.key, { dateFormat: e.target.value })} className="h-9 w-44" aria-label="Date format">
                              {DATE_FORMATS.map((f) => (
                                <option key={f.value} value={f.value}>
                                  {f.example}
                                </option>
                              ))}
                            </Select>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-slate-700">
                        {sample ? sample.error ? <span className="text-red-600">{sample.error}</span> : sample.value || <span className="text-slate-400">(empty)</span> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {system.length > 0 && (
        <p className="text-sm text-slate-600">
          Filled in automatically:{' '}
          {system.map((p) => (
            <span key={p.key} className="mr-2">
              <code className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{`{{${p.name}}}`}</code> {SYSTEM_PLACEHOLDERS[p.key]?.label}
            </span>
          ))}
        </p>
      )}

      <Card className="p-5">
        <Field
          label="Name shown on the public verification page"
          hint="When someone scans the QR code or checks the certificate ID, this name confirms who the certificate belongs to. Only this one value is stored on the server."
        >
          <Select value={w.mapping.recipientColumn || ''} onChange={(e) => set((s) => ({ mapping: { ...s.mapping, recipientColumn: e.target.value || null } }))} className="max-w-sm">
            <option value="">Don't show a name</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
    </div>
  );
}
