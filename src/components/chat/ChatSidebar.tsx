import React, { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { Search, LogOut, Check, CheckCheck, Video, Phone, Image as ImageIcon, Mic, MapPin, FileText, PhoneMissed, BarChart2, Star, Pin, PinOff, Lock } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth';
import StarredMessagesOverlay from './StarredMessagesOverlay';

interface ChatSidebarProps {
  onProfileClick: () => void;
  onNewChatClick: () => void;
}

export function ChatSidebar({ onProfileClick, onNewChatClick }: ChatSidebarProps) {
  const { user, logout } = useAuthStore();
  const { chats, activeChatId, setActiveChat, disconnectSocket, onlineUsers, typingStatuses, messages } = useChatStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showStarredMessages, setShowStarredMessages] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; chatId: string; isPinned: boolean } | null>(null);
  const [isCreatingAiChat, setIsCreatingAiChat] = useState(false);

  // Close context menu on click outside
  React.useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch (e) {}
    disconnectSocket();
    logout();
    window.location.href = '/login';
  };

  const handleAiChat = async () => {
    if (isCreatingAiChat) return;
    const aiUserId = 'nexus-ai-system';
    
    // Check if chat already exists
    const existingChat = chats.find(c => 
      !c.isGroup && 
      c.participants.some((p: any) => p.userId === aiUserId)
    );

    if (existingChat) {
      setActiveChat(existingChat.id);
    } else {
      setIsCreatingAiChat(true);
      // Create new chat with AI
      try {
        const token = useAuthStore.getState().token;
        const newChatId = await useChatStore.getState().createChat(aiUserId, token || '');
        if (newChatId) {
          setActiveChat(newChatId);
        }
      } catch (err) {
        console.error('Failed to start AI chat', err);
      } finally {
        setIsCreatingAiChat(false);
      }
    }
  };

  const uniqueChats = React.useMemo(() => {
    const seen1on1s = new Set<string>();
    return chats.filter(chat => {
      if (chat.isGroup) return true;
      const participants = chat.participants.map((p: any) => p.userId).sort().join('-');
      if (seen1on1s.has(participants)) return false;
      seen1on1s.add(participants);
      return true;
    });
  }, [chats]);

  const filteredChats = uniqueChats.filter(chat => {
    const q = searchQuery.toLowerCase();
    if (chat.name?.toLowerCase().includes(q)) return true;
    return chat.participants.some((p: any) => {
      const u = p.user;
      if (!u) return false;
      return (u.name && u.name.toLowerCase().includes(q)) || (u.phoneNumber && u.phoneNumber.includes(q));
    });
  }).sort((a, b) => {
    const aParticipant = a.participants.find((p: any) => p.userId === user?.id);
    const bParticipant = b.participants.find((p: any) => p.userId === user?.id);
    
    const aPinned = aParticipant?.isPinned ? 1 : 0;
    const bPinned = bParticipant?.isPinned ? 1 : 0;
    
    if (aPinned !== bPinned) {
      return bPinned - aPinned; // Pinned comes first
    }

    const aMessages = messages[a.id] || [];
    const bMessages = messages[b.id] || [];
    const aLastMsg = aMessages[aMessages.length - 1] || a.lastMessage;
    const bLastMsg = bMessages[bMessages.length - 1] || b.lastMessage;
    
    const aTime = aLastMsg ? new Date(aLastMsg.createdAt).getTime() : 0;
    const bTime = bLastMsg ? new Date(bLastMsg.createdAt).getTime() : 0;
    
    return bTime - aTime;
  });

  return (
    <div className="w-full h-full flex flex-col bg-surface relative">
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
            title="Starred Messages"
            onClick={() => setShowStarredMessages(true)}
          >
            <Star size={20} />
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
          const unreadCount = chat.unreadCount || 0;

          let chatName = chat.name;
          let chatImage = chat.groupPicture;
          const myParticipant = chat.participants.find((p: any) => p.userId === user?.id);
          const isPinned = !!myParticipant?.isPinned;
          
          if (!chat.isGroup && otherParticipant) {
            chatName = otherParticipant.user?.name || otherParticipant.user?.phoneNumber || 'Unknown';
            chatImage = otherParticipant.user?.profilePicture;
          }

          return (
            <div
              key={chat.id}
              onClick={() => setActiveChat(chat.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                const myParticipant = chat.participants.find((p: any) => p.userId === user?.id);
                setContextMenu({
                  x: e.pageX,
                  y: e.pageY,
                  chatId: chat.id,
                  isPinned: !!myParticipant?.isPinned
                });
              }}
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
                  <div className="flex items-center space-x-1">
                    {isPinned && <Pin size={14} className="text-text-secondary fill-current rotate-45" />}
                    {lastMessage && (
                      <span className={cn(
                        "text-xs whitespace-nowrap ml-1 font-mono",
                        unreadCount > 0 ? "text-[#25D366] font-semibold" : "text-text-secondary"
                      )}>
                        {new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-sm text-text-secondary">
                  <div className="flex items-center space-x-1 overflow-hidden flex-1 min-w-0 pr-1">
                    {typingStatus?.isTyping ? (
                      <span className="text-[#25D366] font-medium animate-pulse">typing...</span>
                    ) : lastMessage ? (
                      <div className="flex items-center space-x-1 overflow-hidden w-full">
                        {lastMessage.senderId === user?.id && lastMessage.type !== 'CALL_LOG' && lastMessage.type !== 'STORY_REPLY' && (
                          <span className="mr-1 shrink-0">
                            {lastMessage.status === 'READ' ? <CheckCheck size={16} className="text-[#53bdeb]" /> :
                             lastMessage.status === 'DELIVERED' ? <CheckCheck size={16} className="text-text-secondary" /> :
                             <Check size={16} className="text-text-secondary" />}
                          </span>
                        )}
                        <span className={cn("flex w-full min-w-0", lastMessage.type === 'STORY_REPLY' ? "flex-col" : "truncate items-center")}>
                          {(() => {
                            if (lastMessage.type === 'STORY_REPLY') {
                              const isMe = lastMessage.senderId === user?.id;
                              const storyType = lastMessage.metadata?.storyType === 'VIDEO' ? 'video' : lastMessage.metadata?.storyType === 'IMAGE' ? 'photo' : 'status';
                              const prefixText = isMe ? `You replied to a ${storyType}` : `Replied to your ${storyType}`;
                              
                              return (
                                <>
                                  <span className="text-[#25D366] text-xs font-medium mb-0.5 truncate">{prefixText}</span>
                                  <span className="flex items-center text-text-secondary truncate text-sm">
                                    {isMe && (
                                      <span className="mr-1 shrink-0">
                                        {lastMessage.status === 'READ' ? <CheckCheck size={16} className="text-[#53bdeb]" /> :
                                         lastMessage.status === 'DELIVERED' ? <CheckCheck size={16} className="text-text-secondary" /> :
                                         <Check size={16} className="text-text-secondary" />}
                                      </span>
                                    )}
                                    {lastMessage.metadata?.storyType === 'VIDEO' ? <Video size={14} className="mr-1 shrink-0" /> : 
                                     lastMessage.metadata?.storyType === 'IMAGE' ? <ImageIcon size={14} className="mr-1 shrink-0" /> : null}
                                    <span className="truncate">{lastMessage.content || 'Status reply'}</span>
                                  </span>
                                </>
                              );
                            }
                            if (lastMessage.type === 'POLL') return <><BarChart2 size={14} className="mr-1 shrink-0" /> <span className="truncate">Poll: {lastMessage.metadata?.poll?.question}</span></>;
                            if (lastMessage.type === 'IMAGE') return <><ImageIcon size={14} className="mr-1 shrink-0" /> Photo</>;
                            if (lastMessage.type === 'VIDEO') return <><Video size={14} className="mr-1 shrink-0" /> Video</>;
                            if (lastMessage.type === 'AUDIO') return <><Mic size={14} className="mr-1 shrink-0" /> Voice message</>;
                            if (lastMessage.type === 'LOCATION') return <><MapPin size={14} className="mr-1 shrink-0" /> Location</>;
                            if (lastMessage.type === 'DOCUMENT') return <><FileText size={14} className="mr-1 shrink-0" /> Document</>;
                            if (lastMessage.type === 'CALL_LOG') {
                              try {
                                const callData = JSON.parse(lastMessage.content || '{}');
                                const isMissed = callData.duration === 0 || callData.action === 'MISSED';
                                const isCaller = lastMessage.senderId === user?.id;
                                
                                // Proper icon with Red (Missed/Unanswered) or Green (Answered) color
                                const CallIcon = callData.type === 'VIDEO' ? Video : Phone;
                                const iconColor = isMissed ? "text-danger" : "text-[#25D366]";
                                
                                const isGroupCall = chat.isGroup || callData.isGroup || (callData.participants && callData.participants.length > 2);
                                const baseLabel = callData.type === 'VIDEO' ? 'Video call' : 'Voice call';
                                const callLabel = isGroupCall ? `Group ${baseLabel.toLowerCase()}` : baseLabel;
                                
                                return (
                                  <span className="flex items-center">
                                    <CallIcon size={14} className={cn("mr-1 shrink-0", iconColor)} />
                                    {callLabel}
                                  </span>
                                );
                              } catch (e) {
                                return (
                                  <span className="flex items-center">
                                    <Phone size={14} className="mr-1 shrink-0" /> Call log
                                  </span>
                                );
                              }
                            }
                            if (lastMessage.isEncrypted && lastMessage.type === 'TEXT' && typeof lastMessage.content === 'string' && lastMessage.content.startsWith('{"isEncrypted"')) {
                                return (
                                  <>
                                    <Lock size={14} className="mr-1 shrink-0" /> 
                                    <span className="truncate">Encrypted message</span>
                                  </>
                                );
                              }
                            return lastMessage.content;
                          })()}
                        </span>
                      </div>
                    ) : (
                      <span className="italic">No messages yet</span>
                    )}
                  </div>

                  {unreadCount > 0 && (
                    <span className="ml-2 shrink-0 bg-[#25D366] text-[#111b21] text-xs font-bold px-1.5 min-w-[20px] h-5 rounded-full flex items-center justify-center shadow-sm">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Action Button for Nexus AI */}
      <button 
        onClick={handleAiChat}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:scale-105 transition-transform flex items-center justify-center overflow-hidden border-2 border-surface-hover z-50 bg-surface animate-float"
        title="Chat with Nexus AI"
      >
        <img 
          src="/image.png" 
          alt="Nexus AI" 
          className="w-full h-full object-cover" 
          onError={(e) => {
            // Fallback to bottts if local image fails to load
            e.currentTarget.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=Nexus&backgroundColor=10b981';
          }}
        />
      </button>

      <StarredMessagesOverlay 
        isOpen={showStarredMessages} 
        onClose={() => setShowStarredMessages(false)} 
      />

      {contextMenu && (
        <div 
          className="fixed z-[100] bg-surface border border-surface-border rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-4 py-2 hover:bg-surface-hover transition-colors flex items-center space-x-2 text-text-primary"
            onClick={(e) => {
              e.stopPropagation();
              const { togglePinChat } = useChatStore.getState();
              togglePinChat(contextMenu.chatId);
              setContextMenu(null);
            }}
          >
            {contextMenu.isPinned ? (
              <>
                <PinOff size={16} className="text-text-secondary" />
                <span>Unpin Chat</span>
              </>
            ) : (
              <>
                <Pin size={16} className="text-text-secondary" />
                <span>Pin Chat</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
