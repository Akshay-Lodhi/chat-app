import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { prisma } from '../lib/prisma';
import { generateAIResponse } from '../services/ai.service';
import { ChatService } from '../services/chat.service';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import * as cheerio from 'cheerio';

import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth';
import { redis } from '../lib/redis';
import { activeLiveStreams } from '../controllers/live.controller';

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

  // Run cleanup of expired disappearing messages every 60 seconds
  setInterval(() => {
    ChatService.cleanupExpiredMessages();
  }, 60 * 1000);

  // Run scheduled messages worker every 10 seconds
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
    
    // Track active user sockets
    if (!activeUserSockets.has(userId)) {
      activeUserSockets.set(userId, new Set());
    }
    activeUserSockets.get(userId)!.add(socket.id);

    // Send currently online users to newly connected socket
    const onlineUserIds = Array.from(activeUserSockets.keys());
    socket.emit('initial-online-users', { onlineUserIds });

    // Join personal room for targeted events (like seen receipts)
    socket.join(userId);

    // Mark user as online in Redis with a TTL of 60 seconds
    const markOnline = async () => {
      await redis.set(`online:${userId}`, Date.now().toString(), 'EX', 60);
    };
    await markOnline();
    
    // Refresh the TTL every 30 seconds
    const interval = setInterval(markOnline, 30000);

    chatNamespace.emit('user-status-changed', { userId, isOnline: true });

    // Mark pending messages as delivered & auto-join chat rooms
    try {
      const userChats = await prisma.chatParticipant.findMany({
        where: { userId },
        select: { chatId: true }
      });
      const chatIds = userChats.map((c: any) => c.chatId);
      chatIds.forEach((id: string) => socket.join(id));

      // Broadcast ongoing active calls in user's chats to newly connected socket
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

    socket.on('typing', ({ chatId, isTyping }) => {
      socket.to(chatId).emit('typing', { chatId, userId, isTyping });
    });

    socket.on('send-message', async (data, callback) => {
      const { chatId, content, type, mediaUrl, tempId, replyToId, metadata, isEncrypted } = data;

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        select: { disappearingTimer: true }
      });

      const expiresAt = chat?.disappearingTimer && chat.disappearingTimer > 0
        ? new Date(Date.now() + chat.disappearingTimer * 1000)
        : null;

      const message = await prisma.message.create({
        data: { chatId, senderId: userId, content, type, mediaUrl, replyToId, metadata, expiresAt, isEncrypted: isEncrypted || false } as any,
        include: { replyTo: true, sender: true }
      });
      
      socket.to(chatId).emit('receive-message', message);
      
      if (typeof callback === 'function') {
        callback({ message, tempId });
      }

      // --- LINK PREVIEW EXTRACTION (Async) ---
      if (type === 'TEXT' && content && !isEncrypted) {
        // Find the first URL in the content
        const urlMatch = content.match(/(https?:\/\/[^\s]+)/g);
        if (urlMatch && urlMatch.length > 0) {
          const url = urlMatch[0];
          // We don't await this so it doesn't block the message loop
          fetch(url, { headers: { 'User-Agent': 'NexusBot/1.0' } })
            .then(res => {
               const contentType = res.headers.get('content-type');
               if (contentType && contentType.includes('text/html')) {
                 return res.text();
               }
               return null;
            })
            .then(async (html) => {
               if (!html) return;
               const $ = cheerio.load(html);
               const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
               const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
               let image = $('meta[property="og:image"]').attr('content') || '';
               
               // Resolve relative image URLs if needed
               if (image && image.startsWith('/')) {
                 const urlObj = new URL(url);
                 image = `${urlObj.protocol}//${urlObj.host}${image}`;
               }

               if (title || description || image) {
                 const currentMeta = (metadata as any) || {};
                 const newMetadata = { ...currentMeta, linkPreview: { title, description, image, url } };
                 
                 const updatedMessage = await prisma.message.update({
                   where: { id: message.id },
                   data: { metadata: newMetadata } as any,
                   include: { replyTo: true, sender: true }
                 });

                 // Broadcast the updated message so UI can render the link preview
                 chatNamespace.to(chatId).emit('message-updated', updatedMessage);
               }
            })
            .catch(err => console.error('Failed to fetch link preview:', err));
        }
      }

      // --- NEXUS AI INTEGRATION ---
      try {
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          include: { participants: true }
        });

        if (chat) {
          const isAiInChat = chat.participants.some((p: any) => p.userId === 'nexus-ai-system');
          const isAiMentioned = Boolean(content && /@(ai|nexusai)\b/i.test(content));
          
          if (isAiInChat || isAiMentioned) {
            // Show typing indicator
            chatNamespace.to(chatId).emit('typing', { chatId, isTyping: true, userId: 'nexus-ai-system' });
            
            // Generate response
            const aiReply = await generateAIResponse(chatId, content || '', message.sender.name || 'User');
            
            // Mark user's message as READ by Nexus AI
            await prisma.messageStatus.upsert({
              where: { messageId_userId: { messageId: message.id, userId: 'nexus-ai-system' } },
              update: { status: 'READ' },
              create: { messageId: message.id, userId: 'nexus-ai-system', status: 'READ' }
            });
            chatNamespace.to(message.senderId).emit('message-status-update', { 
              messageId: message.id, status: 'READ', by: 'nexus-ai-system', chatId, time: new Date() 
            });

            // Stop typing
            chatNamespace.to(chatId).emit('typing', { chatId, isTyping: false, userId: 'nexus-ai-system' });

            // Create AI message
            const aiMessage = await prisma.message.create({
              data: { chatId, senderId: 'nexus-ai-system', content: aiReply, type: 'TEXT' },
              include: { replyTo: true, sender: true }
            });

            // Broadcast AI message
            chatNamespace.to(chatId).emit('receive-message', aiMessage);
          }
        }
      } catch (aiError) {
        console.error('Failed to process AI response:', aiError);
      }
    });

    socket.on('delete-message', async ({ messageId, chatId }) => {
      try {
        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        if (msg && msg.senderId === userId) {
          await prisma.message.update({
            where: { id: messageId },
            data: { isDeleted: true, content: null, mediaUrl: null }
          });
          chatNamespace.to(chatId).emit('message-deleted', { messageId, chatId });
          socket.emit('message-deleted', { messageId, chatId });
        }
      } catch (err) {
        console.error('Failed to delete message', err);
      }
    });

    socket.on('message-delivered', async ({ messageId, chatId }) => {
      try {
        const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true } });
        if (!msg) return;

        const statusRecord = await prisma.messageStatus.upsert({
          where: { messageId_userId: { messageId, userId } },
          update: { status: 'DELIVERED' },
          create: { messageId, userId, status: 'DELIVERED' }
        });
        chatNamespace.to(msg.senderId).emit('message-status-update', { messageId, status: 'DELIVERED', by: userId, chatId, time: statusRecord.updatedAt });
      } catch (err) {}
    });

    socket.on('message-read', async ({ messageId, chatId }) => {
      try {
        const msg = await prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true } });
        if (!msg) return;

        const statusRecord = await prisma.messageStatus.upsert({
          where: { messageId_userId: { messageId, userId } },
          update: { status: 'READ' },
          create: { messageId, userId, status: 'READ' }
        });
        chatNamespace.to(msg.senderId).emit('message-status-update', { messageId, status: 'READ', by: userId, chatId, time: statusRecord.updatedAt });
      } catch (err) {}
    });

    socket.on('chat-read', async ({ chatId }) => {
      try {
        // Find unread messages from others
        const unread = await prisma.message.findMany({
          where: { 
            chatId, 
            senderId: { not: userId },
            NOT: { statuses: { some: { userId, status: 'READ' } } }
          },
          select: { id: true, senderId: true }
        });

        for (const msg of unread) {
          await prisma.messageStatus.upsert({
            where: { messageId_userId: { messageId: msg.id, userId } },
            update: { status: 'READ' },
            create: { messageId: msg.id, userId, status: 'READ' }
          });
          chatNamespace.to(msg.senderId).emit('message-status-update', { messageId: msg.id, status: 'READ', by: userId, chatId });
        }
      } catch (err) {}
    });

    socket.on('message-reaction', async ({ messageId, chatId, reaction }) => {
      try {
        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        if (!msg) return;
        
        let reactions = msg.reactions ? (msg.reactions as Record<string, any>) : {};
        
        const existing = reactions[userId];
        const existingEmoji = typeof existing === 'string' ? existing : existing?.emoji;

        if (existingEmoji === reaction) {
          delete reactions[userId]; // Toggle off
        } else {
          reactions[userId] = { emoji: reaction, timestamp: new Date().toISOString() }; // Set new with timestamp
        }

        await prisma.message.update({
          where: { id: messageId },
          data: { reactions: reactions as any }
        });

        chatNamespace.to(chatId).emit('message-reaction-update', { messageId, chatId, reactions });

        // Also emit to participants' personal rooms
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          include: { participants: true }
        });
        if (chat) {
          chat.participants.forEach((p: any) => {
            if (p.userId !== userId) {
              chatNamespace.to(p.userId).emit('message-reaction-update', { messageId, chatId, reactions });
            }
          });
        }
      } catch (err) {
        console.error('Failed to update reaction', err);
      }
    });

    // Real-time typing indicators (Instant <5ms delivery without DB bottleneck)
    socket.on('typing', ({ chatId, isTyping }) => {
      if (!chatId) return;
      socket.to(chatId).emit('typing', { chatId, userId, isTyping });
    });

    // =========================================
    // INSTAGRAM LIVE STREAMING SOCKET HANDLERS
    // =========================================
    socket.on('join-live', ({ streamId, user }) => {
      if (!streamId) return;
      socket.join(`live_${streamId}`);

      const session = activeLiveStreams.get(streamId);
      if (session) {
        if (session.streamerId !== user.id) {
          if (!session.viewers.includes(user.id)) {
            session.viewers.push(user.id);
            if (!session.viewerProfiles) session.viewerProfiles = [];
            session.viewerProfiles.push({
              id: user.id,
              name: user.name || 'User',
              username: user.name?.replace(/\s+/g, '').toLowerCase() || user.email?.split('@')[0] || 'user',
              avatar: user.profilePicture || user.image || null
            });
          }
        }
        session.viewerCount = session.viewers.length;
        const viewerPayload = {
          streamId,
          viewerCount: session.viewerCount,
          viewers: session.viewerProfiles || [],
          mutedUserIds: session.mutedUserIds || []
        };
        // Emit to stream room participants (for LiveStreamRoom)
        chatNamespace.to(`live_${streamId}`).emit('live-viewer-count', viewerPayload);
        // Also emit to all clients (for LiveView grid cards)
        chatNamespace.emit('live-viewer-count', viewerPayload);
      }

      // Notify others that user joined live
      socket.to(`live_${streamId}`).emit('live-user-joined', {
        streamId,
        user
      });
    });



    socket.on('leave-live', ({ streamId, user }) => {
      if (!streamId) return;
      socket.leave(`live_${streamId}`);

      const session = activeLiveStreams.get(streamId);
      if (session) {
        session.viewers = session.viewers.filter(id => id !== user.id);
        if (session.viewerProfiles) {
          session.viewerProfiles = session.viewerProfiles.filter(p => p.id !== user.id);
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
    });

    socket.on('live-comment', ({ streamId, comment }) => {
      if (!streamId || !comment) return;
      // Check if user is muted on server
      const session = activeLiveStreams.get(streamId);
      if (session && session.mutedUserIds?.includes(comment.userId)) {
        return; // drop comment if user is muted
      }
      chatNamespace.to(`live_${streamId}`).emit('new-live-comment', {
        streamId,
        comment
      });
    });

    socket.on('live-reaction', ({ streamId, emoji, user }) => {
      if (!streamId) return;
      const session = activeLiveStreams.get(streamId);
      if (session) {
        session.likesCount = (session.likesCount || 0) + 1;
      }

      chatNamespace.to(`live_${streamId}`).emit('new-live-reaction', {
        streamId,
        emoji: emoji || '❤️',
        id: `react-${Date.now()}-${Math.random()}`,
        user
      });
    });

    socket.on('live-pin-comment', ({ streamId, comment }) => {
      if (!streamId) return;
      const session = activeLiveStreams.get(streamId);
      if (session) {
        session.pinnedComment = comment;
      }
      chatNamespace.to(`live_${streamId}`).emit('live-comment-pinned', {
        streamId,
        comment
      });
    });

    socket.on('kick-user-live', ({ streamId, targetUserId }) => {
      if (!streamId) return;
      const session = activeLiveStreams.get(streamId);
      if (session && session.streamerId === userId) {
        // Kick event
        chatNamespace.to(`live_${streamId}`).emit('user-kicked-live', { streamId, targetUserId });

        session.viewers = session.viewers.filter(id => id !== targetUserId);
        if (session.viewerProfiles) {
          session.viewerProfiles = session.viewerProfiles.filter(p => p.id !== targetUserId);
        }
        session.viewerCount = Math.max(0, session.viewers.length);
        chatNamespace.to(`live_${streamId}`).emit('live-viewer-count', {
          streamId,
          viewerCount: session.viewerCount,
          viewers: session.viewerProfiles || [],
          mutedUserIds: session.mutedUserIds || []
        });
      }
    });

    socket.on('mute-user-live', ({ streamId, targetUserId }) => {
      if (!streamId) return;
      const session = activeLiveStreams.get(streamId);
      if (session && session.streamerId === userId) {
        if (!session.mutedUserIds) session.mutedUserIds = [];
        if (!session.mutedUserIds.includes(targetUserId)) {
          session.mutedUserIds.push(targetUserId);
        }
        chatNamespace.to(`live_${streamId}`).emit('user-muted-live', { streamId, targetUserId });
        chatNamespace.to(`live_${streamId}`).emit('live-viewer-count', {
          streamId,
          viewerCount: session.viewerCount,
          viewers: session.viewerProfiles || [],
          mutedUserIds: session.mutedUserIds || []
        });
      }
    });

    socket.on('unmute-user-live', ({ streamId, targetUserId }) => {
      if (!streamId) return;
      const session = activeLiveStreams.get(streamId);
      if (session && session.streamerId === userId) {
        if (session.mutedUserIds) {
          session.mutedUserIds = session.mutedUserIds.filter(id => id !== targetUserId);
        }
        chatNamespace.to(`live_${streamId}`).emit('user-unmuted-live', { streamId, targetUserId });
        chatNamespace.to(`live_${streamId}`).emit('live-viewer-count', {
          streamId,
          viewerCount: session.viewerCount,
          viewers: session.viewerProfiles || [],
          mutedUserIds: session.mutedUserIds || []
        });
      }
    });

    socket.on('live-gift', ({ streamId, giftType, user }) => {
      if (!streamId) return;
      chatNamespace.to(`live_${streamId}`).emit('new-live-gift', {
        streamId,
        giftType,
        id: `gift-${Date.now()}-${Math.random()}`,
        user
      });
    });

    socket.on('live-follow', ({ streamId, user }) => {
      if (!streamId) return;
      chatNamespace.to(`live_${streamId}`).emit('new-live-follow', {
        streamId,
        id: `follow-${Date.now()}-${Math.random()}`,
        user
      });
    });

    socket.on('live-signal', ({ streamId, signalData, targetUserId }) => {
      if (!streamId) return;
      if (targetUserId) {
        // Direct peer signaling
        chatNamespace.to(targetUserId).emit('live-signal', {
          streamId,
          signalData,
          fromUserId: userId
        });
      } else {
        // Broadcast signaling
        socket.to(`live_${streamId}`).emit('live-signal', {
          streamId,
          signalData,
          fromUserId: userId
        });
      }
    });

    // WebRTC Signaling
    
    // Server-side authoritative state for active call rooms
    interface CallParticipantState {
      userId: string;
      name: string;
      avatar: string | null;
      status: 'INVITED' | 'RINGING' | 'CONNECTED' | 'LEFT';
      isMuted: boolean;
      isVideoOff: boolean;
    }

    interface ServerCallRoom {
      chatId: string;
      callType: 'AUDIO' | 'VIDEO';
      initiatorId: string;
      participants: Map<string, CallParticipantState>;
      everJoinedUserIds: Set<string>;
    }

    const broadcastRoomState = (chatId: string) => {
      const room = activeCallRooms.get(chatId);
      if (!room) return;
      const participantsList = Array.from(room.participants.values());
      const activeCount = participantsList.filter(p => p.status === 'CONNECTED').length;
      
      chatNamespace.to(`call-room-${chatId}`).emit('call-room-state-updated', {
        chatId,
        callType: room.callType,
        participants: participantsList,
        activeCount
      });

      chatNamespace.emit('active-call-update', {
        chatId,
        activeCount,
        callType: room.callType
      });
    };

    socket.on('join-call-room', async ({ chatId, type }) => {
      if (!chatId) return;
      socket.join(`call-room-${chatId}`);

      let room = activeCallRooms.get(chatId);
      if (!room) {
        room = {
          chatId,
          callType: type || 'VIDEO',
          initiatorId: userId,
          participants: new Map(),
          everJoinedUserIds: new Set()
        };
        activeCallRooms.set(chatId, room);
      }

      const existingParticipants = Array.from(room.participants.keys()).filter(id => room!.participants.get(id)?.status === 'CONNECTED');
      
      // Fetch user profile info
      let userObj = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, phoneNumber: true, profilePicture: true } });
      const uName = userObj?.name || userObj?.phoneNumber || 'User';
      const uAvatar = userObj?.profilePicture || null;

      room.participants.set(userId, {
        userId,
        name: uName,
        avatar: uAvatar,
        status: 'CONNECTED',
        isMuted: false,
        isVideoOff: false
      });
      room.everJoinedUserIds.add(userId);

      socket.emit('call-room-participants', { chatId, participants: existingParticipants });
      socket.to(`call-room-${chatId}`).emit('call-room-user-joined', { chatId, userId });
      broadcastRoomState(chatId);
    });

    socket.on('leave-call-room', ({ chatId }) => {
      if (!chatId) return;
      socket.leave(`call-room-${chatId}`);
      const room = activeCallRooms.get(chatId);
      if (room && room.participants.has(userId)) {
        room.participants.get(userId)!.status = 'LEFT';
        const connectedCount = Array.from(room.participants.values()).filter(p => p.status === 'CONNECTED').length;
        if (connectedCount === 0) {
          activeCallRooms.delete(chatId);
        }
      }
      socket.to(`call-room-${chatId}`).emit('call-room-user-left', { chatId, userId });
      broadcastRoomState(chatId);
    });

    socket.on('toggle-media-status', ({ chatId, isMuted, isVideoOff }) => {
      if (!chatId) return;
      const room = activeCallRooms.get(chatId);
      if (room && room.participants.has(userId)) {
        const p = room.participants.get(userId)!;
        p.isMuted = Boolean(isMuted);
        p.isVideoOff = Boolean(isVideoOff);
        socket.to(`call-room-${chatId}`).emit('participant-media-toggled', { userId, isMuted: p.isMuted, isVideoOff: p.isVideoOff });
        broadcastRoomState(chatId);
      }
    });

    socket.on('edit-message', async (data: { messageId: string, content: string, chatId: string }) => {
      try {
        const { messageId, content, chatId } = data;
        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        if (!msg) return;

        // Verify sender and time limit (15 mins)
        if (msg.senderId !== userId) return;
        
        const now = new Date();
        const diffMs = now.getTime() - new Date(msg.createdAt).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins > 15) {
          socket.emit('error', 'Message can only be edited within 15 minutes of sending');
          return;
        }

        const updatedMessage = await prisma.message.update({
          where: { id: messageId },
          data: { content, isEdited: true } as any,
          include: { replyTo: true, sender: true }
        });

        chatNamespace.to(chatId).emit('message-updated', updatedMessage);
      } catch (err) {
        console.error('Error editing message:', err);
      }
    });

    socket.on('vote-poll', async ({ messageId, optionId, chatId }) => {
      try {
        const message = await prisma.message.findUnique({
          where: { id: messageId }
        });
        
        if (message && (message.type as any) === 'POLL' && (message as any).metadata) {
          const meta = (message as any).metadata as any;
          if (meta.poll && meta.poll.options) {
            // Find if user already voted (remove previous vote if not multipleAnswers)
            let userVotedOptionId: string | null = null;
            meta.poll.options.forEach((opt: any) => {
              if (opt.votes && opt.votes.includes(userId)) {
                userVotedOptionId = opt.id;
              }
            });

            // If user clicked the same option they already voted for, remove their vote
            if (userVotedOptionId === optionId) {
               const option = meta.poll.options.find((o: any) => o.id === optionId);
               if (option && option.votes) {
                 option.votes = option.votes.filter((id: string) => id !== userId);
               }
            } else {
               // Add new vote, remove from old if multipleAnswers is false
               if (!meta.poll.multipleAnswers && userVotedOptionId) {
                  const oldOption = meta.poll.options.find((o: any) => o.id === userVotedOptionId);
                  if (oldOption && oldOption.votes) {
                    oldOption.votes = oldOption.votes.filter((id: string) => id !== userId);
                  }
               }
               
               const option = meta.poll.options.find((o: any) => o.id === optionId);
               if (option) {
                 if (!option.votes) option.votes = [];
                 option.votes.push(userId);
               }
            }

            const updatedMessage = await prisma.message.update({
              where: { id: messageId },
              data: { metadata: meta } as any,
              include: { replyTo: true, sender: true }
            });

            chatNamespace.to(chatId).emit('message-updated', updatedMessage);
          }
        }
      } catch (err) {
        console.error('Error voting on poll:', err);
      }
    });

    socket.on('call-offer', async ({ chatId, signalData, type, targetUserId }) => {
      if (!chatId) return;
      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { participants: { include: { user: true } } }
      });
      if (!chat) return;

      const callerParticipant = chat.participants.find((p: any) => p.userId === userId);
      const callerName = callerParticipant?.user.name || callerParticipant?.user.phoneNumber || 'Someone';

      if (targetUserId) {
        // Targeted offer (for group mesh)
        chatNamespace.to(targetUserId).emit('call-offer', {
          callerId: userId,
          callerName,
          signalData,
          chatId,
          type
        });
      } else {
        // Group or 1:1 broadcast offer to all other participants
        chat.participants.forEach((p: any) => {
          if (p.userId !== userId) {
            chatNamespace.to(p.userId).emit('call-offer', {
              callerId: userId,
              callerName: chat.isGroup ? `${chat.name} (${callerName})` : callerName,
              signalData,
              chatId,
              type,
              isGroup: chat.isGroup
            });
          }
        });
      }
    });

    socket.on('call-answer', async ({ chatId, signalData, targetUserId }) => {
      if (targetUserId) {
        chatNamespace.to(targetUserId).emit('call-answer', { signalData, callerId: userId });
      } else {
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          include: { participants: true }
        });
        if (!chat) return;
        const otherParticipant = chat.participants.find((p: any) => p.userId !== userId);
        if (otherParticipant) {
          chatNamespace.to(otherParticipant.userId).emit('call-answer', { signalData, callerId: userId });
        }
      }
    });

    socket.on('ice-candidate', async ({ chatId, candidate, targetUserId }) => {
      if (targetUserId) {
        chatNamespace.to(targetUserId).emit('ice-candidate', { candidate, callerId: userId });
      } else {
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          include: { participants: true }
        });
        if (!chat) return;
        const otherParticipant = chat.participants.find((p: any) => p.userId !== userId);
        if (otherParticipant) {
          chatNamespace.to(otherParticipant.userId).emit('ice-candidate', { candidate, callerId: userId });
        }
      }
    });

    socket.on('call-invite-participant', ({ chatId, targetUserId }) => {
      // Broadcast to everyone in the room that a new participant is being invited
      socket.to(`call-room-${chatId}`).emit('participant-invited', { targetUserId, inviterId: userId });
    });

    // ----------------------------------------------------
    // INSTANT MEETING ROOM SIGNALING (Zoom / Meet Style)
    // ----------------------------------------------------
    socket.on('join-instant-meeting', async ({ code, userName, userAvatar }) => {
      try {
        const meeting = await (prisma as any).meeting.findUnique({
          where: { code },
          include: { host: { select: { id: true, name: true, profilePicture: true, image: true } } }
        });

        if (!meeting || !meeting.isActive) {
          socket.emit('instant-meeting-error', { error: 'Meeting not found or has ended' });
          return;
        }

        const isHost = meeting.hostId === userId;

        const dbUser = userId ? await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, profilePicture: true, image: true, phoneNumber: true }
        }) : null;

        const resolvedName = userName && userName !== 'Guest Participant' ? userName : (dbUser?.name || dbUser?.phoneNumber || (isHost ? meeting.host.name || 'Host' : 'Participant'));
        const resolvedAvatar = userAvatar || dbUser?.profilePicture || dbUser?.image || null;

        socket.data.userName = resolvedName;
        socket.data.userAvatar = resolvedAvatar;
        socket.data.isHost = isHost;

        // Fetch existing participants in the room before joining
        const roomAdapter = chatNamespace.adapter.rooms.get(`meeting-room-${code}`);
        const existingParticipants: any[] = [];
        if (roomAdapter) {
          for (const sId of roomAdapter) {
            if (sId !== socket.id) {
              const s = chatNamespace.sockets.get(sId);
              if (s) {
                existingParticipants.push({
                  socketId: s.id,
                  userName: s.data.userName || 'Participant',
                  userAvatar: s.data.userAvatar || null,
                  isHost: s.data.isHost || false
                });
              }
            }
          }
        }

        // Admit to meeting room
        socket.join(`meeting-room-${code}`);

        // Notify room of new participant
        socket.to(`meeting-room-${code}`).emit('meeting-participant-joined', {
          socketId: socket.id,
          userId,
          userName: resolvedName,
          userAvatar: resolvedAvatar,
          isHost
        });

        socket.emit('instant-meeting-admitted', {
          code,
          isHost,
          meetingTitle: meeting.title,
          callType: meeting.callType,
          existingParticipants
        });
      } catch (err) {
        console.error('Error joining instant meeting:', err);
        socket.emit('instant-meeting-error', { error: 'Failed to join meeting' });
      }
    });

    socket.on('approve-meeting-guest', ({ code, guestSocketId }) => {
      const guestSocket = chatNamespace.sockets.get(guestSocketId);
      if (guestSocket) {
        const roomAdapter = chatNamespace.adapter.rooms.get(`meeting-room-${code}`);
        const existingParticipants: any[] = [];
        if (roomAdapter) {
          for (const sId of roomAdapter) {
            if (sId !== guestSocket.id) {
              const s = chatNamespace.sockets.get(sId);
              if (s) {
                existingParticipants.push({
                  socketId: s.id,
                  userName: s.data.userName || 'Participant',
                  userAvatar: s.data.userAvatar || null,
                  isHost: s.data.isHost || false
                });
              }
            }
          }
        }

        guestSocket.join(`meeting-room-${code}`);
        guestSocket.emit('instant-meeting-admitted', {
          code,
          isHost: false,
          meetingTitle: 'Instant Nexus Meeting',
          existingParticipants
        });

        chatNamespace.to(`meeting-room-${code}`).emit('meeting-participant-joined', {
          socketId: guestSocket.id,
          userId: guestSocket.data.userId || 'guest',
          userName: guestSocket.data.userName || 'Guest Participant',
          userAvatar: guestSocket.data.userAvatar || null,
          isHost: false
        });
      }
    });

    socket.on('reject-meeting-guest', ({ code, guestSocketId }) => {
      chatNamespace.to(guestSocketId).emit('meeting-entry-denied', { reason: 'Host declined entry request' });
    });

    socket.on('meeting-host-mute-all', ({ code }) => {
      socket.to(`meeting-room-${code}`).emit('meeting-muted-by-host');
    });

    socket.on('leave-instant-meeting', ({ code }) => {
      socket.leave(`meeting-room-${code}`);
      chatNamespace.to(`meeting-room-${code}`).emit('meeting-participant-left', { socketId: socket.id });
    });

    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('meeting-room-')) {
          chatNamespace.to(room).emit('meeting-participant-left', { socketId: socket.id });
        }
      }
    });

    socket.on('meeting-host-remove-participant', ({ code, targetSocketId }) => {
      chatNamespace.to(targetSocketId).emit('meeting-kicked-by-host', { code });
      
      const targetSocket = chatNamespace.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.leave(`meeting-room-${code}`);
      }
      
      chatNamespace.to(`meeting-room-${code}`).emit('meeting-participant-left', { socketId: targetSocketId });
    });

    // Multi-Peer WebRTC Audio/Video Signaling
    socket.on('meeting-signal-offer', ({ targetSocketId, offer, callerName, callerAvatar, isHost }) => {
      chatNamespace.to(targetSocketId).emit('meeting-signal-offer', {
        callerSocketId: socket.id,
        offer,
        callerName,
        callerAvatar,
        isHost
      });
    });

    socket.on('meeting-signal-answer', ({ targetSocketId, answer }) => {
      chatNamespace.to(targetSocketId).emit('meeting-signal-answer', {
        responderSocketId: socket.id,
        answer
      });
    });

    socket.on('meeting-signal-candidate', ({ targetSocketId, candidate }) => {
      chatNamespace.to(targetSocketId).emit('meeting-signal-candidate', {
        senderSocketId: socket.id,
        candidate
      });
    });

    socket.on('meeting-hand-toggle', ({ code, isRaised, userName }) => {
      chatNamespace.to(`meeting-room-${code}`).emit('meeting-hand-updated', {
        socketId: socket.id,
        userId,
        userName,
        isRaised
      });
    });

    socket.on('meeting-send-chat', ({ code, content, userName }) => {
      chatNamespace.to(`meeting-room-${code}`).emit('meeting-chat-received', {
        id: Date.now().toString(),
        socketId: socket.id,
        senderId: userId,
        senderName: userName || 'Participant',
        content,
        timestamp: new Date()
      });
    });

    socket.on('end-call', async ({ chatId, duration, type, isInitiator, targetUserId, isGroup, participantsInfo }) => {
      if (targetUserId) {
        chatNamespace.to(targetUserId).emit('call-end', { callerId: userId });
        activeCallRooms.delete(chatId);
        chatNamespace.emit('active-call-update', { chatId, activeCount: 0, callType: type || 'VIDEO' });
        return;
      }

      const room = activeCallRooms.get(chatId);
      if (room) {
        if (room.participants.has(userId)) {
          room.participants.get(userId)!.status = 'LEFT';
        }
        const connectedCount = Array.from(room.participants.values()).filter(p => p.status === 'CONNECTED').length;
        if (connectedCount > 1) {
          socket.leave(`call-room-${chatId}`);
          socket.to(`call-room-${chatId}`).emit('call-room-user-left', { chatId, userId });
          broadcastRoomState(chatId);
          return;
        }
      }

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { participants: { include: { user: true } } }
      });
      
      if (!chat) return;

      let roomParticipantsList: any[] = [];
      const participantsMap = new Map();
      
      // Seed with client participantsInfo if available
      if (participantsInfo && Array.isArray(participantsInfo)) {
        participantsInfo.forEach((p: any) => {
           participantsMap.set(p.userId, {
             userId: p.userId,
             name: p.name,
             avatar: p.avatar,
             status: p.status === 'JOINED' ? 'JOINED' : (p.status === 'LEFT' ? 'LEFT' : 'INVITED')
           });
        });
      }

      // Add actual caller to map if not present
      if (!participantsMap.has(userId)) {
        participantsMap.set(userId, { userId, name: 'Caller', avatar: null, status: 'JOINED' });
      }

      // Override with server's authoritative state
      if (room) {
        room.participants.forEach(p => {
          participantsMap.set(p.userId, {
            userId: p.userId,
            name: p.name || participantsMap.get(p.userId)?.name || '',
            avatar: p.avatar || participantsMap.get(p.userId)?.avatar || null,
            status: ((p.status as string) === 'CONNECTED' || (p.status as string) === 'JOINED') ? 'JOINED' : ((p.status as string) === 'LEFT' ? 'LEFT' : 'INVITED')
          });
        });
      }

      // Always include the other participant if it's a 1:1 chat, or all members for group chat
      if (!chat.isGroup) {
         const other = chat.participants.find((p: any) => p.userId !== userId);
         if (other && !participantsMap.has(other.userId)) {
           participantsMap.set(other.userId, {
              userId: other.userId,
              name: other.user?.name || other.user?.phoneNumber || 'Contact',
              avatar: other.user?.profilePicture || null,
              status: 'INVITED'
           });
         }
      } else {
         chat.participants.forEach((p: any) => {
           if (p.userId !== userId && !participantsMap.has(p.userId)) {
             participantsMap.set(p.userId, {
                userId: p.userId,
                name: p.user?.name || p.user?.phoneNumber || 'Contact',
                avatar: p.user?.profilePicture || null,
                status: 'INVITED'
             });
           }
         });
      }

      roomParticipantsList = Array.from(participantsMap.values());
      const isMultiGroup = Boolean(room ? (room.everJoinedUserIds.size > 2 || room.participants.size > 2) : isGroup) || roomParticipantsList.length > 2;

      if (room) {
        activeCallRooms.delete(chatId);
      }
      chatNamespace.emit('active-call-update', { chatId, activeCount: 0, callType: type || 'VIDEO' });
      
      const otherParticipant = chat.participants.find((p: any) => p.userId !== userId);
      if (!otherParticipant && !chat.isGroup) return;

      const actualCallerId = isInitiator ? userId : (otherParticipant ? otherParticipant.userId : userId);
      
      try {
        const content = JSON.stringify({
          action: duration === -1 ? 'MISSED' : 'ENDED',
          duration: duration === -1 ? 0 : duration,
          type: type || 'VIDEO',
          isGroup: isMultiGroup || chat.isGroup,
          participants: roomParticipantsList
        });

        const callLogMsg = await prisma.message.create({
          data: {
            chatId,
            senderId: actualCallerId,
            type: 'CALL_LOG' as any,
            content,
            statuses: {
              create: chat.participants
                .filter((p: any) => p.userId !== userId)
                .map((p: any) => ({
                  userId: p.userId,
                  status: 'SENT'
                }))
            }
          },
          include: {
            statuses: true
          }
        });

        const callLogWithStatus = { ...callLogMsg, status: 'SENT' };
        chatNamespace.to(chatId).emit('receive-message', callLogWithStatus);
        
        chat.participants.forEach((p: any) => {
          chatNamespace.to(p.userId).emit('receive-message', callLogWithStatus);
          if (p.userId !== userId) {
            chatNamespace.to(p.userId).emit('call-end', { callerId: userId });
          }
        });

        // Also notify anyone who was invited but is not a participant of this chat
        roomParticipantsList.forEach(p => {
          const isInChat = chat.participants.some((cp: any) => cp.userId === p.userId);
          if (!isInChat && p.userId !== userId) {
            chatNamespace.to(p.userId).emit('call-end', { callerId: userId });
          }
        });
      } catch (err) {
        console.error('Failed to log call', err);
      }
    });

    socket.on('disconnect', async () => {
      clearInterval(interval);

      // Clean up active call rooms when socket disconnects (e.g. page refresh)
      for (const [chatId, room] of activeCallRooms.entries()) {
        if (room.participants.has(userId)) {
          room.participants.delete(userId);

          const activeParticipants = Array.from(room.participants.values()).filter(
            (p: any) => p.status === 'CONNECTED' || p.status === 'JOINED'
          );

          const isGroupCall = room.everJoinedUserIds.size > 2 || room.participants.size > 2 || Boolean((room as any).isGroup);

          if (isGroupCall) {
            // Group call: if other members remain, group call stays alive!
            if (activeParticipants.length > 0) {
              chatNamespace.to(`call-room-${chatId}`).emit('call-room-user-left', { chatId, userId });
              chatNamespace.to(`call-room-${chatId}`).emit('call-end', { callerId: userId });
              chatNamespace.emit('active-call-update', { chatId, activeCount: activeParticipants.length, callType: 'VIDEO' });
              broadcastRoomState(chatId);
            } else {
              activeCallRooms.delete(chatId);
              chatNamespace.emit('active-call-update', { chatId, activeCount: 0, callType: 'VIDEO' });
            }
          } else {
            // 1:1 Personal Call: when a user leaves/refreshes, 1:1 call ends for both
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
          // Live Stream Cleanup on disconnect
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
