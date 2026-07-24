'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, CheckCheck, Trash2, Users, User } from 'lucide-react';
import { MessageBubble } from './MessageBubble';

export function MessageInfoOverlay() {
  const { user } = useAuthStore();
  const { messageForInfo, setMessageForInfo, deleteMessage } = useChatStore();
  const [deleting, setDeleting] = useState<'everyone' | 'me' | null>(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isOpen = !!messageForInfo;
  const isMine = messageForInfo?.senderId === user?.id;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overlayRef.current && overlayRef.current.contains(event.target as Node)) return;
      if (isOpen && overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        setMessageForInfo(null);
      }
    };

    if (isOpen) {
      setTimeout(() => { document.addEventListener('click', handleClickOutside); }, 0);
    }
    return () => { document.removeEventListener('click', handleClickOutside); };
  }, [isOpen, setMessageForInfo]);

  if (!isOpen) return null;

  const handleDelete = async (deleteFor: 'everyone' | 'me') => {
    if (!messageForInfo) return;
    setDeleting(deleteFor);
    const ok = await deleteMessage(messageForInfo.chatId, messageForInfo.id, deleteFor);
    setDeleting(null);
    if (ok) setMessageForInfo(null);
  };

  return (
    <AnimatePresence>
      <motion.div 
        ref={overlayRef}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.3 }}
        className="absolute inset-y-0 right-0 w-full md:w-[400px] bg-surface z-50 flex flex-col shadow-2xl border-l border-surface-border"
      >
        {/* Header */}
        <div className="h-16 flex items-center px-4 border-b border-surface-border bg-surface shrink-0">
          <button 
            onClick={() => setMessageForInfo(null)}
            className="p-2 mr-2 rounded-full hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 flex items-center justify-between">
            <h2 className="text-lg font-medium">Message info</h2>
            
            <div className="relative">
              <button
                onClick={() => setDeleteMenuOpen(!deleteMenuOpen)}
                className="p-2 rounded-full hover:bg-surface-hover text-danger transition-colors"
              >
                <Trash2 size={20} />
              </button>
              
              <AnimatePresence>
                {deleteMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    className="absolute right-0 top-full mt-2 w-52 bg-[#1f2c34] border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden py-1"
                  >
                    {isMine && (
                      <button
                        onClick={() => handleDelete('everyone')}
                        disabled={!!deleting}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-danger hover:bg-danger/10 transition-colors text-sm text-left"
                      >
                        <Trash2 size={16} />
                        <span>{deleting === 'everyone' ? 'Deleting...' : 'Delete for Everyone'}</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete('me')}
                      disabled={!!deleting}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-text-primary hover:bg-white/5 transition-colors text-sm text-left border-t border-surface-border"
                    >
                      <Trash2 size={16} className="text-text-secondary" />
                      <span>{deleting === 'me' ? 'Deleting...' : 'Delete for Me'}</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-chat-bg flex flex-col">
          {/* Message Preview */}
          <div className="p-4 md:p-6 mb-4">
            <MessageBubble 
              message={messageForInfo} 
              isMine={isMine}
              hideInfoOption
            />
          </div>

          {/* Read/Delivered/Sent Info */}
          {isMine ? (
            <div className="bg-surface border-t border-surface-border p-4 shadow-sm">
              <ul className="space-y-6">
                {/* Read Status */}
                <li className="flex items-center space-x-4">
                  <CheckCheck size={24} className="text-[#53bdeb]" />
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">Read</p>
                    {messageForInfo.readAt ? (
                      <p className="text-sm text-text-secondary">
                        {new Date(messageForInfo.readAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    ) : (
                      <p className="text-sm text-text-secondary">—</p>
                    )}
                  </div>
                </li>

                {/* Delivered Status */}
                <li className="flex items-center space-x-4">
                  <CheckCheck size={24} className="text-text-secondary" />
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">Delivered</p>
                    {messageForInfo.deliveredAt ? (
                      <p className="text-sm text-text-secondary">
                        {new Date(messageForInfo.deliveredAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    ) : (
                      <p className="text-sm text-text-secondary">—</p>
                    )}
                  </div>
                </li>

                {/* Sent Status */}
                <li className="flex items-center space-x-4">
                  <Check size={24} className="text-text-secondary" />
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">Sent</p>
                    {messageForInfo.createdAt ? (
                      <p className="text-sm text-text-secondary">
                        {new Date(messageForInfo.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    ) : (
                      <p className="text-sm text-text-secondary">—</p>
                    )}
                  </div>
                </li>
              </ul>
            </div>
          ) : (
            <div className="bg-surface border-t border-surface-border p-4 shadow-sm">
              <ul className="space-y-6">
                <li className="flex items-center space-x-4">
                  <Check size={24} className="text-text-secondary" />
                  <div className="flex-1">
                    <p className="font-medium text-text-primary">Received</p>
                    {messageForInfo.createdAt ? (
                      <p className="text-sm text-text-secondary">
                        {new Date(messageForInfo.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    ) : (
                      <p className="text-sm text-text-secondary">—</p>
                    )}
                  </div>
                </li>
              </ul>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
