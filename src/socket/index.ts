import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import { ChatService } from '../services/chat.service';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth';
import { redis } from '../lib/redis';
import { activeLiveStreams } from '../controllers/live.controller';

import { registerChatHandlers } from './handlers/chatHandler';
import { registerLiveHandlers } from './handlers/liveHandler';
import { registerCallHandlers } from './handlers/callHandler';
import { registerMeetingHandlers } from './handlers/meetingHandler';

let ioInstance: Server | null = null;
export const activeUserSockets = new Map<string, Set<string>>();
export const activeCallRooms = new Map<string, {
  chatId: string;
  callType: 'AUDIO' | 'VIDEO';
  initiatorId?: string;
  everJoinedUserIds: Set<string>;
  participants: Map<string, { userId: string; name?: string; avatar?: string | null; status: string; isMuted?: boolean; isVideoOff?: boolean }>;
}>();

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.io is not initialized');
  }
  return ioInstance;
}

export function setupSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001', process.env.FRONTEND_URL || 'https://chat-app-two-khaki-va269vxf6w.vercel.app'].filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  if (process.env.REDIS_URL) {
    try {
      const pubClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        retryStrategy: (times) => Math.min(times * 50, 2000),
      });
      const subClient = pubClient.duplicate();
      
      pubClient.on('error', (err) => console.error('Redis Pub Error:', err));
      subClient.on('error', (err) => console.error('Redis Sub Error:', err));

      io.adapter(createAdapter(pubClient, subClient));
      console.log('✅ Socket.io Redis adapter initialized successfully');
    } catch (err) {
      console.error('❌ Failed to initialize Redis adapter:', err);
    }
  }

  ioInstance = io;

  setInterval(() => {
    ChatService.cleanupExpiredMessages();
  }, 60 * 1000);

  setInterval(async () => {
    try {
      const dueMessages = await ChatService.processDueScheduledMessages();
      if (dueMessages && dueMessages.length > 0) {
        dueMessages.forEach((msg: any) => {
          chatNamespace.to(msg.chatId).emit('receive-message', msg);
        });
      }
    } catch (err) {
      console.error('Error processing due scheduled messages:', err);
    }
  }, 10 * 1000);

  const chatNamespace = io.of('/chat');

  chatNamespace.use(async (socket, next) => {
    try {
      let session = await auth.api.getSession({
        headers: fromNodeHeaders(socket.handshake.headers as any)
      });

      if (!session) {
        const token = (socket.handshake.auth?.token || socket.handshake.query?.token) as string;
        if (token && token !== 'better-auth-session') {
          const dbSession = await prisma.session.findUnique({
            where: { token },
            include: { user: true }
          });
          if (dbSession && dbSession.expiresAt > new Date()) {
            session = {
              session: dbSession as any,
              user: dbSession.user as any
            };
          }
        }
      }

      const clientUserId = (socket.handshake.auth?.userId || socket.handshake.query?.userId) as string;
      const effectiveUserId = session?.user?.id || clientUserId;

      if (!effectiveUserId) {
        return next(new Error('Authentication error'));
      }
      socket.data.userId = effectiveUserId;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  chatNamespace.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    
    if (!activeUserSockets.has(userId)) {
      activeUserSockets.set(userId, new Set());
    }
    activeUserSockets.get(userId)!.add(socket.id);

    const onlineUserIds = Array.from(activeUserSockets.keys());
    socket.emit('initial-online-users', { onlineUserIds });

    socket.join(userId);

    const markOnline = async () => {
      await redis.set(`online:${userId}`, Date.now().toString(), 'EX', 60);
    };
    await markOnline();
    
    const interval = setInterval(markOnline, 30000);

    chatNamespace.emit('user-status-changed', { userId, isOnline: true });

    try {
      const userChats = await prisma.chatParticipant.findMany({
        where: { userId },
        select: { chatId: true }
      });
      const chatIds = userChats.map((c: any) => c.chatId);
      chatIds.forEach((id: string) => socket.join(id));

      chatIds.forEach((cId: string) => {
        const room = activeCallRooms.get(cId);
        if (room) {
          const activeCount = Array.from(room.participants.values()).filter(
            (p: any) => p.status === 'CONNECTED' || p.status === 'JOINED'
          ).length;
          if (activeCount > 0) {
            socket.emit('active-call-update', { chatId: cId, activeCount, callType: room.callType });
          }
        }
      });

      if (chatIds.length > 0) {
        const pendingMessages = await prisma.message.findMany({
          where: {
            chatId: { in: chatIds },
            senderId: { not: userId },
            NOT: {
              statuses: {
                some: { userId, status: { in: ['DELIVERED', 'READ'] } }
              }
            }
          }
        });

        for (const msg of pendingMessages) {
          const statusRecord = await prisma.messageStatus.upsert({
            where: { messageId_userId: { messageId: msg.id, userId } },
            update: { status: 'DELIVERED' },
            create: { messageId: msg.id, userId, status: 'DELIVERED' }
          });
          chatNamespace.to(msg.senderId).emit('message-status-update', { 
            messageId: msg.id, 
            status: 'DELIVERED', 
            by: userId, 
            chatId: msg.chatId,
            time: statusRecord.updatedAt 
          });
        }
      }
    } catch (err) {
      console.error('Failed to update pending deliveries', err);
    }

    socket.on('join-room', (roomId: string) => {
      socket.join(roomId);
    });

    // --- Register Modular Handlers ---
    registerChatHandlers(io, socket, chatNamespace);
    registerLiveHandlers(io, socket, chatNamespace);
    registerCallHandlers(io, socket, chatNamespace);
    registerMeetingHandlers(io, socket, chatNamespace);

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('meeting-room-')) {
          chatNamespace.to(room).emit('meeting-participant-left', { socketId: socket.id });
        }
      }
    });

    socket.on('disconnect', async () => {
      clearInterval(interval);

      for (const [chatId, room] of activeCallRooms.entries()) {
        if (room.participants.has(userId)) {
          room.participants.delete(userId);

          const activeParticipants = Array.from(room.participants.values()).filter(
            (p: any) => p.status === 'CONNECTED' || p.status === 'JOINED'
          );

          const isGroupCall = room.everJoinedUserIds.size > 2 || room.participants.size > 2 || Boolean((room as any).isGroup);

          if (isGroupCall) {
            if (activeParticipants.length > 0) {
              chatNamespace.to(`call-room-${chatId}`).emit('call-room-user-left', { chatId, userId });
              chatNamespace.to(`call-room-${chatId}`).emit('call-end', { callerId: userId });
              chatNamespace.emit('active-call-update', { chatId, activeCount: activeParticipants.length, callType: 'VIDEO' });
              
              // Local broadcast replacement
              const participantsList = Array.from(room.participants.values());
              chatNamespace.to(`call-room-${chatId}`).emit('call-room-state-updated', {
                chatId,
                callType: room.callType,
                participants: participantsList,
                activeCount: activeParticipants.length
              });
            } else {
              activeCallRooms.delete(chatId);
              chatNamespace.emit('active-call-update', { chatId, activeCount: 0, callType: 'VIDEO' });
            }
          } else {
            activeCallRooms.delete(chatId);
            chatNamespace.to(chatId).emit('call-end', { callerId: userId });
            chatNamespace.to(`call-room-${chatId}`).emit('call-end', { callerId: userId });
            chatNamespace.emit('active-call-update', { chatId, activeCount: 0, callType: 'VIDEO' });
          }
        }
      }

      const userSockets = activeUserSockets.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          for (const [streamId, session] of activeLiveStreams.entries()) {
            if (session.streamerId === userId) {
              session.isLive = false;
              activeLiveStreams.delete(streamId);
              chatNamespace.to(`live_${streamId}`).emit('live-stream-ended', { streamId });
              chatNamespace.emit('live-stream-ended', { streamId });
            } else {
              if (session.viewers.includes(userId)) {
                session.viewers = session.viewers.filter(id => id !== userId);
                if (session.viewerProfiles) {
                  session.viewerProfiles = session.viewerProfiles.filter(p => p.id !== userId);
                }
                session.viewerCount = Math.max(0, session.viewers.length);
                chatNamespace.to(`live_${streamId}`).emit('live-viewer-count', {
                  streamId,
                  viewerCount: session.viewerCount,
                  viewers: session.viewerProfiles || [],
                  mutedUserIds: session.mutedUserIds || []
                });
                chatNamespace.emit('live-viewer-count', { streamId, viewerCount: session.viewerCount });
              }
            }
          }
          activeUserSockets.delete(userId);
          await redis.del(`online:${userId}`);
          
          const now = new Date();
          await prisma.user.update({
            where: { id: userId },
            data: { lastSeen: now }
          }).catch(() => {});
          
          chatNamespace.emit('user-status-changed', { userId, isOnline: false, lastSeen: now });
        }
      }
    });
  });
}
