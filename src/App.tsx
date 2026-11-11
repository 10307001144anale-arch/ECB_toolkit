import React, { useState, useEffect } from 'react';
import { CertificateTemplate } from './types';
import { getAllTemplates, saveTemplate } from './utils/db';
import { getInitialSampleTemplates } from './utils/sampleTemplates';
import { Header } from './components/layout/Header';
import { UserWorkflow } from './components/user/UserWorkflow';
import { TemplateManager } from './components/admin/TemplateManager';
import { GenerationHistoryView } from './components/history/GenerationHistoryView';
import { AdminAuthModal } from './components/admin/AdminAuthModal';
import { ToastProvider, useToast } from './context/ToastContext';

function AppContent() {
  const { showToast } = useToast();
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CertificateTemplate | null>(null);
  const [currentTab, setCurrentTab] = useState<'user' | 'admin' | 'history'>('user');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('certigen_theme') === 'dark';
  });

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('certigen_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('certigen_theme', 'light');
    }
  }, [darkMode]);

  // Initial Templates loader & seeding
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        let stored = await getAllTemplates();
        const hasEcb = stored.some((t) => t.id === 'template-sample-ecb');

        if (stored.length === 0 || !hasEcb) {
          const samples = getInitialSampleTemplates();
          for (const s of samples) {
            const exists = stored.find((t) => t.id === s.id);
            if (!exists) {
              await saveTemplate(s);
            }
          }
          stored = await getAllTemplates();
        }

        // Put ECB Official template first
        const sorted = [...stored].sort((a, b) => {
          if (a.id === 'template-sample-ecb') return -1;
          if (b.id === 'template-sample-ecb') return 1;
          return 0;
        });

        setTemplates(sorted);
        if (sorted.length > 0 && !selectedTemplate) {
          setSelectedTemplate(sorted[0]);
        }
      } catch (err) {
        console.error('Failed to load templates:', err);
      }
    };

    loadTemplates();

    // Check URL for /admin route: enforce authentication before opening admin
    const checkRoute = () => {
      if (window.location.pathname.includes('/admin') || window.location.hash.includes('admin')) {
        if (!isAdminUnlocked) {
          setShowAuthModal(true);
        } else {
          setCurrentTab('admin');
        }
      }
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    return () => window.removeEventListener('popstate', checkRoute);
  }, [isAdminUnlocked]);

  const handleToggleTheme = () => {
    setDarkMode((prev) => !prev);
  };

  const handleTabChange = (tab: 'user' | 'admin' | 'history') => {
    if (tab === 'admin' && !isAdminUnlocked) {
      setShowAuthModal(true);
      return;
    }
    setCurrentTab(tab);
  };

  const handleAdminAuthSuccess = () => {
    setIsAdminUnlocked(true);
    setShowAuthModal(false);
    setCurrentTab('admin');
    showToast('Admin Mode unlocked', 'success');
  };

  const handleTemplateCreated = (newTemplate: CertificateTemplate) => {
    setTemplates((prev) => [newTemplate, ...prev]);
    setSelectedTemplate(newTemplate);
    showToast(`Template "${newTemplate.name}" created`, 'success');
  };

  const handleTemplateUpdated = (updated: CertificateTemplate) => {
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    if (selectedTemplate?.id === updated.id) {
      setSelectedTemplate(updated);
    }
    showToast(`Template "${updated.name}" updated`, 'success');
  };

  const handleTemplateDeleted = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    if (selectedTemplate?.id === id) {
      const remaining = templates.filter((t) => t.id !== id);
      setSelectedTemplate(remaining.length > 0 ? remaining[0] : null);
    }
    showToast('Template deleted', 'info');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      <Header
        currentTab={currentTab}
        onSelectTab={handleTabChange}
        isAdminUnlocked={isAdminUnlocked}
        onLockAdmin={() => {
          setIsAdminUnlocked(false);
          setCurrentTab('user');
          showToast('Admin mode locked', 'info');
        }}
        onRequestAdmin={() => setShowAuthModal(true)}
        darkMode={darkMode}
        onToggleDarkMode={handleToggleTheme}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'user' && (
          <UserWorkflow
            templates={templates}
            selectedTemplate={selectedTemplate}
            onSelectTemplate={(tpl) => setSelectedTemplate(tpl)}
            onSwitchToAdmin={() => handleTabChange('admin')}
          />
        )}

        {currentTab === 'admin' && (
          <TemplateManager
            templates={templates}
            onTemplatesChange={(updated) => setTemplates(updated)}
            onSelectTemplateForGeneration={(tpl) => {
              setSelectedTemplate(tpl);
              setCurrentTab('user');
            }}
          />
        )}

        {currentTab === 'history' && (
          <GenerationHistoryView />
        )}
      </main>

      {/* Admin Passcode Modal */}
      <AdminAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAdminAuthSuccess}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
