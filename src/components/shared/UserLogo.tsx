import React from 'react';
import { UserRound } from 'lucide-react';
import { fileUrl } from '../../lib/api';
import { cx } from './ui';

/** A User's organisation logo, or their initials when there is none. */
export function UserLogo({ user, size = 'md' }: { user: { name: string; logoFileId?: string | null }; size?: 'sm' | 'md' | 'lg' }) {
  const cls = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-10 w-10 text-sm';
  if (user.logoFileId) return <img src={fileUrl(user.logoFileId)} alt="" className={cx('paper shrink-0 rounded-full border border-slate-200 object-contain p-0.5', cls)} />;
  const init = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return <span className={cx('flex shrink-0 items-center justify-center rounded-full bg-brand-50 font-bold text-navy', cls)}>{init || <UserRound className="h-4 w-4" />}</span>;
}
