'use client';

import React, { useState, useEffect } from 'react';
import { 
  Phone, Video, Trash2, ArrowUpRight, ArrowDownLeft, 
  Search, Check
} from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { CallDetailsModal } from './CallDetailsModal';

export function CallsView() {
  const { user } = useAuthStore();
  const { calls, fetchCalls, clearCallLogs, chats, messages } = useChatStore();
  const { initiateCall } = useCallStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'missed' | 'unanswered'>('all');
  const [isCleared, setIsCleared] = useState(false);
  const [showClearToast, setShowClearToast] = useState(false);
  const [selectedCall, setSelectedCall] = useState<any>(null);

  // Fetch paginated calls from DB
  useEffect(() => {
    fetchCalls('better-auth-session', 1, 50);
  }, [fetchCalls]);

  // Extract actual dynamic call logs from loaded chat messages & DB calls
  const extractedCallLogs: any[] = [];
  Object.entries(messages).forEach(([chatId, msgList]) => {
    const chat = chats.find(c => c.id === chatId);
    msgList.forEach((msg) => {
      if (msg.type === 'CALL_LOG') {
        let callData: any = {};
        try { callData = JSON.parse(msg.content || '{}'); } catch (e) {}
        
        const otherParticipant = chat?.participants?.find(p => p.userId !== user?.id && p.user?.id !== user?.id)?.user;
        const groupParticipants = chat?.participants?.map(p => p.user).filter(Boolean) || [];
        const isMine = msg.senderId === user?.id;

        const isGroup = chat?.isGroup || callData.isGroup;
        const isVideo = callData.type === 'VIDEO';
        const duration = typeof callData.duration === 'number' ? callData.duration : 0;
        const isUnanswered = duration === 0 || callData.action === 'MISSED' || callData.action === 'NO_ANSWER' || callData.status === 'MISSED' || callData.status === 'REJECTED';

        let callLabel = isMine 
          ? (isUnanswered ? 'Unanswered' : 'Outgoing') 
          : (isUnanswered ? 'Missed' : 'Incoming');
        
        if (isGroup) callLabel += ' group';
        callLabel += isVideo ? ' video call' : ' voice call';

        const joinedParticipantIds = callData.joinedParticipantIds || 
          (callData.participants ? callData.participants.filter((p: any) => p.hasJoined || p.joined).map((p: any) => p.id || p.userId) : []);

        extractedCallLogs.push({
          id: msg.id,
          chatId,
          callerId: msg.senderId,
          receiverId: isMine ? otherParticipant?.id : user?.id,
          isGroup,
          groupParticipants,
          joinedParticipantIds,
          otherUser: {
            id: otherParticipant?.id,
            name: isGroup ? (chat?.name || 'Group Call') : (otherParticipant?.name || otherParticipant?.phoneNumber || 'Contact User'),
            profilePicture: isGroup ? chat?.groupPicture : otherParticipant?.profilePicture
          },
          type: isVideo ? 'VIDEO' : 'AUDIO',
          isOutgoing: isMine,
          isUnanswered,
          status: isUnanswered ? 'MISSED' : 'COMPLETED',
          callLabel,
          startedAt: msg.createdAt,
          duration: isUnanswered ? 0 : duration,
        });
      }
    });
  });

  // Combine DB backend calls + message call logs
  const dbCalls = calls.map((c: any) => {
    const isMine = c.callerId === user?.id;
    const otherUser = isMine ? c.receiver : c.caller;
    const duration = typeof c.duration === 'number' ? c.duration : 0;
    const isUnanswered = duration === 0 || c.status === 'MISSED' || c.status === 'REJECTED' || c.status === 'NO_ANSWER' || c.action === 'MISSED';
    const isVideo = c.type === 'VIDEO';
    const isGroup = c.chat?.isGroup || (c.participants && c.participants.length > 2);

    let callLabel = isMine 
      ? (isUnanswered ? 'Unanswered' : 'Outgoing') 
      : (isUnanswered ? 'Missed' : 'Incoming');
    if (isGroup) callLabel += ' group';
    callLabel += isVideo ? ' video call' : ' voice call';

    const joinedParticipantIds = c.joinedParticipantIds || 
      (c.participants ? c.participants.filter((p: any) => p.hasJoined || p.status === 'JOINED' || p.joinedAt).map((p: any) => p.userId || p.user?.id) : []);

    return {
      id: c.id,
      chatId: c.chatId,
      callerId: c.callerId,
      receiverId: c.receiverId,
      isGroup,
      groupParticipants: c.participants?.map((p: any) => p.user) || [],
      joinedParticipantIds,
      otherUser: {
        id: otherUser?.id,
        name: isGroup ? (c.chat?.name || 'Group Call') : (otherUser?.name || otherUser?.phoneNumber || 'Contact User'),
        profilePicture: isGroup ? c.chat?.groupPicture : otherUser?.profilePicture
      },
      type: c.type || 'AUDIO',
      isOutgoing: isMine,
      isUnanswered,
      status: isUnanswered ? 'MISSED' : 'COMPLETED',
      callLabel,
      startedAt: c.startedAt,
      duration: isUnanswered ? 0 : duration
    };
  });

  // Unique deduplicated combined calls list
  const callMap = new Map<string, any>();
  [...dbCalls, ...extractedCallLogs].forEach(c => callMap.set(c.id, c));
  let combinedCalls = isCleared ? [] : Array.from(callMap.values());

  // Sort by date desc
  combinedCalls.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // Filter 1: All vs Missed vs Unanswered
  if (filter === 'missed') {
    combinedCalls = combinedCalls.filter(c => !c.isOutgoing && c.isUnanswered);
  } else if (filter === 'unanswered') {
    combinedCalls = combinedCalls.filter(c => c.isOutgoing && c.isUnanswered);
  }

  // Filter 2: Search Query
  const filteredCalls = searchQuery
    ? combinedCalls.filter(c => c.otherUser?.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : combinedCalls;

  const handleClearLogs = async () => {
    if (window.confirm('Are you sure you want to clear all call logs?')) {
      const success = await clearCallLogs();
      if (success) {
        setIsCleared(true);
        setShowClearToast(true);
        setTimeout(() => setShowClearToast(false), 3000);
      }
    }
  };

  const formatCallDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    
    let dateLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    if (isToday) dateLabel = 'Today';

    return {
      subDate: `${dateLabel}, ${timeStr}`,
      rightDate: isToday ? timeStr : dateLabel
    };
  };

  // Transform call object into CallDetailsModal payload format
  const getCallDetailsPayload = (call: any) => {
    if (!call) return null;

    const isGroup = Boolean(call.isGroup);
    const isVideo = call.type === 'VIDEO';
    const isMissed = Boolean(call.isUnanswered);
    const duration = call.duration || 0;

    const rawParticipants = call.groupParticipants?.length > 0
      ? call.groupParticipants
      : (call.otherUser ? [call.otherUser] : []);

    const allParticipantsMap = new Map<string, any>();
    if (user) {
      allParticipantsMap.set(user.id, user);
    }
    rawParticipants.forEach((u: any) => {
      if (u && u.id) {
        allParticipantsMap.set(u.id, u);
      }
    });

    const rawJoinedIds = call.joinedParticipantIds || [];

    const participantsList = Array.from(allParticipantsMap.values()).map((u: any) => {
      let isJoined = rawJoinedIds.includes(u.id);

      // Caller / Host is always joined
      if (call.callerId === u.id || call.initiatorId === u.id) {
        isJoined = true;
      }

      // If call was answered/completed (duration > 0 or !isMissed)
      if (!isMissed || duration > 0 || call.status === 'COMPLETED') {
        isJoined = true;
      }

      return {
        userId: u.id,
        name: u.id === user?.id ? `${u.name || 'You'}` : (u.name || u.phoneNumber || 'User'),
        avatar: u.profilePicture || u.avatar,
        status: isJoined ? ('JOINED' as const) : ('MISSED' as const)
      };
    });

    return {
      callData: {
        action: isMissed ? 'MISSED' : 'COMPLETED',
        duration,
        type: isVideo ? ('VIDEO' as const) : ('AUDIO' as const),
        isGroup,
        participants: participantsList,
        initiatorId: call.callerId
      },
      createdAt: call.startedAt,
      isMine: call.isOutgoing
    };
  };

  const payload = getCallDetailsPayload(selectedCall);

  return (
    <div className="flex-1 flex flex-col h-full bg-background text-foreground overflow-y-auto relative no-scrollbar">
      {/* Toast Notification */}
      <AnimatePresence>
        {showClearToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#25D366] text-black font-extrabold text-xs px-4 py-2 rounded-full shadow-lg border border-black/10 flex items-center space-x-2"
          >
            <Check size={14} strokeWidth={3} />
            <span>Call history cleared successfully</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar Header */}
      <div className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md p-4 border-b border-surface-border flex items-center justify-between shadow-sm">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Calls</h1>
          <p className="text-xs text-text-tertiary">Real-time call history & logs</p>
        </div>

        {/* Clear Call Logs Button */}
        <button
          onClick={handleClearLogs}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-xs transition-colors border border-red-500/30 active:scale-95"
          title="Clear all call history"
        >
          <Trash2 size={14} />
          <span>Clear Logs</span>
        </button>
      </div>

      {/* Search & Filter Pills Bar */}
      <div className="p-4 border-b border-surface-border/40 space-y-3 bg-[#111b21]">
        {/* Pills: All, Missed, Unanswered */}
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setFilter('all')}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm",
              filter === 'all' 
                ? "bg-[#005c4b] text-[#25D366] border border-[#25D366]/40" 
                : "bg-[#1f2c34] text-text-secondary hover:bg-surface-hover"
            )}
          >
            All
          </button>
          
          <button 
            onClick={() => setFilter('missed')}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm",
              filter === 'missed' 
                ? "bg-red-500/20 text-red-400 border border-red-500/40" 
                : "bg-[#1f2c34] text-text-secondary hover:bg-surface-hover"
            )}
          >
            Missed
          </button>

          <button 
            onClick={() => setFilter('unanswered')}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm",
              filter === 'unanswered' 
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" 
                : "bg-[#1f2c34] text-text-secondary hover:bg-surface-hover"
            )}
          >
            Unanswered
          </button>
        </div>

        {/* Search Call Input */}
        <div className="relative flex items-center">
          <Search size={16} className="absolute left-3.5 text-text-tertiary" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search call logs..."
            className="w-full bg-[#1f2c34] border border-surface-border/40 text-white text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-[#25D366]"
          />
        </div>
      </div>

      {/* Dynamic DB Calls List */}
      <div className="flex-1 p-2 divide-y divide-surface-border/30">
        {filteredCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <div className="p-4 rounded-full bg-[#1f2c34] text-text-tertiary">
              <Phone size={36} />
            </div>
            <h3 className="text-base font-bold text-white">No Call Logs</h3>
            <p className="text-xs text-text-secondary max-w-xs">
              {isCleared 
                ? 'Call logs cleared from database.' 
                : filter === 'missed' 
                  ? 'No missed calls found.' 
                  : filter === 'unanswered' 
                    ? 'No unanswered outgoing calls found.' 
                    : 'No dynamic call logs stored in your database yet.'}
            </p>
          </div>
        ) : (
          filteredCalls.map((call: any) => {
            const isOutgoing = call.isOutgoing;
            const otherUser = call.otherUser;
            const isUnanswered = call.isUnanswered;
            const isVideo = call.type === 'VIDEO';
            const isGroup = call.isGroup;
            const name = otherUser?.name || 'Contact User';
            const pfp = otherUser?.profilePicture;
            const groupParticipants = call.groupParticipants || [];

            const { subDate, rightDate } = formatCallDate(call.startedAt);

            return (
              <div 
                key={call.id}
                onClick={() => setSelectedCall(call)}
                className="flex items-center justify-between p-3 hover:bg-[#1f2c34]/60 rounded-2xl transition-colors group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  {/* Profile Avatar / Group Grid Avatar with Click Handler for Details Modal */}
                  <div 
                    className="relative group/avatar cursor-pointer shrink-0"
                    title={isGroup ? "Click to view group call participant details" : "Click to view call details"}
                  >
                    {isGroup && !pfp ? (
                      <div className="w-12 h-12 rounded-full bg-[#1f2c34] border border-surface-border/50 grid grid-cols-2 p-0.5 gap-0.5 overflow-hidden hover:scale-105 transition-transform shadow-sm">
                        {groupParticipants.slice(0, 4).map((pUser: any, i: number) => (
                          <div key={i} className="w-full h-full bg-[#005c4b] text-[#25D366] text-[9px] font-bold flex items-center justify-center overflow-hidden">
                            {pUser?.profilePicture ? (
                              <img src={pUser.profilePicture} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (pUser?.name || 'U').substring(0, 1)
                            )}
                          </div>
                        ))}
                      </div>
                    ) : pfp ? (
                      <img src={pfp} alt={name} className="w-12 h-12 rounded-full object-cover border border-surface-border/50 shadow-sm hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#005c4b] text-[#25D366] font-bold text-base flex items-center justify-center shadow-sm hover:scale-105 transition-transform">
                        {name.substring(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Group Badge Tag */}
                    {isGroup && (
                      <div className="absolute -bottom-1 -right-1 bg-[#25D366] text-black text-[9px] font-extrabold px-1 py-0.2 rounded-full border border-black shadow-sm">
                        GRP
                      </div>
                    )}
                  </div>

                  {/* Name & Sub-details */}
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-white truncate flex items-center space-x-1.5">
                      <span>{name}</span>
                    </h4>

                    {/* Sub-line 1: Arrow + Type */}
                    <div className="flex items-center space-x-1.5 text-xs mt-0.5">
                      {isOutgoing ? (
                        <ArrowUpRight size={15} className={cn("shrink-0", isUnanswered ? "text-amber-400" : "text-[#25D366]")} />
                      ) : isUnanswered ? (
                        <ArrowDownLeft size={15} className="text-[#f15c6d] shrink-0" />
                      ) : (
                        <ArrowDownLeft size={15} className="text-[#25D366] shrink-0" />
                      )}
                      <span className={cn(
                        "truncate",
                        isUnanswered && !isOutgoing ? "text-[#f15c6d]" : isUnanswered && isOutgoing ? "text-amber-400" : "text-text-secondary"
                      )}>
                        {call.callLabel}
                      </span>
                    </div>

                    {/* Sub-line 2: Formatted Date & Time */}
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {subDate}
                    </p>
                  </div>
                </div>

                {/* Right Side: Timestamp & Call Trigger */}
                <div className="flex flex-col items-end justify-between space-y-2 shrink-0 ml-2">
                  <span className="text-[11px] text-text-tertiary font-medium">
                    {rightDate}
                  </span>

                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (call.chatId && otherUser?.id) {
                        initiateCall(isVideo ? 'VIDEO' : 'AUDIO', call.chatId, [otherUser.id]);
                      }
                    }}
                    className="text-[#25D366] hover:opacity-80 transition-opacity p-1"
                    title={isVideo ? "Start Video Call" : "Start Voice Call"}
                  >
                    {isVideo ? (
                      <Video size={20} className="text-[#25D366]" />
                    ) : (
                      <Phone size={20} className="text-[#25D366]" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Render 100% identical CallDetailsModal across Chat History & Calls Tab */}
      {selectedCall && payload && (
        <CallDetailsModal 
          isOpen={Boolean(selectedCall)}
          onClose={() => setSelectedCall(null)}
          callData={payload.callData}
          createdAt={payload.createdAt}
          isMine={payload.isMine}
          currentUserId={user?.id}
          onReCall={(type) => {
            if (selectedCall.chatId) {
              const targetUserIds = selectedCall.otherUser?.id ? [selectedCall.otherUser.id] : [];
              initiateCall(type, selectedCall.chatId, targetUserIds);
            }
          }}
        />
      )}
    </div>
  );
}
