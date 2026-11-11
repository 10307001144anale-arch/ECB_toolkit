import {
  SmartSentenceConfig,
  SmartSentenceTagConfig,
  SmartSentenceTagType,
  SmartSentenceTagStyle,
  CertificateTemplate,
  TemplateField
} from '../types';
import { formatDateValue } from './formatters';

// Dzongkha / Tibetan Unicode digits mapping
const DZONGKHA_DIGITS: Record<string, string> = {
  '0': '༠',
  '1': '༡',
  '2': '༢',
  '3': '༣',
  '4': '༤',
  '5': '༥',
  '6': '༦',
  '7': '༧',
  '8': '༨',
  '9': '༩',
};

/**
 * Converts Western Arabic digits (0-9) to Dzongkha / Tibetan numerals
 */
export function toDzongkhaNumerals(input: string | number): string {
  const str = String(input);
  return str.replace(/[0-9]/g, (digit) => DZONGKHA_DIGITS[digit] || digit);
}

/**
 * Sanitizes a tag key: replaces spaces with underscores, removes special punctuation, lowercases
 */
export function sanitizeTagKey(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Extracts all unique tag keys from a sentence in order of first appearance
 */
export function extractTagsFromSentence(sentence: string): string[] {
  if (!sentence) return [];
  const regex = /\{([^{}]+)\}/g;
  const tags: string[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(sentence)) !== null) {
    const rawKey = match[1].trim();
    const cleanKey = sanitizeTagKey(rawKey);
    if (cleanKey && !seen.has(cleanKey)) {
      seen.add(cleanKey);
      tags.push(cleanKey);
    }
  }

  return tags;
}

/**
 * Provides built-in smart defaults for standard certificate tags
 */
export function getDefaultTagConfig(key: string): SmartSentenceTagConfig {
  const cleanKey = sanitizeTagKey(key);

  switch (cleanKey) {
    case 'name':
    case 'recipient_name':
    case 'student_name':
      return {
        key: cleanKey,
        label: 'Recipient Full Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Karma Wangchuk',
        defaultValue: 'Karma Wangchuk',
        textCase: 'capitalize_words',
        style: {
          bold: true,
          color: '#002C6A', // Authentic ECB navy
        },
      };

    case 'cid':
    case 'cid_number':
    case 'cid_no':
      return {
        key: cleanKey,
        label: 'CID Number',
        type: 'text',
        required: true,
        placeholder: '11-digit CID (e.g. 10212000257)',
        defaultValue: '10212000257',
        pattern: '^[0-9]{11}$',
        patternErrorMessage: 'CID must be exactly 11 numeric digits',
        maxChars: 11,
        style: {
          bold: true,
          color: '#002C6A',
        },
      };

    case 'course':
    case 'course_name':
    case 'event':
    case 'workshop':
      return {
        key: cleanKey,
        label: 'Course / Event Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Local Government Election Management',
        defaultValue: 'Local Government Election Management',
        textCase: 'capitalize_words',
        style: {
          bold: true,
          color: '#002C6A',
        },
      };

    case 'date':
    case 'issue_date':
    case 'completion_date':
      return {
        key: cleanKey,
        label: 'Issuance Date',
        type: 'date',
        required: true,
        placeholder: 'YYYY-MM-DD or DD/MM/YYYY',
        defaultValue: '2026-07-20',
        dateFormat: 'gregorian',
        style: {
          bold: true,
        },
      };

    case 'orgname':
    case 'organization':
      return {
        key: cleanKey,
        label: 'Organization Name',
        type: 'text',
        required: false,
        placeholder: 'e.g. Election Commission of Bhutan',
        defaultValue: 'Election Commission of Bhutan',
        style: {
          bold: true,
        },
      };

    case 'venue':
    case 'location':
      return {
        key: cleanKey,
        label: 'Venue / Location',
        type: 'text',
        required: false,
        placeholder: 'e.g. Thimphu, Bhutan',
        defaultValue: 'Thimphu, Bhutan',
      };

    case 'grade':
    case 'division':
    case 'distinction':
      return {
        key: cleanKey,
        label: 'Grade / Distinction',
        type: 'dropdown',
        required: false,
        options: ['Distinction', 'First Division', 'Honours', 'Pass', 'Satisfactory'],
        defaultValue: 'Distinction',
        style: {
          bold: true,
          color: '#F59119', // ECB orange accent
        },
      };

    default:
      // Form friendly label from key
      const friendlyLabel = cleanKey
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      return {
        key: cleanKey,
        label: friendlyLabel,
        type: 'text',
        required: true,
        placeholder: `Enter ${friendlyLabel}`,
        defaultValue: `Sample ${friendlyLabel}`,
      };
  }
}

/**
 * Synchronizes tags configured on a SmartSentenceConfig with the sentence string.
 * Retains existing tag configurations and creates defaults for any newly discovered tags.
 */
export function syncSentenceTags(
  sentence: string,
  existingTags: SmartSentenceTagConfig[] = []
): SmartSentenceTagConfig[] {
  const detectedKeys = extractTagsFromSentence(sentence);
  const existingMap = new Map<string, SmartSentenceTagConfig>();

  for (const tag of existingTags) {
    existingMap.set(sanitizeTagKey(tag.key), tag);
  }

  return detectedKeys.map((key) => {
    if (existingMap.has(key)) {
      return existingMap.get(key)!;
    }
    return getDefaultTagConfig(key);
  });
}

/**
 * Formats a tag value according to its configuration (text case, date format, max length)
 */
export function formatTagValue(tag: SmartSentenceTagConfig, rawVal: any): string {
  let val = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';

  if (!val && tag.defaultValue) {
    val = tag.defaultValue.trim();
  }

  if (!val) return '';

  // Max characters
  if (tag.maxChars && val.length > tag.maxChars) {
    val = val.slice(0, tag.maxChars);
  }

  // Date formatting
  if (tag.type === 'date') {
    if (tag.dateFormat === 'dzongkha') {
      // Format as date string then convert digits to Dzongkha numerals
      const formattedDate = formatDateValue(val, 'DD/MM/YYYY');
      return toDzongkhaNumerals(formattedDate);
    } else {
      val = formatDateValue(val, 'DD/MM/YYYY');
    }
  }

  // Text case formatting
  if (tag.textCase === 'uppercase') {
    val = val.toUpperCase();
  } else if (tag.textCase === 'capitalize_words') {
    val = val.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
  }

  return val;
}

/**
 * Validates a value against tag rules
 */
export function validateTagValue(tag: SmartSentenceTagConfig, rawVal: any): { valid: boolean; error?: string } {
  const val = rawVal !== undefined && rawVal !== null ? String(rawVal).trim() : '';

  if (tag.required && !val) {
    return { valid: false, error: `${tag.label} is required` };
  }

  if (!val) return { valid: true };

  // Max characters
  if (tag.maxChars && val.length > tag.maxChars) {
    return { valid: false, error: `${tag.label} exceeds maximum length of ${tag.maxChars} characters` };
  }

  // Pattern check (e.g. CID regex)
  if (tag.pattern) {
    try {
      const reg = new RegExp(tag.pattern);
      if (!reg.test(val)) {
        return { valid: false, error: tag.patternErrorMessage || `${tag.label} does not match required format` };
      }
    } catch {
      // Ignore invalid regex in user config
    }
  }

  // Number type
  if (tag.type === 'number' || tag.inputType === 'number') {
    const num = Number(val);
    if (isNaN(num)) {
      return { valid: false, error: `${tag.label} must be a valid number` };
    }
  }

  // Date type
  if (tag.type === 'date' || tag.inputType === 'date') {
    const d = new Date(val);
    if (isNaN(d.getTime())) {
      return { valid: false, error: `${tag.label} must be a valid date` };
    }
  }

  return { valid: true };
}

export interface SmartSentenceSegment {
  text: string;
  isTag: boolean;
  tagKey?: string;
  tagConfig?: SmartSentenceTagConfig;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  isUnfilled?: boolean;
}

/**
 * Breaks a smart sentence into styled segments for canvas/PDF rendering
 */
export function buildSmartSentenceSegments(
  sentence: string,
  tags: SmartSentenceTagConfig[],
  rowData: Record<string, any> = {},
  options: {
    isWorkspace?: boolean; // If true in admin workspace, display sample or unfilled tags with tag badge
    isExport?: boolean;
    defaultColor?: string;
    defaultBold?: boolean;
    defaultItalic?: boolean;
  } = {}
): SmartSentenceSegment[] {
  if (!sentence) return [];

  const defaultColor = options.defaultColor || '#0f172a';
  const tagMap = new Map<string, SmartSentenceTagConfig>();
  tags.forEach((t) => tagMap.set(sanitizeTagKey(t.key), t));

  const regex = /\{([^{}]+)\}/g;
  const segments: SmartSentenceSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sentence)) !== null) {
    const start = match.index;
    const end = regex.lastIndex;
    const rawKey = match[1].trim();
    const cleanKey = sanitizeTagKey(rawKey);

    // 1. Text preceding the tag
    if (start > lastIndex) {
      const plainText = sentence.substring(lastIndex, start);
      segments.push({
        text: plainText,
        isTag: false,
        bold: !!options.defaultBold,
        italic: !!options.defaultItalic,
        underline: false,
        color: defaultColor,
      });
    }

    // 2. The tag value
    const tagConfig = tagMap.get(cleanKey) || getDefaultTagConfig(cleanKey);
    const rawVal = rowData[cleanKey] ?? rowData[rawKey] ?? rowData[tagConfig.key];
    const formattedVal = formatTagValue(tagConfig, rawVal);

    const hasValue = formattedVal.length > 0;
    const isUnfilled = !hasValue;

    // Text to display:
    // If has value -> formatted value
    // If unfilled in workspace or preview -> display "{tag}"
    const displayText = hasValue
      ? formattedVal
      : `{${cleanKey}}`;

    const tagStyle = tagConfig.style || {};

    segments.push({
      text: displayText,
      isTag: true,
      tagKey: cleanKey,
      tagConfig,
      bold: tagStyle.bold !== undefined ? tagStyle.bold : (options.defaultBold ?? true),
      italic: tagStyle.italic !== undefined ? tagStyle.italic : (options.defaultItalic ?? false),
      underline: !!tagStyle.underline,
      color: tagStyle.color || defaultColor,
      isUnfilled,
    });

    lastIndex = end;
  }

  // Trailing text
  if (lastIndex < sentence.length) {
    segments.push({
      text: sentence.substring(lastIndex),
      isTag: false,
      bold: !!options.defaultBold,
      italic: !!options.defaultItalic,
      underline: false,
      color: defaultColor,
    });
  }

  return segments;
}

/**
 * Builds the plain string filled sentence
 */
export function buildFilledSentenceText(
  sentence: string,
  tags: SmartSentenceTagConfig[],
  rowData: Record<string, any> = {},
  fallbackToPlaceholder: boolean = true
): string {
  if (!sentence) return '';
  const segments = buildSmartSentenceSegments(sentence, tags, rowData, {
    isExport: !fallbackToPlaceholder,
  });

  return segments.map((s) => s.text).join('');
}

/**
 * Collects all unique Smart Sentence tags across all fields in a template
 */
export function getAllTemplateTags(template: CertificateTemplate): SmartSentenceTagConfig[] {
  const tagsMap = new Map<string, SmartSentenceTagConfig>();

  template.fields.forEach((field) => {
    if (field.contentMode === 'smart_sentence' && field.smartSentenceConfig) {
      const sentence =
        field.smartSentenceConfig.sentence ||
        field.smartSentenceConfig.templateSentence ||
        field.defaultValue ||
        '';
      const existingTags: SmartSentenceTagConfig[] = Array.isArray(field.smartSentenceConfig.tags)
        ? field.smartSentenceConfig.tags
        : Object.values(field.smartSentenceConfig.tags || {});
      const synced = syncSentenceTags(sentence, existingTags);
      synced.forEach((tag) => {
        const key = sanitizeTagKey(tag.key);
        if (!tagsMap.has(key)) {
          tagsMap.set(key, tag);
        }
      });
    } else if (field.isDynamicMessage && field.defaultValue) {
      // Legacy dynamic message field
      const detected = extractTagsFromSentence(field.defaultValue);
      detected.forEach((key) => {
        if (!tagsMap.has(key)) {
          tagsMap.set(key, getDefaultTagConfig(key));
        }
      });
    }
  });

  return Array.from(tagsMap.values());
}

/**
 * Validates a row against all Smart Sentence tags in a template
 */
export function validateRowAgainstTemplateTags(
  template: CertificateTemplate,
  rowData: Record<string, any>
): Record<string, string> {
  const errors: Record<string, string> = {};
  const tags = getAllTemplateTags(template);

  tags.forEach((tag) => {
    const val = rowData[tag.key];
    const res = validateTagValue(tag, val);
    if (!res.valid && res.error) {
      errors[tag.key] = res.error;
    }
  });

  return errors;
}
