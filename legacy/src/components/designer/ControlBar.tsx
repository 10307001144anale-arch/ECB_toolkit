import React, { useState } from 'react';
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ChevronsDown,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import { useDesigner } from '../../context/DesignerContext';
import { ARTBOARD_PRESETS, GOOGLE_FONTS, SWATCH_COLORS } from '../../constants/presets';

export const ControlBar: React.FC = () => {
  const {
    artboard,
    applyArtboardPreset,
    setArtboard,
    tool,
    selectedProps,
    selectedCount,
    updateSelectedProperty,
    fillColor,
    strokeColor,
    strokeWidth,
    setFillColor,
    setStrokeColor,
    setStrokeWidth,
    alignSelected,
  } = useDesigner();

  const [showFillPicker, setShowFillPicker] = useState<boolean>(false);
  const [showStrokePicker, setShowStrokePicker] = useState<boolean>(false);

  return (
    <div className="h-9 bg-[#262626] border-b border-[#363636] px-3 flex items-center justify-between text-xs text-neutral-300 select-none z-20 shrink-0 overflow-x-auto no-scrollbar font-sans">
      {/* Dynamic Controls based on Selection */}
      <div className="flex items-center gap-3">
        {/* 1. Fill & Stroke Controls */}
        <div className="flex items-center gap-2 pr-3 border-r border-[#3a3a3a]">
          {/* Fill Swatch */}
          <div className="relative flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-400 font-medium">Fill</span>
            <button
              onClick={() => {
                setShowFillPicker(!showFillPicker);
                setShowStrokePicker(false);
              }}
              className="w-5 h-5 rounded-xs border border-[#444444] shadow-xs relative overflow-hidden"
              style={{ backgroundColor: selectedProps ? selectedProps.fill : fillColor }}
              title="Change Fill Color"
            />
            {showFillPicker && (
              <div className="absolute left-0 top-full mt-1 p-2 bg-[#2a2a2a] border border-[#444] shadow-2xl rounded-xs z-50 w-48">
                <div className="text-[10px] text-neutral-400 mb-1 font-semibold uppercase">Swatches</div>
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {SWATCH_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setFillColor(c);
                        setShowFillPicker(false);
                      }}
                      className="w-8 h-6 rounded-xs border border-[#444] hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1 pt-1 border-t border-[#3a3a3a]">
                  <span className="text-[10px] text-neutral-400">Custom:</span>
                  <input
                    type="color"
                    value={selectedProps ? selectedProps.fill : fillColor}
                    onChange={(e) => setFillColor(e.target.value)}
                    className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={selectedProps ? selectedProps.fill : fillColor}
                    onChange={(e) => setFillColor(e.target.value)}
                    className="flex-1 px-1 py-0.5 bg-[#1e1e1e] border border-[#444] text-[10px] font-mono text-white rounded-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Stroke Swatch & Width */}
          <div className="relative flex items-center gap-1.5">
            <span className="text-[10px] text-neutral-400 font-medium">Stroke</span>
            <button
              onClick={() => {
                setShowStrokePicker(!showStrokePicker);
                setShowFillPicker(false);
              }}
              className="w-5 h-5 rounded-xs border-2 border-[#444444] shadow-xs relative overflow-hidden"
              style={{ borderColor: selectedProps ? selectedProps.stroke : strokeColor }}
              title="Change Stroke Color"
            />
            {showStrokePicker && (
              <div className="absolute left-0 top-full mt-1 p-2 bg-[#2a2a2a] border border-[#444] shadow-2xl rounded-xs z-50 w-48">
                <div className="text-[10px] text-neutral-400 mb-1 font-semibold uppercase">Swatches</div>
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {SWATCH_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setStrokeColor(c);
                        setShowStrokePicker(false);
                      }}
                      className="w-8 h-6 rounded-xs border border-[#444] hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1 pt-1 border-t border-[#3a3a3a]">
                  <span className="text-[10px] text-neutral-400">Custom:</span>
                  <input
                    type="color"
                    value={selectedProps ? selectedProps.stroke : strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={selectedProps ? selectedProps.stroke : strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="flex-1 px-1 py-0.5 bg-[#1e1e1e] border border-[#444] text-[10px] font-mono text-white rounded-xs"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={48}
                value={selectedProps ? selectedProps.strokeWidth : strokeWidth}
                onChange={(e) => setStrokeWidth(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-11 px-1 py-0.5 bg-[#1a1a1a] border border-[#3e3e3e] text-[11px] font-mono text-white rounded-xs text-center outline-none"
              />
              <span className="text-[10px] text-neutral-400">pt</span>
            </div>
          </div>

          {/* Opacity slider */}
          <div className="flex items-center gap-1.5 pl-1">
            <span className="text-[10px] text-neutral-400">Opacity:</span>
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round((selectedProps?.opacity ?? 1) * 100)}
              onChange={(e) => {
                const val = Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) / 100;
                updateSelectedProperty('opacity', val);
              }}
              className="w-10 px-1 py-0.5 bg-[#1a1a1a] border border-[#3e3e3e] text-[11px] font-mono text-white rounded-xs text-center outline-none"
            />
            <span className="text-[10px] text-neutral-400">%</span>
          </div>
        </div>

        {/* 2. Text Specific Controls when a Text object is selected */}
        {selectedProps && (selectedProps.type === 'i-text' || selectedProps.type === 'text') && (
          <div className="flex items-center gap-2 pr-3 border-r border-[#3a3a3a]">
            {/* Font Family */}
            <select
              value={selectedProps.fontFamily || 'Montserrat'}
              onChange={(e) => updateSelectedProperty('fontFamily', e.target.value)}
              className="px-2 py-0.5 bg-[#1a1a1a] border border-[#3e3e3e] text-[11px] text-white rounded-xs outline-none"
            >
              {GOOGLE_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>

            {/* Font Size */}
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={6}
                max={200}
                value={selectedProps.fontSize || 32}
                onChange={(e) => updateSelectedProperty('fontSize', parseInt(e.target.value) || 20)}
                className="w-12 px-1 py-0.5 bg-[#1a1a1a] border border-[#3e3e3e] text-[11px] font-mono text-white rounded-xs text-center outline-none"
              />
              <span className="text-[10px] text-neutral-400">pt</span>
            </div>

            {/* Bold / Italic */}
            <div className="flex items-center bg-[#1a1a1a] rounded-xs border border-[#3e3e3e]">
              <button
                onClick={() =>
                  updateSelectedProperty(
                    'fontWeight',
                    selectedProps.fontWeight === 'bold' || selectedProps.fontWeight === 700 ? 'normal' : 'bold'
                  )
                }
                className={`p-1 hover:bg-[#333] transition-colors ${
                  selectedProps.fontWeight === 'bold' || selectedProps.fontWeight === 700
                    ? 'bg-[#0d99ff] text-white'
                    : 'text-neutral-400'
                }`}
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-3 h-3" />
              </button>
              <button
                onClick={() =>
                  updateSelectedProperty(
                    'fontStyle',
                    selectedProps.fontStyle === 'italic' ? 'normal' : 'italic'
                  )
                }
                className={`p-1 hover:bg-[#333] transition-colors ${
                  selectedProps.fontStyle === 'italic' ? 'bg-[#0d99ff] text-white' : 'text-neutral-400'
                }`}
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-3 h-3" />
              </button>
            </div>

            {/* Text Alignment */}
            <div className="flex items-center bg-[#1a1a1a] rounded-xs border border-[#3e3e3e]">
              <button
                onClick={() => updateSelectedProperty('textAlign', 'left')}
                className={`p-1 hover:bg-[#333] ${
                  selectedProps.textAlign === 'left' ? 'bg-[#0d99ff] text-white' : 'text-neutral-400'
                }`}
                title="Align Left"
              >
                <AlignLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => updateSelectedProperty('textAlign', 'center')}
                className={`p-1 hover:bg-[#333] ${
                  selectedProps.textAlign === 'center' ? 'bg-[#0d99ff] text-white' : 'text-neutral-400'
                }`}
                title="Align Center"
              >
                <AlignCenter className="w-3 h-3" />
              </button>
              <button
                onClick={() => updateSelectedProperty('textAlign', 'right')}
                className={`p-1 hover:bg-[#333] ${
                  selectedProps.textAlign === 'right' ? 'bg-[#0d99ff] text-white' : 'text-neutral-400'
                }`}
                title="Align Right"
              >
                <AlignRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* 3. Transform Dimensions (X, Y, W, H, Angle) */}
        {selectedProps ? (
          <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400">
            <span>X: {selectedProps.left}</span>
            <span>Y: {selectedProps.top}</span>
            <span>W: {selectedProps.width}</span>
            <span>H: {selectedProps.height}</span>
            {selectedProps.angle !== 0 && <span>∠ {selectedProps.angle}°</span>}
          </div>
        ) : (
          /* When nothing is selected: Artboard Info */
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-neutral-400">Artboard:</span>
              <select
                value={artboard.preset}
                onChange={(e) => applyArtboardPreset(e.target.value as any)}
                className="px-2 py-0.5 bg-[#1a1a1a] border border-[#3e3e3e] text-[11px] text-white rounded-xs outline-none"
              >
                {ARTBOARD_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-[10px] font-mono text-neutral-400 flex items-center gap-2">
              <span>
                {artboard.width} × {artboard.height} pt
              </span>
              <span>· Bleed: {artboard.bleed}pt</span>
              <span>· Safe: {artboard.safeMargin}pt</span>
            </div>
          </div>
        )}
      </div>

      {/* Right Quick Align Icons */}
      <div className="flex items-center gap-1 pl-2 border-l border-[#3a3a3a]">
        <button
          onClick={() => alignSelected('left')}
          title="Align Left to Artboard"
          className="p-1 hover:bg-[#333] rounded-xs text-neutral-400 hover:text-white"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => alignSelected('center')}
          title="Align Center Horizontally"
          className="p-1 hover:bg-[#333] rounded-xs text-neutral-400 hover:text-white"
        >
          <AlignHorizontalJustifyCenter className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => alignSelected('right')}
          title="Align Right to Artboard"
          className="p-1 hover:bg-[#333] rounded-xs text-neutral-400 hover:text-white"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => alignSelected('top')}
          title="Align Top to Artboard"
          className="p-1 hover:bg-[#333] rounded-xs text-neutral-400 hover:text-white"
        >
          <ChevronsUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => alignSelected('middle')}
          title="Align Center Vertically"
          className="p-1 hover:bg-[#333] rounded-xs text-neutral-400 hover:text-white"
        >
          <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => alignSelected('bottom')}
          title="Align Bottom to Artboard"
          className="p-1 hover:bg-[#333] rounded-xs text-neutral-400 hover:text-white"
        >
          <ChevronsDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
