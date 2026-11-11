export type FieldType = 'text' | 'image' | 'qr' | 'signature' | 'date' | 'number';

export type TextAlignment = 'left' | 'center' | 'right';
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'titlecase' | 'capitalize';

export interface CertNumberConfig {
  autoGenerate: boolean;
  prefix: string;
  startNumber: number;
  padding: number;
}

export interface ImageConfig {
  fit: 'cover' | 'contain';
  borderRadius: 'square' | 'rounded' | 'circle';
  borderColor?: string;
  borderWidth?: number;
  allowCrop?: boolean;
}

export interface QrConfig {
  contentType: 'text' | 'url' | 'verification_url';
  baseUrl?: string; // e.g. "https://verify.certigen.org/check?id="
  fgColor?: string; // default "#000000"
  bgColor?: string; // default "#ffffff"
  margin?: number;  // default 2
}

export interface SignatureConfig {
  allowedMethods: {
    upload: boolean;
    draw: boolean;
    type: boolean;
  };
  hasUnderline?: boolean;
  signerName?: string;
  signerTitle?: string;
  signerFont?: string;
  signerColor?: string;
}

export type SmartSentenceTagType = 'text' | 'number' | 'date' | 'dropdown' | 'textarea';
export type SmartSentenceTextCase = 'as_typed' | 'uppercase' | 'capitalize_words';
export type SmartSentenceDateFormat = 'gregorian' | 'dzongkha';

export interface SmartSentenceTagStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string; // Hex, e.g. '#002C6A'
}

export interface SmartSentenceTagConfig {
  key: string;                       // e.g. "name", "cid", "course", "date", "orgname", "venue", "grade"
  label: string;                     // Shown to client, e.g. "Recipient Name"
  type: SmartSentenceTagType;        // text, number, date, dropdown, textarea
  inputType?: SmartSentenceTagType;  // Alias for type
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  maxChars?: number;
  pattern?: string;                  // e.g. "^[0-9]{11}$" for 11-digit CID
  patternErrorMessage?: string;
  dateFormat?: SmartSentenceDateFormat; // 'gregorian' | 'dzongkha'
  textCase?: SmartSentenceTextCase;     // 'as_typed' | 'uppercase' | 'capitalize_words'
  options?: string[];                // Options for dropdown type
  style?: SmartSentenceTagStyle;     // Style overrides per tag
}

export interface SmartSentenceConfig {
  sentence: string;                  // Sentence template with {tag} tokens
  templateSentence?: string;         // Alias for sentence
  tags: SmartSentenceTagConfig[];
  clientWordingEditable?: boolean;   // If false, client only fills tags; if true, can edit surrounding text
}

export interface TemplateField {
  id: string;
  key: string;               // e.g. "recipient_name", "qr_code", "signature_1", "message"
  label: string;             // e.g. "Recipient Name", "Verification QR", "Authorized Signatory"
  type: FieldType;
  required: boolean;
  defaultValue: string;
  helperText?: string;       // Guidance shown to the user on client fill page
  locked?: boolean;          // Admin can lock box from being accidentally moved
  hidden?: boolean;          // Used for background dynamic variable tags

  // Box position and dimensions normalized as percentage (0-100%) of template dimensions
  x: number;
  y: number;
  width: number;
  height: number;

  // Text Typography
  fontFamily: string;
  fontSize: number;          // In px/pt relative to template resolution
  fontWeight: '300' | '400' | '500' | '600' | '700';
  italic?: boolean;
  color: string;             // Hex code, e.g. '#002C6A'
  align: TextAlignment;
  lineHeight?: number;       // e.g. 1.2, 1.4, 1.6
  letterSpacing?: number;    // in px, e.g. 0, 1, 2
  autoShrink: boolean;
  maxChars?: number;
  transform: TextTransform;
  multiline: boolean;
  prefix?: string;           // e.g. "Certificate No: "
  suffix?: string;           // e.g. " (Honors)"
  dateFormat?: string;       // e.g. 'DD/MM/YYYY', 'MMMM D, YYYY'
  certNumberConfig?: CertNumberConfig;

  // Client access control per text box
  clientPermission?: 'fixed' | 'fill_tags_only' | 'fully_editable'; // default 'fill_tags_only'

  // Smart Dynamic & Rich features
  contentMode?: 'plain' | 'smart_sentence'; // Defaults to 'plain'
  smartSentenceConfig?: SmartSentenceConfig;
  isDynamicMessage?: boolean; // If true, replaces {name}, {cid}, {course}, {date}, etc.
  richFormatting?: boolean;   // If true, parses **bold**, *italic*, [color=#hex]...[/color]

  // Image box settings
  imageConfig?: ImageConfig;

  // QR box settings
  qrConfig?: QrConfig;

  // Signature box settings
  signatureConfig?: SignatureConfig;
}

export interface CustomFont {
  id: string;
  name: string;
  fileName: string;
  dataUrl: string; // Base64 TTF or OTF
}

export type PageSizePreset = 'match' | 'a4-landscape' | 'a4-portrait' | 'letter-landscape' | 'letter-portrait';

export interface CertificateTemplate {
  id: string;
  name: string;
  fileName: string;
  fileType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml' | 'application/pdf';
  blob: Blob;
  previewDataUrl: string;    // Main image containing template artwork (or with boxes)
  cleanDataUrl?: string;     // Clean background image with placeholder boxes removed
  pageSize?: PageSizePreset;
  width: number;             // Width in px
  height: number;            // Height in px
  fields: TemplateField[];
  customFonts?: CustomFont[];
  isPublished?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GenerationHistoryItem {
  id: string;
  templateId: string;
  templateName: string;
  timestamp: number;
  totalCount: number;
  successCount: number;
  skippedCount: number;
  namingPattern: string;
  sampleNames: string[];
}

export interface RowValidationError {
  row: number;
  fieldKey: string;
  fieldLabel: string;
  message: string;
  value: string;
}

export interface DataRow {
  __rowId: string;
  __isValid: boolean;
  __errors: Record<string, string>;
  [key: string]: any;
}
