import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  ArrowRight,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Layers,
  User,
  Share2,
  Plus,
  Trash2,
  PenTool,
  Image as ImageIcon,
  QrCode,
  Lock,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Undo2,
  Check,
  FileText,
  Sliders,
  Type,
  Edit3,
  Copy,
  Tag,
  AlertTriangle,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { CertificateTemplate, DataRow, TemplateField, SmartSentenceTagConfig } from '../../types';
import { renderCertificateToCanvas } from '../../utils/canvasRenderer';
import { parseUploadedDataFile, validateMappedRows, generateSampleFile, getTargetColumns, TargetColumnDef } from '../../utils/fileParser';
import {
  generateSingleCertificatePdf,
  generateZipArchive,
  generateMergedPdf,
  downloadBlob,
  formatFileNamePattern,
  GenerationProgress
} from '../../utils/pdfGenerator';
import { addHistoryItem } from '../../utils/db';
import { useToast } from '../../context/ToastContext';
import { SAMPLE_CSV_CONTENT } from '../../utils/sampleTemplates';
import { SignatureModal } from '../common/SignatureModal';
import { getAllTemplateTags, validateTagValue, formatTagValue, toDzongkhaNumerals } from '../../utils/smartSentence';
import { FillInTheBlankSentence } from '../common/FillInTheBlankSentence';
import { GenerateCertificatesModal } from '../common/GenerateCertificatesModal';
import { resolveDynamicPlaceholders } from '../../utils/formatters';

interface UserWorkflowProps {
  templates: CertificateTemplate[];
  selectedTemplate: CertificateTemplate | null;
  onSelectTemplate: (template: CertificateTemplate) => void;
  onSwitchToAdmin?: () => void;
}

type Step = 1 | 2 | 3;
type Step2Section = 'data' | 'content' | 'signatures_photo';

export const UserWorkflow: React.FC<UserWorkflowProps> = ({
  templates,
  selectedTemplate,
  onSelectTemplate,
  onSwitchToAdmin,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const cancelSignalRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  // Filter templates to SHOW ONLY PUBLISHED TEMPLATES by admin
  const publishedTemplates = useMemo(() => {
    return templates.filter((tpl) => tpl.isPublished === true);
  }, [templates]);

  // Stepper state: 1: Choose Template, 2: Add Data & Content, 3: Review & Download
  const [currentStep, setCurrentStep] = useState<Step>(selectedTemplate ? 2 : 1);
  const [step2Section, setStep2Section] = useState<Step2Section>('data');

  // Recipient / Data state
  const [validatedRows, setValidatedRows] = useState<DataRow[]>([]);
  const [previewRowIndex, setPreviewRowIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deletedRowUndo, setDeletedRowUndo] = useState<{ row: DataRow; index: number; timeoutId: any } | null>(null);

  // Table pagination state (ensures high performance with up to 10,000 rows)
  const [tablePage, setTablePage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(25);

  // Modal & Generation state
  const [showGenerateModal, setShowGenerateModal] = useState<boolean>(false);
  const [namingPattern, setNamingPattern] = useState<string>('{certificate_no}_{name}');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null);

  // Canvas zoom & pan
  const [canvasZoom, setCanvasZoom] = useState<number>(1);

  // Photo & QR controls
  const [photoZoom, setPhotoZoom] = useState<number>(1);

  // Signature modal state
  const [signatureModalField, setSignatureModalField] = useState<TemplateField | null>(null);
  const [activeTagKey, setActiveTagKey] = useState<string | null>(null);

  // Auto select first published template if none selected or if selected is unpublished
  useEffect(() => {
    if (publishedTemplates.length > 0) {
      if (!selectedTemplate || !publishedTemplates.some((t) => t.id === selectedTemplate.id)) {
        onSelectTemplate(publishedTemplates[0]);
      }
    }
  }, [publishedTemplates, selectedTemplate, onSelectTemplate]);

  // Initialize sample rows for template if empty
  useEffect(() => {
    if (!selectedTemplate) return;

    if (validatedRows.length === 0) {
      const rows: Record<string, any>[] = [
        {
          name: 'Karma Wangchuk',
          recipient_name: 'Karma Wangchuk',
          student_name: 'Karma Wangchuk',
          cid: '10212000257',
          course: 'Local Government Election Management 2026',
          dzongkhag: 'Thimphu',
          post: 'Presiding Officer',
          date: '2026-07-20',
          orgname: 'Election Commission of Bhutan',
          certificate_no: 'ECB-2026-0001',
          cert_id: 'ECB-2026-0001',
          qr_code: 'https://verify.ecb.bt/10212000257',
          photo: '/assets/aistudio/1_923d5de2.png',
        },
        {
          name: 'Dechen Pem',
          recipient_name: 'Dechen Pem',
          student_name: 'Dechen Pem',
          cid: '11501002345',
          course: 'Electoral Returning Officer Certification',
          dzongkhag: 'Paro',
          post: 'Returning Officer',
          date: '2026-07-20',
          orgname: 'Election Commission of Bhutan',
          certificate_no: 'ECB-2026-0002',
          cert_id: 'ECB-2026-0002',
          qr_code: 'https://verify.ecb.bt/11501002345',
          photo: '/assets/aistudio/1_923d5de2.png',
        },
        {
          name: 'Tashi Dorji',
          recipient_name: 'Tashi Dorji',
          student_name: 'Tashi Dorji',
          cid: '10705001234',
          course: 'Voter Education & Poll Official Training',
          dzongkhag: 'Punakha',
          post: 'Polling Official',
          date: '2026-07-20',
          orgname: 'Election Commission of Bhutan',
          certificate_no: 'ECB-2026-0003',
          cert_id: 'ECB-2026-0003',
          qr_code: 'https://verify.ecb.bt/10705001234',
          photo: '/assets/aistudio/1_923d5de2.png',
        },
        {
          name: 'Sonam Choden',
          recipient_name: 'Sonam Choden',
          student_name: 'Sonam Choden',
          cid: '11102004567',
          course: 'National Assembly General Elections 2026',
          dzongkhag: 'Chhukha',
          post: 'Counting Official',
          date: '2026-07-20',
          orgname: 'Election Commission of Bhutan',
          certificate_no: 'ECB-2026-0004',
          cert_id: 'ECB-2026-0004',
          qr_code: 'https://verify.ecb.bt/11102004567',
          photo: '/assets/aistudio/1_923d5de2.png',
        },
        {
          name: 'Ugyen Tshering',
          recipient_name: 'Ugyen Tshering',
          student_name: 'Ugyen Tshering',
          cid: '10903007890',
          course: 'Postal Ballot Verification Operations',
          dzongkhag: 'Wangdue Phodrang',
          post: 'Electoral Supervisor',
          date: '2026-07-20',
          orgname: 'Election Commission of Bhutan',
          certificate_no: 'ECB-2026-0005',
          cert_id: 'ECB-2026-0005',
          qr_code: 'https://verify.ecb.bt/10903007890',
          photo: '/assets/aistudio/1_923d5de2.png',
        },
      ];

      // Populate default field values
      selectedTemplate.fields.forEach((f) => {
        rows.forEach((r) => {
          if (r[f.key] === undefined) {
            r[f.key] = f.defaultValue || '';
          }
        });
      });

      const validated = validateMappedRows(
        rows,
        selectedTemplate.fields,
        selectedTemplate.fields.reduce((acc, f) => ({ ...acc, [f.key]: f.key }), {})
      );
      setValidatedRows(validated);
      setPreviewRowIndex(0);
    }

    const certKey = selectedTemplate.fields.find((f) => f.key.includes('cert') || f.key.includes('id') || f.key.includes('cid'))?.key || 'certificate_no';
    const nameKey = selectedTemplate.fields.find((f) => f.key.includes('name'))?.key || 'name';
    setNamingPattern(`{${certKey}}_{${nameKey}}`);
  }, [selectedTemplate]);

  // Render certificate on canvas
  useEffect(() => {
    if (!selectedTemplate || !previewCanvasRef.current) return;
    const currentRow = validatedRows[previewRowIndex] || {};

    renderCertificateToCanvas(
      previewCanvasRef.current,
      selectedTemplate,
      currentRow,
      previewRowIndex
    ).catch(console.error);
  }, [selectedTemplate, validatedRows, previewRowIndex, currentStep]);

  // Available data columns in current CSV file / data matrix
  const availableDataColumns = useMemo(() => {
    const colSet = new Set<string>();
    if (validatedRows.length > 0) {
      Object.keys(validatedRows[0]).forEach((k) => {
        if (!k.startsWith('__')) colSet.add(k);
      });
    }
    if (selectedTemplate) {
      selectedTemplate.fields.forEach((f) => {
        if (!f.hidden) colSet.add(f.key);
        if (f.smartSentenceConfig?.tags) {
          f.smartSentenceConfig.tags.forEach((t) => colSet.add(t.key));
        }
      });
    }
    ['name', 'cid', 'course', 'date', 'dzongkhag', 'post', 'orgname'].forEach((c) => colSet.add(c));
    return Array.from(colSet);
  }, [validatedRows, selectedTemplate]);

  // Handle cell edit
  const handleCellEdit = (rowId: string, fieldKey: string, newValue: string) => {
    if (!selectedTemplate) return;
    const updatedRows = validatedRows.map((r) => {
      if (r.__rowId === rowId) {
        return { ...r, [fieldKey]: newValue };
      }
      return r;
    });

    const revalidated = validateMappedRows(
      updatedRows,
      selectedTemplate.fields,
      selectedTemplate.fields.reduce((acc, f) => ({ ...acc, [f.key]: f.key }), {})
    );
    setValidatedRows(revalidated);
  };

  const handleCurrentRowFieldChange = (fieldKey: string, newValue: string) => {
    if (!selectedTemplate || validatedRows.length === 0) return;
    const currentRow = validatedRows[previewRowIndex];
    if (!currentRow) return;
    handleCellEdit(currentRow.__rowId, fieldKey, newValue);
  };

  const handleApplyFieldToAllRows = (fieldKey: string, fieldLabel: string, value: string) => {
    if (!selectedTemplate || validatedRows.length === 0) return;
    const updatedRows = validatedRows.map((r) => ({
      ...r,
      [fieldKey]: value,
    }));
    const revalidated = validateMappedRows(
      updatedRows,
      selectedTemplate.fields,
      selectedTemplate.fields.reduce((acc, f) => ({ ...acc, [f.key]: f.key }), {})
    );
    setValidatedRows(revalidated);
    showToast(`Applied "${value || '(blank)'}" to all ${validatedRows.length.toLocaleString()} recipients for ${fieldLabel}`, 'success');
  };

  // Client updates sentence wording for a field (supporting {name}, {cid}, etc.)
  const handleUpdateFieldWording = (fieldId: string, newText: string) => {
    if (!selectedTemplate) return;
    const updatedFields = selectedTemplate.fields.map((f) => {
      if (f.id === fieldId || f.key === fieldId) {
        const updated = { ...f, defaultValue: newText };
        if (updated.smartSentenceConfig) {
          updated.smartSentenceConfig = {
            ...updated.smartSentenceConfig,
            sentence: newText,
            templateSentence: newText,
          };
        }
        return updated;
      }
      return f;
    });

    onSelectTemplate({
      ...selectedTemplate,
      fields: updatedFields,
      updatedAt: Date.now(),
    });
  };

  // Add a missing column to all rows
  const handleAddMissingColumn = (colName: string) => {
    if (!selectedTemplate) return;
    const updatedRows = validatedRows.map((r) => ({
      ...r,
      [colName]: r[colName] || '',
    }));
    const revalidated = validateMappedRows(
      updatedRows,
      selectedTemplate.fields,
      selectedTemplate.fields.reduce((acc, f) => ({ ...acc, [f.key]: f.key }), {})
    );
    setValidatedRows(revalidated);
    showToast(`Added column "${colName}" to all records`, 'success');
  };

  // Insert tag token into textarea
  const insertTagIntoTextarea = (fieldId: string, tagKey: string) => {
    const textarea = document.getElementById(`textarea-${fieldId}`) as HTMLTextAreaElement | null;
    const field = selectedTemplate?.fields.find((f) => f.id === fieldId);
    if (!field) return;

    const currentText = field.smartSentenceConfig?.sentence || field.defaultValue || '';
    const tagToken = `{${tagKey}}`;

    if (textarea) {
      const start = textarea.selectionStart ?? currentText.length;
      const end = textarea.selectionEnd ?? currentText.length;
      const nextText = currentText.substring(0, start) + tagToken + currentText.substring(end);
      handleUpdateFieldWording(fieldId, nextText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tagToken.length, start + tagToken.length);
      }, 10);
    } else {
      handleUpdateFieldWording(fieldId, `${currentText} ${tagToken}`);
    }
    showToast(`Inserted {${tagKey}}`, 'info');
  };

  // Add recipient
  const handleAddNewRecipient = () => {
    if (!selectedTemplate) return;
    const count = validatedRows.length + 1;
    const newRaw: Record<string, any> = {};
    selectedTemplate.fields.forEach((f) => {
      newRaw[f.key] = f.defaultValue || `Recipient ${count}`;
    });
    const tags = getAllTemplateTags(selectedTemplate);
    tags.forEach((t) => {
      if (!newRaw[t.key]) newRaw[t.key] = t.defaultValue || '';
    });
    newRaw.name = `Recipient ${count}`;
    newRaw.cid = `1021200${String(count).padStart(4, '0')}`;
    newRaw.certificate_no = `ECB-2026-${String(count).padStart(4, '0')}`;

    const newRowArray = [...validatedRows, newRaw];
    const revalidated = validateMappedRows(
      newRowArray,
      selectedTemplate.fields,
      selectedTemplate.fields.reduce((acc, f) => ({ ...acc, [f.key]: f.key }), {})
    );
    setValidatedRows(revalidated);
    setPreviewRowIndex(revalidated.length - 1);
    setTablePage(Math.ceil(revalidated.length / rowsPerPage));
    showToast(`Added Recipient #${count}`, 'success');
  };

  // Generate demo batch of recipients (up to 10,000 for high-volume stress testing)
  const handleGenerateDemoBatch = (count: number) => {
    if (!selectedTemplate) return;
    const names = [
      'Karma Wangchuk', 'Dechen Pem', 'Tashi Dorji', 'Sonam Choden', 'Ugyen Tshering',
      'Tshering Dema', 'Kinley Wangmo', 'Sangay Thinley', 'Pema Yangzom', 'Dorji Khandu',
      'Yeshey Wangdi', 'Dawa Norbu', 'Jigme Singye', 'Kuenga Lhendup', 'Chimi Dema',
      'Leki Wangmo', 'Pema Rinzin', 'Rinchen Dorji', 'Sangay Dema', 'Tenzin Norbu'
    ];
    const courses = [
      'Local Government Election Management 2026',
      'Returning Officer Executive Certification',
      'Voter Education & Poll Official Training',
      'Postal Ballot Verification Operations',
      'National Assembly General Elections Masterclass',
      'Electoral Dispute Resolution Procedure'
    ];
    const dzongkhags = [
      'Thimphu', 'Paro', 'Punakha', 'Chhukha', 'Wangdue Phodrang',
      'Bumthang', 'Trashigang', 'Mongar', 'Samdrup Jongkhar', 'Sarpang'
    ];
    const posts = [
      'Presiding Officer', 'Polling Official', 'Returning Officer',
      'Electoral Supervisor', 'Counting Official', 'Legal Observer'
    ];

    const generatedRows: Record<string, any>[] = [];
    for (let i = 0; i < count; i++) {
      const name = names[i % names.length] + (i >= names.length ? ` (${i + 1})` : '');
      const cidNum = 10000000000 + ((i * 137) % 9000000000) + (i % 899);
      const cidStr = String(cidNum).padStart(11, '0').slice(0, 11);
      const course = courses[i % courses.length];
      const dzongkhag = dzongkhags[i % dzongkhags.length];
      const post = posts[i % posts.length];
      const certNo = `ECB-2026-${String(i + 1).padStart(5, '0')}`;

      const r: Record<string, any> = {
        name,
        recipient_name: name,
        student_name: name,
        cid: cidStr,
        course,
        dzongkhag,
        post,
        date: '2026-07-20',
        orgname: 'Election Commission of Bhutan',
        certificate_no: certNo,
        cert_id: certNo,
        qr_code: `https://verify.ecb.bt/${cidStr}`,
        photo: '/assets/aistudio/1_923d5de2.png',
      };

      selectedTemplate.fields.forEach((f) => {
        if (r[f.key] === undefined) {
          r[f.key] = f.defaultValue || '';
        }
      });

      generatedRows.push(r);
    }

    const validated = validateMappedRows(
      generatedRows,
      selectedTemplate.fields,
      selectedTemplate.fields.reduce((acc, f) => ({ ...acc, [f.key]: f.key }), {})
    );
    setValidatedRows(validated);
    setPreviewRowIndex(0);
    setTablePage(1);
    showToast(`Loaded ${count.toLocaleString()} recipients into matrix! (Supports up to 10,000)`, 'success');
  };

  // Delete recipient with 10-second undo
  const handleDeleteRecipient = (indexToDelete: number) => {
    if (validatedRows.length <= 1) {
      showToast('At least one recipient record must remain.', 'info');
      return;
    }
    const rowToDelete = validatedRows[indexToDelete];
    const nextRows = validatedRows.filter((_, idx) => idx !== indexToDelete);
    setValidatedRows(nextRows);
    setPreviewRowIndex((prev) => Math.min(prev, nextRows.length - 1));

    if (deletedRowUndo?.timeoutId) {
      clearTimeout(deletedRowUndo.timeoutId);
    }

    const timeoutId = setTimeout(() => {
      setDeletedRowUndo(null);
    }, 10000);

    setDeletedRowUndo({ row: rowToDelete, index: indexToDelete, timeoutId });
    showToast('Recipient removed. Undo available for 10s.', 'info');
  };

  const handleUndoDelete = () => {
    if (!deletedRowUndo || !selectedTemplate) return;
    clearTimeout(deletedRowUndo.timeoutId);
    const restored = [...validatedRows];
    restored.splice(deletedRowUndo.index, 0, deletedRowUndo.row);
    setValidatedRows(restored);
    setPreviewRowIndex(deletedRowUndo.index);
    setDeletedRowUndo(null);
    showToast('Recipient restored successfully!', 'success');
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTemplate) return;

    try {
      const { headers, rawRows: rows, suggestedMapping } = await parseUploadedDataFile(
        file,
        selectedTemplate.fields
      );

      if (rows.length === 0) {
        showToast('Uploaded file contains no data rows.', 'error');
        return;
      }

      const validated = validateMappedRows(rows, selectedTemplate.fields, suggestedMapping);
      setValidatedRows(validated);
      setPreviewRowIndex(0);
      setTablePage(1);
      showToast(`Loaded ${rows.length.toLocaleString()} recipients from "${file.name}"`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to parse data file', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Paste list prompt modal / handler
  const handlePasteList = () => {
    const text = prompt('Paste comma or tab-separated recipient list:\nExample:\nKarma Wangchuk, 10212000257, LG Election\nDechen Pem, 11501002345, Returning Officer');
    if (!text || !selectedTemplate) return;

    const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === 0) return;

    const targetCols = getTargetColumns(selectedTemplate.fields);
    const newRows: Record<string, any>[] = lines.map((line) => {
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const row: Record<string, any> = {};
      targetCols.forEach((col, cIdx) => {
        row[col.key] = parts[cIdx] || '';
      });
      return row;
    });

    const validated = validateMappedRows(
      newRows,
      selectedTemplate.fields,
      selectedTemplate.fields.reduce((acc, f) => ({ ...acc, [f.key]: f.key }), {})
    );
    setValidatedRows(validated);
    setPreviewRowIndex(0);
    setTablePage(1);
    showToast(`Pasted and mapped ${newRows.length} recipients!`, 'success');
  };

  // Google Sheets URL import handler
  const handleGoogleSheetsUrl = () => {
    const url = prompt('Enter public Google Sheet URL or published CSV link:');
    if (!url) return;
    showToast('Fetching Google Sheet data...', 'info');
    let fetchUrl = url;
    if (url.includes('docs.google.com/spreadsheets/d/')) {
      const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        fetchUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
      }
    }

    fetch(fetchUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Could not fetch Google Sheet. Ensure sheet is set to "Anyone with the link can view".');
        return res.text();
      })
      .then((csvText) => {
        const file = new File([csvText], 'google_sheet.csv', { type: 'text/csv' });
        return parseUploadedDataFile(file, selectedTemplate!.fields);
      })
      .then(({ rawRows: rows, suggestedMapping }) => {
        const validated = validateMappedRows(rows, selectedTemplate!.fields, suggestedMapping);
        setValidatedRows(validated);
        setPreviewRowIndex(0);
        setTablePage(1);
        showToast(`Imported ${rows.length.toLocaleString()} rows from Google Sheets!`, 'success');
      })
      .catch((err) => {
        showToast(err.message || 'Failed to import Google Sheet', 'error');
      });
  };

  // Signatures Save
  const handleSaveSignature = (dataUrl: string, applyToAll?: boolean) => {
    if (!signatureModalField) return;
    if (applyToAll) {
      handleApplyFieldToAllRows(signatureModalField.key, signatureModalField.label, dataUrl);
    } else {
      handleCurrentRowFieldChange(signatureModalField.key, dataUrl);
      showToast('Signature updated for current recipient', 'success');
    }
    setSignatureModalField(null);
  };

  // Download Single PDF
  const handleDownloadSinglePdf = async (rowIndex: number) => {
    if (!selectedTemplate || !validatedRows[rowIndex]) return;
    setIsGenerating(true);
    setGenerationProgress({ current: 1, total: 1, percent: 50, status: 'Building vector PDF...' });
    try {
      const row = validatedRows[rowIndex];
      const pdfBytes = await generateSingleCertificatePdf(selectedTemplate, row, rowIndex);
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const filename = formatFileNamePattern(namingPattern, row, selectedTemplate.fields, rowIndex);
      downloadBlob(blob, filename);
      showToast(`Downloaded "${filename}"!`, 'success');
    } catch (err: any) {
      showToast(`PDF generation failed: ${err.message}`, 'error');
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  // Download Single 300 DPI PNG
  const handleDownloadSinglePng = async (rowIndex: number) => {
    if (!selectedTemplate) return;
    setIsGenerating(true);
    setGenerationProgress({ current: 1, total: 1, percent: 60, status: 'Rasterizing 300 DPI PNG...' });
    try {
      const row = validatedRows[rowIndex] || {};
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 3508;
      exportCanvas.height = 2480;
      await renderCertificateToCanvas(exportCanvas, selectedTemplate, row, rowIndex);

      exportCanvas.toBlob((blob) => {
        if (blob) {
          const filename = `${formatFileNamePattern(namingPattern, row, selectedTemplate.fields, rowIndex).replace('.pdf', '')}.png`;
          downloadBlob(blob, filename);
          showToast(`Downloaded 300 DPI graphic "${filename}"!`, 'success');
        }
        setIsGenerating(false);
        setGenerationProgress(null);
      }, 'image/png');
    } catch (err: any) {
      showToast(`PNG export failed: ${err.message}`, 'error');
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  // Download Batch ZIP (Supports up to 10,000 certificates)
  const handleDownloadAllZip = async (range?: { start: number; end: number }) => {
    if (!selectedTemplate) return;
    setIsGenerating(true);
    cancelSignalRef.current = { cancelled: false };

    const rowsToProcess = range
      ? validatedRows.slice(range.start - 1, range.end)
      : validatedRows;

    setGenerationProgress({
      current: 0,
      total: rowsToProcess.length,
      percent: 0,
      status: `Initializing batch generation for ${rowsToProcess.length.toLocaleString()} certificates...`,
    });

    try {
      const { zipBlob, fileNames } = await generateZipArchive(
        selectedTemplate,
        rowsToProcess,
        namingPattern,
        (p) => setGenerationProgress(p),
        cancelSignalRef.current
      );

      const rangeSuffix = range ? `_rows_${range.start}-${range.end}` : '';
      downloadBlob(zipBlob, `${selectedTemplate.name}_certificates${rangeSuffix}.zip`);

      await addHistoryItem({
        id: `gen-${Date.now()}`,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        timestamp: Date.now(),
        totalCount: rowsToProcess.length,
        successCount: rowsToProcess.length,
        skippedCount: 0,
        namingPattern,
        sampleNames: fileNames.slice(0, 5),
      });

      showToast(`Exported ${rowsToProcess.length.toLocaleString()} certificates in batch ZIP!`, 'success');
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        showToast('Batch generation cancelled.', 'info');
      } else {
        showToast(`ZIP generation failed: ${err.message}`, 'error');
      }
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  // Download Merged PDF
  const handleDownloadAllPdf = async (range?: { start: number; end: number }) => {
    if (!selectedTemplate) return;
    setIsGenerating(true);
    cancelSignalRef.current = { cancelled: false };

    const rowsToProcess = range
      ? validatedRows.slice(range.start - 1, range.end)
      : validatedRows;

    setGenerationProgress({
      current: 0,
      total: rowsToProcess.length,
      percent: 0,
      status: `Merging ${rowsToProcess.length.toLocaleString()} certificates into PDF...`,
    });

    try {
      const merged = await generateMergedPdf(
        selectedTemplate,
        rowsToProcess,
        (p) => setGenerationProgress(p),
        cancelSignalRef.current
      );

      const rangeSuffix = range ? `_rows_${range.start}-${range.end}` : '';
      downloadBlob(merged, `${selectedTemplate.name}_all_certificates${rangeSuffix}.pdf`);
      showToast('Merged multi-page PDF downloaded!', 'success');
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        showToast('PDF merging cancelled.', 'info');
      } else {
        showToast(`Merge failed: ${err.message}`, 'error');
      }
    } finally {
      setIsGenerating(false);
      setGenerationProgress(null);
    }
  };

  const handleCancelGeneration = () => {
    cancelSignalRef.current.cancelled = true;
    showToast('Cancelling generation...', 'info');
  };

  // Table pagination calculations
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return validatedRows;
    const q = searchQuery.toLowerCase();
    return validatedRows.filter((r) => {
      return Object.keys(r).some((k) => {
        if (k.startsWith('__')) return false;
        return String(r[k] || '').toLowerCase().includes(q);
      });
    });
  }, [validatedRows, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (tablePage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, tablePage, rowsPerPage]);

  const currentRow = validatedRows[previewRowIndex] || {};
  const currentErrors = currentRow.__errors || {};
  const invalidRowsCount = validatedRows.filter((r) => !r.__isValid).length;

  const textFields = selectedTemplate?.fields.filter((f) => f.type === 'text' && !f.hidden) || [];
  const signatureFields = selectedTemplate?.fields.filter((f) => f.type === 'signature' || f.key.includes('signature')) || [];
  const dateFields = selectedTemplate?.fields.filter((f) => f.type === 'date' || f.key.includes('date')) || [];
  const imageFields = selectedTemplate?.fields.filter((f) => f.type === 'image' || f.key.includes('photo')) || [];
  const qrFields = selectedTemplate?.fields.filter((f) => f.type === 'qr' || f.key.includes('qr')) || [];

  return (
    <div className="space-y-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* 1. Horizontal Stepper (3 Steps) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Step 1 */}
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all ${
              currentStep === 1
                ? 'bg-blue-50/70 dark:bg-slate-800 ring-1 ring-[#002C6A]'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-colors ${
                currentStep === 1
                  ? 'bg-[#002C6A] text-white shadow-xs'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {currentStep > 1 ? <Check className="w-4 h-4 stroke-[3]" /> : '1'}
            </div>
            <div className="text-left">
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                1. Choose Template
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                {selectedTemplate ? selectedTemplate.name.split('(')[0].trim() : 'Published only'}
              </span>
            </div>
          </button>

          <div className={`flex-1 h-0.5 mx-2 ${currentStep >= 2 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`} />

          {/* Step 2 */}
          <button
            type="button"
            onClick={() => setCurrentStep(2)}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all ${
              currentStep === 2
                ? 'bg-blue-50/70 dark:bg-slate-800 ring-1 ring-[#002C6A]'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-colors ${
                currentStep === 2
                  ? 'bg-[#002C6A] text-white shadow-xs'
                  : currentStep > 2
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-300 dark:border-slate-700 text-slate-400'
              }`}
            >
              {currentStep > 2 ? <Check className="w-4 h-4 stroke-[3]" /> : '2'}
            </div>
            <div className="text-left">
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                2. Data & Text (Side-by-Side)
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {validatedRows.length.toLocaleString()} recipients
              </span>
            </div>
          </button>

          <div className={`flex-1 h-0.5 mx-2 ${currentStep >= 3 ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`} />

          {/* Step 3 */}
          <button
            type="button"
            onClick={() => setCurrentStep(3)}
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-all ${
              currentStep === 3
                ? 'bg-blue-50/70 dark:bg-slate-800 ring-1 ring-[#002C6A]'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-mono transition-colors ${
                currentStep === 3
                  ? 'bg-[#002C6A] text-white shadow-xs'
                  : 'border border-slate-300 dark:border-slate-700 text-slate-400'
              }`}
            >
              3
            </div>
            <div className="text-left">
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                3. Review & Download
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                Single or Batch (up to 10k)
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Info Banner (Navy bar under the stepper) */}
      {selectedTemplate && (
        <div className="bg-[#002C6A] text-white rounded-2xl px-5 py-3 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-white/10 shrink-0 text-[#FFF005]">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold tracking-tight text-white">
                  {selectedTemplate.name}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-semibold">
                  Published by Admin
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/15 text-blue-100 font-mono">
                  {selectedTemplate.width} × {selectedTemplate.height}px
                </span>
              </div>
              <p className="text-[11px] text-blue-200/90 font-normal">
                Locked regulatory template. Fill or customize text with CSV codes &#123;name&#125;, &#123;cid&#125;, &#123;course&#125;. Supports up to 10,000 certificates.
              </p>
            </div>
          </div>

          {/* Segmented switch ONLY for PUBLISHED templates */}
          <div className="flex items-center gap-1 p-1 bg-black/20 rounded-xl overflow-x-auto max-w-full">
            {publishedTemplates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onSelectTemplate(tpl)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  selectedTemplate.id === tpl.id
                    ? 'bg-white text-[#002C6A] font-bold shadow-xs'
                    : 'text-blue-100 hover:text-white hover:bg-white/10'
                }`}
              >
                {tpl.name.split('(')[0].trim()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Undo Toast Banner if recipient was just deleted */}
      {deletedRowUndo && (
        <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 p-3 rounded-xl flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>
              Removed recipient <strong>{deletedRowUndo.row.name || 'Record'}</strong>.
            </span>
          </div>
          <button
            type="button"
            onClick={handleUndoDelete}
            className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo (10s)
          </button>
        </div>
      )}

      {/* ================= STEP 1: CHOOSE TEMPLATE ================= */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#002C6A] dark:text-amber-400">
              Select Official Certificate Template
            </h2>
            <p className="text-xs text-slate-500">
              Only approved templates published by the Election Commission of Bhutan admin are listed below. Official geometry is locked.
            </p>
          </div>

          {publishedTemplates.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 max-w-lg mx-auto space-y-3">
              <Lock className="w-8 h-8 mx-auto text-slate-400" />
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                No Published Templates Yet
              </h3>
              <p className="text-xs text-slate-500">
                All templates are currently in draft. Switch to the Admin Portal to publish an official template.
              </p>
              {onSwitchToAdmin && (
                <button
                  type="button"
                  onClick={onSwitchToAdmin}
                  className="px-4 py-2 rounded-xl bg-[#002C6A] text-white text-xs font-semibold hover:bg-[#001f4d]"
                >
                  Switch to Admin Portal
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
              {publishedTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => {
                    onSelectTemplate(tpl);
                    setCurrentStep(2);
                  }}
                  className={`group cursor-pointer rounded-2xl border transition-all overflow-hidden flex flex-col bg-white dark:bg-slate-900 hover:shadow-lg ${
                    selectedTemplate?.id === tpl.id
                      ? 'border-[#002C6A] ring-2 ring-[#002C6A]/20 shadow-md'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <div className="aspect-video bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center relative">
                    <img
                      src={tpl.previewDataUrl}
                      alt={tpl.name}
                      className="w-full h-full object-contain p-2 group-hover:scale-102 transition-transform duration-200"
                    />
                    <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-[#002C6A]/90 text-[10px] font-mono text-white flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Published</span>
                    </div>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#002C6A] dark:group-hover:text-amber-400 transition-colors">
                        {tpl.name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 font-mono">
                        {tpl.width} × {tpl.height}px · {tpl.fields.filter((f) => !f.hidden).length} placeholders
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-[#002C6A] dark:text-amber-400">
                      <span>Select Template</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 2: SIDE-BY-SIDE DATA & CONTENT WORKSPACE ================= */}
      {currentStep === 2 && selectedTemplate && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Data Matrix, Certificate Content & Text Editor */}
          <div className="lg:col-span-7 space-y-4">
            {/* Navigation Tabs for Step 2 */}
            <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-1.5 shadow-xs">
              <button
                type="button"
                onClick={() => setStep2Section('data')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  step2Section === 'data'
                    ? 'bg-[#002C6A] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#FFF005]" />
                <span>1. Recipient Data ({validatedRows.length.toLocaleString()})</span>
              </button>

              <button
                type="button"
                onClick={() => setStep2Section('content')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  step2Section === 'content'
                    ? 'bg-[#002C6A] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-[#F59119]" />
                <span>2. Certificate Text & Codes</span>
              </button>

              <button
                type="button"
                onClick={() => setStep2Section('signatures_photo')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  step2Section === 'signatures_photo'
                    ? 'bg-[#002C6A] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <PenTool className="w-3.5 h-3.5 text-blue-400" />
                <span>3. Signatures & Badges</span>
              </button>
            </div>

            {/* SECTION A: RECIPIENT DATA MATRIX */}
            {step2Section === 'data' && (
              <div className="space-y-4 animate-in fade-in">
                {/* Actions Bar */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Import & Bulk Data Sources
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Supports up to 10,000 certificates. Columns match tags like &#123;name&#125;, &#123;cid&#125;, &#123;course&#125;.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Upload CSV / Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={handlePasteList}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Type className="w-3.5 h-3.5 text-blue-600" />
                        <span>Paste List</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleGoogleSheetsUrl}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>Google Sheet</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => generateSampleFile(selectedTemplate.fields, selectedTemplate.name, 'csv')}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>Sample CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleAddNewRecipient}
                        className="px-3.5 py-1.5 rounded-xl bg-[#002C6A] hover:bg-[#001f4d] text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#FFF005]" />
                        <span>+ Recipient</span>
                      </button>
                    </div>
                  </div>

                  {/* High-volume Batch Demo Generator (100, 1000, 10000 records) */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      Test high-volume generation:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleGenerateDemoBatch(100)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-medium text-[11px]"
                      >
                        + 100 records
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenerateDemoBatch(1000)}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-[#002C6A] dark:text-blue-300 font-bold text-[11px]"
                      >
                        + 1,000 records
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGenerateDemoBatch(10000)}
                        className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-700 dark:text-amber-300 font-bold text-[11px]"
                        title="Loads 10,000 realistic recipient records"
                      >
                        ⚡ 10,000 Records (Max)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Paginated Data Table Grid */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                  <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                    <div className="relative max-w-xs flex-1">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setTablePage(1);
                        }}
                        placeholder="Search name, CID, dzongkhag..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>
                        Showing {paginatedRows.length} of {filteredRows.length.toLocaleString()}
                      </span>
                      <select
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(parseInt(e.target.value, 10));
                          setTablePage(1);
                        }}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none"
                      >
                        <option value={10}>10 / page</option>
                        <option value={25}>25 / page</option>
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-[460px]">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/95 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 z-10">
                        <tr>
                          <th className="p-2.5 w-12 text-center font-mono">#</th>
                          {getTargetColumns(selectedTemplate.fields).map((col) => (
                            <th key={col.key} className="p-2.5 font-semibold whitespace-nowrap">
                              <div className="flex items-center gap-1">
                                <span>{col.label}</span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  &#123;{col.key}&#125;
                                </span>
                              </div>
                            </th>
                          ))}
                          <th className="p-2.5 w-16 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-sans">
                        {paginatedRows.map((row, pIdx) => {
                          const realIdx = (tablePage - 1) * rowsPerPage + pIdx;
                          const isSelected = realIdx === previewRowIndex;
                          const hasError = !row.__isValid;

                          return (
                            <tr
                              key={row.__rowId}
                              onClick={() => setPreviewRowIndex(realIdx)}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-blue-50/70 dark:bg-blue-950/40 font-semibold'
                                  : hasError
                                  ? 'bg-rose-50/30 dark:bg-rose-950/20'
                                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <td className="p-2.5 text-center font-mono text-slate-400 text-xs">
                                {realIdx + 1}
                              </td>
                              {getTargetColumns(selectedTemplate.fields).map((col) => {
                                const err = row.__errors?.[col.key];
                                const val = row[col.key] || '';
                                return (
                                  <td key={col.key} className="p-1.5 min-w-[140px]">
                                    <input
                                      type="text"
                                      value={val}
                                      onChange={(e) => handleCellEdit(row.__rowId, col.key, e.target.value)}
                                      className={`w-full px-2 py-1 rounded-md border text-xs outline-none transition-all ${
                                        err
                                          ? 'border-rose-400 bg-rose-50 text-rose-900'
                                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                                      }`}
                                      title={err || ''}
                                    />
                                  </td>
                                );
                              })}
                              <td className="p-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRecipient(realIdx);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                  title="Delete recipient"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination footer */}
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-mono">
                      Page {tablePage} of {totalPages} ({filteredRows.length.toLocaleString()} total rows)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={tablePage === 1}
                        onClick={() => setTablePage(1)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-xs font-mono"
                      >
                        «
                      </button>
                      <button
                        type="button"
                        disabled={tablePage === 1}
                        onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-xs"
                      >
                        ‹ Prev
                      </button>
                      <button
                        type="button"
                        disabled={tablePage >= totalPages}
                        onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-xs"
                      >
                        Next ›
                      </button>
                      <button
                        type="button"
                        disabled={tablePage >= totalPages}
                        onClick={() => setTablePage(totalPages)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 disabled:opacity-30 text-xs font-mono"
                      >
                        »
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION B: CERTIFICATE TEXT & CLIENT CUSTOM CONTENT */}
            {step2Section === 'content' && (
              <div className="space-y-4 animate-in fade-in">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <h3 className="text-sm font-bold text-[#002C6A] dark:text-amber-400 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-[#F59119]" />
                    <span>Certificate Text & Content Customization</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Type or modify the wording for editable certificate text placeholders. Click any CSV column tag below to insert dynamic codes like &#123;name&#125;, &#123;cid&#125;, &#123;course&#125;. They replace automatically for each recipient row!
                  </p>

                  {/* CSV Column Quick Tags Bar */}
                  <div className="pt-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                      Available CSV File Column Tags (Click to insert):
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      {availableDataColumns.map((colKey) => (
                        <button
                          key={colKey}
                          type="button"
                          onClick={() => {
                            // Find the first editable text field or active field
                            const targetField = textFields.find((f) => f.clientPermission === 'fully_editable' || f.contentMode === 'smart_sentence') || textFields[0];
                            if (targetField) {
                              insertTagIntoTextarea(targetField.id, colKey);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 text-[#002C6A] dark:text-blue-300 font-mono text-xs font-semibold hover:bg-blue-50 dark:hover:bg-slate-800 flex items-center gap-1 shadow-2xs hover:scale-102 transition-all"
                        >
                          <Plus className="w-2.5 h-2.5 text-[#F59119]" />
                          <span>&#123;{colKey}&#125;</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* List of text fields configured in template */}
                <div className="space-y-4">
                  {textFields.map((field) => {
                    const isFixed = field.clientPermission === 'fixed';
                    const isFullyEditable = field.clientPermission === 'fully_editable' || !isFixed;
                    const isSmart = field.contentMode === 'smart_sentence';
                    const currentSentence = field.smartSentenceConfig?.sentence || field.defaultValue || '';
                    const resolvedCurrent = resolveDynamicPlaceholders(currentSentence, currentRow, previewRowIndex);

                    // Detect missing tags
                    const matches = currentSentence.match(/\{([^{}]+)\}/g) || [];
                    const colsLower = availableDataColumns.map((c) => c.toLowerCase());
                    const missingTags = matches
                      .map((m) => m.slice(1, -1).trim())
                      .filter((t) => !colsLower.includes(t.toLowerCase()) && !['index', 'row', 'no'].includes(t.toLowerCase()));

                    return (
                      <div
                        key={field.id}
                        className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#002C6A] dark:text-white">
                              {field.label}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                              Box: {field.key}
                            </span>
                          </div>

                          {isFixed ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Fixed (Locked by Admin)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                              <Edit3 className="w-3 h-3" />
                              Client Editable Text
                            </span>
                          )}
                        </div>

                        {isFixed ? (
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 font-serif italic">
                            "{currentSentence}"
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>Write certificate text with curly tags like &#123;name&#125;, &#123;cid&#125;:</span>
                              <div className="flex items-center gap-1">
                                {availableDataColumns.slice(0, 5).map((col) => (
                                  <button
                                    key={col}
                                    type="button"
                                    onClick={() => insertTagIntoTextarea(field.id, col)}
                                    className="px-1.5 py-0.5 text-[10px] rounded font-mono bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                                  >
                                    +&#123;{col}&#125;
                                  </button>
                                ))}
                              </div>
                            </div>

                            <textarea
                              id={`textarea-${field.id}`}
                              rows={4}
                              value={currentSentence}
                              onChange={(e) => handleUpdateFieldWording(field.id, e.target.value)}
                              placeholder="e.g. This certificate is awarded to {name} holding CID {cid} for taking the course {course} on {date}."
                              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-sans outline-none focus:ring-2 focus:ring-[#002C6A]/20 transition-all leading-relaxed"
                            />

                            {/* Missing tag warning */}
                            {missingTags.length > 0 && (
                              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                  <span>
                                    Unmatched column: <strong>&#123;{missingTags[0]}&#125;</strong> is not in your data table.
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleAddMissingColumn(missingTags[0])}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold text-[11px] hover:bg-amber-700"
                                >
                                  + Add '{missingTags[0]}' Column
                                </button>
                              </div>
                            )}

                            {/* Live preview for currently viewed recipient */}
                            <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-slate-800/40 border border-blue-100 dark:border-slate-700/60 text-xs space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-[#002C6A] dark:text-amber-400 block">
                                Live resolved text for Recipient #{previewRowIndex + 1} ({currentRow.name || 'Current'}):
                              </span>
                              <p className="text-slate-800 dark:text-slate-200 leading-relaxed font-sans">
                                {resolvedCurrent || <span className="text-slate-400 italic">(Blank content)</span>}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SECTION C: SIGNATURES & PHOTO */}
            {step2Section === 'signatures_photo' && (
              <div className="space-y-4 animate-in fade-in">
                {/* Official Signatures */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Official Authorized Signatories
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Signer signatures appear automatically on each recipient certificate.
                      </p>
                    </div>
                  </div>

                  {signatureFields.map((field, sIdx) => {
                    const val = currentRow[field.key] ?? field.defaultValue ?? '';
                    const isImg = typeof val === 'string' && (val.startsWith('data:image/') || val.startsWith('http'));

                    return (
                      <div
                        key={field.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <PenTool className="w-3.5 h-3.5 text-[#002C6A] dark:text-amber-400" />
                            Signatory #{sIdx + 1}: {field.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleApplyFieldToAllRows(field.key, field.label, val)}
                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold"
                          >
                            Apply to all recipients
                          </button>
                        </div>

                        {isImg ? (
                          <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <img src={val} alt="Signature preview" className="h-10 max-w-[140px] object-contain" />
                            <button
                              type="button"
                              onClick={() => setSignatureModalField(field)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Replace Signature
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => handleCurrentRowFieldChange(field.key, e.target.value)}
                              placeholder="Type signer name / designation..."
                              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setSignatureModalField(field)}
                              className="px-3 py-1.5 rounded-lg bg-[#002C6A] text-white text-xs font-semibold hover:bg-[#001f4d] whitespace-nowrap"
                            >
                              Draw / Upload
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Recipient Photo & QR */}
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Security Verification & Photo Badge
                  </h3>

                  {qrFields.map((field) => {
                    const val = currentRow[field.key] ?? field.defaultValue ?? '';
                    return (
                      <div key={field.id} className="space-y-1">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {field.label}
                        </label>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => handleCurrentRowFieldChange(field.key, e.target.value)}
                          placeholder="https://verify.ecb.bt/{cid}"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono outline-none"
                        />
                        <p className="text-[11px] text-slate-400">
                          Rendered into anti-counterfeiting scannable 2D QR code
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: STICKY LIVE WYSIWYG PREVIEW */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 sticky top-24 shadow-xs">
            {/* Pager & Recipient Navigation */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={previewRowIndex === 0}
                  onClick={() => setPreviewRowIndex((p) => Math.max(0, p - 1))}
                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 disabled:opacity-30 hover:bg-slate-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 text-xs font-mono font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
                  <input
                    type="number"
                    min="1"
                    max={validatedRows.length}
                    value={previewRowIndex + 1}
                    onChange={(e) => {
                      const idx = (parseInt(e.target.value, 10) || 1) - 1;
                      setPreviewRowIndex(Math.max(0, Math.min(idx, validatedRows.length - 1)));
                    }}
                    className="w-12 text-center bg-transparent outline-none text-[#002C6A] dark:text-amber-400"
                  />
                  <span className="text-slate-400">/ {validatedRows.length.toLocaleString()}</span>
                </div>
                <button
                  type="button"
                  disabled={previewRowIndex >= validatedRows.length - 1}
                  onClick={() => setPreviewRowIndex((p) => Math.min(validatedRows.length - 1, p + 1))}
                  className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 disabled:opacity-30 hover:bg-slate-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCanvasZoom((z) => Math.max(0.6, z - 0.1))}
                  className="p-1 rounded text-slate-500 hover:bg-slate-100"
                  title="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono text-slate-500 w-9 text-center">
                  {Math.round(canvasZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setCanvasZoom((z) => Math.min(1.5, z + 0.1))}
                  className="p-1 rounded text-slate-500 hover:bg-slate-100"
                  title="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCanvasZoom(1)}
                  className="p-1 rounded text-slate-500 hover:bg-slate-100"
                  title="Fit"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Recipient current name & CID badge */}
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                {currentRow.name || currentRow.student_name || `Recipient #${previewRowIndex + 1}`}
              </span>
              <span className="font-mono text-[11px] text-[#002C6A] dark:text-amber-400 font-semibold">
                CID: {currentRow.cid || '—'}
              </span>
            </div>

            {/* Canvas viewport container */}
            <div className="w-full overflow-auto bg-slate-950/10 dark:bg-black/40 rounded-xl p-2.5 flex items-center justify-center min-h-[320px] border border-slate-200 dark:border-slate-800">
              <div
                className="transition-transform duration-100 origin-center max-w-full"
                style={{ transform: `scale(${canvasZoom})` }}
              >
                <canvas
                  ref={previewCanvasRef}
                  className="max-w-full h-auto rounded-lg shadow-xl border border-slate-300 dark:border-slate-700 bg-white"
                />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => setShowGenerateModal(true)}
                className="w-full py-2.5 rounded-xl bg-[#002C6A] hover:bg-[#001f4d] text-white text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4 text-[#FFF005]" />
                <span>Generate Certificates ({validatedRows.length.toLocaleString()})</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Proceed to Step 3: Review & Download</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= STEP 3: REVIEW & DOWNLOAD ================= */}
      {currentStep === 3 && selectedTemplate && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Pre-Flight Verification Complete
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Ready to Issue Official Certificates
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedTemplate.name} · {validatedRows.length.toLocaleString()} recipients queued for 300 DPI vector issuance.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Edit Data</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowGenerateModal(true)}
                  className="px-4 py-1.5 rounded-xl bg-[#002C6A] hover:bg-[#001f4d] text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-[#FFF005]" />
                  <span>Export Options</span>
                </button>
              </div>
            </div>

            {/* Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Recipients</span>
                <span className="text-base font-bold text-[#002C6A] dark:text-amber-400">
                  {validatedRows.length.toLocaleString()} verified
                </span>
                <p className="text-[11px] text-slate-500">Max limit: 10,000 certificates</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Template Layout</span>
                <span className="text-base font-bold text-slate-900 dark:text-white">
                  Regulatory Locked
                </span>
                <p className="text-[11px] text-slate-500">Geometry certified compliant</p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Dzongkha Rendering</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  100% Client-Side
                </span>
                <p className="text-[11px] text-slate-500">High-DPI vectors embedded</p>
              </div>
            </div>

            {/* Big Action Download Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <button
                type="button"
                onClick={() => handleDownloadSinglePdf(previewRowIndex)}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-[#002C6A] bg-white dark:bg-slate-900 text-left hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Current PDF (#{previewRowIndex + 1})
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Download single recipient vector PDF
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadSinglePng(previewRowIndex)}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-[#002C6A] bg-white dark:bg-slate-900 text-left hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Current PNG (300 DPI)
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  3508 × 2480 px high-res graphic
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadAllZip()}
                className="p-4 rounded-2xl border-2 border-[#002C6A] bg-blue-50/40 dark:bg-slate-800 text-left hover:shadow-md transition-all group ring-2 ring-[#002C6A]/20"
              >
                <div className="w-10 h-10 rounded-xl bg-[#002C6A] text-white flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Archive className="w-5 h-5 text-[#FFF005]" />
                </div>
                <h4 className="text-xs font-bold text-[#002C6A] dark:text-white">
                  Batch Export All ({validatedRows.length.toLocaleString()})
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Download all certificates in ZIP archive
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {signatureModalField && (
        <SignatureModal
          isOpen={true}
          onClose={() => setSignatureModalField(null)}
          onSaveSignature={handleSaveSignature}
          isBulkMode={true}
          initialSignature={currentRow[signatureModalField.key] || ''}
        />
      )}

      {/* Generate Certificates Modal */}
      {selectedTemplate && (
        <GenerateCertificatesModal
          isOpen={showGenerateModal}
          onClose={() => setShowGenerateModal(false)}
          template={selectedTemplate}
          rows={validatedRows}
          currentRowIndex={previewRowIndex}
          onDownloadSinglePng={handleDownloadSinglePng}
          onDownloadSinglePdf={handleDownloadSinglePdf}
          onDownloadAllPdf={handleDownloadAllPdf}
          onDownloadAllZip={handleDownloadAllZip}
          isGenerating={isGenerating}
          progress={generationProgress}
          onCancelGeneration={handleCancelGeneration}
        />
      )}
    </div>
  );
};
