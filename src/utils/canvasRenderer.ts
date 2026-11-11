import { CertificateTemplate, TemplateField, SmartSentenceTagConfig } from '../types';
import { getFormattedFieldValue, resolveDynamicPlaceholders, parseRichTextSegments } from './formatters';
import { buildSmartSentenceSegments } from './smartSentence';

// Cache loaded HTMLImageElements by template ID or URL
const imageCache = new Map<string, HTMLImageElement>();
const signatureCache = new Map<string, HTMLImageElement>();

export async function loadTemplateImage(template: CertificateTemplate): Promise<HTMLImageElement> {
  const cacheKey = `${template.id}_${template.updatedAt}`;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  return new Promise((resolve, reject) => {
    img.onload = () => {
      imageCache.set(cacheKey, img);
      resolve(img);
    };
    img.onerror = (e) => reject(e);
    // Use previewDataUrl if available, else create object URL
    if (template.previewDataUrl) {
      img.src = template.previewDataUrl;
    } else {
      const url = URL.createObjectURL(template.blob);
      img.src = url;
    }
  });
}

function loadAsyncImage(url: string): Promise<HTMLImageElement> {
  if (signatureCache.has(url)) {
    return Promise.resolve(signatureCache.get(url)!);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      signatureCache.set(url, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export interface RenderFieldTextOptions {
  field: TemplateField;
  value: string;
  templateWidth: number;
  templateHeight: number;
}

/**
 * Calculates line wraps and font size considering autoShrink and box bounds
 */
export function calculateTextLayout(
  ctx: CanvasRenderingContext2D,
  text: string,
  field: TemplateField,
  boxWidth: number,
  boxHeight: number
): { lines: string[]; fontSize: number; lineHeight: number } {
  let fontSize = field.fontSize;
  const minFontSize = 8;
  const multiline = field.multiline;

  const fontStyle = `${field.fontWeight} ${fontSize}px "${field.fontFamily}", "Noto Sans Tibetan", sans-serif`;
  ctx.font = fontStyle;

  if (!multiline) {
    let lines = [text];
    let textWidth = ctx.measureText(text).width;

    if (field.autoShrink && textWidth > boxWidth && boxWidth > 10) {
      const scale = (boxWidth * 0.96) / textWidth;
      fontSize = Math.max(minFontSize, Math.floor(fontSize * scale));
      ctx.font = `${field.fontWeight} ${fontSize}px "${field.fontFamily}", "Noto Sans Tibetan", sans-serif`;
    }

    const lineHeight = fontSize * 1.25;
    return { lines, fontSize, lineHeight };
  } else {
    // Multiline wrapping
    const computeLines = (size: number) => {
      ctx.font = `${field.fontWeight} ${size}px "${field.fontFamily}", "Noto Sans Tibetan", sans-serif`;
      // Support soft breaks and newlines
      const rawParagraphs = text.split('\n');
      const allWrapped: string[] = [];

      for (const para of rawParagraphs) {
        const words = para.split(' ');
        let currentLine = '';

        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          // Strip rich text tags for measurement
          const cleanTest = testLine.replace(/\[color=.*?\]|\[\/color\]|\*\*|\*|__/g, '');
          const testWidth = ctx.measureText(cleanTest).width;

          if (testWidth > boxWidth && currentLine) {
            allWrapped.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          allWrapped.push(currentLine);
        }
      }
      return allWrapped;
    };

    let lines = computeLines(fontSize);
    let lineHeight = fontSize * 1.35;
    let totalHeight = lines.length * lineHeight;

    if (field.autoShrink) {
      while ((totalHeight > boxHeight || lines.some(l => ctx.measureText(l.replace(/\[color=.*?\]|\[\/color\]|\*\*|\*|__/g, '')).width > boxWidth)) && fontSize > minFontSize) {
        fontSize -= 1;
        lines = computeLines(fontSize);
        lineHeight = fontSize * 1.35;
        totalHeight = lines.length * lineHeight;
      }
    }

    return { lines, fontSize, lineHeight };
  }
}

import { drawQrOnCanvas } from './qrGenerator';

/**
 * Draws signature image or photograph inside the box with optional border and radius
 */
export async function drawImageOnCanvas(
  ctx: CanvasRenderingContext2D,
  imageUrl: string,
  field: TemplateField,
  templateWidth: number,
  templateHeight: number
) {
  const boxX = (field.x / 100) * templateWidth;
  const boxY = (field.y / 100) * templateHeight;
  const boxW = (field.width / 100) * templateWidth;
  const boxH = (field.height / 100) * templateHeight;

  try {
    const img = await loadAsyncImage(imageUrl);
    ctx.save();

    // Handle border radius
    const radiusType = field.imageConfig?.borderRadius || 'square';
    ctx.beginPath();
    if (radiusType === 'circle') {
      const radius = Math.min(boxW, boxH) / 2;
      ctx.arc(boxX + boxW / 2, boxY + boxH / 2, radius, 0, Math.PI * 2);
    } else if (radiusType === 'rounded') {
      const r = Math.min(16, boxW * 0.1, boxH * 0.1);
      ctx.roundRect(boxX, boxY, boxW, boxH, r);
    } else {
      ctx.rect(boxX, boxY, boxW, boxH);
    }
    ctx.clip();

    // Scale to fit (contain or cover)
    const fit = field.imageConfig?.fit || 'contain';
    const imgRatio = img.width / img.height;
    const boxRatio = boxW / boxH;

    let drawW = boxW;
    let drawH = boxH;

    if (fit === 'cover') {
      if (imgRatio > boxRatio) {
        drawH = boxH;
        drawW = boxH * imgRatio;
      } else {
        drawW = boxW;
        drawH = boxW / imgRatio;
      }
    } else {
      if (imgRatio > boxRatio) {
        drawW = boxW;
        drawH = boxW / imgRatio;
      } else {
        drawH = boxH;
        drawW = boxH * imgRatio;
      }
    }

    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();

    // Draw optional border
    if (field.imageConfig?.borderWidth && field.imageConfig.borderColor) {
      ctx.save();
      ctx.strokeStyle = field.imageConfig.borderColor;
      ctx.lineWidth = field.imageConfig.borderWidth;
      ctx.beginPath();
      if (radiusType === 'circle') {
        const radius = Math.min(boxW, boxH) / 2;
        ctx.arc(boxX + boxW / 2, boxY + boxH / 2, radius, 0, Math.PI * 2);
      } else if (radiusType === 'rounded') {
        const r = Math.min(16, boxW * 0.1, boxH * 0.1);
        ctx.roundRect(boxX, boxY, boxW, boxH, r);
      } else {
        ctx.rect(boxX, boxY, boxW, boxH);
      }
      ctx.stroke();
      ctx.restore();
    }
  } catch (e) {
    console.warn('Failed to draw image/signature:', e);
  }
}

/**
 * Draws optional signature line, name, and designation
 */
export function drawSignatureSublines(
  ctx: CanvasRenderingContext2D,
  field: TemplateField,
  templateWidth: number,
  templateHeight: number
) {
  const boxX = (field.x / 100) * templateWidth;
  const boxY = (field.y / 100) * templateHeight;
  const boxW = (field.width / 100) * templateWidth;
  const boxH = (field.height / 100) * templateHeight;

  const sigCfg = field.signatureConfig;
  if (!sigCfg) return;

  ctx.save();
  const lineY = boxY + boxH * 0.72;

  // Underline
  if (sigCfg.hasUnderline !== false) {
    ctx.strokeStyle = field.color || '#334155';
    ctx.lineWidth = Math.max(1, Math.round(templateHeight * 0.0015));
    ctx.beginPath();
    ctx.moveTo(boxX + boxW * 0.05, lineY);
    ctx.lineTo(boxX + boxW * 0.95, lineY);
    ctx.stroke();
  }

  // Name & Title
  const signerName = sigCfg.signerName;
  const signerTitle = sigCfg.signerTitle;

  if (signerName || signerTitle) {
    ctx.textAlign = 'center';
    const centerX = boxX + boxW / 2;
    const baseFontSize = Math.max(12, Math.round(templateHeight * 0.015));

    if (signerName) {
      ctx.font = `600 ${baseFontSize}px "${sigCfg.signerFont || 'Montserrat'}", sans-serif`;
      ctx.fillStyle = sigCfg.signerColor || field.color || '#0f172a';
      ctx.fillText(signerName, centerX, lineY + baseFontSize * 1.3);
    }

    if (signerTitle) {
      const titleSize = Math.max(10, Math.round(baseFontSize * 0.85));
      ctx.font = `400 ${titleSize}px "${sigCfg.signerFont || 'Montserrat'}", sans-serif`;
      ctx.fillStyle = '#64748b';
      ctx.fillText(signerTitle, centerX, lineY + baseFontSize * 1.3 + titleSize * 1.4);
    }
  }

  ctx.restore();
}

/**
 * Draws a single text field on a canvas context, handling rich text tags and Dzongkha/Tibetan fonts
 */
export function drawFieldOnCanvas(
  ctx: CanvasRenderingContext2D,
  field: TemplateField,
  value: string,
  templateWidth: number,
  templateHeight: number
) {
  const boxX = (field.x / 100) * templateWidth;
  const boxY = (field.y / 100) * templateHeight;
  const boxW = (field.width / 100) * templateWidth;
  const boxH = (field.height / 100) * templateHeight;

  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.clip();

  const { lines, fontSize, lineHeight } = calculateTextLayout(ctx, value, field, boxW, boxH);
  const totalTextHeight = lines.length * lineHeight;
  let startY = boxY + (boxH - totalTextHeight) / 2 + (fontSize * 0.85);

  lines.forEach((line) => {
    const hasMarkup = line.includes('[color=') || line.includes('**') || line.includes('*') || line.includes('__');

    if (!hasMarkup) {
      ctx.font = `${field.italic ? 'italic ' : ''}${field.fontWeight} ${fontSize}px "${field.fontFamily}", "Noto Sans Tibetan", sans-serif`;
      ctx.fillStyle = field.color || '#0f172a';

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
    } else {
      const segments = parseRichTextSegments(line, field.color || '#0f172a');
      let totalLineWidth = 0;

      segments.forEach((seg) => {
        const weight = seg.bold ? '700' : field.fontWeight;
        const style = (seg.italic || field.italic) ? 'italic ' : '';
        ctx.font = `${style}${weight} ${fontSize}px "${field.fontFamily}", "Noto Sans Tibetan", sans-serif`;
        totalLineWidth += ctx.measureText(seg.text).width;
      });

      let currentX = boxX + 4;
      if (field.align === 'center') {
        currentX = boxX + (boxW - totalLineWidth) / 2;
      } else if (field.align === 'right') {
        currentX = boxX + boxW - totalLineWidth - 4;
      }

      ctx.textAlign = 'left';
      segments.forEach((seg) => {
        const weight = seg.bold ? '700' : field.fontWeight;
        const style = (seg.italic || field.italic) ? 'italic ' : '';
        ctx.font = `${style}${weight} ${fontSize}px "${field.fontFamily}", "Noto Sans Tibetan", sans-serif`;
        ctx.fillStyle = seg.color || field.color || '#0f172a';

        ctx.fillText(seg.text, currentX, startY);
        const segWidth = ctx.measureText(seg.text).width;

        if (seg.underline) {
          ctx.strokeStyle = seg.color || field.color || '#0f172a';
          ctx.lineWidth = Math.max(1, fontSize / 14);
          ctx.beginPath();
          ctx.moveTo(currentX, startY + 2);
          ctx.lineTo(currentX + segWidth, startY + 2);
          ctx.stroke();
        }

        currentX += segWidth;
      });
    }

    startY += lineHeight;
  });

  ctx.restore();
}

/**
 * Renders the full certificate (template background + fields + signatures) onto a target canvas
 */
export async function renderCertificateToCanvas(
  targetCanvas: HTMLCanvasElement,
  template: CertificateTemplate,
  rowData: Record<string, any> = {},
  rowIndex: number = 0
): Promise<void> {
  const img = await loadTemplateImage(template);

  targetCanvas.width = template.width;
  targetCanvas.height = template.height;
  const ctx = targetCanvas.getContext('2d')!;

  // 1. Draw artwork background (or clean background if available)
  ctx.clearRect(0, 0, template.width, template.height);
  ctx.drawImage(img, 0, 0, template.width, template.height);

  // 2. Overlay admin-defined fields and signatures
  for (const field of template.fields) {
    if (field.hidden || field.width <= 0 || field.height <= 0) continue;
    const rawVal = rowData[field.key];
    let formattedVal = getFormattedFieldValue(field, rawVal, rowIndex);

    // If dynamic placeholder tag present
    if (field.isDynamicMessage || (typeof formattedVal === 'string' && formattedVal.includes('{'))) {
      formattedVal = resolveDynamicPlaceholders(formattedVal, rowData, rowIndex);
    }

    // Apply prefix & suffix for text
    if (formattedVal && field.type === 'text') {
      if (field.prefix) formattedVal = `${field.prefix}${formattedVal}`;
      if (field.suffix) formattedVal = `${formattedVal}${field.suffix}`;
    }

    const boxX = (field.x / 100) * template.width;
    const boxY = (field.y / 100) * template.height;
    const boxW = (field.width / 100) * template.width;
    const boxH = (field.height / 100) * template.height;

    // A. QR Code Field
    if (field.type === 'qr') {
      let qrText = formattedVal;
      if (field.qrConfig?.contentType === 'verification_url') {
        const certId = rowData['certificate_no'] || rowData['cert_id'] || rowData['id'] || `CERT-2026-${String(rowIndex + 1).padStart(4, '0')}`;
        qrText = `${field.qrConfig.baseUrl || 'https://verify.certigen.org?id='}${certId}`;
      }
      await drawQrOnCanvas(ctx, qrText || 'https://verify.certigen.org', boxX, boxY, boxW, boxH, {
        fgColor: field.qrConfig?.fgColor,
        bgColor: field.qrConfig?.bgColor,
        margin: field.qrConfig?.margin,
      });
      continue;
    }

    if (!formattedVal) continue;

    // B. Signature Field
    if (field.type === 'signature' || (typeof formattedVal === 'string' && (formattedVal.startsWith('data:image/') || formattedVal.startsWith('blob:') || formattedVal.startsWith('http')))) {
      await drawImageOnCanvas(ctx, formattedVal, field, template.width, template.height);
      if (field.type === 'signature') {
        drawSignatureSublines(ctx, field, template.width, template.height);
      }
      continue;
    }

    // C. Image Field
    if (field.type === 'image') {
      await drawImageOnCanvas(ctx, formattedVal, field, template.width, template.height);
      continue;
    }

    // D. Text Field (Smart Sentence vs Regular)
    if (field.contentMode === 'smart_sentence' && field.smartSentenceConfig) {
      drawSmartSentenceOnCanvas(ctx, field, rowData, template.width, template.height, false);
      continue;
    }

    drawFieldOnCanvas(ctx, field, formattedVal, template.width, template.height);
  }
}

/**
 * Draws a Smart Sentence (tagged dynamic content) with wrapped text and custom tag stylings on canvas
 */
export function drawSmartSentenceOnCanvas(
  ctx: CanvasRenderingContext2D,
  field: TemplateField,
  rowData: Record<string, any> = {},
  templateWidth: number,
  templateHeight: number,
  isWorkspace: boolean = false
): void {
  const cfg = field.smartSentenceConfig;
  if (!cfg) return;

  const boxX = (field.x / 100) * templateWidth;
  const boxY = (field.y / 100) * templateHeight;
  const boxW = (field.width / 100) * templateWidth;
  const boxH = (field.height / 100) * templateHeight;

  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, boxH);
  ctx.clip();

  const sentence = cfg.sentence || cfg.templateSentence || '';
  const rawTags = cfg.tags || [];
  const tagsList: SmartSentenceTagConfig[] = Array.isArray(rawTags)
    ? (rawTags as SmartSentenceTagConfig[])
    : (Object.values(rawTags) as SmartSentenceTagConfig[]);

  const segments = buildSmartSentenceSegments(sentence, tagsList, rowData, {
    isWorkspace,
    defaultColor: field.color || '#0f172a',
    defaultBold: field.fontWeight === '600' || (field.fontWeight as any) === '700' || (field.fontWeight as any) === 'bold',
    defaultItalic: !!field.italic,
  });

  // Calculate wrapped lines of segments
  let fontSize = field.fontSize || 32;
  const minFontSize = 10;
  const lineHeightMultiplier = 1.35;

  interface Token {
    word: string;
    seg: (typeof segments)[0];
  }

  // Split segments into individual words with whitespace preservation
  const tokens: Token[] = [];
  segments.forEach((seg) => {
    // Preserve spaces between words
    const parts = seg.text.split(/(\s+)/);
    parts.forEach((p) => {
      if (p.length > 0) {
        tokens.push({ word: p, seg });
      }
    });
  });

  const layoutLines = (curFontSize: number) => {
    const lines: Token[][] = [];
    let currentLine: Token[] = [];
    let currentLineWidth = 0;

    for (const tok of tokens) {
      const weight = tok.seg.bold ? '700' : (field.fontWeight || '400');
      const italic = tok.seg.italic || field.italic ? 'italic ' : '';
      ctx.font = `${italic}${weight} ${curFontSize}px "${field.fontFamily || 'Montserrat'}", "Noto Sans Tibetan", sans-serif`;

      const wordWidth = ctx.measureText(tok.word).width;

      if (tok.word === '\n') {
        lines.push(currentLine);
        currentLine = [];
        currentLineWidth = 0;
        continue;
      }

      if (currentLineWidth + wordWidth > boxW && currentLine.length > 0 && !/^\s+$/.test(tok.word)) {
        lines.push(currentLine);
        currentLine = [tok];
        currentLineWidth = wordWidth;
      } else {
        currentLine.push(tok);
        currentLineWidth += wordWidth;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    return lines;
  };

  let lines = layoutLines(fontSize);
  let lineHeight = fontSize * lineHeightMultiplier;
  let totalHeight = lines.length * lineHeight;

  if (field.autoShrink) {
    while (totalHeight > boxH && fontSize > minFontSize) {
      fontSize -= 1;
      lines = layoutLines(fontSize);
      lineHeight = fontSize * lineHeightMultiplier;
      totalHeight = lines.length * lineHeight;
    }
  }

  // Render lines
  let startY = boxY + (boxH - totalHeight) / 2 + fontSize * 0.85;

  lines.forEach((line) => {
    // Calculate total line width for horizontal alignment
    let lineWidth = 0;
    line.forEach((tok) => {
      const weight = tok.seg.bold ? '700' : (field.fontWeight || '400');
      const italic = tok.seg.italic || field.italic ? 'italic ' : '';
      ctx.font = `${italic}${weight} ${fontSize}px "${field.fontFamily || 'Montserrat'}", "Noto Sans Tibetan", sans-serif`;
      lineWidth += ctx.measureText(tok.word).width;
    });

    let currentX = boxX + 4;
    if (field.align === 'center') {
      currentX = boxX + (boxW - lineWidth) / 2;
    } else if (field.align === 'right') {
      currentX = boxX + boxW - lineWidth - 4;
    }

    ctx.textAlign = 'left';

    line.forEach((tok) => {
      const weight = tok.seg.bold ? '700' : (field.fontWeight || '400');
      const italic = tok.seg.italic || field.italic ? 'italic ' : '';
      ctx.font = `${italic}${weight} ${fontSize}px "${field.fontFamily || 'Montserrat'}", "Noto Sans Tibetan", sans-serif`;
      const wordWidth = ctx.measureText(tok.word).width;

      if (tok.seg.isTag && isWorkspace && tok.seg.isUnfilled) {
        // Highlight tag in admin workspace with badge-like background
        ctx.save();
        ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(currentX, startY - fontSize * 0.85, wordWidth, fontSize * 1.05, 3);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = tok.seg.color || field.color || '#0f172a';
      ctx.fillText(tok.word, currentX, startY);

      if (tok.seg.underline) {
        ctx.strokeStyle = tok.seg.color || field.color || '#0f172a';
        ctx.lineWidth = Math.max(1, fontSize / 14);
        ctx.beginPath();
        ctx.moveTo(currentX, startY + 2);
        ctx.lineTo(currentX + wordWidth, startY + 2);
        ctx.stroke();
      }

      currentX += wordWidth;
    });

    startY += lineHeight;
  });

  ctx.restore();
}

