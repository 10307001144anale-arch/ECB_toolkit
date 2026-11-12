import React, { useState } from 'react';
import { Lock, KeyRound, X, AlertCircle } from 'lucide-react';
import { getSetting, setSetting } from '../../utils/db';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [newPin, setNewPin] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const storedPin = await getSetting<string>('admin_pin', '1234');

    if (isChangingPin) {
      if (pin !== storedPin) {
        setError('Current PIN is incorrect');
        return;
      }
      if (newPin.length < 4) {
        setError('New PIN must be at least 4 digits');
        return;
      }
      await setSetting('admin_pin', newPin);
      setIsChangingPin(false);
      setPin('');
      setNewPin('');
      onSuccess();
    } else {
      if (pin === storedPin) {
        setError('');
        setPin('');
        onSuccess();
      } else {
        setError('Incorrect PIN. (Default is 1234)');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Admin Authentication</h3>
              <p className="text-xs text-slate-500">Template Studio Access</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {isChangingPin ? 'Current Admin PIN' : 'Enter Admin PIN'}
            </label>
            <div className="relative">
              <input
                type="password"
                maxLength={10}
                autoFocus
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError('');
                }}
                placeholder="Default: 1234"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-widest text-center"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            </div>
          </div>

          {isChangingPin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                New Admin PIN
              </label>
              <input
                type="password"
                maxLength={10}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="Enter 4-10 digits"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-widest text-center"
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 p-2 rounded-lg border border-rose-200 dark:border-rose-900/40">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => {
                setIsChangingPin(!isChangingPin);
                setError('');
              }}
              className="text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {isChangingPin ? 'Cancel PIN Change' : 'Change Admin PIN'}
            </button>
            <span className="text-slate-400">Default: 1234</span>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors"
            >
              {isChangingPin ? 'Update & Unlock' : 'Unlock Studio'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
