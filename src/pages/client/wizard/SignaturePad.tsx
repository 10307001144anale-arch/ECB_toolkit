// Draw a signature with a mouse, finger or stylus. Produces a trimmed PNG with
// a transparent background.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, Redo2, Undo2 } from 'lucide-react';
import { Button, IconButton, cx } from '../../../components/ui';
import { trimSignature } from '../../../engine/images';

interface Stroke {
  color: string;
  width: number;
  points: [number, number][];
}

const COLORS = [
  { value: '#111827', label: 'Black' },
  { value: '#1e3a8a', label: 'Dark blue' },
  { value: '#1d4ed8', label: 'Blue' },
];

// Logical drawing surface; scaled to the element size.
const W = 900;
const H = 300;

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], scale = 1) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width * scale;
    const p = s.points;
    if (p.length === 1) {
      ctx.beginPath();
      ctx.arc(p[0][0] * scale, p[0][1] * scale, (s.width * scale) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(p[0][0] * scale, p[0][1] * scale);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2;
      const my = (p[i][1] + p[i + 1][1]) / 2;
      ctx.quadraticCurveTo(p[i][0] * scale, p[i][1] * scale, mx * scale, my * scale);
    }
    const last = p[p.length - 1];
    ctx.lineTo(last[0] * scale, last[1] * scale);
    ctx.stroke();
  }
}

export function SignaturePad({ onDone, onCancel }: { onDone: (png: Blob) => void; onCancel?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [width, setWidth] = useState(6);
  const [color, setColor] = useState(COLORS[0].value);
  const [busy, setBusy] = useState(false);
  const current = useRef<Stroke | null>(null);

  const paint = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    drawStrokes(ctx, current.current ? [...strokes, current.current] : strokes);
  }, [strokes]);
  useEffect(paint, [paint]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    current.current = { color, width, points: [point(e)] };
    paint();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!current.current) return;
    const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() || [e.nativeEvent];
    const r = e.currentTarget.getBoundingClientRect();
    for (const ev of events) current.current.points.push([((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H]);
    paint();
  };
  const up = () => {
    if (!current.current) return;
    const s = current.current;
    current.current = null;
    setStrokes((x) => [...x, s]);
    setRedo([]);
  };

  const undo = () => {
    if (!strokes.length) return;
    setRedo((r) => [...r, strokes[strokes.length - 1]]);
    setStrokes((s) => s.slice(0, -1));
  };
  const redoOne = () => {
    if (!redo.length) return;
    setStrokes((s) => [...s, redo[redo.length - 1]]);
    setRedo((r) => r.slice(0, -1));
  };

  const finish = async () => {
    if (!strokes.length) return;
    setBusy(true);
    try {
      // Render at 2× for crisp printing, transparent background.
      const c = document.createElement('canvas');
      c.width = W * 2;
      c.height = H * 2;
      drawStrokes(c.getContext('2d')!, strokes, 2);
      const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the drawing.'))), 'image/png'));
      onDone(await trimSignature(blob));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative select-none rounded-lg border border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block aspect-[3/1] w-full cursor-crosshair touch-none rounded-lg"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label="Signature drawing area"
        />
        <div className="pointer-events-none absolute inset-x-8 bottom-[22%] border-b border-dashed border-slate-300" />
        {!strokes.length && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">Sign here</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-slate-600">
          Thickness
          <input type="range" min={2} max={14} value={width} onChange={(e) => setWidth(+e.target.value)} className="w-24" aria-label="Pen thickness" />
        </label>
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Ink colour">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={color === c.value}
              title={c.label}
              onClick={() => setColor(c.value)}
              className={cx('h-6 w-6 rounded-full ring-offset-2', color === c.value && 'ring-2 ring-brand-500')}
              style={{ background: c.value }}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Undo" onClick={undo} disabled={!strokes.length}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo" onClick={redoOne} disabled={!redo.length}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Clear"
            onClick={() => {
              setStrokes([]);
              setRedo([]);
            }}
            disabled={!strokes.length}
          >
            <Eraser className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="sm" variant="primary" onClick={finish} disabled={!strokes.length} loading={busy}>
          Use this signature
        </Button>
      </div>
    </div>
  );
}
