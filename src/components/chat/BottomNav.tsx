'use client';

import React from 'react';
import { MessageSquare, Tv, Phone, CircleDashed } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  activeTab: 'chats' | 'updates' | 'live' | 'calls';
  onTabChange: (tab: 'chats' | 'updates' | 'live' | 'calls') => void;
  unreadChatsCount?: number;
  activeLiveCount?: number;
}

export function BottomNav({
  activeTab,
  onTabChange,
  unreadChatsCount = 0,
  activeLiveCount = 3
}: BottomNavProps) {
  const tabs = [
    {
      id: 'chats' as const,
      label: 'Chats',
      icon: MessageSquare,
      badge: unreadChatsCount > 0 ? unreadChatsCount : undefined
    },
    {
      id: 'updates' as const,
      label: 'Updates',
      icon: CircleDashed,
    },
    {
      id: 'live' as const,
      label: 'Live',
      icon: Tv,
      badge: activeLiveCount > 0 ? 'LIVE' : undefined,
      isLiveBadge: true
    },
    {
      id: 'calls' as const,
      label: 'Calls',
      icon: Phone
    }
  ];

  return (
    <div className="w-full shrink-0 z-40 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom,24px))] bg-surface/80 backdrop-blur-3xl border-t border-surface-border/30 shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-around max-w-md mx-auto relative bg-surface-hover/30 p-1.5 rounded-2xl border border-surface-border/20">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center py-2 transition-all duration-300 group outline-none rounded-xl",
                isActive ? "text-primary" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {/* Sliding Active Background Pill */}
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute inset-0 bg-primary/10 rounded-xl shadow-inner border border-primary/20"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center">
                {/* Icon with scale effect */}
                <motion.div
                  animate={{ scale: isActive ? 1.1 : 1, y: isActive ? -2 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className="relative"
                >
                  <Icon size={24} className={cn("transition-colors", isActive && "drop-shadow-md")} />
                  
                  {/* Badge indicator */}
                  {tab.badge && (
                    <span className={cn(
                      "absolute -top-1.5 -right-3 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm border border-background",
                      tab.isLiveBadge ? "bg-danger text-white animate-pulse" : "bg-primary text-white"
                    )}>
                      {tab.badge}
                    </span>
                  )}
                </motion.div>

                {/* Label */}
                <span className={cn(
                  "text-[10px] mt-1 tracking-wide transition-colors",
                  isActive ? "text-primary font-bold" : "text-text-tertiary font-medium"
                )}>
                  {tab.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
