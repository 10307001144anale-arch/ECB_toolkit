import React, { useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Maximize2,
  Minimize2,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { ECB_COLORS, resolveDynamicPlaceholders } from '../../utils/formatters';

interface RichMessageEditorProps {
  value: string;
  onChange: (newValue: string) => void;
  rowData?: Record<string, any>;
  label?: string;
}

export const DZONGKHA_SAMPLE_BODY = `རྒྱལ་ཡོངས་འོས་བསྡུ་ ལྷན་ཚོགས་ཀྱིས་ ཆོས་སྡེ་ཁག་གི་འགོ་ཁྲིདཔ་ཚུ་གི་དོན་ལུ་
{cid}
ཅན་མ་ {name} དེ་གིས་ སྤྱི་ལོ་ {date} ལུ་ མཛད་**text**བཞུགས་བྱུང་ནི་
སྦྱོང་བརྡར་ནང་ལུ་
ཆོས་སྡེའི་ཚོགས་པའི་ བཅའ་ཁྲིམས་འགྲེལ་བཤད་དང་འབྲེལ་བའི་ ཁྲིམས་དོན་གྱི་
[color=#F59119]གོ་དོན་དང་ རྒྱལ་མཚུན་བཅའ་[/color]ཁྲིམས་`;

export const ENGLISH_SAMPLE_BODY = `This certificate is proudly awarded to {name}, CID No. {cid}, in recognition of outstanding dedication and service during the {course} on {date}.`;

export const RichMessageEditor: React.FC<RichMessageEditorProps> = ({
  value,
  onChange,
  rowData = {},
  label = 'CERTIFICATE BODY TEXT',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEnlarged, setIsEnlarged] = useState<boolean>(false);
  const [showColorDropdown, setShowColorDropdown] = useState<boolean>(false);

  // Helper to wrap text or insert at cursor
  const insertFormatting = (prefix: string, suffix: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    const selectedText = text.substring(start, end);
    const replacement = `${prefix}${selectedText}${suffix}`;

    const nextValue = text.substring(0, start) + replacement + text.substring(end);
    onChange(nextValue);

    // Set cursor back
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 10);
  };

  const insertTag = (tag: string) => {
    insertFormatting(tag);
  };

  const applyColor = (colorHex: string) => {
    insertFormatting(`[color=${colorHex}]`, `[/color]`);
    setShowColorDropdown(false);
  };

  const resolvedPreview = resolveDynamicPlaceholders(value, rowData);

  const editorContent = (
    <div className="space-y-1.5 font-sans">
      {/* Top Header - matches screenshot: CERTIFICATE BODY TEXT with Pop Up / Enlarge link */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[12px] font-bold text-slate-800 dark:text-slate-100 tracking-wider uppercase">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setIsEnlarged(!isEnlarged)}
          className="text-[12px] font-semibold text-[#F59119] hover:text-[#e08010] flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span>↗</span>
          <span>{isEnlarged ? 'Close / Shrink' : 'Pop Up / Enlarge'}</span>
        </button>
      </div>

      {/* Main Container - Dark themed exactly as in the user screenshot */}
      <div className="bg-[#18181b] text-white rounded-xl p-2.5 space-y-2 border border-[#27272a] shadow-lg">
        {/* Row 1: Formatting Toolbar [ B ] [ I ] [ U ] [ A ▾ ] */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-[#27272a]/70 rounded-lg p-0.5 border border-[#3f3f46]/60">
            <button
              type="button"
              onClick={() => insertFormatting('**', '**')}
              title="Bold (**text**)"
              className="w-7 h-7 rounded hover:bg-[#3f3f46] text-slate-200 hover:text-white flex items-center justify-center font-bold text-xs transition-colors"
            >
              <span className="font-bold text-sm">B</span>
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('*', '*')}
              title="Italic (*text*)"
              className="w-7 h-7 rounded hover:bg-[#3f3f46] text-slate-200 hover:text-white flex items-center justify-center italic text-xs transition-colors font-serif"
            >
              <span className="italic text-sm">I</span>
            </button>
            <button
              type="button"
              onClick={() => insertFormatting('__', '__')}
              title="Underline (__text__)"
              className="w-7 h-7 rounded hover:bg-[#3f3f46] text-slate-200 hover:text-white flex items-center justify-center underline text-xs transition-colors"
            >
              <span className="underline text-sm font-semibold">U</span>
            </button>

            {/* Color Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowColorDropdown(!showColorDropdown)}
                title="Text Color (ECB Primary Color Codes)"
                className="px-2 h-7 rounded hover:bg-[#3f3f46] text-slate-200 hover:text-white flex items-center gap-1 text-xs transition-colors"
              >
                <span className="font-bold text-sm underline decoration-[#F59119] decoration-2">A</span>
                <span className="text-[10px] text-slate-400">▾</span>
              </button>

              {showColorDropdown && (
                <div className="absolute left-0 top-8 z-40 bg-[#1e1e24] border border-[#3f3f46] rounded-xl p-2.5 shadow-2xl flex flex-col gap-1.5 w-52 animate-in fade-in zoom-in-95">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    ECB Color Codes
                  </span>
                  {[
                    { color: '#FFF005', label: 'FFF005 (Yellow)', textColor: '#000000' },
                    { color: '#F59119', label: 'F59119 (Orange)', textColor: '#ffffff' },
                    { color: '#002C6A', label: '002C6A (Dark Blue)', textColor: '#ffffff' },
                    { color: '#FFFFFF', label: 'FFFFFF (White)', textColor: '#000000' },
                  ].map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      onClick={() => applyColor(c.color)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#2d2d38] text-left text-xs text-slate-200 transition-colors"
                    >
                      <span
                        className="w-4 h-4 rounded border border-slate-600 shrink-0 shadow-xs"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="font-mono text-xs">{c.label}</span>
                    </button>
                  ))}
                  <div className="border-t border-[#3f3f46] my-0.5" />
                  <span className="text-[10px] font-medium text-slate-400 px-1">
                    Wrap selected text with color tag
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick presets (Dzongkha / English) */}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange(DZONGKHA_SAMPLE_BODY)}
              title="Insert Official Bhutan Dzongkha Template"
              className="px-2 py-1 text-[10px] font-medium rounded bg-[#27272a] hover:bg-[#3f3f46] text-[#F59119] border border-[#3f3f46] transition-colors"
            >
              Dzongkha Text
            </button>
            <button
              type="button"
              onClick={() => onChange(ENGLISH_SAMPLE_BODY)}
              title="Insert Official English Certificate Template"
              className="px-2 py-1 text-[10px] font-medium rounded bg-[#27272a] hover:bg-[#3f3f46] text-slate-300 border border-[#3f3f46] transition-colors"
            >
              English Text
            </button>
          </div>
        </div>

        {/* Row 2: Dynamic Placeholder Tag Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {[
            { tag: '{name}', label: '+ {name}', desc: 'Inserts recipient name' },
            { tag: '{cid}', label: '+ {cid}', desc: 'Inserts CID number' },
            { tag: '{course}', label: '+ {course}', desc: 'Inserts course or event' },
            { tag: '{date}', label: '+ {date}', desc: 'Inserts issuance date' },
            { tag: '{orgname}', label: '+ {orgname}', desc: 'Inserts organization' },
          ].map((item) => (
            <button
              key={item.tag}
              type="button"
              onClick={() => insertTag(item.tag)}
              title={item.desc}
              className="px-2.5 py-1 rounded-md bg-[#27272a] hover:bg-[#3f3f46] border border-[#3f3f46] text-[#F59119] hover:text-[#fbbf24] font-mono text-[11px] font-semibold transition-all shadow-xs cursor-pointer active:scale-95"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Textarea - authentic dark box with Tibetan / Dzongkha font support */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={isEnlarged ? 14 : 6}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type certificate body message or click dynamic tags above..."
            className="w-full p-3 rounded-lg bg-[#121214] border border-[#27272a] text-slate-100 text-[13px] leading-relaxed focus:ring-1 focus:ring-[#F59119] outline-none resize-y selection:bg-[#F59119]/40"
            style={{
              fontFamily: '"Noto Sans Tibetan", "Poppins", sans-serif',
              lineHeight: '1.7',
            }}
          />
        </div>

        {/* Live Resolved Output preview */}
        <div className="p-2.5 bg-[#121214]/90 rounded-lg border border-[#27272a] space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span className="flex items-center gap-1 text-[#F59119]">
              <Sparkles className="w-3.5 h-3.5" />
              Live Preview with Recipient Data
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Dynamic Tags Filled</span>
          </div>
          <p
            className="text-xs text-slate-200 leading-relaxed line-clamp-3"
            style={{ fontFamily: '"Noto Sans Tibetan", "Poppins", sans-serif' }}
          >
            {resolvedPreview || <span className="text-slate-600 italic">Preview will appear here...</span>}
          </p>
        </div>
      </div>
    </div>
  );

  if (isEnlarged) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div className="bg-[#18181b] border border-[#3f3f46] rounded-2xl shadow-2xl max-w-3xl w-full p-6 animate-in fade-in zoom-in-95 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#27272a]">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Certificate Body Text & Dynamic Tags</span>
                <span className="text-xs font-normal text-[#F59119] bg-[#F59119]/10 px-2 py-0.5 rounded-full border border-[#F59119]/30">
                  Bhutan ECB Standard
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Use <code className="text-[#F59119]">{'{name}'}</code>, <code className="text-[#F59119]">{'{cid}'}</code>, <code className="text-[#F59119]">{'{course}'}</code>, <code className="text-[#F59119]">{'{date}'}</code> to automatically pull each person's data.
              </p>
            </div>
            <button
              onClick={() => setIsEnlarged(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#27272a] transition-colors"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>

          {editorContent}

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-400">
              Dzongkha (Tibetan script) & English are natively supported with vector PDF rendering.
            </span>
            <button
              type="button"
              onClick={() => setIsEnlarged(false)}
              className="px-5 py-2 bg-[#F59119] hover:bg-[#e08010] text-slate-950 rounded-xl text-xs font-bold shadow-md transition-colors"
            >
              Apply & Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return editorContent;
};

