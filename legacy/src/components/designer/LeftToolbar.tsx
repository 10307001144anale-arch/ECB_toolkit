import React, { useState } from 'react';
import {
  MousePointer,
  MousePointerClick,
  Type,
  Square,
  Circle,
  Hand,
  ZoomIn,
  ArrowLeftRight,
  Slash,
  Maximize2,
} from 'lucide-react';
import { useDesigner } from '../../context/DesignerContext';
import { ToolType } from '../../types/designer';

interface ToolDef {
  id: ToolType;
  name: string;
  shortcut: string;
  icon: React.ReactNode;
  nested?: { id: ToolType; name: string; shortcut: string; icon: React.ReactNode }[];
}

export const LeftToolbar: React.FC = () => {
  const {
    tool,
    setTool,
    fillColor,
    strokeColor,
    strokeWidth,
    activeColorTarget,
    setActiveColorTarget,
    swapFillStroke,
    resetFillStroke,
    setFillColor,
    setStrokeColor,
  } = useDesigner();

  const [activeFlyout, setActiveFlyout] = useState<string | null>(null);

  const tools: ToolDef[] = [
    {
      id: 'select',
      name: 'Selection Tool',
      shortcut: 'V',
      icon: <MousePointer className="w-4 h-4" />,
    },
    {
      id: 'direct-select',
      name: 'Direct Selection Tool',
      shortcut: 'A',
      icon: <MousePointerClick className="w-4 h-4" />,
    },
    {
      id: 'type',
      name: 'Type Tool',
      shortcut: 'T',
      icon: <Type className="w-4 h-4" />,
    },
    {
      id: 'rectangle',
      name: 'Rectangle Tool',
      shortcut: 'M',
      icon: <Square className="w-4 h-4" />,
      nested: [
        {
          id: 'rectangle',
          name: 'Rectangle Tool',
          shortcut: 'M',
          icon: <Square className="w-4 h-4" />,
        },
        {
          id: 'ellipse',
          name: 'Ellipse Tool',
          shortcut: 'L',
          icon: <Circle className="w-4 h-4" />,
        },
      ],
    },
    {
      id: 'ellipse',
      name: 'Ellipse Tool',
      shortcut: 'L',
      icon: <Circle className="w-4 h-4" />,
    },
    {
      id: 'hand',
      name: 'Hand Tool',
      shortcut: 'H',
      icon: <Hand className="w-4 h-4" />,
    },
    {
      id: 'zoom',
      name: 'Zoom Tool',
      shortcut: 'Z',
      icon: <ZoomIn className="w-4 h-4" />,
    },
  ];

  return (
    <div className="w-11 bg-[#242424] border-r border-[#343434] flex flex-col justify-between py-2 items-center select-none z-20 shrink-0 font-sans">
      {/* Top: Tools Palette */}
      <div className="flex flex-col items-center gap-1 w-full px-1">
        {tools.map((t) => {
          const isActive = tool === t.id;

          return (
            <div key={t.id} className="relative group">
              <button
                onClick={() => setTool(t.id)}
                title={`${t.name} (${t.shortcut})`}
                className={`w-8 h-8 rounded-xs flex items-center justify-center transition-colors relative ${
                  isActive
                    ? 'bg-[#0d99ff] text-white shadow-xs'
                    : 'text-neutral-400 hover:text-white hover:bg-[#333333]'
                }`}
              >
                {t.icon}

                {/* Subtool flyout indicator triangle */}
                {t.nested && (
                  <span className="absolute bottom-0.5 right-0.5 w-1 h-1 border-r border-b border-current opacity-80" />
                )}
              </button>

              {/* Flyout for nested tools on hover */}
              {t.nested && (
                <div className="absolute left-full top-0 ml-1 hidden group-hover:flex bg-[#282828] border border-[#3e3e3e] shadow-xl p-1 rounded-xs flex-col gap-1 z-50">
                  {t.nested.map((sub) => (
                    <button
                      key={sub.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTool(sub.id);
                      }}
                      title={`${sub.name} (${sub.shortcut})`}
                      className={`w-8 h-8 rounded-xs flex items-center justify-center ${
                        tool === sub.id
                          ? 'bg-[#0d99ff] text-white'
                          : 'text-neutral-400 hover:text-white hover:bg-[#383838]'
                      }`}
                    >
                      {sub.icon}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom: Classic Adobe Overlapping Fill & Stroke Box */}
      <div className="flex flex-col items-center gap-2 pt-3 border-t border-[#343434] w-full px-1">
        {/* Fill / Stroke Swap icon */}
        <div className="w-8 flex justify-end">
          <button
            onClick={swapFillStroke}
            title="Swap Fill and Stroke (Shift+X)"
            className="p-0.5 text-neutral-400 hover:text-white hover:bg-[#333] rounded-xs"
          >
            <ArrowLeftRight className="w-3 h-3 rotate-45" />
          </button>
        </div>

        {/* Overlapping Fill & Stroke Squares */}
        <div className="relative w-8 h-8">
          {/* Stroke Box (Back or Front) */}
          <div
            onClick={() => setActiveColorTarget('stroke')}
            className={`absolute bottom-0 right-0 w-5 h-5 rounded-xs border-2 cursor-pointer transition-transform ${
              activeColorTarget === 'stroke'
                ? 'z-20 ring-1 ring-[#0d99ff] scale-105'
                : 'z-0 border-[#555]'
            }`}
            style={{
              backgroundColor: strokeColor === 'transparent' ? '#181818' : strokeColor,
              borderColor: strokeColor === 'transparent' ? '#rose-500' : '#888',
            }}
            title="Stroke Color"
          />

          {/* Fill Box (Front or Back) */}
          <div
            onClick={() => setActiveColorTarget('fill')}
            className={`absolute top-0 left-0 w-5 h-5 rounded-xs border cursor-pointer transition-transform ${
              activeColorTarget === 'fill'
                ? 'z-20 ring-1 ring-[#0d99ff] border-white scale-105'
                : 'z-10 border-[#555]'
            }`}
            style={{
              backgroundColor: fillColor === 'transparent' ? '#181818' : fillColor,
            }}
            title="Fill Color"
          />
        </div>

        {/* Reset to Default B/W button & None/Transparent button */}
        <div className="flex items-center justify-between w-8 px-0.5">
          <button
            onClick={resetFillStroke}
            title="Default Fill and Stroke (D)"
            className="w-3.5 h-3.5 border border-[#555] rounded-xs bg-white relative flex items-center justify-center hover:border-white"
          >
            <div className="w-1.5 h-1.5 bg-black" />
          </button>

          <button
            onClick={() => {
              if (activeColorTarget === 'fill') setFillColor('transparent');
              else setStrokeColor('transparent');
            }}
            title="Set None / Transparent"
            className="w-3.5 h-3.5 border border-[#555] rounded-xs bg-[#1e1e1e] flex items-center justify-center text-rose-500 hover:border-rose-400"
          >
            <Slash className="w-2.5 h-2.5 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
