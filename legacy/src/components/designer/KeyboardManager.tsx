import React, { useEffect } from 'react';
import { useDesigner } from '../../context/DesignerContext';

export const KeyboardManager: React.FC = () => {
  const {
    tool,
    setTool,
    swapFillStroke,
    resetFillStroke,
    deleteSelected,
    duplicateSelected,
    undo,
    redo,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomToActual,
    setShowRulers,
    setShowGuides,
    setShowGrid,
    setShowShortcutsModal,
    fabricCanvas,
    saveHistoryState,
  } = useDesigner();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing inside an input, textarea, or text editing mode
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement;

      // Check if fabric text is actively being edited
      const isTextEditing =
        fabricCanvas?.getActiveObject() &&
        (fabricCanvas.getActiveObject() as any).isEditing;

      if (isInput || isTextEditing) {
        // If Escape pressed while editing text, exit editing
        if (e.key === 'Escape' && isTextEditing) {
          (fabricCanvas?.getActiveObject() as any).exitEditing();
          fabricCanvas?.renderAll();
        }
        return;
      }

      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      // 1. Tool Shortcuts (Single Keys)
      if (!ctrlOrMeta && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'v':
            e.preventDefault();
            setTool('select');
            break;
          case 'a':
            e.preventDefault();
            setTool('direct-select');
            break;
          case 'm':
            e.preventDefault();
            setTool('rectangle');
            break;
          case 'l':
            e.preventDefault();
            setTool('ellipse');
            break;
          case 't':
            e.preventDefault();
            setTool('type');
            break;
          case 'h':
            e.preventDefault();
            setTool('hand');
            break;
          case 'z':
            e.preventDefault();
            setTool('zoom');
            break;
          case 'd':
            e.preventDefault();
            resetFillStroke();
            break;
          case '?':
            e.preventDefault();
            setShowShortcutsModal(true);
            break;
          case 'delete':
          case 'backspace':
            e.preventDefault();
            deleteSelected();
            break;
        }

        // Shift + X (Swap Fill and Stroke)
        if (e.shiftKey && e.key.toLowerCase() === 'x') {
          e.preventDefault();
          swapFillStroke();
        }

        // Arrow Key Nudge
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          if (!fabricCanvas) return;
          const active = fabricCanvas.getActiveObjects();
          if (active.length > 0) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            active.forEach((obj) => {
              if (e.key === 'ArrowUp') obj.top = (obj.top || 0) - step;
              if (e.key === 'ArrowDown') obj.top = (obj.top || 0) + step;
              if (e.key === 'ArrowLeft') obj.left = (obj.left || 0) - step;
              if (e.key === 'ArrowRight') obj.left = (obj.left || 0) + step;
              obj.setCoords();
            });
            fabricCanvas.renderAll();
            saveHistoryState();
          }
        }
      }

      // 2. Ctrl / Cmd Combinations
      if (ctrlOrMeta) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          if (e.shiftKey) redo();
          else undo();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        } else if (e.key === '0') {
          e.preventDefault();
          zoomToFit();
        } else if (e.key === '1') {
          e.preventDefault();
          zoomToActual();
        } else if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          zoomIn();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          zoomOut();
        } else if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          setShowRulers((prev) => !prev);
        } else if (e.key === ';') {
          e.preventDefault();
          setShowGuides((prev) => !prev);
        } else if (e.key === "'") {
          e.preventDefault();
          setShowGrid((prev) => !prev);
        } else if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          duplicateSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    tool,
    setTool,
    swapFillStroke,
    resetFillStroke,
    deleteSelected,
    duplicateSelected,
    undo,
    redo,
    zoomIn,
    zoomOut,
    zoomToFit,
    zoomToActual,
    setShowRulers,
    setShowGuides,
    setShowGrid,
    setShowShortcutsModal,
    fabricCanvas,
    saveHistoryState,
  ]);

  return null;
};
