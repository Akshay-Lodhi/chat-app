'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Heart, Send, ChevronDown, Eye, Plus, HelpCircle, 
  Share2, Pin, Mic, MicOff, Camera, RefreshCw, Radio, Check, Copy
} from 'lucide-react';
import { useLiveStore, LiveStreamSession, LiveComment } from '@/store/useLiveStore';
import { useAuthStore } from '@/store/useAuthStore';
import { cn } from '@/lib/utils';

interface LiveStreamRoomProps {
  stream: LiveStreamSession;
  onClose: () => void;
}

export function LiveStreamRoom({ stream, onClose }: LiveStreamRoomProps) {
  const { user } = useAuthStore();
  const { 
    leaveLiveStream, sendComment, sendReaction, pinComment, 
    endLiveStream, comments, reactions, isHost, localStream,
    setLocalStream
  } = useLiveStore();

  const [inputText, setInputText] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Initialize Host Camera Stream if host
  useEffect(() => {
    let streamTracks: MediaStream | null = null;
    if (isHost && !localStream) {
      navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
        .then((media) => {
          streamTracks = media;
          setLocalStream(media);
          if (videoRef.current) {
            videoRef.current.srcObject = media;
          }
        })
        .catch((err) => {
          console.warn('Camera access denied or unavailable:', err);
        });
    } else if (localStream && videoRef.current) {
      videoRef.current.srcObject = localStream;
    }

    return () => {
      // Don't auto kill stream here to keep smooth transitions
    };
  }, [isHost, localStream, setLocalStream]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSendComment = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;
    sendComment(inputText, user);
    setInputText('');
  };

  const handleHeartClick = () => {
    sendReaction('❤️', user);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: stream.title,
        text: `Watch ${stream.streamerName} live on NexusChat!`,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    }
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = micMuted);
      setMicMuted(!micMuted);
    }
  };

  const toggleCam = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = cameraOff);
      setCameraOff(!cameraOff);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="fixed inset-0 z-[100] bg-black flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Background Live Video Container */}
      <div className="absolute inset-0 z-0 bg-neutral-900 flex items-center justify-center overflow-hidden">
        {isHost && localStream && !cameraOff ? (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="relative w-full h-full">
            {/* Stream Thumbnail Background with Blur */}
            <img 
              src={stream.thumbnail || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200'} 
              alt={stream.title}
              className="w-full h-full object-cover filter brightness-[0.7] blur-sm scale-105"
            />
            {/* Foreground Live Content */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 flex flex-col items-center justify-center">
              <div className="relative">
                <img 
                  src={stream.streamerPfp || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} 
                  alt={stream.streamerName}
                  className="w-28 h-28 rounded-full border-4 border-[#25D366] shadow-[0_0_30px_rgba(37,211,102,0.4)] object-cover animate-pulse"
                />
                <span className="absolute bottom-0 right-0 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-black">
                  LIVE
                </span>
              </div>
              <h2 className="text-white text-xl font-bold mt-4 text-center px-6 drop-shadow-md">
                {stream.streamerName}
              </h2>
              <p className="text-white/80 text-sm mt-1 max-w-xs text-center line-clamp-2 px-4">
                {stream.title}
              </p>
            </div>
          </div>
        )}

        {/* Ambient Dark Gradient Overlays for Controls Readability */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10" />
      </div>

      {/* Floating Share Toast Notification */}
      <AnimatePresence>
        {showShareToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-[#25D366] text-black font-semibold text-xs px-4 py-2 rounded-full shadow-lg flex items-center space-x-2"
          >
            <Check size={16} />
            <span>Live stream link copied to clipboard!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================================================== */}
      {/* 1. TOP HEADER OVERLAY (Matching Instagram Live UI)  */}
      {/* ==================================================== */}
      <div className="relative z-20 pt-10 px-4 flex items-center justify-between">
        {/* Left Side: Streamer Info */}
        <div className="flex items-center space-x-2.5 bg-black/40 backdrop-blur-md p-1.5 pr-3 rounded-full border border-white/10">
          <img 
            src={stream.streamerPfp || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} 
            alt={stream.streamerUsername}
            className="w-9 h-9 rounded-full object-cover border border-white/20"
          />
          <div className="flex items-center space-x-1">
            <span className="text-white font-bold text-sm tracking-wide">
              {stream.streamerUsername}
            </span>
            <ChevronDown size={16} className="text-white/80" />
          </div>
        </div>

        {/* Right Side: LIVE badge, Viewer Count & Close Button */}
        <div className="flex items-center space-x-2">
          {/* Red LIVE Badge */}
          <div className="bg-[#FF0050] text-white text-[11px] font-black px-2.5 py-1 rounded-md tracking-wider shadow-sm flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>LIVE</span>
          </div>

          {/* Viewer Count Badge */}
          <div className="bg-black/50 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/10 flex items-center space-x-1.5 shadow-sm">
            <Eye size={14} className="text-white/90" />
            <span>{(stream.viewerCount || 1).toLocaleString()}</span>
          </div>

          {/* Close / End Button */}
          <button 
            onClick={() => {
              if (isHost) {
                endLiveStream(stream.id);
              }
              onClose();
            }}
            className="p-2 bg-black/40 backdrop-blur-md text-white/90 hover:text-white rounded-full border border-white/10 hover:bg-black/60 transition-colors ml-1"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 2. FLOATING HEART REACTION PARTICLES (Right Side)   */}
      {/* ==================================================== */}
      <div className="absolute right-4 bottom-24 z-20 pointer-events-none w-16 h-64 flex flex-col justify-end items-center overflow-hidden">
        <AnimatePresence>
          {reactions.map((react) => (
            <motion.div
              key={react.id}
              initial={{ opacity: 1, y: 30, scale: 0.6, x: (Math.random() - 0.5) * 30 }}
              animate={{ 
                opacity: [1, 1, 0], 
                y: -240, 
                scale: [0.6, 1.2, 0.9],
                x: [(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20]
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.2, ease: 'easeOut' }}
              className="absolute text-3xl filter drop-shadow-[0_0_10px_rgba(255,0,80,0.6)]"
            >
              {react.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ==================================================== */}
      {/* 3. BOTTOM-LEFT LIVE CHAT & PINNED COMMENT OVERLAY   */}
      {/* ==================================================== */}
      <div className="relative z-20 pb-4 px-4 flex flex-col justify-end flex-1 max-w-lg">
        {/* Scrollable Live Comments Container */}
        <div className="max-h-64 overflow-y-auto space-y-2.5 no-scrollbar pb-2">
          {comments.map((comment) => (
            <motion.div 
              key={comment.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "flex items-start space-x-2.5 max-w-[88%]",
                comment.isPinned ? "bg-black/60 border border-[#25D366]/40 p-2.5 rounded-2xl backdrop-blur-md shadow-lg" : "bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full"
              )}
            >
              <img 
                src={comment.userPfp || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'} 
                alt={comment.username}
                className="w-7 h-7 rounded-full object-cover border border-white/20 shrink-0 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-white/90 font-bold text-xs">
                    {comment.username}
                  </span>
                  {comment.isPinned && (
                    <span className="text-[10px] text-[#25D366] font-bold flex items-center space-x-0.5">
                      <Pin size={10} className="fill-[#25D366]" />
                      <span>PINNED</span>
                    </span>
                  )}
                </div>
                <p className="text-white text-xs font-normal leading-relaxed break-words">
                  {comment.text}
                </p>
              </div>

              {/* Host Pin Option */}
              {isHost && !comment.isPinned && (
                <button 
                  onClick={() => pinComment(comment)}
                  className="text-white/40 hover:text-white p-1 shrink-0"
                  title="Pin Comment"
                >
                  <Pin size={12} />
                </button>
              )}
            </motion.div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Host Control Floating Bar (If Streaming Host) */}
        {isHost && (
          <div className="mb-3 flex items-center justify-between bg-black/60 backdrop-blur-md p-2 rounded-2xl border border-white/10 text-white">
            <div className="flex items-center space-x-2">
              <button 
                onClick={toggleMic}
                className={cn("p-2 rounded-full transition-colors", micMuted ? "bg-red-500/80 text-white" : "bg-white/10 hover:bg-white/20")}
              >
                {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button 
                onClick={toggleCam}
                className={cn("p-2 rounded-full transition-colors", cameraOff ? "bg-red-500/80 text-white" : "bg-white/10 hover:bg-white/20")}
              >
                {cameraOff ? <Camera size={18} /> : <Camera size={18} />}
              </button>
            </div>

            <div className="text-xs text-white/70 font-mono flex items-center space-x-1">
              <Radio size={14} className="text-[#25D366] animate-pulse" />
              <span>Broadcasting Live</span>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* 4. BOTTOM ACTION INPUT BAR (Matching Instagram UI)  */}
        {/* ==================================================== */}
        <form onSubmit={handleSendComment} className="flex items-center space-x-3 w-full">
          {/* Capsule Comment Input */}
          <div className="flex-1 relative flex items-center">
            <input 
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Add a comment..."
              className="w-full bg-black/40 backdrop-blur-lg text-white text-sm px-4 py-3 rounded-full border border-white/30 focus:outline-none focus:border-white/70 placeholder-white/60 shadow-md transition-all"
            />
            {inputText.trim() && (
              <button 
                type="submit"
                className="absolute right-3.5 text-[#25D366] font-bold text-xs hover:opacity-80 transition-opacity"
              >
                Send
              </button>
            )}
          </div>

          {/* Clean Instagram Action Icons */}
          <div className="flex items-center space-x-3.5 shrink-0 text-white">
            {/* 1. Add Guest / Stacked Live Icon */}
            <button 
              type="button"
              className="hover:opacity-80 transition-opacity active:scale-95 text-white"
              title="Invite Guest"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="13" height="13" rx="3" />
                <path d="M16 8h2.5A2.5 2.5 0 0 1 21 10.5v7.5a2.5 2.5 0 0 1-2.5 2.5h-7.5A2.5 2.5 0 0 1 8.5 18V16" />
                <line x1="9.5" y1="6.5" x2="9.5" y2="12.5" />
                <line x1="6.5" y1="9.5" x2="12.5" y2="9.5" />
              </svg>
            </button>

            {/* 2. Q&A Speech Bubble Icon */}
            <button 
              type="button"
              className="hover:opacity-80 transition-opacity active:scale-95 text-white"
              title="Q&A Questions"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2.5-2.5 2.5" />
                <circle cx="12" cy="15" r="0.75" fill="currentColor" />
              </svg>
            </button>

            {/* 3. Instagram Direct Paper Plane Icon */}
            <button 
              type="button"
              onClick={handleShare}
              className="hover:opacity-80 transition-opacity active:scale-95 text-white"
              title="Share Live"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>

            {/* 4. Heart Reaction Icon */}
            <button 
              type="button"
              onClick={handleHeartClick}
              className="hover:opacity-80 transition-transform active:scale-125 text-white"
              title="Like Live"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
