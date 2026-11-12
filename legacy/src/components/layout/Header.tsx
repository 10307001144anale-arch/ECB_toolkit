import React from 'react';
import { Sun, Moon, Shield, Award, Sparkles, LogOut, Download, Lock } from 'lucide-react';

interface HeaderProps {
  currentTab: 'user' | 'admin' | 'history';
  onSelectTab: (tab: 'user' | 'admin' | 'history') => void;
  isAdminUnlocked: boolean;
  onLockAdmin: () => void;
  onRequestAdmin: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onTriggerGenerate?: () => void;
  showGenerateButton?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  isAdminUnlocked,
  onLockAdmin,
  onRequestAdmin,
  darkMode,
  onToggleDarkMode,
  onTriggerGenerate,
  showGenerateButton = true,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4 py-2">
        {/* Left: ECB Logos & Official Title */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700 shadow-2xs">
            <img
              src="/assets/aistudio/Untitled-1_ba49ba48.png"
              alt="ECB Emblem"
              className="w-8 h-8 rounded-lg object-contain bg-slate-50 dark:bg-slate-900"
              onError={(e) => {
                // Graceful fallback to colored emblem badge
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <img
              src="/assets/aistudio/Untitled-2_c1eb64a8.png"
              alt="Bhutan Crest"
              className="w-8 h-8 rounded-lg object-contain bg-slate-50 dark:bg-slate-900"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onSelectTab('user')}
                className="text-base sm:text-lg font-bold tracking-tight text-[#002C6A] dark:text-amber-400 hover:opacity-90 font-['Plus_Jakarta_Sans'] whitespace-nowrap text-left"
              >
                Election Commission of Bhutan
              </button>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFF005]/40 text-[#002C6A] border border-[#FFF005] dark:bg-amber-400/20 dark:text-amber-300">
                Certificate Generator
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span className="font-['Noto_Sans_Tibetan'] text-[#002C6A] dark:text-amber-400 font-semibold">
                འབྲུག་གི་བཙག་འཐུ་ལྷན་ཚོགས།
              </span>
              <span className="hidden md:inline text-slate-300 dark:text-slate-700">•</span>
              <span className="hidden md:inline">Official Election Certification</span>
            </div>
          </div>
        </div>

        {/* Center: ECB Brand Swatches & Security Badges */}
        <div className="hidden lg:flex items-center gap-3.5 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
          <div className="flex items-center gap-1.5 pr-2 border-r border-slate-200 dark:border-slate-700">
            <span
              title="ECB Gold Yellow (#FFF005)"
              className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs"
              style={{ backgroundColor: '#FFF005' }}
            />
            <span
              title="ECB Saffron Orange (#F59119)"
              className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs"
              style={{ backgroundColor: '#F59119' }}
            />
            <span
              title="ECB Royal Navy (#002C6A)"
              className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs"
              style={{ backgroundColor: '#002C6A' }}
            />
          </div>

          <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span>100% Client-Side</span>
          </div>

          <span className="text-slate-300 dark:text-slate-600">•</span>

          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
            <Lock className="w-3 h-3 text-[#002C6A] dark:text-amber-400" />
            <span>Fixed Official Layout</span>
          </div>
        </div>

        {/* Right: Actions, Navigation, & Generate Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800/90 p-1 rounded-xl">
            <button
              onClick={() => onSelectTab('user')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                currentTab === 'user'
                  ? 'bg-[#002C6A] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Client Portal
            </button>
            <button
              onClick={() => {
                if (isAdminUnlocked) {
                  onSelectTab('admin');
                } else {
                  onRequestAdmin();
                }
              }}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                currentTab === 'admin'
                  ? 'bg-[#002C6A] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              Admin
            </button>
            <button
              onClick={() => onSelectTab('history')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 ${
                currentTab === 'history'
                  ? 'bg-[#002C6A] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              History
            </button>
          </nav>

          {/* Theme Switcher */}
          <button
            onClick={onToggleDarkMode}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Primary Navy Generate Certificates Button */}
          {showGenerateButton && onTriggerGenerate && (
            <button
              onClick={onTriggerGenerate}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-[#002C6A] hover:bg-[#001f4d] active:scale-[0.98] rounded-xl shadow-sm hover:shadow flex items-center gap-2 transition-all whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-[#FFF005]" />
              <span>Generate Certificates</span>
            </button>
          )}

          {isAdminUnlocked && (
            <button
              onClick={onLockAdmin}
              title="Lock admin workspace"
              className="p-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

