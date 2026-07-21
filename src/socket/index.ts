import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PrismaClient } from '@prisma/client';

import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../lib/auth';

const prisma = new PrismaClient();

// In-memory mapping of userId to socketId for direct routing
const userSocketMap = new Map<string, string>();

export function setupSocket(server: HttpServer) {
  const io = new Server(server, {
    cors: {
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000', process.env.FRONTEND_URL || 'https://chat-app-two-khaki-va269vxf6w.vercel.app'].filter(Boolean),
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

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

    userSocketMap.set(userId, socket.id);
    
    // Mark user as online
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline: true }
    });
    chatNamespace.emit('user-status-changed', { userId, isOnline: true });

    socket.on('join-room', (roomId: string) => {
      socket.join(roomId);
    });

    socket.on('typing', ({ chatId, isTyping }) => {
      socket.to(chatId).emit('typing', { chatId, userId, isTyping });
    });

    socket.on('send-message', async (data, callback) => {
      const { chatId, content, type, mediaUrl, tempId } = data;
      // In a real app, you'd save the message to the DB here and then broadcast
      // For performance, we broadcast immediately and save async
      const message = await prisma.message.create({
        data: { chatId, senderId: userId, content, type, mediaUrl }
      });
      
      socket.to(chatId).emit('receive-message', message);
      
      if (typeof callback === 'function') {
        callback({ message, tempId });
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

    // WebRTC Signaling
    socket.on('call-offer', async ({ chatId, signalData, type, targetUserId }) => {
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
          type: type || 'VIDEO'
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

        // Broadcast the call log message to everyone
        chatNamespace.to(chatId).emit('receive-message', callLogMsg);
        
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
      userSocketMap.delete(userId);
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: false, lastSeen: new Date() }
      });
      chatNamespace.emit('user-status-changed', { userId, isOnline: false, lastSeen: new Date() });
    });
  });
}
