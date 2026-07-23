import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useCallStore } from '@/store/useCallStore';
import { Video, Phone, Search, ArrowLeft, MoreVertical, Palette } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { WallpaperModal } from './WallpaperModal';

interface ChatHeaderProps {
  onBack: () => void;
  onSearchClick?: () => void;
  onGroupInfoClick: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export function ChatHeader({ onBack, onSearchClick, onGroupInfoClick, searchQuery = '', onSearchChange }: ChatHeaderProps) {
  const { activeChatId, chats, onlineUsers, typingStatuses, isMessageSearchOpen, setIsMessageSearchOpen } = useChatStore();
  const [menuOpen, setMenuOpen] = useState(false);
  
  const { user } = useAuthStore();
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsMessageSearchOpen(false);
        if (onSearchChange) onSearchChange('');
      }
    };
    if (isMessageSearchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMessageSearchOpen, onSearchChange, setIsMessageSearchOpen]);
  
  const activeChat = chats.find(c => c.id === activeChatId);
  if (!activeChat) return null;

  const otherParticipant = activeChat.isGroup ? null : (activeChat.participants.find((p: any) => p.userId !== user?.id) || activeChat.participants[0]);
  const isOnline = otherParticipant ? onlineUsers[otherParticipant.userId] : false;
  const typingStatus = typingStatuses[activeChat.id];

  let chatName = activeChat.name;
  let chatImage = activeChat.groupPicture;
  if (!activeChat.isGroup) {
    // Current user id can be found by checking which participant is not in onlineUsers?
    // Let's just use the activeChat's derived name for 1-1 chats (if it's not set by backend, we should use the other participant)
    // Actually, in the old code, it checked `p.userId !== user?.id`. We don't have user?.id here directly without useAuthStore.
  }

  if (!activeChat.isGroup && otherParticipant) {
    chatName = otherParticipant.user?.name || otherParticipant.user?.phoneNumber || 'Unknown';
    chatImage = otherParticipant.user?.profilePicture;
  }

  const startCall = (type: 'AUDIO' | 'VIDEO') => {
    useCallStore.setState({ caller: chatName });
    useCallStore.getState().initiateCall(type, activeChat.id);
  };

  const [showWallpaperModal, setShowWallpaperModal] = useState(false);

  return (
    <div 
      className="h-16 bg-surface-hover flex items-center justify-between py-2 border-b border-surface-border shrink-0 shadow-sm relative z-10"
      style={{
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))'
      }}
    >
      <WallpaperModal isOpen={showWallpaperModal} onClose={() => setShowWallpaperModal(false)} />
      <div className="flex items-center flex-1 min-w-0">
        <button onClick={onBack} className="md:hidden mr-2 p-2 -ml-2 text-text-secondary hover:text-text-primary transition-colors">
          <ArrowLeft size={24} />
        </button>
        
        <div 
          className="flex items-center min-w-0 cursor-pointer group" 
          onClick={onGroupInfoClick}
        >
          <Avatar src={chatImage} fallback={chatName?.charAt(0) || undefined} size="md" className="mr-3 shadow-sm group-hover:opacity-80 transition-opacity" />
          <div className="flex flex-col overflow-hidden mr-4">
            <h2 className="text-base font-medium text-text-primary truncate">{chatName}</h2>
            {typingStatus?.isTyping ? (
              <span className="text-sm text-primary animate-pulse font-medium">typing...</span>
            ) : isOnline ? (
              <span className="text-xs text-success font-medium">online</span>
            ) : activeChat.isGroup ? (
              <span className="text-xs text-text-secondary truncate">
                {activeChat.participants.map((p: any) => p.user?.name?.split(' ')[0] || p.user?.phoneNumber).join(', ')}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-2 text-text-secondary">
        <Button variant="ghost" size="icon" onClick={() => startCall('VIDEO')} title="Video Call">
          <Video size={20} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => startCall('AUDIO')} title="Voice Call">
          <Phone size={20} />
        </Button>
        <div className="w-px h-6 bg-surface-border mx-1"></div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => {
            setIsMessageSearchOpen(!isMessageSearchOpen);
            if (onSearchClick) onSearchClick();
          }} 
          title="Search Messages"
        >
          <Search size={20} />
        </Button>
      </div>

      <AnimatePresence>
        {isMessageSearchOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-10"
              onClick={() => {
                setIsMessageSearchOpen(false);
                if (onSearchChange) onSearchChange('');
              }}
            />
            <motion.div 
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '100%', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute inset-y-0 right-0 bg-surface-hover flex items-center px-4 overflow-hidden z-20"
              ref={searchContainerRef}
            >
              <button 
                onClick={() => {
                  setIsMessageSearchOpen(false);
                  if (onSearchChange) onSearchChange('');
                }}
                className="mr-3 text-text-secondary hover:text-text-primary"
              >
                <ArrowLeft size={20} />
              </button>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
                placeholder="Search messages..."
                className="flex-1 bg-surface border border-surface-border text-text-primary rounded-full px-4 py-1.5 focus:outline-none focus:border-primary text-sm transition-colors"
                autoFocus
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
