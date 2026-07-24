'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useCallStore } from '@/store/useCallStore';
import { Video, Phone, ArrowLeft, Search, Trash2, X, MoreVertical, AlertTriangle, Copy, Forward, CornerUpLeft } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { WallpaperModal } from './WallpaperModal';
import { cn } from '@/lib/utils';

interface ChatHeaderProps {
  onBack: () => void;
  onSearchClick?: () => void;
  onGroupInfoClick: () => void;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  onForward?: (messages: any[]) => void;
}

export function ChatHeader({ onBack, onSearchClick, onGroupInfoClick, searchQuery = '', onSearchChange, onForward }: ChatHeaderProps) {
  const { activeChatId, chats, onlineUsers, typingStatuses, clearChat, selectedMessageIds, clearMessageSelection, messages } = useChatStore();
  const { activeCalls, joinOngoingCall, isCalling } = useCallStore();
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  
  const { user } = useAuthStore();
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const activeChat = chats.find(c => c.id === activeChatId);
  if (!activeChat) return null;

  const otherParticipant = activeChat.isGroup ? null : (activeChat.participants.find((p: any) => p.userId !== user?.id) || activeChat.participants[0]);
  const isOnline = otherParticipant ? onlineUsers[otherParticipant.userId] : false;
  const typingStatus = typingStatuses[activeChat.id];

  let chatName = activeChat.name;
  let chatImage = activeChat.groupPicture;

  if (!activeChat.isGroup && otherParticipant) {
    chatName = otherParticipant.user?.name || otherParticipant.user?.phoneNumber || 'Unknown';
    chatImage = otherParticipant.user?.profilePicture;
  }

  const startCall = (type: 'AUDIO' | 'VIDEO') => {
    useCallStore.setState({ caller: chatName });
    // For 1-to-1 calls, pass the other participant's ID as the first invited user.
    // This ensures they always appear on screen even when more people are added later.
    const initialInvitedIds = otherParticipant ? [otherParticipant.userId] : [];
    useCallStore.getState().initiateCall(type, activeChat.id, initialInvitedIds);
  };

  const handleClearChat = async () => {
    if (!activeChatId) return;
    setClearing(true);
    await clearChat(activeChatId);
    setClearing(false);
    setShowClearConfirm(false);
    setMenuOpen(false);
  };

  const [showWallpaperModal, setShowWallpaperModal] = useState(false);
  const activeCallInChat = activeChatId ? activeCalls[activeChatId] : null;

  return (
    <div className="flex flex-col shrink-0 relative z-40">
      <div 
        className="h-16 bg-surface-hover flex items-center justify-between py-2 border-b border-surface-border shrink-0 shadow-sm relative z-40"
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

          {/* ⋮ Three Dot Menu */}
          <div className="relative" ref={menuRef}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(prev => !prev)}
              title="More options"
            >
              <MoreVertical size={20} />
            </Button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -8 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                  className="absolute right-0 top-full mt-2 w-52 bg-[#1f2c34] border border-surface-border rounded-2xl shadow-2xl z-[9999] overflow-hidden py-1"
                >
                  {/* Search */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsMessageSearchOpen(true);
                      if (onSearchClick) onSearchClick();
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 text-text-primary hover:bg-white/5 transition-colors text-sm"
                  >
                    <Search size={16} className="text-text-secondary" />
                    <span>Search Messages</span>
                  </button>

                  <div className="h-px bg-surface-border mx-3" />

                  {/* Clear Chat */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowClearConfirm(true);
                      setMenuOpen(false);
                    }}
                    className="w-full flex items-center space-x-3 px-4 py-3 text-danger hover:bg-danger/10 transition-colors text-sm"
                  >
                    <Trash2 size={16} />
                    <span>Clear Chat</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Selection Toolbar Overlay */}
        <AnimatePresence>
          {selectedMessageIds.length > 0 && (
            <motion.div 
              key="selection-toolbar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#00A884] flex items-center justify-between px-4 z-[9999] text-white"
            >
              <div className="flex items-center space-x-4">
                <button onClick={clearMessageSelection} className="p-2 -ml-2 hover:bg-black/10 rounded-full transition-colors">
                  <ArrowLeft size={24} />
                </button>
                <span className="text-lg font-medium">{selectedMessageIds.length}</span>
              </div>
              
              <div className="flex items-center space-x-2">
                {selectedMessageIds.length === 1 && (
                  <button 
                    onClick={() => {
                      alert('Reply coming soon');
                      clearMessageSelection();
                    }}
                    className="p-2 hover:bg-black/10 rounded-full transition-colors"
                  >
                    <CornerUpLeft size={24} />
                  </button>
                )}
                
                <button 
                  onClick={() => {
                    if (activeChatId) {
                      const activeChatMsgs = messages[activeChatId] || [];
                      const selectedMsgs = activeChatMsgs.filter(m => selectedMessageIds.includes(m.id));
                      const text = selectedMsgs.map(m => m.content).filter(Boolean).join('\n\n');
                      if (text) {
                        navigator.clipboard.writeText(text);
                      }
                      clearMessageSelection();
                    }
                  }}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <Copy size={24} />
                </button>

                <button 
                  onClick={() => {
                    if (activeChatId && onForward) {
                      const activeChatMsgs = messages[activeChatId] || [];
                      const selectedMsgs = activeChatMsgs.filter(m => selectedMessageIds.includes(m.id));
                      onForward(selectedMsgs);
                    }
                  }}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <Forward size={24} />
                </button>

                <button 
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open-bulk-delete'));
                  }}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <Trash2 size={24} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isMessageSearchOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9998]"
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
                className="absolute inset-y-0 right-0 bg-surface-hover flex items-center px-4 overflow-hidden z-[9999]"
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

      {/* Ongoing Call Join Banner */}
      {activeCallInChat && !isCalling && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#00a884] text-white px-4 py-2 flex items-center justify-between shadow-md relative z-10"
        >
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Ongoing {activeCallInChat.callType === 'VIDEO' ? 'Video' : 'Voice'} Call • {activeCallInChat.activeCount} connected
            </span>
          </div>
          <button
            onClick={() => joinOngoingCall(activeChat.id, activeCallInChat.callType)}
            className="bg-white text-[#00a884] hover:bg-white/90 font-semibold px-3 py-1 rounded-full text-xs transition-transform active:scale-95 shadow cursor-pointer"
          >
            Join Call
          </button>
        </motion.div>
      )}

      {/* Clear Chat Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowClearConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#1f2c34] border border-surface-border rounded-2xl shadow-2xl p-6 w-full max-w-sm z-50 relative"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2.5 rounded-full bg-danger/20">
                  <AlertTriangle size={20} className="text-danger" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-base">Clear Chat</h3>
                  <p className="text-text-secondary text-xs">This cannot be undone</p>
                </div>
              </div>
              <p className="text-text-secondary text-sm mb-6">
                All messages in this chat will be permanently deleted for everyone. Are you sure?
              </p>
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearChat}
                  disabled={clearing}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-danger hover:bg-danger/90 text-white transition-colors cursor-pointer disabled:opacity-60 flex items-center space-x-1.5"
                >
                  {clearing ? (
                    <span>Clearing...</span>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Clear All</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
