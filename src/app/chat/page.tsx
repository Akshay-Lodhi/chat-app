'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { authClient } from '@/lib/auth';

import { ChatSidebar } from '@/components/chat/ChatSidebar';
import { ContactList } from '@/components/chat/ContactList';
import { ProfileOverlay } from '@/components/chat/ProfileOverlay';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { MessageList } from '@/components/chat/MessageList';
import { MessageComposer } from '@/components/chat/MessageComposer';
import { GroupInfoOverlay } from '@/components/chat/GroupInfoOverlay';
import { ContactInfoOverlay } from '@/components/chat/ContactInfoOverlay';

import CallOverlay from './CallOverlay';
import MediaViewer from './MediaViewer';

export default function ChatPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: session, isPending } = authClient.useSession();
  
  const { 
    connectSocket, disconnectSocket, activeChatId, 
    setActiveChat, sendMessage, fetchChats, fetchMessages, chats, fetchBlockedUsers
  } = useChatStore();

  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;

  const [showContacts, setShowContacts] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [activeMedia, setActiveMedia] = useState<{url: string, type: 'IMAGE'|'VIDEO'} | null>(null);

  // Hydration and Connection
  useEffect(() => {
    if (session?.user && (!user || user.id !== session.user.id)) {
      useAuthStore.getState().setAuth('better-auth-session', session.user as any);
    }
  }, [session, user]);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      router.push('/login');
      return;
    }
    connectSocket('better-auth-session', session.user.id);
    fetchChats('better-auth-session');
    fetchBlockedUsers();
    
    if (!session.user.name) setShowProfile(true);

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

  const handleSendMedia = async (file: File) => {
    if (!activeChatId) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
        method: 'POST', credentials: 'include', body: formData
      });
      if (res.ok) {
        const data = await res.json();
        sendMessage(activeChatId, '', data.type, data.url, replyingTo?.id || null);
        setReplyingTo(null);
      }
    } catch (err) {}
  };

  const handleSendLocation = () => {
    if (!activeChatId) return;
    if (!navigator.geolocation) return alert('Geolocation is not supported');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        sendMessage(activeChatId, JSON.stringify({ lat: latitude, lng: longitude }), 'LOCATION', null, replyingTo?.id || null);
        setReplyingTo(null);
      },
      () => alert('Unable to retrieve location')
    );
  };

  const handleSendVoice = async (blob: Blob) => {
    if (!activeChatId) return;
    const formData = new FormData();
    formData.append('file', blob, 'voicenote.webm');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
        method: 'POST', credentials: 'include', body: formData
      });
      if (res.ok) {
        const data = await res.json();
        sendMessage(activeChatId, '', 'AUDIO', data.url, replyingTo?.id || null);
        setReplyingTo(null);
      }
    } catch (err) {}
  };

  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden relative">
      
      {/* Sidebar Area */}
      <ChatSidebar 
        onProfileClick={() => setShowProfile(true)}
        onNewChatClick={() => { setIsAddingMembers(false); setShowContacts(true); }}
      />

      <ContactList isOpen={showContacts} onClose={() => setShowContacts(false)} isAddingMembers={isAddingMembers} />
      <ProfileOverlay isOpen={showProfile} onClose={() => setShowProfile(false)} />

      {/* Main Chat Area */}
      {activeChatId ? (
        <div className="flex-1 flex flex-col bg-chat-bg relative">
          {/* Glass background pattern optional here */}
          
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
          />

          <MessageList 
            onReply={setReplyingTo}
            onMediaClick={(url, type) => setActiveMedia({ url, type })}
            searchQuery={searchQuery}
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
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-chat-bg">
          <div className="max-w-md text-center flex flex-col items-center space-y-6 opacity-70">
            <div className="w-32 h-32 flex items-center justify-center">
              <img src="/logo.svg" alt="Logo" className="w-full h-full object-contain drop-shadow-2xl" />
            </div>
            <h1 className="text-3xl font-light tracking-tight text-text-primary">NexusChat Web</h1>
            <p className="text-text-secondary leading-relaxed">
              Send and receive messages seamlessly across your devices.
            </p>
          </div>
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
