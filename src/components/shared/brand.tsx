// ECB brand elements: logo, EB submark, header lockup, the ECB ribbon and its
// variants. Logos are always shown at their own aspect ratio, never recoloured
// and without effects.

import React from 'react';
import { cx } from './ui';

export const ECB_NAME_DZ = 'འབྲུག་གི་བཙག་འཐུ་ལྷན་ཚོགས།';
export const ECB_NAME_EN = 'Election Commission of Bhutan';
export const ECB_TAGLINE = 'Ensuring Free, Fair and Democratic Elections and Referendums';
export const ECB_URL = 'https://www.ecb.bt';

/** Full-colour ECB logo (circular seal). `size` is the height in px; width follows the artwork. */
export function EcbLogo({ size = 48, className }: { size?: number; className?: string }) {
  return <img src="/brand/ecb-logo.png" alt="Election Commission of Bhutan logo" width={Math.round((size * 530) / 535)} height={size} className={cx('shrink-0 select-none object-contain', className)} draggable={false} />;
}

/** EB submark for small spaces (collapsed sidebar, favicon, chips). */
export function EbSubmark({ size = 32, className }: { size?: number; className?: string }) {
  return <img src="/brand/eb-submark.png" alt="ECB" width={Math.round((size * 707) / 699)} height={size} className={cx('shrink-0 select-none object-contain', className)} draggable={false} />;
}

/**
 * Header lockup: logo | orange divider | Dzongkha name above
 * "Election Commission of Bhutan" (Roboto Bold). `onNavy` = white text version.
 */
export function HeaderLockup({ onNavy, size = 44, subtitle, className }: { onNavy?: boolean; size?: number; subtitle?: string; className?: string }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-3', className)}>
      <EcbLogo size={size} />
      <span className="h-[70%] min-h-8 w-[3px] shrink-0 self-center rounded-full bg-orange" style={{ height: size * 0.82 }} aria-hidden="true" />
      <div className="min-w-0 leading-tight">
        <p lang="dz" className={cx('truncate font-dz text-[13px]', onNavy ? 'text-white' : 'text-navy')}>
          {ECB_NAME_DZ}
        </p>
        <p className={cx('truncate text-[13px] font-bold', onNavy ? 'text-white' : 'text-navy')}>{ECB_NAME_EN}</p>
        {subtitle && <p className={cx('truncate text-[11px]', onNavy ? 'text-white/70' : 'text-midgray')}>{subtitle}</p>}
      </div>
    </div>
  );
}

/**
 * The ECB ribbon: a navy curve rising from left to right with yellow (outer)
 * and orange edges. Flat colours only — no green, gradients or shadows.
 * It stretches horizontally; the height should be 10–25% of the item it sits on.
 */
export function EcbRibbon({ height = 72, className, flip }: { height?: number; className?: string; flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={cx('block', className)}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {/* Thin yellow and orange edges over the navy body. */}
      <path d="M0 100 C 420 102 900 74 1440 10 L1440 120 L0 120 Z" fill="#FFE900" />
      <path d="M0 104 C 420 106 900 79 1440 16 L1440 120 L0 120 Z" fill="#F68D2E" />
      <path d="M0 110 C 420 112 900 87 1440 26 L1440 120 L0 120 Z" fill="#002F6C" />
    </svg>
  );
}

/** Straight ECB bands (yellow, orange, navy) — the flat version of the ribbon. */
export function EcbStripes({ className }: { className?: string }) {
  return (
    <div className={cx('w-full', className)} aria-hidden="true">
      <div className="h-1.5 bg-yellow" />
      <div className="h-1.5 bg-orange" />
    </div>
  );
}

/** Small flat bar divider (navy, orange, yellow) used under page titles. */
export function RibbonDivider({ className }: { className?: string }) {
  return (
    <div className={cx('flex h-1 items-stretch gap-1', className)} aria-hidden="true">
      <span className="w-14 rounded-full bg-navy" />
      <span className="w-6 rounded-full bg-orange" />
      <span className="w-3 rounded-full bg-yellow" />
    </div>
  );
}

/** Slim footer: a thin ribbon over a navy strip with the tagline and www.ecb.bt. */
export function BrandFooter({ className }: { className?: string }) {
  return (
    <footer className={cx('mt-auto', className)}>
      <EcbRibbon height={14} />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-navy px-4 py-2 text-xs text-white sm:px-6 lg:px-8">
        <span>{ECB_TAGLINE}</span>
        <a href={ECB_URL} target="_blank" rel="noreferrer" className="font-medium text-white underline-offset-2 hover:underline">
          www.ecb.bt
        </a>
      </div>
    </footer>
  );
}

/** Side bands on a card: yellow and orange on the left, navy on the right. */
export function SideBands({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('relative overflow-hidden', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex" aria-hidden="true">
        <span className="w-1.5 bg-yellow" />
        <span className="w-1.5 bg-orange" />
      </span>
      <span className="pointer-events-none absolute inset-y-0 right-0 z-10 w-2 bg-navy" aria-hidden="true" />
      <div className="pl-3 pr-2">{children}</div>
    </div>
  );
}

/** Round icon chip: navy line icon with an orange detail dot. */
export function BrandIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cx('relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-navy', className)}>
      {children}
      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange" aria-hidden="true" />
    </span>
  );
}
