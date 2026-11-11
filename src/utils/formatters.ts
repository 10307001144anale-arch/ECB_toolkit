import { TemplateField, TextTransform } from '../types';

export function applyTextTransform(text: string, transform: TextTransform): string {
  if (!text) return '';
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'titlecase':
      return text.replace(
        /\w\S*/g,
        (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
      );
    default:
      return text;
  }
}

export function formatDateValue(val: string | number | Date, formatPattern: string = 'MMMM D, YYYY'): string {
  if (!val) return '';
  const date = new Date(val);
  if (isNaN(date.getTime())) {
    // If it's already a formatted string, return as is
    return String(val);
  }

  const day = date.getDate();
  const dayPadded = String(day).padStart(2, '0');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthShort = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const month = date.getMonth();
  const monthPadded = String(month + 1).padStart(2, '0');
  const year = date.getFullYear();

  let formatted = formatPattern;
  formatted = formatted.replace('YYYY', String(year));
  formatted = formatted.replace('MMMM', monthNames[month]);
  formatted = formatted.replace('MMM', monthShort[month]);
  formatted = formatted.replace('MM', monthPadded);
  formatted = formatted.replace('DD', dayPadded);
  formatted = formatted.replace('D', String(day));

  return formatted;
}

export function generateCertNumber(field: TemplateField, index: number): string {
  const config = field.certNumberConfig;
  if (!config || !config.autoGenerate) {
    return field.defaultValue || '';
  }
  const num = (config.startNumber || 1) + index;
  const padded = String(num).padStart(config.padding || 4, '0');
  return `${config.prefix || ''}${padded}`;
}

export function getFormattedFieldValue(field: TemplateField, rawValue: any, rowIndex: number = 0): string {
  let val = rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== ''
    ? String(rawValue)
    : (field.defaultValue || '');

  // If auto-generate cert number is enabled and no explicit value provided
  if (field.type === 'text' && field.certNumberConfig?.autoGenerate && (!val || val === field.defaultValue)) {
    val = generateCertNumber(field, rowIndex);
  }

  if (field.type === 'date' && val) {
    val = formatDateValue(val, field.dateFormat || 'MMMM D, YYYY');
  }

  return applyTextTransform(val, field.transform || 'none');
}

export const ECB_COLORS = {
  yellow: '#FFF005',
  orange: '#F59119',
  navy: '#002C6A',
  white: '#FFFFFF',
  dark: '#0F172A',
};

export function resolveDynamicPlaceholders(
  text: string,
  rowData: Record<string, any> = {},
  rowIndex: number = 0
): string {
  if (!text) return '';
  let resolved = String(text);

  // Build lowercase and trimmed lookup map of rowData
  const lowerMap = new Map<string, any>();
  Object.keys(rowData).forEach((key) => {
    lowerMap.set(key.toLowerCase().trim(), rowData[key]);
  });

  // Replace any {token} token in curly braces
  resolved = resolved.replace(/\{([^{}]+)\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    const lowerKey = key.toLowerCase();

    // 1. Direct match in rowData
    if (rowData[key] !== undefined && rowData[key] !== null && String(rowData[key]).trim() !== '') {
      return String(rowData[key]);
    }

    // 2. Case-insensitive match in lowerMap
    if (lowerMap.has(lowerKey)) {
      const val = lowerMap.get(lowerKey);
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val);
      }
    }

    // 3. Common domain-specific aliases
    if (lowerKey === 'name' || lowerKey === 'fullname' || lowerKey === 'student_name' || lowerKey === 'recipient_name') {
      const v = rowData['name'] || rowData['student_name'] || rowData['recipient_name'] || rowData['FullName'] || rowData['full_name'];
      if (v) return String(v);
    }
    if (lowerKey === 'cid' || lowerKey === 'cid_no' || lowerKey === 'cidno' || lowerKey === 'id_number' || lowerKey === 'voter_id') {
      const v = rowData['cid'] || rowData['cid_no'] || rowData['id_number'] || rowData['voter_id'] || rowData['CID'];
      if (v) return String(v);
    }
    if (lowerKey === 'course' || lowerKey === 'course_title' || lowerKey === 'event' || lowerKey === 'training') {
      const v = rowData['course'] || rowData['course_title'] || rowData['workshop_topic'] || rowData['training'];
      if (v) return String(v);
    }
    if (lowerKey === 'date' || lowerKey === 'issue_date' || lowerKey === 'completion_date') {
      const v = rowData['date'] || rowData['issue_date'] || rowData['completion_date'];
      if (v) return String(v);
    }
    if (lowerKey === 'orgname' || lowerKey === 'org_name' || lowerKey === 'organization') {
      const v = rowData['orgname'] || rowData['organization'] || 'Election Commission of Bhutan';
      if (v) return String(v);
    }
    if (lowerKey === 'index' || lowerKey === 'row' || lowerKey === 'no') {
      return String(rowIndex + 1);
    }

    // Return original match if not found
    return match;
  });

  return resolved;
}

export interface RichTextSegment {
  text: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

/**
 * Parses rich text markup like **bold**, *italic*, __underline__, and [color=#F59119]text[/color]
 */
export function parseRichTextSegments(text: string, defaultColor: string = '#0f172a'): RichTextSegment[] {
  if (!text) return [];

  // Match [color=#HEX]content[/color] or standard text
  const colorRegex = /\[color=(#[0-9a-fA-F]{3,8})\]([\s\S]*?)\[\/color\]/g;
  const segments: RichTextSegment[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const parseInlineStyles = (raw: string, color: string) => {
    // Check for **bold**
    const parts = raw.split(/(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*|__[\s\S]+?__)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        segments.push({
          text: part.slice(2, -2),
          color,
          bold: true,
          italic: false,
          underline: false,
        });
      } else if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        segments.push({
          text: part.slice(1, -1),
          color,
          bold: false,
          italic: true,
          underline: false,
        });
      } else if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
        segments.push({
          text: part.slice(2, -2),
          color,
          bold: false,
          italic: false,
          underline: true,
        });
      } else {
        segments.push({
          text: part,
          color,
          bold: false,
          italic: false,
          underline: false,
        });
      }
    }
  };

  while ((match = colorRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parseInlineStyles(text.substring(lastIndex, match.index), defaultColor);
    }
    const color = match[1];
    const content = match[2];
    parseInlineStyles(content, color);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parseInlineStyles(text.substring(lastIndex), defaultColor);
  }

  return segments;
}

export function parseHexColor(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 15, g: 23, b: 42 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}
