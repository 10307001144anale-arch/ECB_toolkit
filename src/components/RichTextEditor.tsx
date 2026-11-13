// Small word-processor style editor for certificate wording.
// The editing surface is a contenteditable element, but nothing is stored as
// HTML: every change is parsed into the structured RichDoc (runs with bold /
// italic / underline / colour / highlight / size, paragraphs with alignment).
// Pasted content is inserted as plain text, so no foreign markup gets in.

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Highlighter, Italic, RemoveFormatting, Type, Underline } from 'lucide-react';
import { cx } from './ui';
import { normalizeRich, type FormattingPermissions, type RichAlign, type RichDoc, type RichParagraph, type RichRun } from '../../shared/rich';

export interface RichEditorHandle {
  insertText(text: string): void;
  focus(): void;
}

const TEXT_COLORS = ['#111827', '#1e3a8a', '#1d4ed8', '#047857', '#b91c1c', '#9a3412', '#7c3aed', '#b45309'];
const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa'];
const SIZES = [
  { value: 0.8, label: 'Small' },
  { value: 1, label: 'Normal' },
  { value: 1.25, label: 'Large' },
  { value: 1.5, label: 'Larger' },
];

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function runToHtml(r: RichRun) {
  const css: string[] = [];
  if (r.b !== undefined) css.push(`font-weight:${r.b ? 700 : 400}`);
  if (r.i !== undefined) css.push(`font-style:${r.i ? 'italic' : 'normal'}`);
  if (r.u) css.push('text-decoration:underline');
  if (r.color) css.push(`color:${r.color}`);
  if (r.bg) css.push(`background-color:${r.bg}`);
  if (r.size && r.size !== 1) css.push(`font-size:${r.size}em`);
  const text = esc(r.text).replace(/ {2}/g, ' &nbsp;');
  return css.length ? `<span style="${css.join(';')}"${r.size && r.size !== 1 ? ` data-size="${r.size}"` : ''}>${text}</span>` : text;
}

export function richToHtml(doc: RichDoc): string {
  return doc.paragraphs
    .map((p) => `<div${p.align ? ` style="text-align:${p.align}"` : ''}>${p.runs.length ? p.runs.map(runToHtml).join('') : '<br>'}</div>`)
    .join('');
}

function toHex(c: string): string | undefined {
  if (!c) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((x) => x + x).join('')}`.toLowerCase();
  const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i);
  if (!m) return undefined;
  if (m[4] !== undefined && Number(m[4]) === 0) return undefined; // transparent
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
}

type Style = Omit<RichRun, 'text'>;

function styleFrom(e: HTMLElement, base: Style): Style {
  const st: Style = { ...base };
  const tag = e.tagName;
  if (tag === 'B' || tag === 'STRONG') st.b = true;
  if (tag === 'I' || tag === 'EM') st.i = true;
  if (tag === 'U') st.u = true;
  const fw = e.style.fontWeight;
  if (fw) st.b = fw === 'bold' || Number(fw) >= 600;
  const fs = e.style.fontStyle;
  if (fs) st.i = fs === 'italic' || fs === 'oblique';
  const td = e.style.textDecorationLine || e.style.textDecoration;
  if (td && td.includes('underline')) st.u = true;
  const color = toHex(e.style.color || (tag === 'FONT' ? e.getAttribute('color') || '' : ''));
  if (color) st.color = color;
  const bg = toHex(e.style.backgroundColor);
  if (bg) st.bg = bg;
  const ds = e.getAttribute('data-size');
  if (ds) st.size = Number(ds);
  else if (/em$/.test(e.style.fontSize)) st.size = parseFloat(e.style.fontSize);
  return st;
}

function alignOf(e: HTMLElement): RichAlign | undefined {
  const a = e.style.textAlign || e.getAttribute('align') || '';
  if (a === 'center' || a === 'right' || a === 'left') return a;
  if (a === 'start') return 'left';
  if (a === 'end') return 'right';
  return undefined;
}

export function htmlToRich(root: HTMLElement, singleLine: boolean): RichDoc {
  const paras: RichParagraph[] = [];
  let cur: RichParagraph | null = null;
  const ensure = (align?: RichAlign) => {
    if (!cur) {
      cur = align ? { align, runs: [] } : { runs: [] };
      paras.push(cur);
    }
    return cur;
  };
  const walk = (node: Node, st: Style, align?: RichAlign) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').replace(/ /g, ' ').replace(/[\r\n]+/g, ' ');
      if (t) ensure(align).runs.push({ ...st, text: t });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const e = node as HTMLElement;
    if (e.tagName === 'BR') {
      ensure(align);
      cur = null;
      return;
    }
    const block = e.tagName === 'DIV' || e.tagName === 'P' || e.tagName === 'LI';
    const a = (block && alignOf(e)) || align;
    const s2 = styleFrom(e, st);
    if (block) cur = null;
    e.childNodes.forEach((c) => walk(c, s2, a));
    if (block) cur = null;
  };
  root.childNodes.forEach((c) => walk(c, {}));
  let doc: RichDoc = { paragraphs: paras.length ? paras : [{ runs: [] }] };
  if (singleLine && doc.paragraphs.length > 1) {
    const runs: RichRun[] = [];
    doc.paragraphs.forEach((p, i) => {
      if (i > 0 && p.runs.length) runs.push({ text: ' ' });
      runs.push(...p.runs);
    });
    doc = { paragraphs: [{ align: doc.paragraphs[0].align, runs }] };
  }
  return normalizeRich(doc);
}

export const RichTextEditor = forwardRef<
  RichEditorHandle,
  {
    id?: string;
    value: RichDoc;
    onChange: (doc: RichDoc) => void;
    perms: FormattingPermissions;
    singleLine?: boolean;
    placeholder?: string;
    label: string;
    minRows?: number;
    /** Box font / colour so the editor looks like the certificate. */
    baseStyle?: React.CSSProperties;
  }
>(function RichTextEditor({ id, value, onChange, perms, singleLine, placeholder, label, minRows = 2, baseStyle }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const last = useRef('');
  const range = useRef<Range | null>(null);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });
  const [empty, setEmpty] = useState(true);
  const [pop, setPop] = useState<null | 'color' | 'highlight' | 'size'>(null);

  // Apply outside changes (preset loaded, "use suggested wording", inserted field…).
  useLayoutEffect(() => {
    const json = JSON.stringify(value);
    if (json === last.current) return;
    last.current = json;
    if (el.current) el.current.innerHTML = richToHtml(value);
    setEmpty(!value.paragraphs.some((p) => p.runs.some((r) => r.text)));
  }, [value]);

  const emit = useCallback(() => {
    if (!el.current) return;
    // Convert <font size=7> produced by the size command into data-size spans.
    el.current.querySelectorAll('font[size]').forEach((f) => {
      const span = document.createElement('span');
      const v = (f as HTMLElement).dataset.pending || '1';
      span.setAttribute('data-size', v);
      span.style.fontSize = `${v}em`;
      if ((f as HTMLElement).getAttribute('color')) span.style.color = (f as HTMLElement).getAttribute('color')!;
      span.innerHTML = f.innerHTML;
      f.replaceWith(span);
    });
    const doc = htmlToRich(el.current, !!singleLine);
    const json = JSON.stringify(doc);
    setEmpty(!doc.paragraphs.some((p) => p.runs.some((r) => r.text)));
    if (json !== last.current) {
      last.current = json;
      onChange(doc);
    }
  }, [onChange, singleLine]);

  const saveRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && el.current?.contains(sel.anchorNode)) range.current = sel.getRangeAt(0).cloneRange();
    setActive({ bold: document.queryCommandState('bold'), italic: document.queryCommandState('italic'), underline: document.queryCommandState('underline') });
  };

  useEffect(() => {
    const onSel = () => {
      if (el.current && document.activeElement === el.current) saveRange();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const restore = () => {
    el.current?.focus();
    const sel = window.getSelection();
    if (range.current && sel) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    }
  };

  const exec = (cmd: string, arg?: string, css = false) => {
    restore();
    document.execCommand('styleWithCSS', false, css ? 'true' : 'false');
    document.execCommand(cmd, false, arg);
    emit();
    saveRange();
    setPop(null);
  };

  const setSize = (v: number) => {
    restore();
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');
    el.current?.querySelectorAll('font[size="7"]').forEach((f) => ((f as HTMLElement).dataset.pending = String(v)));
    emit();
    setPop(null);
  };

  useImperativeHandle(ref, () => ({
    insertText(text: string) {
      restore();
      document.execCommand('insertText', false, text);
      emit();
      saveRange();
    },
    focus() {
      el.current?.focus();
    },
  }));

  const btn = (key: string, title: string, icon: React.ReactNode, onClick: () => void, on = false) => (
    <button
      key={key}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx('flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100', on && 'bg-slate-200 text-slate-900')}
    >
      {icon}
    </button>
  );
  const anyPerm = Object.values(perms).some(Boolean);

  return (
    <div className="rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
      {anyPerm && (
        <div className="relative flex flex-wrap items-center gap-0.5 border-b border-slate-200 px-1.5 py-1" role="toolbar" aria-label={`Formatting for ${label}`}>
          {perms.bold && btn('b', 'Bold (Ctrl+B)', <Bold className="h-4 w-4" />, () => exec('bold'), active.bold)}
          {perms.italic && btn('i', 'Italic (Ctrl+I)', <Italic className="h-4 w-4" />, () => exec('italic'), active.italic)}
          {perms.underline && btn('u', 'Underline (Ctrl+U)', <Underline className="h-4 w-4" />, () => exec('underline'), active.underline)}
          {perms.color && btn('c', 'Text colour', <span className="text-sm font-bold leading-none" style={{ borderBottom: '3px solid #b91c1c' }}>A</span>, () => setPop(pop === 'color' ? null : 'color'))}
          {perms.highlight && btn('h', 'Highlight', <Highlighter className="h-4 w-4" />, () => setPop(pop === 'highlight' ? null : 'highlight'))}
          {perms.size && btn('s', 'Text size', <Type className="h-4 w-4" />, () => setPop(pop === 'size' ? null : 'size'))}
          {perms.align && (
            <>
              <span className="mx-1 h-5 w-px bg-slate-200" />
              {btn('al', 'Align left', <AlignLeft className="h-4 w-4" />, () => exec('justifyLeft', undefined, true))}
              {btn('ac', 'Align centre', <AlignCenter className="h-4 w-4" />, () => exec('justifyCenter', undefined, true))}
              {btn('ar', 'Align right', <AlignRight className="h-4 w-4" />, () => exec('justifyRight', undefined, true))}
            </>
          )}
          <span className="mx-1 h-5 w-px bg-slate-200" />
          {btn('x', 'Clear formatting of the selection', <RemoveFormatting className="h-4 w-4" />, () => {
            exec('removeFormat');
            exec('hiliteColor', 'transparent', true);
          })}
          {pop && (
            <div className="absolute left-1 top-full z-30 mt-1 flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
              {pop === 'color' &&
                TEXT_COLORS.map((c) => <button key={c} type="button" title={c} className="h-6 w-6 rounded-full ring-1 ring-slate-300" style={{ background: c }} onClick={() => exec('foreColor', c, true)} />)}
              {pop === 'color' && (
                <label className="ml-1 flex items-center gap-1 text-xs text-slate-600">
                  Other
                  <input type="color" className="h-6 w-8" onChange={(e) => exec('foreColor', e.target.value, true)} />
                </label>
              )}
              {pop === 'highlight' && (
                <>
                  {HIGHLIGHTS.map((c) => (
                    <button key={c} type="button" title={c} className="h-6 w-6 rounded ring-1 ring-slate-300" style={{ background: c }} onClick={() => exec('hiliteColor', c, true)} />
                  ))}
                  <button type="button" className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" onClick={() => exec('hiliteColor', 'transparent', true)}>
                    None
                  </button>
                </>
              )}
              {pop === 'size' &&
                SIZES.map((s) => (
                  <button key={s.value} type="button" className="rounded px-2 py-1 text-xs hover:bg-slate-100" onClick={() => setSize(s.value)} style={{ fontSize: `${0.75 * s.value}rem` }}>
                    {s.label}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
      <div className="relative">
        <div
          id={id}
          ref={el}
          role="textbox"
          aria-multiline={!singleLine}
          aria-label={label}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          className="w-full overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-sm text-slate-900 outline-none"
          style={{ minHeight: `${minRows * 1.6 + 1}rem`, maxHeight: '18rem', ...baseStyle }}
          onInput={emit}
          onBlur={() => {
            saveRange();
            emit();
          }}
          onKeyUp={saveRange}
          onMouseUp={saveRange}
          onKeyDown={(e) => {
            if (singleLine && e.key === 'Enter') e.preventDefault();
            const mod = e.ctrlKey || e.metaKey;
            if (mod && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
              const k = e.key.toLowerCase();
              if ((k === 'b' && !perms.bold) || (k === 'i' && !perms.italic) || (k === 'u' && !perms.underline)) e.preventDefault();
              else requestAnimationFrame(emit);
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            let t = e.clipboardData.getData('text/plain');
            if (singleLine) t = t.replace(/\s*\r?\n\s*/g, ' ');
            document.execCommand('insertText', false, t);
            emit();
          }}
          onDrop={(e) => e.preventDefault()}
        />
        {empty && placeholder && <p className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">{placeholder}</p>}
      </div>
    </div>
  );
});
