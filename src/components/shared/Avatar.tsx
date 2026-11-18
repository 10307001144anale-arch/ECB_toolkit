// Profile photo, or the person's initials when they have none.

import React, { useState } from 'react';
import { fileUrl } from '../../lib/api';
import { cx } from './ui';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function Avatar({ name, fileId, size = 32, className }: { name: string; fileId?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = fileId && broken !== fileId;
  return (
    <span
      className={cx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange font-bold text-navy', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      title={name}
    >
      {showImage ? <img src={fileUrl(fileId)} alt="" className="h-full w-full object-cover" onError={() => setBroken(fileId!)} /> : initials(name)}
    </span>
  );
}
