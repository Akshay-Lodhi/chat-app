import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Heart, Eye, Trash2 } from 'lucide-react';
import { useStoryStore } from '@/store/useStoryStore';
import { useAuthStore } from '@/store/useAuthStore';
import { formatRelativeTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface StoryViewerModalProps {
  storyGroup: any;
  onClose: () => void;
}

const STORY_DURATION = 5000; // 5 seconds per story

export const StoryViewerModal = ({ storyGroup, onClose }: StoryViewerModalProps) => {
  const { markAsViewed, likeStory, unlikeStory, deleteStory } = useStoryStore();
  const { user } = useAuthStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showViews, setShowViews] = useState(false);

  const stories = storyGroup.stories;
  const currentStory = stories[currentIndex];
  const isMyStory = storyGroup.user.id === user?.id;

  const handleLikeToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentStory.isLikedByMe) {
      await unlikeStory(currentStory.id);
    } else {
      await likeStory(currentStory.id);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this status?')) {
      await deleteStory(currentStory.id);
      if (stories.length === 1) onClose();
      else handleNext();
    }
  };

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
    if (!isPaused && currentStory.type !== 'VIDEO' && !showViews) {
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
  }, [isPaused, currentStory.type, showViews]);

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
          <div className="absolute bottom-20 left-0 w-full text-center px-4 z-20 pointer-events-none">
            <div className="inline-block bg-black/60 px-4 py-2 rounded-lg text-shadow-sm max-w-[80vw] break-words">
              {currentStory.content}
            </div>
          </div>
        )}

        {/* Bottom Actions (Views & Likes) */}
        <div className="absolute bottom-0 left-0 w-full p-4 z-30 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent">
          {isMyStory ? (
            <div className="flex items-center justify-between w-full">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowViews(true); setIsPaused(true); }}
                className="flex items-center gap-2 text-white bg-black/40 hover:bg-black/60 px-4 py-2 rounded-full backdrop-blur-md transition-all"
              >
                <Eye size={20} />
                <span className="font-semibold">{currentStory.views?.length || 0}</span>
              </button>
              <button 
                onClick={handleDelete}
                className="p-2 text-red-400 hover:text-red-300 bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-md transition-all"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ) : (
            <div className="flex justify-end w-full">
              <button 
                onClick={handleLikeToggle}
                className="p-3 bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-md transition-all z-40 group"
              >
                <motion.div
                  whileTap={{ scale: 0.8 }}
                  animate={currentStory.isLikedByMe ? { scale: [1, 1.2, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <Heart 
                    size={28} 
                    className={currentStory.isLikedByMe ? "fill-red-500 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "text-white group-hover:text-red-300"} 
                  />
                </motion.div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Views Bottom Sheet */}
      <AnimatePresence>
        {showViews && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 w-full h-[60vh] bg-surface rounded-t-3xl z-50 overflow-hidden flex flex-col shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
          >
            <div className="p-4 border-b border-surface-border/50 flex items-center justify-between sticky top-0 bg-surface/90 backdrop-blur-md z-10">
              <div className="flex items-center gap-3">
                <Eye size={20} className="text-[#25D366]" />
                <h3 className="text-lg font-bold">Viewed by {currentStory.views?.length || 0}</h3>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowViews(false); setIsPaused(false); }}
                className="p-2 bg-surface-hover rounded-full text-text-secondary hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {currentStory.views?.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-tertiary">
                  <Eye size={48} className="mb-4 opacity-20" />
                  <p>No views yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {currentStory.views?.map((v: any) => {
                    const hasLiked = currentStory.likes?.some((l: any) => l.userId === v.userId);
                    return (
                      <div key={v.userId} className="flex items-center gap-3 p-3 hover:bg-surface-hover rounded-xl transition-colors">
                        <div className="w-12 h-12 rounded-full bg-surface-hover overflow-hidden shrink-0 border border-surface-border/50">
                          {v.profilePicture ? (
                            <img src={v.profilePicture} alt={v.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-bold bg-gradient-to-br from-[#25D366]/20 to-[#128C7E]/20 text-[#25D366]">
                              {v.name?.[0]?.toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[15px] truncate">{v.name || 'Unknown User'}</div>
                          <div className="text-[13px] text-text-tertiary">{formatRelativeTime(v.viewedAt)}</div>
                        </div>
                        {hasLiked && (
                          <Heart size={20} className="fill-red-500 text-red-500 drop-shadow-sm shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Trigger TS Server Sync
