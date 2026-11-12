// Participant photos and signatures (part of Step 2). Photos are matched by
// the file name in a photo column or by the participant ID (CID) — never by
// upload order — and are cropped automatically around the face. Signatures
// can be drawn or uploaded, are trimmed, and can be resized / repositioned
// inside the box. Everything stays in the browser.

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, ImagePlus, PenLine, Upload, UserSquare2 } from 'lucide-react';
import { Alert, Badge, Button, Card, Field, Segmented, Select, Spinner, cx } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { ImageLibrary, MAX_IMAGE_BYTES, prepareImage, readImageFiles, trimSignature } from '../../../engine/images';
import { findPhoto } from '../../../engine/batch';
import { fileUrl } from '../../../lib/api';
import type { PhotoBox, SignatureBox, SignatureContent } from '../../../../shared/types';
import { SignaturePad } from './SignaturePad';
import type { StepProps } from './state';

export const SIGNATURE_GUIDANCE =
  'Upload a clear signature image in PNG or JPG/JPEG format. PNG with a transparent background is recommended for the cleanest result. You can also draw your signature directly using your mouse, finger, or stylus.';

const DEFAULT_SIG: SignatureContent = { mode: 'none', column: '', fileName: '', scale: 1, offsetX: 0, offsetY: 0 };

export function ImagesPanel({ w, d, set }: StepProps) {
  const layout = w.template!.layout;
  const photoBoxes = layout.boxes.filter((b): b is PhotoBox => b.type === 'photo');
  const sigBoxes = layout.boxes.filter((b): b is SignatureBox => b.type === 'signature');
  if (!photoBoxes.length && !sigBoxes.length) return null;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">{photoBoxes.length && sigBoxes.length ? 'Photos and signatures' : photoBoxes.length ? 'Participant photos' : 'Signatures'}</h2>
        <p className="mt-1 text-sm text-slate-600">Images stay in your browser and are never uploaded to the server.</p>
      </div>
      {photoBoxes.length > 0 && <PhotosCard w={w} d={d} set={set} boxes={photoBoxes} />}
      {sigBoxes.map((b) => (
        <SignatureCard key={b.id} w={w} set={set} box={b} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- photos

function useImageAdder(w: StepProps['w'], set: StepProps['set']) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState<{ name: string; reason: string }[]>([]);
  const add = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const { added, skipped } = await readImageFiles([...files]);
      set((s) => ({ images: new ImageLibrary([...s.images.entries, ...added]), imagesVersion: s.imagesVersion + 1 }));
      setSkipped(skipped);
      if (added.length) showToast(`${added.length} image${added.length === 1 ? '' : 's'} added`, 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return { add, busy, skipped };
}

function PhotosCard({ w, d, set, boxes }: Pick<StepProps, 'w' | 'd' | 'set'> & { boxes: PhotoBox[] }) {
  const headers = w.data?.headers || [];
  const rows = w.data?.rows || [];
  const { add, busy, skipped } = useImageAdder(w, set);
  const [drag, setDrag] = useState(false);

  // Pre-select a photo column if the sheet has one.
  useEffect(() => {
    const guess = headers.find((h) => /^(photo|picture|image|passport.?photo|photo.?file(name)?)(_?\d+)?$/i.test(h.trim()));
    if (!guess) return;
    set((s) => {
      const photos = { ...s.content.photos };
      let changed = false;
      boxes.forEach((b, i) => {
        if (photos[b.key]?.column) return;
        const numbered = headers.find((h) => h.trim().toLowerCase() === `photo_${i + 1}`);
        photos[b.key] = { column: boxes.length > 1 && numbered ? numbered : guess };
        changed = true;
      });
      return changed ? { content: { ...s.content, photos } } : {};
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.data]);

  const report = useMemo(() => {
    if (!d.ctx) return [];
    return boxes.map((b) => {
      let matched = 0;
      const missing: string[] = [];
      let noRef = 0;
      for (const r of rows) {
        const { entry, tried } = findPhoto(d.ctx!, b.key, r);
        if (entry) matched++;
        else if (tried) missing.push(tried);
        else noRef++;
      }
      return { box: b, matched, missing, noRef };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.ctx, rows, w.imagesVersion]);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <UserSquare2 className="h-5 w-5 text-emerald-600" />
        <h3 className="font-medium">Photos</h3>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Alert tone="info">
            Name each photo after the participant's CID — for example <b>10701000001.jpg</b> — or put the photo file name in a <b>photo</b> column. Photos are never matched by upload order.
          </Alert>
          <Field label="Participant ID column (CID)" hint="Photos named after this value are matched automatically. The ID is only printed if your wording uses {{cid}}.">
            <Select value={w.mapping.idColumn || ''} onChange={(e) => set((s) => ({ mapping: { ...s.mapping, idColumn: e.target.value || null } }))}>
              <option value="">— No ID column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </Field>
          {boxes.map((b) => (
            <Field key={b.id} label={boxes.length > 1 ? `Photo file name column for “${b.label}”` : 'Photo file name column'} optional>
              <Select
                value={w.content.photos[b.key]?.column || ''}
                onChange={(e) => set((s) => ({ content: { ...s.content, photos: { ...s.content.photos, [b.key]: { column: e.target.value } } } }))}
              >
                <option value="">Match by participant ID only</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
          <p className="text-xs text-slate-500">Photos are cropped automatically around the face. You can adjust any photo (move, zoom, rotate) on the Preview step.</p>
        </div>
        <div className="space-y-3">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              add(e.dataTransfer.files);
            }}
            className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm', drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400')}
          >
            {busy ? <Spinner label="Reading images…" className="py-0" /> : <ImagePlus className="h-6 w-6 text-slate-400" />}
            <span className="text-slate-600">
              <span className="font-medium text-brand-700">Choose photos</span> or a ZIP folder, or drag them here
            </span>
            <span className="text-xs text-slate-500">JPG, PNG, WebP · up to {MAX_IMAGE_BYTES / 1024 / 1024} MB each · any number of photos</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,.zip" className="sr-only" onChange={(e) => add(e.target.files)} />
          </label>
          {skipped.length > 0 && (
            <Alert tone="warning" title={`${skipped.length} file(s) skipped`}>
              {skipped.slice(0, 5).map((s) => `${s.name} (${s.reason})`).join(', ')}
              {skipped.length > 5 ? '…' : ''}
            </Alert>
          )}
          {report.map((r) => (
            <div key={r.box.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {r.box.label} {r.box.required ? <Badge tone="blue">Required</Badge> : <span className="text-xs font-normal text-slate-400">Optional</span>}
                </span>
                {r.matched === rows.length ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <CircleAlert className="h-5 w-5 text-amber-500" />}
              </div>
              <p className="mt-1 text-slate-600">
                {r.matched} of {rows.length} matched{r.missing.length ? ` · ${r.missing.length} not uploaded` : ''}
                {r.noRef ? ` · ${r.noRef} without file name or ID` : ''}
              </p>
              {r.missing.length > 0 && (
                <p className="mt-1 text-xs text-red-700">
                  Missing: {r.missing.slice(0, 10).join(', ')}
                  {r.missing.length > 10 ? ` and ${r.missing.length - 10} more` : ''}
                </p>
              )}
            </div>
          ))}
          {(() => { const n = w.images.entries.filter((e) => !e.name.startsWith('signature-')).length; return <p className="text-xs text-slate-500">{n} photo{n === 1 ? '' : 's'} added</p>; })()}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- signatures

function SignatureCard({ w, set, box }: Pick<StepProps, 'w' | 'set'> & { box: SignatureBox }) {
  const { showToast } = useToast();
  const headers = w.data?.headers || [];
  const s: SignatureContent = { ...DEFAULT_SIG, ...(w.content.signatures[box.key] || {}) };
  const allowFixed = box.source !== 'client' && !!box.fixedSignatureFileId;
  const allowClient = box.source !== 'fixed';
  const image = s.mode === 'single' ? w.images.find(s.fileName) : null;
  const [tab, setTab] = useState<'draw' | 'upload'>('draw');
  const [editing, setEditing] = useState(!image);
  const { add, busy: adding } = useImageAdder(w, set);

  const patch = (p: Partial<SignatureContent>) =>
    set((st) => ({ content: { ...st.content, signatures: { ...st.content.signatures, [box.key]: { ...DEFAULT_SIG, ...(st.content.signatures[box.key] || {}), ...p } } } }));

  const applySignature = (blob: Blob) => {
    // A new name each time so previews and caches pick up the new image.
    const name = `signature-${box.key}-${Date.now().toString(36)}.png`;
    set((st) => ({
      images: new ImageLibrary([...st.images.entries.filter((e) => e.name !== st.content.signatures[box.key]?.fileName), { name, blob, size: blob.size }]),
      imagesVersion: st.imagesVersion + 1,
      content: { ...st.content, signatures: { ...st.content.signatures, [box.key]: { ...DEFAULT_SIG, ...(st.content.signatures[box.key] || {}), mode: 'single', fileName: name } } },
    }));
    setEditing(false);
  };

  const onUpload = async (f: File | undefined) => {
    if (!f) return;
    const ok = /\.(png|jpe?g|webp)$/i.test(f.name) && /^image\/(png|jpeg|webp)$/.test(f.type || 'image/png');
    if (!ok) return showToast('Use a PNG, JPG/JPEG or WebP image for the signature.', 'error');
    if (f.size > MAX_IMAGE_BYTES) return showToast('The signature image is too large (max 15 MB).', 'error');
    try {
      applySignature(await trimSignature(f, { clearBackground: !/png|webp/i.test(f.type) }));
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <PenLine className="h-5 w-5 text-amber-600" />
        <h3 className="font-medium">{box.label}</h3>
        {box.required ? <Badge tone="blue">Required</Badge> : <span className="text-xs text-slate-400">Optional</span>}
      </div>
      <div className="space-y-2 text-sm">
        {allowFixed && (
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1" checked={s.mode === 'fixed'} onChange={() => patch({ mode: 'fixed' })} />
            <span className="flex-1">
              Use the official signature provided by the administrator
              <span className="checkerboard mt-1 flex h-12 w-40 items-center justify-center rounded border border-slate-200">
                <img src={fileUrl(box.fixedSignatureFileId)} alt="" className="max-h-10 max-w-full object-contain" />
              </span>
            </span>
          </label>
        )}
        {allowClient && (
          <>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={s.mode === 'single'} onChange={() => patch({ mode: 'single' })} />
              <span>Draw or upload one signature for every certificate</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" className="mt-1" checked={s.mode === 'column'} onChange={() => patch({ mode: 'column' })} />
              <span>A different signature for each participant (file names in a column)</span>
            </label>
          </>
        )}
        {!box.required && (
          <label className="flex items-start gap-2">
            <input type="radio" className="mt-1" checked={s.mode === 'none'} onChange={() => patch({ mode: 'none' })} />
            <span>No signature</span>
          </label>
        )}
        {!allowFixed && box.source === 'fixed' && <Alert tone="warning">The administrator has not uploaded the signature for this box yet.</Alert>}
      </div>

      {s.mode === 'single' && (
        <div className="mt-4 grid gap-5 border-t border-slate-100 pt-4 lg:grid-cols-2">
          <div className="space-y-3">
            {image && !editing ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { setTab('draw'); setEditing(true); }}>
                  Redraw
                </Button>
                <Button size="sm" onClick={() => { setTab('upload'); setEditing(true); }}>
                  Replace with an image
                </Button>
              </div>
            ) : (
              <>
                <Segmented
                  size="sm"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'draw', label: 'Draw' },
                    { value: 'upload', label: 'Upload image' },
                  ]}
                />
                {tab === 'draw' ? (
                  <SignaturePad onDone={applySignature} onCancel={image ? () => setEditing(false) : undefined} />
                ) : (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center text-sm hover:border-slate-400">
                    <Upload className="h-6 w-6 text-slate-400" />
                    <span className="font-medium text-brand-700">Choose a signature image</span>
                    <span className="text-xs text-slate-500">PNG (transparent background recommended), JPG/JPEG or WebP</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
                  </label>
                )}
              </>
            )}
            <p className="text-xs text-slate-500">{SIGNATURE_GUIDANCE}</p>
          </div>
          {image && (
            <SignaturePlacementEditor w={w} box={box} blob={image.blob} s={s} onChange={patch} />
          )}
        </div>
      )}

      {s.mode === 'column' && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <Field label="Column with each participant's signature file name">
            <Select value={s.column} onChange={(e) => patch({ column: e.target.value })}>
              <option value="">— Choose a column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-brand-700">
            {adding ? <Spinner className="py-0" /> : <ImagePlus className="h-4 w-4" />} Add signature images (or a ZIP)
            <input type="file" multiple accept="image/png,image/jpeg,image/webp,.zip" className="sr-only" onChange={(e) => add(e.target.files)} />
          </label>
          <p className="text-xs text-slate-500">{SIGNATURE_GUIDANCE}</p>
          <SizeControls s={s} onChange={patch} />
        </div>
      )}
    </Card>
  );
}

function SizeControls({ s, onChange }: { s: SignatureContent; onChange: (p: Partial<SignatureContent>) => void }) {
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-center gap-3">
        <span className="w-24 text-slate-600">Size</span>
        <input type="range" min={30} max={100} value={Math.round(s.scale * 100)} onChange={(e) => onChange({ scale: +e.target.value / 100 })} className="flex-1" aria-label="Signature size" />
        <span className="w-10 text-right text-xs text-slate-500">{Math.round(s.scale * 100)}%</span>
      </label>
      <label className="flex items-center gap-3">
        <span className="w-24 text-slate-600">Left ↔ right</span>
        <input type="range" min={-100} max={100} value={Math.round(s.offsetX * 100)} onChange={(e) => onChange({ offsetX: +e.target.value / 100 })} className="flex-1" aria-label="Horizontal position" />
        <span className="w-10" />
      </label>
      <label className="flex items-center gap-3">
        <span className="w-24 text-slate-600">Up ↕ down</span>
        <input type="range" min={-100} max={100} value={Math.round(s.offsetY * 100)} onChange={(e) => onChange({ offsetY: +e.target.value / 100 })} className="flex-1" aria-label="Vertical position" />
        <span className="w-10" />
      </label>
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => onChange({ scale: 1, offsetX: 0, offsetY: 0 })}>
        Reset size and position
      </button>
    </div>
  );
}

/** Shows the signature exactly as it will be placed in the box (same code path as the PDF). */
function SignaturePlacementEditor({ w, box, blob, s, onChange }: { w: StepProps['w']; box: SignatureBox; blob: Blob; s: SignatureContent; onChange: (p: Partial<SignatureContent>) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const page = w.renderer?.pageSize(box.page) || { width: 842, height: 595 };
  const wPt = (box.w / 100) * page.width;
  const hPt = (box.h / 100) * page.height;
  useEffect(() => {
    let alive = true;
    let u: string | null = null;
    prepareImage(blob, box, wPt, hPt, { placement: { scale: s.scale, offsetX: s.offsetX, offsetY: s.offsetY } })
      .then((img) => {
        if (!alive) return;
        u = URL.createObjectURL(new Blob([img.bytes as BlobPart], { type: 'image/png' }));
        setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [blob, box, wPt, hPt, s.scale, s.offsetX, s.offsetY]);
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">How it fits in the signature box</p>
      <div className="checkerboard relative w-full overflow-hidden rounded border border-dashed border-brand-400" style={{ aspectRatio: `${wPt} / ${hPt}` }}>
        {url && <img src={url} alt="Signature preview" className="absolute inset-0 h-full w-full" />}
      </div>
      <SizeControls s={s} onChange={onChange} />
    </div>
  );
}
