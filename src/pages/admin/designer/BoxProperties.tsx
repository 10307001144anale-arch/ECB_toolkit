import React, { useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ChevronDown,
  Copy,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { CustomFontRef, PhotoBox, QrBox, SignatureBox, TemplateBox, TemplateLayout, TextBox } from '../../../../shared/types';
import { defaultCaption, FONT_FAMILIES, makeKey } from '../../../../shared/layout';
import { api, fileUrl } from '../../../lib/api';
import { Button, Field, IconButton, Input, Segmented, Select, Textarea, Toggle, cx } from '../../../components/ui';
import { BOX_STYLE } from './DesignCanvas';
import { useToast } from '../../../context/ToastContext';

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800" aria-expanded={open}>
        {title}
        <ChevronDown className={cx('h-4 w-4 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, suffix, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; label: string }) {
  return (
    <div className="relative">
      <Input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className={cx('h-9', suffix && 'pr-8')}
      />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>}
    </div>
  );
}

function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [text, setText] = useState(value);
  React.useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5" />
      <Input
        value={text}
        aria-label={`${label} hex`}
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
        className="h-9 font-mono uppercase"
        maxLength={7}
      />
    </div>
  );
}

interface Props {
  box: TemplateBox;
  layout: TemplateLayout;
  /** True once the template has been published: keys then stay stable so saved client presets keep matching. */
  published?: boolean;
  onChange: (patch: Partial<TemplateBox>, commit?: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function BoxProperties({ box, layout, published, onChange, onDelete, onDuplicate }: Props) {
  const st = BOX_STYLE[box.type];
  const [keyTouched, setKeyTouched] = useState(!!published);
  const keyClash = layout.boxes.some((b) => b.id !== box.id && b.key === box.key);
  const keyInvalid = !/^[a-z][a-z0-9_]{0,47}$/.test(box.key);
  const set = (patch: Partial<TemplateBox>) => onChange(patch, true);

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cx('flex h-6 w-6 items-center justify-center rounded text-white', st.chip)}>{st.icon}</span>
          <span className="font-semibold text-slate-900">{st.name}</span>
        </div>
        <div className="flex">
          <IconButton label="Duplicate box (Ctrl+D)" onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
          </IconButton>
          <IconButton label="Delete box (Delete)" onClick={onDelete} className="hover:bg-red-50 hover:text-red-600">
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <Section title="Field">
        <Field label="Label shown to clients" htmlFor="bp-label">
          <Input
            id="bp-label"
            value={box.label}
            maxLength={80}
            onChange={(e) => {
              const label = e.target.value;
              const patch: Partial<TemplateBox> = { label };
              if (!keyTouched && label.trim()) {
                const k = makeKey(label);
                if (!layout.boxes.some((b) => b.id !== box.id && b.key === k)) patch.key = k;
              }
              onChange(patch, false);
            }}
            onBlur={() => onChange({}, true)}
          />
        </Field>
        <Field label="Internal field key" htmlFor="bp-key" error={keyInvalid ? 'Use lower-case letters, numbers and underscores, starting with a letter.' : keyClash ? 'Another box already uses this key.' : null} hint={published ? 'Changing this after publishing disconnects clients\' saved wording for this box.' : 'Identifier only, e.g. recipient_name. Not printed.'}>
          <Input
            id="bp-key"
            value={box.key}
            maxLength={48}
            className="font-mono"
            onChange={(e) => {
              setKeyTouched(true);
              onChange({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }, false);
            }}
            onBlur={() => onChange({}, true)}
          />
        </Field>
        <Field label="Help text for clients" htmlFor="bp-desc" optional>
          <Textarea
            id="bp-desc"
            rows={2}
            value={box.description}
            maxLength={300}
            placeholder={box.type === 'text' ? 'e.g. The main message of the certificate' : ''}
            onChange={(e) => onChange({ description: e.target.value }, false)}
            onBlur={() => onChange({}, true)}
          />
        </Field>
        <Toggle checked={box.required} onChange={(v) => set({ required: v })} label="Required" description={box.type === 'text' ? 'Clients must fill this box.' : 'Every certificate must include this.'} />
        {box.type === 'text' && (
          <Field
            label="Default wording"
            htmlFor="bp-default"
            optional
            hint={'Shown to clients as a starting point; they can keep it or rewrite it for their batch. You can use fields like {{name}}. Leave empty if the client should write it.'}
          >
            <Textarea
              id="bp-default"
              rows={3}
              value={box.defaultText}
              maxLength={5000}
              placeholder="e.g. This certificate is proudly presented to"
              onChange={(e) => onChange({ defaultText: e.target.value } as Partial<TemplateBox>, false)}
              onBlur={() => onChange({}, true)}
            />
          </Field>
        )}
      </Section>

      <Section title="Position & size" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <NumberInput label="X position" value={box.x} step={0.1} min={0} max={100} suffix="%" onChange={(v) => set({ x: Math.min(100 - box.w, Math.max(0, v)) })} />
          </Field>
          <Field label="Y">
            <NumberInput label="Y position" value={box.y} step={0.1} min={0} max={100} suffix="%" onChange={(v) => set({ y: Math.min(100 - box.h, Math.max(0, v)) })} />
          </Field>
          <Field label="Width">
            <NumberInput label="Width" value={box.w} step={0.1} min={0.5} max={100} suffix="%" onChange={(v) => set({ w: Math.min(100 - box.x, Math.max(0.5, v)) })} />
          </Field>
          <Field label="Height">
            <NumberInput label="Height" value={box.h} step={0.1} min={0.5} max={100} suffix="%" onChange={(v) => set({ h: Math.min(100 - box.y, Math.max(0.5, v)) })} />
          </Field>
        </div>
        {layout.pages.length > 1 && (
          <Field label="Page">
            <Select value={box.page} onChange={(e) => set({ page: Number(e.target.value) })}>
              {layout.pages.map((_, i) => (
                <option key={i} value={i}>
                  Page {i + 1}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <p className="text-xs text-slate-500">Positions are percentages of the page, so they stay exact at any size. Arrow keys nudge the box (Shift for larger steps).</p>
      </Section>

      {box.type === 'text' && <TextSections box={box} fonts={layout.fonts} set={set} />}
      {box.type === 'qr' && <QrSections box={box} set={set} />}
      {box.type === 'photo' && <PhotoSections box={box} set={set} />}
      {box.type === 'signature' && <SignatureSections box={box} set={set} />}
      {box.type === 'signature' && <SignerSection box={box} fonts={layout.fonts} set={set} />}
    </div>
  );
}

function TextSections({ box, fonts, set }: { box: TextBox; fonts: CustomFontRef[]; set: (p: Partial<TextBox>) => void }) {
  const families = [...new Set([...FONT_FAMILIES, ...fonts.map((f) => f.family)])];
  return (
    <>
      <Section title="Font">
        <Field label="Font family">
          <Select value={box.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {families.map((f) => (
              <option key={f} value={f}>
                {f}
                {fonts.some((x) => x.family === f) ? ' (uploaded)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center gap-2">
          <Segmented
            size="sm"
            ariaLabel="Font weight"
            value={box.fontWeight}
            onChange={(v) => set({ fontWeight: v })}
            options={[
              { value: '400', label: 'Regular' },
              { value: '700', label: <b>Bold</b> },
            ]}
          />
          <Segmented
            size="sm"
            ariaLabel="Font style"
            value={box.italic ? 'i' : 'n'}
            onChange={(v) => set({ italic: v === 'i' })}
            options={[
              { value: 'n', label: 'Normal' },
              { value: 'i', label: <i>Italic</i> },
            ]}
          />
        </div>
        <Field label="Colour">
          <ColorInput label="Font colour" value={box.color} onChange={(v) => set({ color: v })} />
        </Field>
        <Toggle checked={box.autoFit} onChange={(v) => set({ autoFit: v })} label="Fit text automatically" description="Shrinks long wording so it always stays inside the box." />
        {box.autoFit ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Maximum size">
              <NumberInput label="Maximum font size" value={box.maxFontSize} min={4} max={300} step={0.5} suffix="pt" onChange={(v) => set({ maxFontSize: v, minFontSize: Math.min(box.minFontSize, v) })} />
            </Field>
            <Field label="Minimum size">
              <NumberInput label="Minimum font size" value={box.minFontSize} min={4} max={300} step={0.5} suffix="pt" onChange={(v) => set({ minFontSize: Math.min(v, box.maxFontSize) })} />
            </Field>
          </div>
        ) : (
          <Field label="Font size">
            <NumberInput label="Font size" value={box.fontSize} min={4} max={300} step={0.5} suffix="pt" onChange={(v) => set({ fontSize: v })} />
          </Field>
        )}
      </Section>
      <Section title="Alignment">
        <div className="flex flex-wrap gap-2">
          <Segmented
            size="sm"
            ariaLabel="Horizontal alignment"
            value={box.align}
            onChange={(v) => set({ align: v })}
            options={[
              { value: 'left', label: <AlignLeft className="h-4 w-4" />, title: 'Align left' },
              { value: 'center', label: <AlignCenter className="h-4 w-4" />, title: 'Centre' },
              { value: 'right', label: <AlignRight className="h-4 w-4" />, title: 'Align right' },
            ]}
          />
          <Segmented
            size="sm"
            ariaLabel="Vertical alignment"
            value={box.vAlign}
            onChange={(v) => set({ vAlign: v })}
            options={[
              { value: 'top', label: <AlignVerticalJustifyStart className="h-4 w-4" />, title: 'Top' },
              { value: 'middle', label: <AlignVerticalJustifyCenter className="h-4 w-4" />, title: 'Middle' },
              { value: 'bottom', label: <AlignVerticalJustifyEnd className="h-4 w-4" />, title: 'Bottom' },
            ]}
          />
        </div>
        <Toggle
          checked={box.wrap}
          onChange={(v) => set({ wrap: v })}
          label="Wrap text to the next line"
          description="When the text reaches the edge of the box it continues on the next line, like in other design tools."
        />
      </Section>
      <Section title="Text options" defaultOpen={false}>
        <Toggle checked={box.multiline} onChange={(v) => set({ multiline: v })} label="Allow line breaks" description="Clients can press Enter to start a new line." />
        <Field label="Text case">
          <Select value={box.transform} onChange={(e) => set({ transform: e.target.value as TextBox['transform'] })}>
            <option value="none">As typed</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="titlecase">Title Case</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Line spacing">
            <NumberInput label="Line spacing" value={box.lineHeight} min={0.8} max={3} step={0.05} suffix="×" onChange={(v) => set({ lineHeight: v })} />
          </Field>
          <Field label="Letter spacing">
            <NumberInput label="Letter spacing" value={box.letterSpacing} min={-5} max={50} step={0.1} suffix="pt" onChange={(v) => set({ letterSpacing: v })} />
          </Field>
        </div>
        <Field label="Maximum characters" optional hint="After placeholders are filled in.">
          <Input type="number" min={1} value={box.maxChars ?? ''} onChange={(e) => set({ maxChars: e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null })} className="h-9" />
        </Field>
      </Section>
    </>
  );
}

function QrSections({ box, set }: { box: QrBox; set: (p: Partial<QrBox>) => void }) {
  return (
    <Section title="QR code">
      <Field label="QR content" hint="Verification links point to this system's public verification page.">
        <Select value={box.contentMode} onChange={(e) => set({ contentMode: e.target.value as QrBox['contentMode'] })}>
          <option value="either">Client chooses (verification link or own text/URL)</option>
          <option value="verification">Always a verification link</option>
          <option value="client">Client provides text or URL</option>
        </Select>
      </Field>
      <Field label="Error correction" hint="Higher levels survive damage better but make the code denser.">
        <Select value={box.errorCorrection} onChange={(e) => set({ errorCorrection: e.target.value as QrBox['errorCorrection'] })}>
          <option value="L">Low (7%)</option>
          <option value="M">Medium (15%) — recommended</option>
          <option value="Q">Quartile (25%)</option>
          <option value="H">High (30%)</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="QR size">
          <NumberInput label="QR size" value={box.sizePercent} min={20} max={100} suffix="%" onChange={(v) => set({ sizePercent: Math.min(100, Math.max(20, v)) })} />
        </Field>
        <Field label="Quiet zone">
          <NumberInput label="Quiet zone" value={box.margin} min={0} max={8} suffix="mod" onChange={(v) => set({ margin: Math.round(Math.min(8, Math.max(0, v))) })} />
        </Field>
      </div>
      <Field label="Code colour">
        <ColorInput label="QR colour" value={box.fgColor} onChange={(v) => set({ fgColor: v })} />
      </Field>
      <Field label="Background">
        <ColorInput label="QR background" value={box.bgColor} onChange={(v) => set({ bgColor: v })} />
      </Field>
    </Section>
  );
}

function PhotoSections({ box, set }: { box: PhotoBox; set: (p: Partial<PhotoBox>) => void }) {
  return (
    <Section title="Photo">
      <Field label="Fitting">
        <Select value={box.fit} onChange={(e) => set({ fit: e.target.value as PhotoBox['fit'] })}>
          <option value="cover">Fill the box (crop edges)</option>
          <option value="contain">Fit inside the box (no crop)</option>
          <option value="stretch">Stretch to the box</option>
        </Select>
      </Field>
      {box.fit !== 'stretch' && (
        <Field label={box.fit === 'cover' ? 'Keep this part when cropping' : 'Alignment'}>
          <Select value={box.align} onChange={(e) => set({ align: e.target.value as PhotoBox['align'] })}>
            <option value="center">Centre</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </Select>
        </Field>
      )}
      <Field label="Shape">
        <Segmented
          size="sm"
          value={box.shape}
          onChange={(v) => set({ shape: v })}
          options={[
            { value: 'rectangle', label: 'Rectangle' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'circle', label: 'Circle' },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Border">
          <NumberInput label="Border width" value={box.borderWidth} min={0} max={20} step={0.5} suffix="pt" onChange={(v) => set({ borderWidth: Math.max(0, v) })} />
        </Field>
        <Field label="Border colour">
          <input type="color" aria-label="Border colour" value={box.borderColor} onChange={(e) => set({ borderColor: e.target.value })} className="h-9 w-full cursor-pointer rounded border border-slate-300 p-0.5" />
        </Field>
      </div>
    </Section>
  );
}

function SignatureSections({ box, set }: { box: SignatureBox; set: (p: Partial<SignatureBox>) => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(png|jpe?g)$/i.test(f.name)) return showToast('Use a PNG (transparent background recommended) or JPG image.', 'error');
    setBusy(true);
    try {
      const r = await api.upload<{ id: string }>(`/api/admin/files?kind=signature&name=${encodeURIComponent(f.name)}`, f);
      set({ fixedSignatureFileId: r.id });
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Signature">
      <Field label="Who provides the signature?">
        <Select value={box.source} onChange={(e) => set({ source: e.target.value as SignatureBox['source'] })}>
          <option value="either">Administrator signature, or client may upload their own</option>
          <option value="fixed">Always the administrator's signature</option>
          <option value="client">Client uploads (one for all, or per participant)</option>
        </Select>
      </Field>
      {box.source !== 'client' && (
        <Field label="Administrator signature" hint="PNG with a transparent background works best.">
          {box.fixedSignatureFileId ? (
            <div className="flex items-center gap-2">
              <div className="checkerboard flex h-16 flex-1 items-center justify-center rounded border border-slate-200">
                <img src={fileUrl(box.fixedSignatureFileId)} alt="Signature" className="max-h-14 max-w-full object-contain" />
              </div>
              <IconButton label="Remove signature" onClick={() => set({ fixedSignatureFileId: null })}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-600 hover:border-slate-400">
              <Upload className="h-4 w-4" />
              {busy ? 'Uploading…' : 'Upload signature image'}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          )}
        </Field>
      )}
      <Field label="Fitting">
        <Segmented
          size="sm"
          value={box.fit}
          onChange={(v) => set({ fit: v })}
          options={[
            { value: 'contain', label: 'Keep proportions' },
            { value: 'stretch', label: 'Stretch' },
          ]}
        />
      </Field>
      {(box.fit === 'contain' || box.caption?.enabled) && (
        <Field label="Alignment">
          <Segmented
            size="sm"
            value={box.align}
            onChange={(v) => set({ align: v })}
            options={[
              { value: 'left', label: <AlignLeft className="h-4 w-4" /> },
              { value: 'center', label: <AlignCenter className="h-4 w-4" /> },
              { value: 'right', label: <AlignRight className="h-4 w-4" /> },
            ]}
          />
        </Field>
      )}
    </Section>
  );
}

function SignerSection({ box, fonts, set }: { box: SignatureBox; fonts: CustomFontRef[]; set: (p: Partial<SignatureBox>) => void }) {
  const c = box.caption || defaultCaption();
  const upd = (p: Partial<SignatureBox['caption']>) => set({ caption: { ...c, ...p } });
  const families = [...new Set([...FONT_FAMILIES, ...fonts.map((f) => f.family)])];
  return (
    <Section title="Signer name">
      <Toggle
        checked={c.enabled}
        onChange={(v) => upd({ enabled: v })}
        label="Show the signer's name under the signature"
        description="Prints a signature line, the name of the person signing and (optionally) their title, attached to this box."
      />
      {c.enabled && (
        <>
          <Field label="Name of the person signing" htmlFor="bp-signer-name">
            <Input id="bp-signer-name" value={c.name} maxLength={120} placeholder="e.g. Karma Wangchuk" onChange={(e) => upd({ name: e.target.value })} />
          </Field>
          <Field label="Title / designation" htmlFor="bp-signer-title" optional>
            <Input id="bp-signer-title" value={c.title} maxLength={160} placeholder="e.g. Director" onChange={(e) => upd({ title: e.target.value })} />
          </Field>
          <Toggle checked={c.clientEditable} onChange={(v) => upd({ clientEditable: v })} label="Clients can change the name and title" description="Useful when the client uploads or draws their own signature." />
          <Toggle checked={c.showLine} onChange={(v) => upd({ showLine: v })} label="Signature line" />
          <Field label="Font">
            <Select value={c.fontFamily} onChange={(e) => upd({ fontFamily: e.target.value })}>
              {families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Name size">
              <NumberInput label="Signer name size" value={c.fontSize} min={4} max={72} step={0.5} suffix="pt" onChange={(v) => upd({ fontSize: v })} />
            </Field>
            <Segmented
              size="sm"
              ariaLabel="Signer name weight"
              value={c.bold ? '700' : '400'}
              onChange={(v) => upd({ bold: v === '700' })}
              options={[
                { value: '400', label: 'Regular' },
                { value: '700', label: <b>Bold</b> },
              ]}
            />
            <ColorInput label="Signer name colour" value={c.color} onChange={(v) => upd({ color: v })} />
          </div>
          <p className="text-xs text-slate-500">The name and title are placed at the bottom of the box and follow the box alignment. Make the box taller to give the signature more room.</p>
        </>
      )}
    </Section>
  );
}

export function FontManager({ fonts, onChange }: { fonts: CustomFontRef[]; onChange: (f: CustomFontRef[]) => void }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const add = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.(ttf|otf)$/i.test(f.name)) return showToast('Upload a .ttf or .otf font file.', 'error');
    setBusy(true);
    try {
      const r = await api.upload<{ id: string }>(`/api/admin/files?kind=font&name=${encodeURIComponent(f.name)}`, f);
      const base = f.name.replace(/\.(ttf|otf)$/i, '');
      const bold = /bold|black|heavy|semibold/i.test(base);
      const italic = /italic|oblique/i.test(base);
      const family = base.replace(/[-_ ]?(regular|bold|italic|oblique|semibold|black|heavy|medium|light)+$/gi, '').replace(/[-_]+/g, ' ').trim() || base;
      onChange([...fonts, { family, fileId: r.id, weight: bold ? '700' : '400', italic }]);
      showToast(`Font "${family}" added`, 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      {fonts.map((f, i) => (
        <div key={f.fileId} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
          <Input value={f.family} onChange={(e) => onChange(fonts.map((x, j) => (j === i ? { ...x, family: e.target.value } : x)))} className="h-8 flex-1" aria-label="Font family name" />
          <span className="text-xs text-slate-500">
            {f.weight === '700' ? 'Bold' : 'Regular'}
            {f.italic ? ' italic' : ''}
          </span>
          <IconButton label="Remove font" onClick={() => onChange(fonts.filter((_, j) => j !== i))}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      ))}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-slate-400">
        <Upload className="h-4 w-4" />
        {busy ? 'Uploading…' : 'Upload font (.ttf / .otf)'}
        <input type="file" accept=".ttf,.otf" className="sr-only" onChange={(e) => add(e.target.files?.[0])} />
      </label>
    </div>
  );
}

export { Section, Button };
