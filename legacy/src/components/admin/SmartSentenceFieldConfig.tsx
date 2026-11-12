import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  Type,
  Calendar,
  Hash,
  List,
  Check,
  Tag as TagIcon,
  Palette,
  Eye,
  Info
} from 'lucide-react';
import {
  TemplateField,
  CertificateTemplate,
  SmartSentenceConfig,
  SmartSentenceTagConfig,
  SmartSentenceTagType,
  SmartSentenceTextCase,
  SmartSentenceDateFormat
} from '../../types';
import {
  extractTagsFromSentence,
  syncSentenceTags,
  sanitizeTagKey,
  getDefaultTagConfig,
  buildFilledSentenceText
} from '../../utils/smartSentence';
import { ECB_COLORS } from '../../utils/formatters';

interface SmartSentenceFieldConfigProps {
  field: TemplateField;
  template: CertificateTemplate;
  onUpdateField: (field: TemplateField) => void;
}

const BUILT_IN_TAGS = [
  { key: 'name', label: 'Recipient Name', placeholder: '{name}' },
  { key: 'cid', label: 'CID Number (11-digit)', placeholder: '{cid}' },
  { key: 'course', label: 'Course / Event Name', placeholder: '{course}' },
  { key: 'date', label: 'Issuance Date', placeholder: '{date}' },
  { key: 'orgname', label: 'Organization Name', placeholder: '{orgname}' },
];

export const SmartSentenceFieldConfig: React.FC<SmartSentenceFieldConfigProps> = ({
  field,
  template,
  onUpdateField,
}) => {
  const sentenceTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize SmartSentenceConfig if absent
  const initialSentence =
    field.smartSentenceConfig?.sentence ||
    field.defaultValue ||
    'This certificate is proudly awarded to {name}, CID No. {cid}, in recognition of outstanding dedication and service during the {course} on {date}.';

  const initialTags =
    field.smartSentenceConfig?.tags ||
    syncSentenceTags(initialSentence, []);

  const [sentence, setSentence] = useState<string>(initialSentence);
  const [tags, setTags] = useState<SmartSentenceTagConfig[]>(initialTags);
  const [clientWordingEditable, setClientWordingEditable] = useState<boolean>(
    field.smartSentenceConfig?.clientWordingEditable || false
  );

  const [expandedTagKey, setExpandedTagKey] = useState<string | null>(tags[0]?.key || null);
  const [showInsertMenu, setShowInsertMenu] = useState<boolean>(false);
  const [customTagInput, setCustomTagInput] = useState<string>('');
  const [showCustomTagModal, setShowCustomTagModal] = useState<boolean>(false);

  // Track initial published tags to warn if any are removed while template is published
  const [publishedTags] = useState<string[]>(() => {
    return template.isPublished && field.smartSentenceConfig
      ? field.smartSentenceConfig.tags.map((t) => t.key)
      : [];
  });

  // Detect missing published tags
  const currentTagKeys = new Set(extractTagsFromSentence(sentence));
  const removedPublishedTags = publishedTags.filter((k) => !currentTagKeys.has(k));

  // Sync internal state with props if field changes
  useEffect(() => {
    if (field.smartSentenceConfig) {
      setSentence(field.smartSentenceConfig.sentence);
      setTags(field.smartSentenceConfig.tags);
      setClientWordingEditable(field.smartSentenceConfig.clientWordingEditable || false);
    }
  }, [field.id]);

  const updateConfig = (newSentence: string, newTags: SmartSentenceTagConfig[], wordingEditable: boolean) => {
    const updatedTags = syncSentenceTags(newSentence, newTags);
    setSentence(newSentence);
    setTags(updatedTags);
    setClientWordingEditable(wordingEditable);

    const updatedConfig: SmartSentenceConfig = {
      sentence: newSentence,
      tags: updatedTags,
      clientWordingEditable: wordingEditable,
    };

    onUpdateField({
      ...field,
      contentMode: 'smart_sentence',
      smartSentenceConfig: updatedConfig,
      multiline: true, // Smart sentence requires multiline wrapping
    });
  };

  const handleSentenceChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newSentence = e.target.value;
    updateConfig(newSentence, tags, clientWordingEditable);
  };

  const handleInsertTag = (tagKey: string) => {
    const cleanKey = sanitizeTagKey(tagKey);
    if (!cleanKey) return;

    const textarea = sentenceTextareaRef.current;
    const tagToken = `{${cleanKey}}`;

    let newSentence: string;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const before = sentence.substring(0, start);
      const after = sentence.substring(end);
      newSentence = `${before}${before.endsWith(' ') || before.length === 0 ? '' : ' '}${tagToken}${after.startsWith(' ') || after.length === 0 ? '' : ' '}${after}`;
    } else {
      newSentence = `${sentence} ${tagToken}`;
    }

    updateConfig(newSentence, tags, clientWordingEditable);
    setExpandedTagKey(cleanKey);
    setShowInsertMenu(false);
    setCustomTagInput('');
    setShowCustomTagModal(false);

    // Focus back to textarea
    setTimeout(() => {
      textarea?.focus();
    }, 50);
  };

  const handleUpdateTag = (updatedTag: SmartSentenceTagConfig) => {
    const newTags = tags.map((t) => (t.key === updatedTag.key ? updatedTag : t));
    updateConfig(sentence, newTags, clientWordingEditable);
  };

  const samplePreviewText = buildFilledSentenceText(sentence, tags, {}, true);

  return (
    <div className="space-y-4 pt-2">
      {/* 1. Sentence Editor Area */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            Smart Sentence Template
          </label>
          <span className="text-[10px] text-slate-400 font-mono">
            {tags.length} dynamic {tags.length === 1 ? 'tag' : 'tags'}
          </span>
        </div>

        <div className="relative">
          <textarea
            ref={sentenceTextareaRef}
            rows={4}
            value={sentence}
            onChange={handleSentenceChange}
            placeholder="Type sentence with {name}, {cid}, {course}, {date}..."
            className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-normal leading-relaxed"
          />
        </div>

        {/* Tag Insert Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowInsertMenu(!showInsertMenu)}
              className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-indigo-200 dark:border-indigo-800 transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Insert Tag
              <ChevronDown className="w-3 h-3 ml-0.5" />
            </button>

            {/* Dropdown Menu */}
            {showInsertMenu && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl py-1 z-30 text-xs">
                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Standard Certificate Tags
                </div>
                {BUILT_IN_TAGS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => handleInsertTag(t.key)}
                    className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">{t.label}</span>
                    <span className="font-mono text-[10px] text-indigo-600 dark:text-indigo-400">{t.placeholder}</span>
                  </button>
                ))}
                <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                <button
                  type="button"
                  onClick={() => setShowCustomTagModal(true)}
                  className="w-full text-left px-3 py-1.5 hover:bg-indigo-50 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" />
                  Add Custom Tag ({'{custom}'})
                </button>
              </div>
            )}
          </div>

          {/* Quick built-in chips */}
          <div className="flex flex-wrap items-center gap-1">
            {['name', 'cid', 'course', 'date'].map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => handleInsertTag(k)}
                className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-950/40 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-mono text-[10px] border border-slate-200 dark:border-slate-700 transition-colors"
              >
                +{`{${k}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Tag Modal Input */}
        {showCustomTagModal && (
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2 mt-2">
            <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 block">
              Create New Dynamic Tag
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-slate-400 text-xs">{'{'}</span>
              <input
                type="text"
                autoFocus
                value={customTagInput}
                onChange={(e) => setCustomTagInput(sanitizeTagKey(e.target.value))}
                placeholder="e.g. venue, grade, batch"
                className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-900 font-mono text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (customTagInput) handleInsertTag(customTagInput);
                  }
                }}
              />
              <span className="font-mono text-slate-400 text-xs">{'}'}</span>
              <button
                type="button"
                onClick={() => handleInsertTag(customTagInput)}
                disabled={!customTagInput}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold"
              >
                Insert
              </button>
              <button
                type="button"
                onClick={() => setShowCustomTagModal(false)}
                className="px-2 py-1 text-slate-400 hover:text-slate-600 text-xs"
              >
                Cancel
              </button>
            </div>
            <p className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80">
              Tags are case-insensitive and auto-turn into form inputs for your clients.
            </p>
          </div>
        )}
      </div>

      {/* 2. Client Sentence Wording Permission */}
      <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
          Client Sentence Wording Control
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => updateConfig(sentence, tags, false)}
            className={`p-2 rounded-lg border text-left transition-all ${
              !clientWordingEditable
                ? 'bg-white dark:bg-slate-800 border-indigo-600 ring-1 ring-indigo-500/20 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-white">
              <Lock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Locked (Default)
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
              Clients can only fill tag values. Sentence wording cannot be changed.
            </p>
          </button>

          <button
            type="button"
            onClick={() => updateConfig(sentence, tags, true)}
            className={`p-2 rounded-lg border text-left transition-all ${
              clientWordingEditable
                ? 'bg-white dark:bg-slate-800 border-indigo-600 ring-1 ring-indigo-500/20 shadow-xs'
                : 'border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-white">
              <Unlock className="w-3.5 h-3.5 text-amber-500" />
              Editable by Client
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
              Clients can rewrite wording with protected tag chips.
            </p>
          </button>
        </div>
      </div>

      {/* 3. Published Tag Warning Banner */}
      {removedPublishedTags.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Published Tag Removed</p>
            <p className="text-[11px] mt-0.5 leading-relaxed">
              Tag <span className="font-mono font-bold">{`{${removedPublishedTags.join('}, {')}}`}</span> was removed from this published template. Existing client batches or forms using this tag may need re-mapping.
            </p>
          </div>
        </div>
      )}

      {/* 4. Detected Tags List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Detected Tags ({tags.length})
          </span>
          <span className="text-[10px] text-slate-400">Configure client inputs & styles</span>
        </div>

        {tags.length === 0 ? (
          <div className="p-4 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
            No tags found in sentence. Type <span className="font-mono text-indigo-500">{'{name}'}</span> or click <strong>Insert Tag</strong> above.
          </div>
        ) : (
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
            {tags.map((tag, idx) => {
              const isExpanded = expandedTagKey === tag.key;
              const style = tag.style || {};

              return (
                <div
                  key={tag.key}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs transition-all"
                >
                  {/* Tag Accordion Header */}
                  <div
                    onClick={() => setExpandedTagKey(isExpanded ? null : tag.key)}
                    className="p-2.5 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 font-mono font-bold text-[11px] border border-indigo-200 dark:border-indigo-900">
                        {`{${tag.key}}`}
                      </span>
                      <div>
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {tag.label}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1.5 font-mono">
                          ({tag.type}{tag.required ? ', required' : ''})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {style.color && (
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700"
                          style={{ backgroundColor: style.color }}
                          title={`Color: ${style.color}`}
                        />
                      )}
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                    </div>
                  </div>

                  {/* Tag Configuration Form */}
                  {isExpanded && (
                    <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3 text-xs">
                      {/* Label & Required */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Client Form Label
                          </label>
                          <input
                            type="text"
                            value={tag.label}
                            onChange={(e) => handleUpdateTag({ ...tag, label: e.target.value })}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Required?
                          </label>
                          <button
                            type="button"
                            onClick={() => handleUpdateTag({ ...tag, required: !tag.required })}
                            className={`w-full py-1.5 px-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                              tag.required
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                                : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <Check className="w-3 h-3" />
                            {tag.required ? 'Yes' : 'Optional'}
                          </button>
                        </div>
                      </div>

                      {/* Input Type & Options */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Input Control Type
                          </label>
                          <select
                            value={tag.type}
                            onChange={(e) => handleUpdateTag({ ...tag, type: e.target.value as SmartSentenceTagType })}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none"
                          >
                            <option value="text">Text Input</option>
                            <option value="number">Number</option>
                            <option value="date">Date Picker</option>
                            <option value="dropdown">Dropdown Options</option>
                            <option value="textarea">Multi-line Text</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Max Characters
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={tag.maxChars || ''}
                            onChange={(e) => handleUpdateTag({ ...tag, maxChars: parseInt(e.target.value) || undefined })}
                            placeholder="Optional limit"
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none"
                          />
                        </div>
                      </div>

                      {/* Dropdown Options */}
                      {tag.type === 'dropdown' && (
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Dropdown Choices (comma-separated)
                          </label>
                          <input
                            type="text"
                            value={(tag.options || []).join(', ')}
                            onChange={(e) =>
                              handleUpdateTag({
                                ...tag,
                                options: e.target.value
                                  .split(',')
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="e.g. Distinction, Honours, First Class, Pass"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none"
                          />
                        </div>
                      )}

                      {/* Default value & Placeholder */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Sample Default Value
                          </label>
                          <input
                            type="text"
                            value={tag.defaultValue || ''}
                            onChange={(e) => handleUpdateTag({ ...tag, defaultValue: e.target.value })}
                            placeholder="e.g. Karma Wangchuk"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                            Placeholder Hint
                          </label>
                          <input
                            type="text"
                            value={tag.placeholder || ''}
                            onChange={(e) => handleUpdateTag({ ...tag, placeholder: e.target.value })}
                            placeholder="e.g. Enter name..."
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none"
                          />
                        </div>
                      </div>

                      {/* Formatting Rules */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Formatting & Validation Rules
                        </span>

                        {/* Pattern Rule for CID / Numbers / Custom */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                              Format Pattern (Regex)
                            </label>
                            {tag.key.includes('cid') && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateTag({
                                    ...tag,
                                    pattern: '^[0-9]{11}$',
                                    patternErrorMessage: 'CID must be 11 numeric digits',
                                    maxChars: 11,
                                  })
                                }
                                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                              >
                                Set 11-Digit CID
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={tag.pattern || ''}
                            onChange={(e) => handleUpdateTag({ ...tag, pattern: e.target.value })}
                            placeholder="e.g. ^[0-9]{11}$ for 11 digits"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white outline-none"
                          />
                        </div>

                        {/* Text Case & Date Format */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                              Text Case
                            </label>
                            <select
                              value={tag.textCase || 'as_typed'}
                              onChange={(e) => handleUpdateTag({ ...tag, textCase: e.target.value as SmartSentenceTextCase })}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs outline-none"
                            >
                              <option value="as_typed">As Typed</option>
                              <option value="capitalize_words">Capitalize Each Word</option>
                              <option value="uppercase">UPPERCASE</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                              Numerals / Date Format
                            </label>
                            <select
                              value={tag.dateFormat || 'gregorian'}
                              onChange={(e) => handleUpdateTag({ ...tag, dateFormat: e.target.value as SmartSentenceDateFormat })}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs outline-none"
                            >
                              <option value="gregorian">Gregorian (2026-07-20)</option>
                              <option value="dzongkha">Dzongkha Numerals (༢༠༢༦-༠༧-༢༠)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Style per tag: Bold, Italic, Color, Underline */}
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Typography Style Override
                        </span>

                        <div className="flex items-center justify-between gap-2">
                          {/* Font styles */}
                          <div className="flex items-center bg-white dark:bg-slate-900 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateTag({
                                  ...tag,
                                  style: { ...style, bold: !style.bold },
                                })
                              }
                              className={`w-7 h-7 rounded font-bold text-xs flex items-center justify-center transition-colors ${
                                style.bold ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              B
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateTag({
                                  ...tag,
                                  style: { ...style, italic: !style.italic },
                                })
                              }
                              className={`w-7 h-7 rounded italic font-serif text-xs flex items-center justify-center transition-colors ${
                                style.italic ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              I
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateTag({
                                  ...tag,
                                  style: { ...style, underline: !style.underline },
                                })
                              }
                              className={`w-7 h-7 rounded underline text-xs flex items-center justify-center transition-colors ${
                                style.underline ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              U
                            </button>
                          </div>

                          {/* Color picker */}
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={style.color || field.color || '#002C6A'}
                              onChange={(e) =>
                                handleUpdateTag({
                                  ...tag,
                                  style: { ...style, color: e.target.value },
                                })
                              }
                              className="w-7 h-7 rounded border border-slate-300 dark:border-slate-700 cursor-pointer"
                            />
                            <div className="flex items-center gap-1">
                              {[ECB_COLORS.navy, ECB_COLORS.orange, ECB_COLORS.yellow, '#0f172a'].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() =>
                                    handleUpdateTag({
                                      ...tag,
                                      style: { ...style, color: c },
                                    })
                                  }
                                  style={{ backgroundColor: c }}
                                  className={`w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 transition-transform ${
                                    style.color === c ? 'scale-125 ring-1 ring-indigo-500' : ''
                                  }`}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Live Sidebar Sample Preview */}
      <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3 text-indigo-500" />
            Live Sentence Preview (With Sample Data)
          </span>
        </div>
        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
          {samplePreviewText}
        </p>
      </div>
    </div>
  );
};
