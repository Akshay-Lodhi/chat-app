import { prisma } from '../lib/prisma';

export class StoryService {
  static async createStory(userId: string, data: { content?: string; mediaUrl?: string; type: any; bgColor?: string }) {
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

    // 1. For testing/development, we fetch ALL non-expired stories across the platform
    // In a real production WhatsApp clone, you would filter by contacts here:
    // const contacts = await prisma.contact.findMany({ where: { userId }, select: { contactId: true } });
    
    // 2. Fetch all non-expired stories
    const stories = await prisma.story.findMany({
      where: {
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: { id: true, name: true, profilePicture: true, phoneNumber: true },
        },
        views: {
          include: { user: { select: { id: true, name: true, profilePicture: true } } },
          orderBy: { viewedAt: 'desc' }
        },
        likes: {
          include: { user: { select: { id: true, name: true, profilePicture: true } } },
          orderBy: { likedAt: 'desc' }
        },
      },
      orderBy: { createdAt: 'asc' }, // Oldest to newest (like WhatsApp)
    });

    // 3. Group by user
    const grouped = new Map<string, any>();

    stories.forEach((story: any) => {
      const isMine = story.userId === userId;
      const isViewed = story.views.some((v: any) => v.userId === userId);
      const isLikedByMe = story.likes.some((l: any) => l.userId === userId);

      const storyData = {
        id: story.id,
        content: story.content,
        mediaUrl: story.mediaUrl,
        type: story.type,
        bgColor: story.bgColor,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        isViewed,
        isLikedByMe,
        ...(isMine ? {
          views: story.views.map((v: any) => ({
            userId: v.userId,
            name: v.user.name,
            profilePicture: v.user.profilePicture,
            viewedAt: v.viewedAt,
          })),
          likes: story.likes.map((l: any) => ({
            userId: l.userId,
            name: l.user.name,
            profilePicture: l.user.profilePicture,
            likedAt: l.likedAt,
          }))
        } : {}),
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
    if (story.userId !== userId) throw new Error('Unauthorized to delete this story');

    await prisma.story.delete({ where: { id: storyId } });
  }

  static async likeStory(storyId: string, userId: string) {
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) throw new Error('Story not found');

    return await prisma.storyLike.upsert({
      where: {
        storyId_userId: {
          storyId,
          userId,
        },
      },
      update: {},
      create: {
        storyId,
        userId,
      },
    });
  }

  static async unlikeStory(storyId: string, userId: string) {
    try {
      await prisma.storyLike.delete({
        where: {
          storyId_userId: {
            storyId,
            userId,
          },
        },
      });
    } catch (error) {
      // Ignore if not found
    }
  }
}

// Trigger TS Server Sync
