import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Reply, CornerUpRight, Copy, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number } | null;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

export function ContextMenu({ isOpen, onClose, position, onReply, onForward, onCopy, onDelete, canDelete }: ContextMenuProps) {
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
