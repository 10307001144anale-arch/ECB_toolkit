// Measurement units and geometry helpers for the designer.
// Layout boxes are stored as percentages of the page; the page size is in PDF
// points (1 pt = 1/72 in). The editor works in points and shows the unit the
// Super Admin picks.

import type { LayoutPage, TemplateBox } from '../../../../shared/types';

export type Unit = 'px' | 'mm' | 'cm' | 'in';
export const UNITS: Unit[] = ['mm', 'cm', 'in', 'px'];

/** Points per unit (px at 96 dpi, like design tools). */
export const PT_PER: Record<Unit, number> = { px: 72 / 96, mm: 72 / 25.4, cm: 72 / 2.54, in: 72 };
const DECIMALS: Record<Unit, number> = { px: 0, mm: 1, cm: 2, in: 3 };

export const ptToUnit = (pt: number, u: Unit) => pt / PT_PER[u];
export const unitToPt = (v: number, u: Unit) => v * PT_PER[u];
export const fmtUnit = (pt: number, u: Unit) => {
  const d = DECIMALS[u];
  const v = ptToUnit(pt, u);
  return (Math.round(v * 10 ** d) / 10 ** d).toFixed(d);
};
export const unitStep = (u: Unit) => (u === 'px' ? 1 : u === 'mm' ? 0.5 : u === 'cm' ? 0.05 : 0.01);

/** Default grid spacing per unit, in points. */
export const DEFAULT_GRID: Record<Unit, number> = { mm: unitToPt(5, 'mm'), cm: unitToPt(1, 'cm'), in: unitToPt(0.25, 'in'), px: unitToPt(20, 'px') };

export interface PtRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function boxToPt(b: Pick<TemplateBox, 'x' | 'y' | 'w' | 'h'>, pg: Pick<LayoutPage, 'width' | 'height'>): PtRect {
  return { x: (b.x / 100) * pg.width, y: (b.y / 100) * pg.height, w: (b.w / 100) * pg.width, h: (b.h / 100) * pg.height };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Page points → stored percentages (rounded, clamped to the page). */
export function ptToBox(r: PtRect, pg: Pick<LayoutPage, 'width' | 'height'>): { x: number; y: number; w: number; h: number } {
  const w = Math.min(100, Math.max(0.5, (r.w / pg.width) * 100));
  const h = Math.min(100, Math.max(0.5, (r.h / pg.height) * 100));
  const x = Math.min(100 - w, Math.max(0, (r.x / pg.width) * 100));
  const y = Math.min(100 - h, Math.max(0, (r.y / pg.height) * 100));
  return { x: r2(x), y: r2(y), w: r2(w), h: r2(h) };
}

export function unionRect(rects: PtRect[]): PtRect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Axis-aligned bounds of a rotated rectangle. */
export function rotatedBounds(r: PtRect, deg = 0): PtRect {
  if (!deg) return r;
  const a = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = r.w * c + r.h * s;
  const h = r.w * s + r.h * c;
  return { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
}

export function intersects(a: PtRect, b: PtRect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** A "nice" ruler step (in units) so major ticks are at least `minPx` apart. */
export function niceStep(pxPerUnit: number, minPx = 60): number {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  return steps.find((s) => s * pxPerUnit >= minPx) || 10000;
}

// ---------------------------------------------------------------- snapping

export interface SnapTarget {
  pos: number;
  kind: 'page' | 'guide' | 'box';
}

/**
 * Finds the smallest shift (≤ threshold) that lines one of `values` up with a
 * target or a grid line. Returns the shift and the matched target positions
 * (for drawing smart alignment lines; grid matches are not drawn).
 */
export function snap1D(values: number[], targets: SnapTarget[], threshold: number, grid: number | null): { delta: number; lines: number[] } {
  let best: number | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t.pos - v;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    if (grid && grid > 0) {
      const g = Math.round(v / grid) * grid;
      const d = g - v;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best) - 0.001)) best = d;
    }
  }
  if (best === null) return { delta: 0, lines: [] };
  const lines = new Set<number>();
  for (const v of values) for (const t of targets) if (Math.abs(t.pos - (v + best)) < 0.01) lines.add(t.pos);
  return { delta: best, lines: [...lines] };
}
