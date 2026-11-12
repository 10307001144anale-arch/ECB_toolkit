import type { ClientTemplate, ContentConfig, ContentPreset, MappingConfig } from '../../../../shared/types';
import type { CertificateRenderer } from '../../../engine/renderer';
import type { ParticipantData } from '../../../engine/spreadsheet';
import { ImageLibrary } from '../../../engine/images';
import type { BatchContext, ContentIssue, PlaceholderInfo, RowCheck } from '../../../engine/batch';

export type StepId = 'template' | 'content' | 'data' | 'mapping' | 'images' | 'preview' | 'generate';

export interface WizardState {
  template: ClientTemplate | null;
  renderer: CertificateRenderer | null;
  rendererError: string | null;
  content: ContentConfig;
  preset: ContentPreset | null;
  data: ParticipantData | null;
  mapping: MappingConfig;
  images: ImageLibrary;
  imagesVersion: number;
  excluded: Set<number>;
  /** Overflow warnings per row, filled by the "check all" pass on the preview step. */
  overflow: Map<number, string[]>;
  overflowChecked: boolean;
  batchName: string;
  confirmSkipErrors: boolean;
  /** Set once a batch has been generated, to stop accidental re-generation. */
  generatedBatchId: string | null;
}

export function initialState(): WizardState {
  return {
    template: null,
    renderer: null,
    rendererError: null,
    content: { texts: {}, qr: {}, signatures: {}, photos: {} },
    preset: null,
    data: null,
    mapping: { placeholders: {}, recipientColumn: null },
    images: new ImageLibrary(),
    imagesVersion: 0,
    excluded: new Set(),
    overflow: new Map(),
    overflowChecked: false,
    batchName: '',
    confirmSkipErrors: false,
    generatedBatchId: null,
  };
}

export interface Derived {
  registered: Set<string>;
  placeholders: PlaceholderInfo[];
  contentIssues: ContentIssue[];
  ctx: BatchContext | null;
  checks: RowCheck[];
  needsImages: boolean;
  /** Spreadsheet row indices that will be generated. */
  readyRows: number[];
  errorRows: number[];
}

export interface StepProps {
  w: WizardState;
  d: Derived;
  set: (patch: Partial<WizardState> | ((s: WizardState) => Partial<WizardState>)) => void;
  goTo: (s: StepId) => void;
}
