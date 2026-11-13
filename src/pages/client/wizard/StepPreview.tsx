import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Crop, MinusCircle, Pencil, Search, XCircle } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, IconButton, Input, Modal, ProgressBar, Segmented, cx } from '../../../components/ui';
import { substituteRich, type RichDoc } from '../../../../shared/rich';
import { findPhoto, PREVIEW_CERT_ID, resolveCertificate, rowValues } from '../../../engine/batch';
import { CropEditor } from './CropEditor';
import type { PhotoBox } from '../../../../shared/types';
import { resolvePlaceholders } from '../../../../shared/placeholders';
import { yieldToBrowser } from '../../../engine/renderer';
import { CertificatePreview } from './CertificatePreview';
import type { StepProps } from './state';

type Filter = 'all' | 'issues' | 'excluded';

export function StepPreview({ w, d, set, goTo }: StepProps) {
  const rows = w.data!.rows;
  const renderer = w.renderer!;
  const [selected, setSelected] = useState(() => (w.focusRow !== null && w.focusRow < w.data!.rows.length ? w.focusRow : d.readyRows[0] ?? 0));
  const [filter, setFilter] = useState<Filter>(d.errorRows.length && w.focusRow === null ? 'issues' : 'all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(200);
  const [editing, setEditing] = useState<number | null>(null);
  const [cropping, setCropping] = useState<{ box: PhotoBox; name: string; blob: Blob } | null>(null);
  const [checkProgress, setCheckProgress] = useState<number | null>(null);
  const nameCol = w.mapping.recipientColumn || Object.values(w.mapping.placeholders).find((m) => m.column)?.column || w.data!.headers[0];

  // Check every certificate for text that does not fit (fast: measurement only, no PDF).
  const runId = useRef(0);
  useEffect(() => {
    const my = ++runId.current;
    (async () => {
      setCheckProgress(0);
      const map = new Map<number, string[]>();
      for (let i = 0; i < rows.length; i++) {
        if (my !== runId.current) return;
        if (d.checks[i]?.errors.length) continue;
        const { values } = rowValues(d.ctx!, rows[i], i, PREVIEW_CERT_ID);
        const texts: Record<string, string> = {};
        const rich: Record<string, RichDoc> = {};
        for (const b of w.template!.layout.boxes) {
          if (b.type !== 'text') continue;
          const r = resolvePlaceholders(w.content.texts[b.key] || '', values, d.registered);
          texts[b.key] = r.missing.length && !b.required ? '' : r.text;
          const doc = w.content.rich?.[b.key];
          if (doc && texts[b.key]) rich[b.key] = substituteRich(doc, (tok) => resolvePlaceholders(tok, values, d.registered).text, d.registered);
        }
        const warns = await renderer.checkText(texts, rich);
        if (warns.length) map.set(i, warns.map((x) => x.message));
        if (i % 25 === 0) {
          setCheckProgress(Math.round((i / rows.length) * 100));
          await yieldToBrowser();
        }
      }
      if (my !== runId.current) return;
      set({ overflow: map, overflowChecked: true });
      setCheckProgress(null);
    })();
    return () => {
      runId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, w.content, w.mapping, renderer]);

  const status = (i: number): 'excluded' | 'error' | 'warning' | 'ok' => {
    if (w.excluded.has(i)) return 'excluded';
    if (d.checks[i]?.errors.length) return 'error';
    if (d.checks[i]?.warnings.length || w.overflow.get(i)?.length) return 'warning';
    return 'ok';
  };

  const list = useMemo(() => {
    const out: number[] = [];
    const ql = q.trim().toLowerCase();
    for (let i = 0; i < rows.length; i++) {
      const st = status(i);
      if (filter === 'issues' && st !== 'error' && st !== 'warning') continue;
      if (filter === 'excluded' && st !== 'excluded') continue;
      if (ql && !Object.values(rows[i]).some((v) => String(v).toLowerCase().includes(ql))) continue;
      out.push(i);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, q, d.checks, w.excluded, w.overflow]);

  const warnCount = rows.reduce((n, _, i) => n + (status(i) === 'warning' ? 1 : 0), 0);
  const cert = useMemo(
    () => (d.ctx && rows[selected] ? resolveCertificate(d.ctx, rows[selected], selected, PREVIEW_CERT_ID, (k) => renderer.fixedSignature(k)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.ctx, rows, selected, renderer]
  );

  const toggleExclude = (i: number) =>
    set((s) => {
      const ex = new Set(s.excluded);
      ex.has(i) ? ex.delete(i) : ex.add(i);
      return { excluded: ex };
    });

  const pos = list.indexOf(selected);
  const photoBoxes = w.template!.layout.boxes.filter((b): b is PhotoBox => b.type === 'photo' && b.fit === 'cover');
  const selPhotos = d.ctx && rows[selected] ? photoBoxes.map((b) => ({ box: b, entry: findPhoto(d.ctx!, b.key, rows[selected]).entry })).filter((x) => x.entry) : [];
  const fixLinks = (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
      <button type="button" className="text-brand-700 hover:underline" onClick={() => setEditing(selected)}>
        Edit this row
      </button>
      <button type="button" className="text-brand-700 hover:underline" onClick={() => goTo('data')}>
        Fix columns, photos or signatures
      </button>
      <button type="button" className="text-brand-700 hover:underline" onClick={() => goTo('design')}>
        Edit wording
      </button>
    </div>
  );
  const sel = d.checks[selected];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Summary icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />} label="Ready" value={d.readyRows.length - warnCount} />
        <Summary icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} label="Ready, with warnings" value={warnCount} />
        <Summary icon={<XCircle className="h-5 w-5 text-red-500" />} label="Errors (will be skipped)" value={d.errorRows.length} />
        <Summary icon={<MinusCircle className="h-5 w-5 text-slate-400" />} label="Excluded by you" value={w.excluded.size} />
      </div>
      {checkProgress !== null && (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          Checking that all wording fits… <ProgressBar value={checkProgress} className="max-w-xs" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="flex flex-col lg:col-span-2" style={{ maxHeight: '75vh' }}>
          <div className="space-y-3 border-b border-slate-100 p-3">
            <Segmented
              size="sm"
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setLimit(200);
              }}
              options={[
                { value: 'all', label: `All (${rows.length})` },
                { value: 'issues', label: `Issues (${d.errorRows.length + warnCount})` },
                { value: 'excluded', label: `Excluded (${w.excluded.size})` },
              ]}
            />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search participants" className="h-9 pl-9" aria-label="Search participants" />
            </div>
          </div>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
            {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">Nothing to show.</li>}
            {list.slice(0, limit).map((i) => {
              const st = status(i);
              return (
                <li key={i} className={cx('flex items-center gap-2 px-3 py-2 text-sm', i === selected ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                  <input type="checkbox" checked={!w.excluded.has(i)} onChange={() => toggleExclude(i)} className="h-4 w-4 rounded border-slate-300" aria-label={`Include row ${i + 1}`} />
                  <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setSelected(i)}>
                    <span className="w-8 shrink-0 text-xs text-slate-400">{i + 1}</span>
                    <span className={cx('min-w-0 flex-1 truncate', st === 'excluded' && 'text-slate-400 line-through')}>{rows[i][nameCol] || <em className="text-slate-400">no name</em>}</span>
                    {st === 'error' && <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    {st === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />}
                    {st === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  </button>
                </li>
              );
            })}
            {list.length > limit && (
              <li className="p-3 text-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 500)}>
                  Show more ({list.length - limit} remaining)
                </Button>
              </li>
            )}
          </ul>
        </Card>

        <div className="space-y-3 lg:col-span-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <IconButton label="Previous participant" disabled={pos <= 0} onClick={() => setSelected(list[pos - 1])}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <span className="text-sm text-slate-700">
                Row {selected + 1} of {rows.length}
              </span>
              <IconButton label="Next participant" disabled={pos < 0 || pos >= list.length - 1} onClick={() => setSelected(list[pos + 1])}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="flex gap-2">
              <Button size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(selected)}>
                Edit row
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleExclude(selected)}>
                {w.excluded.has(selected) ? 'Include' : 'Exclude'}
              </Button>
            </div>
          </div>
          {sel?.errors.length ? (
            <Alert tone="error" title="This certificate will not be generated until fixed">
              <ul className="list-disc pl-4">
                {sel.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              {fixLinks}
            </Alert>
          ) : null}
          {(sel?.warnings.length || w.overflow.get(selected)?.length) && !sel?.errors.length ? (
            <Alert tone="warning">
              <ul className="list-disc pl-4">
                {[...(sel?.warnings || []), ...(w.overflow.get(selected) || [])].map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              {fixLinks}
            </Alert>
          ) : null}
          {selPhotos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {selPhotos.map(({ box, entry }) => {
                const manual = !!w.crops[`${box.key}|${entry!.name}`];
                return (
                  <Button key={box.key} size="sm" icon={<Crop className="h-4 w-4" />} onClick={() => setCropping({ box, name: entry!.name, blob: entry!.blob })}>
                    Adjust {photoBoxes.length > 1 ? box.label : 'photo'}
                    {manual && <span className="ml-1 text-xs text-emerald-700">(adjusted)</span>}
                  </Button>
                );
              })}
              <span className="text-xs text-slate-500">Photos are cropped around the face automatically.</span>
            </div>
          )}
          <CertificatePreview renderer={renderer} cert={cert} debounceMs={120} />
          <p className="text-xs text-slate-500">
            The QR code and certificate ID in the preview are samples. Real IDs are issued when you generate.
          </p>
        </div>
      </div>

      {d.errorRows.length > 0 && (
        <Card className="p-4">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={w.confirmSkipErrors} onChange={(e) => set({ confirmSkipErrors: e.target.checked })} />
            <span>
              <b>Skip {d.errorRows.length} participant{d.errorRows.length === 1 ? '' : 's'} with errors</b> and generate the other {d.readyRows.length}. Incomplete certificates are never generated.
            </span>
          </label>
        </Card>
      )}

      {cropping && (
        <CropEditor
          blob={cropping.blob}
          box={cropping.box}
          fileName={cropping.name}
          aspect={(() => {
            const pg = renderer.pageSize(cropping.box.page);
            return ((cropping.box.w / 100) * pg.width) / ((cropping.box.h / 100) * pg.height);
          })()}
          initial={w.crops[`${cropping.box.key}|${cropping.name}`] || null}
          onReset={() =>
            set((s) => {
              const crops = { ...s.crops };
              delete crops[`${cropping.box.key}|${cropping.name}`];
              return { crops };
            })
          }
          onSave={(c) => {
            set((s) => ({ crops: { ...s.crops, [`${cropping.box.key}|${cropping.name}`]: c } }));
            setCropping(null);
          }}
          onClose={() => setCropping(null)}
        />
      )}

      {editing !== null && (
        <EditRowModal
          headers={w.data!.headers}
          row={rows[editing]}
          index={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            set((s) => {
              const nextRows = [...s.data!.rows];
              nextRows[editing] = updated;
              return { data: { ...s.data!, rows: nextRows } };
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      {icon}
      <div>
        <p className="text-xl font-semibold">{Math.max(0, value).toLocaleString()}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

function EditRowModal({ headers, row, index, onClose, onSave }: { headers: string[]; row: Record<string, string>; index: number; onClose: () => void; onSave: (r: Record<string, string>) => void }) {
  const [draft, setDraft] = useState({ ...row });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit row ${index + 1}`}
      description="Changes apply to this batch only. Your original spreadsheet is not modified."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(draft)}>
            Save row
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {headers.map((h) => (
          <Field key={h} label={h}>
            <Input value={draft[h] || ''} onChange={(e) => setDraft({ ...draft, [h]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Badge className="mt-3">Row {index + 1}</Badge>
    </Modal>
  );
}
