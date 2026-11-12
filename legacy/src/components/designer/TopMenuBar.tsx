import React, { useState, useRef, useEffect } from 'react';
import {
  FolderOpen,
  Save,
  Download,
  Undo2,
  Redo2,
  Trash2,
  Copy,
  Layers,
  HelpCircle,
  Eye,
  Check,
  ChevronRight,
  Maximize2,
  Sparkles,
} from 'lucide-react';
import { useDesigner } from '../../context/DesignerContext';
import { ARTBOARD_PRESETS, CERTIFICATE_PLACEHOLDERS } from '../../constants/presets';
import * as fabric from 'fabric';

export const TopMenuBar: React.FC = () => {
  const {
    fabricCanvas,
    artboard,
    applyArtboardPreset,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomToActual,
    showRulers,
    setShowRulers,
    showGrid,
    setShowGrid,
    showGuides,
    setShowGuides,
    clearGuides,
    canUndo,
    canRedo,
    undo,
    redo,
    deleteSelected,
    duplicateSelected,
    bringForward,
    sendBackward,
    bringToFront,
    sendToBack,
    alignSelected,
    setShowShortcutsModal,
    saveHistoryState,
    refreshLayers,
    setTool,
  } = useDesigner();

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close open dropdown when clicked outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleMenu = (menuName: string) => {
    setActiveMenu((prev) => (prev === menuName ? null : menuName));
  };

  const handleMouseEnter = (menuName: string) => {
    if (activeMenu !== null) {
      setActiveMenu(menuName);
    }
  };

  // Export PNG
  const handleExportPng = () => {
    if (!fabricCanvas) return;
    const dataUrl = fabricCanvas.toDataURL({
      format: 'png',
      multiplier: 2, // 2x high resolution
    });
    const link = document.createElement('a');
    link.download = `${artboard.name.toLowerCase().replace(/\s+/g, '_')}_design.png`;
    link.href = dataUrl;
    link.click();
    setActiveMenu(null);
  };

  // Export SVG
  const handleExportSvg = () => {
    if (!fabricCanvas) return;
    const svgStr = fabricCanvas.toSVG();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `${artboard.name.toLowerCase().replace(/\s+/g, '_')}_design.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setActiveMenu(null);
  };

  // Insert Certificate Placeholder text
  const handleInsertPlaceholder = (token: string) => {
    if (!fabricCanvas) return;
    const text = new fabric.IText(token, {
      left: artboard.width / 2 - 120,
      top: artboard.height / 2 - 20,
      fontFamily: 'Montserrat',
      fontSize: 36,
      fill: '#002c6a',
      fontWeight: 'bold',
    });
    fabricCanvas.add(text);
    fabricCanvas.setActiveObject(text);
    fabricCanvas.renderAll();
    refreshLayers();
    saveHistoryState();
    setActiveMenu(null);
  };

  return (
    <div
      ref={menuBarRef}
      className="h-8 bg-[#202020] border-b border-[#323232] px-2 flex items-center justify-between text-xs text-neutral-300 select-none z-30 shrink-0 font-sans"
    >
      {/* Left: App Logo & Menus */}
      <div className="flex items-center gap-1">
        {/* Illustrator Badge */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#ff9a00]/10 border border-[#ff9a00]/30 mr-1.5 cursor-pointer"
          title="Certificate Designer Workspace (Illustrator Edition)"
        >
          <span className="w-4 h-4 rounded bg-[#ff7c00] text-black font-extrabold text-[10px] flex items-center justify-center font-mono">
            Ai
          </span>
          <span className="text-[11px] font-bold tracking-tight text-neutral-200">
            CertiDesign
          </span>
        </div>

        {/* Menu 1: File */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('file')}
            onMouseEnter={() => handleMouseEnter('file')}
            className={`px-2.5 py-1 rounded text-[11px] hover:bg-[#333333] transition-colors ${
              activeMenu === 'file' ? 'bg-[#0d99ff] text-white' : ''
            }`}
          >
            File
          </button>
          {activeMenu === 'file' && (
            <div className="absolute left-0 top-full mt-0.5 w-60 bg-[#282828] border border-[#3e3e3e] shadow-2xl py-1 z-50 text-[11px] rounded-xs">
              <div className="px-3 py-1 text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
                Artboard Presets
              </div>
              {ARTBOARD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    applyArtboardPreset(p.id);
                    setActiveMenu(null);
                  }}
                  className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
                >
                  <span>{p.label}</span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {p.width}×{p.height}
                  </span>
                </button>
              ))}
              <div className="my-1 border-t border-[#383838]" />
              <button
                onClick={handleExportPng}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Export as High-Res PNG</span>
                <span className="text-[10px] text-neutral-400">2x</span>
              </button>
              <button
                onClick={handleExportSvg}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Export as Vector SVG</span>
                <span className="text-[10px] text-neutral-400 font-mono">.svg</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu 2: Edit */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('edit')}
            onMouseEnter={() => handleMouseEnter('edit')}
            className={`px-2.5 py-1 rounded text-[11px] hover:bg-[#333333] transition-colors ${
              activeMenu === 'edit' ? 'bg-[#0d99ff] text-white' : ''
            }`}
          >
            Edit
          </button>
          {activeMenu === 'edit' && (
            <div className="absolute left-0 top-full mt-0.5 w-52 bg-[#282828] border border-[#3e3e3e] shadow-2xl py-1 z-50 text-[11px] rounded-xs">
              <button
                onClick={() => {
                  undo();
                  setActiveMenu(null);
                }}
                disabled={!canUndo}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white disabled:opacity-40 flex items-center justify-between transition-colors text-left"
              >
                <span>Undo</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+Z</span>
              </button>
              <button
                onClick={() => {
                  redo();
                  setActiveMenu(null);
                }}
                disabled={!canRedo}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white disabled:opacity-40 flex items-center justify-between transition-colors text-left"
              >
                <span>Redo</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+Y</span>
              </button>
              <div className="my-1 border-t border-[#383838]" />
              <button
                onClick={() => {
                  duplicateSelected();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Duplicate</span>
                <span className="text-[10px] text-neutral-400 font-mono">Alt+Drag</span>
              </button>
              <button
                onClick={() => {
                  deleteSelected();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left text-rose-300"
              >
                <span>Delete</span>
                <span className="text-[10px] text-neutral-400 font-mono">Del</span>
              </button>
              <div className="my-1 border-t border-[#383838]" />
              <button
                onClick={() => {
                  if (fabricCanvas) {
                    fabricCanvas.discardActiveObject();
                    const sel = new fabric.ActiveSelection(fabricCanvas.getObjects(), {
                      canvas: fabricCanvas,
                    });
                    fabricCanvas.setActiveObject(sel);
                    fabricCanvas.renderAll();
                  }
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Select All</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+A</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu 3: Object */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('object')}
            onMouseEnter={() => handleMouseEnter('object')}
            className={`px-2.5 py-1 rounded text-[11px] hover:bg-[#333333] transition-colors ${
              activeMenu === 'object' ? 'bg-[#0d99ff] text-white' : ''
            }`}
          >
            Object
          </button>
          {activeMenu === 'object' && (
            <div className="absolute left-0 top-full mt-0.5 w-56 bg-[#282828] border border-[#3e3e3e] shadow-2xl py-1 z-50 text-[11px] rounded-xs">
              <button
                onClick={() => {
                  bringToFront();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Bring to Front</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+Shift+]</span>
              </button>
              <button
                onClick={() => {
                  bringForward();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Bring Forward</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+]</span>
              </button>
              <button
                onClick={() => {
                  sendBackward();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Send Backward</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+[</span>
              </button>
              <button
                onClick={() => {
                  sendToBack();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Send to Back</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+Shift+[</span>
              </button>
              <div className="my-1 border-t border-[#383838]" />
              <div className="px-3 py-1 text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
                Align to Artboard
              </div>
              <button
                onClick={() => {
                  alignSelected('center');
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Center Horizontally</span>
              </button>
              <button
                onClick={() => {
                  alignSelected('middle');
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Center Vertically</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu 4: Type */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('type')}
            onMouseEnter={() => handleMouseEnter('type')}
            className={`px-2.5 py-1 rounded text-[11px] hover:bg-[#333333] transition-colors ${
              activeMenu === 'type' ? 'bg-[#0d99ff] text-white' : ''
            }`}
          >
            Type
          </button>
          {activeMenu === 'type' && (
            <div className="absolute left-0 top-full mt-0.5 w-64 bg-[#282828] border border-[#3e3e3e] shadow-2xl py-1 z-50 text-[11px] rounded-xs">
              <button
                onClick={() => {
                  setTool('type');
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Add Text Box</span>
                <span className="text-[10px] text-neutral-400 font-mono">T</span>
              </button>
              <div className="my-1 border-t border-[#383838]" />
              <div className="px-3 py-1 text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
                Insert Smart Placeholders
              </div>
              {CERTIFICATE_PLACEHOLDERS.map((pl) => (
                <button
                  key={pl.token}
                  onClick={() => handleInsertPlaceholder(pl.token)}
                  className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
                >
                  <span className="font-mono text-[#0d99ff] hover:text-white">
                    {pl.token}
                  </span>
                  <span className="text-[10px] text-neutral-400">{pl.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Menu 5: View */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('view')}
            onMouseEnter={() => handleMouseEnter('view')}
            className={`px-2.5 py-1 rounded text-[11px] hover:bg-[#333333] transition-colors ${
              activeMenu === 'view' ? 'bg-[#0d99ff] text-white' : ''
            }`}
          >
            View
          </button>
          {activeMenu === 'view' && (
            <div className="absolute left-0 top-full mt-0.5 w-56 bg-[#282828] border border-[#3e3e3e] shadow-2xl py-1 z-50 text-[11px] rounded-xs">
              <button
                onClick={() => {
                  zoomIn();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Zoom In</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl++</span>
              </button>
              <button
                onClick={() => {
                  zoomOut();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Zoom Out</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+-</span>
              </button>
              <button
                onClick={() => {
                  zoomToFit();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Fit Artboard in Window</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+0</span>
              </button>
              <button
                onClick={() => {
                  zoomToActual();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Actual Size (100%)</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+1</span>
              </button>
              <div className="my-1 border-t border-[#383838]" />
              <button
                onClick={() => {
                  setShowRulers((prev) => !prev);
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>{showRulers ? '✓ Show Rulers' : '  Show Rulers'}</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+R</span>
              </button>
              <button
                onClick={() => {
                  setShowGrid((prev) => !prev);
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>{showGrid ? '✓ Show Grid' : '  Show Grid'}</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+'</span>
              </button>
              <button
                onClick={() => {
                  setShowGuides((prev) => !prev);
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>{showGuides ? '✓ Show Guides' : '  Show Guides'}</span>
                <span className="text-[10px] text-neutral-400 font-mono">Ctrl+;</span>
              </button>
              <button
                onClick={() => {
                  clearGuides();
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left text-neutral-400"
              >
                <span>Clear All Guides</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu 6: Help */}
        <div className="relative">
          <button
            onClick={() => toggleMenu('help')}
            onMouseEnter={() => handleMouseEnter('help')}
            className={`px-2.5 py-1 rounded text-[11px] hover:bg-[#333333] transition-colors ${
              activeMenu === 'help' ? 'bg-[#0d99ff] text-white' : ''
            }`}
          >
            Help
          </button>
          {activeMenu === 'help' && (
            <div className="absolute left-0 top-full mt-0.5 w-52 bg-[#282828] border border-[#3e3e3e] shadow-2xl py-1 z-50 text-[11px] rounded-xs">
              <button
                onClick={() => {
                  setShowShortcutsModal(true);
                  setActiveMenu(null);
                }}
                className="w-full px-3 py-1.5 hover:bg-[#0d99ff] hover:text-white flex items-center justify-between transition-colors text-left"
              >
                <span>Keyboard Shortcuts</span>
                <span className="text-[10px] text-neutral-400 font-mono">?</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right Quick Controls (Fit, Undo, Redo, Help) */}
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="p-1 hover:bg-[#333333] rounded disabled:opacity-30 text-neutral-300"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="p-1 hover:bg-[#333333] rounded disabled:opacity-30 text-neutral-300"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>
        <div className="h-3 w-px bg-[#3e3e3e] mx-1" />
        <button
          onClick={zoomToFit}
          title="Fit Artboard in Window (Ctrl+0)"
          className="p-1 hover:bg-[#333333] rounded text-neutral-300"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setShowShortcutsModal(true)}
          title="Keyboard Shortcuts Cheat Sheet (?)"
          className="p-1 hover:bg-[#333333] rounded text-neutral-300"
        >
          <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />
        </button>
      </div>
    </div>
  );
};
