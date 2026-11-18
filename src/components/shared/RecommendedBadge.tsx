// "Recommended" mark an Admin puts on a template: "use this template".

import React from 'react';
import { Star } from 'lucide-react';
import { cx } from './ui';

export function RecommendedBadge({ by, className, overlay }: { by?: string | null; className?: string; overlay?: boolean }) {
  return (
    <span
      title={by ? `Recommended by ${by}` : 'Recommended by Admin'}
      className={cx(
        'inline-flex items-center gap-1 rounded-full bg-orange px-2 py-0.5 text-[11px] font-semibold text-navy',
        overlay && 'shadow',
        className
      )}
    >
      <Star className="h-3 w-3 fill-current" aria-hidden="true" /> Recommended
    </span>
  );
}
