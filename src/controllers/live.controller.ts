import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { getIO } from '../socket';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  viewerProfiles?: Array<{ id: string; name: string; username: string; avatar?: string | null }>;
  mutedUserIds?: string[];
}

export const activeLiveStreams: Map<string, ActiveLiveSession> = new Map();

export const getActiveStreams = async (req: AuthRequest, res: Response) => {
  try {
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

    if (!title) {
      return res.status(400).json({ error: 'Stream title is required' });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    const streamId = `live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newStream: ActiveLiveSession = {
      id: streamId,
      streamerId: userId,
      streamerName: dbUser?.name || 'User',
      streamerUsername: dbUser?.phoneNumber || dbUser?.email?.split('@')[0] || 'user',
      streamerPfp: dbUser?.profilePicture || dbUser?.image || undefined,
      title,
      description: description || '',
      category: category || 'General',
      thumbnail: thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
      isLive: true,
      viewerCount: 0,
      likesCount: 0,
      pinnedComment: null,
      startedAt: new Date().toISOString(),
      viewers: []
    };

    activeLiveStreams.set(streamId, newStream);

    // Emit on /chat namespace so the client receives it
    const io = getIO();
    io.of('/chat').emit('new-live-stream', newStream);

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

      // Emit on /chat namespace so the client receives it
      const io = getIO();
      io.of('/chat').emit('live-stream-ended', { streamId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error ending live stream:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

