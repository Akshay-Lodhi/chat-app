'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, Video, PhoneMissed, Users, CheckCircle2, XCircle, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ParticipantInfo {
  userId: string;
  name: string;
  avatar?: string | null;
  status: 'JOINED' | 'INVITED' | 'MISSED';
  time?: string;
}

interface CallDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  callData: {
    action?: string;
    duration?: number;
    type?: 'AUDIO' | 'VIDEO';
    isGroup?: boolean;
    participants?: ParticipantInfo[];
    initiatorId?: string;
  };
  createdAt: string | Date;
  onReCall?: (type: 'AUDIO' | 'VIDEO') => void;
  isMine?: boolean;
  currentUserId?: string;
}

export function CallDetailsModal({ isOpen, onClose, callData, createdAt, onReCall, isMine, currentUserId }: CallDetailsModalProps) {
  if (!isOpen) return null;

  const isVideo = callData.type === 'VIDEO';
  const isGroup = Boolean(callData.isGroup);
  const isMissed = callData.duration === 0 || callData.action === 'MISSED';

  const formattedDate = new Date(createdAt).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const durationText = callData.duration && callData.duration > 0
    ? `${Math.floor(callData.duration / 60)}m ${callData.duration % 60}s`
    : 'No answer';

  const participants = callData.participants || [];
  const joinedList = participants.filter(p => p.status === 'JOINED');
  const invitedList = participants.filter(p => p.status !== 'JOINED');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-[#111b21] border border-surface-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden z-10 relative flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-surface-border bg-[#182229]">
            <div className="flex items-center space-x-3">
              <div className={cn("p-2.5 rounded-full", isMissed ? "bg-danger/20 text-danger" : "bg-emerald-500/20 text-emerald-400")}>
                {isVideo ? <Video size={20} /> : (isMissed ? <PhoneMissed size={20} /> : <Phone size={20} />)}
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">
                  {isGroup ? `Group ${isVideo ? 'Video' : 'Voice'} Call` : `${isVideo ? 'Video' : 'Voice'} Call`}
                </h2>
                <p className="text-xs text-white/60">{formattedDate}</p>
              </div>
            </div>
            <button 
              type="button" 
              onClick={onClose} 
              className="p-1.5 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 max-h-[420px] overflow-y-auto space-y-4">
            
            {/* Call Summary Badge */}
            <div className="bg-[#1f2c34] p-3.5 rounded-2xl border border-surface-border/60 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs text-white/80">
                <Clock size={15} className="text-primary" />
                <span>Call Duration: <strong className="text-white font-medium">{durationText}</strong></span>
              </div>
              <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", isMissed ? "bg-danger/20 text-danger" : "bg-emerald-500/20 text-emerald-400")}>
                {isMissed ? 'Missed' : 'Completed'}
              </span>
            </div>

            {/* Joined Participants Section */}
            {joinedList.length > 0 && (
              <div>
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">
                  <CheckCircle2 size={14} />
                  <span>Joined Participants ({joinedList.length})</span>
                </div>
                <div className="space-y-2">
                  {joinedList.map((p, idx) => (
                    <div key={p.userId || idx} className="flex items-center justify-between p-3 rounded-2xl bg-[#1f2c34]/70 border border-emerald-500/30">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-semibold overflow-hidden border border-emerald-500/40">
                          {p.avatar ? (
                            <img src={p.avatar} className="w-full h-full object-cover" />
                          ) : (
                            p.name.charAt(0)
                          )}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium flex items-center gap-1.5">
                            {p.name}
                            {currentUserId && p.userId === currentUserId && (
                              <span className="text-[10px] font-semibold text-white/50 bg-white/10 px-1.5 py-0.5 rounded-full">You</span>
                            )}
                          </p>
                          <p className="text-emerald-400 text-xs font-medium">
                            {isMine && currentUserId && p.userId === currentUserId ? 'Initiator • Host' : 'Joined • Connected'}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-medium">Joined</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invited / Missed Section */}
            {invitedList.length > 0 && (
              <div>
                <div className="flex items-center space-x-1.5 text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                  <XCircle size={14} />
                  <span>Invited / Didn't Join ({invitedList.length})</span>
                </div>
                <div className="space-y-2">
                  {invitedList.map((p, idx) => (
                    <div key={p.userId || idx} className="flex items-center justify-between p-3 rounded-2xl bg-[#1f2c34]/40 border border-surface-border">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-white/10 text-white/60 flex items-center justify-center font-medium overflow-hidden">
                          {p.avatar ? (
                            <img src={p.avatar} className="w-full h-full object-cover" />
                          ) : (
                            p.name.charAt(0)
                          )}
                        </div>
                        <div>
                          <p className="text-white/80 text-sm font-medium flex items-center gap-1.5">
                            {p.name}
                            {currentUserId && p.userId === currentUserId && (
                              <span className="text-[10px] font-semibold text-white/50 bg-white/10 px-1.5 py-0.5 rounded-full">You</span>
                            )}
                          </p>
                          <p className="text-white/40 text-xs">Invited • No Answer</p>
                        </div>
                      </div>
                      <span className="text-[11px] bg-white/10 text-white/50 px-3 py-1 rounded-full font-medium">Missed</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Default Participant info if list empty */}
            {participants.length === 0 && (
              <div className="text-center py-4 text-white/60 text-xs">
                Call log details recorded.
              </div>
            )}
          </div>

          {/* Footer Call Back Action */}
          <div className="p-4 border-t border-surface-border bg-[#182229] flex items-center space-x-3 shrink-0">
            <button 
              type="button"
              onClick={() => {
                onClose();
                onReCall?.('AUDIO');
              }}
              className="flex-1 py-3 rounded-full bg-[#005c4b] hover:bg-[#005c4b]/80 text-[#25D366] font-bold text-xs flex items-center justify-center space-x-2 transition-all border border-[#25D366]/30 cursor-pointer shadow-sm active:scale-95"
            >
              <Phone size={16} />
              <span>Voice Call Back</span>
            </button>

            <button 
              type="button"
              onClick={() => {
                onClose();
                onReCall?.('VIDEO');
              }}
              className="flex-1 py-3 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-black font-extrabold text-xs flex items-center justify-center space-x-2 transition-all shadow-md cursor-pointer active:scale-95"
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
