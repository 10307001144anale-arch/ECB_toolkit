import { ArtboardPreset } from '../types/designer';

export interface ArtboardPresetInfo {
  id: ArtboardPreset;
  label: string;
  width: number;
  height: number;
  description: string;
}

export const ARTBOARD_PRESETS: ArtboardPresetInfo[] = [
  {
    id: 'a4-landscape',
    label: 'A4 Landscape',
    width: 842,
    height: 595,
    description: '297 × 210 mm (Standard Certificate)',
  },
  {
    id: 'a4-portrait',
    label: 'A4 Portrait',
    width: 595,
    height: 842,
    description: '210 × 297 mm',
  },
  {
    id: 'letter-landscape',
    label: 'US Letter Landscape',
    width: 792,
    height: 612,
    description: '11 × 8.5 in (North American Certificate)',
  },
  {
    id: 'letter-portrait',
    label: 'US Letter Portrait',
    width: 612,
    height: 792,
    description: '8.5 × 11 in',
  },
  {
    id: 'a3-landscape',
    label: 'A3 Landscape',
    width: 1191,
    height: 842,
    description: '420 × 297 mm (Diplomas & Plaques)',
  },
  {
    id: 'custom',
    label: 'Custom Size',
    width: 900,
    height: 600,
    description: 'User-defined Dimensions',
  },
];

export const GOOGLE_FONTS = [
  'Montserrat',
  'Playfair Display',
  'Great Vibes',
  'Poppins',
  'Cinzel',
  'Plus Jakarta Sans',
  'Alex Brush',
  'Caveat',
  'JetBrains Mono',
  'Georgia',
  'Times New Roman',
  'Arial',
];

export const SWATCH_COLORS = [
  '#000000',
  '#1e293b',
  '#0f172a',
  '#002c6a',
  '#1e40af',
  '#0284c7',
  '#0d9488',
  '#15803d',
  '#c5a059',
  '#eab308',
  '#f59119',
  '#ea580c',
  '#dc2626',
  '#be123c',
  '#7c3aed',
  '#ffffff',
];

export const CERTIFICATE_PLACEHOLDERS = [
  { token: '{{recipient_name}}', label: 'Recipient Name', sample: 'Karma Wangchuk' },
  { token: '{{course_title}}', label: 'Course / Event Title', sample: 'Executive Election Administration 2026' },
  { token: '{{date}}', label: 'Date of Issuance', sample: 'November 4, 2026' },
  { token: '{{certificate_id}}', label: 'Certificate ID / Number', sample: 'CERT-2026-0849' },
  { token: '{{issuer_name}}', label: 'Issuer / Organization', sample: 'Election Commission of Bhutan' },
  { token: '{{grade}}', label: 'Grade / Distinction', sample: 'Distinction with Honors' },
];
