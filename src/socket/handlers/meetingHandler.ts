import { Server, Socket } from 'socket.io';
import { prisma } from '../../lib/prisma';

export const registerMeetingHandlers = (io: Server, socket: Socket, chatNamespace: any) => {
  const userId = socket.data.userId;

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

      socket.join(`meeting-room-${code}`);

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

  socket.on('meeting-host-remove-participant', ({ code, targetSocketId }) => {
    chatNamespace.to(targetSocketId).emit('meeting-kicked-by-host', { code });
    const targetSocket = chatNamespace.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.leave(`meeting-room-${code}`);
    }
    chatNamespace.to(`meeting-room-${code}`).emit('meeting-participant-left', { socketId: targetSocketId });
  });

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
};
