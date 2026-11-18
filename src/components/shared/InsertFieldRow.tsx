// "Insert field" row used wherever wording is written (Super Admin designer,
// Admin and User generation): one click inserts a field such as {{name}} at
// the cursor, and a typed name is converted to a field key
// ("Full Name" → {{full_name}}).

import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { cx } from './ui';

/** Common certificate fields offered as one-click chips. */
export const COMMON_FIELDS = ['name', 'cid', 'date', 'workshop', 'organisation', 'position'];

/** "Full Name" → "full_name"; letters, numbers and underscores, starting with a letter. */
export function toFieldKey(label: string): string {
  let k = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  if (k && !/^[a-z]/.test(k)) k = `field_${k}`.slice(0, 48);
  return k;
}

export function InsertFieldRow({
  used,
  suggested = COMMON_FIELDS,
  onInsert,
  idPrefix,
}: {
  /** Fields already in use (shown first, highlighted). */
  used: string[];
  /** Other fields to offer. */
  suggested?: string[];
  /** Called with the field name, without braces. */
  onInsert: (name: string) => void;
  idPrefix: string;
}) {
  const [custom, setCustom] = useState('');
  const key = toFieldKey(custom);
  const usedSet = new Set(used.map((u) => u.toLowerCase()));
  const others = [...new Set(suggested)].filter((s) => !usedSet.has(s.toLowerCase()));

  const addCustom = () => {
    if (!key) return;
    onInsert(key);
    setCustom('');
  };

  const chip = (name: string, isUsed: boolean) => (
    <button
      key={name}
      type="button"
      // Keep the cursor in the wording while clicking.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onInsert(name)}
      title={`Insert {{${name}}} at the cursor`}
      className={cx(
        'rounded-md border px-2 py-0.5 font-mono text-xs transition-colors',
        isUsed ? 'border-orange bg-orange text-navy hover:bg-orange-shade' : 'border-slate-300 text-slate-700 hover:border-orange hover:text-slate-900'
      )}
    >
      {`{{${name}}}`}
    </button>
  );

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-medium text-slate-600">Insert field — click to add at the cursor</p>
      <div className="flex flex-wrap gap-1.5">
        {used.map((n) => chip(n, true))}
        {others.map((n) => chip(n, false))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          id={`${idPrefix}-new-field`}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="New field, e.g. Full Name"
          aria-label="New field name"
          maxLength={60}
          className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-orange focus:outline-none"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!key}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-orange px-2 text-xs font-semibold text-navy hover:bg-orange-shade disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
      {custom.trim() && (
        <p className="text-xs text-slate-600">
          Will insert <code className="rounded bg-slate-100 px-1 font-mono">{key ? `{{${key}}}` : '—'}</code>
        </p>
      )}
    </div>
  );
}
