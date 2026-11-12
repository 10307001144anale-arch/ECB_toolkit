import React, { useEffect, useRef } from 'react';

interface RulerProps {
  orientation: 'horizontal' | 'vertical';
  length: number;           // in CSS pixels of ruler bar
  offset: number;           // pan offset in pixels where artboard 0 aligns
  zoom: number;             // zoom factor
  cursorPos: number;        // current mouse position in artboard coordinates
  onAddGuide?: (position: number) => void;
}

export const Ruler: React.FC<RulerProps> = ({
  orientation,
  length,
  offset,
  zoom,
  cursorPos,
  onAddGuide,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingGuide = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const isH = orientation === 'horizontal';

    const width = isH ? length : 20;
    const height = isH ? 20 : length;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);

    // Background - Dark Adobe theme
    ctx.fillStyle = '#262626';
    ctx.fillRect(0, 0, width, height);

    // Border line separating from canvas
    ctx.strokeStyle = '#383838';
    ctx.lineWidth = 1;
    if (isH) {
      ctx.beginPath();
      ctx.moveTo(0, 19.5);
      ctx.lineTo(width, 19.5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(19.5, 0);
      ctx.lineTo(19.5, height);
      ctx.stroke();
    }

    // Determine tick step based on zoom
    let step = 100;
    if (zoom >= 4) step = 10;
    else if (zoom >= 2) step = 20;
    else if (zoom >= 0.8) step = 50;
    else if (zoom >= 0.4) step = 100;
    else if (zoom >= 0.2) step = 200;
    else step = 500;

    const subStep = step / 5;

    // Viewport visible range in artboard units
    const startVal = Math.floor((-offset) / zoom / step) * step - step;
    const endVal = Math.ceil((length - offset) / zoom / step) * step + step;

    ctx.fillStyle = '#8e8e8e';
    ctx.strokeStyle = '#555555';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Draw minor & sub ticks
    ctx.beginPath();
    for (let val = startVal; val <= endVal; val += subStep) {
      const pos = offset + val * zoom;
      if (pos < 0 || pos > length) continue;

      const isMajor = Math.abs(val % step) < 0.001;
      const isMedium = Math.abs(val % (step / 2)) < 0.001;

      const tickLen = isMajor ? 12 : isMedium ? 7 : 4;

      if (isH) {
        ctx.moveTo(pos, 20 - tickLen);
        ctx.lineTo(pos, 20);
      } else {
        ctx.moveTo(20 - tickLen, pos);
        ctx.lineTo(20, pos);
      }
    }
    ctx.stroke();

    // Draw major numbers
    for (let val = startVal; val <= endVal; val += step) {
      const pos = offset + val * zoom;
      if (pos < -50 || pos > length) continue;

      if (isH) {
        ctx.fillText(Math.round(val).toString(), pos + 2, 2);
      } else {
        ctx.save();
        ctx.translate(2, pos + 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(Math.round(val).toString(), 0, 0);
        ctx.restore();
      }
    }

    // Draw hairline indicator tracking current mouse position
    const cursorPixel = offset + cursorPos * zoom;
    if (cursorPixel >= 0 && cursorPixel <= length) {
      ctx.strokeStyle = '#0d99ff'; // Illustrator selection blue
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (isH) {
        ctx.moveTo(cursorPixel, 0);
        ctx.lineTo(cursorPixel, 20);
      } else {
        ctx.moveTo(0, cursorPixel);
        ctx.lineTo(20, cursorPixel);
      }
      ctx.stroke();
    }
  }, [orientation, length, offset, zoom, cursorPos]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingGuide.current = true;
    const startPos = orientation === 'horizontal' ? e.clientY : e.clientX;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Guide drag in progress
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      isDraggingGuide.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      // If dragged into canvas, drop guide
      const currentPos = orientation === 'horizontal' ? upEvent.clientY : upEvent.clientX;
      if (Math.abs(currentPos - startPos) > 15 && onAddGuide) {
        onAddGuide(cursorPos);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={handleMouseDown}
      className={`select-none cursor-pointer ${
        orientation === 'horizontal' ? 'h-5 w-full' : 'w-5 h-full'
      }`}
      title="Click and drag from ruler to create a guide"
    />
  );
};
