import React, { useState } from 'react';
import {
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Copy,
  Calendar,
  Hash,
  Sparkles,
  Sliders,
  Check,
  ChevronDown,
  Layers,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Image as ImageIcon,
  QrCode,
  PenTool,
  ArrowUp,
  ArrowDown,
  Upload,
  Link,
  ShieldCheck,
  Palette
} from 'lucide-react';
import { TemplateField, TextAlignment, TextTransform, FieldType, CertificateTemplate, SmartSentenceTagConfig } from '../../types';
import { ECB_COLORS } from '../../utils/formatters';
import { SmartSentenceFieldConfig } from './SmartSentenceFieldConfig';
import { syncSentenceTags } from '../../utils/smartSentence';

interface FieldConfigSidebarProps {
  field: TemplateField | null;
  template: CertificateTemplate;
  onUpdateField: (field: TemplateField) => void;
  onDuplicateField: (field: TemplateField) => void;
  onDeleteField: (id: string) => void;
  onSelectField: (id: string | null) => void;
  onReorderFields: (fields: TemplateField[]) => void;
  onUploadCustomFont: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const GOOGLE_FONTS = [
  'Noto Serif Tibetan',
  'Noto Sans Tibetan',
  'Jomolhari',
  'DDC Uchen',
  'Playfair Display',
  'Inter',
  'Lato',
  'Times New Roman',
  'Arial',
  'Georgia',
  'Montserrat',
  'Poppins',
  'Great Vibes',
  'Cinzel',
  'JetBrains Mono',
];

export const FieldConfigSidebar: React.FC<FieldConfigSidebarProps> = ({
  field,
  template,
  onUpdateField,
  onDuplicateField,
  onDeleteField,
  onSelectField,
  onReorderFields,
  onUploadCustomFont,
}) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'layers'>('properties');
  const fontFileRef = React.useRef<HTMLInputElement>(null);

  const update = (partial: Partial<TemplateField>) => {
    if (!field) return;
    onUpdateField({ ...field, ...partial });
  };

  const allFonts = [
    ...GOOGLE_FONTS,
    ...(template.customFonts?.map((f) => f.name) || []),
  ];

  const handleMoveLayer = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= template.fields.length) return;

    const updated = [...template.fields];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    onReorderFields(updated);
  };

  return (
    <div className="w-84 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full overflow-hidden shrink-0 shadow-lg">
      {/* Hidden Font Input */}
      <input
        ref={fontFileRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        onChange={onUploadCustomFont}
        className="hidden"
      />

      {/* Tabs Header */}
      <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-1">
        <button
          onClick={() => setActiveTab('properties')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'properties'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          Properties
        </button>
        <button
          onClick={() => setActiveTab('layers')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'layers'
              ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Field Layers ({template.fields.filter((f) => !f.hidden).length})
        </button>
      </div>

      {/* ================= TAB 1: PROPERTIES ================= */}
      {activeTab === 'properties' && (
        <>
          {!field ? (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
                <Sliders className="w-6 h-6 stroke-[1.5]" />
              </div>
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Box Selected</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-[200px] leading-relaxed">
                Click any box on the canvas or pick a tool from the left toolbar to place a new box.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Field Header & Quick Actions */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    {field.type === 'qr' ? (
                      <QrCode className="w-4 h-4" />
                    ) : field.type === 'image' ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : field.type === 'signature' ? (
                      <PenTool className="w-4 h-4" />
                    ) : (
                      <Type className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      {field.type} Box
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">{field.key}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => update({ locked: !field.locked })}
                    title={field.locked ? 'Unlock Box' : 'Lock Box Position'}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      field.locked
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 border-amber-200 dark:border-amber-800'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {field.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => onDuplicateField(field)}
                    title="Duplicate Box (Ctrl+D)"
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteField(field.id)}
                    title="Delete Box (Delete)"
                    className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 1. Common Settings */}
              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Box Name (Admin Identifier)
                  </label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => {
                      const newLabel = e.target.value;
                      const autoKey = newLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32);
                      update({ label: newLabel, key: autoKey || field.key });
                    }}
                    placeholder="e.g. Title, Content, Signature 1, Photo, QR"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Every box has a unique name shown to the client and in the field list.</p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Field Variable Key
                  </label>
                  <input
                    type="text"
                    value={field.key}
                    onChange={(e) => update({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    placeholder="e.g. recipient_name, content, title"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Used for spreadsheet column auto-mapping and dynamic tags</p>
                </div>

                {/* Client Portal Permission Mode */}
                {field.type === 'text' && (
                  <div className="p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-slate-800/60 space-y-2">
                    <label className="block font-bold text-slate-900 dark:text-white text-xs">
                      Client Portal Permission
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => update({ clientPermission: 'fixed' })}
                        className={`py-1 text-[11px] font-semibold rounded-md transition-all ${
                          (field.clientPermission || 'fill_tags_only') === 'fixed'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-amber-400 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                        }`}
                        title="Client sees text as fixed read-only"
                      >
                        Fixed
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ clientPermission: 'fill_tags_only' })}
                        className={`py-1 text-[11px] font-semibold rounded-md transition-all ${
                          (field.clientPermission || 'fill_tags_only') === 'fill_tags_only'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-amber-400 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                        }`}
                        title="Client only fills tags through spreadsheet/data table"
                      >
                        Fill Tags Only
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ clientPermission: 'fully_editable' })}
                        className={`py-1 text-[11px] font-semibold rounded-md transition-all ${
                          field.clientPermission === 'fully_editable'
                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-amber-400 shadow-xs'
                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                        }`}
                        title="Client can write wording and insert tag buttons"
                      >
                        Fully Editable
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {field.clientPermission === 'fixed'
                        ? 'Read-only on client side. Client cannot modify the text or tags.'
                        : field.clientPermission === 'fully_editable'
                        ? 'Client can edit the sentence wording and insert protected tag buttons like [{name}].'
                        : 'Default sentence is locked; client fills tags like {name}, {cid} via the data table.'}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Box Type
                    </label>
                    <select
                      value={field.type}
                      onChange={(e) => update({ type: e.target.value as FieldType })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="text">Text Field</option>
                      <option value="image">Image / Photo</option>
                      <option value="qr">QR Code</option>
                      <option value="signature">Signature</option>
                      <option value="date">Date</option>
                      <option value="number">Number</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => update({ required: !field.required })}
                      className={`w-full py-1.5 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                        field.required
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      {field.required ? 'Mandatory' : 'Optional'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Default / Sample Value
                  </label>
                  <input
                    type="text"
                    value={field.defaultValue}
                    onChange={(e) => update({ defaultValue: e.target.value })}
                    placeholder="e.g. Karma Wangchuk"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Helper Text for User
                  </label>
                  <input
                    type="text"
                    value={field.helperText || ''}
                    onChange={(e) => update({ helperText: e.target.value })}
                    placeholder="Instructions shown on client fill page"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                {/* Box Geometry Percentages */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Position & Bounds (% of Canvas)
                  </span>
                  <div className="grid grid-cols-4 gap-1.5 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-400 block text-[9px]">X%</span>
                      <input
                        type="number"
                        step="0.1"
                        value={field.x}
                        onChange={(e) => update({ x: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">Y%</span>
                      <input
                        type="number"
                        step="0.1"
                        value={field.y}
                        onChange={(e) => update({ y: parseFloat(e.target.value) || 0 })}
                        className="w-full px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">W%</span>
                      <input
                        type="number"
                        step="0.1"
                        value={field.width}
                        onChange={(e) => update({ width: parseFloat(e.target.value) || 1 })}
                        className="w-full px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px]">H%</span>
                      <input
                        type="number"
                        step="0.1"
                        value={field.height}
                        onChange={(e) => update({ height: parseFloat(e.target.value) || 1 })}
                        className="w-full px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. TYPE-SPECIFIC PROPERTIES: TEXT */}
              {(field.type === 'text' || field.type === 'date' || field.type === 'number') && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  {/* Content Mode Toggle for Text Fields */}
                  {field.type === 'text' && (
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                          Content Mode
                        </span>
                        <div className="inline-flex rounded-lg bg-slate-200 dark:bg-slate-900 p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => update({ contentMode: 'plain' })}
                            className={`px-2.5 py-1 rounded-md transition-all ${
                              field.contentMode !== 'smart_sentence'
                                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                          >
                            Plain Text
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const templateSentence =
                                field.smartSentenceConfig?.sentence ||
                                field.smartSentenceConfig?.templateSentence ||
                                (field.defaultValue && field.defaultValue.includes('{')
                                  ? field.defaultValue
                                  : 'This certificate is proudly awarded to {name}, CID No. {cid}, in recognition of outstanding dedication and service during the {course} on {date}.');
                              const rawTags = field.smartSentenceConfig?.tags;
                              const existingTags: SmartSentenceTagConfig[] = Array.isArray(rawTags)
                                ? rawTags
                                : Object.values(rawTags || {});
                              const syncedTags = syncSentenceTags(templateSentence, existingTags);
                              update({
                                contentMode: 'smart_sentence',
                                multiline: true,
                                smartSentenceConfig: {
                                  sentence: templateSentence,
                                  templateSentence,
                                  tags: syncedTags,
                                  clientWordingEditable: field.smartSentenceConfig?.clientWordingEditable ?? false,
                                },
                              });
                            }}
                            className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                              field.contentMode === 'smart_sentence'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                          >
                            <Sparkles className="w-3 h-3" />
                            Smart Sentence
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {field.contentMode === 'smart_sentence'
                          ? 'Use dynamic tags like {name}, {cid}, {course}, {date}. The client fills each tag dynamically!'
                          : 'Simple single text value, filled in full by the recipient or admin.'}
                      </p>
                    </div>
                  )}

                  {/* Smart Sentence Tagged Content Editor */}
                  {field.type === 'text' && field.contentMode === 'smart_sentence' && (
                    <SmartSentenceFieldConfig
                      field={field}
                      template={template}
                      onUpdateField={onUpdateField}
                    />
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {field.contentMode === 'smart_sentence' ? 'Base Sentence Typography' : 'Typography & Text Styling'}
                    </span>
                    <button
                      type="button"
                      onClick={() => fontFileRef.current?.click()}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                    >
                      <Upload className="w-3 h-3" />
                      + Upload Font
                    </button>
                  </div>

                  {/* Font Family */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Font Family
                    </label>
                    <select
                      value={field.fontFamily}
                      onChange={(e) => update({ fontFamily: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none"
                    >
                      {allFonts.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Font Size & Weight */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Font Size: <span className="font-mono">{field.fontSize}px</span>
                      </label>
                      <input
                        type="range"
                        min="12"
                        max="140"
                        value={field.fontSize}
                        onChange={(e) => update({ fontSize: parseInt(e.target.value) || 24 })}
                        className="w-full accent-indigo-600"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Weight
                      </label>
                      <select
                        value={field.fontWeight}
                        onChange={(e) => update({ fontWeight: e.target.value as any })}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none"
                      >
                        <option value="300">Light 300</option>
                        <option value="400">Regular 400</option>
                        <option value="500">Medium 500</option>
                        <option value="600">SemiBold 600</option>
                        <option value="700">Bold 700</option>
                      </select>
                    </div>
                  </div>

                  {/* Alignment & Italic */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => update({ align: 'left' })}
                        className={`p-1.5 rounded ${field.align === 'left' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500'}`}
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ align: 'center' })}
                        className={`p-1.5 rounded ${field.align === 'center' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500'}`}
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ align: 'right' })}
                        className={`p-1.5 rounded ${field.align === 'right' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-xs' : 'text-slate-500'}`}
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => update({ italic: !field.italic })}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-serif italic ${
                        field.italic
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 border-indigo-200 dark:border-indigo-800'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      Italic
                    </button>
                  </div>

                  {/* Color Picker with ECB swatches */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Text Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={field.color}
                        onChange={(e) => update({ color: e.target.value })}
                        className="w-8 h-8 rounded border border-slate-300 dark:border-slate-700 cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={field.color}
                        onChange={(e) => update({ color: e.target.value })}
                        className="flex-1 px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-xs uppercase"
                      />
                    </div>
                    {/* ECB Palette Quick Buttons */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-slate-400">ECB:</span>
                      {[
                        { color: ECB_COLORS.yellow, title: 'Yellow (#FFF005)' },
                        { color: ECB_COLORS.orange, title: 'Orange (#F59119)' },
                        { color: ECB_COLORS.navy, title: 'Navy (#002C6A)' },
                        { color: '#ffffff', title: 'White (#FFFFFF)' },
                        { color: '#0f172a', title: 'Slate Dark' },
                      ].map((c) => (
                        <button
                          key={c.color}
                          type="button"
                          onClick={() => update({ color: c.color })}
                          title={c.title}
                          style={{ backgroundColor: c.color }}
                          className={`w-4 h-4 rounded-full border border-slate-400 transition-transform ${field.color === c.color ? 'scale-125 ring-1 ring-indigo-500' : ''}`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Line Height & Letter Spacing */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Line Height: <span className="font-mono">{field.lineHeight || 1.3}</span>
                      </label>
                      <input
                        type="range"
                        min="1.0"
                        max="2.5"
                        step="0.05"
                        value={field.lineHeight || 1.3}
                        onChange={(e) => update({ lineHeight: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Letter Spacing: <span className="font-mono">{field.letterSpacing || 0}px</span>
                      </label>
                      <input
                        type="range"
                        min="-2"
                        max="12"
                        step="0.5"
                        value={field.letterSpacing || 0}
                        onChange={(e) => update({ letterSpacing: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-600"
                      />
                    </div>
                  </div>

                  {/* Prefix & Suffix */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Prefix</label>
                      <input
                        type="text"
                        value={field.prefix || ''}
                        onChange={(e) => update({ prefix: e.target.value })}
                        placeholder="e.g. ID: "
                        className="w-full px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Suffix</label>
                      <input
                        type="text"
                        value={field.suffix || ''}
                        onChange={(e) => update({ suffix: e.target.value })}
                        placeholder="e.g.  (Honors)"
                        className="w-full px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. TYPE-SPECIFIC PROPERTIES: QR CODE */}
              {field.type === 'qr' && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    QR Code Configuration
                  </span>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Content Mode
                    </label>
                    <select
                      value={field.qrConfig?.contentType || 'verification_url'}
                      onChange={(e) =>
                        update({
                          qrConfig: {
                            ...field.qrConfig,
                            contentType: e.target.value as any,
                          },
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none"
                    >
                      <option value="verification_url">Auto Verification URL (with Cert ID)</option>
                      <option value="url">Fixed URL</option>
                      <option value="text">Raw Text String</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Verification Base URL
                    </label>
                    <input
                      type="text"
                      value={field.qrConfig?.baseUrl || 'https://verify.certigen.org?id='}
                      onChange={(e) =>
                        update({
                          qrConfig: {
                            ...field.qrConfig,
                            contentType: field.qrConfig?.contentType || 'verification_url',
                            baseUrl: e.target.value,
                          },
                        })
                      }
                      placeholder="https://verify.ecb.bt?id="
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs outline-none"
                    />
                  </div>
                </div>
              )}

              {/* 4. TYPE-SPECIFIC PROPERTIES: IMAGE */}
              {field.type === 'image' && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Image & Photo Settings
                  </span>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Scaling Fit
                      </label>
                      <select
                        value={field.imageConfig?.fit || 'contain'}
                        onChange={(e) =>
                          update({
                            imageConfig: {
                              borderRadius: field.imageConfig?.borderRadius || 'square',
                              ...field.imageConfig,
                              fit: e.target.value as any,
                            },
                          })
                        }
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      >
                        <option value="contain">Contain (Entire Image)</option>
                        <option value="cover">Cover (Fill Box)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Border Radius
                      </label>
                      <select
                        value={field.imageConfig?.borderRadius || 'rounded'}
                        onChange={(e) =>
                          update({
                            imageConfig: {
                              fit: field.imageConfig?.fit || 'contain',
                              ...field.imageConfig,
                              borderRadius: e.target.value as any,
                            },
                          })
                        }
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      >
                        <option value="square">Square</option>
                        <option value="rounded">Rounded Corners</option>
                        <option value="circle">Circular / Oval</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. TYPE-SPECIFIC PROPERTIES: SIGNATURE */}
              {field.type === 'signature' && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Signature Settings
                  </span>

                  {/* Allowed methods */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Allowed Client Input Methods:
                    </label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.signatureConfig?.allowedMethods?.draw ?? true}
                          onChange={(e) =>
                            update({
                              signatureConfig: {
                                ...field.signatureConfig,
                                allowedMethods: {
                                  upload: field.signatureConfig?.allowedMethods?.upload ?? true,
                                  type: field.signatureConfig?.allowedMethods?.type ?? true,
                                  draw: e.target.checked,
                                },
                              },
                            })
                          }
                          className="rounded accent-indigo-600"
                        />
                        <span>Draw with mouse / touchscreen</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.signatureConfig?.allowedMethods?.type ?? true}
                          onChange={(e) =>
                            update({
                              signatureConfig: {
                                ...field.signatureConfig,
                                allowedMethods: {
                                  upload: field.signatureConfig?.allowedMethods?.upload ?? true,
                                  draw: field.signatureConfig?.allowedMethods?.draw ?? true,
                                  type: e.target.checked,
                                },
                              },
                            })
                          }
                          className="rounded accent-indigo-600"
                        />
                        <span>Type cursive script font</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.signatureConfig?.allowedMethods?.upload ?? true}
                          onChange={(e) =>
                            update({
                              signatureConfig: {
                                ...field.signatureConfig,
                                allowedMethods: {
                                  draw: field.signatureConfig?.allowedMethods?.draw ?? true,
                                  type: field.signatureConfig?.allowedMethods?.type ?? true,
                                  upload: e.target.checked,
                                },
                              },
                            })
                          }
                          className="rounded accent-indigo-600"
                        />
                        <span>Upload PNG signature image</span>
                      </label>
                    </div>
                  </div>

                  {/* Sub-lines */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Printed Authority Details Underneath
                    </span>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Signatory Full Name</label>
                      <input
                        type="text"
                        value={field.signatureConfig?.signerName || ''}
                        onChange={(e) =>
                          update({
                            signatureConfig: {
                              allowedMethods: field.signatureConfig?.allowedMethods || { upload: true, draw: true, type: true },
                              ...field.signatureConfig,
                              signerName: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. Dasho Sonam Topgay"
                        className="w-full px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">Designation / Title</label>
                      <input
                        type="text"
                        value={field.signatureConfig?.signerTitle || ''}
                        onChange={(e) =>
                          update({
                            signatureConfig: {
                              allowedMethods: field.signatureConfig?.allowedMethods || { upload: true, draw: true, type: true },
                              ...field.signatureConfig,
                              signerTitle: e.target.value,
                            },
                          })
                        }
                        placeholder="e.g. Chief Election Commissioner"
                        className="w-full px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ================= TAB 2: FIELD LAYERS ================= */}
      {activeTab === 'layers' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          <div className="flex items-center justify-between pb-2 px-1 text-[11px] text-slate-500">
            <span>Visual Stack Order</span>
            <span>{template.fields.length} Fields</span>
          </div>

          {template.fields.map((f, idx) => {
            const isSelected = f.id === field?.id;
            return (
              <div
                key={f.id}
                onClick={() => onSelectField(f.id)}
                className={`flex items-center justify-between p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-white shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[10px] font-mono text-slate-400 w-4">#{idx + 1}</span>
                  <div className="w-5 h-5 rounded flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0">
                    {f.type === 'qr' ? (
                      <QrCode className="w-3 h-3 text-indigo-500" />
                    ) : f.type === 'image' ? (
                      <ImageIcon className="w-3 h-3 text-emerald-500" />
                    ) : f.type === 'signature' ? (
                      <PenTool className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Type className="w-3 h-3 text-blue-500" />
                    )}
                  </div>
                  <div className="truncate">
                    <p className="font-semibold truncate">{f.label}</p>
                    <p className="text-[10px] text-slate-400 font-mono truncate">{f.key}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleMoveLayer(idx, 'up')}
                    disabled={idx === 0}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleMoveLayer(idx, 'down')}
                    disabled={idx === template.fields.length - 1}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onUpdateField({ ...f, locked: !f.locked })}
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400"
                  >
                    {f.locked ? <Lock className="w-3 h-3 text-amber-500" /> : <Unlock className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
