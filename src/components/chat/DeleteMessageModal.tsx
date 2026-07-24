import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DeleteMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  canDeleteForEveryone: boolean;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}

export function DeleteMessageModal({ isOpen, onClose, canDeleteForEveryone, onDeleteForMe, onDeleteForEveryone }: DeleteMessageModalProps) {
  // Mobile bottom sheet and Desktop modal
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 md:backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:bottom-auto md:w-[400px] bg-surface rounded-t-3xl md:rounded-2xl z-50 overflow-hidden shadow-2xl"
          >
            <div className="flex flex-col p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-text-primary">Delete message?</h2>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-text-secondary transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col space-y-2">
                <button
                  onClick={onDeleteForMe}
                  className="w-full flex items-center p-4 rounded-xl hover:bg-white/5 transition-colors text-text-primary text-left font-medium border border-surface-border"
                >
                  <Trash2 size={20} className="mr-3 text-text-secondary" />
                  Delete for Me
                </button>

                {canDeleteForEveryone && (
                  <button
                    onClick={onDeleteForEveryone}
                    className="w-full flex items-center p-4 rounded-xl hover:bg-danger/10 transition-colors text-danger text-left font-medium border border-danger/20 bg-danger/5"
                  >
                    <Trash2 size={20} className="mr-3" />
                    Delete for Everyone
                  </button>
                )}
              </div>
              
              <div className="mt-6 md:hidden">
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-surface-hover text-text-primary font-medium hover:opacity-90 transition-opacity"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
