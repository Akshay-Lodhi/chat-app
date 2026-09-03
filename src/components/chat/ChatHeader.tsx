'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useCallStore } from '@/store/useCallStore';
import { Video, Phone, ArrowLeft, Search, Trash2, X, MoreVertical, AlertTriangle, Copy, Forward, CornerUpLeft, Clock, Sparkles } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { WallpaperModal } from './WallpaperModal';
import DisappearingMessagesModal from './DisappearingMessagesModal';
import AISummaryModal from './AISummaryModal';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/apiClient';
import toast from 'react-hot-toast';

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
  const [showDisappearingModal, setShowDisappearingModal] = useState(false);
  const [showAISummaryModal, setShowAISummaryModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const { user } = useAuthStore();
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCreateInstantMeeting = async () => {
    try {
      const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      const res = await apiClient(`${SERVER_URL}/api/meetings/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Instant Meeting by ${user?.name || 'Nexus User'}`
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(data.meetingUrl);
        }
        toast.success(`Meeting Link Created & Copied!\n\nLink: ${data.meetingUrl}`);
        window.open(`/join/${data.code}`, '_blank');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate instant meeting link.');
    }
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
    const handleMenuClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleMenuClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleMenuClickOutside);
    };
  }, [menuOpen]);

  const toggleMenu = (e: React.MouseEvent) => {
    setMenuOpen(!menuOpen);
  };

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
    const initialInvitedIds = otherParticipant ? [otherParticipant.userId] : [];
    
    const initialProfiles: Record<string, { name: string; avatar: string | null }> = {};
    activeChat.participants.forEach((p: any) => {
      if (p.userId) {
        initialProfiles[p.userId] = {
          name: p.user?.name || p.user?.phoneNumber || 'Participant',
          avatar: p.user?.profilePicture || null
        };
      }
    });

    useCallStore.getState().initiateCall(type, activeChat.id, initialInvitedIds, initialProfiles);
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
    <div className="flex flex-col shrink-0 relative z-50">
      <div 
        className="h-[72px] bg-surface/70 backdrop-blur-2xl flex items-center justify-between py-2 border-b border-surface-border/50 shrink-0 shadow-sm relative z-50 transition-colors"
        style={{
          paddingLeft: 'max(16px, env(safe-area-inset-left))',
          paddingRight: 'max(16px, env(safe-area-inset-right))'
        }}
      >
        <WallpaperModal isOpen={showWallpaperModal} onClose={() => setShowWallpaperModal(false)} />
        {showDisappearingModal && activeChat && (
          <DisappearingMessagesModal
            chatId={activeChat.id}
            currentTimer={activeChat.disappearingTimer}
            onClose={() => setShowDisappearingModal(false)}
          />
        )}
        <div className="flex items-center flex-1 min-w-0 h-full">
          <button onClick={onBack} className="md:hidden mr-3 p-2 -ml-2 text-text-secondary hover:text-primary transition-colors bg-surface-hover/50 rounded-full">
            <ArrowLeft size={20} />
          </button>
          
          <div 
            className="flex items-center min-w-0 cursor-pointer group h-full py-1 px-2 -ml-2 rounded-xl hover:bg-surface-hover/50 transition-colors" 
            onClick={onGroupInfoClick}
          >
            <div className="relative mr-3 shrink-0">
              <Avatar src={chatImage} fallback={chatName?.charAt(0) || undefined} size="md" className="shadow-sm group-hover:scale-105 transition-transform duration-300" />
              {isOnline && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-success rounded-full border-2 border-background z-10 animate-pulse shadow-sm" />
              )}
            </div>
            
            <div className="flex flex-col overflow-hidden justify-center h-full">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-base font-semibold text-text-primary truncate">{chatName}</h2>
                {activeChat?.disappearingTimer && activeChat.disappearingTimer > 0 ? (
                  <span title="Disappearing messages active" className="text-primary flex items-center shrink-0">
                    <Clock size={14} />
                  </span>
                ) : null}
              </div>
              {typingStatus?.isTyping ? (
                <span className="text-xs text-primary animate-pulse font-medium tracking-wide">typing...</span>
              ) : isOnline ? (
                <span className="text-[11px] text-text-secondary font-medium uppercase tracking-wide">online</span>
              ) : activeChat.isGroup ? (
                <span className="text-[12px] text-text-tertiary truncate">
                  {activeChat.participants.map((p: any) => p.user?.name?.split(' ')[0] || p.user?.phoneNumber).join(', ')}
                </span>
              ) : (
                <span className="text-[11px] text-text-tertiary font-medium uppercase tracking-wide">offline</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 text-text-secondary">
          {chatName !== 'Nexus AI' && (
            <>
              <button onClick={() => startCall('VIDEO')} title="Video Call" className="p-2.5 rounded-full hover:bg-primary/10 hover:text-primary transition-colors">
                <Video size={20} />
              </button>
              <button onClick={() => startCall('AUDIO')} title="Voice Call" className="p-2.5 rounded-full hover:bg-primary/10 hover:text-primary transition-colors">
                <Phone size={20} />
              </button>
              <div className="w-px h-6 bg-surface-border/50 mx-1"></div>
            </>
          )}

          {/* ⋮ Three Dot Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={toggleMenu}
              title="More options"
              className="p-2.5 rounded-full hover:bg-surface-hover transition-colors"
            >
              <MoreVertical size={20} />
            </button>
            
            {/* Three Dot Menu Dropdown */}
            <AnimatePresence>
              {menuOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                    className="absolute top-12 right-0 w-56 bg-background border border-surface-border/50 rounded-2xl shadow-2xl py-2 z-[9999] overflow-hidden"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Instant Meeting Link (Zoom/Meet Style) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpen(false);
                        handleCreateInstantMeeting();
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-primary hover:bg-primary/10 transition-colors text-sm font-semibold border-b border-surface-border/30"
                    >
                      <Sparkles size={16} className="text-primary" />
                      <span>Instant Meeting Link</span>
                    </button>

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
                      className="w-full flex items-center space-x-3 px-4 py-3 text-text-primary hover:bg-surface-hover transition-colors text-sm font-medium"
                    >
                      <Search size={16} className="text-text-secondary" />
                      <span>Search Messages</span>
                    </button>

                    {/* AI Summarize Chat */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowAISummaryModal(true);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-accent hover:bg-accent/10 transition-colors text-sm font-medium"
                    >
                      <Sparkles size={16} className="text-accent" />
                      <span>AI Summarize Chat</span>
                    </button>

                    {/* Disappearing Messages */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowDisappearingModal(true);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-text-primary hover:bg-surface-hover transition-colors text-sm font-medium"
                    >
                      <Clock size={16} className="text-success" />
                      <span>Disappearing Messages</span>
                    </button>

                    <div className="h-px bg-surface-border/50 mx-3 my-1" />

                    {/* Clear Chat */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowClearConfirm(true);
                        setMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-danger hover:bg-danger/10 transition-colors text-sm font-medium"
                    >
                      <Trash2 size={16} />
                      <span>Clear Chat</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Selection Toolbar Overlay */}
        <AnimatePresence>
          {selectedMessageIds.length > 0 && (
            <motion.div 
              key="selection-toolbar"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-0 bg-primary flex items-center justify-between px-4 z-[9999] text-white shadow-lg"
            >
              <div className="flex items-center space-x-4">
                <button onClick={clearMessageSelection} className="p-2 -ml-2 hover:bg-black/20 rounded-full transition-colors">
                  <ArrowLeft size={20} />
                </button>
                <span className="text-base font-semibold">{selectedMessageIds.length} Selected</span>
              </div>
              
              <div className="flex items-center space-x-1">
                {selectedMessageIds.length === 1 && (
                  <button 
                    onClick={() => {
                      toast.error('Reply coming soon');
                      clearMessageSelection();
                    }}
                    className="p-2.5 hover:bg-black/20 rounded-full transition-colors"
                    title="Reply"
                  >
                    <CornerUpLeft size={20} />
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
                  className="p-2.5 hover:bg-black/20 rounded-full transition-colors"
                  title="Copy"
                >
                  <Copy size={20} />
                </button>

                <button 
                  onClick={() => {
                    if (activeChatId && onForward) {
                      const activeChatMsgs = messages[activeChatId] || [];
                      const selectedMsgs = activeChatMsgs.filter(m => selectedMessageIds.includes(m.id));
                      onForward(selectedMsgs);
                    }
                  }}
                  className="p-2.5 hover:bg-black/20 rounded-full transition-colors"
                  title="Forward"
                >
                  <Forward size={20} />
                </button>

                <button 
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('open-bulk-delete'));
                  }}
                  className="p-2.5 hover:bg-black/20 rounded-full transition-colors"
                  title="Delete"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ongoing Call Join Banner */}
      {activeCallInChat && !isCalling && (activeChat?.isGroup ? activeCallInChat.activeCount > 0 : activeCallInChat.activeCount > 1) && (
        <motion.div 
          initial={{ opacity: 0, y: -20, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          className="bg-primary text-white px-4 py-2 flex items-center justify-between shadow-md relative z-10"
        >
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Ongoing {activeCallInChat.callType === 'VIDEO' ? 'Video' : 'Voice'} Call • {activeCallInChat.activeCount} connected
            </span>
          </div>
          <button
            onClick={() => joinOngoingCall(activeChat.id, activeCallInChat.callType)}
            className="bg-white text-primary hover:bg-white/90 font-bold px-4 py-1.5 rounded-full text-xs transition-transform active:scale-95 shadow cursor-pointer"
          >
            Join Call
          </button>
        </motion.div>
      )}

      {/* Search Toolbar Overlay Portal */}
      {isMounted && createPortal(
        <AnimatePresence>
          {isMessageSearchOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm"
                onClick={() => {
                  setIsMessageSearchOpen(false);
                  if (onSearchChange) onSearchChange('');
                }}
              />
              <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -20, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed top-4 right-4 left-4 md:left-auto md:w-96 bg-surface/90 backdrop-blur-xl flex items-center px-4 py-3 rounded-2xl z-[9999] shadow-2xl border border-surface-border/50"
                ref={searchContainerRef}
              >
                <button 
                  onClick={() => {
                    setIsMessageSearchOpen(false);
                    if (onSearchChange) onSearchChange('');
                  }}
                  className="mr-3 text-text-secondary hover:text-text-primary bg-surface-hover/50 p-2 rounded-full transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
                  placeholder="Search in chat..."
                  className="flex-1 bg-surface-hover/50 border border-surface-border/50 text-text-primary rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all placeholder:text-text-tertiary"
                  autoFocus
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Clear Chat Confirmation Modal Portal */}
      {isMounted && createPortal(
        <AnimatePresence>
          {showClearConfirm && (
            <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md"
                onClick={() => setShowClearConfirm(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-surface/90 backdrop-blur-2xl border border-surface-border/50 rounded-3xl shadow-2xl p-6 w-full max-w-sm z-50 relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-danger/80" />
                <div className="flex items-center space-x-4 mb-4 mt-2">
                  <div className="p-3 rounded-2xl bg-danger/10 border border-danger/20 shadow-inner">
                    <AlertTriangle size={24} className="text-danger" />
                  </div>
                  <div>
                    <h3 className="text-text-primary font-bold text-lg">Clear Chat</h3>
                    <p className="text-text-tertiary text-xs font-medium uppercase tracking-wide mt-1">Irreversible action</p>
                  </div>
                </div>
                <p className="text-text-secondary text-sm mb-8 leading-relaxed">
                  Are you sure you want to delete this chat? All messages will be permanently erased for everyone.
                </p>
                <div className="flex items-center justify-end space-x-3">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearChat}
                    disabled={clearing}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-danger hover:bg-danger/90 text-white transition-all cursor-pointer disabled:opacity-60 flex items-center space-x-2 shadow-lg shadow-danger/20"
                  >
                    {clearing ? (
                      <span>Clearing...</span>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        <span>Clear Chat</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {showAISummaryModal && activeChatId && (
        <AISummaryModal
          chatId={activeChatId}
          onClose={() => setShowAISummaryModal(false)}
        />
      )}
    </div>
  );
}
