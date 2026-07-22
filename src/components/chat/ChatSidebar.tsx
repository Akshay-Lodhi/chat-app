import React, { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { Search, LogOut, Check, CheckCheck, Video, Phone, Image as ImageIcon, Mic, MapPin, FileText, PhoneMissed } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth';

interface ChatSidebarProps {
  onProfileClick: () => void;
  onNewChatClick: () => void;
}

export function ChatSidebar({ onProfileClick, onNewChatClick }: ChatSidebarProps) {
  const { user, logout } = useAuthStore();
  const { chats, activeChatId, setActiveChat, disconnectSocket, onlineUsers, typingStatuses, messages } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch (e) {}
    disconnectSocket();
    logout();
    window.location.href = '/login';
  };

  const filteredChats = chats.filter(chat => {
    const q = searchQuery.toLowerCase();
    if (chat.name?.toLowerCase().includes(q)) return true;
    return chat.participants.some((p: any) => {
      const u = p.user;
      if (!u) return false;
      return (u.name && u.name.toLowerCase().includes(q)) || (u.phoneNumber && u.phoneNumber.includes(q));
    });
  });

  return (
    <div className={cn(
      "w-full md:w-[30%] md:min-w-[350px] border-r border-surface-border flex-col bg-surface relative",
      activeChatId ? "hidden md:flex" : "flex"
    )}>
      {/* Header */}
      <div className="h-16 bg-surface-hover flex items-center justify-between px-4 py-2 shrink-0">
        <button onClick={onProfileClick} className="focus:outline-none hover:opacity-80 transition-opacity">
          <Avatar src={user?.profilePicture} fallback={user?.name || user?.phoneNumber} />
        </button>
        <div className="flex items-center space-x-4">
          <button 
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            title="New Chat"
            onClick={onNewChatClick}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975v1.944zm3-4H7.041V7.1h9.975v1.944z"></path>
            </svg>
          </button>
          <button 
            className="p-2 text-text-secondary hover:text-text-primary transition-colors"
            title="Log out"
            onClick={handleLogout}
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-surface-border">
        <Input 
          icon={<Search size={18} />}
          placeholder="Search chats..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-surface-hover border-none"
        />
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-border">
        {filteredChats.map((chat) => {
          const chatMessages = messages[chat.id] || [];
          const lastMessage = chatMessages[chatMessages.length - 1] || chat.lastMessage;
          const otherParticipant = chat.isGroup ? null : (chat.participants.find((p: any) => p.userId !== user?.id) || chat.participants[0]);
          const isOnline = otherParticipant ? onlineUsers[otherParticipant.userId] : false;
          const typingStatus = typingStatuses[chat.id];

          let chatName = chat.name;
          let chatImage = chat.groupPicture;
          if (!chat.isGroup && otherParticipant) {
            chatName = otherParticipant.user?.name || otherParticipant.user?.phoneNumber || 'Unknown';
            chatImage = otherParticipant.user?.profilePicture;
          }

          return (
            <div
              key={chat.id}
              onClick={() => setActiveChat(chat.id)}
              className={cn(
                "flex items-center px-4 py-3 cursor-pointer transition-colors border-b border-surface-border/50",
                activeChatId === chat.id ? "bg-surface-active" : "hover:bg-surface-hover"
              )}
            >
              <div className="relative mr-4 shrink-0">
                <Avatar src={chatImage} fallback={chatName || undefined} size="lg" />
                {isOnline && (
                  <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#25D366] rounded-full border-2 border-surface z-10" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1">
                  <h2 className="text-base font-medium text-text-primary truncate">{chatName}</h2>
                  {lastMessage && (
                    <span className="text-xs text-text-secondary whitespace-nowrap ml-2">
                      {new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center text-sm text-text-secondary">
                  {typingStatus?.isTyping ? (
                    <span className="text-primary animate-pulse">typing...</span>
                  ) : lastMessage ? (
                    <div className="flex items-center space-x-1 overflow-hidden">
                      {lastMessage.senderId === user?.id && (
                        <span className="mr-1">
                          {lastMessage.status === 'READ' ? <CheckCheck size={16} className="text-[#53bdeb]" /> :
                           lastMessage.status === 'DELIVERED' ? <CheckCheck size={16} className="text-text-secondary" /> :
                           <Check size={16} className="text-text-secondary" />}
                        </span>
                      )}
                      <span className="truncate flex items-center">
                        {(() => {
                          if (lastMessage.type === 'IMAGE') return <><ImageIcon size={14} className="mr-1" /> Photo</>;
                          if (lastMessage.type === 'VIDEO') return <><Video size={14} className="mr-1" /> Video</>;
                          if (lastMessage.type === 'AUDIO') return <><Mic size={14} className="mr-1" /> Voice message</>;
                          if (lastMessage.type === 'LOCATION') return <><MapPin size={14} className="mr-1" /> Location</>;
                          if (lastMessage.type === 'DOCUMENT') return <><FileText size={14} className="mr-1" /> Document</>;
                          if (lastMessage.type === 'CALL_LOG') {
                            try {
                              const callData = JSON.parse(lastMessage.content || '{}');
                              const isMissed = callData.duration === 0 || callData.action === 'MISSED';
                              const isCaller = lastMessage.senderId === user?.id;
                              const CallIcon = callData.type === 'VIDEO' ? Video : Phone;
                              const isGroupCall = chat.isGroup || callData.isGroup;
                              const baseLabel = callData.type === 'VIDEO' ? 'Video Call' : 'Voice Call';
                              const callLabel = isMissed 
                                ? (isCaller ? `Unanswered ${isGroupCall ? 'Group Call' : 'Call'}` : `Missed ${isGroupCall ? 'Group Call' : 'Call'}`) 
                                : (isGroupCall ? `Group ${baseLabel}` : baseLabel);
                              return <><CallIcon size={14} className="mr-1" /> {callLabel}</>;
                            } catch (e) {
                              return <><Phone size={14} className="mr-1" /> Call log</>;
                            }
                          }
                          return lastMessage.content;
                        })()}
                      </span>
                    </div>
                  ) : (
                    <span className="italic">No messages yet</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
