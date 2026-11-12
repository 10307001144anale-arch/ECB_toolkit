import { PDFDocument, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { CertificateTemplate, TemplateField } from '../types';
import { embedFontForField } from './fontManager';
import { getFormattedFieldValue, parseHexColor, resolveDynamicPlaceholders } from './formatters';
import { drawFieldOnCanvas } from './canvasRenderer';
import { generateQrDataUrl } from './qrGenerator';
import { buildFilledSentenceText } from './smartSentence';

export interface GenerationProgress {
  current: number;
  total: number;
  percent: number;
  status: string;
}

export function formatFileNamePattern(
  pattern: string,
  rowData: Record<string, any>,
  fields: TemplateField[],
  rowIndex: number
): string {
  let name = pattern || '{certificate_no}_{student_name}';

  fields.forEach((field) => {
    const val = getFormattedFieldValue(field, rowData[field.key], rowIndex);
    const placeholder = `{${field.key}}`;
    name = name.replaceAll(placeholder, val || 'unknown');
  });

  // Replace common generic tokens
  name = name.replaceAll('{index}', String(rowIndex + 1));
  name = name.replaceAll('{row}', String(rowIndex + 1));

  // Sanitize illegal filesystem characters
  const sanitized = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  return (sanitized || `certificate_${rowIndex + 1}`) + '.pdf';
}

// Cache loaded template bytes by ID
const templateBytesCache = new Map<string, ArrayBuffer>();

export async function getTemplateBytes(template: CertificateTemplate): Promise<ArrayBuffer> {
  const cacheKey = `${template.id}_${template.updatedAt || template.createdAt || 1}`;
  if (templateBytesCache.has(cacheKey)) {
    return templateBytesCache.get(cacheKey)!;
  }

  let buffer: ArrayBuffer | null = null;
  if (template.blob && typeof template.blob.arrayBuffer === 'function') {
    try {
      buffer = await template.blob.arrayBuffer();
    } catch (e) {
      console.warn('Failed reading template.blob.arrayBuffer, falling back to previewDataUrl', e);
    }
  }

  if (!buffer && template.previewDataUrl && template.previewDataUrl.includes(',')) {
    const base64 = template.previewDataUrl.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    buffer = bytes.buffer;
  }

  if (buffer) {
    templateBytesCache.set(cacheKey, buffer);
    return buffer;
  }
  throw new Error('Template image data is unavailable');
}

/**
 * Generates a single vector PDF for one certificate row
 */
export async function generateSingleCertificatePdf(
  template: CertificateTemplate,
  rowData: Record<string, any> = {},
  rowIndex: number = 0
): Promise<Uint8Array> {
  let pdfDoc: PDFDocument;

  if (template.fileType === 'application/pdf') {
    const originalPdfBytes = await getTemplateBytes(template);
    pdfDoc = await PDFDocument.load(originalPdfBytes);
  } else {
    // Image template (PNG/JPG/WEBP/SVG)
    pdfDoc = await PDFDocument.create();
    const imageBytes = await getTemplateBytes(template);
    const isJpeg = template.fileType === 'image/jpeg' || template.fileName.toLowerCase().endsWith('.jpg') || template.fileName.toLowerCase().endsWith('.jpeg');
    const image = isJpeg
      ? await pdfDoc.embedJpg(imageBytes)
      : await pdfDoc.embedPng(imageBytes);

    const page = pdfDoc.addPage([template.width, template.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: template.width,
      height: template.height,
    });
  }

  const page = pdfDoc.getPage(0);
  const { width: pW, height: pH } = page.getSize();

  // Overlay admin defined fields
  for (const field of template.fields) {
    if (field.hidden || field.width <= 0 || field.height <= 0) continue;
    let textVal = getFormattedFieldValue(field, rowData[field.key], rowIndex);

    if (field.contentMode === 'smart_sentence' && field.smartSentenceConfig) {
      textVal = buildFilledSentenceText(
        field.smartSentenceConfig.sentence,
        field.smartSentenceConfig.tags,
        rowData,
        false
      );
    } else if (field.isDynamicMessage || (typeof textVal === 'string' && textVal.includes('{'))) {
      textVal = resolveDynamicPlaceholders(textVal, rowData, rowIndex);
    }

    if (!textVal) continue;

    const boxX = (field.x / 100) * pW;
    const boxW = (field.width / 100) * pW;
    const boxH = (field.height / 100) * pH;
    const boxTop = (field.y / 100) * pH;
    const pdfBoxTop = pH - boxTop;

    // Apply prefix & suffix
    if (textVal && field.type === 'text') {
      if (field.prefix) textVal = `${field.prefix}${textVal}`;
      if (field.suffix) textVal = `${textVal}${field.suffix}`;
    }

    // A. QR Code Field
    if (field.type === 'qr') {
      try {
        let qrContent = textVal;
        if (field.qrConfig?.contentType === 'verification_url') {
          const certId = rowData['certificate_no'] || rowData['cert_id'] || rowData['id'] || `CERT-2026-${String(rowIndex + 1).padStart(4, '0')}`;
          qrContent = `${field.qrConfig.baseUrl || 'https://verify.certigen.org?id='}${certId}`;
        }
        const qrUrl = await generateQrDataUrl(qrContent || 'https://verify.certigen.org', {
          fgColor: field.qrConfig?.fgColor,
          bgColor: field.qrConfig?.bgColor,
          margin: field.qrConfig?.margin,
        });
        const b64 = qrUrl.split(',')[1];
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const qrImg = await pdfDoc.embedPng(bytes);

        const qrSize = Math.min(boxW, boxH);
        const qrX = boxX + (boxW - qrSize) / 2;
        const qrY = (pdfBoxTop - boxH) + (boxH - qrSize) / 2;

        page.drawImage(qrImg, {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
        });
      } catch (err) {
        console.warn('Failed to embed QR in PDF:', err);
      }
      continue;
    }

    // B. Check if signature or image field
    if (field.type === 'signature' || field.type === 'image' || (typeof textVal === 'string' && (textVal.startsWith('data:image/') || textVal.startsWith('blob:') || textVal.startsWith('http')))) {
      try {
        let imgBytes: Uint8Array | null = null;
        let isJpg = false;

        if (textVal.startsWith('data:image/')) {
          const base64Data = textVal.split(',')[1];
          const binaryStr = atob(base64Data);
          imgBytes = new Uint8Array(binaryStr.length);
          for (let b = 0; b < binaryStr.length; b++) {
            imgBytes[b] = binaryStr.charCodeAt(b);
          }
          isJpg = textVal.includes('jpeg') || textVal.includes('jpg');
        } else if (textVal.startsWith('http') || textVal.startsWith('/')) {
          const res = await fetch(textVal);
          const buf = await res.arrayBuffer();
          imgBytes = new Uint8Array(buf);
          isJpg = textVal.endsWith('.jpg') || textVal.endsWith('.jpeg');
        }

        if (imgBytes) {
          const embeddedImage = isJpg
            ? await pdfDoc.embedJpg(imgBytes)
            : await pdfDoc.embedPng(imgBytes);

          const imgRatio = embeddedImage.width / embeddedImage.height;
          const boxRatio = boxW / boxH;
          let dW = boxW;
          let dH = boxH;
          if (imgRatio > boxRatio) {
            dW = boxW;
            dH = boxW / imgRatio;
          } else {
            dH = boxH;
            dW = boxH * imgRatio;
          }
          const dX = boxX + (boxW - dW) / 2;
          const dY = (pdfBoxTop - boxH) + (boxH - dH) / 2;

          page.drawImage(embeddedImage, {
            x: dX,
            y: dY,
            width: dW,
            height: dH,
          });
        }
      } catch (err) {
        console.warn('Failed to embed image/signature in PDF:', err);
      }
      continue;
    }

    // Clean rich text tags for standard vector text drawing
    const cleanText = textVal.replace(/\[color=.*?\]|\[\/color\]|\*\*|\*|__/g, '');

    const font = await embedFontForField(pdfDoc, field, template);
    const colorRgb = parseHexColor(field.color);
    const pdfColor = rgb(colorRgb.r / 255, colorRgb.g / 255, colorRgb.b / 255);

    let fontSize = field.fontSize;
    const minFontSize = 7;

    // Word wrap if multiline is enabled
    let lines: string[] = [];
    if (!field.multiline) {
      lines = [cleanText];
      let textWidth = font.widthOfTextAtSize(cleanText, fontSize);
      if (field.autoShrink && textWidth > boxW && boxW > 10) {
        const scale = (boxW * 0.96) / textWidth;
        fontSize = Math.max(minFontSize, fontSize * scale);
      }
    } else {
      const getWrappedLines = (size: number) => {
        const paragraphs = cleanText.split('\n');
        const wrapped: string[] = [];
        for (const para of paragraphs) {
          const words = para.split(' ');
          let cur = '';
          for (const w of words) {
            const test = cur ? `${cur} ${w}` : w;
            if (font.widthOfTextAtSize(test, size) > boxW && cur) {
              wrapped.push(cur);
              cur = w;
            } else {
              cur = test;
            }
          }
          if (cur) wrapped.push(cur);
        }
        return wrapped;
      };

      lines = getWrappedLines(fontSize);
      let totalH = lines.length * (fontSize * 1.25);

      if (field.autoShrink) {
        while ((totalH > boxH || lines.some(l => font.widthOfTextAtSize(l, fontSize) > boxW)) && fontSize > minFontSize) {
          fontSize -= 0.5;
          lines = getWrappedLines(fontSize);
          totalH = lines.length * (fontSize * 1.25);
        }
      }
    }

    const lineHeight = fontSize * 1.25;
    const totalLinesHeight = lines.length * lineHeight;
    const vertOffset = (boxH - totalLinesHeight) / 2;
    let currentY = pdfBoxTop - vertOffset - (fontSize * 0.85);

    try {
      for (const line of lines) {
        const lineWidth = font.widthOfTextAtSize(line, fontSize);
        let lineX = boxX;
        if (field.align === 'center') {
          lineX = boxX + (boxW - lineWidth) / 2;
        } else if (field.align === 'right') {
          lineX = boxX + boxW - lineWidth - 2;
        } else {
          lineX = boxX + 2;
        }

        page.drawText(line, {
          x: lineX,
          y: currentY,
          size: fontSize,
          font: font,
          color: pdfColor,
        });

        currentY -= lineHeight;
      }
    } catch (drawErr) {
      // Fallback for complex Tibetan / Dzongkha ligatures: render crisp high-DPI text overlay
      try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.max(10, Math.round(boxW * 2));
        tempCanvas.height = Math.max(10, Math.round(boxH * 2));
        const tCtx = tempCanvas.getContext('2d')!;
        tCtx.scale(2, 2);
        
        // Render with browser's native Dzongkha text shaping
        const subField = { ...field, x: 0, y: 0, width: 100, height: 100 };
        drawFieldOnCanvas(tCtx, subField, textVal, boxW, boxH);
        
        const dataUrl = tempCanvas.toDataURL('image/png');
        const b64 = dataUrl.split(',')[1];
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        const embeddedPng = await pdfDoc.embedPng(bytes);
        page.drawImage(embeddedPng, {
          x: boxX,
          y: pdfBoxTop - boxH,
          width: boxW,
          height: boxH,
        });
      } catch (fallbackErr) {
        console.warn('Fallback canvas render for PDF field failed:', fallbackErr);
      }
    }
  }

  return await pdfDoc.save();
}

/**
 * Merges all certificates into a single consolidated multi-page PDF
 */
export async function generateMergedPdf(
  template: CertificateTemplate,
  rows: Record<string, any>[],
  onProgress?: (progress: GenerationProgress) => void,
  cancelSignal?: { cancelled: boolean }
): Promise<Blob> {
  const mergedDoc = await PDFDocument.create();
  const total = rows.length;
  const startTime = Date.now();

  for (let i = 0; i < total; i++) {
    if (cancelSignal?.cancelled) {
      throw new Error('Batch PDF generation cancelled by user.');
    }

    const singleBytes = await generateSingleCertificatePdf(template, rows[i], i);
    const singleDoc = await PDFDocument.load(singleBytes);
    const copiedPages = await mergedDoc.copyPages(singleDoc, singleDoc.getPageIndices());
    copiedPages.forEach((page) => mergedDoc.addPage(page));

    if (onProgress && (i % 3 === 0 || i === total - 1)) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = i > 0 && elapsedSec > 0 ? (i / elapsedSec).toFixed(1) : '...';
      const remainingSec = i > 0 && elapsedSec > 0 ? Math.round((total - i) / (i / elapsedSec)) : 0;
      const etaStr = remainingSec > 60 ? `${Math.round(remainingSec / 60)}m` : `${remainingSec}s`;

      onProgress({
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 100),
        status: `Merging ${i + 1} of ${total} pages (${rate}/s) · ETA: ${etaStr}`,
      });
    }

    // Yield to main thread every 3-5 certificates so UI remains responsive
    if (i % 4 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const mergedBytes = await mergedDoc.save();
  return new Blob([mergedBytes as unknown as BlobPart], { type: 'application/pdf' });
}

/**
 * Generates a ZIP archive containing individual PDFs for all rows
 * Supports up to 10,000 certificates with ETA and responsive chunking
 */
export async function generateZipArchive(
  template: CertificateTemplate,
  rows: Record<string, any>[],
  namingPattern: string,
  onProgress?: (progress: GenerationProgress) => void,
  cancelSignal?: { cancelled: boolean }
): Promise<{ zipBlob: Blob; fileNames: string[] }> {
  const zip = new JSZip();
  const folder = zip.folder('Certificates') || zip;
  const total = rows.length;
  const fileNames: string[] = [];
  const startTime = Date.now();

  for (let i = 0; i < total; i++) {
    if (cancelSignal?.cancelled) {
      throw new Error('Batch ZIP generation cancelled by user.');
    }

    const row = rows[i];
    const pdfBytes = await generateSingleCertificatePdf(template, row, i);
    const fileName = formatFileNamePattern(namingPattern, row, template.fields, i);
    fileNames.push(fileName);
    folder.file(fileName, pdfBytes);

    if (onProgress && (i % 3 === 0 || i === total - 1)) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = i > 0 && elapsedSec > 0 ? (i / elapsedSec).toFixed(1) : '...';
      const remainingSec = i > 0 && elapsedSec > 0 ? Math.round((total - i) / (i / elapsedSec)) : 0;
      const etaStr = remainingSec > 60 ? `${Math.round(remainingSec / 60)}m` : `${remainingSec}s`;

      onProgress({
        current: i + 1,
        total,
        percent: Math.round(((i + 1) / total) * 85), // 85% generation, 15% zip compression
        status: `Rendering ${i + 1} of ${total} PDFs (${rate}/s) · ETA: ${etaStr}`,
      });
    }

    // Yield so UI doesn't freeze
    if (i % 4 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (onProgress) {
    onProgress({
      current: total,
      total,
      percent: 88,
      status: `Compressing ${total} certificates into ZIP archive...`,
    });
  }

  // Use compression level 4 for fast batch compression when > 500 records
  const compressionLevel = total > 500 ? 3 : 6;

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel },
    },
    (metadata) => {
      if (onProgress) {
        onProgress({
          current: total,
          total,
          percent: 85 + Math.round((metadata.percent / 100) * 15),
          status: `Compressing ZIP archive: ${Math.round(metadata.percent)}%`,
        });
      }
    }
  );

  return { zipBlob, fileNames };
}

export function downloadBlob(blob: Blob, filename: string) {
  saveAs(blob, filename);
}
