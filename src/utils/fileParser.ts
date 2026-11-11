import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { DataRow, TemplateField, CertificateTemplate, SmartSentenceTagConfig } from '../types';
import { getAllTemplateTags, validateTagValue } from './smartSentence';

export interface ParseResult {
  headers: string[];
  rawRows: Record<string, any>[];
  suggestedMapping: Record<string, string>; // targetKey -> uploadedColumn
}

export interface TargetColumnDef {
  key: string;
  label: string;
  required?: boolean;
  type?: string;
  isTag?: boolean;
}

/**
 * Normalizes string for fuzzy header matching
 */
function normalizeHeaderName(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extracts all target columns to map: both regular fields and smart sentence tags
 */
export function getTargetColumns(fields: TemplateField[]): TargetColumnDef[] {
  const result: TargetColumnDef[] = [];
  const seenKeys = new Set<string>();

  // 1. Regular fields (skip hidden or container smart sentences if their tags are mapped)
  fields.forEach((field) => {
    if (field.contentMode === 'smart_sentence') {
      const rawTags = field.smartSentenceConfig?.tags || [];
      const tagsList: SmartSentenceTagConfig[] = Array.isArray(rawTags)
        ? rawTags
        : Object.values(rawTags);
      tagsList.forEach((t) => {
        if (!seenKeys.has(t.key)) {
          seenKeys.add(t.key);
          result.push({
            key: t.key,
            label: t.label || t.key,
            required: t.required,
            type: t.type || t.inputType,
            isTag: true,
          });
        }
      });
    } else {
      if (!seenKeys.has(field.key)) {
        seenKeys.add(field.key);
        result.push({
          key: field.key,
          label: field.label,
          required: field.required,
          type: field.type,
          isTag: false,
        });
      }
    }
  });

  return result;
}

export function autoMapColumns(
  uploadedColumns: string[],
  fields: TemplateField[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const targetCols = getTargetColumns(fields);

  targetCols.forEach((target) => {
    const keyNorm = normalizeHeaderName(target.key);
    const labelNorm = normalizeHeaderName(target.label);

    const match = uploadedColumns.find((col) => {
      const colNorm = normalizeHeaderName(col);
      return (
        colNorm === keyNorm ||
        colNorm === labelNorm ||
        colNorm.includes(keyNorm) ||
        keyNorm.includes(colNorm) ||
        colNorm.includes(labelNorm)
      );
    });

    if (match) {
      mapping[target.key] = match;
    }
  });

  return mapping;
}

export async function parseUploadedDataFile(file: File, fields: TemplateField[]): Promise<ParseResult> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.csv') || file.type === 'text/csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (h) => h.trim(),
        complete: (results) => {
          const headers = (results.meta.fields || []).filter(Boolean);
          const rawRows = (results.data as Record<string, any>[]).map((r) => {
            const clean: Record<string, any> = {};
            for (const k in r) {
              clean[k.trim()] = typeof r[k] === 'string' ? r[k].trim() : r[k];
            }
            return clean;
          });
          const suggestedMapping = autoMapColumns(headers, fields);
          resolve({ headers, rawRows, suggestedMapping });
        },
        error: (err) => reject(err),
      });
    });
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
      defval: '',
      raw: false,
    });

    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    const suggestedMapping = autoMapColumns(headers, fields);

    return {
      headers,
      rawRows: jsonData,
      suggestedMapping,
    };
  } else {
    throw new Error('Unsupported file format. Please upload a .csv or .xlsx file.');
  }
}

/**
 * Validates rows against template field rules and Smart Sentence tag rules
 */
export function validateMappedRows(
  rawRows: Record<string, any>[],
  fields: TemplateField[],
  mapping: Record<string, string>
): DataRow[] {
  const seenCertNumbers = new Set<string>();

  // Extract all smart sentence tags across fields
  const smartTags: Record<string, SmartSentenceTagConfig> = {};
  fields.forEach((f) => {
    if (f.contentMode === 'smart_sentence' && f.smartSentenceConfig?.tags) {
      const rawTags = f.smartSentenceConfig.tags;
      const tagsList: SmartSentenceTagConfig[] = Array.isArray(rawTags)
        ? rawTags
        : Object.values(rawTags);
      tagsList.forEach((t) => {
        smartTags[t.key] = t;
      });
    }
  });

  return rawRows.map((rawRow, index) => {
    const rowErrors: Record<string, string> = {};
    const formattedRow: Record<string, any> = {
      __rowId: `row-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    };

    // 1. Validate and map standard fields
    fields.forEach((field) => {
      const mappedCol = mapping[field.key];
      let val = mappedCol && rawRow[mappedCol] !== undefined ? String(rawRow[mappedCol]).trim() : '';

      // Check required
      if (field.required && !val && !field.defaultValue && !field.certNumberConfig?.autoGenerate) {
        if (field.contentMode !== 'smart_sentence') {
          rowErrors[field.key] = `${field.label} is required`;
        }
      }

      // Check max chars
      if (field.maxChars && val.length > field.maxChars) {
        rowErrors[field.key] = `Exceeds max limit of ${field.maxChars} chars (${val.length} chars)`;
      }

      // Check date format if date field
      if (field.type === 'date' && val) {
        const d = new Date(val);
        if (isNaN(d.getTime())) {
          rowErrors[field.key] = `Invalid date string`;
        }
      }

      // Check duplicate cert number
      if (field.type === 'text' && field.key.includes('cert') && val) {
        if (seenCertNumbers.has(val)) {
          rowErrors[field.key] = `Duplicate certificate number: "${val}"`;
        } else {
          seenCertNumbers.add(val);
        }
      }

      formattedRow[field.key] = val;
    });

    // 2. Validate and map Smart Sentence tags
    Object.keys(smartTags).forEach((tagKey) => {
      const tagCfg = smartTags[tagKey];
      const mappedCol = mapping[tagKey];
      let val = mappedCol && rawRow[mappedCol] !== undefined ? String(rawRow[mappedCol]).trim() : '';
      if (!val && formattedRow[tagKey]) {
        val = String(formattedRow[tagKey]).trim();
      }

      const validation = validateTagValue(tagCfg, val);
      if (!validation.valid) {
        rowErrors[tagKey] = validation.error || `Invalid ${tagCfg.label || tagKey}`;
      }

      formattedRow[tagKey] = val;
    });

    formattedRow.__errors = rowErrors;
    formattedRow.__isValid = Object.keys(rowErrors).length === 0;

    return formattedRow as DataRow;
  });
}

/**
 * Generates and downloads a sample CSV or Excel based on the template fields
 */
export function generateSampleFile(
  fields: TemplateField[],
  templateName: string,
  format: 'csv' | 'xlsx' = 'csv'
) {
  const targetCols = getTargetColumns(fields);
  const headers = targetCols.map((t) => t.key);

  const sampleValues: Record<string, string[]> = {
    // Standard names & smart tags
    name: ['Karma Wangchuk', 'Dechen Pem', 'Tenzin Dorji', 'Sonam Choden'],
    student_name: ['Karma Wangchuk', 'Dechen Pem', 'Tenzin Dorji', 'Sonam Choden'],
    recipient_name: ['Karma Wangchuk', 'Dechen Pem', 'Tenzin Dorji', 'Sonam Choden'],
    cid: ['11501002345', '10212000257', '11105001928', '11802003819'],
    course: ['Local Government Election Management', 'Electoral Systems & Democracy', 'Voter Registration Standards', 'Constitutional Law Seminar'],
    course_title: ['Local Government Election Management', 'Electoral Systems & Democracy', 'Voter Registration Standards', 'Constitutional Law Seminar'],
    date: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23'],
    issue_date: ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23'],
    orgname: ['Election Commission of Bhutan', 'Royal Institute of Governance', 'Centre for Bhutan & GNH Studies', 'National Council of Bhutan'],
    organization: ['Election Commission of Bhutan', 'Royal Institute of Governance', 'Centre for Bhutan & GNH Studies', 'National Council of Bhutan'],
    dzongkhag: ['Thimphu', 'Paro', 'Chhukha', 'Punakha', 'Samtse', 'Bumthang'],
    post: ['Returning Officer', 'Presiding Officer', 'Polling Official', 'Security Coordinator'],
    photo: ['/assets/aistudio/1_923d5de2.png', '/assets/aistudio/1_923d5de2.png', '/assets/aistudio/1_923d5de2.png', '/assets/aistudio/1_923d5de2.png'],
    grade: ['Distinction', 'High Merit', 'Honors', 'Exemplary'],
    venue: ['Thimphu Convention Centre', 'Paro Dzongkhag Hall', 'Punakha Auditorium', 'Bumthang Institute'],
    certificate_no: ['CERT-2026-0101', 'CERT-2026-0102', 'CERT-2026-0103', 'CERT-2026-0104'],
    certificate_id: ['ECB-2026-0501', 'ECB-2026-0502', 'ECB-2026-0503', 'ECB-2026-0504'],
    instructor_name: ['Dasho Sonam Topgay', 'Dr. Arthur Sterling, Ph.D.', 'Prof. Sarah Jenkins', 'Elena Moreau'],
  };

  const sampleRows: Record<string, any>[] = [];

  for (let r = 0; r < 4; r++) {
    const row: Record<string, any> = {};
    targetCols.forEach((target) => {
      const candidates = sampleValues[target.key] || sampleValues[target.type || ''] || [];
      if (candidates.length > 0) {
        row[target.key] = candidates[r % candidates.length];
      } else if (target.key === 'cid') {
        row[target.key] = String(11501002345 + r);
      } else if (target.type === 'date') {
        row[target.key] = '2026-07-20';
      } else if (target.type === 'number') {
        row[target.key] = String(100 + r);
      } else {
        row[target.key] = `Sample ${target.label} ${r + 1}`;
      }
    });
    sampleRows.push(row);
  }

  const safeName = templateName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  if (format === 'csv') {
    const csvString = Papa.unparse({
      fields: headers,
      data: sampleRows,
    });
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `${safeName}_sample.csv`);
  } else {
    const worksheet = XLSX.utils.json_to_sheet(sampleRows, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Certificates');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${safeName}_sample.xlsx`);
  }
}
