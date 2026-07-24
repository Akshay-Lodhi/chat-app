import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Check, CheckCheck, Play, Pause, FileText, CornerUpLeft, MapPin, Phone, Video, PhoneMissed, Info, Trash2, X, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, useDragControls, AnimatePresence } from 'framer-motion';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { CallDetailsModal } from './CallDetailsModal';
import { ContextMenu } from './ContextMenu';
import { DeleteMessageModal } from './DeleteMessageModal';

const AudioPlayer = ({ src }: { src: string }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const setAudioData = () => {
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
    };
    
    const setAudioTime = () => {
      setCurrentTime(audio.currentTime);
    };
    
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', handleEnded);
    
    // In case it's already loaded
    if (audio.readyState >= 1) {
      setAudioData();
    }

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [src]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  // If we don't have duration yet, just show 0:00 or current time
  const displayTime = isPlaying ? currentTime : (duration || 0);

  return (
    <div className="flex items-center space-x-2 bg-black/5 p-2 rounded-lg min-w-[160px]" onClick={(e) => e.stopPropagation()}>
      <button onClick={togglePlay} className="p-2 bg-primary text-white rounded-full flex-shrink-0 hover:bg-primary/90 transition-colors">
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="flex-1 min-w-[80px]">
        <div className="h-1.5 bg-black/20 rounded-full overflow-hidden w-full relative">
          <div className="h-full bg-primary absolute left-0 top-0 transition-all duration-75" style={{ width: `${progress}%` }}></div>
        </div>
      </div>
      <span className="text-xs opacity-70 w-8 text-right flex-shrink-0 tabular-nums font-medium">{formatTime(displayTime)}</span>
      <audio ref={audioRef} src={src} style={{ display: 'none' }} preload="metadata" />
    </div>
  );
};

interface MessageBubbleProps {
  message: any;
  isMine: boolean;
  onReply?: () => void;
  onMediaClick?: (url: string, type: 'IMAGE' | 'VIDEO') => void;
  onCallClick?: (type: 'AUDIO' | 'VIDEO', callData?: any) => void;
  highlight?: boolean;
  hideInfoOption?: boolean;
  onForward?: () => void;
  fullWidth?: boolean;
}

export function MessageBubble({ message, isMine, onReply, onMediaClick, onCallClick, highlight, hideInfoOption, onForward, fullWidth }: MessageBubbleProps) {
  const { toggleReaction, setMessageForInfo, chats, activeChatId, deleteMessage, selectedMessageIds, toggleMessageSelection } = useChatStore();
  const { user: currentUser } = useAuthStore();
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const activeChat = chats.find(c => c.id === activeChatId || c.id === message.chatId);
  const dragControls = useDragControls();
  const msgTime = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Long press / Context menu logic
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showCallDetails, setShowCallDetails] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);



  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    
    if ('clientX' in e) {
      x = e.clientX;
      y = e.clientY;
    } else if (e.touches && e.touches[0]) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    }

    setMenuPosition({ x, y });
    setShowContextMenu(true);
  };

  const handleInteraction = (e: any) => {
    if (selectedMessageIds.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      toggleMessageSelection(message.id);
    }
  };

  const startLongPress = useCallback((e: any) => {
    // Persist event so we can use its coordinates later
    e.persist?.();
    longPressTimerRef.current = setTimeout(() => {
      setShowReactions(true);
      if (!selectedMessageIds.includes(message.id)) {
        handleInteraction(e); // Toggle selection on long press
      }
    }, 500); // 500ms long press
  }, [message.id, selectedMessageIds, toggleMessageSelection]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  }, []);

  useEffect(() => {
    return clearLongPress;
  }, [clearLongPress]);

  // Early return if deleted for this user
  if (message.deletedForUsers?.includes(currentUser?.id || '')) {
    return null;
  }

  const handleReaction = (emoji: string) => {
    toggleReaction(message.chatId, message.id, emoji);
    setShowReactions(false);
  };

  // Swipe to reply logic
  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.x > 50 && !isMine) {
      onReply?.();
    } else if (info.offset.x < -50 && isMine) {
      onReply?.();
    }
  };

  const getReplyPreview = (msg: any) => {
    if (!msg) return 'Message content...';
    if (msg.type === 'IMAGE') return '📷 Photo';
    if (msg.type === 'VIDEO') return '🎥 Video';
    if (msg.type === 'AUDIO') return '🎤 Voice message';
    if (msg.type === 'LOCATION') return '📍 Location';
    if (msg.type === 'DOCUMENT') return '📄 Document';
    if (msg.type === 'CALL_LOG') {
      try {
        const callData = JSON.parse(msg.content);
        if (callData.type === 'VIDEO') {
          return <span className="flex items-center"><Video size={13} className="mr-1 inline" /> Video Call</span>;
        }
        return <span className="flex items-center"><Phone size={13} className="mr-1 inline" /> Voice Call</span>;
      } catch (e) {
        return <span className="flex items-center"><Phone size={13} className="mr-1 inline" /> Call History</span>;
      }
    }
    return msg.content;
  };

  const renderContent = () => {
    if (message.deletedForEveryone) {
      return (
        <p className="text-[15px] italic text-text-secondary/70 flex items-center">
          <Trash2 size={14} className="mr-2" />
          {isMine ? 'You deleted this message' : 'This message was deleted'}
        </p>
      );
    }

    switch (message.type) {
      case 'IMAGE':
        return (
          <div className="relative group cursor-pointer" onClick={() => onMediaClick?.(message.mediaUrl || message.content || '', 'IMAGE')}>
            <img src={message.mediaUrl || message.content || undefined} alt="Image" className="rounded-lg max-w-[250px] md:max-w-xs object-cover" />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <span className="text-white text-xs">View</span>
            </div>
          </div>
        );
      case 'VIDEO':
        return (
          <div className="relative group cursor-pointer" onClick={() => onMediaClick?.(message.mediaUrl || message.content || '', 'VIDEO')}>
            <video src={message.mediaUrl || message.content || undefined} className="rounded-lg max-w-[250px] md:max-w-xs object-cover" />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
              <Play className="text-white w-10 h-10 opacity-80" />
            </div>
          </div>
        );
      case 'AUDIO':
        return (
          <AudioPlayer src={message.mediaUrl || message.content || ''} />
        );
      case 'LOCATION':
        let loc;
        try { loc = JSON.parse(message.content); } catch (e) { loc = { lat: 0, lng: 0 }; }
        const hasKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        return (
          <a 
            href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`} 
            target="_blank" 
            rel="noreferrer"
            className="flex flex-col items-center justify-center bg-black/10 rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
          >
            {hasKey ? (
              <img src={`https://maps.googleapis.com/maps/api/staticmap?center=${loc.lat},${loc.lng}&zoom=15&size=300x150&markers=color:red%7C${loc.lat},${loc.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`} alt="Map" className="w-full h-[120px] object-cover" />
            ) : (
              <div className="w-full h-[120px] bg-black/5 flex flex-col items-center justify-center text-text-primary/70">
                <MapPin size={32} className="text-danger mb-2" />
                <span className="text-sm font-medium">Location Shared</span>
              </div>
            )}
            <div className="w-full px-3 py-2 bg-surface text-sm font-medium text-text-primary border-t border-surface-border text-center">
              View on Google Maps
            </div>
          </a>
        );
      case 'DOCUMENT':
      case 'FILE':
        return (
          <a href={message.mediaUrl || message.content} target="_blank" rel="noreferrer" className="flex items-center space-x-3 bg-black/10 p-3 rounded-xl hover:bg-black/20 transition-colors">
            <div className="bg-primary/20 p-2 rounded-lg">
              <FileText size={24} className="text-primary" />
            </div>
            <div className="flex flex-col max-w-[150px]">
              <span className="text-sm font-medium truncate">Document</span>
              <span className="text-xs opacity-70">Click to view</span>
            </div>
          </a>
        );
      case 'CALL_LOG':
        let callData;
        try { callData = JSON.parse(message.content); } catch (e) { callData = { action: 'ENDED', duration: 0, type: 'AUDIO' }; }
        const isMissed = callData.duration === 0 || callData.action === 'MISSED';
        const CallIcon = callData.type === 'VIDEO' ? Video : (isMissed ? PhoneMissed : Phone);

        const isGroupCall = activeChat?.isGroup || callData.isGroup;
        const baseTitle = callData.type === 'VIDEO' ? 'Video Call' : 'Voice Call';
        const callTitle = isGroupCall ? `Group ${baseTitle}` : baseTitle;
        const callSubtext = isMissed 
          ? (isMine ? 'No answer' : 'Missed')
          : (callData.duration ? (
              Math.floor(callData.duration / 60) > 0 
                ? `${Math.floor(callData.duration / 60)}m ${callData.duration % 60}s` 
                : `${callData.duration % 60}s`
            ) : 'Ended');

        return (
          <>
            <div 
              className="flex items-center space-x-2.5 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onCallClick?.(callData.type, callData)}
            >
              <div className={cn("p-2.5 rounded-full", isMissed ? "bg-danger/20 text-danger" : "bg-success/20 text-success")}>
                <CallIcon size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {callTitle}
                </span>
                <span className={cn("text-xs font-medium", isMissed ? "text-danger" : "opacity-80")}>
                  {callSubtext}
                </span>
              </div>
            </div>

            <CallDetailsModal 
              isOpen={showCallDetails} 
              onClose={() => setShowCallDetails(false)} 
              callData={callData} 
              createdAt={message.createdAt}
              onReCall={(type) => onCallClick?.(type, callData)}
              isMine={isMine}
              currentUserId={currentUser?.id}
            />
          </>
        );
      default:
        return (
          <p className={cn("text-sm whitespace-pre-wrap break-words leading-relaxed", highlight && "bg-warning/30 text-warning px-1 rounded")}>
            {message.content}
          </p>
        );
    }
  };

  return (
    <motion.div 
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex w-full group relative", isMine ? "justify-end" : "justify-start")}
    >
      <div 
        className={cn(
          "relative rounded-2xl px-3 py-1.5 flex flex-col shadow-sm cursor-pointer transition-all duration-200",
          fullWidth ? "max-w-[95%] md:max-w-full" : "max-w-[75%] md:max-w-[65%]",
          isMine ? "bg-bubble-out text-white rounded-br-sm" : "bg-bubble-in text-text-primary rounded-bl-sm",
          selectedMessageIds.includes(message.id) && "bg-[#00A884]/20 ring-2 ring-[#00A884] opacity-90 text-text-primary",
          message.replyToId && "pt-2",
          message.reactions && Object.keys(message.reactions).length > 0 && "mb-3"
        )}
        onContextMenu={handleContextMenu}
        onTouchStart={startLongPress}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onMouseDown={startLongPress}
        onMouseUp={clearLongPress}
        onMouseLeave={clearLongPress}
        onClick={handleInteraction}
      >
        
        {/* Reply Context */}
        {message.replyToId && (
          <div className={cn(
            "relative overflow-hidden rounded-r-xl rounded-l-md p-2.5 mb-2 text-xs flex flex-col border-l-[4px] transition-colors hover:bg-black/30",
            isMine 
              ? "bg-black/20 border-[#06cf9c]" 
              : "bg-black/20 border-[#00a884]"
          )}>
            <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none" />
            <span className={cn(
              "font-semibold text-[11px] mb-1 relative z-10",
              isMine ? "text-[#06cf9c]" : "text-[#00a884]"
            )}>
              {message.replyTo?.senderId === message.senderId 
                ? 'You' 
                : (message.replyTo?.sender?.name || 'Replied Message')}
            </span>
            <span className={cn(
              "truncate max-w-[250px] relative z-10 text-[13px]",
              isMine ? "text-white/95" : "text-[#e9edef]/95"
            )}>
              {getReplyPreview(message.replyTo)}
            </span>
          </div>
        )}

        {/* Content */}
        {renderContent()}
        <div 
          className={cn(
            "flex items-center justify-end space-x-1 mt-1 text-[11px]",
            isMine ? "text-white/80" : "text-text-tertiary"
          )}
        >
          <span>{msgTime}</span>
          {isMine && message.type !== 'CALL_LOG' && (
            <span>
              {(message.status || 'SENT') === 'READ' ? <CheckCheck size={14} className="text-[#53bdeb]" /> :
               (message.status || 'SENT') === 'DELIVERED' ? <CheckCheck size={14} className="text-white/80" /> :
               <Check size={14} className="text-white/80" />}
            </span>
          )}
        </div>

      <AnimatePresence>
        {showReactions && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" 
              onClick={() => setShowReactions(false)} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className={cn(
                "absolute top-[-50px] z-50 flex items-center bg-surface border border-surface-border shadow-xl rounded-full px-3 py-2 space-x-3",
                isMine ? "right-0" : "left-0"
              )}
            >
              {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                <button 
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="hover:scale-125 transition-transform text-xl"
                >
                  {emoji}
                </button>
              ))}
              {message.type === 'CALL_LOG' ? (
                <>
                  <div className="w-[1px] h-6 bg-surface-border mx-1" />
                  <button 
                    onClick={() => {
                      setShowCallDetails(true);
                      setShowReactions(false);
                    }}
                    className="flex items-center text-text-secondary hover:text-text-primary px-1"
                    title="Call Details Info"
                  >
                    <Info size={18} />
                  </button>
                </>
              ) : (!hideInfoOption) ? (
                <>
                  <div className="w-[1px] h-6 bg-surface-border mx-1" />
                  <button 
                    onClick={() => {
                      setMessageForInfo(message);
                      setShowReactions(false);
                    }}
                    className="flex items-center text-text-secondary hover:text-text-primary px-1"
                    title="Message Info"
                  >
                    <Info size={18} />
                  </button>
                </>
              ) : null}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ContextMenu
        isOpen={showContextMenu}
        onClose={() => setShowContextMenu(false)}
        position={menuPosition}
        onReply={() => onReply?.()}
        onForward={() => {
          onForward?.();
        }}
        onCopy={() => {
          if (message.content) navigator.clipboard.writeText(message.content);
        }}
        onDelete={() => setIsDeleteModalOpen(true)}
        canDelete={!message.deletedForEveryone} // if it's already deleted, maybe prevent delete again
      />

      <DeleteMessageModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        canDeleteForEveryone={isMine && !message.deletedForEveryone} // Could add 24h check here too
        onDeleteForMe={() => {
          deleteMessage(message.chatId, message.id, 'me');
          setIsDeleteModalOpen(false);
        }}
        onDeleteForEveryone={() => {
          deleteMessage(message.chatId, message.id, 'everyone');
          setIsDeleteModalOpen(false);
        }}
      />

        {/* Reactions Display */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              setShowReactionDetails(true);
            }}
            className={cn(
              "absolute -bottom-3 flex items-center space-x-0.5 bg-surface-hover rounded-full px-1.5 py-0.5 shadow-sm border border-surface-border text-[11px] cursor-pointer hover:bg-surface-border/50 transition-colors",
              isMine ? "right-2" : "left-2"
            )}
          >
            {Array.from(new Set(Object.values(message.reactions).map((r: any) => typeof r === 'string' ? r : r.emoji))).map((r: any, idx) => (
              <span key={idx} className="z-10">{r}</span>
            ))}
          </div>
        )}

        {/* Swipe Hint */}
        <div 
          onClick={onReply}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-10 transition-opacity cursor-pointer p-2",
            isMine ? "-left-10" : "-right-10"
          )}
        >
          <CornerUpLeft size={16} className={isMine ? "text-text-primary" : "text-text-primary scale-x-[-1]"} />
        </div>
      </div>

      <AnimatePresence>
        {showReactionDetails && message.reactions && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={(e) => {
                e.stopPropagation();
                setShowReactionDetails(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative bg-surface rounded-2xl shadow-xl w-full max-w-sm overflow-hidden z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-surface-border bg-surface-hover">
                <h3 className="font-semibold text-text-primary text-lg">Reactions</h3>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowReactionDetails(false);
                  }}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-secondary hover:text-text-primary"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {Object.entries(message.reactions).map(([userId, reactionData]) => {
                  const participant = activeChat?.participants?.find(p => p.userId === userId)?.user;
                  const isMe = userId === currentUser?.id;
                  const name = isMe ? 'You' : participant?.name || participant?.phoneNumber || 'Unknown';
                  const pfp = isMe ? currentUser?.profilePicture : participant?.profilePicture;
                  
                  const emoji = typeof reactionData === 'string' ? reactionData : (reactionData as any).emoji;
                  const timestamp = typeof reactionData === 'string' ? null : (reactionData as any).timestamp;
                  
                  let formattedDate = '';
                  if (timestamp) {
                    const d = new Date(timestamp);
                    formattedDate = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  }

                  return (
                    <div key={userId} className="flex items-center justify-between p-4 border-b border-surface-border/50 last:border-0 hover:bg-surface-hover/30 transition-colors">
                      <div className="flex items-center space-x-3">
                        {pfp ? (
                          <img src={pfp} alt={name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-surface-border flex items-center justify-center">
                            <User size={20} className="text-text-secondary" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-medium text-text-primary">{name}</span>
                          {formattedDate && <span className="text-[11px] text-text-tertiary">{formattedDate}</span>}
                        </div>
                      </div>
                      <span className="text-2xl">{emoji as string}</span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
