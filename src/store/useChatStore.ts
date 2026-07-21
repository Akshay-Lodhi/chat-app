import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface Chat {
  id: string;
  name?: string | null;
  isGroup: boolean;
  groupPicture?: string | null;
  participants: any[]; // refine type later
  lastMessage?: any;
  unreadCount?: number;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string | null;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'CALL_LOG';
  mediaUrl: string | null;
  createdAt: string;
  status?: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ';
  deliveredAt?: string;
  readAt?: string;
  isDeleted?: boolean;
  replyToId?: string | null;
  replyTo?: any | null;
}

interface ChatState {
  socket: Socket | null;
  chats: Chat[];
  activeChatId: string | null;
  messages: Record<string, Message[]>; // chatId -> messages
  isConnecting: boolean;
  
  connectSocket: (token: string, userId: string) => void;
  disconnectSocket: () => void;
  setChats: (chats: Chat[]) => void;
  setActiveChat: (chatId: string) => void;
  addMessage: (chatId: string, message: Message) => void;
  sendMessage: (chatId: string, content: string, type?: string, mediaUrl?: string | null) => void;
  fetchChats: (token: string) => Promise<void>;
  fetchMessages: (chatId: string, token: string) => Promise<void>;
  createChat: (contactId: string, token: string) => Promise<string>;
  createGroupChat: (name: string, participantIds: string[], groupPicture?: string) => Promise<string>;
  markChatAsRead: (chatId: string) => void;
  incrementUnreadCount: (chatId: string) => void;
  sendMessage: (chatId: string, content: string, type?: string, mediaUrl?: string | null, replyToId?: string | null) => void;
  deleteMessage: (chatId: string, messageId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  socket: null,
  chats: [],
  activeChatId: null,
  messages: {},
  isConnecting: false,

  connectSocket: (token: string, userId: string) => {
    if (get().socket?.connected) return;
    
    set({ isConnecting: true });
    
    const socket = io(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/chat`, {
      withCredentials: true,
    });

    socket.on('connect', () => {
      set({ isConnecting: false });
    });

    socket.on('receive-message', (message: Message) => {
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
        return { messages: newMessages };
      });
    });

    socket.on('message-deleted', ({ messageId, chatId }) => {
      set((state) => {
        const newMessages = { ...state.messages };
        if (newMessages[chatId]) {
          newMessages[chatId] = newMessages[chatId].map(msg => 
            msg.id === messageId ? { ...msg, isDeleted: true, content: null, mediaUrl: null } : msg
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

  setChats: (chats) => set({ chats }),
  
  fetchChats: async (token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats`, {
        credentials: 'include'
      });
      if (res.ok) {
        const chats = await res.json();
        set({ chats });
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
    return '';
  },

  createGroupChat: async (name: string, participantIds: string[], groupPicture?: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/group`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ name, participantIds, groupPicture })
      });
      if (res.ok) {
        const newChat = await res.json();
        set((state) => ({ chats: [newChat, ...state.chats] }));
        return newChat.id;
      }
    } catch (err) {
      console.error('Error creating group chat:', err);
    }
    return '';
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
  
  addMessage: (chatId, message) => set((state) => ({
    messages: {
      ...state.messages,
      [chatId]: [...(state.messages[chatId] || []), message]
    }
  })),

  sendMessage: (chatId, content, type = 'TEXT', mediaUrl = null, replyToId = null) => {
    const { socket } = get();
    if (socket && socket.connected) {
      // Optimistic update
      const tempId = Date.now().toString();
      const newMessage: Message = {
        id: tempId,
        chatId,
        senderId: 'me', // Will be replaced by actual logic later
        content,
        type: type as any,
        mediaUrl: mediaUrl,
        replyToId,
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
          set((state) => ({
            messages: {
              ...state.messages,
              [chatId]: (state.messages[chatId] || []).map(m => 
                m.id === response.tempId ? response.message : m
              )
            }
          }));
        }
      });
    }
  },

  deleteMessage: (chatId, messageId) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit('delete-message', { chatId, messageId });
    }
  }
}));
