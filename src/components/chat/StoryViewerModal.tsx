import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStoryStore } from '@/store/useStoryStore';
import { formatRelativeTime } from '@/lib/utils';

interface StoryViewerModalProps {
  storyGroup: any;
  onClose: () => void;
}

const STORY_DURATION = 5000; // 5 seconds per story

export const StoryViewerModal = ({ storyGroup, onClose }: StoryViewerModalProps) => {
  const { markAsViewed } = useStoryStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const stories = storyGroup.stories;
  const currentStory = stories[currentIndex];

  const handleNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
    }
  }, [currentIndex]);

  useEffect(() => {
    if (currentStory && !currentStory.isViewed) {
      markAsViewed(currentStory.id);
    }
  }, [currentStory, markAsViewed]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    // Only auto-progress for non-video stories (videos control their own progress)
    if (!isPaused && currentStory.type !== 'VIDEO') {
      timer = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            return 100;
          }
          return p + (100 / (STORY_DURATION / 100));
        });
      }, 100);
    }

    return () => clearInterval(timer);
  }, [isPaused, currentStory.type]);

  useEffect(() => {
    if (progress >= 100) {
      handleNext();
    }
  }, [progress, handleNext]);

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col">
      {/* Progress Bars */}
      <div className="absolute top-0 left-0 w-full flex space-x-1 p-2 z-20 bg-gradient-to-b from-black/50 to-transparent pt-4">
        {stories.map((story: any, idx: number) => (
          <div key={story.id} className="h-1 flex-1 bg-white/30 overflow-hidden rounded-full">
            <div 
              className="h-full bg-white transition-all duration-100 ease-linear"
              style={{ 
                width: `${idx < currentIndex ? 100 : idx === currentIndex ? progress : 0}%` 
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 w-full flex items-center justify-between px-4 z-20">
        <div className="flex items-center space-x-3">
          <img 
            src={storyGroup.user.profilePicture || `https://ui-avatars.com/api/?name=${storyGroup.user.name || 'User'}&background=random`} 
            alt={storyGroup.user.name} 
            className="w-10 h-10 rounded-full object-cover"
          />
          <div>
            <h3 className="font-semibold text-shadow-sm">{storyGroup.user.name || storyGroup.user.phoneNumber}</h3>
            <p className="text-xs text-white/80 text-shadow-sm">{formatRelativeTime(new Date(currentStory.createdAt))}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full">
          <X size={24} />
        </button>
      </div>

      {/* Click Areas & Content */}
      <div 
        className="flex-1 relative flex items-center justify-center"
        style={{ backgroundColor: currentStory.type === 'TEXT' ? currentStory.bgColor : '#000' }}
        onMouseDown={() => setIsPaused(true)}
        onMouseUp={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Left click area for prev */}
        <div className="absolute left-0 top-0 w-1/3 h-full z-10 cursor-pointer" onClick={(e) => { e.stopPropagation(); handlePrev(); }} />
        {/* Right click area for next */}
        <div className="absolute right-0 top-0 w-2/3 h-full z-10 cursor-pointer" onClick={(e) => { e.stopPropagation(); handleNext(); }} />

        {currentStory.type === 'TEXT' ? (
          <div className="px-8 text-center text-4xl font-bold max-w-[80vw] break-words">
            {currentStory.content}
          </div>
        ) : currentStory.type === 'VIDEO' ? (
          <video 
            src={currentStory.mediaUrl} 
            autoPlay 
            className="max-w-full max-h-[90vh] object-contain"
            onEnded={handleNext}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              setProgress((el.currentTime / el.duration) * 100);
            }}
          />
        ) : (
          <img 
            src={currentStory.mediaUrl} 
            alt="Status" 
            className="max-w-full max-h-[90vh] object-contain"
          />
        )}
        
        {/* Caption */}
        {currentStory.type !== 'TEXT' && currentStory.content && (
          <div className="absolute bottom-10 left-0 w-full text-center px-4 z-20">
            <div className="inline-block bg-black/60 px-4 py-2 rounded-lg text-shadow-sm max-w-[80vw] break-words">
              {currentStory.content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Trigger TS Server Sync
