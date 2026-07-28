import React, { useEffect, useState } from 'react';
import { Plus, Camera, Edit2 } from 'lucide-react';
import { useStoryStore } from '@/store/useStoryStore';
import { useAuthStore } from '@/store/useAuthStore';
import { formatRelativeTime } from '@/lib/utils';
import { StoryViewerModal } from './StoryViewerModal';
import { StoryCreatorModal } from './StoryCreatorModal';

export const UpdatesView = () => {
  const { groupedStories, fetchStories, isLoading } = useStoryStore();
  const { user } = useAuthStore();
  
  const [activeStoryGroup, setActiveStoryGroup] = useState<any | null>(null);
  const [isCreatingStory, setIsCreatingStory] = useState(false);
  const [creatorType, setCreatorType] = useState<'TEXT' | 'MEDIA'>('TEXT');

  useEffect(() => {
    fetchStories('better-auth-session');
  }, [fetchStories]);

  const myStories = groupedStories.find(g => g.user.id === user?.id);
  const otherStories = groupedStories.filter(g => g.user.id !== user?.id);

  const getLatestStoryTime = (stories: any[]) => {
    if (!stories || stories.length === 0) return '';
    const latest = stories[stories.length - 1];
    return formatRelativeTime(new Date(latest.createdAt));
  };

  const getUnviewedCount = (stories: any[]) => {
    return stories.filter(s => !s.isViewed).length;
  };

  const hasUnviewedStories = (stories: any[]) => getUnviewedCount(stories) > 0;

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      <div className="p-4 border-b border-surface-border">
        <h2 className="text-xl font-semibold text-text-primary">Status</h2>
      </div>

      <div className="p-4">
        {/* My Status */}
        <div 
          className="flex items-center space-x-4 mb-6 cursor-pointer hover:bg-black/5 p-2 rounded-lg transition-colors"
          onClick={() => myStories?.stories?.length ? setActiveStoryGroup(myStories) : setIsCreatingStory(true)}
        >
          <div className="relative">
            {myStories && myStories.stories.length > 0 ? (
              <div className={`w-14 h-14 rounded-full p-[2px] ${hasUnviewedStories(myStories.stories) ? 'bg-primary' : 'bg-gray-400'}`}>
                <img 
                  src={user?.profilePicture || `https://ui-avatars.com/api/?name=${user?.name || 'User'}&background=random`}
                  alt="My Status"
                  className="w-full h-full rounded-full border-2 border-background object-cover"
                />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-full bg-surface-border flex items-center justify-center">
                <img 
                  src={user?.profilePicture || `https://ui-avatars.com/api/?name=${user?.name || 'User'}&background=random`}
                  alt="My Status"
                  className="w-full h-full rounded-full object-cover"
                />
                <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1 border-2 border-background">
                  <Plus size={16} />
                </div>
              </div>
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-text-primary">My status</h3>
            <p className="text-sm text-text-secondary">
              {myStories && myStories.stories.length > 0 
                ? getLatestStoryTime(myStories.stories) 
                : 'Tap to add status update'}
            </p>
          </div>
        </div>

        {/* Recent Updates */}
        {otherStories.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-text-secondary mb-4 uppercase">Recent updates</h4>
            <div className="space-y-4">
              {otherStories.map(group => (
                <div 
                  key={group.user.id}
                  className="flex items-center space-x-4 cursor-pointer hover:bg-black/5 p-2 rounded-lg transition-colors"
                  onClick={() => setActiveStoryGroup(group)}
                >
                  <div className={`w-14 h-14 rounded-full p-[2px] ${hasUnviewedStories(group.stories) ? 'bg-primary' : 'bg-gray-400'}`}>
                    <img 
                      src={group.user.profilePicture || `https://ui-avatars.com/api/?name=${group.user.name || 'User'}&background=random`}
                      alt={group.user.name}
                      className="w-full h-full rounded-full border-2 border-background object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-text-primary">{group.user.name || group.user.phoneNumber}</h3>
                    <p className="text-sm text-text-secondary">
                      {getLatestStoryTime(group.stories)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {otherStories.length === 0 && (
          <div className="text-center text-text-secondary py-10">
            No recent updates
          </div>
        )}
      </div>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-24 right-6 flex flex-col space-y-4">
        <button 
          onClick={() => {
            setCreatorType('TEXT');
            setIsCreatingStory(true);
          }}
          className="w-12 h-12 bg-surface-border text-text-primary rounded-full flex items-center justify-center shadow-lg hover:bg-surface transition-colors"
        >
          <Edit2 size={20} />
        </button>
        <button 
          onClick={() => {
            setCreatorType('MEDIA');
            setIsCreatingStory(true);
          }}
          className="w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
        >
          <Camera size={24} />
        </button>
      </div>

      {/* Modals */}
      {activeStoryGroup && (
        <StoryViewerModal 
          storyGroup={activeStoryGroup} 
          onClose={() => setActiveStoryGroup(null)} 
        />
      )}

      {isCreatingStory && (
        <StoryCreatorModal 
          type={creatorType}
          onClose={() => setIsCreatingStory(false)} 
        />
      )}
    </div>
  );
};

// Trigger TS Server Sync
