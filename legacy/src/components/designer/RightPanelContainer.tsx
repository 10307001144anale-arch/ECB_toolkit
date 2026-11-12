import React from 'react';
import {
  SlidersHorizontal,
  Layers,
  Layout,
  AlignHorizontalJustifyCenter,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  Type,
  Square,
  Circle,
  ChevronsRight,
  ChevronsLeft,
  ChevronRight,
} from 'lucide-react';
import { useDesigner } from '../../context/DesignerContext';
import { ARTBOARD_PRESETS, GOOGLE_FONTS, SWATCH_COLORS, CERTIFICATE_PLACEHOLDERS } from '../../constants/presets';

export const RightPanelContainer: React.FC = () => {
  const {
    activeRightPanel,
    setActiveRightPanel,
    rightPanelCollapsed,
    setRightPanelCollapsed,
    selectedProps,
    selectedCount,
    updateSelectedProperty,
    artboard,
    setArtboard,
    applyArtboardPreset,
    layers,
    selectLayerObject,
    toggleLayerVisibility,
    toggleLayerLock,
    reorderLayer,
    alignSelected,
    deleteSelected,
    duplicateSelected,
  } = useDesigner();

  if (rightPanelCollapsed) {
    return (
      <div className="w-9 bg-[#242424] border-l border-[#343434] flex flex-col items-center py-2 gap-2 select-none z-20 shrink-0 font-sans">
        <button
          onClick={() => setRightPanelCollapsed(false)}
          title="Expand Panels"
          className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#333] rounded-xs"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setActiveRightPanel('properties');
            setRightPanelCollapsed(false);
          }}
          title="Properties"
          className={`p-1.5 rounded-xs ${
            activeRightPanel === 'properties' ? 'text-[#0d99ff] bg-[#333]' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setActiveRightPanel('layers');
            setRightPanelCollapsed(false);
          }}
          title="Layers"
          className={`p-1.5 rounded-xs ${
            activeRightPanel === 'layers' ? 'text-[#0d99ff] bg-[#333]' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setActiveRightPanel('artboards');
            setRightPanelCollapsed(false);
          }}
          title="Artboard"
          className={`p-1.5 rounded-xs ${
            activeRightPanel === 'artboards' ? 'text-[#0d99ff] bg-[#333]' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Layout className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setActiveRightPanel('align');
            setRightPanelCollapsed(false);
          }}
          title="Align"
          className={`p-1.5 rounded-xs ${
            activeRightPanel === 'align' ? 'text-[#0d99ff] bg-[#333]' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <AlignHorizontalJustifyCenter className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-68 bg-[#242424] border-l border-[#343434] flex flex-col h-full select-none z-20 shrink-0 text-xs text-neutral-300 font-sans">
      {/* Panel Tabs Bar */}
      <div className="h-8 bg-[#202020] border-b border-[#343434] flex items-center justify-between px-1 shrink-0">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveRightPanel('properties')}
            className={`px-2 py-1 rounded-xs text-[11px] font-medium transition-colors ${
              activeRightPanel === 'properties'
                ? 'bg-[#2b2b2b] text-[#0d99ff] border-b border-[#0d99ff]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Properties
          </button>
          <button
            onClick={() => setActiveRightPanel('layers')}
            className={`px-2 py-1 rounded-xs text-[11px] font-medium transition-colors ${
              activeRightPanel === 'layers'
                ? 'bg-[#2b2b2b] text-[#0d99ff] border-b border-[#0d99ff]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Layers
          </button>
          <button
            onClick={() => setActiveRightPanel('artboards')}
            className={`px-2 py-1 rounded-xs text-[11px] font-medium transition-colors ${
              activeRightPanel === 'artboards'
                ? 'bg-[#2b2b2b] text-[#0d99ff] border-b border-[#0d99ff]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Artboard
          </button>
          <button
            onClick={() => setActiveRightPanel('align')}
            className={`px-2 py-1 rounded-xs text-[11px] font-medium transition-colors ${
              activeRightPanel === 'align'
                ? 'bg-[#2b2b2b] text-[#0d99ff] border-b border-[#0d99ff]'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Align
          </button>
        </div>

        <button
          onClick={() => setRightPanelCollapsed(true)}
          title="Collapse Panel"
          className="p-1 text-neutral-400 hover:text-white hover:bg-[#333] rounded-xs"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Panel Body Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* ================= TAB 1: PROPERTIES ================= */}
        {activeRightPanel === 'properties' && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="pb-2 border-b border-[#343434] flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                {selectedProps
                  ? `${selectedProps.type.toUpperCase()} SELECTED`
                  : 'NO SELECTION (ARTBOARD ACTIVE)'}
              </span>
              {selectedCount > 0 && (
                <span className="text-[10px] text-[#0d99ff] font-mono">
                  {selectedCount} item{selectedCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {selectedProps ? (
              <>
                {/* Transform Box */}
                <div className="space-y-2">
                  <span className="text-[10px] text-neutral-400 font-semibold uppercase">
                    Transform
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center justify-between bg-[#1e1e1e] px-2 py-1 rounded-xs border border-[#3e3e3e]">
                      <span className="text-neutral-500 font-mono">X</span>
                      <input
                        type="number"
                        value={selectedProps.left}
                        onChange={(e) =>
                          updateSelectedProperty('left', parseInt(e.target.value) || 0)
                        }
                        className="w-16 bg-transparent text-right font-mono text-white outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-[#1e1e1e] px-2 py-1 rounded-xs border border-[#3e3e3e]">
                      <span className="text-neutral-500 font-mono">Y</span>
                      <input
                        type="number"
                        value={selectedProps.top}
                        onChange={(e) =>
                          updateSelectedProperty('top', parseInt(e.target.value) || 0)
                        }
                        className="w-16 bg-transparent text-right font-mono text-white outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-[#1e1e1e] px-2 py-1 rounded-xs border border-[#3e3e3e]">
                      <span className="text-neutral-500 font-mono">W</span>
                      <input
                        type="number"
                        value={selectedProps.width}
                        onChange={(e) =>
                          updateSelectedProperty('width', Math.max(5, parseInt(e.target.value) || 5))
                        }
                        className="w-16 bg-transparent text-right font-mono text-white outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-[#1e1e1e] px-2 py-1 rounded-xs border border-[#3e3e3e]">
                      <span className="text-neutral-500 font-mono">H</span>
                      <input
                        type="number"
                        value={selectedProps.height}
                        onChange={(e) =>
                          updateSelectedProperty('height', Math.max(5, parseInt(e.target.value) || 5))
                        }
                        className="w-16 bg-transparent text-right font-mono text-white outline-none"
                      />
                    </div>
                  </div>

                  {/* Rotation & Opacity */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    <div className="flex items-center justify-between bg-[#1e1e1e] px-2 py-1 rounded-xs border border-[#3e3e3e]">
                      <span className="text-neutral-500">Angle</span>
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          value={selectedProps.angle}
                          onChange={(e) =>
                            updateSelectedProperty('angle', parseInt(e.target.value) || 0)
                          }
                          className="w-10 bg-transparent text-right font-mono text-white outline-none"
                        />
                        <span className="text-neutral-500">°</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-[#1e1e1e] px-2 py-1 rounded-xs border border-[#3e3e3e]">
                      <span className="text-neutral-500">Opacity</span>
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Math.round(selectedProps.opacity * 100)}
                          onChange={(e) =>
                            updateSelectedProperty(
                              'opacity',
                              Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) / 100
                            )
                          }
                          className="w-10 bg-transparent text-right font-mono text-white outline-none"
                        />
                        <span className="text-neutral-500">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Appearance: Fill & Stroke */}
                <div className="space-y-2 pt-2 border-t border-[#343434]">
                  <span className="text-[10px] text-neutral-400 font-semibold uppercase">
                    Appearance
                  </span>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-[#1e1e1e] p-2 rounded-xs border border-[#3e3e3e]">
                      <span className="text-neutral-400">Fill Color</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={selectedProps.fill}
                          onChange={(e) => updateSelectedProperty('fill', e.target.value)}
                          className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                        />
                        <input
                          type="text"
                          value={selectedProps.fill}
                          onChange={(e) => updateSelectedProperty('fill', e.target.value)}
                          className="w-18 bg-[#181818] border border-[#3e3e3e] px-1.5 py-0.5 text-[10px] font-mono text-white rounded-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-[#1e1e1e] p-2 rounded-xs border border-[#3e3e3e]">
                      <span className="text-neutral-400">Stroke</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={selectedProps.stroke}
                          onChange={(e) => updateSelectedProperty('stroke', e.target.value)}
                          className="w-6 h-6 p-0 border-0 bg-transparent cursor-pointer"
                        />
                        <input
                          type="number"
                          min={0}
                          max={36}
                          value={selectedProps.strokeWidth}
                          onChange={(e) =>
                            updateSelectedProperty('strokeWidth', parseInt(e.target.value) || 0)
                          }
                          className="w-12 bg-[#181818] border border-[#3e3e3e] px-1 py-0.5 text-[10px] font-mono text-white rounded-xs text-center"
                        />
                        <span className="text-[10px] text-neutral-500">pt</span>
                      </div>
                    </div>

                    {/* Corner Radius for Rectangles */}
                    {selectedProps.type === 'rect' && (
                      <div className="flex items-center justify-between bg-[#1e1e1e] p-2 rounded-xs border border-[#3e3e3e]">
                        <span className="text-neutral-400">Corner Radius</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={selectedProps.rx || 0}
                            onChange={(e) => {
                              const r = Math.max(0, parseInt(e.target.value) || 0);
                              updateSelectedProperty('rx', r);
                              updateSelectedProperty('ry', r);
                            }}
                            className="w-14 bg-[#181818] border border-[#3e3e3e] px-1.5 py-0.5 text-[10px] font-mono text-white rounded-xs text-center"
                          />
                          <span className="text-[10px] text-neutral-500">px</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Typography when Text is Selected */}
                {(selectedProps.type === 'i-text' || selectedProps.type === 'text') && (
                  <div className="space-y-2 pt-2 border-t border-[#343434]">
                    <span className="text-[10px] text-neutral-400 font-semibold uppercase">
                      Character
                    </span>

                    <div className="space-y-2">
                      <div>
                        <span className="text-[10px] text-neutral-400 block mb-1">Font Family</span>
                        <select
                          value={selectedProps.fontFamily || 'Montserrat'}
                          onChange={(e) => updateSelectedProperty('fontFamily', e.target.value)}
                          className="w-full px-2 py-1.5 bg-[#1e1e1e] border border-[#3e3e3e] text-xs text-white rounded-xs outline-none"
                        >
                          {GOOGLE_FONTS.map((font) => (
                            <option key={font} value={font}>
                              {font}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] text-neutral-400 block mb-1">Font Size</span>
                          <div className="flex items-center bg-[#1e1e1e] border border-[#3e3e3e] rounded-xs px-2 py-1">
                            <input
                              type="number"
                              min={6}
                              max={200}
                              value={selectedProps.fontSize || 32}
                              onChange={(e) =>
                                updateSelectedProperty('fontSize', parseInt(e.target.value) || 12)
                              }
                              className="w-full bg-transparent font-mono text-white outline-none"
                            />
                            <span className="text-[10px] text-neutral-500">pt</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-neutral-400 block mb-1">Tracking</span>
                          <div className="flex items-center bg-[#1e1e1e] border border-[#3e3e3e] rounded-xs px-2 py-1">
                            <input
                              type="number"
                              min={-100}
                              max={1000}
                              value={selectedProps.charSpacing || 0}
                              onChange={(e) =>
                                updateSelectedProperty('charSpacing', parseInt(e.target.value) || 0)
                              }
                              className="w-full bg-transparent font-mono text-white outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Actions (Duplicate, Delete) */}
                <div className="pt-2 border-t border-[#343434] flex items-center gap-2">
                  <button
                    onClick={duplicateSelected}
                    className="flex-1 py-1.5 bg-[#2f2f2f] hover:bg-[#383838] text-neutral-200 rounded-xs text-[11px] font-medium transition-colors"
                  >
                    Duplicate (Alt+Drag)
                  </button>
                  <button
                    onClick={deleteSelected}
                    className="py-1.5 px-3 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 rounded-xs text-[11px] font-medium transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </>
            ) : (
              /* No selection: Display Artboard Setup shortcuts */
              <div className="space-y-3">
                <div className="p-3 bg-[#1e1e1e] rounded-xs border border-[#3a3a3a] space-y-2">
                  <span className="text-[11px] font-semibold text-neutral-200 block">
                    {artboard.name}
                  </span>
                  <p className="text-[10px] text-neutral-400 leading-relaxed">
                    Select any tool on the left to draw rectangles (M), ellipses (L), or insert
                    text (T).
                  </p>
                  <div className="pt-1 text-[10px] text-[#0d99ff] font-mono">
                    Dimensions: {artboard.width} × {artboard.height} pt
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[10px] text-neutral-400 font-semibold uppercase">
                    Insert Placeholders
                  </span>
                  <div className="grid grid-cols-1 gap-1">
                    {CERTIFICATE_PLACEHOLDERS.slice(0, 4).map((pl) => (
                      <button
                        key={pl.token}
                        onClick={() => {
                          const ctx = useDesigner();
                        }}
                        className="px-2 py-1 bg-[#1e1e1e] hover:bg-[#2d2d2d] rounded-xs border border-[#383838] text-left flex items-center justify-between text-[10px]"
                      >
                        <span className="font-mono text-[#0d99ff]">{pl.token}</span>
                        <span className="text-neutral-500">{pl.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: LAYERS ================= */}
        {activeRightPanel === 'layers' && (
          <div className="space-y-3">
            <div className="pb-2 border-b border-[#343434] flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Layers Hierarchy ({layers.length})
              </span>
            </div>

            <div className="space-y-1">
              {layers.map((layer, idx) => (
                <div
                  key={layer.id}
                  onClick={() => selectLayerObject(layer.objectRef)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded-xs cursor-pointer text-[11px] transition-colors ${
                    layer.isSelected
                      ? 'bg-[#0d99ff]/20 border border-[#0d99ff]/50 text-white'
                      : 'hover:bg-[#2c2c2c] text-neutral-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {/* Visibility Eye */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerVisibility(layer.objectRef);
                      }}
                      className="text-neutral-400 hover:text-white"
                    >
                      {layer.visible ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-neutral-600" />
                      )}
                    </button>

                    {/* Lock Padlock */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerLock(layer.objectRef);
                      }}
                      className="text-neutral-400 hover:text-white"
                    >
                      {layer.locked ? (
                        <Lock className="w-3.5 h-3.5 text-amber-500" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 text-neutral-600" />
                      )}
                    </button>

                    {/* Type Icon */}
                    {layer.type === 'i-text' || layer.type === 'text' ? (
                      <Type className="w-3.5 h-3.5 text-indigo-400" />
                    ) : layer.type === 'circle' || layer.type === 'ellipse' ? (
                      <Circle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Square className="w-3.5 h-3.5 text-amber-400" />
                    )}

                    <span className="truncate max-w-[110px] font-medium">{layer.name}</span>
                  </div>

                  {/* Reorder Buttons */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderLayer(layer.objectRef, 'up');
                      }}
                      className="p-0.5 text-neutral-400 hover:text-white"
                      title="Bring Forward"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderLayer(layer.objectRef, 'down');
                      }}
                      className="p-0.5 text-neutral-400 hover:text-white"
                      title="Send Backward"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}

              {layers.length === 0 && (
                <div className="p-4 text-center text-neutral-500 text-[11px]">
                  No objects on artboard.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: ARTBOARDS ================= */}
        {activeRightPanel === 'artboards' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-[#343434] flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Artboard Setup
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-neutral-400 block mb-1">Standard Preset</span>
                <select
                  value={artboard.preset}
                  onChange={(e) => applyArtboardPreset(e.target.value as any)}
                  className="w-full px-2 py-1.5 bg-[#1e1e1e] border border-[#3e3e3e] text-xs text-white rounded-xs outline-none"
                >
                  {ARTBOARD_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.width}×{p.height})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-neutral-400 block mb-1">Width (pt)</span>
                  <input
                    type="number"
                    value={artboard.width}
                    onChange={(e) =>
                      setArtboard((prev) => ({
                        ...prev,
                        preset: 'custom',
                        width: Math.max(100, parseInt(e.target.value) || 100),
                      }))
                    }
                    className="w-full px-2 py-1 bg-[#1e1e1e] border border-[#3e3e3e] text-xs text-white font-mono rounded-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 block mb-1">Height (pt)</span>
                  <input
                    type="number"
                    value={artboard.height}
                    onChange={(e) =>
                      setArtboard((prev) => ({
                        ...prev,
                        preset: 'custom',
                        height: Math.max(100, parseInt(e.target.value) || 100),
                      }))
                    }
                    className="w-full px-2 py-1 bg-[#1e1e1e] border border-[#3e3e3e] text-xs text-white font-mono rounded-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#343434]">
                <div>
                  <span className="text-[10px] text-neutral-400 block mb-1">Bleed Guide (pt)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={artboard.bleed}
                    onChange={(e) =>
                      setArtboard((prev) => ({
                        ...prev,
                        bleed: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-2 py-1 bg-[#1e1e1e] border border-[#3e3e3e] text-xs text-white font-mono rounded-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 block mb-1">Safe Margin (pt)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={artboard.safeMargin}
                    onChange={(e) =>
                      setArtboard((prev) => ({
                        ...prev,
                        safeMargin: Math.max(0, parseInt(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-2 py-1 bg-[#1e1e1e] border border-[#3e3e3e] text-xs text-white font-mono rounded-xs"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: ALIGN ================= */}
        {activeRightPanel === 'align' && (
          <div className="space-y-4">
            <div className="pb-2 border-b border-[#343434] flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Align to Artboard
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => alignSelected('left')}
                className="py-2 px-2 bg-[#1e1e1e] hover:bg-[#333] border border-[#3e3e3e] rounded-xs flex flex-col items-center justify-center gap-1 text-[10px]"
              >
                <span className="font-semibold">Left</span>
              </button>
              <button
                onClick={() => alignSelected('center')}
                className="py-2 px-2 bg-[#1e1e1e] hover:bg-[#333] border border-[#3e3e3e] rounded-xs flex flex-col items-center justify-center gap-1 text-[10px]"
              >
                <span className="font-semibold">Center H</span>
              </button>
              <button
                onClick={() => alignSelected('right')}
                className="py-2 px-2 bg-[#1e1e1e] hover:bg-[#333] border border-[#3e3e3e] rounded-xs flex flex-col items-center justify-center gap-1 text-[10px]"
              >
                <span className="font-semibold">Right</span>
              </button>
              <button
                onClick={() => alignSelected('top')}
                className="py-2 px-2 bg-[#1e1e1e] hover:bg-[#333] border border-[#3e3e3e] rounded-xs flex flex-col items-center justify-center gap-1 text-[10px]"
              >
                <span className="font-semibold">Top</span>
              </button>
              <button
                onClick={() => alignSelected('middle')}
                className="py-2 px-2 bg-[#1e1e1e] hover:bg-[#333] border border-[#3e3e3e] rounded-xs flex flex-col items-center justify-center gap-1 text-[10px]"
              >
                <span className="font-semibold">Middle V</span>
              </button>
              <button
                onClick={() => alignSelected('bottom')}
                className="py-2 px-2 bg-[#1e1e1e] hover:bg-[#333] border border-[#3e3e3e] rounded-xs flex flex-col items-center justify-center gap-1 text-[10px]"
              >
                <span className="font-semibold">Bottom</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
