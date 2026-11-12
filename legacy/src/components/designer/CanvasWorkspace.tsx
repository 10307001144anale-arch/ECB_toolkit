import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as fabric from 'fabric';
import { useDesigner } from '../../context/DesignerContext';
import { Ruler } from './Ruler';

export const CanvasWorkspace: React.FC = () => {
  const {
    fabricCanvas,
    setFabricCanvas,
    canvasContainerRef,
    tool,
    setTool,
    artboard,
    zoom,
    pan,
    setZoom,
    setPan,
    fillColor,
    strokeColor,
    strokeWidth,
    showRulers,
    showGrid,
    showGuides,
    guides,
    addGuide,
    cursorCoords,
    setCursorCoords,
    saveHistoryState,
    refreshLayers,
  } = useDesigner();

  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const isPanningRef = useRef<boolean>(false);
  const startPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isSpacePressedRef = useRef<boolean>(false);

  // Shape drawing state
  const isDrawingShapeRef = useRef<boolean>(false);
  const shapeStartPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeShapeRef = useRef<any>(null);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 1000,
    height: 700,
  });

  // Track container dimensions for rulers and centering
  useEffect(() => {
    const updateSize = () => {
      if (canvasContainerRef.current) {
        setContainerSize({
          width: canvasContainerRef.current.clientWidth,
          height: canvasContainerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [canvasContainerRef]);

  // Initial center on mount
  useEffect(() => {
    if (canvasContainerRef.current) {
      const containerW = canvasContainerRef.current.clientWidth;
      const containerH = canvasContainerRef.current.clientHeight;
      const initialPanX = Math.max(40, Math.round((containerW - artboard.width * zoom) / 2));
      const initialPanY = Math.max(40, Math.round((containerH - artboard.height * zoom) / 2));
      setPan({ x: initialPanX, y: initialPanY });
    }
  }, [artboard.width, artboard.height]);

  // Initialize Fabric.js Canvas
  useEffect(() => {
    if (!canvasElRef.current) return;

    const canvas = new fabric.Canvas(canvasElRef.current, {
      width: artboard.width,
      height: artboard.height,
      backgroundColor: artboard.backgroundColor,
      preserveObjectStacking: true,
      selection: tool === 'select',
      stopContextMenu: true,
      fireRightClick: true,
    });

    // Custom control styling (Illustrator aesthetic: blue outline, square white handles with blue border)
    fabric.FabricObject.ownDefaults = {
      ...fabric.FabricObject.ownDefaults,
      cornerColor: '#ffffff',
      cornerStrokeColor: '#0d99ff',
      borderColor: '#0d99ff',
      cornerSize: 8,
      transparentCorners: false,
      borderScaleFactor: 1.5,
      padding: 0,
    };

    setFabricCanvas(canvas);

    // Initial starter sample items for testing if blank
    const headline = new fabric.IText('CERTIFICATE OF RECOGNITION', {
      left: artboard.width / 2 - 280,
      top: 140,
      fontFamily: 'Playfair Display',
      fontSize: 34,
      fontWeight: 'bold',
      fill: '#002c6a',
      textAlign: 'center',
    });

    const subline = new fabric.IText('THIS CERTIFICATE IS PROUDLY PRESENTED TO', {
      left: artboard.width / 2 - 200,
      top: 220,
      fontFamily: 'Montserrat',
      fontSize: 14,
      fontWeight: 500,
      fill: '#64748b',
      charSpacing: 100,
    });

    const namePlaceholder = new fabric.IText('{{recipient_name}}', {
      left: artboard.width / 2 - 180,
      top: 280,
      fontFamily: 'Great Vibes',
      fontSize: 54,
      fill: '#f59119',
      textAlign: 'center',
    });

    const goldBorder = new fabric.Rect({
      left: 30,
      top: 30,
      width: artboard.width - 60,
      height: artboard.height - 60,
      fill: 'transparent',
      stroke: '#002c6a',
      strokeWidth: 4,
      rx: 4,
      ry: 4,
      selectable: true,
    });

    const innerBorder = new fabric.Rect({
      left: 38,
      top: 38,
      width: artboard.width - 76,
      height: artboard.height - 76,
      fill: 'transparent',
      stroke: '#f59119',
      strokeWidth: 1.5,
      selectable: true,
    });

    canvas.add(goldBorder, innerBorder, headline, subline, namePlaceholder);
    canvas.renderAll();
    refreshLayers();
    saveHistoryState();

    return () => {
      canvas.dispose();
      setFabricCanvas(null);
    };
  }, [artboard.id]);

  // Sync canvas dimensions when artboard size changes
  useEffect(() => {
    if (fabricCanvas) {
      fabricCanvas.setDimensions({
        width: artboard.width,
        height: artboard.height,
      });
      fabricCanvas.renderAll();
    }
  }, [artboard.width, artboard.height, fabricCanvas]);

  // Sync tool mode with fabric canvas selection ability
  useEffect(() => {
    if (!fabricCanvas) return;
    fabricCanvas.selection = tool === 'select';
    fabricCanvas.defaultCursor =
      tool === 'hand'
        ? 'grab'
        : tool === 'zoom'
        ? 'zoom-in'
        : tool === 'type'
        ? 'text'
        : tool === 'rectangle' || tool === 'ellipse'
        ? 'crosshair'
        : 'default';
  }, [tool, fabricCanvas]);

  // Handle Spacebar Panning shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpacePressedRef.current && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        isSpacePressedRef.current = true;
        if (canvasContainerRef.current) {
          canvasContainerRef.current.style.cursor = 'grab';
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        if (canvasContainerRef.current) {
          canvasContainerRef.current.style.cursor = '';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [canvasContainerRef]);

  // Mouse wheel for Zoom & Pan
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom centered on cursor
        e.preventDefault();
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
        const newZoom = Number(Math.max(0.1, Math.min(16, zoom * zoomFactor)).toFixed(2));

        // Adjust pan to keep cursor focal point stationary
        const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
        const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

        setZoom(newZoom);
        setPan({ x: newPanX, y: newPanY });
      } else {
        // Smooth scroll / pan
        setPan((prev) => ({
          x: prev.x - e.deltaX,
          y: prev.y - e.deltaY,
        }));
      }
    },
    [zoom, pan, setZoom, setPan, canvasContainerRef]
  );

  // Mouse interaction on the workspace wrapper (Panning, Zooming, Drawing)
  const handleWorkspaceMouseDown = (e: React.MouseEvent) => {
    // Check if middle click or spacebar or Hand tool is active
    if (e.button === 1 || isSpacePressedRef.current || tool === 'hand') {
      isPanningRef.current = true;
      startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      if (canvasContainerRef.current) {
        canvasContainerRef.current.style.cursor = 'grabbing';
      }
      return;
    }

    // Zoom tool click
    if (tool === 'zoom') {
      const rect = canvasContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const isZoomOut = e.altKey;
      const zoomFactor = isZoomOut ? 0.8 : 1.25;
      const newZoom = Number(Math.max(0.1, Math.min(16, zoom * zoomFactor)).toFixed(2));

      const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
      const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    }
  };

  const handleWorkspaceMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      setPan({
        x: e.clientX - startPanRef.current.x,
        y: e.clientY - startPanRef.current.y,
      });
      return;
    }

    // Update cursor coordinates relative to Artboard origin (0, 0)
    const artboardEl = document.getElementById('artboard-inner');
    if (artboardEl) {
      const rect = artboardEl.getBoundingClientRect();
      const artboardX = Math.round((e.clientX - rect.left) / zoom);
      const artboardY = Math.round((e.clientY - rect.top) / zoom);
      setCursorCoords({ x: artboardX, y: artboardY });
    }
  };

  const handleWorkspaceMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      if (canvasContainerRef.current) {
        canvasContainerRef.current.style.cursor = isSpacePressedRef.current ? 'grab' : '';
      }
    }
  };

  // Fabric mouse events for Tool interactions (Rectangle, Ellipse, Type)
  useEffect(() => {
    if (!fabricCanvas) return;

    const handleFabricMouseDown = (opt: any) => {
      if (isSpacePressedRef.current || tool === 'hand' || tool === 'zoom') return;
      const pointer = fabricCanvas.getViewportPoint(opt.e);

      // Tool 1: Rectangle (M)
      if (tool === 'rectangle') {
        isDrawingShapeRef.current = true;
        shapeStartPointRef.current = { x: pointer.x, y: pointer.y };

        const rect = new fabric.Rect({
          left: pointer.x,
          top: pointer.y,
          width: 0,
          height: 0,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          rx: 0,
          ry: 0,
        });

        activeShapeRef.current = rect;
        fabricCanvas.add(rect);
      }

      // Tool 2: Ellipse / Circle (L)
      else if (tool === 'ellipse') {
        isDrawingShapeRef.current = true;
        shapeStartPointRef.current = { x: pointer.x, y: pointer.y };

        const ellipse = new fabric.Ellipse({
          left: pointer.x,
          top: pointer.y,
          rx: 0,
          ry: 0,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        });

        activeShapeRef.current = ellipse;
        fabricCanvas.add(ellipse);
      }

      // Tool 3: Type Tool (T)
      else if (tool === 'type') {
        // If clicked on an existing text object, don't spawn new text
        if (opt.target && (opt.target.type === 'i-text' || opt.target.type === 'text')) {
          opt.target.enterEditing();
          return;
        }

        const text = new fabric.IText('Type Something...', {
          left: pointer.x,
          top: pointer.y,
          fontFamily: 'Montserrat',
          fontSize: 32,
          fill: fillColor === '#ffffff' && strokeColor === '#000000' ? '#0f172a' : fillColor,
        });

        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        fabricCanvas.renderAll();
        refreshLayers();
        saveHistoryState();
        setTool('select');
      }
    };

    const handleFabricMouseMove = (opt: any) => {
      if (!isDrawingShapeRef.current || !activeShapeRef.current) return;
      const pointer = fabricCanvas.getViewportPoint(opt.e);
      const start = shapeStartPointRef.current;
      const isShift = opt.e.shiftKey;

      let width = Math.abs(pointer.x - start.x);
      let height = Math.abs(pointer.y - start.y);

      if (isShift) {
        const size = Math.max(width, height);
        width = size;
        height = size;
      }

      const left = pointer.x < start.x ? start.x - width : start.x;
      const top = pointer.y < start.y ? start.y - height : start.y;

      if (tool === 'rectangle') {
        activeShapeRef.current.set({
          left,
          top,
          width,
          height,
        });
      } else if (tool === 'ellipse') {
        activeShapeRef.current.set({
          left,
          top,
          rx: width / 2,
          ry: height / 2,
        });
      }

      fabricCanvas.renderAll();
    };

    const handleFabricMouseUp = () => {
      if (isDrawingShapeRef.current && activeShapeRef.current) {
        isDrawingShapeRef.current = false;
        // Check if tiny click without drag
        if ((activeShapeRef.current.width || 0) < 5 && (activeShapeRef.current.height || 0) < 5) {
          activeShapeRef.current.set({
            width: tool === 'rectangle' ? 120 : undefined,
            height: tool === 'rectangle' ? 80 : undefined,
            rx: tool === 'ellipse' ? 50 : undefined,
            ry: tool === 'ellipse' ? 50 : undefined,
          });
        }
        activeShapeRef.current.setCoords();
        fabricCanvas.setActiveObject(activeShapeRef.current);
        fabricCanvas.renderAll();
        refreshLayers();
        saveHistoryState();
        activeShapeRef.current = null;
        setTool('select');
      }
    };

    fabricCanvas.on('mouse:down', handleFabricMouseDown);
    fabricCanvas.on('mouse:move', handleFabricMouseMove);
    fabricCanvas.on('mouse:up', handleFabricMouseUp);

    return () => {
      fabricCanvas.off('mouse:down', handleFabricMouseDown);
      fabricCanvas.off('mouse:move', handleFabricMouseMove);
      fabricCanvas.off('mouse:up', handleFabricMouseUp);
    };
  }, [fabricCanvas, tool, fillColor, strokeColor, strokeWidth, refreshLayers, saveHistoryState, setTool]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#181818] overflow-hidden select-none relative">
      {/* Top Ruler Bar */}
      {showRulers && (
        <div className="flex h-5 w-full bg-[#262626] border-b border-[#383838] z-20 shrink-0">
          {/* Top-left corner box linking rulers */}
          <div
            className="w-5 h-5 bg-[#2a2a2a] border-r border-[#383838] flex items-center justify-center text-[9px] text-neutral-400 font-mono"
            title="px / pt"
          >
            px
          </div>
          <div className="flex-1 overflow-hidden">
            <Ruler
              orientation="horizontal"
              length={containerSize.width}
              offset={pan.x}
              zoom={zoom}
              cursorPos={cursorCoords.x}
              onAddGuide={(pos) => addGuide({ orientation: 'horizontal', position: pos })}
            />
          </div>
        </div>
      )}

      {/* Main Workspace Area: Left Ruler + Canvas Pasteboard */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Ruler Bar */}
        {showRulers && (
          <div className="w-5 h-full bg-[#262626] border-r border-[#383838] z-20 shrink-0 overflow-hidden">
            <Ruler
              orientation="vertical"
              length={containerSize.height}
              offset={pan.y}
              zoom={zoom}
              cursorPos={cursorCoords.y}
              onAddGuide={(pos) => addGuide({ orientation: 'vertical', position: pos })}
            />
          </div>
        )}

        {/* Infinite Pasteboard Container */}
        <div
          ref={canvasContainerRef}
          onMouseDown={handleWorkspaceMouseDown}
          onMouseMove={handleWorkspaceMouseMove}
          onMouseUp={handleWorkspaceMouseUp}
          onWheel={handleWheel}
          className="flex-1 h-full overflow-hidden relative bg-[#1c1c1c]"
          style={{
            backgroundImage: showGrid
              ? 'radial-gradient(circle, #333333 1px, transparent 1px)'
              : undefined,
            backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        >
          {/* The Artboard Container positioned via Pan and Zoom */}
          <div
            id="artboard-inner"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: artboard.width,
              height: artboard.height,
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: '0 0',
              boxShadow: '0 12px 35px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px #3a3a3a',
            }}
            className="transition-shadow"
          >
            {/* Artboard Title Tag (Illustrator style above artboard) */}
            <div
              className="absolute -top-6 left-0 text-[10px] font-mono text-neutral-400 select-none whitespace-nowrap flex items-center gap-1.5"
              style={{
                transform: `scale(${Math.max(0.6, 1 / zoom)})`,
                transformOrigin: '0 100%',
              }}
            >
              <span className="font-semibold text-neutral-200">{artboard.name}</span>
              <span>·</span>
              <span>
                {artboard.width} × {artboard.height} px
              </span>
            </div>

            {/* Bleed Guideline (Red dashed outline outside artboard) */}
            {artboard.bleed > 0 && (
              <div
                className="absolute border border-dashed border-rose-500/60 pointer-events-none"
                style={{
                  left: -artboard.bleed,
                  top: -artboard.bleed,
                  width: artboard.width + artboard.bleed * 2,
                  height: artboard.height + artboard.bleed * 2,
                }}
              />
            )}

            {/* Safe Margin Guideline (Cyan dashed line inside artboard) */}
            {artboard.safeMargin > 0 && (
              <div
                className="absolute border border-dashed border-cyan-500/50 pointer-events-none"
                style={{
                  left: artboard.safeMargin,
                  top: artboard.safeMargin,
                  width: artboard.width - artboard.safeMargin * 2,
                  height: artboard.height - artboard.safeMargin * 2,
                }}
              />
            )}

            {/* Interactive Guides overlaid on artboard */}
            {showGuides &&
              guides.map((g) => (
                <div
                  key={g.id}
                  className="absolute pointer-events-none z-10"
                  style={
                    g.orientation === 'horizontal'
                      ? {
                          left: -2000,
                          right: -2000,
                          top: g.position,
                          height: 1,
                          backgroundColor: '#00c3ff',
                        }
                      : {
                          top: -2000,
                          bottom: -2000,
                          left: g.position,
                          width: 1,
                          backgroundColor: '#00c3ff',
                        }
                  }
                />
              ))}

            {/* Fabric.js Canvas Canvas element */}
            <canvas ref={canvasElRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
