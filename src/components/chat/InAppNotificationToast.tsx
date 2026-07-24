'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageSquare, Image as ImageIcon, Video, Mic, MapPin, FileText, Phone, Users } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { cn } from '@/lib/utils';

export function InAppNotificationToast() {
  const { notificationToast, clearNotificationToast, setActiveChat, setActiveTab } = useChatStore();

  useEffect(() => {
    if (notificationToast) {
      const timer = setTimeout(() => {
        clearNotificationToast();
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [notificationToast, clearNotificationToast]);

  if (!notificationToast) return null;

  const { chatId, senderName, senderPfp, text, isGroup, groupName, type } = notificationToast;

  const handleClick = () => {
    setActiveTab('chats');
    setActiveChat(chatId);
    clearNotificationToast();
  };

  const getMediaPreview = () => {
    if (type === 'IMAGE') return <><ImageIcon size={14} className="mr-1 text-blue-400 shrink-0 inline" /> Photo</>;
    if (type === 'VIDEO') return <><Video size={14} className="mr-1 text-[#25D366] shrink-0 inline" /> Video</>;
    if (type === 'AUDIO') return <><Mic size={14} className="mr-1 text-amber-400 shrink-0 inline" /> Voice message</>;
    if (type === 'LOCATION') return <><MapPin size={14} className="mr-1 text-red-400 shrink-0 inline" /> Location</>;
    if (type === 'DOCUMENT') return <><FileText size={14} className="mr-1 text-indigo-400 shrink-0 inline" /> Document</>;
    if (type === 'CALL_LOG') return <><Phone size={14} className="mr-1 text-[#25D366] shrink-0 inline" /> Call</>;
    return text || 'New message';
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -60, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -50, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        onClick={handleClick}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[92%] max-w-md bg-[#1f2c34]/95 border border-[#25D366]/40 backdrop-blur-xl rounded-2xl p-3.5 shadow-2xl cursor-pointer hover:bg-[#2a3942] transition-colors select-none text-white"
      >
        <div className="flex items-center space-x-3 min-w-0">
          {/* Sender / Group Avatar */}
          <div className="relative shrink-0">
            {senderPfp ? (
              <img src={senderPfp} alt={senderName} className="w-11 h-11 rounded-full object-cover border border-surface-border/60 shadow-md" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[#005c4b] text-[#25D366] font-bold text-sm flex items-center justify-center border border-[#25D366]/30 shadow-md">
                {(senderName || 'U').substring(0, 2).toUpperCase()}
              </div>
            )}

            <div className="absolute -bottom-0.5 -right-0.5 bg-[#25D366] text-black p-1 rounded-full shadow-sm">
              <MessageSquare size={10} strokeWidth={3} />
            </div>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-white truncate flex items-center space-x-1.5">
                <span>{isGroup ? groupName : senderName}</span>
                {isGroup && (
                  <span className="text-[10px] bg-[#005c4b]/80 text-[#25D366] px-1.5 py-0.2 rounded-md font-medium border border-[#25D366]/30">
                    Group
                  </span>
                )}
              </h4>
              <span className="text-[10px] text-[#25D366] font-semibold">Just now</span>
            </div>

            <p className="text-xs text-text-secondary truncate mt-0.5 flex items-center">
              {isGroup && <span className="font-semibold text-text-primary mr-1">{senderName}:</span>}
              <span className="truncate">{getMediaPreview()}</span>
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              clearNotificationToast();
            }}
            className="p-1.5 rounded-full hover:bg-white/10 text-text-tertiary hover:text-white transition-colors shrink-0"
            title="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
