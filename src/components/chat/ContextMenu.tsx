import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Reply, CornerUpRight, Copy, Trash2, X, Star, StarOff, Pin, PinOff } from 'lucide-react';
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
  onDelete: () => void;
  canDelete: boolean;
}

export function ContextMenu({ isOpen, onClose, position, onReply, onForward, onCopy, onEdit, onStar, isStarred, onPin, isPinned, onDelete, canDelete }: ContextMenuProps) {
  // Use a fallback position if it's somehow not available but isOpen is true
  const menuPos = position || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  
  // Adjust position so it doesn't go off-screen
  const adjustedX = Math.min(menuPos.x, window.innerWidth - 200);
  const adjustedY = Math.min(menuPos.y, window.innerHeight - 300);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
            onContextMenu={(e) => { e.preventDefault(); onClose(); }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            style={{ 
              position: 'fixed',
              left: adjustedX,
              top: adjustedY
            }}
            className="z-50 w-48 bg-surface border border-surface-border rounded-xl shadow-xl overflow-hidden py-1"
          >
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
            <button
              onClick={() => { onCopy(); onClose(); }}
              className="w-full flex items-center px-4 py-3 hover:bg-white/5 transition-colors text-text-primary text-sm text-left"
            >
              <Copy size={16} className="mr-3 text-text-secondary" />
              Copy
            </button>
            {canDelete && (
              <button
                onClick={() => { onDelete(); onClose(); }}
                className="w-full flex items-center px-4 py-3 hover:bg-danger/10 transition-colors text-danger text-sm text-left border-t border-surface-border"
              >
                <Trash2 size={16} className="mr-3" />
                Delete
              </button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
