import React from 'react';
import { DesignerProvider } from './context/DesignerContext';
import { TopMenuBar } from './components/designer/TopMenuBar';
import { ControlBar } from './components/designer/ControlBar';
import { LeftToolbar } from './components/designer/LeftToolbar';
import { CanvasWorkspace } from './components/designer/CanvasWorkspace';
import { RightPanelContainer } from './components/designer/RightPanelContainer';
import { BottomStatusBar } from './components/designer/BottomStatusBar';
import { ShortcutsModal } from './components/designer/ShortcutsModal';
import { KeyboardManager } from './components/designer/KeyboardManager';

export const CertificateDesignerApp: React.FC = () => {
  return (
    <DesignerProvider>
      <div className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-white overflow-hidden select-none font-sans min-w-[1200px]">
        {/* Global Key Listeners & Shortcuts */}
        <KeyboardManager />
        <ShortcutsModal />

        {/* 1. Top Menu Bar (File, Edit, Object, Type, Select, View, Help) */}
        <TopMenuBar />

        {/* 2. Dynamic Control Bar (Fill, Stroke, Font, Alignment, Dimensions) */}
        <ControlBar />

        {/* 3. Main Center Workspace: Left Toolbar + Canvas + Right Panels */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Illustrator Toolbar */}
          <LeftToolbar />

          {/* Center Canvas with Rulers, Artboard & Zoom/Pan */}
          <CanvasWorkspace />

          {/* Right Dockable Panels (Properties, Layers, Artboard, Align) */}
          <RightPanelContainer />
        </div>

        {/* 4. Bottom Status Bar (Zoom %, Cursor X/Y, Artboard Specs, Active Tool) */}
        <BottomStatusBar />
      </div>
    </DesignerProvider>
  );
};
