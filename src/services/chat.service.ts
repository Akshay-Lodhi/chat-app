import { PrismaClient } from '@prisma/client';

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
            user: { select: { id: true, name: true, phoneNumber: true, profilePicture: true } }
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

    return chats.map((chat: any) => {
      let name = chat.name;
      let picture = chat.groupPicture;
      
      if (!chat.isGroup) {
        const otherParticipant = chat.participants.find((p: any) => p.userId !== userId);
        if (otherParticipant) {
          name = otherParticipant.user.name || otherParticipant.user.phoneNumber;
          picture = otherParticipant.user.profilePicture;
        }
      }

      return {
        ...chat,
        name,
        groupPicture: picture,
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

  static async getMessagesForChat(chatId: string, limit = 50, cursor?: string) {
    // We will expand cursor logic in Phase 2
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: { statuses: true }
    });

    return messages.map((msg: any) => {
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
  }
}
