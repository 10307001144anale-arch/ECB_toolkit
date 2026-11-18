// Designer version of the shared Insert field row: offers the fields already
// used anywhere in this template's default wording first.

import React, { useMemo } from 'react';
import { findPlaceholders } from '../../../../shared/placeholders';
import type { TemplateLayout } from '../../../../shared/types';
import { InsertFieldRow as SharedInsertFieldRow } from '../../shared/InsertFieldRow';

export { toFieldKey } from '../../shared/InsertFieldRow';

export function InsertFieldRow({ layout, onInsert }: { layout: TemplateLayout; onInsert: (text: string) => void }) {
  const used = useMemo(() => {
    const out: string[] = [];
    for (const b of layout.boxes) {
      if (b.type !== 'text') continue;
      for (const t of findPlaceholders(b.defaultText || '')) if (!out.includes(t.name)) out.push(t.name);
    }
    return out;
  }, [layout.boxes]);
  return <SharedInsertFieldRow idPrefix="designer" used={used} onInsert={(name) => onInsert(`{{${name}}}`)} />;
}
