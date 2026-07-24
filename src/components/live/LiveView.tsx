'use client';

import React, { useState, useEffect } from 'react';
import { 
  Tv, Radio, Search, Bell, Eye, Play, Sparkles, 
  Flame, TrendingUp, Filter, Users, Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveStore, LiveStreamSession } from '@/store/useLiveStore';
import { useAuthStore } from '@/store/useAuthStore';
import { LiveStreamRoom } from './LiveStreamRoom';
import { GoLiveModal } from './GoLiveModal';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  'All', 'Astrology', 'Coding', 'Music', 'Gaming', 
  'Education', 'Fitness', 'Tech', 'Art', 'Food'
];

export function LiveView() {
  const { user } = useAuthStore();
  const { 
    streams, activeStream, activeCategory, searchQuery, 
    setActiveCategory, setSearchQuery, fetchActiveStreams, 
    joinLiveStream, leaveLiveStream 
  } = useLiveStore();

  const [isGoLiveOpen, setIsGoLiveOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    fetchActiveStreams(activeCategory, searchQuery);
  }, [fetchActiveStreams, activeCategory, searchQuery]);

  const featuredStream = streams.find(s => s.isLive) || streams[0];
  const feedStreams = featuredStream ? streams.filter(s => s.id !== featuredStream.id) : streams;

  return (
    <div className="flex-1 flex flex-col h-full bg-background text-foreground overflow-y-auto relative no-scrollbar">
      {/* Active Fullscreen Live Stream Player */}
      <AnimatePresence>
        {activeStream && (
          <LiveStreamRoom 
            stream={activeStream} 
            onClose={() => leaveLiveStream(user)} 
          />
        )}
      </AnimatePresence>

      {/* Go Live Setup Modal */}
      <GoLiveModal 
        isOpen={isGoLiveOpen} 
        onClose={() => setIsGoLiveOpen(false)} 
      />

      {/* Top Header */}
      <div className="sticky top-0 z-30 bg-surface/90 backdrop-blur-md px-4 py-3.5 border-b border-surface-border flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-red-600/20 text-red-500">
            <Tv size={22} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-text-primary flex items-center space-x-2">
              <span>LIVE</span>
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            </h1>
            <p className="text-[11px] text-text-tertiary font-medium">Watch real-time broadcasts</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Toggle Search */}
          <button 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="p-2.5 rounded-full hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Search Streams"
          >
            <Search size={20} />
          </button>

          {/* Go Live Button */}
          <button
            onClick={() => setIsGoLiveOpen(true)}
            className="flex items-center space-x-2 bg-gradient-to-r from-[#25D366] to-[#1EBE5D] text-black font-extrabold text-xs px-4 py-2 rounded-full shadow-md hover:brightness-110 active:scale-95 transition-all"
          >
            <Radio size={16} className="animate-pulse" />
            <span>Go Live</span>
          </button>
        </div>
      </div>

      {/* Expandable Search Input */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-surface border-b border-surface-border px-4 py-3"
          >
            <div className="relative flex items-center">
              <Search size={18} className="absolute left-3 text-text-tertiary" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, username, or category..."
                className="w-full bg-chat-bg border border-surface-border text-text-primary text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-[#25D366]"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Pills Horizontal Scroll */}
      <div className="px-4 py-3 border-b border-surface-border/60 bg-surface/50 overflow-x-auto no-scrollbar flex items-center space-x-2">
        {CATEGORIES.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200",
                isActive 
                  ? "bg-[#25D366] text-black font-bold shadow-[0_0_12px_rgba(37,211,102,0.3)] scale-105" 
                  : "bg-surface-hover text-text-secondary hover:text-text-primary border border-surface-border"
              )}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="p-4 space-y-6 max-w-5xl mx-auto w-full">
        {/* Featured Live Banner (Top Stream) */}
        {featuredStream && (
          <div className="relative group rounded-3xl overflow-hidden shadow-2xl border border-surface-border bg-surface">
            {/* Animated Gradient Glow Border */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 via-pink-600 to-[#25D366] rounded-3xl opacity-75 blur group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-gradient-x" />

            <div className="relative rounded-3xl overflow-hidden bg-black aspect-video md:aspect-[21/9] flex items-center justify-center">
              <img 
                src={featuredStream.thumbnail || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000'}
                alt={featuredStream.title}
                className="w-full h-full object-cover filter brightness-[0.75] group-hover:scale-105 transition-transform duration-700"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent p-5 md:p-8 flex flex-col justify-between">
                {/* Top Info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    <span className="text-red-500 text-xs font-black tracking-wider">FEATURED LIVE</span>
                  </div>

                  <div className="bg-black/60 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/10 flex items-center space-x-1.5">
                    <Eye size={14} className="text-[#25D366]" />
                    <span>{(featuredStream.viewerCount || 100).toLocaleString()} viewers</span>
                  </div>
                </div>

                {/* Bottom Stream Details */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="space-y-2 max-w-xl">
                    <div className="flex items-center space-x-3">
                      <img 
                        src={featuredStream.streamerPfp || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'}
                        alt={featuredStream.streamerName}
                        className="w-11 h-11 rounded-full object-cover border-2 border-[#25D366]"
                      />
                      <div>
                        <h3 className="text-white font-bold text-base md:text-lg drop-shadow">
                          {featuredStream.streamerName}
                        </h3>
                        <p className="text-white/70 text-xs font-medium">
                          @{featuredStream.streamerUsername} • <span className="text-[#25D366]">{featuredStream.category}</span>
                        </p>
                      </div>
                    </div>

                    <h2 className="text-white font-extrabold text-lg md:text-2xl drop-shadow line-clamp-2">
                      {featuredStream.title}
                    </h2>
                  </div>

                  <button
                    onClick={() => joinLiveStream(featuredStream, user)}
                    className="self-start md:self-auto flex items-center space-x-2 bg-[#25D366] hover:bg-[#20bd5a] text-black font-extrabold text-sm px-6 py-3 rounded-2xl shadow-lg transition-transform active:scale-95"
                  >
                    <Play size={18} className="fill-black" />
                    <span>Watch Now</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Feed Header */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-lg font-bold text-text-primary flex items-center space-x-2">
            <Flame size={20} className="text-red-500" />
            <span>Active Live Streams</span>
          </h2>
          <span className="text-xs text-text-tertiary font-medium">
            {streams.length} stream{streams.length !== 1 ? 's' : ''} available
          </span>
        </div>

        {/* Live Feed Grid */}
        {streams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-surface/40 rounded-3xl border border-surface-border">
            <div className="p-4 rounded-full bg-surface-hover text-text-secondary">
              <Tv size={36} />
            </div>
            <h3 className="text-lg font-bold text-text-primary">No Live Streams Found</h3>
            <p className="text-xs text-text-secondary max-w-xs">
              Be the first to start a live stream or select a different category!
            </p>
            <button
              onClick={() => setIsGoLiveOpen(true)}
              className="mt-2 bg-[#25D366] text-black font-bold text-xs px-5 py-2.5 rounded-full shadow-md hover:brightness-110"
            >
              Start Live Broadcast
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {streams.map((stream) => (
              <motion.div
                key={stream.id}
                whileHover={{ y: -4 }}
                className="bg-surface rounded-2xl overflow-hidden border border-surface-border shadow-sm group hover:border-surface-border/80 transition-all cursor-pointer"
                onClick={() => joinLiveStream(stream, user)}
              >
                {/* Card Thumbnail */}
                <div className="relative aspect-video bg-black overflow-hidden">
                  <img 
                    src={stream.thumbnail || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500'}
                    alt={stream.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 flex items-center space-x-2">
                    <span className="bg-[#FF0050] text-white text-[10px] font-black px-2 py-0.5 rounded-md tracking-wider shadow-sm flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      <span>LIVE</span>
                    </span>
                    <span className="bg-black/60 backdrop-blur-md text-white/90 text-[10px] font-semibold px-2 py-0.5 rounded-md border border-white/10">
                      {stream.category}
                    </span>
                  </div>

                  <div className="absolute top-2.5 right-2.5 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-white/10 flex items-center space-x-1">
                    <Eye size={12} className="text-[#25D366]" />
                    <span>{(stream.viewerCount || 1).toLocaleString()}</span>
                  </div>

                  {/* Play Overlay Icon */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="p-3 rounded-full bg-[#25D366] text-black shadow-xl">
                      <Play size={20} className="fill-black" />
                    </div>
                  </div>
                </div>

                {/* Card Details */}
                <div className="p-3.5 flex items-start space-x-3">
                  <img 
                    src={stream.streamerPfp || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                    alt={stream.streamerName}
                    className="w-10 h-10 rounded-full object-cover border border-surface-border shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-text-primary text-sm line-clamp-1 group-hover:text-[#25D366] transition-colors">
                      {stream.title}
                    </h3>
                    <p className="text-text-secondary text-xs mt-0.5 truncate">
                      {stream.streamerName} (@{stream.streamerUsername})
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
