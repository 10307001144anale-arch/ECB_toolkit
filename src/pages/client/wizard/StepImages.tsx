import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, ImagePlus, PenLine, UserSquare2 } from 'lucide-react';
import { Alert, Badge, Card, Field, Select, Spinner, cx } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { ImageLibrary, readImageFiles } from '../../../engine/images';
import { fileUrl } from '../../../lib/api';
import type { PhotoBox, SignatureBox, SignatureContent } from '../../../../shared/types';
import type { StepProps } from './state';

export function StepImages({ w, set }: StepProps) {
  const { showToast } = useToast();
  const layout = w.template!.layout;
  const headers = w.data?.headers || [];
  const rows = w.data?.rows || [];
  const photoBoxes = layout.boxes.filter((b): b is PhotoBox => b.type === 'photo');
  const sigBoxes = layout.boxes.filter((b): b is SignatureBox => b.type === 'signature');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);

  // Pre-select likely columns.
  useEffect(() => {
    const guess = (re: RegExp) => headers.find((h) => re.test(h)) || '';
    set((s) => {
      const photos = { ...s.content.photos };
      let changed = false;
      for (const b of photoBoxes) {
        if (!photos[b.key]?.column) {
          const g = guess(/photo|picture|image|passport/i);
          if (g) {
            photos[b.key] = { column: g };
            changed = true;
          }
        }
      }
      return changed ? { content: { ...s.content, photos } } : {};
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { added, skipped } = await readImageFiles([...files]);
      const lib = new ImageLibrary([...w.images.entries, ...added]);
      set((s) => ({ images: lib, imagesVersion: s.imagesVersion + 1 }));
      setSkipped(skipped);
      if (added.length) showToast(`${added.length} image${added.length === 1 ? '' : 's'} added`, 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const setSig = (key: string, patch: Partial<SignatureContent>) =>
    set((s) => ({ content: { ...s.content, signatures: { ...s.content.signatures, [key]: { ...(s.content.signatures[key] || { mode: 'none' as const, column: '', fileName: '' }), ...patch } } } }));

  // Matching report per referenced column.
  const report = useMemo(() => {
    const cols = new Map<string, string>();
    photoBoxes.forEach((b) => w.content.photos[b.key]?.column && cols.set(w.content.photos[b.key].column, b.label));
    sigBoxes.forEach((b) => w.content.signatures[b.key]?.mode === 'column' && w.content.signatures[b.key].column && cols.set(w.content.signatures[b.key].column, b.label));
    return [...cols.entries()].map(([col, label]) => {
      const missing: string[] = [];
      let empty = 0;
      let matched = 0;
      for (const r of rows) {
        const v = (r[col] || '').trim();
        if (!v) empty++;
        else if (w.images.find(v)) matched++;
        else missing.push(v);
      }
      return { col, label, matched, empty, missing };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.content, w.images, w.imagesVersion, rows]);

  const used = useMemo(() => {
    const names = new Set<string>();
    for (const r of report)
      for (const row of rows) {
        const e = w.images.find(row[r.col]);
        if (e) names.add(e.name);
      }
    sigBoxes.forEach((b) => {
      const s = w.content.signatures[b.key];
      if (s?.mode === 'single' && s.fileName) names.add(s.fileName);
    });
    return names;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, w.images, w.imagesVersion, w.content]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Photos and signatures</h2>
        <p className="mt-1 text-sm text-slate-600">Images are matched by file name — never by upload order. They stay in your browser.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {photoBoxes.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <UserSquare2 className="h-5 w-5 text-emerald-600" />
                <h3 className="font-medium">{b.label}</h3>
                {b.required ? <Badge tone="blue">Required</Badge> : <span className="text-xs text-slate-400">Optional</span>}
              </div>
              <Field label="Column with each participant's photo file name" hint="For example a column called “photo” containing karma.jpg">
                <Select
                  value={w.content.photos[b.key]?.column || ''}
                  onChange={(e) => set((s) => ({ content: { ...s.content, photos: { ...s.content.photos, [b.key]: { column: e.target.value } } } }))}
                >
                  <option value="">{b.required ? '— Choose a column —' : 'No photos'}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>
            </Card>
          ))}

          {sigBoxes.map((b) => {
            const s = w.content.signatures[b.key] || { mode: 'none', column: '', fileName: '' };
            const allowFixed = b.source !== 'client' && !!b.fixedSignatureFileId;
            const allowClient = b.source !== 'fixed';
            return (
              <Card key={b.id} className="p-5">
                <div className="mb-3 flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-amber-600" />
                  <h3 className="font-medium">{b.label}</h3>
                  {b.required ? <Badge tone="blue">Required</Badge> : <span className="text-xs text-slate-400">Optional</span>}
                </div>
                <div className="space-y-2 text-sm">
                  {allowFixed && (
                    <label className="flex items-start gap-2">
                      <input type="radio" className="mt-1" checked={s.mode === 'fixed'} onChange={() => setSig(b.key, { mode: 'fixed' })} />
                      <span className="flex-1">
                        Use the official signature provided by the administrator
                        <span className="checkerboard mt-1 flex h-12 w-40 items-center justify-center rounded border border-slate-200">
                          <img src={fileUrl(b.fixedSignatureFileId)} alt="" className="max-h-10 max-w-full object-contain" />
                        </span>
                      </span>
                    </label>
                  )}
                  {allowClient && (
                    <>
                      <label className="flex items-start gap-2">
                        <input type="radio" className="mt-1" checked={s.mode === 'single'} onChange={() => setSig(b.key, { mode: 'single' })} />
                        <span>The same signature on every certificate</span>
                      </label>
                      {s.mode === 'single' && (
                        <div className="ml-6">
                          <Select value={s.fileName} onChange={(e) => setSig(b.key, { fileName: e.target.value })} aria-label="Signature image">
                            <option value="">{w.images.size ? '— Choose an uploaded image —' : 'Upload the signature image first'}</option>
                            {w.images.entries.map((e) => (
                              <option key={e.name} value={e.name}>
                                {e.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
                      <label className="flex items-start gap-2">
                        <input type="radio" className="mt-1" checked={s.mode === 'column'} onChange={() => setSig(b.key, { mode: 'column' })} />
                        <span>A different signature for each participant (file names in a column)</span>
                      </label>
                      {s.mode === 'column' && (
                        <div className="ml-6">
                          <Select value={s.column} onChange={(e) => setSig(b.key, { column: e.target.value })} aria-label="Signature column">
                            <option value="">— Choose a column —</option>
                            {headers.map((h) => (
                              <option key={h} value={h}>
                                {h}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </>
                  )}
                  {!b.required && (
                    <label className="flex items-start gap-2">
                      <input type="radio" className="mt-1" checked={s.mode === 'none'} onChange={() => setSig(b.key, { mode: 'none' })} />
                      <span>No signature</span>
                    </label>
                  )}
                  {!allowFixed && b.source === 'fixed' && <Alert tone="warning">The administrator has not uploaded the signature for this box yet.</Alert>}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-3 font-medium">Upload images</h3>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm', drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400')}
            >
              {busy ? <Spinner label="Reading images…" className="py-0" /> : <ImagePlus className="h-6 w-6 text-slate-400" />}
              <span className="text-slate-600">
                <span className="font-medium text-brand-700">Choose images</span> or a ZIP folder, or drag them here
              </span>
              <span className="text-xs text-slate-500">JPG, PNG, WEBP · up to 10 MB each</span>
              <input type="file" multiple accept="image/*,.zip" className="sr-only" onChange={(e) => addFiles(e.target.files)} />
            </label>
            {skipped.length > 0 && (
              <Alert tone="warning" className="mt-3" title={`${skipped.length} file(s) skipped`}>
                {skipped.slice(0, 5).map((s) => `${s.name} (${s.reason})`).join(', ')}
                {skipped.length > 5 ? '…' : ''}
              </Alert>
            )}
            <p className="mt-3 text-xs text-slate-500">{w.images.size} image{w.images.size === 1 ? '' : 's'} uploaded</p>
          </Card>

          {report.map((r) => (
            <Card key={r.col} className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">
                  Column “{r.col}” <span className="font-normal text-slate-500">· {r.label}</span>
                </h3>
                {r.missing.length === 0 && r.empty === 0 ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <CircleAlert className="h-5 w-5 text-amber-500" />}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {r.matched} matched · {r.missing.length} missing · {r.empty} empty
              </p>
              {r.missing.length > 0 && (
                <p className="mt-2 text-xs text-red-700">
                  Not uploaded: {r.missing.slice(0, 12).join(', ')}
                  {r.missing.length > 12 ? ` and ${r.missing.length - 12} more` : ''}
                </p>
              )}
            </Card>
          ))}

          {w.images.size > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 font-medium">Uploaded images</h3>
              <ImageGrid lib={w.images} used={used} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageGrid({ lib, used }: { lib: ImageLibrary; used: Set<string> }) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const shown = lib.entries.slice(0, 48);
  useEffect(() => {
    const m = new Map<string, string>();
    for (const e of shown) m.set(e.name, URL.createObjectURL(e.blob));
    setUrls(m);
    return () => m.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib]);
  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {shown.map((e) => (
          <figure key={e.name} className="min-w-0" title={e.name}>
            <div className={cx('checkerboard aspect-square overflow-hidden rounded-md ring-1', used.has(e.name) ? 'ring-emerald-300' : 'ring-slate-200 opacity-60')}>
              {urls.get(e.name) && <img src={urls.get(e.name)} alt={e.name} className="h-full w-full object-cover" />}
            </div>
            <figcaption className="mt-1 truncate text-[10px] text-slate-500">{e.name}</figcaption>
          </figure>
        ))}
      </div>
      {lib.size > shown.length && <p className="mt-2 text-xs text-slate-500">and {lib.size - shown.length} more</p>}
      {lib.entries.some((e) => !used.has(e.name)) && <p className="mt-2 text-xs text-slate-500">Faded images are not used by any participant.</p>}
    </>
  );
}
