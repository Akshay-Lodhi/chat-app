'use client';

import React, { useEffect, useState } from 'react';
import { 
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, 
  Search, User
} from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useCallStore } from '@/store/useCallStore';
import { cn } from '@/lib/utils';

export function CallsView() {
  const { user } = useAuthStore();
  const { calls, fetchCalls, chats, messages } = useChatStore();
  const { initiateCall } = useCallStore();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchCalls('better-auth-session');
  }, [fetchCalls]);

  // Extract call logs from loaded chat messages
  const extractedCallLogs: any[] = [];
  Object.entries(messages).forEach(([chatId, msgList]) => {
    const chat = chats.find(c => c.id === chatId);
    msgList.forEach((msg) => {
      if (msg.type === 'CALL_LOG') {
        let callData: any = {};
        try { callData = JSON.parse(msg.content || '{}'); } catch (e) {}
        
        const otherParticipant = chat?.participants?.find(p => p.userId !== user?.id && p.user?.id !== user?.id)?.user;
        const isMine = msg.senderId === user?.id;

        extractedCallLogs.push({
          id: msg.id,
          chatId,
          callerId: msg.senderId,
          receiverId: isMine ? otherParticipant?.id : user?.id,
          otherUser: otherParticipant || { name: 'Contact User', profilePicture: null },
          type: callData.type || 'AUDIO',
          isOutgoing: isMine,
          status: callData.duration === 0 || callData.action === 'MISSED' ? 'MISSED' : 'COMPLETED',
          startedAt: msg.createdAt,
          duration: callData.duration || 0,
        });
      }
    });
  });

  // Combine backend calls + message call logs
  let combinedCalls = [...calls, ...extractedCallLogs];

  // Demo Contacts for rich, realistic WhatsApp Call History if no history exists yet
  const sampleContacts = [
    { name: 'Rohan Sharma', pfp: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', time: new Date(Date.now() - 35 * 60000), type: 'AUDIO', isOutgoing: false, isMissed: true },
    { name: 'Priya Verma', pfp: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', time: new Date(Date.now() - 120 * 60000), type: 'VIDEO', isOutgoing: true, isMissed: false },
    { name: 'Aarav Patel', pfp: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150', time: new Date(Date.now() - 360 * 60000), type: 'AUDIO', isOutgoing: false, isMissed: false },
    { name: 'Sneha Kapoor', pfp: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', time: new Date(Date.now() - 1440 * 60000), type: 'VIDEO', isOutgoing: true, isMissed: false },
    { name: 'Rahul Singh', pfp: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', time: new Date(Date.now() - 2880 * 60000), type: 'AUDIO', isOutgoing: false, isMissed: true },
  ];

  if (combinedCalls.length === 0) {
    sampleContacts.forEach((contact, idx) => {
      combinedCalls.push({
        id: `sample-call-${idx}`,
        chatId: chats[0]?.id || `chat-sample-${idx}`,
        otherUser: { name: contact.name, profilePicture: contact.pfp, id: `user-sample-${idx}` },
        type: contact.type,
        isOutgoing: contact.isOutgoing,
        status: contact.isMissed ? 'MISSED' : 'COMPLETED',
        startedAt: contact.time.toISOString(),
        duration: contact.isMissed ? 0 : 120
      });
    });
  }

  // Sort by date desc
  combinedCalls.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  // Filter by search query
  const filteredCalls = combinedCalls.filter((c: any) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = c.otherUser?.name || c.otherUser?.phoneNumber || '';
    return name.toLowerCase().includes(q);
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-background text-foreground overflow-y-auto no-scrollbar">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md px-4 py-3.5 border-b border-surface-border flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-[#25D366]/20 text-[#25D366]">
            <Phone size={22} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-text-primary">Calls</h1>
            <p className="text-[11px] text-text-tertiary font-medium">Recent audio & video logs</p>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-4 border-b border-surface-border/60 bg-surface/40">
        <div className="relative flex items-center">
          <Search size={18} className="absolute left-3.5 text-text-tertiary" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search call logs..."
            className="w-full bg-chat-bg border border-surface-border text-text-primary text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-[#25D366]"
          />
        </div>
      </div>

      {/* Calls List */}
      <div className="flex-1 p-2 divide-y divide-surface-border/40">
        {filteredCalls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
            <div className="p-4 rounded-full bg-surface-hover text-text-tertiary">
              <Phone size={36} />
            </div>
            <h3 className="text-base font-bold text-text-primary">No Call Logs Found</h3>
            <p className="text-xs text-text-secondary max-w-xs">
              Search result yielded no call logs.
            </p>
          </div>
        ) : (
          filteredCalls.map((call: any) => {
            const isOutgoing = call.isOutgoing;
            const otherUser = call.otherUser;
            const isMissed = call.status === 'MISSED' || call.status === 'REJECTED';
            const name = otherUser?.name || otherUser?.phoneNumber || 'Contact User';
            const pfp = otherUser?.profilePicture;
            
            const callDate = new Date(call.startedAt);
            const formattedTime = callDate.toLocaleDateString('en-US', { 
              month: 'short', day: 'numeric' 
            }) + ', ' + callDate.toLocaleTimeString('en-US', { 
              hour: 'numeric', minute: '2-digit', hour12: true 
            });

            return (
              <div 
                key={call.id}
                className="flex items-center justify-between p-3.5 hover:bg-surface-hover/50 rounded-2xl transition-colors group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5 min-w-0">
                  {pfp ? (
                    <img src={pfp} alt={name} className="w-12 h-12 rounded-full object-cover border border-surface-border" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-surface-hover border border-surface-border flex items-center justify-center text-text-secondary">
                      <User size={22} />
                    </div>
                  )}

                  <div className="min-w-0">
                    {/* Contact Name - Red if Missed */}
                    <h4 className={cn(
                      "font-semibold text-sm truncate",
                      isMissed && !isOutgoing ? "text-red-500 font-bold" : "text-text-primary"
                    )}>
                      {name}
                    </h4>

                    {/* Incoming / Outgoing / Missed Icon & Timestamp */}
                    <div className="flex items-center space-x-1.5 mt-0.5 text-xs text-text-tertiary">
                      {isOutgoing ? (
                        <PhoneOutgoing size={14} className="text-[#25D366] shrink-0" />
                      ) : isMissed ? (
                        <PhoneMissed size={14} className="text-red-500 shrink-0" />
                      ) : (
                        <PhoneIncoming size={14} className="text-[#25D366] shrink-0" />
                      )}
                      <span className="truncate">{formattedTime}</span>
                    </div>
                  </div>
                </div>

                {/* Audio & Video Call Action Buttons */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button 
                    onClick={() => {
                      if (call.chatId && otherUser?.id) {
                        initiateCall('AUDIO', call.chatId, [otherUser.id]);
                      }
                    }}
                    className="p-2.5 rounded-full hover:bg-surface-border text-[#25D366] transition-colors"
                    title="Audio Call"
                  >
                    <Phone size={18} />
                  </button>

                  <button 
                    onClick={() => {
                      if (call.chatId && otherUser?.id) {
                        initiateCall('VIDEO', call.chatId, [otherUser.id]);
                      }
                    }}
                    className="p-2.5 rounded-full hover:bg-surface-border text-[#25D366] transition-colors"
                    title="Video Call"
                  >
                    <Video size={18} />
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
