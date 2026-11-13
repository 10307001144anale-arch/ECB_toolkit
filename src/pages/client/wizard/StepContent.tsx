import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookmarkPlus, Braces, Check, ChevronDown, Save, X } from 'lucide-react';
import { api } from '../../../lib/api';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Textarea, cx } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import type { ContentPreset, QrBox, TemplateBox, TextBox } from '../../../../shared/types';
import { SYSTEM_PLACEHOLDERS, columnToPlaceholder, findMalformedPlaceholders, findPlaceholders, normKey } from '../../../../shared/placeholders';
import { draftCertificate, fitContentToLayout } from '../../../engine/batch';
import { realisticCertificate } from '../../../engine/samples';
import type { ResolvedCertificate } from '../../../engine/renderer';
import { verifyBaseUrl } from '../../../lib/api';
import { CertificatePreview } from './CertificatePreview';
import { RichTextEditor, type RichEditorHandle } from '../../../components/RichTextEditor';
import { hasFormatting, plainToRich, richToPlain, type FormattingPermissions, type RichDoc } from '../../../../shared/rich';
import type { StepProps } from './state';
import { DATE_BOX_FORMATS, dateBoxText, dateChoiceFor, dateColumnKey, formatDate, isoDay, parseDate, todayUtc } from '../../../../shared/dates';
import type { DateChoice } from '../../../../shared/types';

const COMMON_FIELDS = [
  { name: 'name', label: 'Participant name' },
  { name: 'cid', label: 'CID number' },
  { name: 'workshop', label: 'Workshop / event' },
  { name: 'programme', label: 'Programme' },
  { name: 'course', label: 'Course' },
  { name: 'college', label: 'College / organisation' },
  { name: 'date', label: 'Date' },
];

/** Orders boxes as a reader sees them: page, then top-to-bottom, then left-to-right. */
function readingOrder(a: TemplateBox, b: TemplateBox) {
  return a.page - b.page || a.y - b.y || a.x - b.x;
}

export function StepContent({ w, d, set }: StepProps) {
  const layout = w.template!.layout;
  const renderer = w.renderer!;
  const { showToast } = useToast();
  const [active, setActive] = useState<string | null>(null);
  const [presets, setPresets] = useState<ContentPreset[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const textBoxes = useMemo(() => layout.boxes.filter((b): b is TextBox => b.type === 'text').sort(readingOrder), [layout]);
  const qrBoxes = useMemo(() => layout.boxes.filter((b): b is QrBox => b.type === 'qr').sort(readingOrder), [layout]);
  const headers = w.data?.headers || [];

  useEffect(() => {
    api
      .get<ContentPreset[]>(`/api/client/presets?templateId=${w.template!.id}`)
      .then(setPresets)
      .catch(() => {});
  }, [w.template]);

  // Realistic preview: the wording with example participant details, an example photo and signature.
  const [cert, setCert] = useState<ResolvedCertificate | null>(null);
  const [showFields, setShowFields] = useState(false);
  useEffect(() => {
    let alive = true;
    const fixed = (k: string) => renderer.fixedSignature(k);
    if (showFields) setCert(draftCertificate(layout, w.content, verifyBaseUrl(null), fixed, w.images));
    else realisticCertificate(layout, w.content, verifyBaseUrl(null), fixed, w.images).then((c) => alive && setCert(c));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, w.content, renderer, w.images, w.imagesVersion, showFields]);

  const setText = (key: string, value: string) => set((s) => ({ content: { ...s.content, texts: { ...s.content.texts, [key]: value } } }));
  /** Formatted wording: keeps plain text (for placeholders/validation) and the formatting in sync. */
  const setRich = (key: string, doc: RichDoc) =>
    set((s) => {
      const rich = { ...(s.content.rich || {}) };
      if (hasFormatting(doc)) rich[key] = doc;
      else delete rich[key];
      return { content: { ...s.content, texts: { ...s.content.texts, [key]: richToPlain(doc) }, rich } };
    });
  const setDate = (box: TextBox, choice: DateChoice) =>
    set((s) => ({
      content: { ...s.content, dates: { ...(s.content.dates || {}), [box.key]: choice }, texts: { ...s.content.texts, [box.key]: dateBoxText(box, choice) } },
    }));
  const setQr = (key: string, patch: Partial<{ mode: 'custom' | 'verification'; value: string }>) =>
    set((s) => ({ content: { ...s.content, qr: { ...s.content.qr, [key]: { ...s.content.qr[key], ...patch } } } }));

  const loadPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    set({ content: fitContentToLayout(layout, p.content), preset: p });
    showToast(`Loaded "${p.name}"`, 'success');
  };

  const updatePreset = async () => {
    if (!w.preset) return;
    try {
      const p = await api.put<ContentPreset>(`/api/client/presets/${w.preset.id}`, { content: w.content });
      set({ preset: p });
      setPresets((list) => list.map((x) => (x.id === p.id ? p : x)));
      showToast(`Preset "${p.name}" updated`, 'success');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Known placeholder names: spreadsheet columns (if loaded), common fields, system values.
  const known = useMemo(() => {
    const s = new Set<string>(Object.keys(SYSTEM_PLACEHOLDERS));
    headers.forEach((h) => s.add(columnToPlaceholder(h)));
    return s;
  }, [headers]);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Start from a saved preset" value={w.preset?.id || ''} onChange={(e) => loadPreset(e.target.value)} className="h-9 min-w-0 flex-1">
              <option value="">{presets.length ? 'Start from a saved preset…' : 'No saved presets for this template'}</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {w.preset && (
              <Button size="sm" icon={<Save className="h-4 w-4" />} onClick={updatePreset} title={`Save changes to "${w.preset.name}"`}>
                Update preset
              </Button>
            )}
            <Button size="sm" variant="subtle" icon={<BookmarkPlus className="h-4 w-4" />} onClick={() => setSaveOpen(true)}>
              Save as preset
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Presets store your wording for reuse. They never change the template design or past certificates.</p>
        </Card>

        <Alert tone="info">
          Write the wording for each box. Use <b>Insert field</b> to add participant details like {'{{name}}'} — they are filled in from your spreadsheet for each certificate.
        </Alert>

        {textBoxes.map((b) =>
          b.date ? (
            <DateBoxEditor
              key={b.id}
              box={b}
              choice={dateChoiceFor(b, w.content)}
              printed={w.content.texts[b.key] || ''}
              onChange={(c) => setDate(b, c)}
              onFocus={() => setActive(b.key)}
              active={active === b.key}
              headers={headers}
              issues={d.contentIssues.filter((i) => i.boxKey === b.key)}
            />
          ) : (
          <TextBoxEditor
            key={b.id}
            box={b}
            value={w.content.texts[b.key] || ''}
            rich={w.content.rich?.[b.key] || null}
            onChange={(v) => setText(b.key, v)}
            onRichChange={(doc) => setRich(b.key, doc)}
            onFocus={() => setActive(b.key)}
            active={active === b.key}
            headers={headers}
            known={known}
            registered={d.registered}
            issues={d.contentIssues.filter((i) => i.boxKey === b.key)}
          />
          )
        )}

        {qrBoxes.map((b) => {
          const q = w.content.qr[b.key] || { mode: 'verification', value: '' };
          return (
            <Card key={b.id} className={cx('p-4', active === b.key && 'ring-2 ring-brand-500')} onFocusCapture={() => setActive(b.key)} onClick={() => setActive(b.key)}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium text-slate-900">{b.label}</p>
                <Badge tone="violet">QR code</Badge>
              </div>
              {b.description && <p className="mb-2 text-xs text-slate-500">{b.description}</p>}
              {b.contentMode === 'either' && (
                <div className="mb-3 space-y-2 text-sm">
                  <label className="flex items-start gap-2">
                    <input type="radio" className="mt-1" checked={q.mode === 'verification'} onChange={() => setQr(b.key, { mode: 'verification' })} />
                    <span>
                      <span className="font-medium">Verification link</span> <span className="text-slate-500">(recommended)</span>
                      <span className="block text-xs text-slate-500">Each certificate gets a unique ID. Scanning shows whether it is genuine.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" className="mt-1" checked={q.mode === 'custom'} onChange={() => setQr(b.key, { mode: 'custom' })} />
                    <span>
                      <span className="font-medium">My own text or web address</span>
                      <span className="block text-xs text-slate-500">For example a link to your event page. This does not verify the certificate.</span>
                    </span>
                  </label>
                </div>
              )}
              {b.contentMode === 'verification' && <p className="text-sm text-slate-600">This QR code links to the certificate's verification page.</p>}
              {q.mode === 'custom' && b.contentMode !== 'verification' && (
                <PlaceholderTextarea
                  value={q.value}
                  onChange={(v) => setQr(b.key, { value: v })}
                  rows={2}
                  placeholder="https://example.org/event/{{cid}}"
                  headers={headers}
                  known={known}
                  registered={d.registered}
                  label={b.label}
                />
              )}
              {d.contentIssues
                .filter((i) => i.boxKey === b.key)
                .map((i, n) => (
                  <p key={n} className={cx('mt-2 text-xs', i.level === 'error' ? 'text-red-600' : 'text-amber-700')}>
                    {i.message}
                  </p>
                ))}
            </Card>
          );
        })}
      </div>

      <div className="lg:col-span-3">
        <div className="lg:sticky lg:top-6">
          <p className="mb-2 text-sm font-medium text-slate-700">Live preview</p>
          <CertificatePreview renderer={renderer} cert={cert} highlightKey={active} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {showFields
                ? 'Fields such as {{name}} are shown as written.'
                : 'Shown with example details (e.g. Karma Dorji) and an example photo and signature. Each participant’s details are used when you generate.'}
            </span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={showFields} onChange={(e) => setShowFields(e.target.checked)} />
              Show field names
            </label>
          </div>
        </div>
      </div>

      <SavePresetModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSave={async (name) => {
          const p = await api.post<ContentPreset>('/api/client/presets', { name, templateId: w.template!.id, content: w.content });
          setPresets((l) => [p, ...l]);
          set({ preset: p });
          showToast(`Preset "${name}" saved`, 'success');
        }}
      />
    </div>
  );
}

const DATE_SOURCE_LABEL: Record<DateChoice['source'], string> = {
  today: 'Date of generation',
  fixed: 'A chosen date',
  column: 'From the participant list',
};

function DateBoxEditor({
  box,
  choice,
  printed,
  onChange,
  onFocus,
  active,
  headers,
  issues,
}: {
  box: TextBox;
  choice: DateChoice;
  printed: string;
  onChange: (c: DateChoice) => void;
  onFocus: () => void;
  active: boolean;
  headers: string[];
  issues: { level: 'error' | 'warning'; message: string }[];
}) {
  const editable = !!box.date?.clientEditable;
  const field = dateColumnKey(box);
  const example = choice.source === 'column' ? (box.date?.prefix || '') + formatDate(todayUtc(), choice.format) : printed;
  return (
    <Card className={cx('p-4 transition-shadow', active && 'ring-2 ring-brand-500')} onFocusCapture={onFocus} onClick={onFocus}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-medium text-slate-900">{box.label}</p>
        <Badge tone="blue">Date</Badge>
      </div>
      {box.description && <p className="mb-2 text-xs text-slate-500">{box.description}</p>}
      {editable ? (
        <div className="space-y-3">
          <Field label="Date to print" htmlFor={`date-src-${box.key}`}>
            <Select
              id={`date-src-${box.key}`}
              value={choice.source}
              onChange={(e) => {
                const source = e.target.value as DateChoice['source'];
                onChange({ ...choice, source, fixedDate: source === 'fixed' && !parseDate(choice.fixedDate) ? isoDay(todayUtc()) : choice.fixedDate });
              }}
            >
              {(Object.keys(DATE_SOURCE_LABEL) as DateChoice['source'][]).map((k) => (
                <option key={k} value={k}>
                  {DATE_SOURCE_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          {choice.source === 'fixed' && (
            <Field label="Date" htmlFor={`date-fixed-${box.key}`}>
              <Input id={`date-fixed-${box.key}`} type="date" value={choice.fixedDate} onChange={(e) => onChange({ ...choice, fixedDate: e.target.value })} />
            </Field>
          )}
          <Field label="Format" htmlFor={`date-fmt-${box.key}`}>
            <Select id={`date-fmt-${box.key}`} value={choice.format} onChange={(e) => onChange({ ...choice, format: e.target.value })}>
              {DATE_BOX_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {formatDate(todayUtc(), f.value)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {DATE_SOURCE_LABEL[choice.source]} — set by your administrator.
        </p>
      )}
      {choice.source === 'column' && (
        <p className="mt-2 text-xs text-slate-500">
          Each certificate uses its own date from your participant list — the column matched to <code className="rounded bg-slate-100 px-1 font-mono">{`{{${field}}}`}</code>{headers.length ? ' (e.g. "Date")' : ''}.
        </p>
      )}
      {example && (
        <p className="mt-2 text-xs text-slate-500">
          Prints as: <span className="font-medium text-slate-800">{example}</span>
        </p>
      )}
      {issues.map((i, n) => (
        <p key={n} className={cx('mt-2 flex items-start gap-1 text-xs', i.level === 'error' ? 'text-red-600' : 'text-amber-700')}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {i.message}
        </p>
      ))}
    </Card>
  );
}

function TextBoxEditor({
  box,
  value,
  rich,
  onChange,
  onRichChange,
  onFocus,
  active,
  headers,
  known,
  registered,
  issues,
}: {
  box: TextBox;
  value: string;
  rich: RichDoc | null;
  onChange: (v: string) => void;
  onRichChange: (doc: RichDoc) => void;
  onFocus: () => void;
  active: boolean;
  headers: string[];
  known: Set<string>;
  registered: Set<string>;
  issues: { level: 'error' | 'warning'; message: string }[];
}) {
  const rows = box.multiline ? 4 : box.wrap && box.h > 10 ? 3 : 1;
  return (
    <Card className={cx('p-4 transition-shadow', active && 'ring-2 ring-brand-500')} onFocusCapture={onFocus}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={`txt-${box.key}`} className="font-medium text-slate-900">
          {box.label}
        </label>
        {box.required ? <Badge tone="blue">Required</Badge> : <span className="text-xs text-slate-400">Optional</span>}
      </div>
      {box.description && <p className="mb-2 text-xs text-slate-500">{box.description}</p>}
      {box.defaultText && (
        <p className="mb-2 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          {value === box.defaultText ? <span>Suggested wording from your administrator — keep it or edit it.</span> : <span>You changed the suggested wording.</span>}
          {value !== box.defaultText && (
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => onRichChange(box.defaultRich || plainToRich(box.defaultText))}>
              Use suggested wording
            </button>
          )}
        </p>
      )}
      <PlaceholderTextarea
        id={`txt-${box.key}`}
        value={value}
        onChange={onChange}
        rows={rows}
        singleLine={!box.multiline}
        placeholder={box.required ? 'Type the wording for this box' : 'Leave empty to keep this box blank'}
        headers={headers}
        known={known}
        registered={registered}
        label={box.label}
        maxChars={box.maxChars}
        rich={
          Object.values(box.formatting || {}).some(Boolean)
            ? { value: rich || plainToRich(value), onChange: onRichChange, perms: box.formatting, baseStyle: { color: box.color, fontWeight: Number(box.fontWeight), fontStyle: box.italic ? 'italic' : undefined } }
            : undefined
        }
      />
      {issues.map((i, n) => (
        <p key={n} className={cx('mt-2 flex items-start gap-1 text-xs', i.level === 'error' ? 'text-red-600' : 'text-amber-700')}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {i.message}
        </p>
      ))}
    </Card>
  );
}

/** Textarea with an "Insert field" menu and recognised / unrecognised placeholder chips. */
export function PlaceholderTextarea({
  id,
  value,
  onChange,
  rows,
  singleLine,
  placeholder,
  headers,
  known,
  registered,
  label,
  maxChars,
  rich,
}: {
  id?: string;
  rich?: { value: RichDoc; onChange: (doc: RichDoc) => void; perms: FormattingPermissions; baseStyle?: React.CSSProperties };
  value: string;
  onChange: (v: string) => void;
  rows: number;
  singleLine?: boolean;
  placeholder?: string;
  headers: string[];
  known: Set<string>;
  registered: Set<string>;
  label: string;
  maxChars?: number | null;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const editor = useRef<RichEditorHandle>(null);
  const caret = useRef<number>(value.length);
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const insert = (name: string) => {
    const token = `{{${name}}}`;
    if (rich) {
      editor.current?.insertText(token);
      setMenu(false);
      setCustom('');
      return;
    }
    const pos = Math.min(caret.current ?? value.length, value.length);
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const spacerBefore = before && !/[\s(\["'“‘]$/.test(before) ? ' ' : '';
    const spacerAfter = after && !/^[\s.,;:!?)\]"'”’]/.test(after) ? ' ' : '';
    const next = `${before}${spacerBefore}${token}${spacerAfter}${after}`;
    onChange(next);
    setMenu(false);
    setCustom('');
    const newPos = (before + spacerBefore + token).length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(newPos, newPos);
      caret.current = newPos;
    });
  };

  const tokens = findPlaceholders(value, registered);
  const unique = [...new Map(tokens.map((t) => [t.key, t])).values()];
  const hasData = headers.length > 0;

  return (
    <div>
      <div className="relative">
        {rich ? (
          <RichTextEditor
            ref={editor}
            id={id}
            value={rich.value}
            onChange={rich.onChange}
            perms={rich.perms}
            singleLine={singleLine}
            placeholder={placeholder}
            label={label}
            minRows={rows}
            baseStyle={rich.baseStyle}
          />
        ) : (
        <Textarea
          id={id}
          ref={ref}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => {
            const v = singleLine ? e.target.value.replace(/\r?\n/g, ' ') : e.target.value;
            onChange(v);
            caret.current = e.target.selectionStart;
          }}
          onSelect={(e) => (caret.current = (e.target as HTMLTextAreaElement).selectionStart)}
          onKeyDown={(e) => {
            if (singleLine && e.key === 'Enter') e.preventDefault();
          }}
          className="resize-y pr-2"
          aria-label={label}
        />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <div className="relative" ref={menuRef}>
          <Button size="sm" variant="subtle" icon={<Braces className="h-3.5 w-3.5" />} onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
            Insert field <ChevronDown className="h-3.5 w-3.5" />
          </Button>
          {menu && (
            <div role="menu" className="absolute left-0 z-30 mt-1 max-h-80 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
              {hasData && (
                <>
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Your spreadsheet columns</p>
                  {headers.map((h) => (
                    <button key={h} role="menuitem" onClick={() => insert(columnToPlaceholder(h))} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                      <span className="truncate">{h}</span>
                      <code className="shrink-0 text-xs text-slate-400">{`{{${columnToPlaceholder(h)}}}`}</code>
                    </button>
                  ))}
                </>
              )}
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Common fields</p>
              {COMMON_FIELDS.map((f) => (
                <button key={f.name} role="menuitem" onClick={() => insert(f.name)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-slate-50">
                  <span>{f.label}</span>
                  <code className="text-xs text-slate-400">{`{{${f.name}}}`}</code>
                </button>
              ))}
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Generated automatically</p>
              {Object.entries(SYSTEM_PLACEHOLDERS).map(([k, v]) => (
                <button key={k} role="menuitem" onClick={() => insert(k === 'certificateid' ? 'certificateId' : k)} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-slate-50" title={v.description}>
                  <span>{v.label}</span>
                  <code className="text-xs text-slate-400">{`{{${k === 'certificateid' ? 'certificateId' : k}}}`}</code>
                </button>
              ))}
              <div className="border-t border-slate-100 p-2">
                <form
                  className="flex gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = columnToPlaceholder(custom);
                    if (custom.trim()) insert(n);
                  }}
                >
                  <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other field name" className="h-8" aria-label="Custom field name" />
                  <Button size="sm" type="submit" disabled={!custom.trim()}>
                    Add
                  </Button>
                </form>
              </div>
            </div>
          )}
        </div>
        {unique.map((t) => {
          const sys = SYSTEM_PLACEHOLDERS[normKey(t.key)];
          // Before a spreadsheet is added every valid placeholder counts as recognised;
          // afterwards, ones without a matching column are highlighted for the "Match columns" step.
          const inData = hasData && headers.some((h) => columnToPlaceholder(h) === t.key);
          const recognised = !!sys || !hasData || inData || known.has(t.key);
          return (
            <span
              key={t.key}
              className={cx(
                'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs ring-1 ring-inset',
                sys ? 'bg-violet-50 text-violet-700 ring-violet-200' : recognised ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'
              )}
              title={sys ? sys.description : !hasData ? 'Recognised. It will be filled from your spreadsheet.' : recognised ? 'Found in your spreadsheet' : 'No column with this name. You can choose a column on the "Match columns" step.'}
            >
              {recognised ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {t.syntax === 'paren' ? `(${t.name})` : `{{${t.name}}}`}
            </span>
          );
        })}
        {findMalformedPlaceholders(value).map((m, i) => (
          <span
            key={`bad-${i}`}
            className="inline-flex items-center gap-1 rounded-md bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-700 ring-1 ring-inset ring-red-200"
            title="Not a valid placeholder. Use letters, numbers and underscores only, e.g. {{first_name}}."
          >
            <X className="h-3 w-3" />
            {m}
          </span>
        ))}
        {maxChars ? <span className="ml-auto text-xs text-slate-400">max {maxChars} characters</span> : null}
      </div>
    </div>
  );
}

function SavePresetModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save wording as a preset"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="preset-form" loading={busy}>
            Save preset
          </Button>
        </>
      }
    >
      <form
        id="preset-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return setError('Enter a name.');
          setBusy(true);
          setError(null);
          try {
            await onSave(name.trim());
            setName('');
            onClose();
          } catch (err: any) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Preset name" htmlFor="preset-name" error={error} hint="e.g. Certificate of Participation">
          <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </Field>
      </form>
    </Modal>
  );
}
