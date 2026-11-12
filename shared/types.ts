// Shared domain types used by both the Express backend and the React frontend.
// Keep this file free of runtime imports so it can be loaded by Node's type stripping.

export type Role = 'admin' | 'client';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organisation: string | null;
  active: boolean;
  createdAt: number;
  lastLoginAt: number | null;
}

// ---------------------------------------------------------------------------
// Template layout (admin-controlled). Coordinates are percentages (0–100)
// of the page they sit on, so they are resolution independent.
// ---------------------------------------------------------------------------

export type BoxType = 'text' | 'qr' | 'photo' | 'signature';
export type HAlign = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'middle' | 'bottom';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'titlecase';

export interface BoxBase {
  id: string;
  type: BoxType;
  /** Internal field key, e.g. recipient_name. Unique within a template. */
  key: string;
  /** Friendly label shown to clients, e.g. "Recipient name". */
  label: string;
  description: string;
  required: boolean;
  page: number; // zero-based page index
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextBox extends BoxBase {
  type: 'text';
  /** Optional wording set by the admin. Clients start from it and may keep or change it for their batch. */
  defaultText: string;
  fontFamily: string;
  fontWeight: '400' | '700';
  italic: boolean;
  color: string; // #rrggbb
  align: HAlign;
  vAlign: VAlign;
  /** Allow wrapping onto several lines. */
  wrap: boolean;
  /** Allow the client to type line breaks. */
  multiline: boolean;
  /** Shrink text between maxFontSize and minFontSize until it fits. */
  autoFit: boolean;
  fontSize: number; // pt, used when autoFit is off
  minFontSize: number;
  maxFontSize: number;
  lineHeight: number; // multiplier, e.g. 1.25
  letterSpacing: number; // pt
  transform: TextTransform;
  maxChars: number | null;
}

export type QrContentMode = 'client' | 'verification' | 'either';
export interface QrBox extends BoxBase {
  type: 'qr';
  errorCorrection: 'L' | 'M' | 'Q' | 'H';
  contentMode: QrContentMode;
  /** QR size as % of the shorter box side. */
  sizePercent: number;
  margin: number; // quiet-zone modules
  fgColor: string;
  bgColor: string;
}

export interface PhotoBox extends BoxBase {
  type: 'photo';
  fit: 'cover' | 'contain' | 'stretch';
  /** Where the image is anchored when it does not fill the box (contain) or which part is kept (cover). */
  align: 'center' | 'top' | 'bottom' | 'left' | 'right';
  shape: 'rectangle' | 'rounded' | 'circle';
  borderColor: string;
  borderWidth: number; // pt, 0 = none
}

export type SignatureSource = 'fixed' | 'client' | 'either';
export interface SignatureBox extends BoxBase {
  type: 'signature';
  source: SignatureSource;
  /** File id of an administrator-provided signature (PNG/JPG). */
  fixedSignatureFileId: string | null;
  fit: 'contain' | 'stretch';
  align: HAlign;
}

export type TemplateBox = TextBox | QrBox | PhotoBox | SignatureBox;

export interface LayoutPage {
  width: number; // pt
  height: number; // pt
  previewFileId: string | null; // rasterised PNG of the original artwork page
}

export interface CustomFontRef {
  family: string;
  fileId: string;
  weight: '400' | '700';
  italic: boolean;
}

export interface TemplateLayout {
  artworkFileId: string | null;
  artworkMime: 'application/pdf' | 'image/png' | 'image/jpeg' | null;
  pages: LayoutPage[];
  boxes: TemplateBox[];
  fonts: CustomFontRef[];
}

export type TemplateStatus = 'draft' | 'published' | 'archived';

export interface TemplateSummary {
  id: string;
  title: string;
  description: string;
  status: TemplateStatus;
  visibility: 'all' | 'assigned';
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  hasUnpublishedChanges: boolean;
  thumbnailFileId: string | null;
  boxCount: number;
  createdAt: number;
  updatedAt: number;
  usageCount?: number;
}

export interface TemplateDetail extends TemplateSummary {
  draft: TemplateLayout;
  assignedClientIds: string[];
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  versionNumber: number;
  layout: TemplateLayout;
  notes: string;
  publishedAt: number;
  publishedBy: string | null;
}

/** What a client receives for a published template. */
export interface ClientTemplate {
  id: string;
  title: string;
  description: string;
  versionId: string;
  versionNumber: number;
  layout: TemplateLayout;
  thumbnailFileId: string | null;
  publishedAt: number;
}

// ---------------------------------------------------------------------------
// Client content (client-controlled). Never stored inside a template.
// ---------------------------------------------------------------------------

export interface QrContent {
  mode: 'custom' | 'verification';
  value: string; // custom text/URL, may contain placeholders
}

export interface SignatureContent {
  /** fixed = admin signature; single = one drawn/uploaded image for everyone; column = per-participant file name column. */
  mode: 'fixed' | 'single' | 'column' | 'none';
  column: string; // spreadsheet column with file names (mode=column)
  fileName: string; // name of the single drawn/uploaded image (mode=single)
  /** Size inside the admin's box (0.3–1) and position of the leftover space (-1 left/top … 1 right/bottom). */
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface PhotoContent {
  /** Spreadsheet column with photo file names. Empty = match photos by the participant ID (e.g. CID) instead. */
  column: string;
}

/** Visible part of a photo: centre point (0–1 of the rotated image), zoom (1 = just fills the box) and rotation. */
export interface PhotoCrop {
  x: number;
  y: number;
  zoom: number;
  rotate: 0 | 90 | 180 | 270;
}

export interface ContentConfig {
  texts: Record<string, string>; // box key -> wording with placeholders
  qr: Record<string, QrContent>;
  signatures: Record<string, SignatureContent>;
  photos: Record<string, PhotoContent>;
}

export type PlaceholderType = 'text' | 'number' | 'date';

export interface PlaceholderSetting {
  column: string | null; // mapped spreadsheet column
  type: PlaceholderType;
  dateFormat: string; // used when type = date
}

export interface MappingConfig {
  placeholders: Record<string, PlaceholderSetting>;
  /** Column used as the recipient name on the public verification page (optional). */
  recipientColumn: string | null;
  /** Unique participant identifier column (normally CID), used to match photos named e.g. 10701000001.jpg. */
  idColumn: string | null;
}

export interface ContentPreset {
  id: string;
  templateId: string;
  templateTitle?: string;
  name: string;
  content: ContentConfig;
  createdAt: number;
  updatedAt: number;
}

export type BatchStatus = 'running' | 'completed' | 'partial' | 'cancelled' | 'failed';

export interface BatchRecord {
  id: string;
  name: string;
  clientId: string;
  clientName?: string;
  templateId: string;
  templateTitle: string;
  templateVersionId: string;
  templateVersionNumber: number;
  content: ContentConfig;
  mapping: MappingConfig;
  total: number;
  success: number;
  failed: number;
  status: BatchStatus;
  createdAt: number;
  completedAt: number | null;
}

export interface VerificationResult {
  valid: boolean;
  status: 'valid' | 'revoked' | 'void' | 'not_found';
  certificateId: string;
  recipientName: string | null;
  templateTitle: string | null;
  batchName: string | null;
  issuer: string | null;
  issuedAt: number | null;
}

export interface ActivityItem {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  detail: string;
  createdAt: number;
}
