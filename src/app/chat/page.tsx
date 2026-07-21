'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useChatStore } from '../../store/useChatStore';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useCallStore } from '../../store/useCallStore';
import Peer from 'simple-peer';
import CallOverlay from './CallOverlay';
import MediaViewer from './MediaViewer';
import { Video, Phone, Search, MoreVertical, Paperclip, Smile, Send, ArrowLeft, Check, CheckCheck, Mic, Trash2, X, ChevronDown, Reply, Ban, LogOut, MapPin } from 'lucide-react';
import { authClient } from '../../lib/auth';

export default function ChatPage() {
  const router = useRouter();
  const { token, user, logout, updateProfile } = useAuthStore();
  const { data: session, isPending } = authClient.useSession();
  const { 
    connectSocket, disconnectSocket, isConnecting, chats, messages, activeChatId, 
    setActiveChat, sendMessage, fetchChats, fetchMessages, createChat, createGroupChat, deleteMessage,
    onlineUsers, typingStatuses, sendTypingStatus
  } = useChatStore();
  
  const [messageInput, setMessageInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [editName, setEditName] = useState(user?.name || '');
  const [editAbout, setEditAbout] = useState(user?.about || 'Hey there! I am using WhatsApp.');
  const [typingStatus, setTypingStatus] = useState<string | null>(null);
  const [activeMedia, setActiveMedia] = useState<{url: string, type: 'IMAGE'|'VIDEO'} | null>(null);
  
  // Group creation states
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [groupParticipants, setGroupParticipants] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  
  // New Feature States
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const swipeMsgRef = useRef<{ id: string; startX: number; deltaX: number } | null>(null);
  const [msgInfoMsg, setMsgInfoMsg] = useState<any>(null); // Message Info panel
  const longPressRef = useRef<NodeJS.Timeout | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [mainMenuOpen, setMainMenuOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  
  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<BlobPart[]>([]);
  const recordingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  
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

  // Handle mobile browser back button to close chat instead of logging out
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (activeChatId) {
        // Only clear active chat if it was active
        setActiveChat(null as any);
      }
    };

    if (activeChatId) {
      window.history.pushState({ chatActive: true }, '');
    }

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeChatId, setActiveChat]);

  useEffect(() => {
    // Reset group info when active chat changes
    setShowGroupInfo(false);
  }, [activeChatId]);

  // Global click listener to close menus
  useEffect(() => {
    const closeMenus = () => {
      setMainMenuOpen(false);
      setMenuOpenId(null);
      setChatMenuOpen(false);
    };
    document.addEventListener('click', closeMenus);
    return () => document.removeEventListener('click', closeMenus);
  }, []);

  // Fetch messages when active chat changes
  useEffect(() => {
    if (activeChatId && !messages[activeChatId]) {
      // NOTE: token is removed here as it's not strictly required with better-auth
      fetchMessages(activeChatId, token || 'better-auth-session');
    }
  }, [activeChatId, messages, fetchMessages]);

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
    if (isCreatingGroup) {
      if (groupParticipants.includes(contactId)) {
        setGroupParticipants(prev => prev.filter(id => id !== contactId));
      } else {
        setGroupParticipants(prev => [...prev, contactId]);
      }
      return;
    }
    const chatId = await createChat(contactId, token || 'better-auth-session');
    if (chatId) {
      setActiveChat(chatId);
      setShowContacts(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupParticipants.length === 0) return;
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

  const handleShareLocation = () => {
    if (!activeChatId) return;
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        sendMessage(activeChatId, JSON.stringify({ lat: latitude, lng: longitude }), 'LOCATION');
        setChatMenuOpen(false);
      },
      (error) => {
        console.error('Error getting location', error);
        alert('Unable to retrieve your location');
      }
    );
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() || !activeChatId) return;
    
    sendMessage(activeChatId, messageInput, 'TEXT', null, replyingTo?.id || null);
    setMessageInput('');
    setReplyingTo(null);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (!activeChatId) return;
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', audioBlob, 'voicenote.webm');
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData
          });
          if (res.ok) {
            const data = await res.json();
            sendMessage(activeChatId, '', 'AUDIO', data.url, replyingTo?.id || null);
            setReplyingTo(null);
          }
        } catch (err) {}
        setIsUploading(false);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Mic permission denied', err);
    }
  };

  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };
  
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeChatId) return;

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
        sendMessage(activeChatId, '', data.type, data.url, replyingTo?.id || null);
        setReplyingTo(null);
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
    if (!file) return;

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
    <div className="flex h-[100dvh] bg-[#111B21] text-[#E9EDEF] overflow-hidden relative">
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
            <button 
              className="hover:text-white transition-colors p-2"
              title="Log out"
              onClick={handleLogout}
            >
              <LogOut size={20} className="text-[#AEBAC1]" />
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
                } else if (isAddingMembers) {
                  setIsAddingMembers(false);
                  setGroupParticipants([]);
                  setShowContacts(false);
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
            <h1 className="text-xl font-medium text-[#E9EDEF]">
              {isCreatingGroup ? 'Add group participants' : isAddingMembers ? 'Add members' : 'New chat'}
            </h1>
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
            
            {!isCreatingGroup && !isAddingMembers && (
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
                {(isCreatingGroup || isAddingMembers) && (
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

          {isAddingMembers && (
            <div className="p-4 bg-[#202C33] shrink-0 flex justify-center">
              <button 
                onClick={async () => {
                  if (activeChatId && groupParticipants.length > 0) {
                    await useChatStore.getState().addGroupParticipants(activeChatId, groupParticipants);
                    setIsAddingMembers(false);
                    setGroupParticipants([]);
                    setShowContacts(false);
                  }
                }}
                disabled={groupParticipants.length === 0}
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
              value={sidebarSearchQuery}
              onChange={(e) => setSidebarSearchQuery(e.target.value)}
              placeholder="Search or start new chat" 
              className="bg-transparent w-full focus:outline-none text-sm placeholder-[#8696A0]"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#374045] scrollbar-track-transparent">
          {(() => {
            const filteredChats = sidebarSearchQuery.trim() 
              ? chats.filter(c => c.name?.toLowerCase().includes(sidebarSearchQuery.toLowerCase())) 
              : chats;
            
            if (filteredChats.length === 0) {
              return (
                <div className="flex items-center justify-center h-full text-[#8696A0] text-sm">
                  {sidebarSearchQuery ? 'No chats found.' : 'No chats yet. Search for a contact.'}
                </div>
              );
            }
            return filteredChats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => setActiveChat(chat.id)}
                className={`flex items-center p-3 cursor-pointer hover:bg-[#202C33] transition-colors ${activeChatId === chat.id ? 'bg-[#2A3942]' : ''}`}
              >
                <div className="relative mr-4">
                  <div className="w-12 h-12 bg-[#00A884] rounded-full flex items-center justify-center text-xl font-semibold overflow-hidden text-white">
                    {chat.groupPicture ? (
                      <img src={chat.groupPicture} className="w-full h-full object-cover" />
                    ) : (
                      chat.name?.charAt(0) || 'C'
                    )}
                  </div>
                  {(() => {
                    if (!chat.isGroup) {
                      const otherParticipant = chat.participants?.find((p: any) => p.userId !== user?.id);
                      if (otherParticipant && onlineUsers[otherParticipant.userId]) {
                        return <div className="absolute bottom-0 right-0 w-3 h-3 bg-[#00A884] rounded-full border-2 border-[#111B21]"></div>;
                      }
                    }
                    return null;
                  })()}
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
                      if (typingStatuses[chat.id]?.isTyping) {
                        return <span className="text-[#00A884] font-medium italic">typing...</span>;
                      }
                      const msg = chat.lastMessage;
                      if (!msg) return 'Tap to chat';
                      
                      const isMine = msg.senderId === user?.id;
                      const renderTicks = () => {
                        if (!isMine) return null;
                        if (msg.status === 'PENDING') {
                          return <svg viewBox="0 0 16 16" width="14" height="14" className="text-[#8696A0] mr-1 inline"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z" /><path fill="currentColor" d="M7.5 4.5a.5.5 0 0 1 1 0v3.25l2.25 1.25a.5.5 0 0 1-.5.86l-2.5-1.4A.5.5 0 0 1 7.5 8z" /></svg>;
                        }
                        if (msg.status === 'SENT') {
                          return <svg viewBox="0 0 16 15" width="16" height="15" className="text-[#8696A0] mr-1 inline"><path fill="currentColor" d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.724 7.587a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l3.14 3.007c.174.166.452.155.612-.023l5.82-7.854a.365.365 0 0 0-.063-.51z"></path></svg>;
                        }
                        return <svg viewBox="0 0 16 15" width="16" height="15" className={`mr-1 inline ${msg.status === 'READ' ? 'text-[#53bdeb]' : 'text-[#8696A0]'}`}><path fill="currentColor" d="m15.01 3.316-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267c.174.166.452.155.612-.023L15.073 3.826a.365.365 0 0 0-.063-.51z"></path><path fill="currentColor" d="m9.98 3.316-.478-.372a.365.365 0 0 0-.51.063L3.636 9.88a.32.32 0 0 1-.484.032L1.35 8.287a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l2.76 2.646c.174.166.452.155.612-.023L9.943 3.826a.365.365 0 0 0-.063-.51z"></path></svg>;
                      };

                      let content = <span className="truncate">{msg.content || (msg.type !== 'TEXT' ? msg.type : '')}</span>;
                      if (msg.type === 'CALL_LOG') {
                        try {
                          const log = JSON.parse(msg.content || '{}');
                          const isMissed = log.action === 'MISSED';
                          const CallIcon = log.type === 'VIDEO' ? Video : Phone;
                          content = (
                            <span className="flex items-center gap-1.5 truncate">
                              <CallIcon size={14} className={isMissed ? 'text-red-500' : ''} />
                              <span>{isMissed ? 'Missed' : ''} {log.type === 'VIDEO' ? 'Video' : 'Voice'} call</span>
                            </span>
                          );
                        } catch { content = <span>Call</span>; }
                      } else if (msg.type === 'LOCATION') {
                        content = (
                          <span className="flex items-center gap-1.5 truncate">
                            <MapPin size={14} className="text-[#AEBAC1]" />
                            <span>Location</span>
                          </span>
                        );
                      }

                      return (
                        <div className="flex items-center w-full min-w-0">
                          {renderTicks()}
                          {content}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Group Info Slide-in Modal (Moved to root) */}
      <div className={`absolute top-0 right-0 w-full md:w-[30%] min-w-[350px] max-w-[450px] h-full bg-[#111B21] z-50 transform transition-transform duration-300 ${showGroupInfo ? 'translate-x-0' : 'translate-x-full'} flex flex-col border-l border-[#222D34]`}>
        <div className="h-16 bg-[#202C33] flex items-center px-4 shadow-md shrink-0 border-b border-[#222D34]">
          <button onClick={(e) => { e.stopPropagation(); setShowGroupInfo(false); }} className="text-[#AEBAC1] mr-6 hover:text-white transition-colors cursor-pointer">
            <X size={24} />
          </button>
          <h1 className="text-base font-medium text-[#E9EDEF]">{chats.find(c => c.id === activeChatId)?.isGroup ? 'Group info' : 'Contact info'}</h1>
        </div>
        
        {activeChatId && (
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#374045]">
            <div className="flex flex-col items-center py-8 bg-[#111B21] border-b border-[#222D34]">
              <div className="w-48 h-48 rounded-full overflow-hidden mb-4 border-2 border-transparent hover:border-[#00A884] transition-colors cursor-pointer relative group">
                {(() => {
                  const chat = chats.find(c => c.id === activeChatId);
                  if (chat?.isGroup) {
                    return chat?.groupPicture ? (
                      <img src={chat.groupPicture} alt="Group" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#00A884] flex items-center justify-center text-6xl font-semibold text-white">
                        {chat?.name?.charAt(0) || 'G'}
                      </div>
                    );
                  } else {
                    const otherParticipant = chat?.participants?.find((p: any) => p.userId !== user?.id)?.user;
                    return otherParticipant?.profilePicture ? (
                      <img src={otherParticipant.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#00A884] flex items-center justify-center text-6xl font-semibold text-white">
                        {otherParticipant?.name?.charAt(0) || otherParticipant?.phoneNumber?.charAt(0) || chat?.name?.charAt(0) || 'C'}
                      </div>
                    );
                  }
                })()}
                {chats.find(c => c.id === activeChatId)?.isGroup && (
                  <div className="absolute inset-0 bg-black/50 hidden group-hover:flex flex-col items-center justify-center text-white text-sm text-center px-4">
                    CHANGE GROUP ICON
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-normal text-[#E9EDEF] mb-1">{chats.find(c => c.id === activeChatId)?.name}</h2>
              {chats.find(c => c.id === activeChatId)?.isGroup ? (
                <p className="text-sm text-[#8696A0]">Group · {chats.find(c => c.id === activeChatId)?.participants?.length || 0} participants</p>
              ) : (
                <p className="text-sm text-[#8696A0]">{chats.find(c => c.id === activeChatId)?.participants?.find((p: any) => p.userId !== user?.id)?.user?.phoneNumber || 'Contact'}</p>
              )}
            </div>

            {chats.find(c => c.id === activeChatId)?.isGroup ? (
              <>
                <div className="bg-[#111B21] mt-2 py-4">
                  <div className="px-6 mb-4 flex justify-between items-center text-[#8696A0]">
                    <span className="text-sm font-medium">{chats.find(c => c.id === activeChatId)?.participants?.length || 0} participants</span>
                    <Search size={18} />
                  </div>
                  
                  <div 
                    className="flex items-center px-6 py-3 cursor-pointer hover:bg-[#202C33] transition-colors"
                    onClick={() => {
                      setIsCreatingGroup(false);
                      setIsAddingMembers(true);
                      setGroupParticipants([]);
                      setShowContacts(true);
                      loadContacts();
                    }}
                  >
                    <div className="w-10 h-10 bg-[#00A884] rounded-full mr-4 flex items-center justify-center text-white">
                      <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 4l1.4 1.4L7.8 11H20v2H7.8l5.6 5.6L12 20l-8-8 8-8z"></path></svg>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-base text-[#E9EDEF]">Add member</h2>
                    </div>
                  </div>

                  {chats.find(c => c.id === activeChatId)?.participants?.map((p: any) => (
                    <div key={p.userId} className="flex items-center px-6 py-3 hover:bg-[#202C33] transition-colors group">
                      <div className="w-10 h-10 bg-[#00A884] rounded-full mr-4 flex items-center justify-center text-lg font-semibold text-white overflow-hidden">
                        {p.user.profilePicture ? (
                          <img src={p.user.profilePicture} alt={p.user.name} className="w-full h-full object-cover" />
                        ) : (
                          p.user.name?.charAt(0) || p.user.phoneNumber?.charAt(0) || 'U'
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <h2 className="text-base text-[#E9EDEF] truncate">
                            {p.userId === user?.id ? 'You' : p.user.name || p.user.phoneNumber}
                          </h2>
                          {p.userId === chats.find(c => c.id === activeChatId)?.adminId && (
                            <span className="text-[10px] text-[#00A884] border border-[#00A884] rounded px-1 ml-2 shrink-0">Group Admin</span>
                          )}
                        </div>
                        <p className="text-sm text-[#8696A0] truncate">{p.user.about}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Delete Group Button for Admin */}
                {chats.find(c => c.id === activeChatId)?.adminId === user?.id && (
                  <div className="mt-4 px-6 pb-6">
                    <button 
                      onClick={() => {
                        if (window.confirm('Are you sure you want to delete this group for everyone?')) {
                          useChatStore.getState().deleteGroupChat(activeChatId);
                          setShowGroupInfo(false);
                        }
                      }}
                      className="w-full bg-[#111B21] text-[#F15C6D] hover:bg-[#202C33] border border-[#202C33] font-medium py-3 rounded-lg shadow-sm transition-colors flex items-center justify-center space-x-2"
                    >
                      <Trash2 size={20} />
                      <span>Delete Group</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-[#111B21] mt-2 py-4 px-6 shadow-sm">
                <div className="text-[#8696A0] text-sm mb-1">About</div>
                <div className="text-[#E9EDEF] text-base">{chats.find(c => c.id === activeChatId)?.participants?.find((p: any) => p.userId !== user?.id)?.user?.about || 'Hey there! I am using NexusChat.'}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className={`flex-1 flex-col relative bg-[#0B141A] ${activeChatId ? 'flex' : 'hidden md:flex'}`}>
        {/* Chat Background Pattern */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'url(https://static.whatsapp.net/rsrc.php/v3/yl/r/rG_52XoOchq.png)' }}></div>

        {activeChatId ? (
          <>
            {/* Chat Header */}
            <div className="h-16 bg-[#202C33] flex items-center justify-between px-2 md:px-4 z-10 w-full overflow-hidden shrink-0">
              <div 
                className="flex items-center cursor-pointer min-w-0 flex-1"
                onClick={() => {
                  setShowGroupInfo(true);
                }}
              >
                <button onClick={(e) => { e.stopPropagation(); setActiveChat(null); }} className="md:hidden mr-2 md:mr-4 p-2 text-[#AEBAC1] hover:text-white flex-shrink-0">
                  <ArrowLeft size={24} />
                </button>
                <div className="w-10 h-10 bg-[#00A884] rounded-full mr-3 md:mr-4 flex-shrink-0 flex items-center justify-center text-lg font-semibold overflow-hidden">
                  {chats.find(c => c.id === activeChatId)?.groupPicture ? (
                    <img src={chats.find(c => c.id === activeChatId)?.groupPicture!} className="w-full h-full object-cover" />
                  ) : (
                    chats.find(c => c.id === activeChatId)?.name?.charAt(0) || 'C'
                  )}
                </div>
                <div className="min-w-0 flex-1 pr-2">
                  <h2 className="text-base font-normal truncate">{chats.find(c => c.id === activeChatId)?.name}</h2>
                  <p className="text-xs text-[#8696A0] truncate">
                    {(() => {
                      if (activeChatId && typingStatuses[activeChatId]?.isTyping) {
                        return <span className="text-[#00A884] font-medium italic">typing...</span>;
                      }
                      const activeChat = chats.find(c => c.id === activeChatId);
                      if (activeChat && !activeChat.isGroup) {
                        const otherParticipant = activeChat.participants?.find((p: any) => p.userId !== user?.id);
                        if (otherParticipant && onlineUsers[otherParticipant.userId]) {
                          return <span className="text-[#00A884]">Online</span>;
                        }
                      }
                      return 'Tap here for contact info';
                    })()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-4 md:space-x-6 text-[#AEBAC1] flex-shrink-0 mr-2 md:mr-0">
                <button onClick={() => startCall('VIDEO')} className="hover:text-white transition-colors" title="Video Call">
                  <Video size={20} />
                </button>
                <button onClick={() => startCall('AUDIO')} className="hover:text-white transition-colors" title="Voice Call">
                  <Phone size={20} />
                </button>
                {isSearchActive && (
                  <div className="bg-[#202C33] rounded-lg flex items-center px-2 py-1 mr-2 transition-all">
                    <input 
                      type="text" 
                      autoFocus
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      placeholder="Search..." 
                      className="bg-transparent w-full focus:outline-none text-sm placeholder-[#8696A0] text-[#E9EDEF] px-2 w-[120px] md:w-[200px]"
                    />
                    <button onClick={() => { setIsSearchActive(false); setMessageSearchQuery(''); }} className="text-[#8696A0] hover:text-[#E9EDEF]">
                      <X size={16} />
                    </button>
                  </div>
                )}
                {!isSearchActive && (
                  <button onClick={() => setIsSearchActive(true)} className="hover:text-white transition-colors" title="Search">
                    <Search size={20} />
                  </button>
                )}
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
                (() => {
                  const filteredMessages = messageSearchQuery.trim() 
                    ? activeMessages.filter(msg => (msg.content || '').toLowerCase().includes(messageSearchQuery.toLowerCase()))
                    : activeMessages;
                  
                  if (filteredMessages.length === 0) {
                    return (
                      <div className="flex justify-center mt-10">
                        <span className="text-[#8696A0] text-sm bg-[#182229] px-4 py-2 rounded-lg">No messages found.</span>
                      </div>
                    );
                  }

                  return filteredMessages.map((msg, idx) => {
                    const isMine = msg.senderId === 'me' || msg.senderId === user?.id;

                    // Long press (mobile) -> Message Info / Reply
                    const handleLongPressStart = (m: any) => {
                      longPressRef.current = setTimeout(() => {
                        if (m.senderId === user?.id || m.senderId === 'me') setMsgInfoMsg(m);
                        else setReplyingTo(m);
                      }, 600);
                    };
                    const handleLongPressEnd = () => {
                      if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
                    };

                    // Swipe-to-reply handlers (mobile)
                    const handleTouchStart = (e: React.TouchEvent) => {
                      swipeMsgRef.current = { id: msg.id, startX: e.touches[0].clientX, deltaX: 0 };
                    };
                    const handleTouchMove = (e: React.TouchEvent) => {
                      if (!swipeMsgRef.current || swipeMsgRef.current.id !== msg.id) return;
                      const delta = e.touches[0].clientX - swipeMsgRef.current.startX;
                      swipeMsgRef.current.deltaX = delta;
                      const el = e.currentTarget as HTMLElement;
                      if (delta > 0 && delta < 80) el.style.transform = `translateX(${delta * 0.4}px)`;
                    };
                    const handleTouchEnd = (e: React.TouchEvent) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.transform = '';
                      if (swipeMsgRef.current && swipeMsgRef.current.deltaX > 50 && !msg.isDeleted) {
                        setReplyingTo(msg);
                      }
                      swipeMsgRef.current = null;
                    };

                    return (
                      <div 
                      key={msg.id || idx} 
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'} transition-transform duration-100 relative`}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => setHoveredMsgId(null)}
                      onTouchStart={(e) => { handleTouchStart(e); handleLongPressStart(msg); }}
                      onTouchMove={(e) => { handleTouchMove(e); handleLongPressEnd(); }}
                      onTouchEnd={(e) => { handleTouchEnd(e); handleLongPressEnd(); }}
                    >
                      {msg.type === 'CALL_LOG' ? (
                        <div 
                          onClick={() => {
                            try {
                              const log = JSON.parse(msg.content || '{}');
                              if (log.type === 'VIDEO' || log.type === 'AUDIO') {
                                startCall(log.type);
                              }
                            } catch (e) {}
                          }}
                          className={`max-w-[65%] rounded-lg px-3 py-2 text-sm shadow-sm flex items-center space-x-3 relative my-0.5 cursor-pointer hover:opacity-90 transition-opacity ${isMine ? 'bg-[#005C4B] rounded-tr-none' : 'bg-[#202C33] rounded-tl-none'}`}
                        >
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
                        <div className={`max-w-[65%] rounded-lg px-2 py-1.5 text-sm shadow-sm relative group ${isMine ? 'bg-[#005C4B] rounded-tr-none' : 'bg-[#202C33] rounded-tl-none'}`}>
                          
                          {/* Context Menu Icon */}
                          {!msg.isDeleted && hoveredMsgId === msg.id && (
                            <div className={`absolute top-1 ${isMine ? 'left-1' : 'right-1'} z-20`}>
                              <button 
                                onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === msg.id ? null : msg.id); }}
                                className="text-white/60 hover:text-white bg-black/20 rounded-full p-1"
                              >
                                <ChevronDown size={14} />
                              </button>
                              
                              {menuOpenId === msg.id && (
                                <div className={`absolute top-6 ${isMine ? 'left-0' : 'right-0'} bg-[#233138] rounded shadow-lg z-50 py-2 min-w-[120px]`}>
                                  <button onClick={() => { setReplyingTo(msg); setMenuOpenId(null); }} className="w-full text-left px-4 py-2 hover:bg-[#182229] flex items-center gap-2">
                                    <Reply size={16} /> Reply
                                  </button>
                                  {isMine && (
                                    <>
                                      <button onClick={() => { setMsgInfoMsg(msg); setMenuOpenId(null); }} className="w-full text-left px-4 py-2 hover:bg-[#182229] flex items-center gap-2">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg> Info
                                      </button>
                                      <button onClick={() => { deleteMessage(activeChatId, msg.id); setMenuOpenId(null); }} className="w-full text-left px-4 py-2 hover:bg-[#182229] flex items-center gap-2 text-red-400">
                                        <Trash2 size={16} /> Delete
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {msg.isDeleted ? (
                            <div className="flex items-center text-white/50 italic py-1 gap-1">
                              <Ban size={14} /> This message was deleted
                            </div>
                          ) : (
                            <>
                              {msg.replyToId && (
                                <div className="bg-black/20 rounded p-2 mb-1 border-l-4 border-[#00A884] text-xs opacity-80 cursor-pointer">
                                  <div className="text-[#00A884] font-semibold mb-1">
                                    {msg.replyTo?.senderId === user?.id ? 'You' : (
                                      contacts.find(c => c.id === msg.replyTo?.senderId)?.name || 
                                      chats.find(c => c.id === activeChatId)?.participants?.find((p: any) => p.userId === msg.replyTo?.senderId)?.user?.name || 
                                      'Someone'
                                    )}
                                  </div>
                                  <div className="truncate text-white/80">
                                    {msg.replyTo?.isDeleted ? '🚫 This message was deleted' : (msg.replyTo?.content || (msg.replyTo?.type !== 'TEXT' ? msg.replyTo?.type : 'Message'))}
                                  </div>
                                </div>
                              )}

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
                              ) : msg.type === 'AUDIO' && msg.mediaUrl ? (
                                <div className="flex items-center space-x-2 bg-black/10 p-2 rounded mb-1 min-w-[200px]">
                                  <audio controls src={msg.mediaUrl} className="h-8 max-w-[200px]" />
                                </div>
                              ) : msg.type === 'DOCUMENT' && msg.mediaUrl ? (
                                <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center space-x-2 bg-black/20 p-2 rounded mb-1 hover:bg-black/30 transition-colors">
                                  <svg viewBox="0 0 24 24" width="24" height="24" className="text-[#AEBAC1]"><path fill="currentColor" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"></path></svg>
                                  <span className="text-sm truncate max-w-[150px]">Document</span>
                                </a>
                              ) : msg.type === 'LOCATION' && msg.content ? (
                                (() => {
                                  try {
                                    const loc = JSON.parse(msg.content);
                                    return (
                                      <a href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" className="flex flex-col items-center space-y-1 bg-black/20 p-2 rounded mb-1 hover:bg-black/30 transition-colors">
                                        <MapPin size={32} className="text-[#00A884]" />
                                        <span className="text-sm underline text-blue-400">View Location</span>
                                      </a>
                                    );
                                  } catch { return null; }
                                })()
                              ) : null}
                              {msg.type !== 'LOCATION' && msg.content && <span className="break-words">{msg.content}</span>}
                            </>
                          )}
                          
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
                });
              })())}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Area */}
            <div className="bg-[#202C33] flex flex-col z-10 w-full relative">
              
              {replyingTo && (
                <div className="bg-[#202C33] p-2 border-b border-[#2A3942]">
                  <div className="bg-[#2A3942] rounded border-l-4 border-[#00A884] p-2 flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-[#00A884] text-sm font-semibold mb-1">Replying to</div>
                      <div className="text-white/80 text-xs truncate">
                        {replyingTo.content || (replyingTo.type !== 'TEXT' ? replyingTo.type : 'Message')}
                      </div>
                    </div>
                    <button onClick={() => setReplyingTo(null)} className="text-[#8696A0] hover:text-white p-1">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              <div className="min-h-[62px] px-2 md:px-4 py-3 flex items-end space-x-2 md:space-x-4">
                
                {isRecording ? (
                  <div className="flex-1 bg-[#2A3942] rounded-lg flex items-center px-4 py-2 space-x-4">
                    <div className="text-red-500 animate-pulse flex items-center space-x-2">
                      <Mic size={18} />
                      <span className="font-mono text-sm">
                        {Math.floor(recordingDuration / 60).toString().padStart(2, '0')}:
                        {(recordingDuration % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="flex-1 text-[#8696A0] text-sm italic text-center">Recording...</div>
                    <button onClick={cancelRecording} className="text-red-400 hover:text-red-500 p-1">
                      <Trash2 size={20} />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className="flex-1 flex items-center bg-[#2A3942] rounded-lg px-2 md:px-4">
                    <button type="button" className="text-[#8696A0] hover:text-white transition-colors p-2">
                      <Smile size={24} />
                    </button>

                    <input 
                      type="text" 
                      value={messageInput}
                      onChange={(e) => {
                        setMessageInput(e.target.value);
                        if (activeChatId) {
                          sendTypingStatus(activeChatId, true);
                          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                          typingTimeoutRef.current = setTimeout(() => sendTypingStatus(activeChatId, false), 1500);
                        }
                      }}
                      placeholder="Type a message" 
                      className="flex-1 w-full bg-transparent text-[#E9EDEF] py-2 md:py-3 focus:outline-none placeholder-[#8696A0] text-sm md:text-base mx-2"
                    />

                    {messageInput.trim().length === 0 && (
                      <div className="flex space-x-2 md:space-x-3 text-[#8696A0]">
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          onChange={handleFileUpload} 
                          accept="image/*,video/*,application/pdf" 
                        />
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className={`transition-colors p-2 ${isUploading ? 'text-[#00A884] animate-pulse' : 'hover:text-white'}`}
                          disabled={isUploading}
                          title="Attach File"
                        >
                          <Paperclip size={24} />
                        </button>
                        <button 
                          type="button"
                          onClick={handleShareLocation}
                          className="hover:text-white transition-colors p-2"
                          title="Share Location"
                        >
                          <MapPin size={24} />
                        </button>
                      </div>
                    )}
                  </form>
                )}

                <div className="flex items-center mb-1.5 md:mb-2">
                  {messageInput.trim().length > 0 ? (
                    <button 
                      onClick={handleSendMessage}
                      className="text-[#8696A0] hover:text-[#00A884] transition-colors p-1"
                    >
                      <Send size={24} />
                    </button>
                  ) : isRecording ? (
                    <button 
                      onClick={stopRecordingAndSend}
                      className="bg-[#00A884] text-white p-2 rounded-full hover:bg-[#008f6f] transition-colors"
                    >
                      <Send size={20} />
                    </button>
                  ) : (
                    <button 
                      onClick={startRecording}
                      className="text-[#8696A0] hover:text-[#00A884] transition-colors p-1"
                    >
                      <Mic size={24} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-[#0B141A] to-[#111B21] z-10 relative overflow-hidden">
            <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#00A884]/10 via-transparent to-transparent opacity-50 blur-2xl pointer-events-none"></div>
            <div className="max-w-lg text-center z-10 p-8 rounded-3xl bg-[#111B21]/60 backdrop-blur-md border border-[#202C33]/50 shadow-2xl">
              <div className="w-24 h-24 mx-auto bg-gradient-to-tr from-[#00A884] to-[#00d2a0] rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-[#00A884]/20 transform hover:scale-105 transition-transform duration-300">
                <svg viewBox="0 0 24 24" className="w-12 h-12 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <h1 className="text-3xl font-semibold text-[#E9EDEF] mb-3 tracking-tight">NexusChat</h1>
              <p className="text-[#8696A0] text-sm leading-relaxed mb-6">
                Experience seamless, real-time communication.<br/>
                Connect with your friends, groups, and the world instantly.
              </p>
              <div className="inline-flex items-center px-4 py-2 bg-[#202C33] rounded-full text-[#AEBAC1] text-xs font-medium space-x-2">
                <span className="w-2 h-2 bg-[#00A884] rounded-full animate-pulse"></span>
                <span>End-to-End Encrypted</span>
              </div>
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
      {/* Message Info Panel (WhatsApp-style) */}
      {msgInfoMsg && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setMsgInfoMsg(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md bg-[#111B21] rounded-t-2xl p-6 pb-10 shadow-2xl border-t border-[#222D34] animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-[#E9EDEF]">Message Info</h2>
              <button onClick={() => setMsgInfoMsg(null)} className="text-[#8696A0] hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            {/* Message preview */}
            <div className="bg-[#005C4B] rounded-lg px-3 py-2 mb-6 text-sm text-[#E9EDEF] max-w-[85%] ml-auto">
              {msgInfoMsg.isDeleted ? (
                <span className="italic text-white/50">🚫 This message was deleted</span>
              ) : (
                <span className="break-words">{msgInfoMsg.content || msgInfoMsg.type}</span>
              )}
              <div className="text-[10px] text-white/50 text-right mt-1">
                {new Date(msgInfoMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {/* Status rows */}
            <div className="space-y-4">
              {/* Sent */}
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-[#202C33] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 16 15" width="18" height="18" className="text-[#8696A0]"><path fill="currentColor" d="M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.724 7.587a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l3.14 3.007c.174.166.452.155.612-.023l5.82-7.854a.365.365 0 0 0-.063-.51z"/></svg>
                </div>
                <div>
                  <p className="text-[#E9EDEF] text-sm font-medium">Sent</p>
                  <p className="text-[#8696A0] text-xs">
                    {new Date(msgInfoMsg.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' at '}
                    {new Date(msgInfoMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>
              </div>

              {/* Delivered */}
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-[#202C33] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 16 15" width="18" height="18" className={msgInfoMsg.deliveredAt ? 'text-[#8696A0]' : 'text-[#8696A0]/30'}><path fill="currentColor" d="m15.01 3.316-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267c.174.166.452.155.612-.023L15.073 3.826a.365.365 0 0 0-.063-.51z"/><path fill="currentColor" d="m9.98 3.316-.478-.372a.365.365 0 0 0-.51.063L3.636 9.88a.32.32 0 0 1-.484.032L1.35 8.287a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l2.76 2.646c.174.166.452.155.612-.023L9.943 3.826a.365.365 0 0 0-.063-.51z"/></svg>
                </div>
                <div>
                  <p className="text-[#E9EDEF] text-sm font-medium">Delivered</p>
                  <p className="text-[#8696A0] text-xs">
                    {msgInfoMsg.deliveredAt
                      ? `${new Date(msgInfoMsg.deliveredAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date(msgInfoMsg.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                      : 'Not yet delivered'}
                  </p>
                </div>
              </div>

              {/* Read */}
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 rounded-full bg-[#202C33] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 16 15" width="18" height="18" className={msgInfoMsg.readAt ? 'text-[#53bdeb]' : 'text-[#8696A0]/30'}><path fill="currentColor" d="m15.01 3.316-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267c.174.166.452.155.612-.023L15.073 3.826a.365.365 0 0 0-.063-.51z"/><path fill="currentColor" d="m9.98 3.316-.478-.372a.365.365 0 0 0-.51.063L3.636 9.88a.32.32 0 0 1-.484.032L1.35 8.287a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l2.76 2.646c.174.166.452.155.612-.023L9.943 3.826a.365.365 0 0 0-.063-.51z"/></svg>
                </div>
                <div>
                  <p className="text-[#E9EDEF] text-sm font-medium">Read</p>
                  <p className="text-[#8696A0] text-xs">
                    {msgInfoMsg.readAt
                      ? `${new Date(msgInfoMsg.readAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date(msgInfoMsg.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                      : 'Not yet read'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
