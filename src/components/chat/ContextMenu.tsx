import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Reply, CornerUpRight, Copy, Trash2, X, Star, StarOff, Pin, PinOff, Info, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number } | null;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onEdit?: () => void;
  onStar?: () => void;
  isStarred?: boolean;
  onPin?: () => void;
  isPinned?: boolean;
  onInfo?: () => void;
  onDelete: () => void;
  canDelete: boolean;
  onTranslate?: (lang: string) => void;
}

export function ContextMenu({ isOpen, onClose, position, onReply, onForward, onCopy, onEdit, onStar, isStarred, onPin, isPinned, onInfo, onDelete, canDelete, onTranslate }: ContextMenuProps) {
  const [showLanguages, setShowLanguages] = useState(false);
  
  // Use a fallback position if it's somehow not available but isOpen is true
  const menuPos = position || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  
  // Adjust position so it doesn't go off-screen horizontally
  const adjustedX = Math.min(menuPos.x, window.innerWidth - 200);
  
  // Determine vertical positioning based on available space
  const menuHeight = 400; // Approximate max height of the menu
  const spaceBelow = window.innerHeight - menuPos.y;
  const isSpaceBelow = spaceBelow >= menuHeight;
  
  const verticalStyle = isSpaceBelow 
    ? { top: menuPos.y }
    : { bottom: Math.max(20, window.innerHeight - menuPos.y) };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={() => {
              setShowLanguages(false);
              onClose();
            }}
            onContextMenu={(e) => { e.preventDefault(); setShowLanguages(false); onClose(); }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: isSpaceBelow ? 10 : -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: isSpaceBelow ? 10 : -10 }}
            style={{ 
              position: 'fixed',
              left: Math.max(10, adjustedX),
              ...verticalStyle
            }}
            className="z-50 w-48 bg-surface border border-surface-border rounded-xl shadow-xl overflow-hidden py-1"
          >
            {!showLanguages ? (
              <>
                <button
                  onClick={() => { onReply(); onClose(); }}
                  className="w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                >
                  <Reply size={16} className="mr-3 text-text-secondary" />
                  Reply
                </button>
                {onEdit && (
                  <button
                    onClick={() => { onEdit(); onClose(); }}
                    className="w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-3 text-text-secondary"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                    Edit
                  </button>
                )}
                {onStar && (
                  <button
                    onClick={() => { onStar(); onClose(); }}
                    className="w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                  >
                    {isStarred ? (
                      <>
                        <StarOff size={16} className="mr-3 text-text-secondary" />
                        Unstar
                      </>
                    ) : (
                      <>
                        <Star size={16} className="mr-3 text-text-secondary" />
                        Star
                      </>
                    )}
                  </button>
                )}
                {onPin && (
                  <button
                    onClick={() => { onPin(); onClose(); }}
                    className="w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                  >
                    {isPinned ? (
                      <>
                        <PinOff size={16} className="mr-3 text-text-secondary" />
                        Unpin
                      </>
                    ) : (
                      <>
                        <Pin size={16} className="mr-3 text-text-secondary rotate-45" />
                        Pin
                      </>
                    )}
                  </button>
                )}
                <button
                  onClick={() => { onForward(); onClose(); }}
                  className="w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                >
                  <CornerUpRight size={16} className="mr-3 text-text-secondary" />
                  Forward
                </button>
                {/* 
                {onTranslate && (
                  <button
                    onClick={(e) => { 
                      e.stopPropagation();
                      setShowLanguages(true); 
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                  >
                    <div className="flex items-center">
                      <Globe size={16} className="mr-3 text-text-secondary" />
                      Translate
                    </div>
                    <span className="text-text-secondary text-xs">▶</span>
                  </button>
                )}
                */}
                <button
                  onClick={() => { onCopy(); onClose(); }}
                  className="w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                >
                  <Copy size={16} className="mr-3 text-text-secondary" />
                  Copy
                </button>
                {onInfo && (
                  <button
                    onClick={() => { onInfo(); onClose(); }}
                    className="w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                  >
                    <Info size={16} className="mr-3 text-text-secondary" />
                    Info
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={() => { onDelete(); onClose(); }}
                    className="w-full flex items-center px-4 py-3 hover:bg-danger/10 transition-colors text-danger text-sm text-left border-t border-surface-border"
                  >
                    <Trash2 size={16} className="mr-3" />
                    Delete
                  </button>
                )}
              </>
            ) : (
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                <div className="flex items-center px-4 py-2 text-xs font-semibold text-text-secondary border-b border-surface-border bg-surface sticky top-0 z-10">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowLanguages(false); }}
                    className="mr-2 hover:text-text-primary transition-colors p-1"
                  >
                    <CornerUpRight size={14} className="rotate-180" />
                  </button>
                  Select Language
                </div>
                {[
                  { code: 'en', name: 'English' },
                  { code: 'es', name: 'Spanish' },
                  { code: 'fr', name: 'French' },
                  { code: 'de', name: 'German' },
                  { code: 'hi', name: 'Hindi' },
                  { code: 'zh-CN', name: 'Chinese (Simp)' },
                  { code: 'ja', name: 'Japanese' },
                  { code: 'ru', name: 'Russian' },
                  { code: 'ar', name: 'Arabic' },
                  { code: 'pt', name: 'Portuguese' },
                  { code: 'it', name: 'Italian' },
                  { code: 'ko', name: 'Korean' }
                ].map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      if (onTranslate) onTranslate(lang.code);
                      setShowLanguages(false);
                      onClose();
                    }}
                    className="w-full flex items-center px-4 py-2.5 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

        </>
      )}
    </AnimatePresence>
  );
}
