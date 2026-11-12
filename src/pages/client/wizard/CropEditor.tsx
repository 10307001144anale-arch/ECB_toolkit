// Manual photo crop: drag to move, zoom, rotate, reset to the automatic crop.

import React, { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Button, Modal, cx } from '../../../components/ui';
import { autoCrop, detectFocus, drawCroppedPhoto } from '../../../engine/images';
import type { PhotoBox, PhotoCrop } from '../../../../shared/types';

export function CropEditor({
  blob,
  box,
  aspect,
  initial,
  fileName,
  onSave,
  onReset,
  onClose,
}: {
  blob: Blob;
  box: PhotoBox;
  aspect: number; // width / height of the photo box
  initial: PhotoCrop | null;
  fileName: string;
  onSave: (c: PhotoCrop) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<PhotoCrop | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; start: PhotoCrop } | null>(null);
  const W = 420;
  const H = Math.round(W / aspect);

  useEffect(() => {
    let b: ImageBitmap | null = null;
    createImageBitmap(blob)
      .then((x) => {
        b = x;
        setBmp(x);
      })
      .catch(() => setError('This photo could not be opened.'));
    if (!initial) detectFocus(blob).then((f) => setCrop((c) => c || autoCrop(f)));
    return () => b?.close?.();
  }, [blob, initial]);

  // Size of the (rotated) image as drawn into the frame.
  const drawn = (c: PhotoCrop) => {
    if (!bmp) return { dw: W, dh: H };
    const swap = c.rotate === 90 || c.rotate === 270;
    const iw = swap ? bmp.height : bmp.width;
    const ih = swap ? bmp.width : bmp.height;
    const s = Math.max(W / iw, H / ih) * Math.max(1, c.zoom);
    return { dw: iw * s, dh: ih * s };
  };
  const clamp = (c: PhotoCrop): PhotoCrop => {
    const { dw, dh } = drawn(c);
    const hx = W / 2 / dw;
    const hy = H / 2 / dh;
    return { ...c, x: Math.min(1 - hx, Math.max(hx, c.x)), y: Math.min(1 - hy, Math.max(hy, c.y)) };
  };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !bmp || !crop) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    drawCroppedPhoto(ctx, bmp, W, H, crop);
  }, [bmp, crop, W, H]);

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!crop) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: clamp(crop) };
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = drag.current;
    if (!g) return;
    const r = e.currentTarget.getBoundingClientRect();
    const k = W / r.width; // CSS px → canvas px
    const { dw, dh } = drawn(g.start);
    setCrop(clamp({ ...g.start, x: g.start.x - ((e.clientX - g.x) * k) / dw, y: g.start.y - ((e.clientY - g.y) * k) / dh }));
  };
  const up = () => (drag.current = null);

  const reset = async () => {
    setCrop(autoCrop(await detectFocus(blob)));
    onReset();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Adjust photo"
      description={`${fileName} · drag to move, use the slider to zoom.`}
      footer={
        <>
          <Button onClick={reset}>Reset to automatic</Button>
          <span className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!crop} onClick={() => crop && onSave(clamp(crop))}>
            Confirm crop
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <div className="space-y-4">
          <div className="mx-auto w-full max-w-sm">
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              className={cx('block w-full cursor-move touch-none bg-slate-100 ring-2 ring-brand-500', box.shape === 'circle' ? 'rounded-full' : box.shape === 'rounded' ? 'rounded-xl' : 'rounded-sm')}
              style={{ aspectRatio: `${W} / ${H}` }}
              aria-label="Photo crop area"
            />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="w-12 text-slate-600">Zoom</span>
            <input
              type="range"
              min={100}
              max={400}
              value={Math.round((crop?.zoom || 1) * 100)}
              onChange={(e) => crop && setCrop(clamp({ ...crop, zoom: +e.target.value / 100 }))}
              className="flex-1"
              aria-label="Zoom"
            />
            <Button size="sm" icon={<RotateCw className="h-4 w-4" />} onClick={() => crop && setCrop(clamp({ ...crop, rotate: (((crop.rotate + 90) % 360) as PhotoCrop['rotate']) }))}>
              Rotate
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
