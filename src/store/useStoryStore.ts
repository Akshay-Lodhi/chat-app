import { create } from 'zustand';
import { apiClient } from '@/lib/apiClient';

export interface Story {
  id: string;
  content?: string;
  mediaUrl?: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO';
  bgColor?: string;
  createdAt: string;
  expiresAt: string;
  isViewed: boolean;
}

export interface GroupedStories {
  user: {
    id: string;
    name: string;
    profilePicture?: string;
    phoneNumber: string;
  };
  stories: Story[];
}

interface StoryStore {
  groupedStories: GroupedStories[];
  isLoading: boolean;
  error: string | null;
  fetchStories: (sessionCookieName: string) => Promise<void>;
  createStory: (data: { type: 'TEXT' | 'IMAGE' | 'VIDEO'; content?: string; mediaUrl?: string; bgColor?: string }) => Promise<void>;
  markAsViewed: (storyId: string) => Promise<void>;
  deleteStory: (storyId: string) => Promise<void>;
}

export const useStoryStore = create<StoryStore>((set, get) => ({
  groupedStories: [],
  isLoading: false,
  error: null,

  fetchStories: async (sessionCookieName) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/stories`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch stories');
      const data = await res.json();
      set({ groupedStories: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  createStory: async (data) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/stories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create story');
      // Refresh stories
      await get().fetchStories('better-auth-session');
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  },

  markAsViewed: async (storyId) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/stories/${storyId}/view`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        // Optimistically update local state
        const current = get().groupedStories;
        const updated = current.map((group) => ({
          ...group,
          stories: group.stories.map((story) =>
            story.id === storyId ? { ...story, isViewed: true } : story
          ),
        }));
        set({ groupedStories: updated });
      }
    } catch (err) {
      console.error('Failed to mark story as viewed', err);
    }
  },

  deleteStory: async (storyId) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/stories/${storyId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        await get().fetchStories('better-auth-session');
      }
    } catch (err) {
      console.error('Failed to delete story', err);
    }
  },
}));
