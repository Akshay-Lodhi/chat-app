import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getIO } from '../socket';

export interface ActiveLiveSession {
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
  pinnedComment?: {
    id: string;
    username: string;
    text: string;
  } | null;
  startedAt: string;
  viewers: string[];
}

export const activeLiveStreams: Map<string, ActiveLiveSession> = new Map();

const seedMockStreams = () => {
  if (activeLiveStreams.size === 0) {
    const mock1: ActiveLiveSession = {
      id: 'live-astro-101',
      streamerId: 'user-astro-dev',
      streamerName: 'Astro Vibes',
      streamerUsername: '_astrovibes_',
      streamerPfp: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      title: 'Daily Horoscope & Planetary Transits Q&A ✨🔮',
      category: 'Astrology',
      thumbnail: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800',
      isLive: true,
      viewerCount: 1248,
      likesCount: 5430,
      pinnedComment: {
        id: 'pin-1',
        username: '_astrovibes_',
        text: 'Welcome to the live session! Ask your questions in comments. ✨'
      },
      startedAt: new Date(Date.now() - 15 * 60000).toISOString(),
      viewers: []
    };

    const mock2: ActiveLiveSession = {
      id: 'live-coding-202',
      streamerId: 'user-coder-alex',
      streamerName: 'Alex River',
      streamerUsername: 'alex_codes',
      streamerPfp: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      title: 'Building a Fullstack Next.js Chat App 💻🚀',
      category: 'Coding',
      thumbnail: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800',
      isLive: true,
      viewerCount: 612,
      likesCount: 1890,
      pinnedComment: null,
      startedAt: new Date(Date.now() - 30 * 60000).toISOString(),
      viewers: []
    };

    const mock3: ActiveLiveSession = {
      id: 'live-music-303',
      streamerId: 'user-music-luna',
      streamerName: 'Luna Acoustic',
      streamerUsername: 'luna_beats',
      streamerPfp: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      title: 'Late Night Lo-Fi Guitar & Chill Beats 🎸🎧',
      category: 'Music',
      thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800',
      isLive: true,
      viewerCount: 940,
      likesCount: 4120,
      pinnedComment: null,
      startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      viewers: []
    };

    activeLiveStreams.set(mock1.id, mock1);
    activeLiveStreams.set(mock2.id, mock2);
    activeLiveStreams.set(mock3.id, mock3);
  }
};

seedMockStreams();

export const getActiveStreams = async (req: AuthRequest, res: Response) => {
  try {
    seedMockStreams();
    const category = req.query.category as string;
    const search = req.query.search as string;

    let streams = Array.from(activeLiveStreams.values());

    if (category && category !== 'All') {
      streams = streams.filter(s => s.category.toLowerCase() === category.toLowerCase());
    }

    if (search) {
      const query = search.toLowerCase();
      streams = streams.filter(s => 
        s.title.toLowerCase().includes(query) || 
        s.streamerUsername.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query)
      );
    }

    res.json({ streams });
  } catch (error) {
    console.error('Error fetching live streams:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const startLiveStream = async (req: AuthRequest, res: Response) => {
  try {
    const { title, category, description, thumbnail } = req.body;
    const userId = req.user!.userId;
    const user = req.user as any;

    if (!title) {
      return res.status(400).json({ error: 'Stream title is required' });
    }

    const streamId = `live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newStream: ActiveLiveSession = {
      id: streamId,
      streamerId: userId,
      streamerName: user?.name || 'User',
      streamerUsername: user?.phoneNumber || user?.email?.split('@')[0] || 'user',
      streamerPfp: user?.profilePicture || user?.image,
      title,
      description: description || '',
      category: category || 'General',
      thumbnail: thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
      isLive: true,
      viewerCount: 1,
      likesCount: 0,
      pinnedComment: null,
      startedAt: new Date().toISOString(),
      viewers: [userId]
    };

    activeLiveStreams.set(streamId, newStream);

    const io = getIO();
    io.emit('new-live-stream', newStream);

    res.json({ success: true, stream: newStream });
  } catch (error) {
    console.error('Error starting live stream:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const endLiveStream = async (req: AuthRequest, res: Response) => {
  try {
    const streamId = req.params.id as string;
    const userId = req.user!.userId;

    const stream = activeLiveStreams.get(streamId);
    if (stream) {
      if (stream.streamerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized to end this stream' });
      }

      stream.isLive = false;
      activeLiveStreams.delete(streamId);

      const io = getIO();
      io.emit('live-stream-ended', { streamId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error ending live stream:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
