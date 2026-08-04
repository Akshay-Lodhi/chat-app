import { apiClient } from '@/lib/apiClient';
import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './useAuthStore';
import { useCallStore } from './useCallStore';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import * as idb from 'idb-keyval';
import toast from 'react-hot-toast';

const idbStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await idb.get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await idb.set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await idb.del(name);
  },
};

export interface Chat {
  id: string;
  name?: string | null;
  isGroup: boolean;
  groupPicture?: string | null;
  disappearingTimer?: number | null;
  participants: any[]; // refine type later
  lastMessage?: any;
  unreadCount?: number;
  adminId?: string | null;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string | null;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'CALL_LOG' | 'LOCATION' | 'STORY_REPLY' | 'POLL' | 'SYSTEM';
  mediaUrl: string | null;
  metadata?: any;
  createdAt: string;
  updatedAt?: string;
  isEdited?: boolean;
  isPinned?: boolean;
  expiresAt?: string;
  status?: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ';
  deliveredAt?: string;
  readAt?: string;
  isDeleted?: boolean; // legacy
  deletedForEveryone?: boolean;
  deletedForUsers?: string[];
  deletedAt?: string;
  replyToId?: string | null;
  replyTo?: any | null;
  reactions?: Record<string, string>;
  tempId?: string;
  isStarred?: boolean;
  isEncrypted?: boolean;
  sender?: any;
}

interface ChatState {
  socket: Socket | null;
  chats: Chat[];
  notificationToast: {
    id: string;
    chatId: string;
    senderName: string;
    senderPfp?: string;
    text: string;
    isGroup: boolean;
    groupName?: string;
    type: string;
  } | null;
  setNotificationToast: (toast: any) => void;
  clearNotificationToast: () => void;
  
  connectSocket: (token: string, userId: string) => void;
  disconnectSocket: () => void;
  setChats: (chats: Chat[]) => void;
  setActiveChat: (chatId: string | null) => void;
  addMessage: (chatId: string, message: Message) => void;
  fetchChats: (token: string) => Promise<void>;
  fetchMessages: (chatId: string, token: string) => Promise<void>;
  fetchCalls: (token: string, page?: number, limit?: number) => Promise<void>;
  clearCallLogs: () => Promise<boolean>;
  clearChatMessages: (chatId: string) => Promise<void>;
  createChat: (contactId: string, token: string) => Promise<string | null>;
  createGroupChat: (name: string, participantIds: string[], groupPicture?: string) => Promise<string | null>;
  addGroupParticipants: (chatId: string, participantIds: string[]) => Promise<void>;
  removeGroupParticipant: (chatId: string, participantId: string) => Promise<void>;
  updateGroupPicture: (chatId: string, pictureUrl: string) => Promise<void>;
  deleteGroupChat: (chatId: string) => Promise<void>;
  markChatAsRead: (chatId: string) => void;
  incrementUnreadCount: (chatId: string) => void;
  sendMessage: (chatId: string, content: string, type?: string, mediaUrl?: string | null, replyToId?: string | null, metadata?: any) => void;
  deleteMessage: (chatId: string, messageId: string, deleteFor?: 'everyone' | 'me') => Promise<boolean>;
  markViewOnceOpened: (chatId: string, messageId: string) => void;
  clearChat: (chatId: string) => Promise<boolean>;
  sendTypingStatus: (chatId: string, isTyping: boolean) => void;
  editMessage: (chatId: string, messageId: string, content: string) => void;
  toggleReaction: (chatId: string, messageId: string, reaction: string) => void;
  togglePinChat: (chatId: string) => Promise<void>;
  togglePinMessage: (chatId: string, messageId: string) => Promise<void>;
  setDisappearingTimer: (chatId: string, timer: number) => Promise<void>;
  scheduleMessage: (chatId: string, content: string, scheduledAt: string, type?: string, mediaUrl?: string | null, replyToId?: string | null) => Promise<boolean>;
  fetchPendingScheduledMessages: (chatId: string) => Promise<any[]>;
  cancelScheduledMessage: (chatId: string, messageId: string) => Promise<boolean>;
  transcribeAudioMessage: (messageId: string) => Promise<string>;
  summarizeChat: (chatId: string) => Promise<{ mainTopic: string; summary: string; keyPoints: string[]; decisions: string[] }>;

  fetchBlockedUsers: () => Promise<void>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  reportUser: (userId: string, reason?: string) => Promise<boolean>;
  
  replyingTo: Message | null;
  setReplyingTo: (msg: Message | null) => void;
  editingMessageId: string | null;
  setEditingMessageId: (id: string | null) => void;
  selectedMessageIds: string[];
  toggleMessageSelection: (messageId: string) => void;
  clearMessageSelection: () => void;
  
  activeChatId: string | null;
  activeTab: 'chats' | 'updates' | 'live' | 'calls';
  setActiveTab: (tab: 'chats' | 'updates' | 'live' | 'calls') => void;
  calls: any[];
  messages: Record<string, Message[]>; // chatId -> messages
  isConnecting: boolean;
  onlineUsers: Record<string, boolean>;
  typingStatuses: Record<string, { isTyping: boolean, timer?: NodeJS.Timeout }>;
  blockedUsers: any[];
  isMessageSearchOpen: boolean;
  setIsMessageSearchOpen: (isOpen: boolean) => void;
  messageForInfo: any | null;
  setMessageForInfo: (message: any | null) => void;
  
  starredMessages: Message[];
  fetchStarredMessages: () => Promise<void>;
  toggleStar: (messageId: string, chatId?: string) => Promise<void>;
}

const pendingMessageFetches = new Map<string, Promise<any>>();
let pendingCallsFetch: Promise<any> | null = null;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      socket: null,
  chats: [],
  activeChatId: null,
  activeTab: 'chats',
  setActiveTab: (tab) => set({ activeTab: tab }),
  replyingTo: null,
  setReplyingTo: (msg) => set({ replyingTo: msg }),
  editingMessageId: null,
  setEditingMessageId: (id) => set({ editingMessageId: id }),
  calls: [],
  messages: {},
  isConnecting: false,
  onlineUsers: {},
  typingStatuses: {},
  blockedUsers: [],
  isMessageSearchOpen: false,
  setIsMessageSearchOpen: (isOpen) => set({ isMessageSearchOpen: isOpen }),
  messageForInfo: null,
  setMessageForInfo: (message) => set({ messageForInfo: message }),
  
  starredMessages: [],
  fetchStarredMessages: async () => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/messages/starred`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        set({ starredMessages: data });
      } else {
        console.error('Expected array of starred messages, got:', data);
      }
    } catch (err) {
      console.error('Error fetching starred messages', err);
    }
  },
  
  toggleStar: async (messageId, chatId) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/messages/star`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
        credentials: 'include'
      });
      const data = await res.json();
      const { isStarred } = data;
      
      // Update in active chat messages if we have the chatId
      if (chatId) {
        set(state => {
          const chatMsgs = state.messages[chatId] || [];
          const idx = chatMsgs.findIndex(m => m.id === messageId);
          if (idx !== -1) {
            const newMsgs = [...chatMsgs];
            newMsgs[idx] = { ...newMsgs[idx], isStarred };
            return {
              messages: {
                ...state.messages,
                [chatId]: newMsgs
              }
            };
          }
          return state;
        });
      }
      
      // Also refresh the starred messages list
      get().fetchStarredMessages();
    } catch (err) {
      console.error('Error toggling star', err);
    }
  },

  togglePinChat: async (chatId) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/pin`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const { isPinned } = await res.json();
        
        // Update local chat list
        set(state => {
          const chats = state.chats.map(chat => {
            if (chat.id === chatId) {
              const myParticipant = chat.participants.find((p: any) => p.userId === useAuthStore.getState().user?.id);
              if (myParticipant) {
                myParticipant.isPinned = isPinned;
              }
              return { ...chat }; // Create new reference to trigger re-render
            }
            return chat;
          });
          return { chats };
        });
      }
    } catch (err) {
      console.error('Error pinning chat', err);
    }
  },

  togglePinMessage: async (chatId, messageId) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/messages/${messageId}/pin`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Error pinning message', err);
    }
  },

  setDisappearingTimer: async (chatId: string, timer: number) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/disappearing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timer }),
        credentials: 'include'
      });
      if (res.ok) {
        set(state => {
          const chats = state.chats.map(c => c.id === chatId ? { ...c, disappearingTimer: timer } : c);
          return { chats };
        });
      }
    } catch (err) {
      console.error('Error setting disappearing timer', err);
    }
  },

  scheduleMessage: async (chatId, content, scheduledAt, type = 'TEXT', mediaUrl = null, replyToId = null) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, scheduledAt, type, mediaUrl, replyToId }),
        credentials: 'include'
      });
      return res.ok;
    } catch (err) {
      console.error('Error scheduling message', err);
      return false;
    }
  },

  fetchPendingScheduledMessages: async (chatId) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/scheduled`, {
        credentials: 'include'
      });
      if (res.ok) {
        return await res.json();
      }
      return [];
    } catch (err) {
      console.error('Error fetching scheduled messages', err);
      return [];
    }
  },

  cancelScheduledMessage: async (chatId, messageId) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/scheduled/${messageId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      return res.ok;
    } catch (err) {
      console.error('Error canceling scheduled message', err);
      return false;
    }
  },

  transcribeAudioMessage: async (messageId) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/messages/${messageId}/transcribe`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        set(state => {
          const newMessages = { ...state.messages };
          for (const cid in newMessages) {
            const idx = newMessages[cid].findIndex(m => m.id === messageId);
            if (idx !== -1) {
              newMessages[cid] = [...newMessages[cid]];
              const currentMeta = newMessages[cid][idx].metadata || {};
              newMessages[cid][idx] = {
                ...newMessages[cid][idx],
                metadata: { ...currentMeta, transcription: data.transcription }
              };
              break;
            }
          }
          return { messages: newMessages };
        });
        return data.transcription;
      }
      throw new Error('Failed to transcribe audio');
    } catch (err: any) {
      console.error('Error transcribing audio message', err);
      throw err;
    }
  },

  summarizeChat: async (chatId) => {
    const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/summarize`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) {
      throw new Error('Failed to generate AI summary');
    }
    return await res.json();
  },
  
  notificationToast: null,
  setNotificationToast: (toast) => set({ notificationToast: toast }),
  clearNotificationToast: () => set({ notificationToast: null }),
  
  selectedMessageIds: [],
  toggleMessageSelection: (messageId) => {
    set((state) => {
      const isSelected = state.selectedMessageIds.includes(messageId);
      if (isSelected) {
        return { selectedMessageIds: state.selectedMessageIds.filter(id => id !== messageId) };
      } else {
        return { selectedMessageIds: [...state.selectedMessageIds, messageId] };
      }
    });
  },
  clearMessageSelection: () => set({ selectedMessageIds: [] }),

  sendTypingStatus: (chatId: string, isTyping: boolean) => {
    get().socket?.emit('typing', { chatId, isTyping });
  },

  editMessage: (chatId, messageId, content) => {
    const { socket } = get();
    if (socket && socket.connected) {
      const currentUserId = require('@/store/useAuthStore').useAuthStore.getState().user?.id || 'me';
      let finalContent = content;
      
      const currentPriv = require('@/store/useAuthStore').useAuthStore.getState().privateKey;
      const chat = get().chats.find(c => c.id === chatId);
      const participants = chat?.participants || [];
      
      if (currentPriv && content) {
        const pKeys = participants.map(p => ({ userId: p.user?.id || p.userId, publicKey: p.user?.publicKey || '' }));
        const others = pKeys.filter(p => p.userId !== currentUserId);
        const canEncrypt = others.length > 0 && others.every(p => p.publicKey);
        
        if (canEncrypt) {
          const { createE2EEPayload } = require('@/lib/encryption');
          const encryptFor = [...others, { userId: currentUserId, publicKey: require('@/store/useAuthStore').useAuthStore.getState().publicKey }];
          const payload = createE2EEPayload(content, encryptFor, currentPriv);
          finalContent = JSON.stringify(payload);
        }
      }

      // Optimistically update the UI to show the new content
      set((state) => {
        const newMessages = { ...state.messages };
        if (newMessages[chatId]) {
          newMessages[chatId] = newMessages[chatId].map(msg => 
            msg.id === messageId ? { ...msg, content, isEdited: true } : msg
          );
        }
        return { messages: newMessages };
      });

      socket.emit('edit-message', {
        messageId,
        content: finalContent,
        chatId
      });
    }
  },

  connectSocket: (token: string, userId: string) => {
    const existingSocket = get().socket;
    if (existingSocket || get().isConnecting) return;
    
    set({ isConnecting: true });
    
    const socket = io(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/chat`, {
      withCredentials: true,
    });

    set({ socket });

    socket.on('connect', () => {
      set({ isConnecting: false });
    });

    socket.on('initial-online-users', ({ onlineUserIds }: { onlineUserIds: string[] }) => {
      const map: Record<string, boolean> = {};
      onlineUserIds.forEach(id => { map[id] = true; });
      set({ onlineUsers: map });
    });

    socket.on('user-status-changed', ({ userId, isOnline }) => {
      set((state) => ({
        onlineUsers: { ...state.onlineUsers, [userId]: isOnline }
      }));
    });

    socket.on('typing', ({ chatId, userId: typingUserId, isTyping }) => {
      const authUser = useAuthStore.getState().user;
      if (authUser && typingUserId === authUser.id) return;

      set((state) => {
        const currentTimer = state.typingStatuses[chatId]?.timer;
        if (currentTimer) clearTimeout(currentTimer);
        
        let newTimer;
        if (isTyping) {
          newTimer = setTimeout(() => {
            set((s) => ({
              typingStatuses: {
                ...s.typingStatuses,
                [chatId]: { isTyping: false }
              }
            }));
          }, 3500);
        }
        
        return {
          typingStatuses: {
            ...state.typingStatuses,
            [chatId]: { isTyping, timer: newTimer }
          }
        };
      });
    });

    socket.on('receive-message', (message: Message) => {
      if (!message.isEncrypted && message.type === 'TEXT' && typeof message.content === 'string' && message.content.startsWith('{"isEncrypted":true')) {
        message.isEncrypted = true;
      }
      
      // E2EE Decryption
      if (message.isEncrypted && message.content && message.type === 'TEXT') {
        try {
          const authState = require('@/store/useAuthStore').useAuthStore.getState();
          const myPriv = authState.privateKey;
          const myUserId = authState.user?.id;
          if (myPriv && myUserId) {
            const payload = JSON.parse(message.content);
            const { decryptE2EEPayload } = require('@/lib/encryption');
            const senderPub = message.sender?.publicKey;
            
            if (senderPub) {
              const decrypted = decryptE2EEPayload(payload, myUserId, myPriv, senderPub);
              if (decrypted) {
                message.content = decrypted;
              } else {
                message.content = "🔒 [Message could not be decrypted]";
              }
            } else {
               message.content = "🔒 [Encrypted Message - Unknown Sender Key]";
            }
          } else {
            message.content = "🔒 [Encrypted Message - Keys not ready]";
          }
        } catch (e) {
          console.error("E2EE Decryption error", e);
        }
      }

      const currentUserId = useAuthStore.getState().user?.id;
      const chatMsgs = get().messages[message.chatId] || [];
      const isDuplicate = chatMsgs.some(m => m.id === message.id || (m.tempId && m.tempId === message.tempId));

      // Skip normal sent messages if they are already added optimistically by the sender
      if (message.senderId === currentUserId && message.type !== 'CALL_LOG' && isDuplicate) {
        return;
      }
      
      get().addMessage(message.chatId, message);

      if (!isDuplicate && message.senderId !== currentUserId) {
        const isCurrentChatActive = get().activeChatId === message.chatId && get().activeTab === 'chats';
        if (isCurrentChatActive) {
          socket.emit('message-read', { messageId: message.id, chatId: message.chatId });
        } else {
          socket.emit('message-delivered', { messageId: message.id, chatId: message.chatId });
          get().incrementUnreadCount(message.chatId);

          // Trigger in-app popup notification toast
          const chat = get().chats.find(c => c.id === message.chatId);
          const sender = chat?.participants?.find((p: any) => p.userId === message.senderId)?.user;
          const senderName = sender?.name || sender?.phoneNumber || 'Contact User';
          const senderPfp = sender?.profilePicture;

          set({
            notificationToast: {
              id: message.id,
              chatId: message.chatId,
              senderName,
              senderPfp,
              text: message.content || '',
              isGroup: chat?.isGroup || false,
              groupName: chat?.name || 'Group',
              type: message.type
            }
          });
        }
      }
    });

    socket.on('message-updated', (updatedMessage: Message) => {
      set((state) => {
        const chatId = updatedMessage.chatId;
        if (!state.messages[chatId]) return state;

        const newMessages = [...state.messages[chatId]];
        const idx = newMessages.findIndex(m => m.id === updatedMessage.id);
        if (idx !== -1) {
          newMessages[idx] = updatedMessage;
          return {
            messages: {
              ...state.messages,
              [chatId]: newMessages
            }
          };
        }
        return state;
      });
    });

    socket.on('message-pinned', ({ messageId, chatId, isPinned }) => {
      set((state) => {
        if (!state.messages[chatId]) return state;

        const newMessages = [...state.messages[chatId]];
        const idx = newMessages.findIndex(m => m.id === messageId);
        if (idx !== -1) {
          newMessages[idx] = { ...newMessages[idx], isPinned };
          return {
            messages: {
              ...state.messages,
              [chatId]: newMessages
            }
          };
        }
        return state;
      });
    });

    socket.on('message-deleted', ({ messageId, messageIds, chatId, deleteFor }: { messageId: string; messageIds?: string[]; chatId: string; deleteFor: 'everyone' | 'me' }) => {
      const ids = messageIds && messageIds.length > 0 ? messageIds : [messageId];
      const currentUserId = useAuthStore.getState().user?.id;

      set((state) => {
        if (!state.messages[chatId]) return state;

        let newMessages = state.messages[chatId];
        if (deleteFor === 'me') {
          // Remove from local list if deleted for me
          newMessages = newMessages.filter(msg => !ids.includes(msg.id));
        } else {
          // Mark deleted for everyone
          newMessages = newMessages.map(msg => {
            if (ids.includes(msg.id)) {
              return {
                ...msg,
                deletedForEveryone: true,
                content: null,
                mediaUrl: null,
                deletedAt: new Date().toISOString()
              };
            }
            return msg;
          });
        }

        return {
          messages: {
            ...state.messages,
            [chatId]: newMessages
          }
        };
      });
    });

    socket.on('user-updated', ({ userId, publicKey }: { userId: string, publicKey: string }) => {
      set((state) => {
        const newChats = state.chats.map(chat => {
          let updated = false;
          const newParticipants = chat.participants.map(p => {
            if (p.userId === userId) {
              updated = true;
              return {
                ...p,
                user: {
                  ...(p.user || {}),
                  publicKey: publicKey
                }
              };
            }
            return p;
          });
          if (updated) {
            return { ...chat, participants: newParticipants };
          }
          return chat;
        });
        return { chats: newChats };
      });
    });

    socket.on('active-call-update', (data: { chatId: string; activeCount: number; callType?: 'AUDIO' | 'VIDEO' }) => {
      if (data?.chatId) {
        useCallStore.getState().setActiveCallInfo(
          data.chatId,
          data.activeCount > 0 ? { chatId: data.chatId, activeCount: data.activeCount, callType: data.callType || 'VIDEO' } : null
        );
      }
    });

    socket.on('disappearing-timer-updated', ({ chatId, disappearingTimer, systemMessage }) => {
      set((state) => {
        const chats = state.chats.map(chat => {
          if (chat.id === chatId) {
            return { ...chat, disappearingTimer };
          }
          return chat;
        });

        const currentMsgs = state.messages[chatId] || [];
        const newMsgs = systemMessage ? [...currentMsgs, systemMessage] : currentMsgs;

        return {
          chats,
          messages: {
            ...state.messages,
            [chatId]: newMsgs
          }
        };
      });
    });

    socket.on('message-status-update', ({ messageId, status, chatId, time }) => {
      set((state) => {
        const newMessages = { ...state.messages };
        if (chatId && newMessages[chatId]) {
          const idx = newMessages[chatId].findIndex(m => m.id === messageId);
          if (idx !== -1) {
            newMessages[chatId] = [...newMessages[chatId]];
            newMessages[chatId][idx] = { 
              ...newMessages[chatId][idx], 
              status,
              ...(status === 'DELIVERED' && time ? { deliveredAt: time } : {}),
              ...(status === 'READ' && time ? { readAt: time, deliveredAt: newMessages[chatId][idx].deliveredAt || time } : {})
            };
          }
        } else {
          for (const cid in newMessages) {
            const msgs = newMessages[cid];
            const idx = msgs.findIndex(m => m.id === messageId);
            if (idx !== -1) {
              chatId = cid;
              newMessages[cid] = [...msgs];
              newMessages[cid][idx] = { 
                ...msgs[idx], 
                status,
                ...(status === 'DELIVERED' && time ? { deliveredAt: time } : {}),
                ...(status === 'READ' && time ? { readAt: time, deliveredAt: msgs[idx].deliveredAt || time } : {})
              };
              break;
            }
          }
        }
        
        let newChats = state.chats;
        if (chatId) {
          const chatIdx = newChats.findIndex(c => c.id === chatId);
          if (chatIdx !== -1 && newChats[chatIdx].lastMessage?.id === messageId) {
            newChats = [...newChats];
            newChats[chatIdx] = {
              ...newChats[chatIdx],
              lastMessage: {
                ...newChats[chatIdx].lastMessage,
                status
              }
            };
          }
        }
        
        return { messages: newMessages, chats: newChats };
      });
    });

    socket.on('message-deleted', ({ messageId, chatId, deleteFor, deletedAt }) => {
      set((state) => {
        const newMessages = { ...state.messages };
        if (newMessages[chatId]) {
          newMessages[chatId] = newMessages[chatId].map(msg => 
            msg.id === messageId 
              ? { 
                  ...msg, 
                  ...(deleteFor === 'everyone' ? { deletedForEveryone: true, deletedAt, content: null, mediaUrl: null } : {})
                } 
              : msg
          );
        }
        return { messages: newMessages };
      });
    });

    socket.on('chat-cleared', ({ chatId }) => {
      set(state => ({
        messages: { ...state.messages, [chatId]: [] },
        chats: state.chats.map(c => c.id === chatId ? { ...c, lastMessage: undefined } : c)
      }));
    });

    socket.on('chat-created', (chat: Chat) => {
      set((state) => {
        if (state.chats.some(c => c.id === chat.id)) return state;
        return { chats: [chat, ...state.chats] };
      });
    });

    socket.on('chat-updated', (chat: Chat) => {
      set((state) => ({
        chats: state.chats.map(c => c.id === chat.id ? chat : c)
      }));
    });

    socket.on('chat-deleted', ({ chatId }) => {
      set(state => {
        const activeChatId = state.activeChatId === chatId ? null : state.activeChatId;
        return {
          chats: state.chats.filter(c => c.id !== chatId),
          activeChatId
        };
      });
    });

    socket.on('message-reaction-update', ({ messageId, chatId, reactions }) => {
      set((state) => {
        const newMessages = { ...state.messages };
        if (newMessages[chatId]) {
          newMessages[chatId] = newMessages[chatId].map(msg => 
            msg.id === messageId ? { ...msg, reactions } : msg
          );
        }
        return { messages: newMessages };
      });
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },

  toggleReaction: (chatId: string, messageId: string, reaction: string) => {
    const currentUserId = require('@/store/useAuthStore').useAuthStore.getState().user?.id;
    if (currentUserId) {
      set((state) => {
        const newMessages = { ...state.messages };
        if (newMessages[chatId]) {
          newMessages[chatId] = newMessages[chatId].map(msg => {
            if (msg.id === messageId) {
              const reactions = { ...(msg.reactions || {}) };
              if (reactions[currentUserId] === reaction) {
                delete reactions[currentUserId];
              } else {
                reactions[currentUserId] = reaction;
              }
              return { ...msg, reactions };
            }
            return msg;
          });
        }
        return { messages: newMessages };
      });
    }

    get().socket?.emit('message-reaction', { chatId, messageId, reaction });
  },

  setChats: (chats) => set({ chats }),
  
  fetchChats: async (token: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats`, {
        credentials: 'include'
      });
      if (res.ok) {
        let chats = await res.json();
        
        // Try to decrypt the latest messages for sidebar preview
        try {
          const authState = require('@/store/useAuthStore').useAuthStore.getState();
          const myPriv = authState.privateKey;
          const myUserId = authState.user?.id;
          
          if (myPriv && myUserId) {
            const { decryptE2EEPayload } = require('@/lib/encryption');
            chats = chats.map((c: any) => {
              if (c.messages && c.messages.length > 0) {
                const m = c.messages[0];
                
                if (!m.isEncrypted && m.type === 'TEXT' && typeof m.content === 'string' && m.content.startsWith('{"isEncrypted"')) {
                  m.isEncrypted = true;
                }
                
                if (m.isEncrypted && m.content && m.type === 'TEXT') {
                  const senderPub = m.sender?.publicKey || c.participants?.find((p: any) => p.userId === m.senderId)?.user?.publicKey;
                  if (senderPub) {
                    try {
                      const payload = JSON.parse(m.content);
                      const decrypted = decryptE2EEPayload(payload, myUserId, myPriv, senderPub);
                      if (decrypted) m.content = decrypted;
                      else m.content = "🔒 [Message could not be decrypted]";
                    } catch (e) {
                       m.content = "🔒 [Message corrupted]";
                    }
                  } else {
                     m.content = "🔒 [Encrypted Message - Unknown Sender Key]";
                  }
                } else if (m.isEncrypted) {
                  m.content = "🔒 [Encrypted Message - Keys not ready]";
                }
              }
              return c;
            });
          }
        } catch (e) {
           console.error("Chats preview E2EE Decryption error", e);
        }

        set((state) => {
          const newOnlineUsers = { ...state.onlineUsers };
          chats.forEach((c: any) => {
            c.participants?.forEach((p: any) => {
              if (p.user?.isOnline) {
                newOnlineUsers[p.userId] = true;
              } else if (p.user) {
                newOnlineUsers[p.userId] = false;
              }
            });
          });
          return { chats, onlineUsers: newOnlineUsers };
        });
      }
    } catch (err) {
      console.error('Error fetching chats:', err);
    }
  },

  fetchMessages: async (chatId: string, token: string) => {
    if (pendingMessageFetches.has(chatId)) {
      return pendingMessageFetches.get(chatId);
    }

    const fetchPromise = (async () => {
      try {
        const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/messages`, {
          credentials: 'include'
        });
        if (res.ok) {
          let msgs = await res.json();
          
          // E2EE Decryption Pass
          try {
            const authState = require('@/store/useAuthStore').useAuthStore.getState();
            const myPriv = authState.privateKey;
            const myUserId = authState.user?.id;
            
            const { decryptE2EEPayload } = require('@/lib/encryption');
            msgs = msgs.map((m: any) => {
              if (!m.isEncrypted && m.type === 'TEXT' && typeof m.content === 'string' && m.content.startsWith('{"isEncrypted":true')) {
                m.isEncrypted = true;
              }

              if (m.isEncrypted && m.content && m.type === 'TEXT') {
                if (myPriv && myUserId) {
                  const senderPub = m.sender?.publicKey;
                  if (senderPub) {
                    try {
                      const payload = JSON.parse(m.content);
                      const decrypted = decryptE2EEPayload(payload, myUserId, myPriv, senderPub);
                      if (decrypted) m.content = decrypted;
                      else m.content = "🔒 [Message could not be decrypted]";
                    } catch (e) {
                       m.content = "🔒 [Message corrupted]";
                    }
                  } else {
                     m.content = "🔒 [Encrypted Message - Unknown Sender Key]";
                  }
                } else {
                  m.content = "🔒 [Encrypted Message - Keys not ready]";
                }
              }
              return m;
            });
          } catch (e) {
             console.error("Bulk E2EE Decryption error", e);
          }

          set((state) => ({
            messages: {
              ...state.messages,
              [chatId]: msgs
            }
          }));
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        pendingMessageFetches.delete(chatId);
      }
    })();

    pendingMessageFetches.set(chatId, fetchPromise);
    return fetchPromise;
  },

  fetchCalls: async (token: string, page = 1, limit = 30) => {
    if (pendingCallsFetch) {
      return pendingCallsFetch;
    }

    pendingCallsFetch = (async () => {
      try {
        const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
        const res = await apiClient(`${serverUrl}/api/chats/calls?page=${page}&limit=${limit}`, {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          set({ calls: data.calls || [] });
        }
      } catch (err) {
        console.error('Error fetching calls:', err);
      } finally {
        pendingCallsFetch = null;
      }
    })();

    return pendingCallsFetch;
  },

  clearCallLogs: async () => {
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      const res = await apiClient(`${serverUrl}/api/chats/calls`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        const currentMessages = get().messages;
        const updatedMessages: Record<string, Message[]> = {};
        Object.entries(currentMessages).forEach(([chatId, msgList]) => {
          updatedMessages[chatId] = msgList.filter(m => m.type !== 'CALL_LOG');
        });

        set({ calls: [], messages: updatedMessages });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error clearing call logs:', err);
      return false;
    }
  },

  clearChatMessages: async (chatId: string) => {
    // Implementation for clearing local messages if needed
  },

  createChat: async (contactId: string, token: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ contactId })
      });
      if (res.ok) {
        const newChat = await res.json();
        // Insert new chat at top or update if exists
        set((state) => {
          const exists = state.chats.find(c => c.id === newChat.id);
          if (exists) return state; // handled active switch
          return { chats: [newChat, ...state.chats] };
        });
        return newChat.id;
      }
    } catch (err) {
      console.error('Error creating chat:', err);
    }
    return null;
  },

  createGroupChat: async (name: string, participantIds: string[], groupPicture?: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, participantIds, groupPicture })
      });
      if (res.ok) {
        const newChat = await res.json();
        set((state) => ({ chats: [newChat, ...state.chats] }));
        return newChat.id;
      }
    } catch (err) {
      console.error(err);
    }
    return null;
  },

  addGroupParticipants: async (chatId: string, participantIds: string[]) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ participantIds })
      });
      if (res.ok) {
        const updatedChat = await res.json();
        set(state => ({
          chats: state.chats.map(c => c.id === chatId ? updatedChat : c)
        }));
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add participants');
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to add participants');
    }
  },

  removeGroupParticipant: async (chatId: string, participantId: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/participants/${participantId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        const updatedChat = await res.json();
        set(state => ({
          chats: state.chats.map(c => c.id === chatId ? updatedChat : c)
        }));
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to remove participant');
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to remove participant');
    }
  },

  updateGroupPicture: async (chatId: string, pictureUrl: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/picture`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupPicture: pictureUrl }),
        credentials: 'include'
      });
      if (res.ok) {
        const updatedChat = await res.json();
        set(state => ({
          chats: state.chats.map(c => c.id === chatId ? updatedChat : c)
        }));
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update group picture');
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to update group picture');
    }
  },
  
  deleteGroupChat: async (chatId: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        set((state) => {
          const newChats = state.chats.filter(c => c.id !== chatId);
          return {
            chats: newChats,
            activeChatId: state.activeChatId === chatId ? null : state.activeChatId
          };
        });
      }
    } catch (err) {
      console.error('Error deleting group chat:', err);
    }
  },

  markChatAsRead: (chatId) => {
    const { socket, messages } = get();
    if (socket && socket.connected) {
      socket.emit('chat-read', { chatId });
      
      // Optimistic local update
      set((state) => {
        const chatMsgs = state.messages[chatId];
        
        return {
          chats: state.chats.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c),
          messages: chatMsgs ? {
            ...state.messages,
            [chatId]: chatMsgs.map(m => (m.status !== 'READ' ? { ...m, status: 'READ' } : m))
          } : state.messages
        };
      });
    }
  },

  incrementUnreadCount: (chatId) => {
    set((state) => ({
      chats: state.chats.map(c => c.id === chatId ? { ...c, unreadCount: (c.unreadCount || 0) + 1 } : c)
    }));
  },

  setActiveChat: (chatId) => {
    set({ activeChatId: chatId });
    const { socket } = get();
    if (socket && socket.connected && chatId) {
      socket.emit('join-room', chatId);
      get().markChatAsRead(chatId);
    }
  },
  
  addMessage: (chatId, message) => set((state) => {
    // Also update the chat's last message so the sidebar updates instantly
    const newChats = state.chats.map(chat => {
      if (chat.id === chatId) {
        return {
          ...chat,
          lastMessage: message
        };
      }
      return chat;
    });
    
    // Move the updated chat to the top
    const chatIndex = newChats.findIndex(c => c.id === chatId);
    if (chatIndex > 0) {
      const chat = newChats.splice(chatIndex, 1)[0];
      newChats.unshift(chat);
    }

    const currentMsgs = state.messages[chatId] || [];
    const exists = currentMsgs.some(m => 
      m.id === message.id || 
      (message.tempId && (m.tempId === message.tempId || m.id === message.tempId))
    );

    const updatedMsgs = exists 
      ? currentMsgs.map(m => (m.id === message.id || (message.tempId && (m.tempId === message.tempId || m.id === message.tempId))) ? { ...m, ...message } : m)
      : [...currentMsgs, message];

    return {
      chats: newChats,
      messages: {
        ...state.messages,
        [chatId]: updatedMsgs
      }
    };
  }),

  sendMessage: (chatId, content, type = 'TEXT', mediaUrl = null, replyToId = null, metadata = null) => {
    const { socket } = get();
    if (socket && socket.connected) {
      // Optimistic update
      let replyToObj = null;
      if (replyToId) {
        const msgs = get().messages[chatId] || [];
        replyToObj = msgs.find(m => m.id === replyToId) || null;
      }

      const tempId = `temp_${Date.now()}`;
      const currentUserId = require('@/store/useAuthStore').useAuthStore.getState().user?.id || 'me';
      let finalContent = content;
      let isEncrypted = false;
      
      const currentPriv = require('@/store/useAuthStore').useAuthStore.getState().privateKey;
      const chat = get().chats.find(c => c.id === chatId);
      const participants = chat?.participants || [];
      
      if (currentPriv && type === 'TEXT' && content) {
        const pKeys = participants.map(p => ({ userId: p.user?.id || p.userId, publicKey: p.user?.publicKey || '' }));
        // Only encrypt if ALL other participants have a public key
        const others = pKeys.filter(p => p.userId !== currentUserId);
        const canEncrypt = others.length > 0 && others.every(p => p.publicKey);
        const isAiMentioned = Boolean(content && /@(ai|nexusai)\b/i.test(content));
        
        if (canEncrypt && !isAiMentioned) {
          const { createE2EEPayload } = require('@/lib/encryption');
          // Add ourselves to the list so we can decrypt our own messages on other devices if keys sync
          const encryptFor = [...others, { userId: currentUserId, publicKey: require('@/store/useAuthStore').useAuthStore.getState().publicKey }];
          const payload = createE2EEPayload(content, encryptFor, currentPriv);
          finalContent = JSON.stringify(payload);
          isEncrypted = true;
        }
      }

      const newMessage: Message = {
        id: tempId,
        tempId: tempId,
        chatId,
        senderId: currentUserId,
        content: content, // UI shows plaintext immediately
        type: type as any,
        mediaUrl: mediaUrl,
        replyToId,
        replyTo: replyToObj,
        createdAt: new Date().toISOString(),
        status: 'PENDING',
        metadata,
        isEncrypted
      };
      
      get().addMessage(chatId, newMessage);
      
      socket.emit('send-message', {
        chatId,
        content: finalContent, // Sending ciphertext to server
        type,
        mediaUrl,
        replyToId,
        tempId,
        metadata,
        isEncrypted
      }, (response: any) => {
        if (response && response.message) {
          const updatedMsg = { ...response.message, tempId: tempId };
          
          // CRITICAL FIX: The server sends back the encrypted ciphertext in `response.message.content`.
          // We must NOT overwrite our local plaintext `content` with the ciphertext, otherwise the UI shows JSON.
          if (updatedMsg.isEncrypted && updatedMsg.type === 'TEXT') {
            updatedMsg.content = content; 
          }

          set((state) => ({
            messages: {
              ...state.messages,
              [chatId]: (state.messages[chatId] || []).map(m => 
                (m.id === tempId || m.tempId === tempId || m.id === response.message.id) ? updatedMsg : m
              )
            }
          }));
        }
      });
    }
  },

  fetchBlockedUsers: async () => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/blocked`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        set({ blockedUsers: data });
      }
    } catch (err) {
      console.error('Error fetching blocked users:', err);
    }
  },

  blockUser: async (userId: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/block/${userId}`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        await get().fetchBlockedUsers();
        return true;
      }
    } catch (err) {
      console.error('Error blocking user:', err);
    }
    return false;
  },

  unblockUser: async (userId: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/block/${userId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        await get().fetchBlockedUsers();
        return true;
      }
    } catch (err) {
      console.error('Error unblocking user:', err);
    }
    return false;
  },

  reportUser: async (userId: string, reason?: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/report/${userId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      return res.ok;
    } catch (err) {
      console.error('Error reporting user:', err);
      return false;
    }
  },

  markViewOnceOpened: (chatId: string, messageId: string) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('view-once-opened', { chatId, messageId });
    }
  },

  deleteMessage: async (chatId: string, messageId: string, deleteFor: 'everyone' | 'me' = 'everyone') => {
    const isBulk = messageId.includes(',');
    const messageIds = isBulk ? messageId.split(',') : [messageId];
    
    // Optimistic update
    const currentUserId = require('@/store/useAuthStore').useAuthStore.getState().user?.id;
    set(state => {
      const newMessages = { ...state.messages };
      if (newMessages[chatId]) {
        if (deleteFor === 'me') {
          newMessages[chatId] = newMessages[chatId].map(msg => 
            messageIds.includes(msg.id) 
              ? { 
                  ...msg, 
                  deletedForUsers: [...(msg.deletedForUsers || []), currentUserId]
                }
              : msg
          );
        } else {
          newMessages[chatId] = newMessages[chatId].map(msg => 
            messageIds.includes(msg.id) 
              ? { 
                  ...msg, 
                  deletedForEveryone: true,
                  content: null,
                  mediaUrl: null,
                  deletedAt: new Date().toISOString()
                }
              : msg
          );
        }
      }
      return { messages: newMessages, selectedMessageIds: [] };
    });

    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ deleteFor })
      });
      
      return res.ok;
    } catch (err) {
      console.error('Error deleting message:', err);
      // Revert optimistic update here if needed
      return false;
    }
  },

  clearChat: async (chatId: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/messages`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (res.ok) {
        set(state => ({
          messages: { ...state.messages, [chatId]: [] },
          chats: state.chats.map(c => c.id === chatId ? { ...c, lastMessage: undefined } : c)
        }));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error clearing chat:', err);
      return false;
    }
  }
}), {
  name: 'nexus-chat-storage',
  storage: createJSONStorage(() => idbStorage),
  partialize: (state) => ({
    chats: state.chats,
    messages: state.messages,
    calls: state.calls,
    starredMessages: state.starredMessages
  }),
}));
