'use client';

import React, { useState, useEffect } from 'react';
import { 
  Tv, Radio, Search, Bell, Eye, Play, Sparkles, 
  Flame, TrendingUp, Filter, Users, Video
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveStore, LiveStreamSession } from '@/store/useLiveStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { Avatar } from '@/components/ui/Avatar';
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

  // Real-time socket stream list updates
  useEffect(() => {
    const socket = useChatStore.getState().socket;
    if (!socket) return;

    const handleNewStream = (stream: LiveStreamSession) => {
      useLiveStore.setState(state => {
        // Prevent duplicates
        if (state.streams.some(s => s.id === stream.id)) return state;
        // Don't add host's own stream to the grid (they're already in LiveStreamRoom)
        if (user?.id && stream.streamerId === user.id) return state;
        return { streams: [stream, ...state.streams] };
      });
    };

    const handleStreamEnded = ({ streamId }: { streamId: string }) => {
      useLiveStore.setState(state => ({
        streams: state.streams.filter(s => s.id !== streamId)
      }));
    };

    const handleViewerCountUpdate = ({ streamId, viewerCount }: { streamId: string; viewerCount: number }) => {
      useLiveStore.setState(state => ({
        streams: state.streams.map(s => s.id === streamId ? { ...s, viewerCount } : s)
      }));
    };

    socket.on('new-live-stream', handleNewStream);
    socket.on('live-stream-ended', handleStreamEnded);
    socket.on('live-viewer-count', handleViewerCountUpdate);

    return () => {
      socket.off('new-live-stream', handleNewStream);
      socket.off('live-stream-ended', handleStreamEnded);
      socket.off('live-viewer-count', handleViewerCountUpdate);
    };
  }, [user?.id]);

  const featuredStream = streams.find(s => s.isLive) || streams[0];
  const feedStreams = featuredStream ? streams.filter(s => s.id !== featuredStream.id) : streams;

  return (
    <div className="flex-1 flex flex-col h-full bg-background text-foreground overflow-y-auto relative no-scrollbar">
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
            <h1 className="text-xl font-extrabold tracking-tight flex items-center space-x-2 text-transparent bg-clip-text nexus-gradient">
              <span>LIVE</span>
              <span className="w-2 h-2 rounded-full nexus-gradient animate-ping" />
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
            className="flex items-center space-x-2 nexus-gradient text-white font-extrabold text-xs px-4 py-2 rounded-full shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:brightness-110 active:scale-95 transition-all"
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
                className="w-full bg-chat-bg border border-surface-border text-text-primary text-xs pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-blue-500"
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
                "px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 backdrop-blur-md border",
                isActive 
                  ? "nexus-gradient border-transparent text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] scale-105" 
                  : "bg-surface-hover/50 text-text-secondary hover:text-text-primary border-surface-border hover:bg-surface-hover"
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
          <div className="relative group rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-surface">
            {/* Animated Gradient Glow Border */}
            <div className="absolute -inset-0.5 nexus-gradient rounded-3xl opacity-50 blur-lg group-hover:opacity-80 transition duration-1000 group-hover:duration-200 animate-pulse" />

            <div className="relative rounded-3xl overflow-hidden bg-black aspect-video md:aspect-[21/9] flex items-center justify-center">
              <img 
                src={featuredStream.thumbnail || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000'}
                alt={featuredStream.title}
                className="w-full h-full object-cover filter brightness-[0.75] group-hover:scale-105 transition-transform duration-700"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-5 md:p-8 flex flex-col justify-between">
                {/* Top Info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 bg-black/40 backdrop-blur-xl px-3 py-1 rounded-full border border-white/20 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
                    <span className="text-transparent bg-clip-text nexus-gradient text-xs font-black tracking-wider">FEATURED LIVE</span>
                  </div>

                  <div className="bg-black/40 backdrop-blur-xl text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/20 shadow-lg flex items-center space-x-1.5">
                    <Eye size={14} className="text-blue-400" />
                    <span>{(featuredStream.viewerCount || 0).toLocaleString()} viewers</span>
                  </div>
                </div>

                {/* Bottom Stream Details */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div className="space-y-2 max-w-xl">
                    <div className="flex items-center space-x-3">
                      <Avatar 
                        src={featuredStream.streamerPfp} 
                        fallback={featuredStream.streamerName} 
                        className="w-11 h-11 border-2 border-blue-500"
                      />
                      <div>
                        <h3 className="text-white font-bold text-base md:text-lg drop-shadow">
                          {featuredStream.streamerName}
                        </h3>
                        <p className="text-white/70 text-xs font-medium">
                          @{featuredStream.streamerName} • <span className="text-blue-400">{featuredStream.category}</span>
                        </p>
                      </div>
                    </div>

                    <h2 className="text-white font-extrabold text-lg md:text-2xl drop-shadow line-clamp-2">
                      {featuredStream.title}
                    </h2>
                  </div>

                    <button
                    onClick={() => joinLiveStream(featuredStream, user)}
                    className="self-start md:self-auto flex items-center space-x-2 nexus-gradient hover:brightness-110 text-white font-extrabold text-sm px-6 py-3 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-transform active:scale-95 border border-white/10"
                  >
                    <Play size={18} className="fill-white" />
                    <span>Watch Now</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Live Feed Header */}
        <div className="flex items-center justify-between pt-2">
          <h2 className="text-lg font-bold text-transparent bg-clip-text nexus-gradient flex items-center space-x-2">
            <Sparkles size={20} className="text-purple-400" />
            <span>Active Live Streams</span>
          </h2>
          <span className="text-xs text-text-tertiary font-medium">
            {streams.length} stream{streams.length !== 1 ? 's' : ''} available
          </span>
        </div>

        {/* Live Feed Grid */}
        {feedStreams.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-surface/40 rounded-3xl border border-surface-border">
            <div className="p-4 rounded-full bg-surface-hover text-text-secondary">
              <Tv size={36} />
            </div>
            <h3 className="text-lg font-bold text-text-primary">No Active Live Streams</h3>
            <p className="text-xs text-text-secondary max-w-xs">
              Check back later or start your own broadcast!
            </p>
            <button
              onClick={() => setIsGoLiveOpen(true)}
              className="mt-2 nexus-gradient text-white font-bold text-xs px-5 py-2.5 rounded-full shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:brightness-110 transition-transform active:scale-95"
            >
              Start Live Broadcast
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {feedStreams.map((stream) => (
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

                  <div className="absolute top-2.5 right-2.5 bg-black/40 backdrop-blur-md text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-white/20 flex items-center space-x-1 shadow-lg">
                    <Eye size={12} className="text-blue-400" />
                    <span>{(stream.viewerCount || 0).toLocaleString()}</span>
                  </div>

                  {/* Play Overlay Icon */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="p-3 rounded-full nexus-gradient text-white shadow-[0_0_15px_rgba(168,85,247,0.5)] transform scale-90 group-hover:scale-100 transition-transform">
                      <Play size={20} className="fill-white" />
                    </div>
                  </div>
                </div>

                <div className="p-3">
                  <div className="flex items-center space-x-2.5">
                    <Avatar 
                      src={stream.streamerPfp} 
                      fallback={stream.streamerName} 
                      className="w-8 h-8 border border-surface-border group-hover:border-purple-500 transition-colors"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-text-primary truncate">
                        {stream.title}
                      </h3>
                      <p className="text-xs text-text-secondary truncate font-medium">
                        {stream.streamerName}
                      </p>
                    </div>
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
