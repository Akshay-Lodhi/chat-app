'use client';

import React from 'react';
import { MessageSquare, Tv, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  activeTab: 'chats' | 'live' | 'calls';
  onTabChange: (tab: 'chats' | 'live' | 'calls') => void;
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
    <div className="w-full shrink-0 z-40 px-3 py-2 bg-surface/90 backdrop-blur-xl border-t border-surface-border/80 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] rounded-t-[20px]">
      <div className="flex items-center justify-around max-w-md mx-auto relative">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "relative flex-1 flex flex-col items-center justify-center py-1.5 transition-all duration-300 group outline-none",
                isActive ? "text-[#25D366]" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {/* Sliding Active Background Pill */}
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="absolute inset-0 bg-[#25D366]/10 rounded-2xl border border-[#25D366]/30 shadow-[0_0_15px_rgba(37,211,102,0.25)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center">
                {/* Icon with scale effect */}
                <motion.div
                  animate={{ scale: isActive ? 1.15 : 1, y: isActive ? -1 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  className="relative"
                >
                  <Icon size={22} className={cn("transition-colors", isActive && "drop-shadow-[0_0_8px_rgba(37,211,102,0.6)]")} />
                  
                  {/* Badge indicator */}
                  {tab.badge && (
                    <span className={cn(
                      "absolute -top-1.5 -right-3 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full border border-surface shadow-sm",
                      tab.isLiveBadge ? "bg-red-500 text-white animate-pulse" : "bg-[#25D366] text-black"
                    )}>
                      {tab.badge}
                    </span>
                  )}
                </motion.div>

                {/* Label */}
                <span className={cn(
                  "text-[11px] font-semibold mt-1 tracking-wide transition-colors",
                  isActive ? "text-[#25D366] font-bold" : "text-text-tertiary"
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
