import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Move,
  Type,
  Image as ImageIcon,
  QrCode,
  PenTool,
  Lock,
  Unlock,
  Check,
  Grid,
  Magnet,
  RotateCcw
} from 'lucide-react';
import { CertificateTemplate, TemplateField, FieldType } from '../../types';
import { calculateTextLayout, drawImageOnCanvas, drawSignatureSublines, drawSmartSentenceOnCanvas } from '../../utils/canvasRenderer';
import { getFormattedFieldValue, resolveDynamicPlaceholders } from '../../utils/formatters';
import { drawQrOnCanvas } from '../../utils/qrGenerator';

export type WorkspaceTool = 'select' | 'text' | 'image' | 'qr' | 'signature' | 'pan';

interface FieldEditorCanvasProps {
  template: CertificateTemplate;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  onUpdateField: (field: TemplateField) => void;
  onAddField: (newField: TemplateField) => void;
  onDeleteField: (id: string) => void;
  onDuplicateField: (field: TemplateField) => void;
  activeTool: WorkspaceTool;
  onSelectTool: (tool: WorkspaceTool) => void;
  isLivePreview: boolean;
  snapToGrid: boolean;
  showGuides: boolean;
}

type DragMode = 'none' | 'draw' | 'move' | 'resize' | 'pan';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface SnapGuide {
  type: 'x' | 'y';
  pos: number; // in pixels
}

export const FieldEditorCanvas: React.FC<FieldEditorCanvasProps> = ({
  template,
  selectedFieldId,
  onSelectField,
  onUpdateField,
  onAddField,
  onDeleteField,
  onDuplicateField,
  activeTool,
  onSelectTool,
  isLivePreview,
  snapToGrid,
  showGuides,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Zoom & Pan
  const [zoom, setZoom] = useState<number>(0.65);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);

  // Interaction state
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [drawBox, setDrawBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [fieldInitialPos, setFieldInitialPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);

  // Loaded background image
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);

  // Load template image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImageObj(img);
    img.src = template.cleanDataUrl || template.previewDataUrl || URL.createObjectURL(template.blob);
  }, [template.cleanDataUrl, template.previewDataUrl, template.blob]);

  // Auto-fit zoom on mount or template dimension change
  const handleFitToScreen = useCallback(() => {
    if (containerRef.current && template.width && template.height) {
      const containerW = containerRef.current.clientWidth - 64;
      const containerH = containerRef.current.clientHeight - 64;
      const scaleX = containerW / template.width;
      const scaleY = containerH / template.height;
      const fitZoom = Math.min(scaleX, scaleY, 1.0);
      setZoom(Math.max(0.2, Number(fitZoom.toFixed(2))));
      setPanOffset({ x: 0, y: 0 });
    }
  }, [template.width, template.height]);

  useEffect(() => {
    handleFitToScreen();
  }, [handleFitToScreen]);

  // Spacebar toggle for hand pan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          setIsSpacePressed(true);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Keyboard shortcuts (Delete, Ctrl+D duplicate, Arrow nudge)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedFieldId || isLivePreview) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      const field = template.fields.find((f) => f.id === selectedFieldId);
      if (!field || field.locked) return;

      // Duplicate: Ctrl+D or Cmd+D
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onDuplicateField(field);
        return;
      }

      // Delete: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDeleteField(field.id);
        return;
      }

      // Nudge with arrow keys
      const step = e.shiftKey ? 1.0 : 0.2; // in percent
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onUpdateField({ ...field, y: Math.max(0, Number((field.y - step).toFixed(2))) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onUpdateField({ ...field, y: Math.min(100 - field.height, Number((field.y + step).toFixed(2))) });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onUpdateField({ ...field, x: Math.max(0, Number((field.x - step).toFixed(2))) });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onUpdateField({ ...field, x: Math.min(100 - field.width, Number((field.x + step).toFixed(2))) });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFieldId, template.fields, onUpdateField, onDeleteField, onDuplicateField, isLivePreview]);

  // Main Canvas Rendering
  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageObj) return;

    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext('2d')!;

    // 1. Draw base artwork
    ctx.clearRect(0, 0, template.width, template.height);
    ctx.drawImage(imageObj, 0, 0, template.width, template.height);

    // 2. Draw all fields
    for (const field of template.fields) {
      if (field.hidden || field.width <= 0 || field.height <= 0) continue;

      const isSelected = field.id === selectedFieldId && !isLivePreview;
      const boxX = (field.x / 100) * template.width;
      const boxY = (field.y / 100) * template.height;
      const boxW = (field.width / 100) * template.width;
      const boxH = (field.height / 100) * template.height;

      ctx.save();

      // Render content inside box
      if (field.type === 'qr') {
        // Draw sample QR code
        await drawQrOnCanvas(ctx, field.defaultValue || 'https://verify.certigen.org?id=CERT-2026-0001', boxX, boxY, boxW, boxH, {
          fgColor: field.qrConfig?.fgColor || '#000000',
          bgColor: field.qrConfig?.bgColor || '#ffffff',
          margin: field.qrConfig?.margin ?? 2,
        });
      } else if (field.type === 'image') {
        if (field.defaultValue && (field.defaultValue.startsWith('data:') || field.defaultValue.startsWith('http') || field.defaultValue.startsWith('/'))) {
          await drawImageOnCanvas(ctx, field.defaultValue, field, template.width, template.height);
        } else {
          // Placeholder badge
          ctx.beginPath();
          ctx.rect(boxX, boxY, boxW, boxH);
          ctx.clip();
          ctx.fillStyle = 'rgba(2, 132, 199, 0.08)';
          ctx.fillRect(boxX, boxY, boxW, boxH);
          ctx.fillStyle = '#0284c7';
          ctx.font = `600 ${Math.max(14, Math.round(boxH * 0.18))}px "Montserrat", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`[ ${field.label} ]`, boxX + boxW / 2, boxY + boxH / 2);
        }
      } else if (field.type === 'signature') {
        if (field.defaultValue && field.defaultValue.startsWith('data:image/')) {
          await drawImageOnCanvas(ctx, field.defaultValue, field, template.width, template.height);
        } else {
          // Sample script signature text
          ctx.beginPath();
          ctx.rect(boxX, boxY, boxW, boxH);
          ctx.clip();
          ctx.font = `400 ${Math.max(24, Math.round(boxH * 0.45))}px "Great Vibes", cursive`;
          ctx.fillStyle = field.color || '#002C6A';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(field.defaultValue || 'Authorized Signature', boxX + boxW / 2, boxY + boxH * 0.4);
        }
        drawSignatureSublines(ctx, field, template.width, template.height);
      } else {
        // Text field: Smart Sentence vs Regular Field
        if (field.contentMode === 'smart_sentence' && field.smartSentenceConfig) {
          drawSmartSentenceOnCanvas(
            ctx,
            field,
            {},
            template.width,
            template.height,
            !isLivePreview
          );
        } else {
          ctx.beginPath();
          ctx.rect(boxX, boxY, boxW, boxH);
          ctx.clip();

          let sampleVal = getFormattedFieldValue(field, field.defaultValue || field.label, 0);
          if (field.prefix) sampleVal = `${field.prefix}${sampleVal}`;
          if (field.suffix) sampleVal = `${sampleVal}${field.suffix}`;

          const { lines, fontSize, lineHeight } = calculateTextLayout(ctx, sampleVal, field, boxW, boxH);
          ctx.font = `${field.italic ? 'italic ' : ''}${field.fontWeight} ${fontSize}px "${field.fontFamily}", "Noto Sans Tibetan", sans-serif`;
          ctx.fillStyle = field.color || '#0f172a';

          const totalH = lines.length * lineHeight;
          let startY = boxY + (boxH - totalH) / 2 + fontSize * 0.85;

          lines.forEach((line) => {
            let startX = boxX;
            if (field.align === 'center') {
              ctx.textAlign = 'center';
              startX = boxX + boxW / 2;
            } else if (field.align === 'right') {
              ctx.textAlign = 'right';
              startX = boxX + boxW - 4;
            } else {
              ctx.textAlign = 'left';
              startX = boxX + 4;
            }
            ctx.fillText(line, startX, startY);
            startY += lineHeight;
          });
        }
      }

      ctx.restore();

      // Workspace Box Overlays (Hidden in Live Preview)
      if (!isLivePreview) {
        ctx.save();
        if (isSelected) {
          // Selected box: solid brand border & light glow
          ctx.strokeStyle = '#4f46e5';
          ctx.lineWidth = 2.5 / zoom;
          ctx.setLineDash([]);
          ctx.strokeRect(boxX, boxY, boxW, boxH);
          ctx.fillStyle = 'rgba(79, 70, 229, 0.05)';
          ctx.fillRect(boxX, boxY, boxW, boxH);

          // Type Icon + Field Label Badge
          const typeTag = field.contentMode === 'smart_sentence' ? 'SMART SENTENCE' : field.type.toUpperCase();
          const badgeText = `[${typeTag}] ${field.label} (${field.key})`;
          const badgeFontSize = Math.max(11, Math.round(12 / zoom));
          ctx.font = `600 ${badgeFontSize}px "Plus Jakarta Sans", sans-serif`;
          const badgeMetrics = ctx.measureText(badgeText);
          const badgeW = badgeMetrics.width + 14;
          const badgeH = Math.max(20, Math.round(22 / zoom));

          ctx.fillStyle = '#4f46e5';
          ctx.fillRect(boxX, Math.max(0, boxY - badgeH), badgeW, badgeH);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, boxX + 7, Math.max(badgeH / 2, boxY - badgeH / 2));

          // 8 Resize Handles
          const handleSize = Math.max(7, Math.round(8 / zoom));
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#4f46e5';
          ctx.lineWidth = 2 / zoom;

          const handles = [
            { x: boxX, y: boxY }, // nw
            { x: boxX + boxW / 2, y: boxY }, // n
            { x: boxX + boxW, y: boxY }, // ne
            { x: boxX + boxW, y: boxY + boxH / 2 }, // e
            { x: boxX + boxW, y: boxY + boxH }, // se
            { x: boxX + boxW / 2, y: boxY + boxH }, // s
            { x: boxX, y: boxY + boxH }, // sw
            { x: boxX, y: boxY + boxH / 2 }, // w
          ];

          handles.forEach((h) => {
            ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
            ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
          });
        } else {
          // Unselected: Clean dashed outline & subtle tag
          ctx.strokeStyle = field.locked ? '#94a3b8' : '#6366f1';
          ctx.lineWidth = 1.5 / zoom;
          ctx.setLineDash([6 / zoom, 4 / zoom]);
          ctx.strokeRect(boxX, boxY, boxW, boxH);

          // Subtle tag
          const tagFontSize = Math.max(10, Math.round(11 / zoom));
          ctx.font = `500 ${tagFontSize}px "Plus Jakarta Sans", sans-serif`;
          const tagText = `${field.type === 'qr' ? 'QR: ' : field.type === 'signature' ? 'Sig: ' : ''}${field.label}`;
          const tagW = ctx.measureText(tagText).width + 8;
          const tagH = Math.max(16, Math.round(18 / zoom));

          ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
          ctx.fillRect(boxX, Math.max(0, boxY - tagH), tagW, tagH);
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(tagText, boxX + 4, Math.max(tagH / 2, boxY - tagH / 2));
        }
        ctx.restore();
      }
    }

    // 3. Draw temporary rectangle when drawing a new box
    if (drawBox && dragMode === 'draw') {
      ctx.save();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
      ctx.fillRect(drawBox.x, drawBox.y, drawBox.w, drawBox.h);
      ctx.strokeRect(drawBox.x, drawBox.y, drawBox.w, drawBox.h);
      ctx.restore();
    }

    // 4. Draw snap alignment guides
    if (showGuides && activeGuides.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#ec4899'; // magenta snap line
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);

      activeGuides.forEach((g) => {
        ctx.beginPath();
        if (g.type === 'x') {
          ctx.moveTo(g.pos, 0);
          ctx.lineTo(g.pos, template.height);
        } else {
          ctx.moveTo(0, g.pos);
          ctx.lineTo(template.width, g.pos);
        }
        ctx.stroke();
      });
      ctx.restore();
    }
  }, [template, imageObj, selectedFieldId, isLivePreview, zoom, drawBox, dragMode, showGuides, activeGuides]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Coordinate Conversion helper from mouse event to template coords
  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = template.width / rect.width;
    const scaleY = template.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Find resize handle near mouse
  const getHandleAtCoords = (coords: { x: number; y: number }, field: TemplateField): ResizeHandle | null => {
    const boxX = (field.x / 100) * template.width;
    const boxY = (field.y / 100) * template.height;
    const boxW = (field.width / 100) * template.width;
    const boxH = (field.height / 100) * template.height;
    const threshold = Math.max(14, 14 / zoom);

    const near = (hx: number, hy: number) =>
      Math.abs(coords.x - hx) <= threshold && Math.abs(coords.y - hy) <= threshold;

    if (near(boxX, boxY)) return 'nw';
    if (near(boxX + boxW / 2, boxY)) return 'n';
    if (near(boxX + boxW, boxY)) return 'ne';
    if (near(boxX + boxW, boxY + boxH / 2)) return 'e';
    if (near(boxX + boxW, boxY + boxH)) return 'se';
    if (near(boxX + boxW / 2, boxY + boxH)) return 's';
    if (near(boxX, boxY + boxH)) return 'sw';
    if (near(boxX, boxY + boxH / 2)) return 'w';

    return null;
  };

  // Mouse Down
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isLivePreview) return;

    // Pan mode or Spacebar held or middle mouse button
    if (activeTool === 'pan' || isSpacePressed || e.button === 1) {
      setDragMode('pan');
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    if (e.button !== 0) return; // left click only
    const coords = getCanvasCoords(e);

    // If a tool like Text, Image, QR, or Signature is selected, start drawing that box
    if (activeTool !== 'select') {
      setDragMode('draw');
      setDragStart(coords);
      setDrawBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
      return;
    }

    // Check if clicking resize handle on selected field
    if (selectedFieldId) {
      const selectedField = template.fields.find((f) => f.id === selectedFieldId);
      if (selectedField && !selectedField.locked) {
        const handle = getHandleAtCoords(coords, selectedField);
        if (handle) {
          setDragMode('resize');
          setActiveHandle(handle);
          setDragStart(coords);
          setFieldInitialPos({
            x: selectedField.x,
            y: selectedField.y,
            w: selectedField.width,
            h: selectedField.height,
          });
          return;
        }
      }
    }

    // Check if clicking inside an existing field box (reverse for top-most)
    const clicked = [...template.fields].reverse().find((field) => {
      if (field.hidden) return false;
      const bx = (field.x / 100) * template.width;
      const by = (field.y / 100) * template.height;
      const bw = (field.width / 100) * template.width;
      const bh = (field.height / 100) * template.height;
      return coords.x >= bx && coords.x <= bx + bw && coords.y >= by && coords.y <= by + bh;
    });

    if (clicked) {
      onSelectField(clicked.id);
      if (!clicked.locked) {
        setDragMode('move');
        setDragStart(coords);
        setFieldInitialPos({
          x: clicked.x,
          y: clicked.y,
          w: clicked.width,
          h: clicked.height,
        });
      }
    } else {
      // Clicked on empty canvas: deselect or start freehand box drawing
      onSelectField(null);
      setDragMode('draw');
      setDragStart(coords);
      setDrawBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
    }
  };

  // Mouse Move
  const handleMouseMove = (e: React.MouseEvent) => {
    // Pan movement
    if (dragMode === 'pan' && panStart) {
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (dragMode === 'none' || !dragStart) return;
    const coords = getCanvasCoords(e);

    // 1. Draw new box
    if (dragMode === 'draw') {
      const x = Math.min(dragStart.x, coords.x);
      const y = Math.min(dragStart.y, coords.y);
      const w = Math.abs(coords.x - dragStart.x);
      const h = Math.abs(coords.y - dragStart.y);
      setDrawBox({ x, y, w, h });
      return;
    }

    if (!fieldInitialPos || !selectedFieldId) return;
    const field = template.fields.find((f) => f.id === selectedFieldId);
    if (!field || field.locked) return;

    const deltaX = coords.x - dragStart.x;
    const deltaY = coords.y - dragStart.y;
    const deltaXPercent = (deltaX / template.width) * 100;
    const deltaYPercent = (deltaY / template.height) * 100;

    // 2. Move Box
    if (dragMode === 'move') {
      let nextX = Math.max(0, Math.min(100 - fieldInitialPos.w, fieldInitialPos.x + deltaXPercent));
      let nextY = Math.max(0, Math.min(100 - fieldInitialPos.h, fieldInitialPos.y + deltaYPercent));

      // Snap guides calculation
      const guides: SnapGuide[] = [];
      const currentCenterX = (nextX + fieldInitialPos.w / 2) * (template.width / 100);
      const currentCenterY = (nextY + fieldInitialPos.h / 2) * (template.height / 100);

      // Snap to page center
      if (Math.abs(currentCenterX - template.width / 2) < 15) {
        nextX = (template.width / 2 - (fieldInitialPos.w * template.width) / 200) / (template.width / 100);
        guides.push({ type: 'x', pos: template.width / 2 });
      }
      if (Math.abs(currentCenterY - template.height / 2) < 15) {
        nextY = (template.height / 2 - (fieldInitialPos.h * template.height) / 200) / (template.height / 100);
        guides.push({ type: 'y', pos: template.height / 2 });
      }

      // Snap to grid if enabled
      if (snapToGrid) {
        nextX = Math.round(nextX);
        nextY = Math.round(nextY);
      } else {
        nextX = Number(nextX.toFixed(2));
        nextY = Number(nextY.toFixed(2));
      }

      setActiveGuides(guides);
      onUpdateField({
        ...field,
        x: nextX,
        y: nextY,
      });
      return;
    }

    // 3. Resize Box
    if (dragMode === 'resize' && activeHandle) {
      let { x, y, w, h } = fieldInitialPos;

      if (activeHandle.includes('e')) w = Math.max(2, fieldInitialPos.w + deltaXPercent);
      if (activeHandle.includes('s')) h = Math.max(1.5, fieldInitialPos.h + deltaYPercent);
      if (activeHandle.includes('w')) {
        const proposedW = fieldInitialPos.w - deltaXPercent;
        if (proposedW >= 2) {
          w = proposedW;
          x = fieldInitialPos.x + deltaXPercent;
        }
      }
      if (activeHandle.includes('n')) {
        const proposedH = fieldInitialPos.h - deltaYPercent;
        if (proposedH >= 1.5) {
          h = proposedH;
          y = fieldInitialPos.y + deltaYPercent;
        }
      }

      if (snapToGrid) {
        x = Math.round(x);
        y = Math.round(y);
        w = Math.round(w);
        h = Math.round(h);
      } else {
        x = Number(x.toFixed(2));
        y = Number(y.toFixed(2));
        w = Number(w.toFixed(2));
        h = Number(h.toFixed(2));
      }

      onUpdateField({
        ...field,
        x: Math.max(0, x),
        y: Math.max(0, y),
        width: Math.min(100 - x, w),
        height: Math.min(100 - y, h),
      });
    }
  };

  // Mouse Up: commit drawn box or end drag
  const handleMouseUp = () => {
    setActiveGuides([]);

    if (dragMode === 'draw' && drawBox) {
      const minDimensionPx = 18;
      let finalW = drawBox.w;
      let finalH = drawBox.h;
      let finalX = drawBox.x;
      let finalY = drawBox.y;

      // If user just clicked without dragging, create a nicely sized default box
      if (finalW < minDimensionPx && finalH < minDimensionPx) {
        if (activeTool === 'qr') {
          finalW = template.width * 0.12;
          finalH = template.width * 0.12;
        } else if (activeTool === 'image') {
          finalW = template.width * 0.14;
          finalH = template.width * 0.14;
        } else if (activeTool === 'signature') {
          finalW = template.width * 0.22;
          finalH = template.height * 0.12;
        } else {
          finalW = template.width * 0.35;
          finalH = template.height * 0.08;
        }
        finalX = Math.max(0, drawBox.x - finalW / 2);
        finalY = Math.max(0, drawBox.y - finalH / 2);
      }

      const xPercent = Number(((finalX / template.width) * 100).toFixed(2));
      const yPercent = Number(((finalY / template.height) * 100).toFixed(2));
      const wPercent = Number(((finalW / template.width) * 100).toFixed(2));
      const hPercent = Number(((finalH / template.height) * 100).toFixed(2));

      const count = template.fields.length + 1;
      const targetType: FieldType = (activeTool === 'select' || activeTool === 'pan') ? 'text' : activeTool;

      const newField: TemplateField = {
        id: `field-${Date.now()}`,
        key: `${targetType}_${count}`,
        label: targetType === 'qr' ? 'Verification QR' : targetType === 'signature' ? 'Authorized Signature' : targetType === 'image' ? 'Recipient Photo' : `Text Field ${count}`,
        type: targetType,
        required: true,
        defaultValue: targetType === 'qr' ? 'https://verify.certigen.org?id=CERT-2026-0001' : targetType === 'signature' ? 'Authorized Signatory' : `Sample ${targetType}`,
        x: Math.max(0, Math.min(95, xPercent)),
        y: Math.max(0, Math.min(95, yPercent)),
        width: Math.min(100 - xPercent, wPercent),
        height: Math.min(100 - yPercent, hPercent),
        fontFamily: 'Montserrat',
        fontSize: Math.max(14, Math.round(finalH * 0.5)),
        fontWeight: '500',
        color: '#0f172a',
        align: 'center',
        autoShrink: true,
        transform: 'none',
        multiline: targetType === 'text' && hPercent > 8,
        qrConfig: targetType === 'qr' ? { contentType: 'verification_url', baseUrl: 'https://verify.certigen.org?id=', fgColor: '#000000', bgColor: '#ffffff', margin: 2 } : undefined,
        signatureConfig: targetType === 'signature' ? { allowedMethods: { upload: true, draw: true, type: true }, hasUnderline: true, signerName: 'Signatory Name', signerTitle: 'Authorized Chair' } : undefined,
        imageConfig: targetType === 'image' ? { fit: 'contain', borderRadius: 'rounded', allowCrop: true } : undefined,
      };

      onAddField(newField);
      onSelectField(newField.id);
      onSelectTool('select'); // return to pointer tool
    }

    setDragMode('none');
    setActiveHandle(null);
    setDragStart(null);
    setPanStart(null);
    setDrawBox(null);
    setFieldInitialPos(null);
  };

  // Cursor style based on active tool or hovered handle
  const getCursorStyle = () => {
    if (activeTool === 'pan' || isSpacePressed) return dragMode === 'pan' ? 'grabbing' : 'grab';
    if (dragMode === 'resize') return `${activeHandle}-resize`;
    if (dragMode === 'move') return 'move';
    if (activeTool !== 'select') return 'crosshair';
    return 'default';
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.05 : -0.05;
          setZoom((z) => Math.min(2.0, Math.max(0.2, Number((z + delta).toFixed(2)))));
        }
      }}
      className="flex-1 h-full overflow-hidden relative flex items-center justify-center bg-slate-900 select-none"
      style={{ cursor: getCursorStyle() }}
    >
      {/* Background Canvas Workspace */}
      <div
        className="transition-transform duration-75 relative"
        style={{
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          width: template.width,
          height: template.height,
        }}
      >
        <canvas
          ref={canvasRef}
          className="shadow-2xl rounded-xs ring-1 ring-slate-800 bg-white"
        />
      </div>

      {/* Floating Bottom Controls (Zoom, Fit, Pan Indicator) */}
      <div className="absolute bottom-4 left-6 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl z-20 text-xs text-white">
        <button
          onClick={() => setZoom((z) => Math.max(0.2, Number((z - 0.1).toFixed(2))))}
          title="Zoom Out (Ctrl+-)"
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <span className="font-mono text-[11px] px-1 font-semibold text-slate-300">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(2.0, Number((z + 0.1).toFixed(2))))}
          title="Zoom In (Ctrl++)"
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <div className="h-4 w-px bg-slate-800 mx-0.5" />
        <button
          onClick={handleFitToScreen}
          title="Fit Canvas to Screen"
          className="px-2 py-1 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white text-[11px] font-medium flex items-center gap-1 transition-colors"
        >
          <Maximize2 className="w-3 h-3" />
          Fit
        </button>
      </div>

      {/* Workspace Status pill at top */}
      <div className="absolute top-4 left-6 flex items-center gap-2 z-10 pointer-events-none">
        <div className="px-3 py-1 bg-slate-900/80 backdrop-blur-md border border-slate-800 text-[11px] font-medium text-slate-300 rounded-lg shadow-md flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{template.width} × {template.height}px</span>
          <span className="text-slate-500">·</span>
          <span>{template.fields.filter(f => !f.hidden).length} Placeholders</span>
        </div>
      </div>
    </div>
  );
};
