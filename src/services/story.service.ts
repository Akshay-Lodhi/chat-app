import { PrismaClient, StoryType } from '@prisma/client';

const prisma = new PrismaClient();

export class StoryService {
  static async createStory(userId: string, data: { content?: string; mediaUrl?: string; type: StoryType; bgColor?: string }) {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Expires in 24 hours

    return prisma.story.create({
      data: {
        userId,
        ...data,
        expiresAt,
      },
    });
  }

  static async getGroupedStories(userId: string) {
    const now = new Date();

    // 1. Get contacts of the user
    const contacts = await prisma.contact.findMany({
      where: { userId },
      select: { contactId: true },
    });
    
    // Add the user's own ID to fetch their own stories too
    const relevantUserIds = contacts.map((c) => c.contactId);
    relevantUserIds.push(userId);

    // 2. Fetch all non-expired stories from these users
    const stories = await prisma.story.findMany({
      where: {
        userId: { in: relevantUserIds },
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: { id: true, name: true, profilePicture: true, phoneNumber: true },
        },
        views: {
          where: { userId }, // Only include views by the CURRENT user
          select: { userId: true },
        },
      },
      orderBy: { createdAt: 'asc' }, // Oldest to newest (like WhatsApp)
    });

    // 3. Group by user
    const grouped = new Map<string, any>();

    stories.forEach((story: any) => {
      const isViewed = story.views.length > 0;
      const storyData = {
        id: story.id,
        content: story.content,
        mediaUrl: story.mediaUrl,
        type: story.type,
        bgColor: story.bgColor,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        isViewed,
      };

      if (grouped.has(story.userId)) {
        grouped.get(story.userId).stories.push(storyData);
      } else {
        grouped.set(story.userId, {
          user: story.user,
          stories: [storyData],
        });
      }
    });

    return Array.from(grouped.values());
  }

  static async markStoryAsViewed(storyId: string, userId: string) {
    // Check if view already exists to prevent unique constraint error
    const existing = await prisma.storyView.findUnique({
      where: {
        storyId_userId: { storyId, userId },
      },
    });

    if (existing) return existing;

    return prisma.storyView.create({
      data: { storyId, userId },
    });
  }

  static async deleteStory(storyId: string, userId: string) {
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new Error('Story not found');
    if (story.userId !== userId) throw new Error('Unauthorized');

    return prisma.story.delete({ where: { id: storyId } });
  }
}

// Trigger TS Server Sync
