import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Avatar } from '@/components/ui/Avatar';

interface PollDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: any;
}

export function PollDetailsModal({ isOpen, onClose, message }: PollDetailsModalProps) {
  const { chats } = useChatStore();
  const { user: currentUser } = useAuthStore();
  
  if (!isOpen || !message || message.type !== 'POLL' || !message.metadata?.poll) return null;

  const poll = message.metadata.poll;
  const activeChat = chats.find(c => c.id === message.chatId);

  const getParticipant = (userId: string) => {
    if (userId === currentUser?.id) return currentUser;
    return activeChat?.participants?.find(p => p.userId === userId)?.user || null;
  };

  // Sort options by vote count descending
  const sortedOptions = [...poll.options].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="w-full h-[85vh] sm:h-auto sm:max-h-[85vh] sm:max-w-md bg-surface flex flex-col sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-surface-border shrink-0 bg-surface">
              <div className="flex items-center">
                <button onClick={onClose} className="p-2 -ml-2 text-[#00a884] hover:bg-white/5 rounded-full transition-colors mr-2">
                  <X size={24} />
                </button>
                <h2 className="text-lg font-semibold text-text-primary">Poll details</h2>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto bg-background p-4">
              <div className="bg-surface rounded-xl p-4 mb-4 shadow-sm border border-surface-border">
                <h3 className="text-[17px] font-medium text-text-primary">{poll.question}</h3>
              </div>

              <div className="space-y-4">
                {sortedOptions.map((opt: any) => {
                  const votes = opt.votes || [];
                  if (votes.length === 0) {
                    return (
                      <div key={opt.id} className="bg-surface rounded-xl overflow-hidden shadow-sm border border-surface-border">
                         <div className="p-4 border-b border-surface-border flex justify-between items-center">
                            <span className="font-semibold text-text-primary">{opt.text}</span>
                            <span className="text-sm text-text-secondary">0 votes</span>
                         </div>
                      </div>
                    );
                  }

                  return (
                    <div key={opt.id} className="bg-surface rounded-xl overflow-hidden shadow-sm border border-surface-border">
                      <div className="p-4 border-b border-surface-border flex justify-between items-center bg-black/10">
                        <span className="font-semibold text-text-primary">{opt.text}</span>
                        <span className="text-sm text-[#00a884] font-medium">{votes.length} {votes.length === 1 ? 'vote' : 'votes'}</span>
                      </div>
                      <div className="flex flex-col">
                        {votes.map((userId: string, idx: number) => {
                          const participant = getParticipant(userId);
                          const isMe = userId === currentUser?.id;
                          const name = isMe ? 'You' : (participant?.name || participant?.phoneNumber || 'User');
                          
                          return (
                            <div key={userId} className={cn("flex items-center p-3 hover:bg-black/5 transition-colors", idx !== votes.length - 1 ? 'border-b border-surface-border' : '')}>
                              <Avatar src={participant?.profilePicture} alt={name} size="sm" className="mr-3" />
                              <div className="flex flex-col flex-1">
                                <span className="font-medium text-text-primary text-[15px]">{name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Utility class generator
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}
