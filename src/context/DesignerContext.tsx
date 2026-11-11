import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import * as fabric from 'fabric';
import {
  ToolType,
  ArtboardConfig,
  ArtboardPreset,
  Guide,
  SelectedObjectProperties,
  LayerItem,
} from '../types/designer';
import { ARTBOARD_PRESETS } from '../constants/presets';

interface DesignerContextType {
  // Canvas
  fabricCanvas: fabric.Canvas | null;
  setFabricCanvas: (canvas: fabric.Canvas | null) => void;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;

  // Tool
  tool: ToolType;
  setTool: (tool: ToolType) => void;

  // Artboard
  artboard: ArtboardConfig;
  setArtboard: React.Dispatch<React.SetStateAction<ArtboardConfig>>;
  applyArtboardPreset: (preset: ArtboardPreset) => void;

  // Viewport
  zoom: number;
  pan: { x: number; y: number };
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPan: (pan: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomToFit: () => void;
  zoomToActual: () => void;

  // Colors & Styling
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  activeColorTarget: 'fill' | 'stroke';
  setActiveColorTarget: (target: 'fill' | 'stroke') => void;
  setFillColor: (color: string) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  swapFillStroke: () => void;
  resetFillStroke: () => void;

  // Selection
  selectedProps: SelectedObjectProperties | null;
  selectedCount: number;
  updateSelectedProperty: (prop: string, val: any) => void;

  // Guides & Rulers
  showRulers: boolean;
  setShowRulers: React.Dispatch<React.SetStateAction<boolean>>;
  showGrid: boolean;
  setShowGrid: React.Dispatch<React.SetStateAction<boolean>>;
  showGuides: boolean;
  setShowGuides: React.Dispatch<React.SetStateAction<boolean>>;
  guides: Guide[];
  addGuide: (guide: Omit<Guide, 'id'>) => void;
  removeGuide: (id: string) => void;
  clearGuides: () => void;

  // Cursor & Rulers tracker
  cursorCoords: { x: number; y: number };
  setCursorCoords: (coords: { x: number; y: number }) => void;

  // Right Panel
  activeRightPanel: 'properties' | 'layers' | 'artboards' | 'align';
  setActiveRightPanel: (panel: 'properties' | 'layers' | 'artboards' | 'align') => void;
  rightPanelCollapsed: boolean;
  setRightPanelCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  // Layers list
  layers: LayerItem[];
  refreshLayers: () => void;
  selectLayerObject: (objRef: any) => void;
  toggleLayerVisibility: (objRef: any) => void;
  toggleLayerLock: (objRef: any) => void;
  reorderLayer: (objRef: any, direction: 'up' | 'down') => void;

  // History
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  saveHistoryState: () => void;

  // Object Operations
  deleteSelected: () => void;
  duplicateSelected: () => void;
  bringForward: () => void;
  sendBackward: () => void;
  bringToFront: () => void;
  sendToBack: () => void;
  alignSelected: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;

  // Shortcuts modal
  showShortcutsModal: boolean;
  setShowShortcutsModal: React.Dispatch<React.SetStateAction<boolean>>;
}

const DesignerContext = createContext<DesignerContextType | null>(null);

export const DesignerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fabricCanvas, setFabricCanvas] = useState<fabric.Canvas | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  const [tool, setTool] = useState<ToolType>('select');

  const [artboard, setArtboard] = useState<ArtboardConfig>({
    id: 'artboard-1',
    name: 'Artboard 1',
    preset: 'a4-landscape',
    width: 842,
    height: 595,
    bleed: 9,
    safeMargin: 24,
    backgroundColor: '#ffffff',
  });

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 100, y: 80 });

  // Default Illustrator styling
  const [fillColor, setFillColorState] = useState<string>('#ffffff');
  const [strokeColor, setStrokeColorState] = useState<string>('#000000');
  const [strokeWidth, setStrokeWidthState] = useState<number>(2);
  const [activeColorTarget, setActiveColorTarget] = useState<'fill' | 'stroke'>('fill');

  const [selectedProps, setSelectedProps] = useState<SelectedObjectProperties | null>(null);
  const [selectedCount, setSelectedCount] = useState<number>(0);

  const [showRulers, setShowRulers] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(false);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [guides, setGuides] = useState<Guide[]>([
    { id: 'g-1', orientation: 'horizontal', position: 24 },
    { id: 'g-2', orientation: 'vertical', position: 24 },
  ]);

  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [activeRightPanel, setActiveRightPanel] = useState<'properties' | 'layers' | 'artboards' | 'align'>('properties');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(false);

  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);

  // Undo/Redo history
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  const saveHistoryState = useCallback(() => {
    if (!fabricCanvas) return;
    try {
      const json = JSON.stringify(fabricCanvas.toJSON());
      // Truncate future states if we performed an action after undo
      const newHistory = historyRef.current.slice(0, historyIndexRef.current + 1);
      newHistory.push(json);
      if (newHistory.length > 40) newHistory.shift();
      historyRef.current = newHistory;
      historyIndexRef.current = newHistory.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
    } catch {
      // ignore
    }
  }, [fabricCanvas]);

  const undo = useCallback(() => {
    if (!fabricCanvas || historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const jsonStr = historyRef.current[historyIndexRef.current];
    if (jsonStr) {
      fabricCanvas.loadFromJSON(JSON.parse(jsonStr)).then(() => {
        fabricCanvas.renderAll();
        setCanUndo(historyIndexRef.current > 0);
        setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      });
    }
  }, [fabricCanvas]);

  const redo = useCallback(() => {
    if (!fabricCanvas || historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const jsonStr = historyRef.current[historyIndexRef.current];
    if (jsonStr) {
      fabricCanvas.loadFromJSON(JSON.parse(jsonStr)).then(() => {
        fabricCanvas.renderAll();
        setCanUndo(true);
        setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
      });
    }
  }, [fabricCanvas]);

  const applyArtboardPreset = useCallback(
    (preset: ArtboardPreset) => {
      const found = ARTBOARD_PRESETS.find((p) => p.id === preset);
      if (found) {
        setArtboard((prev) => ({
          ...prev,
          preset,
          width: found.width,
          height: found.height,
        }));
      }
    },
    []
  );

  // Zoom handlers
  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(16, Number((z * 1.25).toFixed(2))));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.1, Number((z / 1.25).toFixed(2))));
  }, []);

  const zoomToActual = useCallback(() => {
    setZoom(1);
  }, []);

  const zoomToFit = useCallback(() => {
    if (!canvasContainerRef.current) return;
    const containerW = canvasContainerRef.current.clientWidth - 120;
    const containerH = canvasContainerRef.current.clientHeight - 120;
    if (containerW <= 0 || containerH <= 0) return;

    const scaleX = containerW / artboard.width;
    const scaleY = containerH / artboard.height;
    const fitScale = Math.min(scaleX, scaleY, 2.5);
    const rounded = Number(Math.max(0.1, fitScale).toFixed(2));
    setZoom(rounded);

    // Center in container
    const centerX = Math.round((canvasContainerRef.current.clientWidth - artboard.width * rounded) / 2);
    const centerY = Math.round((canvasContainerRef.current.clientHeight - artboard.height * rounded) / 2);
    setPan({ x: Math.max(40, centerX), y: Math.max(40, centerY) });
  }, [artboard.width, artboard.height]);

  // Color management
  const setFillColor = useCallback(
    (color: string) => {
      setFillColorState(color);
      if (fabricCanvas) {
        const activeObjs = fabricCanvas.getActiveObjects();
        activeObjs.forEach((obj) => {
          obj.set('fill', color);
        });
        if (activeObjs.length > 0) {
          fabricCanvas.renderAll();
          saveHistoryState();
          setSelectedProps((prev) => (prev ? { ...prev, fill: color } : null));
        }
      }
    },
    [fabricCanvas, saveHistoryState]
  );

  const setStrokeColor = useCallback(
    (color: string) => {
      setStrokeColorState(color);
      if (fabricCanvas) {
        const activeObjs = fabricCanvas.getActiveObjects();
        activeObjs.forEach((obj) => {
          obj.set('stroke', color);
        });
        if (activeObjs.length > 0) {
          fabricCanvas.renderAll();
          saveHistoryState();
          setSelectedProps((prev) => (prev ? { ...prev, stroke: color } : null));
        }
      }
    },
    [fabricCanvas, saveHistoryState]
  );

  const setStrokeWidth = useCallback(
    (width: number) => {
      setStrokeWidthState(width);
      if (fabricCanvas) {
        const activeObjs = fabricCanvas.getActiveObjects();
        activeObjs.forEach((obj) => {
          obj.set('strokeWidth', width);
        });
        if (activeObjs.length > 0) {
          fabricCanvas.renderAll();
          saveHistoryState();
          setSelectedProps((prev) => (prev ? { ...prev, strokeWidth: width } : null));
        }
      }
    },
    [fabricCanvas, saveHistoryState]
  );

  const swapFillStroke = useCallback(() => {
    const oldFill = fillColor;
    const oldStroke = strokeColor;
    setFillColorState(oldStroke);
    setStrokeColorState(oldFill);
    if (fabricCanvas) {
      const activeObjs = fabricCanvas.getActiveObjects();
      activeObjs.forEach((obj) => {
        obj.set({ fill: oldStroke, stroke: oldFill });
      });
      if (activeObjs.length > 0) {
        fabricCanvas.renderAll();
        saveHistoryState();
        setSelectedProps((prev) => (prev ? { ...prev, fill: oldStroke, stroke: oldFill } : null));
      }
    }
  }, [fillColor, strokeColor, fabricCanvas, saveHistoryState]);

  const resetFillStroke = useCallback(() => {
    setFillColorState('#ffffff');
    setStrokeColorState('#000000');
    setStrokeWidthState(2);
    if (fabricCanvas) {
      const activeObjs = fabricCanvas.getActiveObjects();
      activeObjs.forEach((obj) => {
        obj.set({ fill: '#ffffff', stroke: '#000000', strokeWidth: 2 });
      });
      if (activeObjs.length > 0) {
        fabricCanvas.renderAll();
        saveHistoryState();
        setSelectedProps((prev) =>
          prev ? { ...prev, fill: '#ffffff', stroke: '#000000', strokeWidth: 2 } : null
        );
      }
    }
  }, [fabricCanvas, saveHistoryState]);

  // Guides
  const addGuide = useCallback((guide: Omit<Guide, 'id'>) => {
    const id = `g-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setGuides((prev) => [...prev, { ...guide, id }]);
  }, []);

  const removeGuide = useCallback((id: string) => {
    setGuides((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const clearGuides = useCallback(() => {
    setGuides([]);
  }, []);

  // Selection updates
  const updateSelectedProperty = useCallback(
    (prop: string, val: any) => {
      if (!fabricCanvas) return;
      const activeObjs = fabricCanvas.getActiveObjects();
      if (activeObjs.length === 0) return;

      activeObjs.forEach((obj) => {
        obj.set(prop as any, val);
        if (prop === 'width' || prop === 'height') {
          obj.setCoords();
        }
      });
      fabricCanvas.renderAll();
      setSelectedProps((prev) => (prev ? { ...prev, [prop]: val } : null));
      saveHistoryState();
    },
    [fabricCanvas, saveHistoryState]
  );

  // Layers refresh
  const refreshLayers = useCallback(() => {
    if (!fabricCanvas) return;
    const objs = fabricCanvas.getObjects();
    const active = fabricCanvas.getActiveObjects();
    const newLayers: LayerItem[] = objs
      .map((obj: any, idx: number) => {
        let name = obj.name || `${obj.type.charAt(0).toUpperCase() + obj.type.slice(1)} ${idx + 1}`;
        if (obj.type === 'i-text' || obj.type === 'text') {
          const textPreview = (obj.text || '').substring(0, 14);
          name = textPreview ? `"${textPreview}"` : 'Text';
        }
        return {
          id: obj.id || `layer-${idx}`,
          name,
          type: obj.type,
          visible: obj.visible !== false,
          locked: !!(obj.lockMovementX && obj.lockMovementY),
          isSelected: active.includes(obj),
          objectRef: obj,
        };
      })
      .reverse(); // Topmost first
    setLayers(newLayers);
  }, [fabricCanvas]);

  const selectLayerObject = useCallback(
    (objRef: any) => {
      if (!fabricCanvas) return;
      fabricCanvas.discardActiveObject();
      fabricCanvas.setActiveObject(objRef);
      fabricCanvas.renderAll();
    },
    [fabricCanvas]
  );

  const toggleLayerVisibility = useCallback(
    (objRef: any) => {
      if (!fabricCanvas) return;
      objRef.set('visible', !objRef.visible);
      fabricCanvas.renderAll();
      refreshLayers();
    },
    [fabricCanvas, refreshLayers]
  );

  const toggleLayerLock = useCallback(
    (objRef: any) => {
      if (!fabricCanvas) return;
      const isLocked = !!(objRef.lockMovementX && objRef.lockMovementY);
      objRef.set({
        lockMovementX: !isLocked,
        lockMovementY: !isLocked,
        lockRotation: !isLocked,
        lockScalingX: !isLocked,
        lockScalingY: !isLocked,
        hasControls: isLocked,
      });
      fabricCanvas.renderAll();
      refreshLayers();
    },
    [fabricCanvas, refreshLayers]
  );

  const reorderLayer = useCallback(
    (objRef: any, direction: 'up' | 'down') => {
      if (!fabricCanvas) return;
      if (direction === 'up') {
        fabricCanvas.bringObjectForward(objRef);
      } else {
        fabricCanvas.sendObjectBackwards(objRef);
      }
      fabricCanvas.renderAll();
      refreshLayers();
      saveHistoryState();
    },
    [fabricCanvas, refreshLayers, saveHistoryState]
  );

  // Object Operations
  const deleteSelected = useCallback(() => {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObjects();
    if (active.length === 0) return;
    active.forEach((obj) => fabricCanvas.remove(obj));
    fabricCanvas.discardActiveObject();
    fabricCanvas.renderAll();
    refreshLayers();
    saveHistoryState();
  }, [fabricCanvas, refreshLayers, saveHistoryState]);

  const duplicateSelected = useCallback(() => {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObjects();
    if (active.length === 0) return;

    active.forEach((obj) => {
      obj.clone().then((cloned: any) => {
        cloned.set({
          left: (obj.left || 0) + 20,
          top: (obj.top || 0) + 20,
          evented: true,
        });
        fabricCanvas.add(cloned);
        fabricCanvas.setActiveObject(cloned);
      });
    });
    fabricCanvas.renderAll();
    refreshLayers();
    saveHistoryState();
  }, [fabricCanvas, refreshLayers, saveHistoryState]);

  const bringForward = useCallback(() => {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObjects();
    active.forEach((obj) => fabricCanvas.bringObjectForward(obj));
    fabricCanvas.renderAll();
    refreshLayers();
    saveHistoryState();
  }, [fabricCanvas, refreshLayers, saveHistoryState]);

  const sendBackward = useCallback(() => {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObjects();
    active.forEach((obj) => fabricCanvas.sendObjectBackwards(obj));
    fabricCanvas.renderAll();
    refreshLayers();
    saveHistoryState();
  }, [fabricCanvas, refreshLayers, saveHistoryState]);

  const bringToFront = useCallback(() => {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObjects();
    active.forEach((obj) => fabricCanvas.bringObjectToFront(obj));
    fabricCanvas.renderAll();
    refreshLayers();
    saveHistoryState();
  }, [fabricCanvas, refreshLayers, saveHistoryState]);

  const sendToBack = useCallback(() => {
    if (!fabricCanvas) return;
    const active = fabricCanvas.getActiveObjects();
    active.forEach((obj) => fabricCanvas.sendObjectToBack(obj));
    fabricCanvas.renderAll();
    refreshLayers();
    saveHistoryState();
  }, [fabricCanvas, refreshLayers, saveHistoryState]);

  const alignSelected = useCallback(
    (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
      if (!fabricCanvas) return;
      const active = fabricCanvas.getActiveObjects();
      if (active.length === 0) return;

      const artboardW = artboard.width;
      const artboardH = artboard.height;

      active.forEach((obj) => {
        const bound = obj.getBoundingRect();
        switch (alignment) {
          case 'left':
            obj.set('left', 0);
            break;
          case 'center':
            obj.set('left', (artboardW - bound.width) / 2);
            break;
          case 'right':
            obj.set('left', artboardW - bound.width);
            break;
          case 'top':
            obj.set('top', 0);
            break;
          case 'middle':
            obj.set('top', (artboardH - bound.height) / 2);
            break;
          case 'bottom':
            obj.set('top', artboardH - bound.height);
            break;
        }
        obj.setCoords();
      });
      fabricCanvas.renderAll();
      saveHistoryState();
    },
    [fabricCanvas, artboard.width, artboard.height, saveHistoryState]
  );

  // Listen to Fabric canvas selection events
  useEffect(() => {
    if (!fabricCanvas) return;

    const syncSelection = () => {
      const active = fabricCanvas.getActiveObjects();
      setSelectedCount(active.length);
      if (active.length === 1) {
        const obj = active[0] as any;
        setSelectedProps({
          type: obj.type,
          left: Math.round(obj.left || 0),
          top: Math.round(obj.top || 0),
          width: Math.round((obj.width || 0) * (obj.scaleX || 1)),
          height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
          scaleX: obj.scaleX || 1,
          scaleY: obj.scaleY || 1,
          angle: Math.round(obj.angle || 0),
          fill: typeof obj.fill === 'string' ? obj.fill : '#ffffff',
          stroke: typeof obj.stroke === 'string' ? obj.stroke : '#000000',
          strokeWidth: obj.strokeWidth || 0,
          opacity: obj.opacity !== undefined ? obj.opacity : 1,
          text: obj.text,
          fontFamily: obj.fontFamily || 'Montserrat',
          fontSize: obj.fontSize || 32,
          fontWeight: obj.fontWeight || 'normal',
          fontStyle: obj.fontStyle || 'normal',
          textAlign: obj.textAlign || 'left',
          charSpacing: obj.charSpacing || 0,
          lineHeight: obj.lineHeight || 1.16,
          rx: obj.rx || 0,
          ry: obj.ry || 0,
        });
        if (typeof obj.fill === 'string') setFillColorState(obj.fill);
        if (typeof obj.stroke === 'string') setStrokeColorState(obj.stroke);
        if (typeof obj.strokeWidth === 'number') setStrokeWidthState(obj.strokeWidth);
      } else {
        setSelectedProps(null);
      }
      refreshLayers();
    };

    fabricCanvas.on('selection:created', syncSelection);
    fabricCanvas.on('selection:updated', syncSelection);
    fabricCanvas.on('selection:cleared', () => {
      setSelectedCount(0);
      setSelectedProps(null);
      refreshLayers();
    });
    fabricCanvas.on('object:modified', () => {
      syncSelection();
      saveHistoryState();
    });

    return () => {
      fabricCanvas.off('selection:created', syncSelection);
      fabricCanvas.off('selection:updated', syncSelection);
      fabricCanvas.off('selection:cleared');
      fabricCanvas.off('object:modified');
    };
  }, [fabricCanvas, refreshLayers, saveHistoryState]);

  return (
    <DesignerContext.Provider
      value={{
        fabricCanvas,
        setFabricCanvas,
        canvasContainerRef,
        tool,
        setTool,
        artboard,
        setArtboard,
        applyArtboardPreset,
        zoom,
        pan,
        setZoom,
        setPan,
        zoomIn,
        zoomOut,
        zoomToFit,
        zoomToActual,
        fillColor,
        strokeColor,
        strokeWidth,
        activeColorTarget,
        setActiveColorTarget,
        setFillColor,
        setStrokeColor,
        setStrokeWidth,
        swapFillStroke,
        resetFillStroke,
        selectedProps,
        selectedCount,
        updateSelectedProperty,
        showRulers,
        setShowRulers,
        showGrid,
        setShowGrid,
        showGuides,
        setShowGuides,
        guides,
        addGuide,
        removeGuide,
        clearGuides,
        cursorCoords,
        setCursorCoords,
        activeRightPanel,
        setActiveRightPanel,
        rightPanelCollapsed,
        setRightPanelCollapsed,
        layers,
        refreshLayers,
        selectLayerObject,
        toggleLayerVisibility,
        toggleLayerLock,
        reorderLayer,
        canUndo,
        canRedo,
        undo,
        redo,
        saveHistoryState,
        deleteSelected,
        duplicateSelected,
        bringForward,
        sendBackward,
        bringToFront,
        sendToBack,
        alignSelected,
        showShortcutsModal,
        setShowShortcutsModal,
      }}
    >
      {children}
    </DesignerContext.Provider>
  );
};

export const useDesigner = () => {
  const ctx = useContext(DesignerContext);
  if (!ctx) throw new Error('useDesigner must be used within DesignerProvider');
  return ctx;
};
