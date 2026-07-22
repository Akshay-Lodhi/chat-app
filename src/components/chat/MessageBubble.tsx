import React, { useRef, useState, useEffect } from 'react';
import { Check, CheckCheck, Play, Pause, FileText, CornerUpLeft, MapPin, Phone, Video, PhoneMissed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, useDragControls } from 'framer-motion';

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
  onReply: () => void;
  onMediaClick: () => void;
  onCallClick?: (type: 'AUDIO' | 'VIDEO') => void;
  highlight?: boolean;
}

export function MessageBubble({ message, isMine, onReply, onMediaClick, onCallClick, highlight }: MessageBubbleProps) {
  const [showInfo, setShowInfo] = useState(false);
  const dragControls = useDragControls();
  const msgTime = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Swipe to reply logic
  const handleDragEnd = (event: any, info: any) => {
    if (info.offset.x > 50 && !isMine) {
      onReply();
    } else if (info.offset.x < -50 && isMine) {
      onReply();
    }
  };

  const getReplyPreview = (msg: any) => {
    if (!msg) return 'Message content...';
    if (msg.type === 'IMAGE') return '📷 Photo';
    if (msg.type === 'VIDEO') return '🎥 Video';
    if (msg.type === 'AUDIO') return '🎤 Voice message';
    if (msg.type === 'LOCATION') return '📍 Location';
    if (msg.type === 'DOCUMENT') return '📄 Document';
    if (msg.type === 'CALL_LOG') return '📞 Call History';
    return msg.content;
  };

  const renderContent = () => {
    switch (message.type) {
      case 'IMAGE':
        return (
          <div className="relative group cursor-pointer" onClick={onMediaClick}>
            <img src={message.mediaUrl || message.content || undefined} alt="Image" className="rounded-lg max-w-[250px] md:max-w-xs object-cover" />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
              <span className="text-white text-xs">View</span>
            </div>
          </div>
        );
      case 'VIDEO':
        return (
          <div className="relative group cursor-pointer" onClick={onMediaClick}>
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
        const formatDuration = (secs: number) => {
          if (!secs) return 'Missed Call';
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          return m > 0 ? `${m}m ${s}s` : `${s}s`;
        };
        return (
          <div 
            className="flex items-center space-x-3 p-1 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onCallClick?.(callData.type)}
          >
            <div className={cn("p-3 rounded-full", isMissed ? "bg-danger/20 text-danger" : "bg-success/20 text-success")}>
              <CallIcon size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {callData.type === 'VIDEO' ? 'Video Call' : 'Voice Call'}
              </span>
              <span className={cn("text-xs", isMissed ? "text-danger" : "opacity-80")}>
                {formatDuration(callData.duration)}
              </span>
            </div>
          </div>
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
      <div className={cn(
        "relative max-w-[75%] md:max-w-[65%] rounded-2xl px-4 py-2 flex flex-col shadow-sm",
        isMine ? "bg-bubble-out text-white rounded-br-sm" : "bg-bubble-in text-text-primary rounded-bl-sm",
        message.replyToId && "pt-2",
        message.reactions && Object.keys(message.reactions).length > 0 && "mb-3"
      )}>
        
        {/* Reply Context */}
        {message.replyToId && (
          <div className="bg-black/10 rounded border-l-4 border-black/30 p-2 mb-2 text-xs flex flex-col">
            <span className="font-semibold text-black/60">Replied Message</span>
            <span className="truncate max-w-[200px] text-black/80">
              {getReplyPreview(message.replyTo)}
            </span>
          </div>
        )}

        {/* Content */}
        {renderContent()}

        {/* Metadata */}
        <div 
          className={cn("flex items-center justify-end space-x-1 mt-1 text-[10px] cursor-pointer", isMine ? "text-white/70 hover:text-white" : "text-text-secondary hover:text-text-primary")}
          onClick={() => isMine && setShowInfo(!showInfo)}
        >
          <span>{msgTime}</span>
          {isMine && (
            <span className="ml-1">
              {message.status === 'READ' ? <CheckCheck size={14} className="text-[#53bdeb]" /> :
               message.status === 'DELIVERED' ? <CheckCheck size={14} /> :
               <Check size={14} />}
            </span>
          )}
        </div>

        {/* Message Info Dropdown */}
        {showInfo && isMine && (
          <div className="mt-2 pt-2 border-t border-white/20 text-[10px] flex flex-col space-y-1 bg-black/10 p-2 rounded">
            <div className="flex justify-between">
              <span>Sent:</span>
              <span>{msgTime}</span>
            </div>
            {message.deliveredAt && (
              <div className="flex justify-between">
                <span>Delivered:</span>
                <span>{new Date(message.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
            {message.readAt && (
              <div className="flex justify-between text-[#53bdeb]">
                <span>Seen:</span>
                <span>{new Date(message.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
          </div>
        )}

        {/* Reactions Display */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className={cn(
            "absolute -bottom-3 flex items-center space-x-1 bg-surface-hover rounded-full px-2 py-0.5 shadow-sm border border-surface-border text-xs",
            isMine ? "right-2" : "left-2"
          )}>
            {Array.from(new Set(Object.values(message.reactions))).map((r: any, i: number) => (
              <span key={i}>{r}</span>
            ))}
            <span className="text-text-secondary ml-1">{Object.keys(message.reactions).length}</span>
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
    </motion.div>
  );
}
