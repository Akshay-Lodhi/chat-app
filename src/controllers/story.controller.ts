import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import { StoryService } from '../services/story.service';
import { StoryType } from '@prisma/client';

export const createStory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { content, mediaUrl, type, bgColor } = req.body;

    const story = await StoryService.createStory(userId, {
      content,
      mediaUrl,
      type: type as StoryType,
      bgColor,
    });

    res.status(201).json(story);
  } catch (error) {
    console.error('Create Story Error:', error);
    res.status(500).json({ error: 'Failed to create story' });
  }
};

export const getStories = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const stories = await StoryService.getGroupedStories(userId);
    res.json(stories);
  } catch (error) {
    console.error('Get Stories Error:', error);
    res.status(500).json({ error: 'Failed to fetch stories' });
  }
};

export const viewStory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const view = await StoryService.markStoryAsViewed(id as string, userId);
    res.json(view);
  } catch (error) {
    console.error('View Story Error:', error);
    res.status(500).json({ error: 'Failed to mark story as viewed' });
  }
};

export const deleteStory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    await StoryService.deleteStory(id as string, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Story Error:', error);
    res.status(500).json({ error: 'Failed to delete story' });
  }
};

// Trigger TS Server Sync
