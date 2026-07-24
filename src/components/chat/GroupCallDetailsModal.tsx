'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, Video, CheckCircle2, XCircle, Users, Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallStore } from '@/store/useCallStore';
import { useAuthStore } from '@/store/useAuthStore';

interface GroupCallDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  call: any;
}

export function GroupCallDetailsModal({ isOpen, onClose, call }: GroupCallDetailsModalProps) {
  const { initiateCall } = useCallStore();
  const { user: currentUser } = useAuthStore();

  if (!isOpen || !call) return null;

  const isVideo = call.type === 'VIDEO';
  const groupName = call.otherUser?.name || 'Group Call';
  const groupPfp = call.otherUser?.profilePicture;
  const rawParticipants = call.groupParticipants || [];

  // Ensure current user is in participants list if missing
  const allParticipantsMap = new Map<string, any>();
  if (currentUser) {
    allParticipantsMap.set(currentUser.id, currentUser);
  }
  rawParticipants.forEach((u: any) => {
    if (u && u.id) {
      allParticipantsMap.set(u.id, u);
    }
  });

  const allParticipants = Array.from(allParticipantsMap.values());

  const joinedUsers: any[] = [];
  const notJoinedUsers: any[] = [];

  const callerId = call.callerId;

  allParticipants.forEach((pUser: any) => {
    const isCaller = pUser.id === callerId || (call.isOutgoing && pUser.id === currentUser?.id);
    
    if (isCaller) {
      joinedUsers.push({
        ...pUser,
        statusLabel: 'Host / Started Call',
        joined: true
      });
    } else if (!call.isUnanswered) {
      joinedUsers.push({
        ...pUser,
        statusLabel: 'Joined',
        joined: true
      });
    } else {
      notJoinedUsers.push({
        ...pUser,
        statusLabel: 'No answer',
        joined: false
      });
    }
  });

  const dateObj = new Date(call.startedAt);
  const formattedDateTime = dateObj.toLocaleDateString('en-US', { 
    month: 'short', day: 'numeric', year: 'numeric' 
  }) + ' at ' + dateObj.toLocaleTimeString('en-US', { 
    hour: 'numeric', minute: '2-digit', hour12: true 
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Content Box */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-md bg-[#1f2c34] border border-surface-border/60 rounded-3xl shadow-2xl overflow-hidden text-white z-10"
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between p-4 border-b border-surface-border/40 bg-[#111b21]">
            <div className="flex items-center space-x-2">
              <Users size={18} className="text-[#25D366]" />
              <h3 className="font-extrabold text-base text-white">Group Call Info</h3>
            </div>

            <button 
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Group Banner Info */}
          <div className="p-5 flex flex-col items-center border-b border-surface-border/30 bg-[#1f2c34]">
            {/* Avatar / Image */}
            <div className="relative mb-3">
              {groupPfp ? (
                <img src={groupPfp} alt={groupName} className="w-20 h-20 rounded-full object-cover border-2 border-[#25D366]/40 shadow-md" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#005c4b] border-2 border-[#25D366]/40 flex items-center justify-center text-[#25D366] text-xl font-bold shadow-md">
                  <Users size={36} />
                </div>
              )}
              <div className={cn(
                "absolute -bottom-1 -right-1 p-2 rounded-full border-2 border-[#1f2c34]",
                call.isUnanswered ? "bg-red-500/20 text-red-500" : "bg-[#25D366]/20 text-[#25D366]"
              )}>
                {isVideo ? <Video size={16} /> : <Phone size={16} />}
              </div>
            </div>

            {/* Title & Badge */}
            <h2 className="text-lg font-bold text-white text-center">{groupName}</h2>
            <div className="flex items-center space-x-1.5 mt-1 text-xs text-text-tertiary">
              <Clock size={13} />
              <span>{formattedDateTime}</span>
            </div>

            <div className="flex items-center space-x-2 mt-3">
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-bold border flex items-center space-x-1",
                call.isUnanswered 
                  ? "bg-red-500/10 text-red-400 border-red-500/30"
                  : "bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30"
              )}>
                {call.isOutgoing ? (
                  <ArrowUpRight size={13} className="mr-1" />
                ) : (
                  <ArrowDownLeft size={13} className="mr-1" />
                )}
                <span>{call.callLabel}</span>
              </span>
            </div>
          </div>

          {/* Participants Breakdown (Joined vs Missed) */}
          <div className="p-4 space-y-4 max-h-72 overflow-y-auto no-scrollbar">
            {/* Joined Section */}
            {joinedUsers.length > 0 && (
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#25D366] mb-2 flex items-center space-x-1.5">
                  <CheckCircle2 size={14} />
                  <span>Joined Call ({joinedUsers.length})</span>
                </h4>

                <div className="space-y-2">
                  {joinedUsers.map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-[#111b21] border border-surface-border/30">
                      <div className="flex items-center space-x-3">
                        {u.profilePicture ? (
                          <img src={u.profilePicture} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#005c4b] text-[#25D366] font-bold text-xs flex items-center justify-center border border-[#25D366]/30">
                            {(u.name || 'U').substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-white">
                            {u.id === currentUser?.id ? `${u.name || 'You'} (You)` : (u.name || u.phoneNumber || 'User')}
                          </p>
                          <p className="text-[10px] text-text-tertiary">{u.statusLabel}</p>
                        </div>
                      </div>
                      <span className="text-[10px] bg-[#25D366]/20 text-[#25D366] px-2.5 py-0.5 rounded-full font-bold">
                        Connected
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Not Joined / Missed Section */}
            {notJoinedUsers.length > 0 && (
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-red-400 mb-2 flex items-center space-x-1.5">
                  <XCircle size={14} />
                  <span>Did Not Join / Missed ({notJoinedUsers.length})</span>
                </h4>

                <div className="space-y-2">
                  {notJoinedUsers.map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-[#111b21] border border-surface-border/30">
                      <div className="flex items-center space-x-3">
                        {u.profilePicture ? (
                          <img src={u.profilePicture} alt="" className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-red-500/20 text-red-400 font-bold text-xs flex items-center justify-center border border-red-500/30">
                            {(u.name || 'U').substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-white">
                            {u.id === currentUser?.id ? `${u.name || 'You'} (You)` : (u.name || u.phoneNumber || 'User')}
                          </p>
                          <p className="text-[10px] text-text-tertiary">{u.statusLabel}</p>
                        </div>
                      </div>
                      <span className="text-[10px] bg-red-500/20 text-red-400 px-2.5 py-0.5 rounded-full font-bold">
                        Missed
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer Call Back Actions */}
          <div className="p-4 border-t border-surface-border/40 bg-[#111b21] flex items-center space-x-3">
            <button 
              onClick={() => {
                onClose();
                if (call.chatId && call.otherUser?.id) {
                  initiateCall('AUDIO', call.chatId, [call.otherUser.id]);
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] font-bold text-xs flex items-center justify-center space-x-2 transition-colors border border-[#25D366]/30"
            >
              <Phone size={16} />
              <span>Voice Call Back</span>
            </button>

            <button 
              onClick={() => {
                onClose();
                if (call.chatId && call.otherUser?.id) {
                  initiateCall('VIDEO', call.chatId, [call.otherUser.id]);
                }
              }}
              className="flex-1 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-black font-extrabold text-xs flex items-center justify-center space-x-2 transition-colors shadow-md"
            >
              <Video size={16} />
              <span>Video Call Back</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
