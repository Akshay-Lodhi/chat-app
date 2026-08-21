import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe } from 'lucide-react';

interface LanguagePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLanguage: (code: string) => void;
  positionClass?: string;
}

export const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500 hover:text-white dark:hover:text-white' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी', color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500 hover:text-white dark:hover:text-white' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500 hover:text-white dark:hover:text-white' },
  { code: 'fr', name: 'French', nativeName: 'Français', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500 hover:text-white dark:hover:text-white' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500 hover:text-white dark:hover:text-white' },
  { code: 'zh-CN', name: 'Chinese', nativeName: '中文', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500 hover:text-white dark:hover:text-white' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20 hover:bg-fuchsia-500 hover:text-white dark:hover:text-white' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 hover:bg-cyan-500 hover:text-white dark:hover:text-white' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500 hover:text-white dark:hover:text-white' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', color: 'bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20 hover:bg-lime-500 hover:text-white dark:hover:text-white' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 hover:bg-violet-500 hover:text-white dark:hover:text-white' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 hover:bg-teal-500 hover:text-white dark:hover:text-white' },
];

export function LanguagePicker({ isOpen, onClose, onSelectLanguage, positionClass }: LanguagePickerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] bg-black/20"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", duration: 0.3 }}
        className={`fixed z-[1001] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface/95 backdrop-blur-xl border border-surface-border rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-3 w-[280px] max-w-[90vw]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3 px-1">
          <div className="flex items-center gap-1.5 text-text-primary">
            <Globe size={14} className="opacity-70" />
            <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-80">Translate To</h3>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }} 
            className="text-text-secondary hover:text-text-primary p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={(e) => {
                e.stopPropagation();
                onSelectLanguage(lang.code);
                onClose();
              }}
              className={`py-1.5 px-1 rounded-lg border ${lang.color} transition-all flex flex-col items-center justify-center`}
            >
              <span className="font-semibold text-[12px]">{lang.name}</span>
              <span className="text-[9px] opacity-70 mt-0.5">{lang.nativeName}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
}
