import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

export class ChatService {
  static async getChatsForUser(userId: string) {
    const chats = await prisma.chat.findMany({
      where: {
        participants: {
          some: { userId }
        }
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true, lastSeen: true } }
          }
        },
        messages: {
          where: {
            NOT: {
              isScheduled: true,
              scheduledStatus: 'PENDING'
            },
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } }
            ]
          } as any,
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: userId },
                NOT: [
                  { statuses: { some: { userId, status: 'READ' } } },
                  { isScheduled: true, scheduledStatus: 'PENDING' }
                ]
              } as any
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Extract all unique user IDs to fetch their online status from Redis
    const participantIds = new Set<string>();
    chats.forEach((chat: any) => {
      chat.participants.forEach((p: any) => participantIds.add(p.userId));
    });

    const uniqueParticipantIds = Array.from(participantIds);
    let onlineStatuses: Record<string, boolean> = {};

    if (uniqueParticipantIds.length > 0) {
      try {
        const redisKeys = uniqueParticipantIds.map(id => `online:${id}`);
        const redisValues = await redis.mget(...redisKeys);
        
        uniqueParticipantIds.forEach((id, index) => {
          onlineStatuses[id] = redisValues[index] !== null;
        });
      } catch (error) {
        console.error('Failed to fetch online statuses from Redis:', error);
      }
    }

    return chats.map((chat: any) => {
      let name = chat.name;
      let picture = chat.groupPicture;
      
      // Inject the true online status into the participants
      const participantsWithOnline = chat.participants.map((p: any) => ({
        ...p,
        user: {
          ...p.user,
          isOnline: onlineStatuses[p.userId] || false
        }
      }));
      
      if (!chat.isGroup) {
        const otherParticipant = participantsWithOnline.find((p: any) => p.userId !== userId);
        if (otherParticipant) {
          name = otherParticipant.user.name || otherParticipant.user.phoneNumber;
          picture = otherParticipant.user.profilePicture;
        }
      }

      return {
        ...chat,
        name,
        groupPicture: picture,
        participants: participantsWithOnline,
        lastMessage: chat.messages[0] || null,
        unreadCount: chat._count?.messages || 0,
        messages: undefined,
        _count: undefined
      };
    });
  }

  static async createOneOnOneChat(userId: string, contactId: string) {
    const existingChat = await prisma.chat.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: contactId } } }
        ]
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } } }
        }
      }
    });

    if (existingChat) {
      return existingChat;
    }

    return await prisma.chat.create({
      data: {
        isGroup: false,
        participants: {
          create: [
            { userId },
            { userId: contactId }
          ]
        }
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } } }
        }
      }
    });
  }

  static async togglePinChat(userId: string, chatId: string) {
    const participant = await prisma.chatParticipant.findUnique({
      where: {
        userId_chatId: {
          userId,
          chatId
        }
      }
    });

    if (!participant) {
      throw new Error('Not a participant in this chat');
    }

    const updated = await prisma.chatParticipant.update({
      where: {
        userId_chatId: {
          userId,
          chatId
        }
      },
      data: {
        isPinned: !participant.isPinned
      }
    });

    return { success: true, isPinned: updated.isPinned, chatId };
  }

  static async createGroupChat(userId: string, name: string, participantIds: string[], groupPicture?: string) {
    const allParticipantIds = Array.from(new Set([userId, ...participantIds]));
    
    return await prisma.chat.create({
      data: {
        isGroup: true,
        name,
        groupPicture,
        adminId: userId,
        participants: {
          create: allParticipantIds.map(id => ({ userId: id }))
        }
      },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } } }
        }
      }
    });
  }

  static async addParticipantsToGroup(userId: string, chatId: string, participantIds: string[]) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true }
    });

    if (!chat || !chat.isGroup) {
      throw new Error('Group chat not found');
    }
    
    // Only admins can add people
    if (chat.adminId !== userId) {
      throw new Error('Only the group admin can add participants');
    }

    // Filter out participants that are already in the group
    const existingIds = chat.participants.map((p: any) => p.userId);
    const newParticipantIds = participantIds.filter(id => !existingIds.includes(id));

    if (newParticipantIds.length === 0) {
      return chat;
    }

    await prisma.chatParticipant.createMany({
      data: newParticipantIds.map(id => ({
        chatId,
        userId: id
      }))
    });

    return await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true, about: true } } }
        }
      }
    });
  }

  static async removeParticipantFromGroup(userId: string, chatId: string, participantId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true }
    });

    if (!chat || !chat.isGroup) {
      throw new Error('Group chat not found');
    }
    
    // Only admins can remove people (or the person themselves leaving)
    if (chat.adminId !== userId && participantId !== userId) {
      throw new Error('Only the group admin can remove participants');
    }

    if (chat.adminId === participantId) {
      throw new Error('Admin cannot be removed. Transfer admin rights or delete the group.');
    }

    await prisma.chatParticipant.deleteMany({
      where: {
        chatId,
        userId: participantId
      }
    });

    return await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true, about: true } } }
        }
      }
    });
  }

  static async updateGroupPicture(userId: string, chatId: string, pictureUrl: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat || !chat.isGroup) {
      throw new Error('Group chat not found');
    }
    
    if (chat.adminId !== userId) {
      throw new Error('Only the group admin can update the group picture');
    }

    return prisma.chat.update({
      where: { id: chatId },
      data: { groupPicture: pictureUrl },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true, about: true } } }
        }
      }
    });
  }

  static async deleteGroupChat(userId: string, chatId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat not found');
    }

    if (!chat.isGroup) {
      throw new Error('Cannot delete a 1-on-1 chat');
    }

    if (chat.adminId !== userId) {
      throw new Error('Not authorized to delete this group');
    }

    // Delete all message statuses for messages in this chat
    await prisma.messageStatus.deleteMany({
      where: { message: { chatId } }
    });

    // Delete all messages in this chat
    await prisma.message.deleteMany({
      where: { chatId }
    });

    // Delete all participants
    await prisma.chatParticipant.deleteMany({
      where: { chatId }
    });

    // Delete the chat itself
    await prisma.chat.delete({
      where: { id: chatId }
    });
  }

  static async getMessagesForChat(userId: string, chatId: string, limit = 50, cursor?: string) {
    // We will expand cursor logic in Phase 2
    const messages = await prisma.message.findMany({
      where: {
        chatId,
        NOT: {
          isScheduled: true,
          scheduledStatus: 'PENDING'
        },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      } as any,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' }
      ],
      take: limit,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: { statuses: true, replyTo: true, starredBy: { select: { userId: true } } }
    });

    const formatted = messages.map((msg: any) => {
      let status = 'SENT';
      let deliveredAt = undefined;
      let readAt = undefined;
      
      const deliveredStatus = msg.statuses.find((s: any) => s.status === 'DELIVERED');
      const readStatus = msg.statuses.find((s: any) => s.status === 'READ');

      if (readStatus) {
        status = 'READ';
        readAt = readStatus.updatedAt;
        deliveredAt = deliveredStatus ? deliveredStatus.updatedAt : readStatus.updatedAt;
      } else if (deliveredStatus) {
        status = 'DELIVERED';
        deliveredAt = deliveredStatus.updatedAt;
      }
      
      const isStarred = msg.starredBy?.some((s: any) => s.userId === userId) || false;

      return {
        ...msg,
        status,
        deliveredAt,
        readAt,
        isStarred,
        statuses: undefined,
        starredBy: undefined
      };
    });

    return formatted.reverse();
  }

  static async deleteMessage(userId: string, messageId: string, deleteFor: 'me' | 'everyone') {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new Error('Message not found');
    // Note: If you see TS errors here, please restart your IDE's TS Server (the Prisma Client was recently regenerated).
    if (deleteFor === 'everyone') {
      // Only the sender can delete for everyone
      if (message.senderId !== userId) throw new Error('Only the sender can delete for everyone');
      
      // Enforce 24-hour limit
      const now = new Date();
      const messageAgeMs = now.getTime() - message.createdAt.getTime();
      const hoursAge = messageAgeMs / (1000 * 60 * 60);
      if (hoursAge > 24) {
        throw new Error('Messages can only be deleted for everyone within 24 hours of sending');
      }

      // @ts-ignore - Bypass IDE cache for newly generated Prisma fields
      await prisma.message.update({
        where: { id: messageId },
        data: {
          deletedForEveryone: true,
          deletedAt: now,
          content: null, // Optional: clear content from DB for privacy
          mediaUrl: null
        } as any
      });
    } else {
      // Delete for 'me'
      // @ts-ignore
      if (!message.deletedForUsers.includes(userId)) {
        // @ts-ignore - Bypass IDE cache for newly generated Prisma fields
        await prisma.message.update({
          where: { id: messageId },
          data: {
            deletedForUsers: {
              push: userId
            }
          } as any
        });
      }
    }
    // @ts-ignore
    return { chatId: message.chatId, deletedForEveryone: deleteFor === 'everyone', deletedForUsers: deleteFor === 'me' ? [...message.deletedForUsers, userId] : message.deletedForUsers };
  }

  static async clearChatMessages(userId: string, chatId: string) {
    // Verify user is participant
    const participant = await prisma.chatParticipant.findFirst({
      where: { chatId, userId }
    });
    if (!participant) throw new Error('Not a participant of this chat');

    // Delete all messages in this chat
    await prisma.message.deleteMany({ where: { chatId } });
  }

  static async getCallsForUser(userId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;

    // 1. Fetch Call table records
    const callWhere = {
      OR: [
        { callerId: userId },
        { receiverId: userId },
        { participants: { some: { userId } } }
      ]
    };

    // 2. Fetch CALL_LOG message records
    const messageWhere = {
      type: 'CALL_LOG' as const,
      chat: {
        participants: {
          some: { userId }
        }
      }
    };

    const [dbCalls, callMessages] = await Promise.all([
      prisma.call.findMany({
        where: callWhere,
        include: {
          caller: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } },
          receiver: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } },
          participants: { include: { user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } } } },
          chat: { select: { id: true, name: true, isGroup: true, groupPicture: true } }
        },
        orderBy: { startedAt: 'desc' }
      }),
      prisma.message.findMany({
        where: messageWhere,
        include: {
          sender: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } },
          chat: {
            include: {
              participants: {
                include: {
                  user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Format CALL_LOG messages into Call-compatible objects
    const formattedMessageCalls = callMessages.map((msg: any) => {
      let callData: any = {};
      try { callData = JSON.parse(msg.content || '{}'); } catch (e) {}

      const isMine = msg.senderId === userId;
      const otherParticipant = msg.chat?.participants?.find((p: any) => p.userId !== userId)?.user;

      const duration = typeof callData.duration === 'number' ? callData.duration : 0;
      const isUnanswered = duration === 0 || callData.action === 'MISSED' || callData.action === 'NO_ANSWER' || callData.status === 'MISSED' || callData.status === 'REJECTED';

      let parsedParticipants = msg.chat?.participants || [];
      if (callData.participants && Array.isArray(callData.participants) && callData.participants.length > 0) {
        parsedParticipants = callData.participants.map((p: any) => ({
          user: {
            id: p.userId || p.id,
            name: p.name || 'Unknown',
            profilePicture: p.avatar || p.profilePicture || null,
            phoneNumber: p.phoneNumber || ''
          }
        }));
      }

      return {
        id: msg.id,
        chatId: msg.chatId,
        callerId: msg.senderId,
        receiverId: isMine ? otherParticipant?.id : userId,
        status: isUnanswered ? 'MISSED' : 'COMPLETED',
        type: callData.type || 'AUDIO',
        startedAt: msg.createdAt,
        duration: isUnanswered ? 0 : duration,
        caller: msg.sender,
        receiver: otherParticipant,
        chat: msg.chat,
        participants: parsedParticipants,
        joinedParticipantIds: callData.joinedParticipantIds || (callData.participants ? callData.participants.filter((p: any) => p.hasJoined || p.joined || p.status === 'JOINED').map((p: any) => p.id || p.userId) : [])
      };
    });

    // Combine & deduplicate by ID
    const allCallsMap = new Map<string, any>();
    [...dbCalls, ...formattedMessageCalls].forEach(c => allCallsMap.set(c.id, c));

    const combined = Array.from(allCallsMap.values());
    combined.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    const total = combined.length;
    const paginatedCalls = combined.slice(skip, skip + limit);

    return {
      calls: paginatedCalls,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  static async clearCallLogsForUser(userId: string) {
    // Delete calls involving user (caller, receiver, or participant)
    await prisma.call.deleteMany({
      where: {
        OR: [
          { callerId: userId },
          { receiverId: userId },
          { participants: { some: { userId } } }
        ]
      }
    });

    // Delete all CALL_LOG messages in chats where user is a participant
    await prisma.message.deleteMany({
      where: {
        type: 'CALL_LOG',
        chat: {
          participants: {
            some: { userId }
          }
        }
      }
    });
  }

  static async toggleStarMessage(userId: string, messageId: string) {
    const existing = await prisma.starredMessage.findUnique({
      where: {
        userId_messageId: {
          userId,
          messageId
        }
      }
    });

    if (existing) {
      await prisma.starredMessage.delete({
        where: { 
          userId_messageId: {
            userId,
            messageId
          }
        }
      });
      return { success: true, isStarred: false, messageId };
    } else {
      await prisma.starredMessage.create({
        data: {
          userId,
          messageId
        }
      });
      return { success: true, isStarred: true, messageId };
    }
  }

  static async getStarredMessages(userId: string) {
    const starred = await prisma.starredMessage.findMany({
      where: { userId },
      include: {
        message: {
          include: {
            sender: {
              select: { id: true, name: true, phoneNumber: true, profilePicture: true }
            },
            chat: {
              select: { id: true, isGroup: true, name: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return starred.map((s: any) => s.message);
  }

  static async togglePinMessage(userId: string, messageId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { chat: true }
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // If it's a group, only the admin can pin/unpin messages
    if (message.chat.isGroup && message.chat.adminId !== userId) {
      throw new Error('Only the group admin can pin messages');
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: !message.isPinned }
    });

    return { success: true, isPinned: updated.isPinned, messageId, chatId: message.chatId };
  }

  static async updateDisappearingTimer(userId: string, chatId: string, timer: number) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true } } }
        }
      }
    });

    if (!chat) {
      throw new Error('Chat not found');
    }

    const participant = chat.participants.find((p: any) => p.userId === userId);
    if (!participant) {
      throw new Error('Not a participant in this chat');
    }

    if (chat.isGroup && chat.adminId !== userId) {
      throw new Error('Only the group admin can update disappearing message settings');
    }

    const updatedChat = await prisma.chat.update({
      where: { id: chatId },
      data: { disappearingTimer: timer }
    });

    const senderName = participant.user?.name || 'A user';
    let timerText = 'off';
    if (timer === 86400) timerText = '24 hours';
    else if (timer === 604800) timerText = '7 days';
    else if (timer === 7776000) timerText = '90 days';

    const systemText = timer > 0
      ? `${senderName} set disappearing messages to ${timerText}. New messages will disappear after this time.`
      : `${senderName} turned off disappearing messages.`;

    const systemMessage = await prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        content: systemText,
        type: 'SYSTEM' as any
      },
      include: {
        sender: {
          select: { id: true, name: true, phoneNumber: true, profilePicture: true }
        }
      }
    });

    return { chat: updatedChat, systemMessage, disappearingTimer: timer };
  }

  static async cleanupExpiredMessages() {
    try {
      const now = new Date();
      const deleted = await prisma.message.deleteMany({
        where: {
          expiresAt: { lte: now }
        }
      });
      if (deleted.count > 0) {
        console.log(`Cleaned up ${deleted.count} expired disappearing messages.`);
      }
    } catch (error) {
      console.error('Error cleaning up expired messages:', error);
    }
  }

  static async scheduleMessage(userId: string, chatId: string, content: string, scheduledAt: Date, type: any = 'TEXT', mediaUrl?: string, replyToId?: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { disappearingTimer: true }
    });

    if (!chat) throw new Error('Chat not found');

    const expiresAt = chat.disappearingTimer && chat.disappearingTimer > 0
      ? new Date(scheduledAt.getTime() + chat.disappearingTimer * 1000)
      : null;

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: userId,
        content,
        type,
        mediaUrl,
        replyToId,
        isScheduled: true,
        scheduledAt,
        scheduledStatus: 'PENDING',
        expiresAt
      } as any,
      include: { sender: true, replyTo: true }
    });

    return message;
  }

  static async getPendingScheduledMessages(userId: string, chatId: string) {
    return prisma.message.findMany({
      where: {
        chatId,
        senderId: userId,
        isScheduled: true,
        scheduledStatus: 'PENDING'
      } as any,
      orderBy: { scheduledAt: 'asc' } as any
    });
  }

  static async cancelScheduledMessage(userId: string, messageId: string) {
    const msg = await prisma.message.findUnique({ where: { id: messageId } });
    if (!msg || msg.senderId !== userId) {
      throw new Error('Scheduled message not found or unauthorized');
    }

    return prisma.message.update({
      where: { id: messageId },
      data: { scheduledStatus: 'CANCELLED' } as any
    });
  }

  static async processDueScheduledMessages() {
    try {
      const now = new Date();
      const dueMessages = await prisma.message.findMany({
        where: {
          isScheduled: true,
          scheduledStatus: 'PENDING',
          scheduledAt: { lte: now }
        } as any,
        include: { sender: true, replyTo: true }
      });

      for (const msg of dueMessages) {
        await prisma.message.update({
          where: { id: msg.id },
          data: {
            scheduledStatus: 'SENT',
            createdAt: now
          } as any
        });
      }

      return dueMessages;
    } catch (error) {
      console.error('Error processing scheduled messages:', error);
      return [];
    }
  }
}
