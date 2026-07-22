import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth';
import { redis } from '../lib/redis';

const prisma = new PrismaClient();

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

  const chatNamespace = io.of('/chat');

  chatNamespace.use(async (socket, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(socket.handshake.headers as any)
      });
      if (!session || !session.user) {
        return next(new Error('Authentication error'));
      }
      socket.data.userId = session.user.id;
      next();
    } catch (err) {
      return next(new Error('Authentication error'));
    }
  });

  chatNamespace.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    
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

    // Mark pending messages as delivered
    try {
      const userChats = await prisma.chatParticipant.findMany({
        where: { userId },
        select: { chatId: true }
      });
      const chatIds = userChats.map((c: any) => c.chatId);

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
      const { chatId, content, type, mediaUrl, tempId, replyToId } = data;
      // In a real app, you'd save the message to the DB here and then broadcast
      // For performance, we broadcast immediately and save async
      const message = await prisma.message.create({
        data: { chatId, senderId: userId, content, type, mediaUrl, replyToId },
        include: { replyTo: true }
      });
      
      socket.to(chatId).emit('receive-message', message);
      
      if (typeof callback === 'function') {
        callback({ message, tempId });
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
        
        let reactions = msg.reactions ? (msg.reactions as Record<string, string>) : {};
        if (reactions[userId] === reaction) {
          delete reactions[userId]; // Toggle off
        } else {
          reactions[userId] = reaction; // Set new
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

    // WebRTC Signaling
    
    // Server-side state for active group calls (chatId -> Set of userIds currently connected in the call)
    const activeGroupCalls = new Map<string, Set<string>>();

    socket.on('group-call-join', ({ chatId }) => {
      if (!activeGroupCalls.has(chatId)) {
        activeGroupCalls.set(chatId, new Set());
      }
      const participants = activeGroupCalls.get(chatId)!;
      // Get current participants BEFORE adding the new user, so the new user initiates offers to them
      const existingParticipants = Array.from(participants);
      
      participants.add(userId);
      
      // Tell the joined user who is already in the call so they can initiate P2P offers to them
      socket.emit('group-call-participants', { chatId, participants: existingParticipants });
    });

    socket.on('group-call-leave', ({ chatId }) => {
      if (activeGroupCalls.has(chatId)) {
        const participants = activeGroupCalls.get(chatId)!;
        participants.delete(userId);
        if (participants.size === 0) {
          activeGroupCalls.delete(chatId);
        }
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
      
      if (targetUserId) {
        // Targeted offer (for group mesh)
        chatNamespace.to(targetUserId).emit('call-offer', {
          callerId: userId,
          callerName: callerParticipant?.user.name || callerParticipant?.user.phoneNumber,
          signalData,
          chatId,
          type
        });
      } else {
        // 1:1 fallback
        const otherParticipant = chat.participants.find((p: any) => p.userId !== userId);
        if (otherParticipant) {
          chatNamespace.to(otherParticipant.userId).emit('call-offer', {
            callerId: userId,
            callerName: callerParticipant?.user.name || callerParticipant?.user.phoneNumber,
            signalData,
            chatId,
            type
          });
        }
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

    socket.on('end-call', async ({ chatId, duration, type, isInitiator, targetUserId }) => {
      if (targetUserId) {
        // Targeted end-call for mesh network (just drop connection)
        chatNamespace.to(targetUserId).emit('call-end', { callerId: userId });
        return;
      }

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { participants: true }
      });
      if (!chat) return;
      
      const otherParticipant = chat.participants.find((p: any) => p.userId !== userId);
      if (!otherParticipant && !chat.isGroup) return;

      // Determine who actually initiated the call for the chat history log
      const actualCallerId = isInitiator ? userId : (otherParticipant ? otherParticipant.userId : userId);
      
      // Log the call as a message
      try {
        const content = JSON.stringify({
          action: duration === -1 ? 'MISSED' : 'ENDED',
          duration: duration === -1 ? 0 : duration,
          type: type || 'VIDEO',
          isGroup: chat.isGroup
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
                  status: 'SENT' // Initial status
                }))
            }
          },
          include: {
            statuses: true
          }
        });

        // Broadcast the call log message to everyone with explicit status
        const callLogWithStatus = { ...callLogMsg, status: 'SENT' };
        chatNamespace.to(chatId).emit('receive-message', callLogWithStatus);
        
        chat.participants.forEach((p: any) => {
          if (p.userId !== userId) {
            chatNamespace.to(p.userId).emit('call-end', { callerId: userId });
          }
        });
      } catch (err) {
        console.error('Failed to log call', err);
      }
    });

    socket.on('disconnect', async () => {
      clearInterval(interval);
      await redis.del(`online:${userId}`);
      
      await prisma.user.update({
        where: { id: userId },
        data: { lastSeen: new Date() }
      });
      chatNamespace.emit('user-status-changed', { userId, isOnline: false, lastSeen: new Date() });
    });
  });
}
