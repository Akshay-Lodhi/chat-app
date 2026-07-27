'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Heart, Send, ChevronDown, Eye, Plus, HelpCircle, 
  Share2, Pin, Mic, MicOff, Camera, RefreshCw, Radio, Check, Copy, Gift
} from 'lucide-react';
import Peer from 'simple-peer';
import { useLiveStore, LiveStreamSession, LiveComment } from '@/store/useLiveStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { Avatar } from '@/components/ui/Avatar';
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
    setLocalStream, activeStream, activeViewers, mutedUserIds,
    kickUser, muteUser, unmuteUser, remoteStream, setRemoteStream,
    sendGift, followStreamer
  } = useLiveStore();

  const currentStream = activeStream || stream;

  const [inputText, setInputText] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showViewerList, setShowViewerList] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showGiftMenu, setShowGiftMenu] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const peersRef = useRef<Record<string, Peer.Instance>>({});
  const viewerPeerRef = useRef<Peer.Instance | null>(null);

  const handleFollowClick = () => {
    setIsFollowing(prev => !prev);
    if (!isFollowing) {
      followStreamer(user);
    }
  };

  // Initialize Host Camera Stream if host, or bind remoteStream if viewer
  useEffect(() => {
    if (isHost) {
      if (!localStream) {
        navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
          .then((media) => {
            setLocalStream(media);
            if (videoRef.current) {
              videoRef.current.srcObject = media;
            }
          })
          .catch((err) => {
            console.warn('Camera access denied or unavailable:', err);
          });
      } else if (videoRef.current && videoRef.current.srcObject !== localStream) {
        videoRef.current.srcObject = localStream;
      }
    } else {
      if (remoteStream && videoRef.current && videoRef.current.srcObject !== remoteStream) {
        videoRef.current.srcObject = remoteStream;
      }
    }
  }, [isHost, localStream, remoteStream, setLocalStream]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  // Listen to kick event
  useEffect(() => {
    const socket = useChatStore.getState().socket;
    if (socket && user) {
      const handleKicked = ({ targetUserId }: { targetUserId: string }) => {
        if (targetUserId === user.id) {
          alert('You have been kicked from this live session by the host.');
          leaveLiveStream(user);
          onClose();
        }
      };

      socket.on('user-kicked-live', handleKicked);
      return () => {
        socket.off('user-kicked-live', handleKicked);
      };
    }
  }, [user, leaveLiveStream, onClose]);

  // WebRTC Host Viewer Connection initiator
  const initiateViewerConnection = (viewerId: string, stream: MediaStream) => {
    const socket = useChatStore.getState().socket;
    if (!socket) return;

    if (peersRef.current[viewerId]) {
      try { peersRef.current[viewerId].destroy(); } catch (e) {}
    }

    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: stream
    });

    peer.on('signal', (data) => {
      socket.emit('live-signal', {
        streamId: currentStream.id,
        targetUserId: viewerId,
        signalData: data
      });
    });

    peer.on('error', (err) => {
      console.error('Host WebRTC Peer error for viewer:', viewerId, err);
    });

    peersRef.current[viewerId] = peer;
  };

  // WebRTC socket events and state synchronization
  useEffect(() => {
    const socket = useChatStore.getState().socket;
    if (!socket) return;

    // Host: Listen for live-user-joined to start peer connection
    const handleUserJoined = ({ user: joinedUser }: { user: any }) => {
      if (isHost && localStream) {
        initiateViewerConnection(joinedUser.id, localStream);
      }
    };

    // Both: Listen to signaling exchange
    const handleLiveSignal = ({ signalData, fromUserId }: { signalData: any, fromUserId: string }) => {
      if (!isHost) {
        // Viewer receiving offer from Host
        if (!viewerPeerRef.current) {
          const peer = new Peer({
            initiator: false,
            trickle: false
          });

          peer.on('signal', (data) => {
            socket.emit('live-signal', {
              streamId: currentStream.id,
              targetUserId: fromUserId,
              signalData: data
            });
          });

          peer.on('stream', (stream) => {
            setRemoteStream(stream);
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          });

          peer.on('error', (err) => {
            console.error('Viewer WebRTC Peer error:', err);
          });

          viewerPeerRef.current = peer;
        }
        try {
          viewerPeerRef.current.signal(signalData);
        } catch (e) {
          console.error('Error signaling viewer peer:', e);
        }
      } else {
        // Host receiving answer from Viewer
        const peer = peersRef.current[fromUserId];
        if (peer) {
          try {
            peer.signal(signalData);
          } catch (e) {
            console.error('Error signaling host peer:', e);
          }
        }
      }
    };

    socket.on('live-user-joined', handleUserJoined);
    socket.on('live-signal', handleLiveSignal);

    // If host has existing viewers and localStream changes
    if (isHost && localStream && activeViewers) {
      activeViewers.forEach(viewer => {
        if (viewer.id !== user?.id) {
          initiateViewerConnection(viewer.id, localStream);
        }
      });
    }

    // Notify server to join the socket channel room (both host and viewers)
    if (user) {
      socket.emit('join-live', { streamId: currentStream.id, user });
    }

    return () => {
      socket.off('live-user-joined', handleUserJoined);
      socket.off('live-signal', handleLiveSignal);
    };
  }, [isHost, localStream, activeViewers, user, currentStream.id]);

  // Clean up peers of disconnected viewers
  useEffect(() => {
    if (isHost && activeViewers) {
      const viewerIds = activeViewers.map(v => v.id);
      Object.keys(peersRef.current).forEach(viewerId => {
        if (!viewerIds.includes(viewerId)) {
          try {
            peersRef.current[viewerId].destroy();
          } catch (e) {}
          delete peersRef.current[viewerId];
        }
      });
    }
  }, [activeViewers, isHost]);

  // Destructor cleanup
  useEffect(() => {
    return () => {
      Object.values(peersRef.current).forEach(p => {
        try { p.destroy(); } catch (e) {}
      });
      peersRef.current = {};
      if (viewerPeerRef.current) {
        try { viewerPeerRef.current.destroy(); } catch (e) {}
        viewerPeerRef.current = null;
      }
      setRemoteStream(null);
    };
  }, [setRemoteStream]);

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
        title: currentStream.title,
        text: `Watch ${currentStream.streamerName} live on NexusChat!`,
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
      className="fixed inset-0 z-[100] bg-black flex flex-col justify-between overflow-hidden"
    >
      {/* Background Live Video Container */}
      <div className="absolute inset-0 z-0 bg-neutral-900 flex items-center justify-center overflow-hidden">
        {((isHost && localStream) || (!isHost && remoteStream)) ? (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted={isHost}
            className="w-full h-full object-cover" 
          />
        ) : (
          <div className="relative w-full h-full">
            {/* Stream Thumbnail Background with Blur */}
            <img 
              src={currentStream.thumbnail || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200'} 
              alt={currentStream.title}
              className="w-full h-full object-cover filter brightness-[0.7] blur-sm scale-105"
            />
            {/* Foreground Live Content */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 flex flex-col items-center justify-center">
              <div className="relative">
                <Avatar 
                  src={currentStream.streamerPfp} 
                  fallback={currentStream.streamerUsername} 
                  className="w-28 h-28 border-4 border-[#25D366] shadow-[0_0_30px_rgba(37,211,102,0.4)] animate-pulse"
                />
                <span className="absolute bottom-0 right-0 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-black">
                  LIVE
                </span>
              </div>
              <h2 className="text-white text-xl font-bold mt-4 text-center px-6 drop-shadow-md">
                {currentStream.streamerName}
              </h2>
              <p className="text-white/80 text-sm mt-1 max-w-xs text-center line-clamp-2 px-4">
                {currentStream.title}
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
      <div className="relative z-20 pt-14 px-4 flex items-center justify-between">
        {/* Left Side: Streamer Info & Follow Button */}
        <div className="flex items-center">
          <div className="flex items-center space-x-2.5 bg-black/40 backdrop-blur-md p-1.5 pr-3 rounded-full border border-white/10">
            <Avatar 
              src={currentStream.streamerPfp} 
              fallback={currentStream.streamerUsername} 
              className="w-9 h-9 border border-white/20"
            />
            <div className="flex items-center space-x-1">
              <span className="text-white font-bold text-sm tracking-wide">
                {currentStream.streamerUsername}
              </span>
              <ChevronDown size={16} className="text-white/80" />
            </div>
          </div>
          {!isHost && (
            <button 
              onClick={handleFollowClick}
              className={cn(
                "ml-2 px-3.5 py-1.5 rounded-full text-xs font-black transition-all active:scale-95",
                isFollowing 
                  ? "bg-white/10 text-white/60 border border-white/10" 
                  : "bg-[#25D366] text-black shadow-[0_0_12px_rgba(37,211,102,0.3)] hover:scale-105"
              )}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>

        {/* Right Side: LIVE badge, Viewer Count, Likes Count & Close Button */}
        <div className="flex items-center space-x-2">
          {/* Red LIVE Badge */}
          <div className="bg-[#FF0050] text-white text-[11px] font-black px-2.5 py-1 rounded-md tracking-wider shadow-sm flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>LIVE</span>
          </div>

          {/* Viewer Count Badge */}
          <button 
            onClick={() => setShowViewerList(true)}
            className="bg-black/50 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/10 flex items-center space-x-1.5 shadow-sm cursor-pointer hover:bg-black/75 transition-colors"
          >
            <Eye size={14} className="text-white/90" />
            <span>{(currentStream.viewerCount || 1).toLocaleString()}</span>
          </button>

          {/* Likes Count Badge */}
          <div className="bg-black/50 backdrop-blur-md text-white text-xs font-semibold px-3 py-1 rounded-full border border-white/10 flex items-center space-x-1.5 shadow-sm">
            <Heart size={14} className="text-red-500 fill-red-500" />
            <span>{(currentStream.likesCount || 0).toLocaleString()}</span>
          </div>

          {/* Explicit Leave/End Text Button */}
          <button 
            onClick={() => {
              if (isHost) {
                endLiveStream(currentStream.id);
              } else {
                leaveLiveStream(user);
              }
              onClose();
            }}
            className={cn(
              "px-3.5 py-1.5 backdrop-blur-md text-white text-xs font-bold rounded-full border transition-all active:scale-95",
              isHost 
                ? "bg-red-600 border-red-500 hover:bg-red-700 shadow-[0_0_12px_rgba(220,38,38,0.4)]" 
                : "bg-red-600/90 border-red-500/30 hover:bg-red-600 hover:border-red-500"
            )}
          >
            {isHost ? "End" : "Leave"}
          </button>

          {/* Close / End Button Icon */}
          <button 
            onClick={() => {
              if (isHost) {
                endLiveStream(currentStream.id);
              } else {
                leaveLiveStream(user);
              }
              onClose();
            }}
            className="p-2 bg-black/40 backdrop-blur-md text-white/90 hover:text-white rounded-full border border-white/10 hover:bg-black/60 transition-colors ml-0.5"
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
      <div className="relative z-20 pb-4 px-4 flex flex-col justify-end flex-1 max-w-lg w-full">
        {/* Scrollable Live Comments Container */}
        <div className="max-h-64 overflow-y-auto space-y-2.5 no-scrollbar pb-2">
          {comments.map((comment) => (
            <motion.div 
              key={comment.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                "flex items-start space-x-2.5 max-w-[88%]",
                comment.isPinned 
                  ? "bg-black/60 border border-[#25D366]/40 p-2.5 rounded-2xl backdrop-blur-md shadow-lg" 
                  : (comment as any).isGift
                    ? "bg-gradient-to-r from-yellow-500/30 to-amber-500/30 border border-yellow-500/40 px-3.5 py-2 rounded-2xl backdrop-blur-md shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                    : (comment as any).isFollow
                      ? "bg-gradient-to-r from-pink-500/30 to-rose-500/30 border border-pink-500/40 px-3.5 py-2 rounded-2xl backdrop-blur-md shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                      : "bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full"
              )}
            >
              <Avatar 
                src={comment.userPfp} 
                fallback={comment.username} 
                className="w-7 h-7 border border-white/20 shrink-0 mt-0.5"
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

            {/* 4. Gift Icon */}
            {!isHost && (
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setShowGiftMenu(prev => !prev)}
                  className={cn("hover:opacity-80 transition-transform active:scale-125 cursor-pointer", showGiftMenu ? "text-[#25D366]" : "text-white")}
                  title="Send Gift"
                >
                  <Gift size={26} />
                </button>

                {showGiftMenu && (
                  <div className="absolute bottom-12 right-0 bg-black/90 backdrop-blur-md p-3 rounded-2xl border border-white/10 flex items-center space-x-3 z-50 shadow-2xl">
                    {[
                      { name: 'Rose', emoji: '🌹' },
                      { name: 'Heart', emoji: '💖' },
                      { name: 'Crown', emoji: '👑' },
                      { name: 'Diamond', emoji: '💎' }
                    ].map((gift) => (
                      <button
                        key={gift.name}
                        type="button"
                        onClick={() => {
                          sendGift(gift.emoji, user);
                          setShowGiftMenu(false);
                        }}
                        className="flex flex-col items-center p-2 hover:bg-white/10 rounded-xl transition-colors active:scale-95 cursor-pointer"
                      >
                        <span className="text-2xl mb-1">{gift.emoji}</span>
                        <span className="text-[10px] text-white/70 font-semibold">{gift.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 5. Heart Reaction Icon */}
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

      {/* ─── Viewer Management Modal (Host only / View only for users) ─── */}
      <AnimatePresence>
        {showViewerList && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setShowViewerList(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="bg-[#1f2c34] border-t border-white/10 w-full max-w-md rounded-t-3xl p-5 pb-8 space-y-4 max-h-[70vh] flex flex-col pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-white font-bold text-base flex items-center space-x-2">
                  <Eye size={18} className="text-[#25D366]" />
                  <span>Live Viewers ({activeViewers.length})</span>
                </h3>
                <button 
                  onClick={() => setShowViewerList(false)}
                  className="p-1 rounded-full bg-white/5 text-white/70 hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {activeViewers.length === 0 ? (
                  <p className="text-white/40 text-xs text-center py-6">No active viewers.</p>
                ) : (
                  activeViewers.map((viewer) => {
                    const isMuted = mutedUserIds.includes(viewer.id);
                    const isViewerHost = viewer.id === currentStream.streamerId;
                    return (
                      <div key={viewer.id} className="flex items-center justify-between bg-black/20 p-2.5 rounded-xl border border-white/5">
                        <div className="flex items-center space-x-2.5">
                          <Avatar 
                            src={viewer.avatar} 
                            fallback={viewer.name || viewer.username} 
                            className="w-8 h-8 border border-white/10"
                          />
                          <div className="text-left">
                            <p className="text-white text-xs font-semibold">{viewer.name}</p>
                            <p className="text-white/50 text-[10px]">@{viewer.username}</p>
                          </div>
                        </div>

                        {/* Moderation Controls (Only visible to host, and cannot moderate oneself) */}
                        {isHost && !isViewerHost && (
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => isMuted ? unmuteUser(viewer.id) : muteUser(viewer.id)}
                              className={cn(
                                "px-2.5 py-1 rounded-md text-[10px] font-bold transition-all",
                                isMuted ? "bg-emerald-500/20 text-[#25D366] border border-emerald-500/30" : "bg-white/5 text-white/80 hover:bg-white/10 border border-white/10"
                              )}
                            >
                              {isMuted ? 'Unmute' : 'Mute'}
                            </button>
                            <button
                              onClick={() => kickUser(viewer.id)}
                              className="px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-[10px] font-bold transition-all"
                            >
                              Kick
                            </button>
                          </div>
                        )}
                        {isViewerHost && (
                          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                            Host
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
