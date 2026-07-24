import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './useAuthStore';

interface Chat {
  id: string;
  name?: string | null;
  isGroup: boolean;
  groupPicture?: string | null;
  participants: any[]; // refine type later
  lastMessage?: any;
  unreadCount?: number;
  adminId?: string | null;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string | null;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'CALL_LOG' | 'LOCATION';
  mediaUrl: string | null;
  createdAt: string;
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
}

interface ChatState {
  socket: Socket | null;
  chats: Chat[];
  activeChatId: string | null;
  messages: Record<string, Message[]>; // chatId -> messages
  isConnecting: boolean;
  onlineUsers: Record<string, boolean>;
  typingStatuses: Record<string, { isTyping: boolean, timer?: NodeJS.Timeout }>;
  blockedUsers: any[];
  activeTab: 'chats' | 'live' | 'calls';
  setActiveTab: (tab: 'chats' | 'live' | 'calls') => void;
  calls: any[];
  isMessageSearchOpen: boolean;
  setIsMessageSearchOpen: (isOpen: boolean) => void;
  messageForInfo: any | null;
  setMessageForInfo: (message: any | null) => void;
  
  connectSocket: (token: string, userId: string) => void;
  disconnectSocket: () => void;
  setChats: (chats: Chat[]) => void;
  setActiveChat: (chatId: string | null) => void;
  addMessage: (chatId: string, message: Message) => void;
  fetchChats: (token: string) => Promise<void>;
  fetchMessages: (chatId: string, token: string) => Promise<void>;
  fetchCalls: (token: string) => Promise<void>;
  createChat: (contactId: string, token: string) => Promise<string | null>;
  createGroupChat: (name: string, participantIds: string[]) => Promise<string | null>;
  addGroupParticipants: (chatId: string, participantIds: string[]) => Promise<void>;
  updateGroupPicture: (chatId: string, pictureUrl: string) => Promise<void>;
  deleteGroupChat: (chatId: string) => Promise<void>;
  markChatAsRead: (chatId: string) => void;
  incrementUnreadCount: (chatId: string) => void;
  sendMessage: (chatId: string, content: string, type?: string, mediaUrl?: string | null, replyToId?: string | null) => void;
  deleteMessage: (chatId: string, messageId: string, deleteFor?: 'everyone' | 'me') => Promise<boolean>;
  clearChat: (chatId: string) => Promise<boolean>;
  sendTypingStatus: (chatId: string, isTyping: boolean) => void;
  toggleReaction: (chatId: string, messageId: string, reaction: string) => void;

  fetchBlockedUsers: () => Promise<void>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  reportUser: (userId: string, reason?: string) => Promise<boolean>;
  
  selectedMessageIds: string[];
  toggleMessageSelection: (messageId: string) => void;
  clearMessageSelection: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  socket: null,
  chats: [],
  activeChatId: null,
  activeTab: 'chats',
  setActiveTab: (tab) => set({ activeTab: tab }),
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

  connectSocket: (token: string, userId: string) => {
    if (get().socket?.connected) return;
    
    set({ isConnecting: true });
    
    const socket = io(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/chat`, {
      withCredentials: true,
    });

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
      const currentUserId = require('@/store/useAuthStore').useAuthStore.getState().user?.id;
      if (message.senderId === currentUserId && message.type !== 'CALL_LOG') return; // Prevent duplicate for sender, except for server-generated logs
      
      get().addMessage(message.chatId, message);
      // Emit seen events
      if (get().activeChatId === message.chatId) {
        socket.emit('message-read', { messageId: message.id, chatId: message.chatId });
      } else {
        socket.emit('message-delivered', { messageId: message.id, chatId: message.chatId });
        get().incrementUnreadCount(message.chatId);
      }
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats`, {
        credentials: 'include'
      });
      if (res.ok) {
        const chats = await res.json();
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
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/messages`, {
        credentials: 'include'
      });
      if (res.ok) {
        const msgs = await res.json();
        set((state) => ({
          messages: {
            ...state.messages,
            [chatId]: msgs
          }
        }));
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  },

  fetchCalls: async (token: string) => {
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      const res = await fetch(`${serverUrl}/api/chats/calls`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        set({ calls: data.calls || [] });
      }
    } catch (err) {
      console.error('Error fetching calls:', err);
    }
  },

  createChat: async (contactId: string, token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats`, {
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

  createGroupChat: async (name: string, participantIds: string[]) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, participantIds })
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/participants`, {
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
      alert(e instanceof Error ? e.message : 'Failed to add participants');
    }
  },

  updateGroupPicture: async (chatId, pictureUrl) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/picture`, {
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
      alert(e instanceof Error ? e.message : 'Failed to update group picture');
    }
  },
  
  deleteGroupChat: async (chatId: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}`, {
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

  sendMessage: (chatId, content, type = 'TEXT', mediaUrl = null, replyToId = null) => {
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
      const newMessage: Message = {
        id: tempId,
        tempId: tempId,
        chatId,
        senderId: currentUserId,
        content,
        type: type as any,
        mediaUrl: mediaUrl,
        replyToId,
        replyTo: replyToObj,
        createdAt: new Date().toISOString(),
        status: 'PENDING'
      };
      
      get().addMessage(chatId, newMessage);
      
      socket.emit('send-message', {
        chatId,
        content,
        type,
        mediaUrl,
        replyToId,
        tempId
      }, (response: any) => {
        if (response && response.message) {
          const updatedMsg = { ...response.message, tempId: response.tempId || tempId };
          set((state) => ({
            messages: {
              ...state.messages,
              [chatId]: (state.messages[chatId] || []).map(m => 
                (m.id === response.tempId || m.tempId === response.tempId) ? updatedMsg : m
              )
            }
          }));
        }
      });
    }
  },





  fetchBlockedUsers: async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/blocked`, {
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/block/${userId}`, {
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/block/${userId}`, {
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
            messageIds.includes(msg.id) ? { ...msg, deletedForUsers: [...(msg.deletedForUsers || []), currentUserId || ''] } : msg
          );
        } else {
          newMessages[chatId] = newMessages[chatId].map(msg => 
            messageIds.includes(msg.id) ? { ...msg, deletedForEveryone: true, deletedAt: new Date().toISOString(), content: null, mediaUrl: null } : msg
          );
        }
      }
      return { messages: newMessages };
    });

    try {
      const endpoint = isBulk 
        ? `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/messages/bulk-delete`
        : `${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/messages/${messageId}`;
      const method = isBulk ? 'POST' : 'DELETE';
      const body = isBulk ? JSON.stringify({ messageIds, deleteFor }) : JSON.stringify({ deleteFor });

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'include'
      });
      if (res.ok) {
        if (isBulk) get().clearMessageSelection();
        return true;
      }
      // TODO: Handle failure and revert optimistic update
      return false;
    } catch (err) {
      console.error('Error deleting message:', err);
      return false;
    }
  },


  clearChat: async (chatId: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/${chatId}/messages`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        // Clear messages locally
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
  },

  reportUser: async (userId: string, reason?: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/report/${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
        credentials: 'include'
      });
      return res.ok;
    } catch (err) {
      console.error('Error reporting user:', err);
      return false;
    }
  }
}));
