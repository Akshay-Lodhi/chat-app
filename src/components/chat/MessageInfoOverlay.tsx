import React, { useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Check, CheckCheck } from 'lucide-react';
import { MessageBubble } from './MessageBubble';

export function MessageInfoOverlay() {
  const { user } = useAuthStore();
  const { messageForInfo, setMessageForInfo } = useChatStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  const isOpen = !!messageForInfo;

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
        <div className="h-16 flex items-center px-4 border-b border-surface-border bg-surface shrink-0">
          <button 
            onClick={() => setMessageForInfo(null)}
            className="p-2 mr-2 rounded-full hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-lg font-medium">Message info</h2>
        </div>

        <div className="flex-1 overflow-y-auto bg-chat-bg">
          <div className="p-4 md:p-6 mb-4">
            <MessageBubble 
              message={messageForInfo} 
              isMine={messageForInfo.senderId === user?.id}
              hideInfoOption
            />
          </div>

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
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
