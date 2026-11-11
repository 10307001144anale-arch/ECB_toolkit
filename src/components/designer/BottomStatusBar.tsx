import React from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useDesigner } from '../../context/DesignerContext';

export const BottomStatusBar: React.FC = () => {
  const {
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomToActual,
    cursorCoords,
    artboard,
    tool,
  } = useDesigner();

  const toolLabels: Record<string, string> = {
    select: 'Selection Tool (V)',
    'direct-select': 'Direct Selection Tool (A)',
    rectangle: 'Rectangle Tool (M)',
    ellipse: 'Ellipse Tool (L)',
    type: 'Type Tool (T)',
    hand: 'Hand Tool (H)',
    zoom: 'Zoom Tool (Z)',
    pen: 'Pen Tool (P)',
  };

  const zoomPercents = [25, 50, 75, 100, 150, 200, 300, 400, 800];

  return (
    <div className="h-6 bg-[#202020] border-t border-[#343434] px-3 flex items-center justify-between text-[11px] text-neutral-400 select-none z-30 shrink-0 font-mono">
      {/* Left: Zoom Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={zoomOut}
          title="Zoom Out (Ctrl+-)"
          className="hover:text-white transition-colors"
        >
          <ZoomOut className="w-3 h-3" />
        </button>

        <select
          value={Math.round(zoom * 100)}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (val) setZoom(val / 100);
          }}
          className="bg-transparent text-neutral-300 font-mono outline-none text-[10px] cursor-pointer"
        >
          {zoomPercents.map((pct) => (
            <option key={pct} value={pct} className="bg-[#262626]">
              {pct}%
            </option>
          ))}
          {!zoomPercents.includes(Math.round(zoom * 100)) && (
            <option value={Math.round(zoom * 100)} className="bg-[#262626]">
              {Math.round(zoom * 100)}%
            </option>
          )}
        </select>

        <button
          onClick={zoomIn}
          title="Zoom In (Ctrl++)"
          className="hover:text-white transition-colors"
        >
          <ZoomIn className="w-3 h-3" />
        </button>

        <button
          onClick={zoomToFit}
          title="Fit Artboard (Ctrl+0)"
          className="hover:text-white transition-colors text-[10px] px-1 bg-[#282828] rounded-xs"
        >
          Fit
        </button>
      </div>

      {/* Center: Live Cursor Coordinates relative to Artboard Origin */}
      <div className="flex items-center gap-4 text-neutral-400">
        <span>
          X: <strong className="text-neutral-200">{cursorCoords.x}</strong> pt
        </span>
        <span>
          Y: <strong className="text-neutral-200">{cursorCoords.y}</strong> pt
        </span>
      </div>

      {/* Right: Artboard & Active Tool */}
      <div className="flex items-center gap-3">
        <span className="text-neutral-500 font-sans">
          {artboard.name} ({artboard.width} × {artboard.height} pt)
        </span>
        <div className="h-3 w-px bg-[#3e3e3e]" />
        <span className="text-[#0d99ff] font-sans font-medium">
          {toolLabels[tool] || tool}
        </span>
      </div>
    </div>
  );
};
