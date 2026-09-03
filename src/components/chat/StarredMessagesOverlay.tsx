import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, StarOff } from 'lucide-react';
import { useChatStore, Message } from '@/store/useChatStore';
import { Avatar } from '@/components/ui/Avatar';

interface StarredMessagesOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StarredMessagesOverlay({ isOpen, onClose }: StarredMessagesOverlayProps) {
  const { starredMessages, fetchStarredMessages, toggleStar, setActiveChat } = useChatStore();

  useEffect(() => {
    if (isOpen) {
      fetchStarredMessages();
    }
  }, [isOpen, fetchStarredMessages]);

  const handleMessageClick = (chatId: string) => {
    setActiveChat(chatId);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'tween', duration: 0.3 }}
          className="absolute inset-0 z-50 flex flex-col bg-background"
        >
          {/* Header */}
          <div className="h-[108px] bg-surface-hover flex items-end px-6 pb-4 shrink-0 shadow-sm">
            <div className="flex items-center text-text-primary">
              <button onClick={onClose} className="mr-6 hover:opacity-80 transition-opacity">
                <ArrowLeft size={24} />
              </button>
              <h1 className="text-xl font-semibold">Starred messages</h1>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto bg-surface-hover custom-scrollbar p-2">
            {starredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-text-secondary text-center">
                <div className="w-32 h-32 mb-6 rounded-full bg-surface flex items-center justify-center">
                  <StarOff size={48} className="text-text-tertiary opacity-50" />
                </div>
                <p>No starred messages</p>
              </div>
            ) : (
              <div className="space-y-2">
                {starredMessages.map((msg: Message & { sender?: any; chat?: any }) => (
                  <div 
                    key={msg.id} 
                    className="bg-surface p-4 cursor-pointer hover:bg-surface-hover transition-colors"
                    onClick={() => handleMessageClick(msg.chatId)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <Avatar 
                          src={msg.sender?.profilePicture} 
                          fallback={msg.sender?.name || msg.sender?.phoneNumber} 
                          size="sm" 
                        />
                        <div className="flex flex-col text-sm">
                          <span className="font-semibold text-text-primary">
                            {msg.sender?.name || msg.sender?.phoneNumber}
                          </span>
                          <span className="text-xs text-text-tertiary">
                            {msg.chat?.isGroup ? msg.chat.name : 'You'}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-text-tertiary">
                        {new Date(msg.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    
                    <div className="text-sm text-text-secondary line-clamp-3 ml-11">
                      {msg.content || (msg.type === 'IMAGE' ? '📷 Photo' : msg.type === 'VIDEO' ? '🎥 Video' : msg.type === 'AUDIO' ? '🎤 Voice message' : 'Message')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
