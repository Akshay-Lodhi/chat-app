import { create } from 'zustand';
import { useChatStore } from './useChatStore';
import { useAuthStore } from './useAuthStore';

export interface LiveComment {
  id: string;
  userId: string;
  username: string;
  userPfp?: string;
  text: string;
  createdAt: string;
  isPinned?: boolean;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  user?: any;
}

export interface LiveStreamSession {
  id: string;
  streamerId: string;
  streamerName: string;
  streamerUsername: string;
  streamerPfp?: string;
  title: string;
  description?: string;
  category: string;
  thumbnail?: string;
  isLive: boolean;
  viewerCount: number;
  likesCount: number;
  pinnedComment?: LiveComment | null;
  startedAt: string;
}

interface LiveState {
  streams: LiveStreamSession[];
  activeStream: LiveStreamSession | null;
  isHost: boolean;
  comments: LiveComment[];
  reactions: FloatingReaction[];
  activeCategory: string;
  searchQuery: string;
  isLoading: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  activeViewers: Array<{ id: string; name: string; username: string; avatar?: string | null }>;
  mutedUserIds: string[];

  setActiveCategory: (cat: string) => void;
  setSearchQuery: (q: string) => void;
  fetchActiveStreams: (category?: string, search?: string) => Promise<void>;
  startLiveStream: (data: { title: string; category: string; description?: string }) => Promise<LiveStreamSession | null>;
  endLiveStream: (streamId: string) => Promise<void>;
  joinLiveStream: (stream: LiveStreamSession, currentUser: any) => void;
  leaveLiveStream: (currentUser: any) => void;
  sendComment: (text: string, currentUser: any) => void;
  sendReaction: (emoji: string, currentUser: any) => void;
  pinComment: (comment: LiveComment) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  kickUser: (targetUserId: string) => void;
  muteUser: (targetUserId: string) => void;
  unmuteUser: (targetUserId: string) => void;
  sendGift: (giftType: string, currentUser: any) => void;
  followStreamer: (currentUser: any) => void;
}

let pendingActiveStreamsFetch: Promise<any> | null = null;

const setupSocketListeners = (socket: any, set: any) => {
  if (!socket) return;
  
  socket.off('new-live-comment');
  socket.off('new-live-reaction');
  socket.off('live-viewer-count');
  socket.off('live-comment-pinned');
  socket.off('new-live-gift');
  socket.off('new-live-follow');

  socket.on('new-live-comment', ({ comment }: any) => {
    set((state: any) => ({ comments: [...state.comments, comment] }));
  });

  socket.on('new-live-reaction', (reaction: any) => {
    set((state: any) => ({
      reactions: [...state.reactions.slice(-20), reaction],
      activeStream: state.activeStream ? { ...state.activeStream, likesCount: state.activeStream.likesCount + 1 } : null
    }));
  });

  socket.on('live-viewer-count', ({ viewerCount, viewers, mutedUserIds }: any) => {
    set((state: any) => ({
      activeStream: state.activeStream ? { ...state.activeStream, viewerCount } : null,
      activeViewers: viewers || [],
      mutedUserIds: mutedUserIds || []
    }));
  });

  socket.on('live-comment-pinned', ({ comment }: any) => {
    set((state: any) => ({
      activeStream: state.activeStream ? { ...state.activeStream, pinnedComment: comment } : null
    }));
  });

  socket.on('new-live-gift', ({ giftType, user, id }: any) => {
    const giftComment: LiveComment = {
      id,
      userId: user.id || 'guest',
      username: user.name || user.username || 'guest',
      userPfp: user.profilePicture || user.avatar,
      text: `sent a ${giftType}! 🎁✨`,
      createdAt: new Date().toISOString(),
      isGift: true
    } as any;
    set((state: any) => ({ comments: [...state.comments, giftComment] }));
  });

  socket.on('new-live-follow', ({ user, id }: any) => {
    const followComment: LiveComment = {
      id,
      userId: user.id || 'guest',
      username: user.name || user.username || 'guest',
      userPfp: user.profilePicture || user.avatar,
      text: `followed the host! 💖`,
      createdAt: new Date().toISOString(),
      isFollow: true
    } as any;
    set((state: any) => ({ comments: [...state.comments, followComment] }));
  });
};

export const useLiveStore = create<LiveState>((set, get) => ({
  streams: [],
  activeStream: null,
  isHost: false,
  comments: [],
  reactions: [],
  activeCategory: 'All',
  searchQuery: '',
  isLoading: false,
  localStream: null,
  remoteStream: null,
  activeViewers: [],
  mutedUserIds: [],

  setActiveCategory: (category) => {
    set({ activeCategory: category });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),

  fetchActiveStreams: async (category, search) => {
    if (pendingActiveStreamsFetch) {
      return pendingActiveStreamsFetch;
    }

    pendingActiveStreamsFetch = (async () => {
      try {
        set({ isLoading: true });
        const queryParams = new URLSearchParams();
        const cat = category || get().activeCategory;
        const q = search !== undefined ? search : get().searchQuery;

        if (cat && cat !== 'All') queryParams.append('category', cat);
        if (q) queryParams.append('search', q);

        const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
        const token = useAuthStore.getState().token;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${serverUrl}/api/live/active?${queryParams.toString()}`, {
          headers,
          credentials: 'include'
        });

        if (!res.ok) throw new Error('Failed to fetch streams');
        const data = await res.json();
        set({ streams: data.streams || [], isLoading: false });
      } catch (err) {
        console.error('Error fetching streams:', err);
        set({ isLoading: false });
      } finally {
        pendingActiveStreamsFetch = null;
      }
    })();

    return pendingActiveStreamsFetch;
  },

  startLiveStream: async ({ title, category, description }) => {
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      const token = useAuthStore.getState().token;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${serverUrl}/api/live/start`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ title, category, description })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start live stream');
      }
      const data = await res.json();
      const newStream = data.stream;

      set({
        activeStream: newStream,
        isHost: true,
        comments: [
          {
            id: 'system-welcome',
            userId: newStream.streamerId,
            username: newStream.streamerUsername,
            userPfp: newStream.streamerPfp || useAuthStore.getState().user?.profilePicture,
            text: `Welcome to ${newStream.streamerName}'s live stream! ✨`,
            createdAt: new Date().toISOString(),
            isPinned: !!newStream.pinnedComment
          }
        ],
        reactions: []
      });

      const socket = useChatStore.getState().socket;
      setupSocketListeners(socket, set);

      return newStream;
    } catch (err) {
      console.error('Error starting live:', err);
      return null;
    }
  },

  endLiveStream: async (streamId) => {
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      const token = useAuthStore.getState().token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(`${serverUrl}/api/live/${streamId}/end`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });

      const { localStream } = get();
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }

      set({
        activeStream: null,
        isHost: false,
        localStream: null,
        remoteStream: null,
        comments: [],
        reactions: []
      });

      get().fetchActiveStreams();
    } catch (err) {
      console.error('Error ending live:', err);
    }
  },

  joinLiveStream: (stream, currentUser) => {
    const socket = useChatStore.getState().socket;
    set({
      activeStream: stream,
      isHost: currentUser?.id === stream.streamerId,
      comments: [
        {
          id: 'welcome-msg',
          userId: stream.streamerId,
          username: stream.streamerUsername,
          userPfp: stream.streamerPfp || (currentUser?.id === stream.streamerId ? currentUser?.profilePicture : undefined),
          text: stream.pinnedComment?.text || `Welcome to ${stream.streamerName}'s live session! ✨`,
          createdAt: new Date().toISOString(),
          isPinned: !!stream.pinnedComment
        }
      ],
      reactions: []
    });

    setupSocketListeners(socket, set);
  },

  leaveLiveStream: (currentUser) => {
    const { activeStream, localStream } = get();
    const socket = useChatStore.getState().socket;

    if (socket && activeStream) {
      socket.emit('leave-live', { streamId: activeStream.id, user: currentUser });
      socket.off('new-live-comment');
      socket.off('new-live-reaction');
      socket.off('live-viewer-count');
      socket.off('live-comment-pinned');
      socket.off('new-live-gift');
      socket.off('new-live-follow');
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    set({
      activeStream: null,
      isHost: false,
      localStream: null,
      remoteStream: null,
      comments: [],
      reactions: [],
      activeViewers: [],
      mutedUserIds: []
    });
  },

  sendComment: (text, currentUser) => {
    const { activeStream, mutedUserIds, activeViewers } = get();
    const socket = useChatStore.getState().socket;

    if (!activeStream || !text.trim()) return;
    if (mutedUserIds.includes(currentUser?.id)) {
      alert("You have been muted by the host and cannot comment.");
      return;
    }

    const isHost = currentUser?.id === activeStream.streamerId;
    const viewerProfile = activeViewers.find(v => v.id === currentUser?.id);
    const resolvedPfp = isHost ? activeStream.streamerPfp : (viewerProfile?.avatar || currentUser?.profilePicture || currentUser?.image);

    const newComment: LiveComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: currentUser?.id || 'guest',
      username: currentUser?.phoneNumber || currentUser?.email?.split('@')[0] || 'guest',
      userPfp: resolvedPfp,
      text: text.trim(),
      createdAt: new Date().toISOString()
    };

    if (socket) {
      socket.emit('live-comment', { streamId: activeStream.id, comment: newComment });
    } else {
      set(state => ({ comments: [...state.comments, newComment] }));
    }
  },

  sendReaction: (emoji, currentUser) => {
    const { activeStream } = get();
    const socket = useChatStore.getState().socket;

    if (!activeStream) return;

    if (socket) {
      socket.emit('live-reaction', { streamId: activeStream.id, emoji, user: currentUser });
    } else {
      set(state => ({
        reactions: [...state.reactions.slice(-20), { id: `react-${Date.now()}`, emoji, user: currentUser }],
        activeStream: state.activeStream ? { ...state.activeStream, likesCount: state.activeStream.likesCount + 1 } : null
      }));
    }
  },

  pinComment: (comment) => {
    const { activeStream } = get();
    const socket = useChatStore.getState().socket;

    if (!activeStream) return;

    if (socket) {
      socket.emit('live-pin-comment', { streamId: activeStream.id, comment });
    }
  },

  kickUser: (targetUserId) => {
    const { activeStream } = get();
    const socket = useChatStore.getState().socket;
    if (activeStream && socket) {
      socket.emit('kick-user-live', { streamId: activeStream.id, targetUserId });
    }
  },

  muteUser: (targetUserId) => {
    const { activeStream } = get();
    const socket = useChatStore.getState().socket;
    if (activeStream && socket) {
      socket.emit('mute-user-live', { streamId: activeStream.id, targetUserId });
    }
  },

  unmuteUser: (targetUserId) => {
    const { activeStream } = get();
    const socket = useChatStore.getState().socket;
    if (activeStream && socket) {
      socket.emit('unmute-user-live', { streamId: activeStream.id, targetUserId });
    }
  },

  sendGift: (giftType: string, currentUser: any) => {
    const { activeStream } = get();
    const socket = useChatStore.getState().socket;
    if (activeStream && socket) {
      socket.emit('live-gift', { streamId: activeStream.id, giftType, user: currentUser });
    }
  },

  followStreamer: (currentUser: any) => {
    const { activeStream } = get();
    const socket = useChatStore.getState().socket;
    if (activeStream && socket) {
      socket.emit('live-follow', { streamId: activeStream.id, user: currentUser });
    }
  }
}));
