import React, { useRef, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useCallStore } from '@/store/useCallStore';
import { X, Search, Bell, Video, Phone, ChevronRight, Info, Ban, Flag, ArrowLeft, Palette } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { WallpaperModal } from './WallpaperModal';
import toast from 'react-hot-toast';

interface ContactInfoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ContactInfoOverlay({ isOpen, onClose }: ContactInfoOverlayProps) {
  const { user } = useAuthStore();
  const { chats, activeChatId, blockedUsers, blockUser, unblockUser, reportUser, setIsMessageSearchOpen } = useChatStore();
  
  const overlayRef = useRef<HTMLDivElement>(null);
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showWallpaperModal) return;
      const target = event.target as HTMLElement;
      if (target?.closest?.('.fixed') || target?.closest?.('[role="dialog"]')) return;

      if (overlayRef.current && overlayRef.current.contains(event.target as Node)) return;
      if (isOpen && overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      setTimeout(() => { document.addEventListener('click', handleClickOutside); }, 0);
    }
    return () => { document.removeEventListener('click', handleClickOutside); };
  }, [isOpen, onClose, showWallpaperModal]);
  
  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;
  
  if (!isOpen || !activeChat || activeChat.isGroup) return null;

  const otherParticipant = activeChat.participants.find((p: any) => p.userId !== user?.id);
  if (!otherParticipant) return null;

  const contactUser = otherParticipant.user;
  const contactName = contactUser?.name || contactUser?.phoneNumber || 'Unknown';
  const contactPhone = contactUser?.phoneNumber || '';
  const contactAbout = contactUser?.about || 'Hey there! I am using NexusChat.';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          key="contact-info-overlay"
          ref={overlayRef}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.3 }}
          className="fixed top-0 right-0 h-full w-full md:w-[400px] bg-background shadow-2xl border-l border-surface-border/50 z-[100] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center space-x-4 p-4 bg-surface text-text-primary h-[60px] shadow-sm">
            <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-surface-hover transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-base font-medium">Contact Info</h2>
          </div>

          <div className="flex-1 overflow-y-auto bg-background pb-10">
            {/* Profile Picture */}
            <div className="bg-surface py-8 flex flex-col items-center justify-center shadow-sm">
              <Avatar src={contactUser?.profilePicture || otherParticipant?.profilePicture} alt={contactName} size="xl" className="mb-4" />
              <h1 className="text-xl font-medium text-text-primary text-center">{contactName}</h1>
              <p className="text-sm text-text-secondary mt-1">{contactPhone}</p>
            </div>

            {/* Quick Actions */}
            <div className="bg-surface mt-2 py-4 flex justify-around shadow-sm">
              <div 
                className="flex flex-col items-center cursor-pointer hover:opacity-80 text-primary"
                onClick={() => {
                  useCallStore.getState().initiateCall(otherParticipant.userId, 'AUDIO');
                  onClose();
                }}
              >
                <Phone size={24} className="mb-2" />
                <span className="text-xs font-medium">Audio</span>
              </div>
              <div 
                className="flex flex-col items-center cursor-pointer hover:opacity-80 text-primary"
                onClick={() => {
                  useCallStore.getState().initiateCall(otherParticipant.userId, 'VIDEO');
                  onClose();
                }}
              >
                <Video size={24} className="mb-2" />
                <span className="text-xs font-medium">Video</span>
              </div>
              <div 
                className="flex flex-col items-center cursor-pointer hover:opacity-80 text-primary"
                onClick={() => setShowWallpaperModal(true)}
              >
                <Palette size={24} className="mb-2" />
                <span className="text-xs font-medium">Theme</span>
              </div>
            </div>

            {/* About */}
            <div className="bg-surface mt-2 p-5 shadow-sm">
              <p className="text-sm text-primary mb-1 font-medium">About</p>
              <p className="text-text-primary">{contactAbout}</p>
            </div>
            
            {/* Action Buttons */}
            <div className="bg-surface mt-2 flex flex-col shadow-sm">
              {blockedUsers.find(b => b.blockedId === otherParticipant.userId) ? (
                <button 
                  onClick={async () => {
                    await unblockUser(otherParticipant.userId);
                    toast.success(`${contactName} has been unblocked.`);
                  }}
                  className="flex items-center p-4 text-primary hover:bg-surface-hover transition-colors text-left w-full border-b border-surface-border"
                >
                  <Ban size={20} className="mr-4" />
                  <span>Unblock {contactName}</span>
                </button>
              ) : (
                <button 
                  onClick={async () => {
                    const confirmed = window.confirm(`Are you sure you want to block ${contactName}?`);
                    if (confirmed) {
                      await blockUser(otherParticipant.userId);
                      toast.success(`${contactName} has been blocked.`);
                    }
                  }}
                  className="flex items-center p-4 text-danger hover:bg-surface-hover transition-colors text-left w-full border-b border-surface-border"
                >
                  <Ban size={20} className="mr-4" />
                  <span>Block {contactName}</span>
                </button>
              )}
              <button 
                onClick={async () => {
                  const reason = window.prompt(`Reason for reporting ${contactName}?`);
                  if (reason !== null) {
                    await reportUser(otherParticipant.userId, reason);
                    toast.success(`You have reported ${contactName}.`);
                    onClose();
                  }
                }}
                className="flex items-center p-4 text-danger hover:bg-surface-hover transition-colors text-left w-full"
              >
                <Flag size={20} className="mr-4" />
                <span>Report {contactName}</span>
              </button>
            </div>

          </div>
        </motion.div>
      )}

      {showWallpaperModal && activeChatId && (
        <WallpaperModal 
          isOpen={showWallpaperModal} 
          onClose={() => setShowWallpaperModal(false)} 
          chatId={activeChatId} 
        />
      )}
    </AnimatePresence>
  );
}
