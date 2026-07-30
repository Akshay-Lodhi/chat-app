import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  className?: string;
}

const EMOJI_CATEGORIES = [
  {
    name: 'Popular',
    icon: '🔥',
    emojis: ['😂', '❤️', '😍', '😭', '😊', '👍', '🔥', '🙏', '🥰', '✨', '🥺', '🤣', '🎉', '💯', '🤔', '😎', '💀', '🤡', '👏', '🙌', '👀', '💩', '🤝', '🥳']
  },
  {
    name: 'Smileys',
    icon: '😀',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '🥹', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🫣', '🤭', '🤫', '🫡', '🤥', '😶', '😐', '😑', '😬', '🫠', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕']
  },
  {
    name: 'Gestures',
    icon: '👍',
    emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪']
  },
  {
    name: 'Hearts & Love',
    icon: '❤️',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💔', '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💋', '💌', '💐', '🌹', '🌺', '🌸']
  },
  {
    name: 'Objects & Fun',
    icon: '🎉',
    emojis: ['⚡', '✨', '🌟', '⭐', '💥', '🎉', '🎊', '🎈', '🎁', '🏆', '🏅', '⚽', '🏀', '🎮', '🎲', '🎵', '🎶', '🎤', '🎧', '📸', '💡', '💰', '💵', '💎', '🔑', '🚀', '🚗', '📱']
  }
];

export function EmojiPicker({ isOpen, onClose, onSelectEmoji, className }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const categoryRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const scrollToCategory = (index: number) => {
    setActiveCategory(index);
    if (categoryRefs.current[index]) {
      categoryRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (search.trim()) return;
    const container = e.currentTarget;
    
    // Find the category that is currently closest to the top of the scroll container
    let closestIndex = 0;
    let minDistance = Infinity;

    categoryRefs.current.forEach((ref, index) => {
      if (!ref) return;
      const distance = Math.abs(ref.offsetTop - container.scrollTop);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    });

    if (closestIndex !== activeCategory) {
      setActiveCategory(closestIndex);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        ref={pickerRef}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className={cn("z-40 w-80 md:w-96 bg-[#1f2c34] border border-surface-border rounded-2xl shadow-2xl overflow-hidden flex flex-col h-80", className)}
      >
        {/* Search Header */}
        <div className="p-2.5 border-b border-surface-border flex items-center bg-[#111b21]">
          <div className="flex-1 flex items-center bg-[#202c33] rounded-xl px-3 py-1.5 border border-surface-border/50">
            <Search size={16} className="text-[#8696a0] mr-2" />
            <input
              type="text"
              placeholder="Search emojis..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-xs text-[#e9edef] placeholder-[#8696a0] w-full"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-[#8696a0] hover:text-[#e9edef]">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        {!search && (
          <div className="flex border-b border-surface-border bg-[#111b21] px-2 py-1 space-x-1">
            {EMOJI_CATEGORIES.map((cat, idx) => (
              <button
                key={cat.name}
                onClick={() => scrollToCategory(idx)}
                className={`flex-1 py-1 text-base rounded-lg transition-colors flex items-center justify-center ${activeCategory === idx ? 'bg-[#2a3942] text-white shadow-sm' : 'hover:bg-[#202c33] text-[#8696a0]'}`}
                title={cat.name}
              >
                {cat.icon}
              </button>
            ))}
          </div>
        )}

        {/* Emoji Grid */}
        <div 
          className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-surface-border relative"
          onScroll={handleScroll}
        >
          {search.trim() ? (
            <div className="grid grid-cols-7 gap-1.5">
              {EMOJI_CATEGORIES.flatMap(c => c.emojis)
                .filter(e => e.includes(search.trim()))
                .map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  onClick={() => onSelectEmoji(emoji)}
                  className="h-10 w-10 text-2xl flex items-center justify-center hover:bg-[#2a3942] rounded-xl transition-transform hover:scale-125 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col space-y-4">
              {EMOJI_CATEGORIES.map((category, catIdx) => (
                <div 
                  key={category.name} 
                  ref={(el) => { categoryRefs.current[catIdx] = el; }}
                  className="scroll-mt-2"
                >
                  <h4 className="text-xs font-semibold text-[#8696a0] uppercase mb-2 pl-1 sticky top-0 bg-[#1f2c34]/95 backdrop-blur-sm py-1 z-10">
                    {category.name}
                  </h4>
                  <div className="grid grid-cols-7 gap-1.5">
                    {category.emojis.map((emoji, i) => (
                      <button
                        key={`${category.name}-${emoji}-${i}`}
                        onClick={() => onSelectEmoji(emoji)}
                        className="h-10 w-10 text-2xl flex items-center justify-center hover:bg-[#2a3942] rounded-xl transition-transform hover:scale-125 active:scale-95"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
