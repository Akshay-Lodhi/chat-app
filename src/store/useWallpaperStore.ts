import { create } from 'zustand';

export type WallpaperType = 'doodle-dark' | 'doodle-light' | 'solid-teal' | 'solid-midnight' | 'solid-black' | 'solid-purple' | 'custom';

export interface ChatWallpaperConfig {
  wallpaper: WallpaperType;
  customUrl: string;
}

interface WallpaperState {
  chatWallpapers: Record<string, ChatWallpaperConfig>;
  setChatWallpaper: (chatId: string, wallpaper: WallpaperType, customUrl?: string) => void;
  getChatWallpaper: (chatId: string | null) => ChatWallpaperConfig;
}

export const useWallpaperStore = create<WallpaperState>((set, get) => ({
  chatWallpapers: (typeof window !== 'undefined' && JSON.parse(localStorage.getItem('chat_wallpapers') || '{}')) || {},
  
  setChatWallpaper: (chatId, wallpaper, customUrl = '') => {
    if (!chatId) return;
    const current = get().chatWallpapers;
    const updated = {
      ...current,
      [chatId]: { wallpaper, customUrl }
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat_wallpapers', JSON.stringify(updated));
    }
    set({ chatWallpapers: updated });
  },

  getChatWallpaper: (chatId) => {
    if (!chatId) return { wallpaper: 'doodle-dark', customUrl: '' };
    return get().chatWallpapers[chatId] || { wallpaper: 'doodle-dark', customUrl: '' };
  }
}));
