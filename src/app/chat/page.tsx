'use client';
import { apiClient } from '@/lib/apiClient';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { authClient } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { AnimatePresence } from 'framer-motion';
import { Pin, Lock } from 'lucide-react';

import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ContactList } from '@/components/chat/ContactList';
import { ProfileOverlay } from '@/components/chat/ProfileOverlay';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageComposer } from '@/components/chat/MessageComposer';
import { GroupInfoOverlay } from '@/components/chat/GroupInfoOverlay';
import { ContactInfoOverlay } from '@/components/chat/ContactInfoOverlay';
import { MessageInfoOverlay } from '@/components/chat/MessageInfoOverlay';
import { ForwardMessageModal } from '@/components/chat/ForwardMessageModal';
import { InAppNotificationToast } from '@/components/chat/InAppNotificationToast';
import { useWallpaperStore } from '@/store/useWallpaperStore';

import { BottomNav } from '@/components/chat/BottomNav';
import { LiveView } from '@/components/live/LiveView';
import { LiveStreamRoom } from '@/components/live/LiveStreamRoom';
import { CallsView } from '@/components/chat/CallsView';
import { UpdatesView } from '@/components/chat/UpdatesView';
import { useLiveStore } from '@/store/useLiveStore';

import CallOverlay from './CallOverlay';
import MediaViewer from './MediaViewer';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: session, isPending } = authClient.useSession();
  
  const { 
    connectSocket, disconnectSocket, activeChatId, 
    setActiveChat, sendMessage, fetchChats, fetchMessages, chats, fetchBlockedUsers,
    activeTab, setActiveTab, messages
  } = useChatStore();

  const { activeStream, leaveLiveStream } = useLiveStore();

  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;
  const pinnedMessage = activeChatId ? (messages[activeChatId] || []).find(m => m.isPinned) : null;

  const [showContacts, setShowContacts] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [activeMedia, setActiveMedia] = useState<{url: string, type: 'IMAGE'|'VIDEO'} | null>(null);

  const [showForwardModal, setShowForwardModal] = useState(false);
  const [messagesToForward, setMessagesToForward] = useState<any[]>([]);

  const handleForwardMessages = async (targetChatIds: string[]) => {
    // Send each message to each target chat
    for (const chatId of targetChatIds) {
      for (const msg of messagesToForward) {
        sendMessage(chatId, msg.content || '', msg.type || 'TEXT', msg.mediaUrl || null, null);
      }
    }
    setShowForwardModal(false);
    setMessagesToForward([]);
    useChatStore.getState().clearMessageSelection();
  };

  const scrollToPinnedMessage = (messageId: string) => {
    if (!messageId) return;
    const elements = Array.from(document.querySelectorAll(`[id="msg-${messageId}"]`)) as HTMLElement[];
    const el = elements.find(item => item.offsetParent !== null || item.getBoundingClientRect().height > 0) || elements[0];

    if (el) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (err) {}

      const parentScrollable = el.closest('.overflow-y-auto') || el.parentElement;
      if (parentScrollable) {
        const parentRect = parentScrollable.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        const targetScrollTop = parentScrollable.scrollTop + (elRect.top - parentRect.top) - (parentScrollable.clientHeight / 2) + (elRect.height / 2);
        parentScrollable.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
      }
    }
    if (el) {
      el.classList.add('ring-2', 'ring-purple-500', 'bg-purple-500/20', 'transition-all', 'duration-300');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-purple-500', 'bg-purple-500/20', 'transition-all', 'duration-300');
      }, 2000);
    }
  };

  // Hydration and Connection
  const profileHydratedRef = useRef(false);

  useEffect(() => {
    if (session?.user && (!user || user.id !== session.user.id || (!user.profilePicture && !profileHydratedRef.current))) {
      profileHydratedRef.current = true;
      // Start with session data
      useAuthStore.getState().setAuth('better-auth-session', { ...user, ...session.user } as any);
      
      // Fetch full profile from backend to get profilePicture
      apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/me`, {
        credentials: 'include',
        headers: { 'Authorization': `Bearer better-auth-session` }
      })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          useAuthStore.getState().setAuth('better-auth-session', { ...session.user, ...data });
        }
      })
      .catch(console.error);
    }
  }, [session, user]);

  useEffect(() => {
    if (isPending) return;
    const currentUser = useAuthStore.getState().user;
    
    // Only redirect if both session AND local persisted user are absent
    if (!session?.user && !currentUser) {
      router.push('/login');
      return;
    }

    const effectiveUserId = session?.user?.id || currentUser?.id;
    if (effectiveUserId) {
      connectSocket('better-auth-session', effectiveUserId);
      fetchChats('better-auth-session');
      fetchBlockedUsers();
    }
    
    if (session?.user && !session.user.name) setShowProfile(true);

    return () => disconnectSocket();
  }, [session, isPending, connectSocket, disconnectSocket, fetchChats, fetchBlockedUsers, router]);

  useEffect(() => {
    if (activeChatId) {
      fetchMessages(activeChatId, 'better-auth-session');
    }
  }, [activeChatId, fetchMessages]);

  const handleSendMessage = (text: string) => {
    if (!activeChatId) return;
    sendMessage(activeChatId, text, 'TEXT', null, replyingTo?.id || null);
    setReplyingTo(null);
  };

  const handleSendMedia = async (file: File, isViewOnce: boolean = false) => {
    if (!activeChatId) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
        method: 'POST', credentials: 'include', body: formData
      });
      if (res.ok) {
        const data = await res.json();
        const metadata = isViewOnce ? { viewOnce: true, viewedBy: [] } : null;
        sendMessage(activeChatId, '', data.type, data.url, replyingTo?.id || null, metadata);
        setReplyingTo(null);
      }
    } catch (err) {
      console.error('Failed to send media', err);
    }
  };

  const handleSendLocation = () => {
    if (!activeChatId) return;
    if (!navigator.geolocation) return toast.error('Geolocation is not supported');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        sendMessage(activeChatId, JSON.stringify({ lat: latitude, lng: longitude }), 'LOCATION', null, replyingTo?.id || null);
        setReplyingTo(null);
      },
      (error) => {
        console.error('Location error:', error);
        toast.error('Unable to retrieve location');
      }
    );
  };

  const handleSendVoice = async (blob: Blob) => {
    if (!activeChatId) return;
    const formData = new FormData();
    formData.append('file', blob, 'voicenote.webm');
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
        method: 'POST', credentials: 'include', body: formData
      });
      if (res.ok) {
        const data = await res.json();
        sendMessage(activeChatId, '', 'AUDIO', data.url, replyingTo?.id || null);
        setReplyingTo(null);
      }
    } catch (err) {
      console.error('Failed to send voice', err);
    }
  };

  const { getChatWallpaper, hydrate } = useWallpaperStore();
  const activeWallpaper = getChatWallpaper(activeChatId);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const getWallpaperClass = (type: string) => {
    switch (type) {
      case 'doodle-dark': return 'bg-chat-bg chat-bg-pattern';
      case 'doodle-light': return 'bg-[#efeae2] text-text-primary';
      case 'solid-teal': return 'bg-[#075e54]';
      case 'solid-midnight': return 'bg-[#0d1418]';
      case 'solid-black': return 'bg-[#000000]';
      case 'solid-purple': return 'bg-[#1f1b24]';
      case 'custom': return 'bg-chat-bg';
      default: return 'bg-chat-bg chat-bg-pattern';
    }
  };

  return (
    <div className="fixed inset-0 flex h-[100dvh] w-full max-w-[100vw] bg-background text-foreground overflow-hidden">
      
      {/* Left Sidebar Pane with Tabs & Bottom Navigation */}
      <div className={cn(
        "w-full md:w-80 lg:w-96 flex flex-col h-full shrink-0 border-r border-surface-border bg-surface relative z-10",
        activeChatId ? "hidden md:flex" : "flex"
      )}>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {/* On Desktop (md:), keep ChatSidebar on left so chat list is always accessible */}
          <div className="hidden md:flex flex-col h-full overflow-hidden">
            <ChatSidebar 
              onProfileClick={() => setShowProfile(true)}
              onNewChatClick={() => { setIsAddingMembers(false); setShowContacts(true); }}
            />
          </div>

          {/* On Mobile (< md:), switch between ChatSidebar, LiveView, and CallsView based on activeTab */}
          <div className="flex md:hidden flex-col h-full overflow-hidden">
            {activeTab === 'chats' && (
              <ChatSidebar 
                onProfileClick={() => setShowProfile(true)}
                onNewChatClick={() => { setIsAddingMembers(false); setShowContacts(true); }}
              />
            )}

            {activeTab === 'live' && <LiveView />}

            {activeTab === 'calls' && <CallsView />}
            
            {activeTab === 'updates' && <UpdatesView />}
          </div>
        </div>

        {/* Floating Glassmorphic Bottom Navigation Bar */}
        <BottomNav 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      <ContactList isOpen={showContacts} onClose={() => setShowContacts(false)} isAddingMembers={isAddingMembers} />
      <ProfileOverlay isOpen={showProfile} onClose={() => setShowProfile(false)} />
      <MessageInfoOverlay />
      <InAppNotificationToast />

      {/* Active Fullscreen Live Stream Player (Global Singleton) */}
      <AnimatePresence>
        {activeStream && (
          <LiveStreamRoom 
            stream={activeStream} 
            onClose={() => leaveLiveStream(user)} 
          />
        )}
      </AnimatePresence>
      <ForwardMessageModal 
        isOpen={showForwardModal} 
        onClose={() => {
          setShowForwardModal(false);
          setMessagesToForward([]);
        }} 
        onForward={handleForwardMessages} 
      />

      {/* Main Desktop Workspace Area */}
      <div className="hidden md:flex flex-1 h-full min-w-0 overflow-hidden relative bg-chat-bg">
        {activeTab === 'live' ? (
          <LiveView />
        ) : activeTab === 'calls' ? (
          <CallsView />
        ) : activeTab === 'updates' ? (
          <div className="w-full h-full overflow-y-auto">
            <UpdatesView />
          </div>
        ) : activeChatId ? (
          <div 
            className={cn("w-full h-full flex flex-col relative overflow-hidden transition-colors duration-300", getWallpaperClass(activeWallpaper.wallpaper))}
            style={activeWallpaper.wallpaper === 'custom' && activeWallpaper.customUrl ? { backgroundImage: `url(${activeWallpaper.customUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            <ChatHeader 
              onBack={() => setActiveChat(null as any)}
              onSearchClick={() => {}}
              onGroupInfoClick={() => {
                if (activeChat?.isGroup) {
                  setShowGroupInfo(true);
                } else {
                  setShowContactInfo(true);
                }
              }}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onForward={(messages) => {
                setMessagesToForward(messages);
                setShowForwardModal(true);
              }}
            />

            {pinnedMessage && (
               <div className="bg-surface/90 backdrop-blur-md px-4 py-2 flex items-center justify-between border-b border-surface-border shadow-sm cursor-pointer hover:bg-surface transition-colors"
                onClick={() => scrollToPinnedMessage(pinnedMessage.id)}
              >
                <Pin size={16} className="text-purple-400 mr-3 shrink-0 rotate-45" />
                <div className="flex-1 truncate">
                  <p className="text-xs font-semibold text-purple-400 mb-0.5">Pinned Message</p>
                  <p className="text-sm text-text-primary truncate font-medium">
                    {messages[activeChatId]?.find((m: any) => m.id === pinnedMessage.id)?.content || 'Pinned message'}
                  </p>
                </div>
                <span className="text-xs text-purple-400 font-semibold shrink-0 ml-2">Tap to view</span>
              </div>
            )}

            <MessageList 
              onReply={setReplyingTo}
              onMediaClick={(url, type) => setActiveMedia({ url, type })}
              searchQuery={searchQuery}
              onSendMessage={handleSendMessage}
              onForward={(message) => {
                setMessagesToForward([message]);
                setShowForwardModal(true);
              }}
            />

            <MessageComposer 
              onSendMessage={handleSendMessage}
              onSendMedia={handleSendMedia}
              onSendLocation={handleSendLocation}
              onSendVoice={handleSendVoice}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center relative bg-gradient-to-b from-chat-bg to-surface overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.1),transparent_50%)]" />
            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />
            
            <div className="max-w-md text-center flex flex-col items-center z-10 p-8 rounded-3xl bg-surface-hover/30 backdrop-blur-xl border border-white/5 shadow-2xl">
              <div className="w-32 h-32 flex items-center justify-center mb-8 relative">
                <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 to-purple-500/20 rounded-full blur-2xl animate-pulse" />
                <img src="/logo.svg" alt="NexusChat" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />
              </div>
              <h1 className="text-4xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 mb-4">
                NexusChat Web
              </h1>
              <p className="text-text-secondary text-lg leading-relaxed font-light">
                Experience seamless, end-to-end encrypted messaging across all your devices.
              </p>
              
              <div className="mt-10 flex items-center space-x-2 text-sm text-text-tertiary">
                <Lock size={14} />
                <span>End-to-End Encrypted</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Active Chat View (overlay on mobile when activeChatId is set) */}
      {activeChatId && (
        <div 
          className={cn("md:hidden fixed top-0 left-0 right-0 h-[100dvh] z-50 flex flex-col overflow-hidden transition-colors duration-300", getWallpaperClass(activeWallpaper.wallpaper))}
          style={activeWallpaper.wallpaper === 'custom' && activeWallpaper.customUrl ? { backgroundImage: `url(${activeWallpaper.customUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          <ChatHeader 
            onBack={() => setActiveChat(null as any)}
            onSearchClick={() => {}}
            onGroupInfoClick={() => {
              if (activeChat?.isGroup) {
                setShowGroupInfo(true);
              } else {
                setShowContactInfo(true);
              }
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onForward={(messages) => {
              setMessagesToForward(messages);
              setShowForwardModal(true);
            }}
          />

          {pinnedMessage && (
            <div className="bg-surface/90 backdrop-blur-md px-4 py-2 flex items-center justify-between border-b border-surface-border shadow-sm cursor-pointer hover:bg-surface transition-colors mt-14"
              onClick={() => scrollToPinnedMessage(pinnedMessage.id)}
            >
              <Pin size={16} className="text-purple-400 mr-3 shrink-0 rotate-45" />
              <div className="flex-1 truncate">
                <p className="text-xs font-semibold text-purple-400 mb-0.5">Pinned Message</p>
                <p className="text-sm text-text-primary truncate font-medium">
                  {messages[activeChatId]?.find((m: any) => m.id === pinnedMessage.id)?.content || 'Pinned message'}
                </p>
              </div>
              <span className="text-xs text-purple-400 font-semibold shrink-0 ml-2">Tap to view</span>
            </div>
          )}

          <MessageList 
            onReply={setReplyingTo}
            onMediaClick={(url, type) => setActiveMedia({ url, type })}
            searchQuery={searchQuery}
            onSendMessage={handleSendMessage}
            onForward={(message) => {
              setMessagesToForward([message]);
              setShowForwardModal(true);
            }}
          />

          <MessageComposer 
            onSendMessage={handleSendMessage}
            onSendMedia={handleSendMedia}
            onSendLocation={handleSendLocation}
            onSendVoice={handleSendVoice}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
          />
        </div>
      )}

      {/* Modals & Overlays */}
      <GroupInfoOverlay 
        isOpen={showGroupInfo} 
        onClose={() => setShowGroupInfo(false)} 
        onAddMemberClick={() => { setShowGroupInfo(false); setIsAddingMembers(true); setShowContacts(true); }}
      />
      <ContactInfoOverlay 
        isOpen={showContactInfo} 
        onClose={() => setShowContactInfo(false)} 
      />
      <CallOverlay />
      
      {activeMedia && (
        <MediaViewer 
          url={activeMedia.url} 
          type={activeMedia.type} 
          onClose={() => setActiveMedia(null)} 
        />
      )}
    </div>
  );
}

// Trigger TS Server Sync
