import { PrismaClient } from '@prisma/client';
import { redis } from '../lib/redis';

const prisma = new PrismaClient();

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
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: userId },
                NOT: { statuses: { some: { userId, status: 'READ' } } }
              }
            }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Extract all unique user IDs to fetch their online status from Redis
    const participantIds = new Set<string>();
    chats.forEach(chat => {
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
    const existingIds = chat.participants.map(p => p.userId);
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

  static async getMessagesForChat(chatId: string, limit = 50, cursor?: string) {
    // We will expand cursor logic in Phase 2
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' }
      ],
      take: limit,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: { statuses: true, replyTo: true }
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
      
      return {
        ...msg,
        status,
        deliveredAt,
        readAt,
        statuses: undefined 
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
    const where = {
      OR: [
        { callerId: userId },
        { receiverId: userId },
        { participants: { some: { userId } } }
      ]
    };

    const [calls, total] = await Promise.all([
      prisma.call.findMany({
        where,
        skip,
        take: limit,
        include: {
          caller: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } },
          receiver: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } },
          participants: { include: { user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } } } }
        },
        orderBy: { startedAt: 'desc' }
      }),
      prisma.call.count({ where })
    ]);

    return {
      calls,
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
}
