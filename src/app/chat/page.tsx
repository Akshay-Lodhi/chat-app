'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useCallStore } from '../../store/useCallStore';
import Peer from 'simple-peer';
import CallOverlay from './CallOverlay';
import MediaViewer from './MediaViewer';
import { Video, Phone, Search, MoreVertical, Paperclip, Smile, Send, ArrowLeft, Check, CheckCheck } from 'lucide-react';
import { authClient } from '../../lib/auth';

export default function ChatPage() {
  const router = useRouter();
  const { token, user, logout, updateProfile } = useAuthStore();
  const { data: session, isPending } = authClient.useSession();
  const { 
    connectSocket, disconnectSocket, isConnecting, chats, messages, activeChatId, 
    setActiveChat, sendMessage, fetchChats, fetchMessages, createChat, createGroupChat 
  } = useChatStore();
  
  const [messageInput, setMessageInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [editName, setEditName] = useState(user?.name || '');
  const [editAbout, setEditAbout] = useState(user?.about || 'Hey there! I am using WhatsApp.');
  const [typingStatus, setTypingStatus] = useState<string | null>(null);
  const [activeMedia, setActiveMedia] = useState<{url: string, type: 'IMAGE'|'VIDEO'} | null>(null);
  
  // Group creation states
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const profilePicRef = React.useRef<HTMLInputElement>(null);
  const typingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Hydrate useAuthStore for legacy compatibility
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
    
    // Connect to Socket
    connectSocket('better-auth-session', session.user.id);
    
    // Fetch initial chat list
    fetchChats('better-auth-session');

    // Force profile setup if name is missing
    if (!session.user.name) {
      setShowProfile(true);
    }


    // Typing listener
    const socket = useChatStore.getState().socket;
    if (socket) {
      socket.on('typing', ({ chatId, userId }) => {
        if (chatId === useChatStore.getState().activeChatId) {
          setTypingStatus('typing...');
          setTimeout(() => setTypingStatus(null), 3000);
        }
      });
    }

    return () => {
      disconnectSocket();
    };
  }, [session, isPending, connectSocket, disconnectSocket, fetchChats, router]);

  // Fetch messages when active chat changes
  useEffect(() => {
    if (activeChatId && token && !messages[activeChatId]) {
      fetchMessages(activeChatId, token);
    }
  }, [activeChatId, token, messages, fetchMessages]);

  const loadContacts = async () => {
    if (!session) return;
    try {
      const url = searchPhone ? `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/contacts?phone=${searchPhone}` : `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/contacts`;
      const res = await fetch(url, {
        credentials: 'include'
      });
      if (res.ok) {
        setContacts(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const handleStartChat = async (contactId: string) => {
    if (!token) return;
    if (isCreatingGroup) {
      if (groupParticipants.includes(contactId)) {
        setGroupParticipants(prev => prev.filter(id => id !== contactId));
      } else {
        setGroupParticipants(prev => [...prev, contactId]);
      }
      return;
    }
    const chatId = await createChat(contactId, token);
    if (chatId) {
      setActiveChat(chatId);
      setShowContacts(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!token || !groupName.trim() || groupParticipants.length === 0) return;
    const chatId = await createGroupChat(groupName, groupParticipants);
    if (chatId) {
      setActiveChat(chatId);
      setShowContacts(false);
      setIsCreatingGroup(false);
      setGroupParticipants([]);
      setGroupName('');
    }
  };

  const startCall = async (type: 'AUDIO' | 'VIDEO') => {
    if (!activeChatId) return;
    const receiverName = chats.find(c => c.id === activeChatId)?.name || 'Unknown';
    useCallStore.setState({ caller: receiverName }); // Setting the caller for the UI
    useCallStore.getState().initiateCall(type, activeChatId);
  };

  const handleLogout = async () => {
    try {
      await authClient.signOut();
    } catch (e) {}
    disconnectSocket();
    logout();
    router.push('/login');
  };

  const activeMessages = activeChatId ? messages[activeChatId] || [] : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !activeChatId) return;
    
    sendMessage(activeChatId, messageInput);
    setMessageInput('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChatId || !token) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        // Send the uploaded media URL as a message via socket
        sendMessage(activeChatId, '', data.type, data.url);
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        updateProfile({ profilePicture: data.url });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) return;
    await updateProfile({ name: editName, about: editAbout });
    setShowProfile(false);
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    
    const { socket } = useChatStore.getState();
    if (socket && activeChatId) {
      socket.emit('typing', { chatId: activeChatId });
    }
  };

  return (
    <div className="flex h-screen bg-[#111B21] text-[#E9EDEF] overflow-hidden">
        <CallOverlay />
        
        {/* Sidebar */}
        <div className={`w-full md:w-[30%] md:min-w-[350px] border-r border-[#222D34] flex-col bg-[#111B21] relative ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
          {/* Header */}
        <div className="h-16 bg-[#202C33] flex items-center justify-between px-4 py-2">
          <div 
            onClick={() => setShowProfile(true)}
            className="w-10 h-10 bg-gray-500 rounded-full overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
          >
            {user?.profilePicture ? (
              <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#00A884] flex items-center justify-center text-xl font-semibold">
                {user?.name ? user.name.charAt(0) : user?.phoneNumber?.charAt(0) || 'U'}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-6 text-[#AEBAC1]">
            <button 
              className="hover:text-white transition-colors p-2" 
              title="New Chat"
              onClick={() => {
                setShowContacts(true);
                loadContacts();
              }}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" className="text-[#AEBAC1]">
                <path fill="currentColor" d="M19.005 3.175H4.674C3.642 3.175 3 3.789 3 4.821V21.02l3.544-3.514h12.461c1.033 0 2.064-1.06 2.064-2.093V4.821c-.001-1.032-1.032-1.646-2.064-1.646zm-4.989 9.869H7.041V11.1h6.975v1.944zm3-4H7.041V7.1h9.975v1.944z"></path>
              </svg>
            </button>
            <button className="hover:text-white transition-colors">
              <MoreVertical size={20} />
            </button>
          </div>
        </div>

        {/* Profile Slide-in Modal */}
        <div className={`absolute top-0 left-0 w-full h-full bg-[#111B21] z-40 transform transition-transform duration-300 ${showProfile ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="h-28 bg-[#202C33] flex items-end px-4 pb-4 shadow-md">
            {(session?.user?.name || user?.name) && (
              <button onClick={() => setShowProfile(false)} className="text-[#E9EDEF] mr-6 hover:opacity-80">
                <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 4l1.4 1.4L7.8 11H20v2H7.8l5.6 5.6L12 20l-8-8 8-8z"></path></svg>
              </button>
            )}
            <h1 className="text-xl font-medium text-[#E9EDEF]">Profile</h1>
          </div>
          
          <div className="p-6 flex flex-col items-center bg-[#111B21] overflow-y-auto h-[calc(100%-7rem)] scrollbar-thin scrollbar-thumb-[#374045]">
            <input type="file" ref={profilePicRef} className="hidden" onChange={handleProfileUpload} accept="image/*" />
            <div 
              onClick={() => profilePicRef.current?.click()}
              className="w-48 h-48 rounded-full overflow-hidden mb-8 relative group cursor-pointer border-2 border-transparent hover:border-[#00A884] transition-colors"
            >
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#00A884] flex items-center justify-center text-5xl font-semibold text-white">
                  {user?.name ? user.name.charAt(0) : user?.phoneNumber?.charAt(0) || 'U'}
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 hidden group-hover:flex flex-col items-center justify-center text-white text-sm text-center px-4">
                <Search size={24} className="mb-2" />
                CHANGE PROFILE PHOTO
              </div>
            </div>

            <div className="w-full mb-6">
              <p className="text-[#00A884] text-sm mb-2">Your name</p>
              <div className="flex items-center border-b-2 border-[#00A884] pb-2">
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => updateProfile({ name: editName })}
                  className="bg-transparent w-full focus:outline-none text-[#E9EDEF]"
                  placeholder="Enter your name"
                />
              </div>
              <p className="text-[#8696A0] text-xs mt-2">This is not your username or pin. This name will be visible to your WhatsApp contacts.</p>
            </div>

            <div className="w-full">
              <p className="text-[#00A884] text-sm mb-2">About</p>
              <div className="flex items-center border-b-2 border-[#00A884] pb-2">
                <input 
                  type="text" 
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  onBlur={() => updateProfile({ about: editAbout })}
                  className="bg-transparent w-full focus:outline-none text-[#E9EDEF]"
                  placeholder="Hey there! I am using WhatsApp."
                />
              </div>
            </div>

            <div className="flex flex-col items-center mt-8 w-full gap-4">
              <button 
                onClick={handleSaveProfile}
                disabled={!editName.trim()}
                className="bg-[#00A884] hover:bg-[#008f6f] text-[#111B21] font-medium py-3 px-8 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full max-w-[200px]"
              >
                {session?.user?.name || user?.name ? 'Save' : 'Start Chatting'}
              </button>

              {(session?.user?.name || user?.name) && (
                <button 
                  onClick={handleLogout}
                  className="bg-transparent border border-red-500 text-red-500 hover:bg-red-500 hover:text-white font-medium py-3 px-8 rounded-full transition-colors w-full max-w-[200px]"
                >
                  Log Out
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Contacts Slide-in Modal */}
        <div className={`absolute top-0 left-0 w-[30%] min-w-[350px] max-w-[450px] h-full bg-[#111B21] z-30 transform transition-transform duration-300 ${showContacts ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
          <div className="h-28 bg-[#202C33] flex items-end px-4 pb-4 shadow-md shrink-0">
            <button 
              onClick={() => {
                if (isCreatingGroup) {
                  setIsCreatingGroup(false);
                  setGroupParticipants([]);
                } else {
                  setShowContacts(false);
                }
              }} 
              className="text-[#E9EDEF] mr-6 hover:opacity-80"
            >
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M12 4l1.4 1.4L7.8 11H20v2H7.8l5.6 5.6L12 20l-8-8 8-8z"></path>
              </svg>
            </button>
            <h1 className="text-xl font-medium text-[#E9EDEF]">{isCreatingGroup ? 'Add group participants' : 'New chat'}</h1>
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#374045]">
            {isCreatingGroup && (
              <div className="p-4 border-b border-[#222D34]">
                <input 
                  type="text" 
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Group Subject" 
                  className="bg-transparent w-full focus:outline-none text-[#E9EDEF] border-b-2 border-[#00A884] pb-2 placeholder-[#8696A0]" 
                />
              </div>
            )}

            {!isCreatingGroup && (
              <div className="p-4 border-b border-[#222D34]">
                <div className="bg-[#202C33] rounded-lg flex items-center px-4 py-2">
                  <Search size={18} className="text-[#8696A0] mr-4" />
                  <input type="text" onChange={(e) => setSearchPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadContacts()} placeholder="Search contacts" className="bg-transparent w-full focus:outline-none text-sm placeholder-[#8696A0]" />
                </div>
              </div>
            )}
            
            {!isCreatingGroup && (
              <div onClick={() => setIsCreatingGroup(true)} className="flex items-center px-4 py-3 cursor-pointer hover:bg-[#202C33] border-b border-[#222D34]">
                <div className="w-12 h-12 bg-[#00A884] rounded-full mr-4 flex items-center justify-center text-white">
                  <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M16 11V7a4 4 0 1 0-8 0v4H4v11h16V11h-4zm-4-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM6 20v-7h12v7H6z"></path></svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-base text-[#E9EDEF]">New group</h2>
                </div>
              </div>
            )}

            {contacts.map(contact => (
              <div key={contact.id} onClick={() => handleStartChat(contact.id)} className="flex items-center px-4 py-3 cursor-pointer hover:bg-[#202C33] border-b border-[#222D34]">
                {isCreatingGroup && (
                  <div className="mr-4">
                    <div className={`w-5 h-5 rounded border ${groupParticipants.includes(contact.id) ? 'bg-[#00A884] border-[#00A884]' : 'border-[#8696A0]'} flex items-center justify-center`}>
                      {groupParticipants.includes(contact.id) && <Check size={14} className="text-[#111B21]" />}
                    </div>
                  </div>
                )}
                <div className="w-12 h-12 bg-[#00A884] rounded-full mr-4 flex items-center justify-center text-lg font-semibold text-white">
                  {contact.name ? contact.name.charAt(0) : contact.phoneNumber.charAt(0)}
                </div>
                <div className="flex-1">
                  <h2 className="text-base text-[#E9EDEF]">{contact.name || contact.phoneNumber}</h2>
                  <p className="text-sm text-[#8696A0] truncate">{contact.about}</p>
                </div>
              </div>
            ))}
          </div>
          
          {isCreatingGroup && (
            <div className="p-4 bg-[#202C33] shrink-0 flex justify-center">
              <button 
                onClick={handleCreateGroup}
                disabled={groupParticipants.length === 0 || !groupName.trim()}
                className="bg-[#00A884] hover:bg-[#008f6f] text-white p-4 rounded-full disabled:opacity-50 transition-colors"
              >
                <Check size={24} />
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="p-2 border-b border-[#222D34]">
          <div className="bg-[#202C33] rounded-lg flex items-center px-4 py-2">
            <Search size={18} className="text-[#8696A0] mr-4" />
            <input 
              type="text" 
              placeholder="Search or start new chat" 
              className="bg-transparent w-full focus:outline-none text-sm placeholder-[#8696A0]"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#374045] scrollbar-track-transparent">
          {chats.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[#8696A0] text-sm">
              No chats yet. Search for a contact.
            </div>
          ) : (
            chats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => setActiveChat(chat.id)}
                className={`flex items-center p-3 cursor-pointer hover:bg-[#202C33] transition-colors ${activeChatId === chat.id ? 'bg-[#2A3942]' : ''}`}
              >
                <div className="w-12 h-12 bg-[#00A884] rounded-full mr-4 flex items-center justify-center text-xl font-semibold overflow-hidden text-white">
                  {chat.groupPicture ? (
                    <img src={chat.groupPicture} className="w-full h-full object-cover" />
                  ) : (
                    chat.name?.charAt(0) || 'C'
                  )}
                </div>
                <div className="flex-1 border-b border-[#222D34] pb-3">
                  <div className="flex justify-between items-center mb-1">
                    <h3 className="text-base font-normal">{chat.name || 'Unknown Contact'}</h3>
                    {chat.lastMessage && (
                      <div className="flex flex-col items-end">
                        <span className={`text-xs ${chat.unreadCount ? 'text-[#00A884] font-semibold' : 'text-[#8696A0]'}`}>
                          {new Date(chat.lastMessage.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        {!!chat.unreadCount && (
                          <div className="bg-[#00A884] text-[#111B21] text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 mt-1">
                            {chat.unreadCount}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-[#8696A0] truncate flex items-center">
                    {(() => {
                      const msg = chat.lastMessage;
                      if (!msg) return 'Tap to chat';
                      if (msg.type === 'CALL_LOG') {
                        try {
                          const log = JSON.parse(msg.content || '{}');
                          const isMissed = log.action === 'MISSED';
                          const CallIcon = log.type === 'VIDEO' ? Video : Phone;
                          return (
                            <span className="flex items-center gap-1.5">
                              <CallIcon size={14} className={isMissed ? 'text-red-500' : ''} />
                              <span>{isMissed ? 'Missed' : ''} {log.type === 'VIDEO' ? 'Video' : 'Voice'} call</span>
                            </span>
                          );
                        } catch { return 'Call'; }
                      }
                      return <span className="truncate">{msg.content || (msg.type !== 'TEXT' ? msg.type : '')}</span>;
                    })()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex-col relative bg-[#0B141A] ${activeChatId ? 'flex' : 'hidden md:flex'}`}>
        {/* Chat Background Pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'url(https://static.whatsapp.net/rsrc.php/v3/yl/r/rG_52XoOchq.png)' }}></div>

        {activeChatId ? (
          <>
            {/* Chat Header */}
            <div className="h-16 bg-[#202C33] flex items-center justify-between px-4 z-10">
              <div className="flex items-center cursor-pointer">
                <button onClick={() => setActiveChat(null as any)} className="md:hidden mr-4 text-[#AEBAC1] hover:text-white">
                  <ArrowLeft size={20} />
                </button>
                <div className="w-10 h-10 bg-[#00A884] rounded-full mr-4 flex items-center justify-center text-lg font-semibold overflow-hidden">
                  {chats.find(c => c.id === activeChatId)?.groupPicture ? (
                    <img src={chats.find(c => c.id === activeChatId)?.groupPicture!} className="w-full h-full object-cover" />
                  ) : (
                    chats.find(c => c.id === activeChatId)?.name?.charAt(0) || 'C'
                  )}
                </div>
                <div>
                  <h2 className="text-base font-normal">{chats.find(c => c.id === activeChatId)?.name}</h2>
                  <p className="text-xs text-[#8696A0]">{typingStatus || 'Tap here for contact info'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-6 text-[#AEBAC1]">
                <button onClick={() => startCall('VIDEO')} className="hover:text-white transition-colors" title="Video Call">
                  <Video size={20} />
                </button>
                <button onClick={() => startCall('AUDIO')} className="hover:text-white transition-colors" title="Voice Call">
                  <Phone size={20} />
                </button>
                <button className="hover:text-white transition-colors">
                  <Search size={20} />
                </button>
                <button className="hover:text-white transition-colors">
                  <MoreVertical size={20} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 z-10 space-y-2 scrollbar-thin scrollbar-thumb-[#374045] scrollbar-track-transparent">
              <div className="flex justify-center mb-4">
                <span className="bg-[#182229] text-[#8696A0] text-xs px-3 py-1 rounded-lg">TODAY</span>
              </div>
              
              {activeMessages.length === 0 ? (
                <div className="flex justify-center mt-10">
                  <p className="bg-[#182229] text-[#E9EDEF] px-4 py-2 rounded-lg text-sm shadow-sm">
                    Send a message to start the conversation
                  </p>
                </div>
              ) : (
                activeMessages.map((msg, idx) => {
                  const isMine = msg.senderId === 'me' || msg.senderId === user?.id;
                  return (
                    <div key={msg.id || idx} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {msg.type === 'CALL_LOG' ? (
                        <div className={`max-w-[65%] rounded-lg px-3 py-2 text-sm shadow-sm flex items-center space-x-3 relative my-0.5 ${isMine ? 'bg-[#005C4B] rounded-tr-none' : 'bg-[#202C33] rounded-tl-none'}`}>
                          {(() => {
                            try {
                              const log = JSON.parse(msg.content || '{}');
                              const isMissed = log.action === 'MISSED';
                              const Icon = log.type === 'VIDEO' ? Video : Phone;
                              return (
                                <>
                                  <div className="flex flex-col items-center justify-center bg-black/20 p-2 rounded-full">
                                    <Icon size={16} className={isMissed ? 'text-red-500' : 'text-[#00A884]'} />
                                  </div>
                                  <div className="flex flex-col justify-center">
                                    <span className="text-[#E9EDEF] text-[15px] flex items-center gap-1">
                                      <span className={isMissed ? 'text-red-500 font-bold' : 'text-[#00A884] font-bold'}>
                                        {isMine ? '↗' : '↙'}
                                      </span>
                                      {isMissed 
                                        ? (isMine ? 'Unanswered Call' : 'Missed Call')
                                        : `${log.type === 'VIDEO' ? 'Video' : 'Voice'} Call`}
                                    </span>
                                    <span className="text-[11px] text-[#8696A0]">
                                      {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                      {!isMissed && ` • ${Math.floor(log.duration / 60).toString().padStart(2, '0')}:${(log.duration % 60).toString().padStart(2, '0')}`}
                                    </span>
                                  </div>
                                </>
                              );
                            } catch (e) {
                              return null;
                            }
                          })()}
                        </div>
                      ) : (
                        <div className={`max-w-[65%] rounded-lg px-2 py-1.5 text-sm shadow-sm relative ${isMine ? 'bg-[#005C4B] rounded-tr-none' : 'bg-[#202C33] rounded-tl-none'}`}>
                          {msg.type === 'IMAGE' && msg.mediaUrl ? (
                          <img 
                            src={msg.mediaUrl} 
                            alt="Attachment" 
                            className="max-w-full rounded mb-1 max-h-64 object-cover cursor-pointer hover:opacity-90"
                            onClick={() => setActiveMedia({ url: msg.mediaUrl as string, type: 'IMAGE' })}
                          />
                        ) : msg.type === 'VIDEO' && msg.mediaUrl ? (
                          <div className="relative cursor-pointer" onClick={() => setActiveMedia({ url: msg.mediaUrl as string, type: 'VIDEO' })}>
                            <video src={msg.mediaUrl} className="max-w-full rounded mb-1 max-h-64 object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded mb-1">
                              <div className="bg-black/50 rounded-full p-2 text-white">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                              </div>
                            </div>
                          </div>
                        ) : msg.type === 'DOCUMENT' && msg.mediaUrl ? (
                          <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center space-x-2 bg-black/20 p-2 rounded mb-1 hover:bg-black/30 transition-colors">
                            <svg viewBox="0 0 24 24" width="24" height="24" className="text-[#AEBAC1]"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>
                            <span className="text-sm truncate max-w-[150px]">Document</span>
                          </a>
                        ) : null}
                        {msg.content && <span className="break-words">{msg.content}</span>}
                        <div className="flex items-center justify-end mt-1 space-x-1">
                          <span className="text-[10px] text-white/60 ml-3">
                            {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                          {/* Read Receipts for my messages */}
                          {isMine && (
                            <div 
                              className="ml-1"
                              title={`Sent: ${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}\nDelivered: ${msg.deliveredAt ? new Date(msg.deliveredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'}\nRead: ${msg.readAt ? new Date(msg.readAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--'}`}
                            >
                              {msg.status === 'PENDING' ? (
                                <svg viewBox="0 0 16 16" width="14" height="14" className="text-white/60">
                                  <path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" />
                                  <path fill="currentColor" d="M7.5 4.5a.5.5 0 0 1 1 0v3.25l2.25 1.25a.5.5 0 0 1-.5.86l-2.5-1.4A.5.5 0 0 1 7.5 8z" />
                                </svg>
                              ) : msg.status === 'SENT' ? (
                                <svg viewBox="0 0 16 15" width="16" height="15" className="text-white/60">
                                  <path fill="currentColor" d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.724 7.587a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l3.14 3.007c.174.166.452.155.612-.023l5.82-7.854a.365.365 0 0 0-.063-.51z"></path>
                                </svg>
                              ) : (
                                <svg viewBox="0 0 16 15" width="16" height="15" className={msg.status === 'READ' ? 'text-[#53bdeb]' : 'text-white/60'}>
                                  <path fill="currentColor" d="m15.01 3.316-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267c.174.166.452.155.612-.023L15.073 3.826a.365.365 0 0 0-.063-.51z"></path>
                                  <path fill="currentColor" d="m9.98 3.316-.478-.372a.365.365 0 0 0-.51.063L3.636 9.88a.32.32 0 0 1-.484.032L1.35 8.287a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l2.76 2.646c.174.166.452.155.612-.023L9.943 3.826a.365.365 0 0 0-.063-.51z"></path>
                                </svg>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Area */}
            <div className="min-h-[62px] bg-[#202C33] px-4 py-3 flex items-end space-x-4 z-10">
              <div className="flex space-x-4 text-[#8696A0] mb-2">
                <button className="hover:text-white transition-colors"><Smile size={24} /></button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload} 
                  accept="image/*,video/*,application/pdf" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className={`transition-colors ${isUploading ? 'text-[#00A884] animate-pulse' : 'hover:text-white'}`}
                  disabled={isUploading}
                >
                  <Paperclip size={24} />
                </button>
              </div>
              <form onSubmit={handleSendMessage} className="flex-1 bg-[#2A3942] rounded-lg flex items-center px-4 py-2 max-h-32 overflow-y-auto">
                <input
                  type="text"
                  value={messageInput}
                  onChange={handleMessageChange}
                  placeholder="Type a message"
                  className="w-full bg-transparent focus:outline-none text-sm placeholder-[#8696A0]"
                />
              </form>
              <button 
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
                className="text-[#8696A0] hover:text-[#00A884] transition-colors mb-2 disabled:opacity-50"
              >
                <Send size={24} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center border-b-[6px] border-[#00A884] z-10">
            <div className="max-w-md text-center">
              <div className="w-72 h-72 mx-auto bg-[#202C33] rounded-full flex items-center justify-center mb-8 shadow-lg">
                <svg viewBox="0 0 24 24" className="w-32 h-32 text-[#00A884]" fill="currentColor">
                  <path d="M12 0a12 12 0 1 0 12 12A12.013 12.013 0 0 0 12 0zm0 22a10 10 0 1 1 10-10 10.011 10.011 0 0 1-10 10zm5-10H7v-2h10z" />
                </svg>
              </div>
              <h1 className="text-3xl font-light text-[#E9EDEF] mb-4">WhatsApp Web Clone</h1>
              <p className="text-[#8696A0] text-sm leading-relaxed">
                Send and receive messages without keeping your phone online.<br/>
                Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Call Overlay rendered globally on the Chat page */}
      <CallOverlay />

      {/* Media Viewer Overlay */}
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
