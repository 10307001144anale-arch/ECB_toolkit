import React, { useState, useEffect } from 'react';
import { History, Calendar, Trash2, Award, Archive, ExternalLink, RefreshCw } from 'lucide-react';
import { GenerationHistoryItem } from '../../types';
import { getHistory, deleteHistoryItem, clearAllHistory } from '../../utils/db';
import { useToast } from '../../context/ToastContext';

export const GenerationHistoryView: React.FC = () => {
  const { showToast } = useToast();
  const [historyList, setHistoryList] = useState<GenerationHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const items = await getHistory();
      setHistoryList(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDeleteItem = async (id: string) => {
    await deleteHistoryItem(id);
    setHistoryList((prev) => prev.filter((i) => i.id !== id));
    showToast('Record deleted from history', 'info');
  };

  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to clear your generation history?')) return;
    await clearAllHistory();
    setHistoryList([]);
    showToast('Generation history cleared', 'info');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Generation History
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Audit log of all certificate generation batches produced in this browser.
          </p>
        </div>

        {historyList.length > 0 && (
          <button
            onClick={handleClearAll}
            className="px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/40 transition-colors flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear History
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <RefreshCw className="w-6 h-6 animate-spin mb-2" />
          <p className="text-xs">Loading past batch records...</p>
        </div>
      ) : historyList.length === 0 ? (
        <div className="py-24 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <History className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Generation Batches Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Once you generate single or bulk certificates, records of your generation sessions will be saved here.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {historyList.map((item) => (
            <div
              key={item.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xs"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {item.templateName}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(item.timestamp).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                    <span>·</span>
                    <span className="font-mono">{item.successCount} generated</span>
                    {item.skippedCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-rose-500">{item.skippedCount} skipped</span>
                      </>
                    )}
                  </div>
                  {item.sampleNames && item.sampleNames.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.sampleNames.slice(0, 3).map((name, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-400"
                        >
                          {name}
                        </span>
                      ))}
                      {item.sampleNames.length > 3 && (
                        <span className="text-[10px] text-slate-400 self-center">
                          +{item.sampleNames.length - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                  title="Remove from history"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
