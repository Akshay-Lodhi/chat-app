import { Server, Socket } from 'socket.io';
import { activeLiveStreams } from '../../controllers/live.controller';

export const registerLiveHandlers = (io: Server, socket: Socket, chatNamespace: any) => {
  const userId = socket.data.userId;

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
      chatNamespace.to(`live_${streamId}`).emit('live-viewer-count', viewerPayload);
      chatNamespace.emit('live-viewer-count', viewerPayload);
    }

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
    const session = activeLiveStreams.get(streamId);
    if (session && session.mutedUserIds?.includes(comment.userId)) {
      return; 
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
      chatNamespace.to(targetUserId).emit('live-signal', {
        streamId,
        signalData,
        fromUserId: userId
      });
    } else {
      socket.to(`live_${streamId}`).emit('live-signal', {
        streamId,
        signalData,
        fromUserId: userId
      });
    }
  });
};
