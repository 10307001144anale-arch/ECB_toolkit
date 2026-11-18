// Layers: every field on the current page, top-most first. Show/hide and lock
// (editor only — fields still print), rename (double-click), and reorder by
// dragging or with the arrow buttons. The list order is the drawing order.

import React, { useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Eye, EyeOff, GripVertical, Lock, Unlock } from 'lucide-react';
import type { TemplateBox } from '../../../../shared/types';
import { signatureOrder } from '../../../../shared/layout';
import { cx } from '../../shared/ui';
import { BOX_STYLE } from './boxVisuals';

interface Props {
  boxes: TemplateBox[]; // all boxes (array order = z-order, last on top)
  page: number;
  selection: string[];
  readOnly: boolean;
  onSelect: (ids: string[]) => void;
  onPatch: (id: string, patch: Partial<TemplateBox>) => void;
  /** Moves `id` so it sits directly above (`before` = false) or below another box in the full list. */
  onReorder: (ids: string[]) => void;
}

export function LayersPanel({ boxes, page, selection, readOnly, onSelect, onPatch, onReorder }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const sigNo = new Map(signatureOrder(boxes).map((b, i) => [b.id, i + 1]));
  const onPage = boxes.filter((b) => b.page === page);
  const list = [...onPage].reverse(); // top-most first

  const moveTo = (id: string, targetId: string) => {
    if (id === targetId) return;
    const order = boxes.map((b) => b.id).filter((x) => x !== id);
    // In the visual list, dropping on a row places the item above it (= after it in z-order).
    const ti = order.indexOf(targetId);
    order.splice(ti + 1, 0, id);
    onReorder(order);
  };

  const step = (id: string, dir: 1 | -1) => {
    const idx = onPage.findIndex((b) => b.id === id);
    const other = onPage[idx + dir];
    if (!other) return;
    const order = boxes.map((b) => b.id);
    const a = order.indexOf(id);
    const b = order.indexOf(other.id);
    [order[a], order[b]] = [order[b], order[a]];
    onReorder(order);
  };

  const commitName = (b: TemplateBox) => {
    const v = draft.trim();
    if (v && v !== b.label) onPatch(b.id, { label: v.slice(0, 80) });
    setEditing(null);
  };

  if (!list.length) return <p className="px-4 py-6 text-center text-xs text-slate-500">No fields on this page yet. Pick a tool on the left and draw on the artboard.</p>;

  return (
    <ul className="p-2" role="listbox" aria-label="Layers" aria-multiselectable>
      {list.map((b, i) => {
        const isDate = b.type === 'text' && !!b.date;
        const st = BOX_STYLE[b.type];
        const sel = selection.includes(b.id);
        return (
          <li
            key={b.id}
            role="option"
            aria-selected={sel}
            draggable={!readOnly && editing !== b.id}
            onDragStart={(e) => {
              setDragId(b.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOver(b.id);
            }}
            onDragLeave={() => setOver((o) => (o === b.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) moveTo(dragId, b.id);
              setDragId(null);
              setOver(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOver(null);
            }}
            onClick={(e) => onSelect(e.shiftKey ? (sel ? selection.filter((x) => x !== b.id) : [...selection, b.id]) : [b.id])}
            className={cx(
              'group flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm',
              sel ? 'bg-brand-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50',
              over === b.id && dragId !== b.id && 'ring-1 ring-brand-400',
              b.hidden && 'opacity-75'
            )}
          >
            {!readOnly && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300" />}
            <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded text-white', isDate ? 'bg-teal-600' : st.chip)}>{isDate ? <CalendarDays className="h-3 w-3" /> : st.icon}</span>
            {editing === b.id ? (
              <input
                autoFocus
                value={draft}
                maxLength={80}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitName(b)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName(b);
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="min-w-0 flex-1 rounded border border-brand-400 bg-white px-1 text-sm text-slate-900 outline-none"
                aria-label="Layer name"
              />
            ) : (
              <span
                className="min-w-0 flex-1 truncate"
                title="Double-click to rename"
                onDoubleClick={(e) => {
                  if (readOnly) return;
                  e.stopPropagation();
                  setDraft(b.label);
                  setEditing(b.id);
                }}
              >
                {b.type === 'signature' ? `${sigNo.get(b.id)}. ` : ''}
                {b.label}
              </span>
            )}
            <span className="flex shrink-0 items-center opacity-70 group-hover:opacity-100">
              {!readOnly && (
                <>
                  <button type="button" className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} title="Bring forward" onClick={(e) => (e.stopPropagation(), step(b.id, 1))}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === list.length - 1} title="Send backward" onClick={(e) => (e.stopPropagation(), step(b.id, -1))}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              <button
                type="button"
                className={cx('rounded p-0.5 hover:text-slate-700', b.locked ? 'text-amber-600' : 'text-slate-400')}
                title={b.locked ? 'Unlock' : 'Lock (cannot be moved on the canvas)'}
                aria-pressed={!!b.locked}
                disabled={readOnly}
                onClick={(e) => (e.stopPropagation(), onPatch(b.id, { locked: !b.locked }))}
              >
                {b.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                className={cx('rounded p-0.5 hover:text-slate-700', b.hidden ? 'text-slate-500' : 'text-slate-400')}
                title={b.hidden ? 'Show in the editor' : 'Hide in the editor (still printed)'}
                aria-pressed={!!b.hidden}
                disabled={readOnly}
                onClick={(e) => (e.stopPropagation(), onPatch(b.id, { hidden: !b.hidden }))}
              >
                {b.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </span>
          </li>
        );
      })}
      <li className="px-2 pt-2 text-[11px] leading-snug text-slate-400">Top of the list is drawn on top. Hidden and locked only affect the editor — every field is still printed.</li>
    </ul>
  );
}
