import { Server, Socket } from 'socket.io';
import { prisma } from '../../lib/prisma';
import { activeCallRooms } from '../index';

export const registerCallHandlers = (io: Server, socket: Socket, chatNamespace: any) => {
  const userId = socket.data.userId;

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
      chatNamespace.to(targetUserId).emit('call-offer', {
        callerId: userId,
        callerName,
        signalData,
        chatId,
        type
      });
    } else {
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
    socket.to(`call-room-${chatId}`).emit('participant-invited', { targetUserId, inviterId: userId });
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

    if (!participantsMap.has(userId)) {
      participantsMap.set(userId, { userId, name: 'Caller', avatar: null, status: 'JOINED' });
    }

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
};
