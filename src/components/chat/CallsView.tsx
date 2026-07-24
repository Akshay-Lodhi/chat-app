'use client';

import React, { useEffect, useState } from 'react';
import { 
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, 
  Search, Trash2, ArrowUpRight, ArrowDownLeft, Check, Layers, UserCheck, Users
} from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { GroupCallDetailsModal } from './GroupCallDetailsModal';

export function CallsView() {
  const { user } = useAuthStore();
  const { calls, fetchCalls, clearCallLogs, chats, messages, fetchMessages } = useChatStore();
  const { initiateCall } = useCallStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'missed' | 'unanswered'>('all');
  const [isCleared, setIsCleared] = useState(false);
  const [showClearToast, setShowClearToast] = useState(false);
  const [selectedGroupCall, setSelectedGroupCall] = useState<any>(null);

  // Fetch paginated calls from DB & load messages
  useEffect(() => {
    fetchCalls('better-auth-session', 1, 50);
    chats.forEach(chat => {
      if (!messages[chat.id]) {
        fetchMessages(chat.id, 'better-auth-session');
      }
    });
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
        const isUnanswered = callData.duration === 0 || callData.action === 'MISSED' || callData.action === 'NO_ANSWER';

        let callLabel = isMine 
          ? (isUnanswered ? 'Unanswered' : 'Outgoing') 
          : (isUnanswered ? 'Missed' : 'Incoming');
        
        if (isGroup) callLabel += ' group';
        callLabel += isVideo ? ' video call' : ' voice call';

        extractedCallLogs.push({
          id: msg.id,
          chatId,
          callerId: msg.senderId,
          receiverId: isMine ? otherParticipant?.id : user?.id,
          isGroup,
          groupParticipants,
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
          duration: callData.duration || 0,
        });
      }
    });
  });

  // Combine DB backend calls + message call logs
  const dbCalls = calls.map((c: any) => {
    const isMine = c.callerId === user?.id;
    const otherUser = isMine ? c.receiver : c.caller;
    const isUnanswered = c.status === 'MISSED' || c.status === 'REJECTED';
    const isVideo = c.type === 'VIDEO';
    const isGroup = c.chat?.isGroup || (c.participants && c.participants.length > 2);

    let callLabel = isMine 
      ? (isUnanswered ? 'Unanswered' : 'Outgoing') 
      : (isUnanswered ? 'Missed' : 'Incoming');
    if (isGroup) callLabel += ' group';
    callLabel += isVideo ? ' video call' : ' voice call';

    return {
      id: c.id,
      chatId: c.chatId,
      callerId: c.callerId,
      receiverId: c.receiverId,
      isGroup,
      groupParticipants: c.participants?.map((p: any) => p.user) || [],
      otherUser: {
        id: otherUser?.id,
        name: isGroup ? (c.chat?.name || 'Group Call') : (otherUser?.name || otherUser?.phoneNumber || 'Contact User'),
        profilePicture: isGroup ? c.chat?.groupPicture : otherUser?.profilePicture
      },
      type: c.type || 'AUDIO',
      isOutgoing: isMine,
      isUnanswered,
      status: c.status,
      callLabel,
      startedAt: c.startedAt,
      duration: c.duration || 0
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
  const filteredCalls = combinedCalls.filter((c: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = c.otherUser?.name || '';
    return name.toLowerCase().includes(q);
  });

  // Clear call logs with API call
  const handleClearLogs = async () => {
    const success = await clearCallLogs();
    setIsCleared(true);
    setShowClearToast(true);
    setTimeout(() => setShowClearToast(false), 2500);
  };

  // Dynamic Date Formatter
  const formatCallDate = (isoString: string) => {
    const d = new Date(isoString);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (isToday) {
      return { subDate: `Today, ${timeStr}`, rightDate: timeStr };
    } else if (isYesterday) {
      return { subDate: `Yesterday, ${timeStr}`, rightDate: 'Yesterday' };
    } else {
      const dateStr = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      const shortDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
      return { subDate: `${dateStr}, ${timeStr}`, rightDate: shortDate };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-foreground overflow-y-auto no-scrollbar relative">
      {/* Group Call Details Modal */}
      <GroupCallDetailsModal 
        isOpen={!!selectedGroupCall}
        onClose={() => setSelectedGroupCall(null)}
        call={selectedGroupCall}
      />

      {/* Clear Call Logs Toast */}
      <AnimatePresence>
        {showClearToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#25D366] text-black font-extrabold text-xs px-4 py-2 rounded-full shadow-lg flex items-center space-x-1.5"
          >
            <Check size={16} />
            <span>Call logs deleted from database!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-[#0b141a]/95 backdrop-blur-md px-4 py-3.5 border-b border-surface-border/40 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-[#25D366]/20 text-[#25D366]">
            <Phone size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">Calls</h1>
            <p className="text-[11px] text-text-tertiary font-medium">Actual database call history</p>
          </div>
        </div>

        {/* Clear Call Logs API Button */}
        <button 
          onClick={handleClearLogs}
          className="flex items-center space-x-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-full border border-red-500/20 transition-all font-semibold active:scale-95"
          title="Delete all call logs from database"
        >
          <Trash2 size={14} />
          <span>Clear logs</span>
        </button>
      </div>

      {/* 3 Filter Pill Buttons (All / Missed / Unanswered) */}
      <div className="px-4 py-3 border-b border-surface-border/40 bg-[#0b141a] flex items-center space-x-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            "flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap",
            filter === 'all'
              ? "bg-[#005c4b] text-[#25D366] border border-[#25D366]/40 shadow-sm"
              : "bg-[#1f2c34] text-text-secondary hover:text-text-primary border border-surface-border/40"
          )}
        >
          <Layers size={13} />
          <span>All</span>
        </button>

        <button
          onClick={() => setFilter('missed')}
          className={cn(
            "flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap",
            filter === 'missed'
              ? "bg-[#005c4b] text-[#25D366] border border-[#25D366]/40 shadow-sm"
              : "bg-[#1f2c34] text-text-secondary hover:text-text-primary border border-surface-border/40"
          )}
        >
          <PhoneMissed size={13} className="text-red-400" />
          <span>Missed</span>
        </button>

        <button
          onClick={() => setFilter('unanswered')}
          className={cn(
            "flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap",
            filter === 'unanswered'
              ? "bg-[#005c4b] text-[#25D366] border border-[#25D366]/40 shadow-sm"
              : "bg-[#1f2c34] text-text-secondary hover:text-text-primary border border-surface-border/40"
          )}
        >
          <UserCheck size={13} className="text-amber-400" />
          <span>Unanswered</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 bg-[#0b141a]">
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
                className="flex items-center justify-between p-3 hover:bg-[#1f2c34]/60 rounded-2xl transition-colors group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  {/* Profile Avatar / Group Grid Avatar with Click Handler for Details Modal */}
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGroupCall(call);
                    }}
                    className="relative group/avatar cursor-pointer shrink-0"
                    title={isGroup ? "Click to view group call participant details" : "Click to view call details"}
                  >
                    {isGroup && !pfp ? (
                      <div className="w-12 h-12 rounded-full bg-[#1f2c34] border border-surface-border/50 grid grid-cols-2 p-0.5 gap-0.5 overflow-hidden hover:scale-105 transition-transform shadow-sm">
                        {groupParticipants.slice(0, 4).map((pUser: any, i: number) => (
                          pUser?.profilePicture ? (
                            <img key={i} src={pUser.profilePicture} alt="" className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <div key={i} className="w-full h-full bg-[#005c4b] text-[8px] font-bold text-[#25D366] flex items-center justify-center rounded-full">
                              {(pUser?.name || 'U').substring(0, 1)}
                            </div>
                          )
                        ))}
                        {groupParticipants.length === 0 && (
                          <div className="col-span-2 row-span-2 flex items-center justify-center text-[#25D366]">
                            <Users size={20} />
                          </div>
                        )}
                      </div>
                    ) : pfp ? (
                      <img src={pfp} alt={name} className="w-12 h-12 rounded-full object-cover border border-surface-border/50 hover:scale-105 transition-transform shadow-sm" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#1f2c34] border border-surface-border/50 flex items-center justify-center text-text-secondary hover:scale-105 transition-transform shadow-sm">
                        <span className="text-sm font-bold text-[#25D366]">{name.substring(0, 2).toUpperCase()}</span>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    {/* Contact or Group Name - Red if Missed/Unanswered */}
                    <h4 className={cn(
                      "font-semibold text-sm truncate flex items-center space-x-1.5",
                      isUnanswered && !isOutgoing ? "text-[#f15c6d] font-bold" : "text-white"
                    )}>
                      <span>{name}</span>
                      {isGroup && (
                        <span className="text-[10px] bg-[#005c4b]/60 text-[#25D366] px-1.5 py-0.2 rounded-md border border-[#25D366]/30">
                          Group
                        </span>
                      )}
                    </h4>

                    {/* Sub-line 1: Direction Arrow & Call Type Text */}
                    <div className="flex items-center space-x-1.5 mt-0.5 text-xs font-medium">
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
    </div>
  );
}
