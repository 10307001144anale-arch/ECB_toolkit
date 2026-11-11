export type ToolType =
  | 'select'
  | 'direct-select'
  | 'rectangle'
  | 'ellipse'
  | 'type'
  | 'hand'
  | 'zoom'
  | 'pen';

export type ArtboardPreset =
  | 'a4-landscape'
  | 'a4-portrait'
  | 'letter-landscape'
  | 'letter-portrait'
  | 'a3-landscape'
  | 'custom';

export interface ArtboardConfig {
  id: string;
  name: string;
  preset: ArtboardPreset;
  width: number;       // in points/pixels (e.g. 842 for A4 landscape)
  height: number;      // in points/pixels (e.g. 595 for A4 landscape)
  bleed: number;       // in points/pixels (e.g. 9 for 3mm)
  safeMargin: number;  // in points/pixels (e.g. 24)
  backgroundColor: string;
}

export interface Guide {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number; // in artboard coordinate space
}

export interface SelectedObjectProperties {
  type: string;
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  // Text specific
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: string;
  charSpacing?: number;
  lineHeight?: number;
  // Rectangle specific
  rx?: number;
  ry?: number;
}

export interface LayerItem {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  isSelected: boolean;
  objectRef: any;
}
