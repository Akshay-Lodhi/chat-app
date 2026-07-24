import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Search, Forward as ForwardIcon } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/store/useAuthStore';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onForward: (chatIds: string[]) => void;
}

export function ForwardMessageModal({ isOpen, onClose, onForward }: ForwardMessageModalProps) {
  const { chats } = useChatStore();
  const { user: currentUser } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);

  const filteredChats = chats.filter(chat => {
    const chatName = chat.isGroup 
      ? chat.name 
      : chat.participants?.find((p: any) => p.user?.id !== currentUser?.id)?.user?.name;
    return chatName?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleToggleChat = (chatId: string) => {
    setSelectedChatIds(prev => 
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  };

  const handleForward = () => {
    if (selectedChatIds.length > 0) {
      onForward(selectedChatIds);
      setSelectedChatIds([]);
      setSearchQuery('');
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[200] backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:bottom-auto md:w-[400px] h-[85vh] md:h-[600px] bg-surface rounded-t-3xl md:rounded-2xl z-[200] overflow-hidden shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-border bg-surface-hover shrink-0">
              <div className="flex items-center space-x-3">
                <button onClick={onClose} className="p-2 rounded-full hover:bg-black/20 text-text-secondary transition-colors">
                  <X size={24} />
                </button>
                <h2 className="text-xl font-semibold text-text-primary">Forward to...</h2>
              </div>
            </div>

            {/* Search */}
            <div className="p-4 shrink-0">
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Search size={20} className="text-text-tertiary" />
                </div>
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#182229] text-text-primary rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#00A884] placeholder:text-text-tertiary transition-shadow"
                />
              </div>
            </div>

            {/* Chat List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {filteredChats.map(chat => {
                const isSelected = selectedChatIds.includes(chat.id);
                const otherParticipant = chat.participants?.find((p: any) => p.user?.id !== currentUser?.id)?.user;
                const chatName = chat.isGroup ? chat.name : (otherParticipant?.name || otherParticipant?.phoneNumber);
                const chatImage = chat.isGroup ? chat.groupPicture : otherParticipant?.profilePicture;

                return (
                  <div
                    key={chat.id}
                    onClick={() => handleToggleChat(chat.id)}
                    className="flex items-center p-3 hover:bg-surface-hover rounded-xl cursor-pointer transition-colors"
                  >
                    <div className="relative">
                      <Avatar src={chatImage} fallback={chatName?.charAt(0)} size="md" />
                      {isSelected && (
                        <div className="absolute -bottom-1 -right-1 bg-[#00A884] rounded-full p-1 border-2 border-surface">
                          <Check size={12} className="text-white font-bold" />
                        </div>
                      )}
                    </div>
                    <div className="ml-4 flex-1 overflow-hidden">
                      <h3 className="text-base font-medium text-text-primary truncate">{chatName}</h3>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Bar */}
            {selectedChatIds.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 border-t border-surface-border bg-surface-hover shrink-0 flex items-center justify-between"
              >
                <span className="text-sm text-text-secondary">
                  {selectedChatIds.length} chat{selectedChatIds.length > 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={handleForward}
                  className="bg-[#00A884] hover:bg-[#008f6f] text-white p-3 rounded-full shadow-lg transition-transform active:scale-95 flex items-center justify-center"
                >
                  <ForwardIcon size={24} />
                </button>
              </motion.div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
