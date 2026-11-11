import React, { useRef, useState, useEffect } from 'react';
import { PenTool, Upload, Type, Check, X, RotateCcw, Sparkles } from 'lucide-react';
import { ECB_COLORS } from '../../utils/formatters';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSignature: (signatureDataUrl: string, applyToAll: boolean) => void;
  initialSignature?: string;
  isBulkMode?: boolean;
}

type SignatureTab = 'draw' | 'upload' | 'type';

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  onSaveSignature,
  initialSignature,
  isBulkMode = false,
}) => {
  const [tab, setTab] = useState<SignatureTab>('draw');
  const [applyToAll, setApplyToAll] = useState<boolean>(true);

  // Draw state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [penColor, setPenColor] = useState<string>(ECB_COLORS.navy);
  const [penWidth, setPenWidth] = useState<number>(2.5);
  const [strokes, setStrokes] = useState<ImageData[]>([]);
  const [hasDrawn, setHasDrawn] = useState<boolean>(false);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [removeBg, setRemoveBg] = useState<boolean>(true);

  // Type state
  const [typedName, setTypedName] = useState<string>('Karma Wangchuk');
  const [selectedFont, setSelectedFont] = useState<string>('Great Vibes');

  // Initialize canvas
  useEffect(() => {
    if (!isOpen || tab !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = 600;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // If initialSignature is present, draw it
    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, (canvas.width - img.width) / 2, (canvas.height - img.height) / 2);
        setHasDrawn(true);
      };
      img.src = initialSignature;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  }, [isOpen, tab, initialSignature]);

  if (!isOpen) return null;

  // Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    // Save current state for undo
    setStrokes((prev) => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.closePath();
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    setHasDrawn(false);
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    const ctx = canvas.getContext('2d')!;
    const last = strokes[strokes.length - 1];
    ctx.putImageData(last, 0, 0);
    setStrokes((prev) => prev.slice(0, -1));
  };

  // Upload handler with optional white background removal
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = reader.result as string;
      if (!removeBg) {
        setUploadedUrl(rawUrl);
        return;
      }

      // Process image to remove white / light backgrounds
      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const ctx = tempCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // If light/white pixel, set alpha to 0
          if (r > 210 && g > 210 && b > 210) {
            data[i + 3] = 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        setUploadedUrl(tempCanvas.toDataURL('image/png'));
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  // Convert typed text into transparent PNG signature
  const generateTypedSignatureUrl = (name: string, font: string): string => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 600;
    tempCanvas.height = 200;
    const ctx = tempCanvas.getContext('2d')!;
    ctx.font = `600 68px "${font}", cursive, serif`;
    ctx.fillStyle = ECB_COLORS.navy;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, tempCanvas.width / 2, tempCanvas.height / 2);
    return tempCanvas.toDataURL('image/png');
  };

  const handleSave = () => {
    let finalUrl = '';

    if (tab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      finalUrl = canvas.toDataURL('image/png');
    } else if (tab === 'upload') {
      if (!uploadedUrl) return;
      finalUrl = uploadedUrl;
    } else if (tab === 'type') {
      if (!typedName.trim()) return;
      finalUrl = generateTypedSignatureUrl(typedName.trim(), selectedFont);
    }

    if (finalUrl) {
      onSaveSignature(finalUrl, applyToAll);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Add Official Signature</h3>
              <p className="text-xs text-slate-500">Overlays directly onto the certificate authority box</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setTab('draw')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tab === 'draw'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            Draw with Pen
          </button>
          <button
            onClick={() => setTab('type')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tab === 'type'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Type Calligraphy
          </button>
          <button
            onClick={() => setTab('upload')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              tab === 'upload'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Upload Image
          </button>
        </div>

        {/* TAB 1: DRAW SIGNATURE */}
        {tab === 'draw' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              {/* Pen Color */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Ink:</span>
                {[
                  { color: ECB_COLORS.navy, label: 'ECB Navy' },
                  { color: '#000000', label: 'Black' },
                  { color: '#1d4ed8', label: 'Royal Blue' },
                  { color: ECB_COLORS.orange, label: 'ECB Orange' },
                ].map((c) => (
                  <button
                    key={c.color}
                    onClick={() => setPenColor(c.color)}
                    style={{ backgroundColor: c.color }}
                    className={`w-5 h-5 rounded-full transition-transform ${
                      penColor === c.color ? 'scale-125 ring-2 ring-indigo-500 ring-offset-1' : ''
                    }`}
                    title={c.label}
                  />
                ))}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={strokes.length === 0}
                  className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 disabled:opacity-40 text-slate-600 dark:text-slate-400 hover:bg-slate-50"
                >
                  <RotateCcw className="w-3 h-3 inline mr-1" />
                  Undo
                </button>
                <button
                  onClick={handleClear}
                  className="px-2 py-1 text-[11px] rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Drawing Canvas */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/40 p-1 relative">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-40 bg-white dark:bg-slate-900 rounded-lg cursor-crosshair touch-none"
              />
              <span className="absolute bottom-2 left-4 text-[10px] text-slate-400 pointer-events-none">
                Sign inside the box using your mouse, trackpad, or touchscreen
              </span>
            </div>
          </div>
        )}

        {/* TAB 2: TYPE CALLIGRAPHY */}
        {tab === 'type' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Authorized Signatory Name
              </label>
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="e.g. Dasho Tenzin / Karma Wangchuk"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Font Previews */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { name: 'Great Vibes', label: 'Classic Script' },
                { name: 'Alex Brush', label: 'Formal Cursive' },
                { name: 'Caveat', label: 'Modern Pen' },
                { name: 'Playfair Display', label: 'Editorial Italic' },
              ].map((f) => (
                <div
                  key={f.name}
                  onClick={() => setSelectedFont(f.name)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedFont === f.name
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/30 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                  }`}
                >
                  <span className="text-[10px] text-slate-400 block">{f.label}</span>
                  <p
                    className="text-xl text-slate-900 dark:text-white truncate pt-1"
                    style={{
                      fontFamily: f.name,
                      fontStyle: f.name === 'Playfair Display' ? 'italic' : 'normal',
                    }}
                  >
                    {typedName || 'Signatory Name'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: UPLOAD SIGNATURE */}
        {tab === 'upload' && (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={handleFileUpload}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50 dark:bg-slate-800/40 hover:bg-indigo-50/20 transition-all"
            >
              <Upload className="w-8 h-8 text-indigo-500 mb-2" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {uploadedUrl ? 'Replace Signature Image' : 'Upload Signature (.png, .jpg)'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Click to browse your device</p>
            </div>

            {uploadedUrl && (
              <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-between">
                <div className="h-12 w-32 bg-slate-100 dark:bg-slate-900 rounded p-1 flex items-center justify-center">
                  <img src={uploadedUrl} alt="Signature Preview" className="max-h-full max-w-full object-contain" />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removeBg}
                    onChange={(e) => setRemoveBg(e.target.checked)}
                    className="rounded accent-indigo-600"
                  />
                  <span>Auto-remove white background</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Bulk apply option */}
        {isBulkMode && (
          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="rounded accent-indigo-600 w-4 h-4"
              />
              <span>Apply this signature to all recipients in this batch</span>
            </label>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            Apply Signature
          </button>
        </div>
      </div>
    </div>
  );
};
