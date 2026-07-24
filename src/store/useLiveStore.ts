import { create } from 'zustand';
import { useChatStore } from './useChatStore';

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
}

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

  setActiveCategory: (category) => {
    set({ activeCategory: category });
    get().fetchActiveStreams(category, get().searchQuery);
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().fetchActiveStreams(get().activeCategory, query);
  },

  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),

  fetchActiveStreams: async (category, search) => {
    try {
      set({ isLoading: true });
      const queryParams = new URLSearchParams();
      if (category && category !== 'All') queryParams.append('category', category);
      if (search) queryParams.append('search', search);

      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      const res = await fetch(`${serverUrl}/api/live/active?${queryParams.toString()}`, {
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Failed to fetch streams');
      const data = await res.json();
      set({ streams: data.streams || [], isLoading: false });
    } catch (err) {
      console.error('Error fetching streams:', err);
      set({ isLoading: false });
    }
  },

  startLiveStream: async ({ title, category, description }) => {
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      const res = await fetch(`${serverUrl}/api/live/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, category, description })
      });

      if (!res.ok) throw new Error('Failed to start live stream');
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
            text: `Welcome to ${newStream.streamerName}'s live stream! ✨`,
            createdAt: new Date().toISOString(),
            isPinned: true
          }
        ],
        reactions: []
      });

      return newStream;
    } catch (err) {
      console.error('Error starting live:', err);
      return null;
    }
  },

  endLiveStream: async (streamId) => {
    try {
      const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      await fetch(`${serverUrl}/api/live/${streamId}/end`, {
        method: 'POST',
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
          userPfp: stream.streamerPfp,
          text: stream.pinnedComment?.text || `Welcome to ${stream.streamerName}'s live session! ✨`,
          createdAt: new Date().toISOString(),
          isPinned: true
        }
      ],
      reactions: []
    });

    if (socket) {
      socket.emit('join-live', { streamId: stream.id, user: currentUser });

      // Socket Listeners
      socket.off('new-live-comment');
      socket.off('new-live-reaction');
      socket.off('live-viewer-count');
      socket.off('live-comment-pinned');

      socket.on('new-live-comment', ({ comment }) => {
        set(state => ({ comments: [...state.comments, comment] }));
      });

      socket.on('new-live-reaction', (reaction) => {
        set(state => ({
          reactions: [...state.reactions.slice(-20), reaction],
          activeStream: state.activeStream ? { ...state.activeStream, likesCount: state.activeStream.likesCount + 1 } : null
        }));
      });

      socket.on('live-viewer-count', ({ viewerCount }) => {
        set(state => ({
          activeStream: state.activeStream ? { ...state.activeStream, viewerCount } : null
        }));
      });

      socket.on('live-comment-pinned', ({ comment }) => {
        set(state => ({
          activeStream: state.activeStream ? { ...state.activeStream, pinnedComment: comment } : null
        }));
      });
    }
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
      reactions: []
    });
  },

  sendComment: (text, currentUser) => {
    const { activeStream } = get();
    const socket = useChatStore.getState().socket;

    if (!activeStream || !text.trim()) return;

    const newComment: LiveComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId: currentUser?.id || 'guest',
      username: currentUser?.phoneNumber || currentUser?.email?.split('@')[0] || 'guest',
      userPfp: currentUser?.profilePicture || currentUser?.image,
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
  }
}));
