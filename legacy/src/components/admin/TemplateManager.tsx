import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Plus,
  Edit3,
  Copy,
  Trash2,
  Download,
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Check,
  AlertTriangle,
  FolderArchive,
  ArrowRight,
  Sparkles,
  Type,
  Eye,
  EyeOff,
  QrCode,
  PenTool,
  Move,
  Grid,
  Magnet,
  Maximize2,
  Minimize2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCcw,
  RefreshCw,
  Sliders,
  CheckCircle2,
  Layers,
  Wand2
} from 'lucide-react';
import { CertificateTemplate, TemplateField, CustomFont, PageSizePreset } from '../../types';
import { saveTemplate, deleteTemplate, getAllTemplates, getHistory } from '../../utils/db';
import { renderPdfFirstPageToDataUrl } from '../../utils/pdfLoader';
import { useToast } from '../../context/ToastContext';
import { FieldEditorCanvas, WorkspaceTool } from './FieldEditorCanvas';
import { FieldConfigSidebar } from './FieldConfigSidebar';
import { extractFieldsFromSvg } from '../../utils/svgParser';

interface TemplateManagerProps {
  templates: CertificateTemplate[];
  onTemplatesChange: (templates: CertificateTemplate[]) => void;
  onSelectTemplateForGeneration: (template: CertificateTemplate) => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  templates,
  onTemplatesChange,
  onSelectTemplateForGeneration,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cleanImageRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  // Active workspace editing state
  const [editingTemplate, setEditingTemplate] = useState<CertificateTemplate | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<WorkspaceTool>('select');
  const [isLivePreview, setIsLivePreview] = useState<boolean>(false);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [isDetectingAI, setIsDetectingAI] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<number>(Date.now());

  // History stack for Undo / Redo
  const [historyStack, setHistoryStack] = useState<TemplateField[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Modal / Confirmations
  const [deleteModalTemplate, setDeleteModalTemplate] = useState<CertificateTemplate | null>(null);
  const [hasHistoryWarning, setHasHistoryWarning] = useState<boolean>(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  // Push to history when fields change
  const pushHistory = (fields: TemplateField[]) => {
    setHistoryStack((prev) => [...prev.slice(0, historyIndex + 1), fields]);
    setHistoryIndex((prev) => prev + 1);
    setHasUnsavedChanges(true);
  };

  const handleUndo = () => {
    if (historyIndex > 0 && editingTemplate) {
      const prevFields = historyStack[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setEditingTemplate({ ...editingTemplate, fields: prevFields });
    }
  };

  const handleRedo = () => {
    if (historyIndex < historyStack.length - 1 && editingTemplate) {
      const nextFields = historyStack[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setEditingTemplate({ ...editingTemplate, fields: nextFields });
    }
  };

  // Autosave draft every 30 seconds
  useEffect(() => {
    if (!editingTemplate || !hasUnsavedChanges) return;
    const interval = setInterval(async () => {
      await saveTemplate(editingTemplate);
      const all = await getAllTemplates();
      onTemplatesChange(all);
      setHasUnsavedChanges(false);
      setLastSavedTime(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, [editingTemplate, hasUnsavedChanges, onTemplatesChange]);

  const replaceArtworkRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Core Template Upload Handler (PNG, JPG, SVG, PDF)
  const processUploadedFile = async (file: File, isReplacingCurrent: boolean = false) => {
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isPdf = file.type === 'application/pdf' || ext === 'pdf';
      const isSvg = file.type === 'image/svg+xml' || ext === 'svg';
      const isRasterImage = file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(ext);

      if (!isPdf && !isSvg && !isRasterImage) {
        throw new Error(`Unsupported file type (${file.type || ext}). Please upload a PNG, JPG, SVG, or PDF file.`);
      }

      let previewDataUrl = '';
      let width = 1920;
      let height = 1080;
      let initialFields: TemplateField[] = [];
      let finalBlob: Blob = file;

      if (isPdf) {
        showToast('Processing PDF certificate page...', 'info');
        const rendered = await renderPdfFirstPageToDataUrl(file);
        previewDataUrl = rendered.dataUrl;
        width = rendered.width || 1920;
        height = rendered.height || 1080;
        finalBlob = rendered.blob || file;
      } else if (isSvg) {
        showToast('Parsing SVG certificate elements...', 'info');
        const svgText = await file.text();
        const detected = extractFieldsFromSvg(svgText);
        previewDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
        if (detected) {
          width = detected.width;
          height = detected.height;
          initialFields = detected.fields;
          showToast(`Detected ${initialFields.length} field boxes from SVG elements!`, 'success');
        } else {
          // Probe SVG dimensions via Image
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 3000);
            img.src = previewDataUrl;
          });
          width = img.naturalWidth || 1920;
          height = img.naturalHeight || 1080;
        }
      } else {
        // PNG / JPG / JPEG / WEBP / BMP
        previewDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed reading image file.'));
          reader.readAsDataURL(file);
        });

        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 4000);
          img.src = previewDataUrl;
        });
        width = img.naturalWidth || 1920;
        height = img.naturalHeight || 1080;
      }

      if (isReplacingCurrent && editingTemplate) {
        // Keep existing fields, update background
        const updated: CertificateTemplate = {
          ...editingTemplate,
          previewDataUrl,
          blob: finalBlob,
          width,
          height,
          fileName: file.name,
          fileType: isPdf ? 'application/pdf' : isSvg ? 'image/svg+xml' : (file.type as any || 'image/png'),
          updatedAt: Date.now(),
        };
        await saveTemplate(updated);
        const all = await getAllTemplates();
        onTemplatesChange(all);
        setEditingTemplate(updated);
        showToast('Template background updated while preserving existing field boxes!', 'success');
        return;
      }

      // If new template has no fields, create standard initial field
      if (initialFields.length === 0) {
        initialFields = [
          {
            id: `f-${Date.now()}-1`,
            key: 'recipient_name',
            label: 'Recipient Name',
            type: 'text',
            required: true,
            defaultValue: 'Karma Wangchuk',
            x: 20,
            y: 45,
            width: 60,
            height: 9,
            fontFamily: 'Montserrat',
            fontSize: 48,
            fontWeight: '700',
            color: '#0f172a',
            align: 'center',
            autoShrink: true,
            transform: 'none',
            multiline: false,
          },
        ];
      }

      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .trim();

      const newTemplate: CertificateTemplate = {
        id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: cleanName || 'New Certificate Template',
        fileName: file.name,
        fileType: isPdf ? 'application/pdf' : isSvg ? 'image/svg+xml' : (file.type as any || 'image/png'),
        blob: finalBlob,
        previewDataUrl,
        width,
        height,
        fields: initialFields,
        isPublished: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveTemplate(newTemplate);
      const updatedList = await getAllTemplates();
      onTemplatesChange(updatedList);
      setEditingTemplate(newTemplate);
      setSelectedFieldId(initialFields[0]?.id || null);
      setHistoryStack([initialFields]);
      setHistoryIndex(0);
      showToast(`Template "${newTemplate.name}" uploaded successfully! Place boxes or use AI detect.`, 'success');
    } catch (err: any) {
      console.error('Template upload error:', err);
      showToast(`Upload failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (replaceArtworkRef.current) replaceArtworkRef.current.value = '';
    }
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleReplaceCurrentArtwork = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editingTemplate) {
      processUploadedFile(file, true);
    }
  };

  const handleLoadSampleFile = async (url: string, filename: string) => {
    setIsUploading(true);
    try {
      showToast(`Loading sample template "${filename}"...`, 'info');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch file`);
      const blob = await response.blob();
      const file = new File([blob], filename, {
        type: url.endsWith('.pdf') ? 'application/pdf' : 'image/png',
      });
      await processUploadedFile(file);
    } catch (err: any) {
      showToast(`Failed loading sample: ${err.message}`, 'error');
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processUploadedFile(files[0]);
    }
  };

  // AI Placeholder Detection via Gemini
  const handleDetectPlaceholdersAI = async () => {
    if (!editingTemplate || !editingTemplate.previewDataUrl) return;

    setIsDetectingAI(true);
    try {
      showToast('Gemini 3.8 Flash is scanning template for placeholder boxes...', 'info');

      const res = await fetch('/api/detect-placeholders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: editingTemplate.previewDataUrl,
          mimeType: editingTemplate.fileType,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Server returned an error');
      }

      const data = await res.json();
      const detected = data.placeholders;

      if (!Array.isArray(detected) || detected.length === 0) {
        showToast('No placeholder boxes detected. Use the 4 left tools to place them.', 'info');
        return;
      }

      // Convert detected normalized 0-1 coords into 0-100% fields
      const newFields: TemplateField[] = detected.map((box: any, index: number) => {
        const normX = Number((box.x * 100).toFixed(2));
        const normY = Number((box.y * 100).toFixed(2));
        const normW = Number((box.width * 100).toFixed(2));
        const normH = Number((box.height * 100).toFixed(2));
        const type: any = ['text', 'qr', 'image', 'signature'].includes(box.type) ? box.type : 'text';
        const key = box.label ? box.label.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30) : `field_${index + 1}`;

        return {
          id: `f-ai-${Date.now()}-${index}`,
          key,
          label: box.label || `Field ${index + 1}`,
          type,
          required: true,
          defaultValue: type === 'qr' ? 'https://verify.certigen.org?id=CERT-2026-0001' : type === 'signature' ? 'Authorized Officer' : box.label || 'Sample',
          x: Math.max(0, Math.min(95, normX)),
          y: Math.max(0, Math.min(95, normY)),
          width: Math.min(100 - normX, Math.max(2, normW)),
          height: Math.min(100 - normY, Math.max(1.5, normH)),
          fontFamily: 'Montserrat',
          fontSize: box.fontSizeEstimate || Math.round((normH * editingTemplate.height) / 200) || 32,
          fontWeight: '500',
          color: '#0f172a',
          align: box.align || 'center',
          autoShrink: true,
          transform: 'none',
          multiline: type === 'text' && normH > 8,
          qrConfig: type === 'qr' ? { contentType: 'verification_url', baseUrl: 'https://verify.certigen.org?id=', fgColor: '#000000', bgColor: '#ffffff', margin: 2 } : undefined,
          signatureConfig: type === 'signature' ? { allowedMethods: { upload: true, draw: true, type: true }, hasUnderline: true } : undefined,
          imageConfig: type === 'image' ? { fit: 'contain', borderRadius: 'rounded', allowCrop: true } : undefined,
        };
      });

      const updatedTemplate = {
        ...editingTemplate,
        fields: newFields,
        updatedAt: Date.now(),
      };

      await saveTemplate(updatedTemplate);
      setEditingTemplate(updatedTemplate);
      setSelectedFieldId(newFields[0]?.id || null);
      pushHistory(newFields);
      showToast(`Gemini AI detected ${newFields.length} placeholder boxes!`, 'success');
    } catch (err: any) {
      console.error(err);
      showToast(`AI detection error: ${err.message}. You can manually draw boxes.`, 'error');
    } finally {
      setIsDetectingAI(false);
    }
  };

  // Upload Clean Background Version
  const handleUploadCleanBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTemplate) return;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const cleanDataUrl = reader.result as string;
        const updated = {
          ...editingTemplate,
          cleanDataUrl,
          updatedAt: Date.now(),
        };
        await saveTemplate(updated);
        setEditingTemplate(updated);
        showToast('Clean background applied! Placeholder boxes will be invisible on export.', 'success');
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  };

  // Upload Custom TTF / OTF Font
  const handleUploadFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTemplate) return;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const fontName = file.name.replace(/\.[^/.]+$/, '').trim();

        const fontFace = new FontFace(fontName, `url(${dataUrl})`);
        await fontFace.load();
        document.fonts.add(fontFace);

        const newCustomFont: CustomFont = {
          id: `font-${Date.now()}`,
          name: fontName,
          fileName: file.name,
          dataUrl,
        };

        const customFonts = [...(editingTemplate.customFonts || []), newCustomFont];
        const updated = { ...editingTemplate, customFonts, updatedAt: Date.now() };

        await saveTemplate(updated);
        setEditingTemplate(updated);
        showToast(`Custom font "${fontName}" installed!`, 'success');
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      showToast(`Failed to load font: ${err.message}`, 'error');
    }
  };

  // Align and Distribute Tools
  const handleAlign = (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!editingTemplate || !selectedFieldId) return;
    const field = editingTemplate.fields.find((f) => f.id === selectedFieldId);
    if (!field || field.locked) return;

    let updatedField = { ...field };
    if (type === 'left') updatedField.x = 4;
    else if (type === 'center') updatedField.x = Number(((100 - field.width) / 2).toFixed(2));
    else if (type === 'right') updatedField.x = Number((100 - field.width - 4).toFixed(2));
    else if (type === 'top') updatedField.y = 4;
    else if (type === 'middle') updatedField.y = Number(((100 - field.height) / 2).toFixed(2));
    else if (type === 'bottom') updatedField.y = Number((100 - field.height - 4).toFixed(2));

    handleUpdateField(updatedField);
    showToast(`Aligned ${field.label} to ${type}`, 'info');
  };

  // Field change updates
  const handleUpdateField = async (updatedField: TemplateField) => {
    if (!editingTemplate) return;
    const fields = editingTemplate.fields.map((f) => (f.id === updatedField.id ? updatedField : f));
    const updated = { ...editingTemplate, fields, updatedAt: Date.now() };
    setEditingTemplate(updated);
    pushHistory(fields);
  };

  const handleAddField = async (newField: TemplateField) => {
    if (!editingTemplate) return;
    const fields = [...editingTemplate.fields, newField];
    const updated = { ...editingTemplate, fields, updatedAt: Date.now() };
    setEditingTemplate(updated);
    pushHistory(fields);
  };

  const handleDeleteField = async (id: string) => {
    if (!editingTemplate) return;
    const fields = editingTemplate.fields.filter((f) => f.id !== id);
    const updated = { ...editingTemplate, fields, updatedAt: Date.now() };
    setEditingTemplate(updated);
    setSelectedFieldId(null);
    pushHistory(fields);
  };

  const handleDuplicateField = async (fieldToDup: TemplateField) => {
    if (!editingTemplate) return;
    const duplicatedField: TemplateField = {
      ...fieldToDup,
      id: `f-${Date.now()}`,
      key: `${fieldToDup.key}_copy`,
      label: `${fieldToDup.label} (Copy)`,
      y: Math.min(90, Number((fieldToDup.y + 4).toFixed(2))),
    };
    handleAddField(duplicatedField);
    setSelectedFieldId(duplicatedField.id);
  };

  // Publish Checker & Validation
  const [publishErrors, setPublishErrors] = useState<string[]>([]);
  const [publishWarnings, setPublishWarnings] = useState<string[]>([]);
  const [showPublishCheckModal, setShowPublishCheckModal] = useState<boolean>(false);

  const runPublishChecker = (template: CertificateTemplate): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!template.name.trim()) {
      errors.push('Template title cannot be empty.');
    }

    const activeFields = template.fields.filter((f) => !f.hidden);
    if (activeFields.length === 0) {
      errors.push('At least one placeholder box must be placed on the certificate.');
    }

    // Check unique box names
    const names = new Map<string, number>();
    const keys = new Map<string, number>();

    activeFields.forEach((f) => {
      const cleanName = (f.label || '').trim().toLowerCase();
      if (!cleanName) {
        errors.push(`A ${f.type} box is missing a Box Name.`);
      } else {
        names.set(cleanName, (names.get(cleanName) || 0) + 1);
      }

      const cleanKey = (f.key || '').trim().toLowerCase();
      if (!cleanKey) {
        errors.push(`A ${f.type} box has an empty variable key.`);
      } else {
        keys.set(cleanKey, (keys.get(cleanKey) || 0) + 1);
      }

      // Check boxes outside page bounds
      if (f.x < 0 || f.y < 0 || f.x + f.width > 100.5 || f.y + f.height > 100.5) {
        warnings.push(`Box "${f.label || f.key}" extends outside the printable canvas boundary.`);
      }

      // Check smart sentence tags
      if (f.contentMode === 'smart_sentence' && f.smartSentenceConfig) {
        const sentence = f.smartSentenceConfig.sentence || f.smartSentenceConfig.templateSentence || '';
        const tagMatches = sentence.match(/\{([^{}]+)\}/g) || [];
        if (tagMatches.length === 0) {
          warnings.push(`Smart sentence box "${f.label}" does not contain any {tags}.`);
        }
      }
    });

    // Check duplicates
    names.forEach((count, name) => {
      if (count > 1) {
        errors.push(`Duplicate Box Name: "${name}" is used by ${count} boxes. Every box must have a unique name.`);
      }
    });

    keys.forEach((count, key) => {
      if (count > 1) {
        warnings.push(`Duplicate Variable Key: "${key}" is shared by ${count} boxes.`);
      }
    });

    return { errors, warnings };
  };

  const handleSaveAndPublish = async () => {
    if (!editingTemplate) return;
    const { errors, warnings } = runPublishChecker(editingTemplate);
    setPublishErrors(errors);
    setPublishWarnings(warnings);

    if (errors.length > 0) {
      setShowPublishCheckModal(true);
      return;
    }

    if (warnings.length > 0) {
      setShowPublishCheckModal(true);
      return;
    }

    const updated = { ...editingTemplate, isPublished: true, updatedAt: Date.now() };
    await saveTemplate(updated);
    const all = await getAllTemplates();
    onTemplatesChange(all);
    setHasUnsavedChanges(false);
    showToast('Template published successfully to Client Portal!', 'success');
  };

  const handleConfirmPublishWithWarnings = async () => {
    if (!editingTemplate) return;
    const updated = { ...editingTemplate, isPublished: true, updatedAt: Date.now() };
    await saveTemplate(updated);
    const all = await getAllTemplates();
    onTemplatesChange(all);
    setHasUnsavedChanges(false);
    setShowPublishCheckModal(false);
    showToast('Template published with notices to Client Portal!', 'success');
  };

  // Change page preset
  const handleChangePageSize = (preset: PageSizePreset) => {
    if (!editingTemplate) return;
    let w = editingTemplate.width;
    let h = editingTemplate.height;

    if (preset === 'a4-landscape') {
      w = 3508;
      h = 2480;
    } else if (preset === 'a4-portrait') {
      w = 2480;
      h = 3508;
    } else if (preset === 'letter-landscape') {
      w = 3300;
      h = 2550;
    } else if (preset === 'letter-portrait') {
      w = 2550;
      h = 3300;
    }

    const updated = { ...editingTemplate, pageSize: preset, width: w, height: h, updatedAt: Date.now() };
    setEditingTemplate(updated);
    saveTemplate(updated);
  };

  // ================= RENDER 1: ADMIN WORKSPACE =================
  if (editingTemplate) {
    const activeField = editingTemplate.fields.find((f) => f.id === selectedFieldId) || null;

    return (
      <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-900 text-white font-sans overflow-hidden">
        {/* Hidden File for Clean Background */}
        <input
          ref={cleanImageRef}
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleUploadCleanBackground}
          className="hidden"
        />

        {/* TOP CONTROL BAR */}
        <div className="h-14 px-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0 z-30">
          {/* Left: Navigation, Title & Preset */}
          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                if (hasUnsavedChanges) {
                  await saveTemplate(editingTemplate);
                }
                setEditingTemplate(null);
                setSelectedFieldId(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
            >
              ← Templates Gallery
            </button>

            <div className="h-4 w-px bg-slate-800" />

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editingTemplate.name}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                className="bg-transparent text-sm font-bold text-white hover:bg-slate-900/60 px-2 py-1 rounded border border-transparent hover:border-slate-800 outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {hasUnsavedChanges ? (
                <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                  Unsaved Draft
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Saved
                </span>
              )}
            </div>

            {/* Page Size Preset Selector */}
            <select
              value={editingTemplate.pageSize || 'match'}
              onChange={(e) => handleChangePageSize(e.target.value as PageSizePreset)}
              className="text-xs bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 outline-none"
            >
              <option value="match">Match Image ({editingTemplate.width}×{editingTemplate.height})</option>
              <option value="a4-landscape">A4 Landscape (297×210mm)</option>
              <option value="a4-portrait">A4 Portrait (210×297mm)</option>
              <option value="letter-landscape">US Letter Landscape (11×8.5in)</option>
              <option value="letter-portrait">US Letter Portrait (8.5×11in)</option>
            </select>
          </div>

          {/* Center: Align & Distribute Quick Tools */}
          <div className="hidden lg:flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => handleAlign('left')}
              disabled={!selectedFieldId}
              title="Align Left"
              className="p-1.5 hover:bg-slate-800 disabled:opacity-30 rounded text-slate-300 hover:text-white"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleAlign('center')}
              disabled={!selectedFieldId}
              title="Align Center Horizontal"
              className="p-1.5 hover:bg-slate-800 disabled:opacity-30 rounded text-slate-300 hover:text-white"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleAlign('right')}
              disabled={!selectedFieldId}
              title="Align Right"
              className="p-1.5 hover:bg-slate-800 disabled:opacity-30 rounded text-slate-300 hover:text-white"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>
            <div className="h-4 w-px bg-slate-800 mx-1" />
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              title="Undo (Ctrl+Z)"
              className="p-1.5 hover:bg-slate-800 disabled:opacity-30 rounded text-slate-300 hover:text-white"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: Preview Mode & Save/Publish */}
          <div className="flex items-center gap-2">
            {/* Hidden Input for Replacing Current Artwork */}
            <input
              ref={replaceArtworkRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.svg,application/pdf,image/png,image/jpeg,image/svg+xml"
              onChange={handleReplaceCurrentArtwork}
              className="hidden"
            />
            <button
              onClick={() => replaceArtworkRef.current?.click()}
              disabled={isUploading}
              title="Replace certificate background image/PDF while preserving existing field boxes"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              Replace Artwork
            </button>

            {/* AI Detect Button */}
            <button
              onClick={handleDetectPlaceholdersAI}
              disabled={isDetectingAI}
              className="px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition-all"
            >
              {isDetectingAI ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Scanning with Gemini...
                </>
              ) : (
                <>
                  <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                  AI Detect Boxes
                </>
              )}
            </button>

            {/* Preview Toggle */}
            <button
              onClick={() => setIsLivePreview(!isLivePreview)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors ${
                isLivePreview
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              {isLivePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {isLivePreview ? 'Edit Zones' : 'Preview Live'}
            </button>

            {/* Publish Compliance Checker */}
            <button
              onClick={() => {
                if (!editingTemplate) return;
                const { errors, warnings } = runPublishChecker(editingTemplate);
                setPublishErrors(errors);
                setPublishWarnings(warnings);
                setShowPublishCheckModal(true);
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Check Compliance
            </button>

            {/* Save & Publish */}
            <button
              onClick={handleSaveAndPublish}
              className="px-4 py-1.5 bg-[#002C6A] hover:bg-[#001f4d] text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition-colors border border-blue-900"
            >
              <Check className="w-3.5 h-3.5 text-[#FFF005]" />
              Save & Publish
            </button>
          </div>
        </div>

        {/* WORKSPACE BODY (3-Column Layout: Left Toolbar, Center Canvas, Right Properties) */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* LEFT TOOLBAR */}
          <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-2 shrink-0 z-20">
            {/* Tool 1: Pointer / Select */}
            <button
              onClick={() => setActiveTool('select')}
              title="Select & Move (V)"
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all ${
                activeTool === 'select'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Move className="w-4 h-4" />
              <span className="text-[9px] mt-0.5">Select</span>
            </button>

            {/* Tool 2: Text Box */}
            <button
              onClick={() => setActiveTool('text')}
              title="Text Placeholder Box (T)"
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all ${
                activeTool === 'text'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Type className="w-4 h-4" />
              <span className="text-[9px] mt-0.5">Text</span>
            </button>

            {/* Tool 3: Image / Photo Badge */}
            <button
              onClick={() => setActiveTool('image')}
              title="Image / Badge Box (I)"
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all ${
                activeTool === 'image'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span className="text-[9px] mt-0.5">Image</span>
            </button>

            {/* Tool 4: QR Code */}
            <button
              onClick={() => setActiveTool('qr')}
              title="QR Code Box (Q)"
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all ${
                activeTool === 'qr'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span className="text-[9px] mt-0.5">QR</span>
            </button>

            {/* Tool 5: Signature */}
            <button
              onClick={() => setActiveTool('signature')}
              title="Signature Box (S)"
              className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center transition-all ${
                activeTool === 'signature'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span className="text-[9px] mt-0.5">Sign</span>
            </button>

            <div className="w-8 h-px bg-slate-800 my-2" />

            {/* Snap toggles */}
            <button
              onClick={() => setSnapToGrid(!snapToGrid)}
              title={snapToGrid ? 'Disable Grid Snap' : 'Snap to Grid (1% increments)'}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                snapToGrid ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/50' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowGuides(!showGuides)}
              title={showGuides ? 'Hide Snap Guides' : 'Show Smart Alignment Guides'}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                showGuides ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/50' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Magnet className="w-4 h-4" />
            </button>

            {/* Clean Background Upload Option */}
            <div className="mt-auto pb-2 flex flex-col items-center">
              <button
                onClick={() => cleanImageRef.current?.click()}
                title="Upload clean template background without placeholder boxes"
                className="w-10 h-10 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
              >
                <UploadCloud className="w-4 h-4" />
                <span className="text-[8px] mt-0.5">Clean</span>
              </button>
            </div>
          </div>

          {/* CENTER CANVAS */}
          <FieldEditorCanvas
            template={editingTemplate}
            selectedFieldId={selectedFieldId}
            onSelectField={setSelectedFieldId}
            onUpdateField={handleUpdateField}
            onAddField={handleAddField}
            onDeleteField={handleDeleteField}
            onDuplicateField={handleDuplicateField}
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            isLivePreview={isLivePreview}
            snapToGrid={snapToGrid}
            showGuides={showGuides}
          />

          {/* RIGHT SIDEBAR (Properties & Layers) */}
          <FieldConfigSidebar
            field={activeField}
            template={editingTemplate}
            onUpdateField={handleUpdateField}
            onDuplicateField={handleDuplicateField}
            onDeleteField={handleDeleteField}
            onSelectField={setSelectedFieldId}
            onReorderFields={(fields) => {
              setEditingTemplate({ ...editingTemplate, fields });
              pushHistory(fields);
            }}
            onUploadCustomFont={handleUploadFont}
          />
        </div>
      </div>
    );
  }

  // ================= RENDER 2: TEMPLATE GALLERY =================
  return (
    <div className="space-y-6">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.svg,application/pdf,image/png,image/jpeg,image/svg+xml"
        onChange={handleUploadFile}
        className="hidden"
      />
      <input
        ref={jsonImportRef}
        type="file"
        accept=".json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            if (!parsed.template || !Array.isArray(parsed.template.fields)) {
              throw new Error('Invalid template schema');
            }
            const imported: CertificateTemplate = {
              id: `tpl-${Date.now()}`,
              name: parsed.template.name || 'Imported Template',
              fileName: 'imported.png',
              fileType: 'image/png',
              blob: new Blob(),
              previewDataUrl: parsed.template.previewDataUrl || '',
              width: parsed.template.width || 1920,
              height: parsed.template.height || 1080,
              fields: parsed.template.fields,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            await saveTemplate(imported);
            const all = await getAllTemplates();
            onTemplatesChange(all);
            showToast('Template imported from JSON!', 'success');
          } catch (err: any) {
            showToast(`Import error: ${err.message}`, 'error');
          }
        }}
        className="hidden"
      />

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-[#002C6A] dark:text-amber-400">
              Admin Template Library
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFF005]/40 text-[#002C6A] border border-[#FFF005] dark:bg-amber-400/20 dark:text-amber-300">
              ECB Studio
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Create, duplicate, rename, delete, and publish official templates. Upload clean background artwork with logos, stripes & watermarks, then place customizable Text, Photo, QR, and Signature boxes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => jsonImportRef.current?.click()}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            Import JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 bg-[#002C6A] hover:bg-[#001f4d] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 text-[#FFF005]" />}
            {isUploading ? 'Uploading...' : 'Upload New Template'}
          </button>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 group ${
          isDraggingOver
            ? 'border-[#002C6A] bg-blue-500/15 scale-[1.01] shadow-xl shadow-blue-500/20 ring-4 ring-blue-500/30'
            : 'border-slate-300 dark:border-slate-700 hover:border-[#002C6A] bg-white dark:bg-slate-900/50 hover:bg-blue-50/20 dark:hover:bg-slate-800/30'
        }`}
      >
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 transition-transform duration-200 ${
          isDraggingOver
            ? 'bg-[#002C6A] text-white scale-125 animate-pulse'
            : 'bg-blue-50 dark:bg-slate-800 text-[#002C6A] dark:text-amber-400 group-hover:scale-110'
        }`}>
          {isUploading ? <RefreshCw className="w-6 h-6 animate-spin text-[#002C6A]" /> : <Upload className="w-6 h-6" />}
        </div>
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {isUploading
            ? 'Parsing & Rendering Certificate File...'
            : isDraggingOver
            ? 'Drop Here to Upload Certificate Template'
            : 'Upload Clean Certificate Background (Artwork Only)'}
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">
          Accepts <strong>PNG, JPG, SVG, or PDF</strong> (first page). Finished background artwork with logos, colored stripes, and watermark with no placeholder boxes.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-indigo-500" /> AI Gemini Auto-Detection
          </span>
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            SVG field_* Parsing
          </span>
          <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            4 Interactive Tools
          </span>
        </div>
      </div>

      {/* Quick Test / Attached Assets Loader */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Quick Load Attached Files:
        </span>
        <button
          onClick={() => handleLoadSampleFile('/assets/aistudio/Sample_Certificate_ff197a30.pdf', 'Sample_Certificate.pdf')}
          disabled={isUploading}
          className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1"
        >
          <FileText className="w-3 h-3 text-red-500" /> Sample Certificate (PDF)
        </button>
        <button
          onClick={() => handleLoadSampleFile('/assets/aistudio/Untitled-1_ba49ba48.png', 'ECB_Certificate_A4.png')}
          disabled={isUploading}
          className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1"
        >
          <ImageIcon className="w-3 h-3 text-blue-500" /> ECB Official Template (A4 PNG)
        </button>
        <button
          onClick={() => handleLoadSampleFile('/assets/aistudio/Untitled-2_c1eb64a8.png', 'Bhutan_Election_Commission_Emblem.png')}
          disabled={isUploading}
          className="text-xs px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1"
        >
          <ImageIcon className="w-3 h-3 text-amber-500" /> ECB Emblem Art (PNG)
        </button>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs hover:shadow-lg transition-all flex flex-col"
          >
            {/* Thumbnail */}
            <div
              onClick={() => {
                setEditingTemplate(tpl);
                setSelectedFieldId(tpl.fields[0]?.id || null);
                setHistoryStack([tpl.fields]);
                setHistoryIndex(0);
              }}
              className="aspect-video bg-slate-100 dark:bg-slate-800/80 overflow-hidden relative cursor-pointer flex items-center justify-center"
            >
              <img
                src={tpl.previewDataUrl}
                alt={tpl.name}
                className="w-full h-full object-contain p-2 group-hover:scale-102 transition-transform duration-200"
              />
              <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-xs text-[10px] font-mono text-white">
                {tpl.fields.filter((f) => !f.hidden).length} placeholders
              </div>
            </div>

            {/* Info & Actions */}
            <div className="p-4 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {tpl.name}
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">
                    {tpl.width}×{tpl.height}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono truncate">
                  {tpl.fileName}
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <button
                  onClick={() => {
                    setEditingTemplate(tpl);
                    setSelectedFieldId(tpl.fields[0]?.id || null);
                    setHistoryStack([tpl.fields]);
                    setHistoryIndex(0);
                  }}
                  className="font-semibold text-[#002C6A] dark:text-amber-400 hover:opacity-80 flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Workspace
                </button>

                <div className="flex items-center gap-1">
                  {/* Publish / Unpublish Toggle */}
                  <button
                    onClick={async () => {
                      const nextPublished = tpl.isPublished === false ? true : false;
                      const updated = { ...tpl, isPublished: nextPublished, updatedAt: Date.now() };
                      await saveTemplate(updated);
                      const all = await getAllTemplates();
                      onTemplatesChange(all);
                      showToast(nextPublished ? `Published "${tpl.name}"` : `Unpublished "${tpl.name}"`, 'info');
                    }}
                    title={tpl.isPublished === false ? 'Publish for clients' : 'Unpublish template'}
                    className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors ${
                      tpl.isPublished === false
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    {tpl.isPublished === false ? 'Draft' : 'Published'}
                  </button>

                  {/* Duplicate Template */}
                  <button
                    onClick={async () => {
                      const copy: CertificateTemplate = {
                        ...tpl,
                        id: `tpl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        name: `${tpl.name} (Copy)`,
                        isPublished: false,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                      };
                      await saveTemplate(copy);
                      const all = await getAllTemplates();
                      onTemplatesChange(all);
                      showToast(`Duplicated "${tpl.name}"`, 'success');
                    }}
                    title="Duplicate Template"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  {/* Rename Template */}
                  <button
                    onClick={async () => {
                      const newName = prompt('Enter new template name:', tpl.name);
                      if (newName && newName.trim() && newName !== tpl.name) {
                        const updated = { ...tpl, name: newName.trim(), updatedAt: Date.now() };
                        await saveTemplate(updated);
                        const all = await getAllTemplates();
                        onTemplatesChange(all);
                        showToast(`Renamed to "${newName}"`, 'success');
                      }
                    }}
                    title="Rename Template"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete Template */}
                  <button
                    onClick={async () => {
                      if (confirm(`Are you sure you want to delete template "${tpl.name}"?`)) {
                        await deleteTemplate(tpl.id);
                        const all = await getAllTemplates();
                        onTemplatesChange(all);
                        showToast(`Deleted "${tpl.name}"`, 'info');
                      }
                    }}
                    title="Delete Template"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Open in Client Portal */}
                  <button
                    onClick={() => onSelectTemplateForGeneration(tpl)}
                    title="Test as Client"
                    className="p-1.5 rounded-lg text-[#002C6A] dark:text-amber-400 hover:bg-blue-50 dark:hover:bg-slate-800"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Publish Checker Validation Modal */}
      {showPublishCheckModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${publishErrors.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Publish Compliance Checker
                </h3>
                <p className="text-xs text-slate-500">Regulatory Verification</p>
              </div>
            </div>

            {publishErrors.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                  Errors (Must fix before publishing):
                </span>
                <ul className="text-xs space-y-1 bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200">
                  {publishErrors.map((err, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span>•</span>
                      <span>{err}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {publishWarnings.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  Notices & Warnings:
                </span>
                <ul className="text-xs space-y-1 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200">
                  {publishWarnings.map((warn, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span>•</span>
                      <span>{warn}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPublishCheckModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                Return to Editor
              </button>
              {publishErrors.length === 0 && publishWarnings.length > 0 && (
                <button
                  type="button"
                  onClick={handleConfirmPublishWithWarnings}
                  className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[#002C6A] text-white hover:bg-[#001f4d]"
                >
                  Publish Anyway
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
