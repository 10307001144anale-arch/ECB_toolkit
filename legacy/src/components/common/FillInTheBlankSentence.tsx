import React, { useState } from 'react';
import { Sparkles, Edit3, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { TemplateField, SmartSentenceConfig, SmartSentenceTagConfig } from '../../types';
import { buildSmartSentenceSegments, formatTagValue, validateTagValue } from '../../utils/smartSentence';

interface FillInTheBlankSentenceProps {
  field: TemplateField;
  formData: Record<string, string>;
  onTagChange: (tagKey: string, value: string) => void;
  onActiveTagChange?: (tagKey: string | null) => void;
  activeTagKey?: string | null;
  onSentenceWordingChange?: (newSentence: string) => void;
}

export const FillInTheBlankSentence: React.FC<FillInTheBlankSentenceProps> = ({
  field,
  formData,
  onTagChange,
  onActiveTagChange,
  activeTagKey,
  onSentenceWordingChange,
}) => {
  const config = field.smartSentenceConfig;
  const sentence = config?.sentence || config?.templateSentence || field.defaultValue || '';
  const rawTags = config?.tags || [];
  const tagsList: SmartSentenceTagConfig[] = Array.isArray(rawTags)
    ? rawTags
    : Object.values(rawTags);
  const tagsMap: Record<string, SmartSentenceTagConfig> = {};
  tagsList.forEach((t) => {
    tagsMap[t.key] = t;
  });

  const [isEditingSentence, setIsEditingSentence] = useState(false);
  const [editedSentenceText, setEditedSentenceText] = useState(sentence);

  if (!sentence) return null;

  const segments = buildSmartSentenceSegments(sentence, tagsList, formData);

  const handleSaveEditedSentence = () => {
    setIsEditingSentence(false);
    if (onSentenceWordingChange) {
      onSentenceWordingChange(editedSentenceText);
    }
  };

  const handleResetSentence = () => {
    setEditedSentenceText(field.defaultValue || sentence);
    if (onSentenceWordingChange) {
      onSentenceWordingChange(field.defaultValue || sentence);
    }
    setIsEditingSentence(false);
  };

  return (
    <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-white to-amber-50/40 dark:from-slate-900/90 dark:via-slate-900 dark:to-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              Interactive Certificate Statement
              <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                Live Fill-in-the-Blank
              </span>
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Type directly into the highlighted blanks below or use the form fields.
            </p>
          </div>
        </div>

        {config?.clientWordingEditable && (
          <div className="flex items-center gap-1.5">
            {isEditingSentence ? (
              <button
                type="button"
                onClick={handleSaveEditedSentence}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 transition-colors"
              >
                <Check className="w-3 h-3" />
                Done
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditedSentenceText(sentence);
                  setIsEditingSentence(true);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                title="Edit surrounding phrasing (protects {tags})"
              >
                <Edit3 className="w-3 h-3" />
                Customize Phrasing
              </button>
            )}
          </div>
        )}
      </div>

      {/* Editing phrasing mode */}
      {isEditingSentence ? (
        <div className="space-y-2 pt-1">
          <textarea
            value={editedSentenceText}
            onChange={(e) => setEditedSentenceText(e.target.value)}
            rows={3}
            className="w-full text-xs p-2.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
            placeholder="Edit sentence. Keep {tags} like {name}, {cid}..."
          />
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Keep curly braces around tag keys (e.g. &#123;name&#125;)</span>
            <button
              type="button"
              onClick={handleResetSentence}
              className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Reset
            </button>
          </div>
        </div>
      ) : (
        /* Fill-in-the-blank interactive card */
        <div className="p-3.5 rounded-xl bg-white/90 dark:bg-slate-950/70 border border-indigo-100 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm leading-relaxed shadow-inner">
          {segments.map((seg, idx) => {
            if (!seg.isTag || !seg.tagKey) {
              return <span key={idx} className="whitespace-pre-wrap">{seg.text}</span>;
            }

            const tagKey = seg.tagKey;
            const tagCfg = tagsMap[tagKey];
            const rawVal = formData[tagKey] ?? '';
            const validation = tagCfg ? validateTagValue(tagCfg, rawVal) : { valid: true };
            const isActive = activeTagKey === tagKey;
            const isInvalid = !validation.valid;

            return (
              <span
                key={idx}
                className="inline-block mx-1 my-0.5 align-middle group relative"
              >
                <input
                  type={tagCfg?.inputType === 'number' ? 'number' : 'text'}
                  value={rawVal}
                  placeholder={`[ ${tagCfg?.label || tagKey} ]`}
                  onChange={(e) => onTagChange(tagKey, e.target.value)}
                  onFocus={() => onActiveTagChange?.(tagKey)}
                  onBlur={() => onActiveTagChange?.(null)}
                  style={{
                    color: tagCfg?.style?.color || '#002C6A',
                    fontWeight: tagCfg?.style?.bold ? 700 : 600,
                    fontStyle: tagCfg?.style?.italic ? 'italic' : 'normal',
                    textDecoration: tagCfg?.style?.underline ? 'underline' : 'none',
                    minWidth: Math.max(90, ((rawVal || tagCfg?.label || tagKey).length * 9) + 24) + 'px',
                  }}
                  className={`px-2 py-0.5 text-xs sm:text-sm rounded-md transition-all text-center border font-sans outline-none ${
                    isActive
                      ? 'ring-2 ring-indigo-500 border-indigo-500 bg-indigo-50/90 dark:bg-indigo-950/80'
                      : isInvalid && rawVal.length > 0
                      ? 'border-rose-400 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700'
                      : !rawVal && tagCfg?.required
                      ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/60 dark:bg-amber-950/30'
                      : 'border-indigo-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-indigo-300'
                  }`}
                />
                {isInvalid && (
                  <span
                    className="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center gap-1 px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-medium shadow-lg z-20 whitespace-nowrap"
                  >
                    <AlertCircle className="w-2.5 h-2.5" />
                    {validation.error}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};
