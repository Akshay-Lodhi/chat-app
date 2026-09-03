import React, { useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { Search, LogOut, Check, CheckCheck, Video, Phone, Image as ImageIcon, Mic, MapPin, FileText, PhoneMissed, BarChart2, Star, Pin, PinOff, Lock, FileVideo, Edit, Settings } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import { authClient } from '@/lib/auth';
import { formatText } from './MessageBubble';
import StarredMessagesOverlay from './StarredMessagesOverlay';
import RecordingsModal from './RecordingsModal';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [showRecordings, setShowRecordings] = useState(false);

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
    
    const existingChat = chats.find(c => 
      !c.isGroup && 
      c.participants.some((p: any) => p.userId === aiUserId)
    );

    if (existingChat) {
      setActiveChat(existingChat.id);
    } else {
      setIsCreatingAiChat(true);
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
      return bPinned - aPinned;
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
    <div className="w-full h-full flex flex-col bg-surface/40 backdrop-blur-3xl relative border-r border-surface-border/50">
      {/* Header */}
      <div className="h-20 flex items-center justify-between px-6 shrink-0 border-b border-surface-border/30 bg-surface/20">
        <button onClick={onProfileClick} className="focus:outline-none hover:scale-105 transition-transform duration-300 relative group">
          <Avatar src={user?.profilePicture} fallback={user?.name || user?.phoneNumber} size="lg" className="shadow-lg shadow-black/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
        <div className="flex items-center space-x-2">
          <button 
            className="p-2.5 rounded-full bg-surface-hover/50 text-text-secondary hover:text-primary hover:bg-primary/10 transition-all shadow-sm"
            title="New Chat"
            onClick={onNewChatClick}
          >
            <Edit size={18} />
          </button>
          <button 
            className="p-2.5 rounded-full bg-surface-hover/50 text-text-secondary hover:text-primary hover:bg-primary/10 transition-all shadow-sm"
            title="Recordings"
            onClick={() => setShowRecordings(true)}
          >
            <FileVideo size={18} />
          </button>
          <button 
            className="p-2.5 rounded-full bg-surface-hover/50 text-text-secondary hover:text-primary hover:bg-primary/10 transition-all shadow-sm"
            title="Starred Messages"
            onClick={() => setShowStarredMessages(true)}
          >
            <Star size={18} />
          </button>
          <button 
            className="p-2.5 rounded-full bg-surface-hover/50 text-text-secondary hover:text-danger hover:bg-danger/10 transition-all shadow-sm"
            title="Log out"
            onClick={handleLogout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-4">
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-primary transition-colors">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface-hover/60 border border-surface-border/50 text-text-primary rounded-2xl pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/50 focus:bg-surface transition-all text-sm placeholder:text-text-tertiary shadow-inner"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-2 scrollbar-thin scrollbar-thumb-surface-border/50">
        <AnimatePresence initial={false}>
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
              <motion.div
                key={chat.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                onClick={() => setActiveChat(chat.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.pageX,
                    y: e.pageY,
                    chatId: chat.id,
                    isPinned
                  });
                }}
                className={cn(
                  "flex items-center px-3 py-3 cursor-pointer rounded-2xl transition-all duration-300 relative overflow-hidden group",
                  activeChatId === chat.id 
                    ? "bg-primary/10 border border-primary/20 shadow-sm" 
                    : "hover:bg-surface-hover/80 border border-transparent"
                )}
              >
                {activeChatId === chat.id && (
                  <motion.div layoutId="activeChatIndicator" className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-primary rounded-r-full" />
                )}
                
                <div className="relative mr-4 shrink-0">
                  <Avatar src={chatImage} fallback={chatName || undefined} size="lg" className="shadow-sm group-hover:scale-105 transition-transform duration-300" />
                  {isOnline && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-success rounded-full border-2 border-background z-10 animate-pulse" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <h2 className={cn("text-base font-semibold truncate transition-colors", activeChatId === chat.id ? "text-primary" : "text-text-primary")}>
                      {chatName}
                    </h2>
                    <div className="flex items-center space-x-1 shrink-0">
                      {isPinned && <Pin size={12} className="text-primary fill-primary/20 rotate-45" />}
                      {lastMessage && (
                        <span className={cn(
                          "text-xs font-medium ml-1",
                          unreadCount > 0 ? "text-primary font-bold" : "text-text-tertiary"
                        )}>
                          {new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center space-x-1 overflow-hidden flex-1 min-w-0 pr-2">
                      {typingStatus?.isTyping ? (
                        <span className="text-primary font-medium animate-pulse text-sm">typing...</span>
                      ) : lastMessage ? (
                        <div className="flex items-center space-x-1 overflow-hidden w-full text-text-secondary">
                          {lastMessage.senderId === user?.id && lastMessage.type !== 'CALL_LOG' && lastMessage.type !== 'STORY_REPLY' && (
                            <span className="mr-1 shrink-0">
                              {lastMessage.status === 'READ' ? <CheckCheck size={14} className="text-[#53bdeb]" /> :
                               lastMessage.status === 'DELIVERED' ? <CheckCheck size={14} className="opacity-70" /> :
                               <Check size={14} className="opacity-70" />}
                            </span>
                          )}
                          <span className={cn("flex w-full min-w-0 text-[13px]", lastMessage.type === 'STORY_REPLY' ? "flex-col" : "truncate items-center")}>
                            {(() => {
                              if (lastMessage.type === 'POLL') return <><BarChart2 size={12} className="mr-1 shrink-0" /> <span className="truncate">Poll</span></>;
                              if (lastMessage.type === 'IMAGE') return <><ImageIcon size={12} className="mr-1 shrink-0" /> Photo</>;
                              if (lastMessage.type === 'VIDEO') return <><Video size={12} className="mr-1 shrink-0" /> Video</>;
                              if (lastMessage.type === 'AUDIO') return <><Mic size={12} className="mr-1 shrink-0" /> Voice message</>;
                              if (lastMessage.type === 'LOCATION') return <><MapPin size={12} className="mr-1 shrink-0" /> Location</>;
                              if (lastMessage.type === 'DOCUMENT') return <><FileText size={12} className="mr-1 shrink-0" /> Document</>;
                              if (lastMessage.type === 'CALL_LOG') return <><Phone size={12} className="mr-1 shrink-0" /> Call</>;
                              if (lastMessage.isEncrypted && lastMessage.type === 'TEXT' && typeof lastMessage.content === 'string' && lastMessage.content.startsWith('{"isEncrypted"')) {
                                  return <span className="truncate">Waiting for message...</span>;
                                }
                              return <>{formatText(lastMessage.content || '')}</>;
                            })()}
                          </span>
                        </div>
                      ) : (
                        <span className="italic text-text-tertiary text-[13px]">No messages yet</span>
                      )}
                    </div>

                    {unreadCount > 0 && (
                      <motion.span 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="ml-2 shrink-0 bg-primary text-white text-[11px] font-bold px-2 min-w-[20px] h-5 rounded-full flex items-center justify-center shadow-md shadow-primary/30"
                      >
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </motion.span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Floating Action Button for Nexus AI */}
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleAiChat}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full shadow-xl shadow-primary/20 flex items-center justify-center overflow-hidden border-2 border-surface/50 z-50 bg-surface glass-dark animate-float"
        title="Chat with Nexus AI"
      >
        <img 
          src="/image.png" 
          alt="Nexus AI" 
          className="w-full h-full object-cover" 
          onError={(e) => {
            e.currentTarget.src = 'https://api.dicebear.com/7.x/bottts/svg?seed=Nexus&backgroundColor=10b981';
          }}
        />
      </motion.button>

      <StarredMessagesOverlay isOpen={showStarredMessages} onClose={() => setShowStarredMessages(false)} />
      <RecordingsModal isOpen={showRecordings} onClose={() => setShowRecordings(false)} />

      <AnimatePresence>
        {contextMenu && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[100] bg-surface/90 backdrop-blur-md border border-surface-border rounded-xl shadow-2xl py-1 min-w-[180px] overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-4 py-3 hover:bg-surface-hover transition-colors flex items-center space-x-3 text-text-primary text-sm font-medium"
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
                  <Pin size={16} className="text-primary" />
                  <span>Pin Chat</span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
