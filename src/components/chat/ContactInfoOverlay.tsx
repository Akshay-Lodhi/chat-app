import React, { useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useCallStore } from '@/store/useCallStore';
import { X, Search, Bell, Video, Phone, ChevronRight, Info, Ban, Flag, ArrowLeft } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';

interface ContactInfoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ContactInfoOverlay({ isOpen, onClose }: ContactInfoOverlayProps) {
  const { user } = useAuthStore();
  const { chats, activeChatId, blockedUsers, blockUser, unblockUser, reportUser, setIsMessageSearchOpen } = useChatStore();
  
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (overlayRef.current && overlayRef.current.contains(event.target as Node)) return;
      if (isOpen && overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      setTimeout(() => { document.addEventListener('click', handleClickOutside); }, 0);
    }
    return () => { document.removeEventListener('click', handleClickOutside); };
  }, [isOpen, onClose]);
  
  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;
  
  if (!isOpen || !activeChat || activeChat.isGroup) return null;

  const otherParticipant = activeChat.participants.find((p: any) => p.userId !== user?.id);
  if (!otherParticipant) return null;

  const contactUser = otherParticipant.user;
  const contactName = contactUser?.name || contactUser?.phoneNumber || 'Unknown';
  const contactPhone = contactUser?.phoneNumber || '';
  const contactAbout = contactUser?.about || 'Hey there! I am using WhatsApp.';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          ref={overlayRef}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.3 }}
          className="absolute inset-y-0 right-0 w-full md:w-[400px] bg-surface z-40 flex flex-col shadow-2xl border-l border-surface-border"
        >
          {/* Header */}
          <div className="h-16 bg-surface-hover flex items-center px-4 py-2 border-b border-surface-border shrink-0">
            <button onClick={onClose} className="mr-4 text-text-secondary hover:text-text-primary">
              <ArrowLeft size={24} />
            </button>
            <h2 className="text-base font-medium text-text-primary">Contact Info</h2>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar pb-10 bg-chat-bg">
            
            {/* Profile Picture & Name */}
            <div className="bg-surface p-6 flex flex-col items-center shadow-sm">
              <Avatar src={contactUser.profilePicture} fallback={contactName.charAt(0)} size="xl" className="mb-4" />
              <h2 className="text-xl font-medium text-text-primary">{contactName}</h2>
              <p className="text-text-secondary mt-1">{contactPhone}</p>
            </div>

            {/* Actions */}
            <div className="bg-surface mt-2 p-4 flex justify-around shadow-sm text-primary">
              <div 
                className="flex flex-col items-center cursor-pointer hover:opacity-80"
                onClick={() => {
                  useCallStore.setState({ caller: contactName });
                  useCallStore.getState().initiateCall('AUDIO', activeChat.id);
                  onClose();
                }}
              >
                <Phone size={24} className="mb-2" />
                <span className="text-xs font-medium">Audio</span>
              </div>
              <div 
                className="flex flex-col items-center cursor-pointer hover:opacity-80"
                onClick={() => {
                  useCallStore.setState({ caller: contactName });
                  useCallStore.getState().initiateCall('VIDEO', activeChat.id);
                  onClose();
                }}
              >
                <Video size={24} className="mb-2" />
                <span className="text-xs font-medium">Video</span>
              </div>
              <div 
                className="flex flex-col items-center cursor-pointer hover:opacity-80"
                onClick={() => {
                  setIsMessageSearchOpen(true);
                  onClose();
                }}
              >
                <Search size={24} className="mb-2 text-text-secondary" />
                <span className="text-xs font-medium text-text-secondary">Search</span>
              </div>
            </div>

            {/* About */}
            <div className="bg-surface mt-2 p-5 shadow-sm">
              <p className="text-sm text-primary mb-1 font-medium">About</p>
              <p className="text-text-primary">{contactAbout}</p>
            </div>
            
            {/* Media/Docs links would go here */}
            
            {/* Action Buttons */}
            <div className="bg-surface mt-2 flex flex-col shadow-sm">
              {blockedUsers.find(b => b.blockedId === otherParticipant.userId) ? (
                <button 
                  onClick={async () => {
                    await unblockUser(otherParticipant.userId);
                    alert(`${contactName} has been unblocked.`);
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
                      alert(`${contactName} has been blocked.`);
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
                    alert(`You have reported ${contactName}.`);
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
    </AnimatePresence>
  );
}
