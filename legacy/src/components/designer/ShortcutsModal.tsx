import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';
import { useDesigner } from '../../context/DesignerContext';

export const ShortcutsModal: React.FC = () => {
  const { showShortcutsModal, setShowShortcutsModal } = useDesigner();

  if (!showShortcutsModal) return null;

  const shortcutGroups = [
    {
      title: 'Tools',
      items: [
        { key: 'V', desc: 'Selection Tool' },
        { key: 'A', desc: 'Direct Selection Tool' },
        { key: 'T', desc: 'Type Tool' },
        { key: 'M', desc: 'Rectangle Tool' },
        { key: 'L', desc: 'Ellipse Tool' },
        { key: 'H', desc: 'Hand Tool (or hold Spacebar)' },
        { key: 'Z', desc: 'Zoom Tool (Alt+Click to zoom out)' },
      ],
    },
    {
      title: 'Drawing & Manipulation',
      items: [
        { key: 'Shift + Drag', desc: 'Constrain 1:1 aspect ratio (Square / Circle)' },
        { key: 'Alt + Drag', desc: 'Duplicate selected object' },
        { key: 'Arrow Keys', desc: 'Nudge selection by 1 pt' },
        { key: 'Shift + Arrows', desc: 'Nudge selection by 10 pt' },
        { key: 'Shift + X', desc: 'Swap Fill and Stroke colors' },
        { key: 'D', desc: 'Reset to default white fill / black stroke' },
        { key: 'Delete / Backspace', desc: 'Delete selected object(s)' },
      ],
    },
    {
      title: 'View & Navigation',
      items: [
        { key: 'Space + Drag', desc: 'Pan workspace canvas' },
        { key: 'Ctrl + Scroll', desc: 'Zoom in / out centered at cursor' },
        { key: 'Ctrl + 0', desc: 'Fit Artboard in Window' },
        { key: 'Ctrl + 1', desc: 'Actual Size (100% Zoom)' },
        { key: 'Ctrl + + / -', desc: 'Zoom in / Zoom out' },
        { key: 'Ctrl + R', desc: 'Toggle Rulers on / off' },
        { key: 'Ctrl + ;', desc: 'Toggle Guides on / off' },
        { key: "Ctrl + '", desc: 'Toggle Grid on / off' },
      ],
    },
    {
      title: 'Edit & Arrange',
      items: [
        { key: 'Ctrl + Z', desc: 'Undo' },
        { key: 'Ctrl + Y', desc: 'Redo' },
        { key: 'Ctrl + A', desc: 'Select All Objects' },
        { key: 'Ctrl + Shift + ]', desc: 'Bring to Front' },
        { key: 'Ctrl + ]', desc: 'Bring Forward' },
        { key: 'Ctrl + [', desc: 'Send Backward' },
        { key: 'Ctrl + Shift + [', desc: 'Send to Back' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-[#242424] border border-[#3e3e3e] rounded-xs shadow-2xl w-full max-w-2xl text-neutral-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-5 py-3.5 bg-[#202020] border-b border-[#343434] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-[#0d99ff]" />
            <h3 className="text-sm font-bold tracking-tight text-white">
              Adobe Illustrator Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={() => setShowShortcutsModal(false)}
            className="p-1 text-neutral-400 hover:text-white hover:bg-[#333] rounded-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts Grid */}
        <div className="p-5 max-h-[75vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
          {shortcutGroups.map((grp) => (
            <div key={grp.title} className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#0d99ff] border-b border-[#333] pb-1">
                {grp.title}
              </h4>
              <div className="space-y-1.5">
                {grp.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <span className="text-neutral-400 text-[11px]">{item.desc}</span>
                    <kbd className="px-2 py-0.5 bg-[#181818] border border-[#3c3c3c] rounded-xs font-mono text-[10px] text-neutral-200 shadow-xs whitespace-nowrap">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#202020] border-t border-[#343434] flex items-center justify-between text-[11px] text-neutral-400">
          <span>Press any key to use directly on the canvas</span>
          <button
            onClick={() => setShowShortcutsModal(false)}
            className="px-4 py-1 bg-[#0d99ff] hover:bg-[#007cd6] text-white rounded-xs font-medium transition-colors"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
