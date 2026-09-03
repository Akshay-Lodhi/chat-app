import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Check,
  CheckCheck,
  Play,
  Pause,
  FileText,
  CornerUpLeft,
  MapPin,
  Phone,
  Video,
  PhoneMissed,
  Info,
  Trash2,
  X,
  User,
  Star,
  Clock,
  Sparkles,
  Loader2,
  Pin,
  ChevronDown,
  MoreVertical,
  Plus,
  Globe,
  Camera,
  EyeOff,
  Image as ImageIcon,
  Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useDragControls, AnimatePresence } from "framer-motion";
import { useChatStore } from "@/store/useChatStore";
import { useAuthStore } from "@/store/useAuthStore";
import { CallDetailsModal } from "./CallDetailsModal";
import { PollDetailsModal } from './PollDetailsModal';
import { getCallDetailsPayload } from "@/lib/callUtils";
import { ContextMenu } from "./ContextMenu";
import { DeleteMessageModal } from "./DeleteMessageModal";
import { EmojiPicker } from "./EmojiPicker";
import { LanguagePicker, LANGUAGES } from "./LanguagePicker";
import { apiClient } from "@/lib/apiClient";

export const formatText = (text: string): React.ReactNode[] => {
  const tokenRegex = /(```[\s\S]*?```|`[^`]+`|\*[^\*]+\*|_[^_]+_|~[^~]+~)/g;
  const parts = text.split(tokenRegex);
  
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
      return <pre key={index} className="bg-black/10 dark:bg-white/10 p-2 rounded-md my-1 font-mono text-[13px] overflow-x-auto whitespace-pre-wrap"><code>{part.slice(3, -3)}</code></pre>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return <code key={index} className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-[13px] font-mono">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return <strong key={index} className="font-bold">{part.slice(1, -1)}</strong>;
    }
    if (part.startsWith('_') && part.endsWith('_') && part.length >= 2) {
      return <em key={index} className="italic">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('~') && part.endsWith('~') && part.length >= 2) {
      return <del key={index} className="line-through">{part.slice(1, -1)}</del>;
    }
    return <span key={index}>{part}</span>;
  });
};

const renderMessageContent = (content: string, onMediaClick?: (url: string, type: "IMAGE" | "VIDEO") => void) => {
  if (!content) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const imageRegex = /\.(jpeg|jpg|gif|png|webp|bmp)($|\?)/i;

  const parts = content.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      if (part.match(imageRegex)) {
        return (
          <div 
            key={index} 
            className="my-1.5 inline-block w-full cursor-pointer relative group"
            onClick={(e) => {
              e.stopPropagation();
              onMediaClick?.(part, "IMAGE");
            }}
          >
            <img 
              src={part} 
              alt="Linked image" 
              className="max-w-full sm:max-w-[250px] rounded-lg max-h-64 object-cover bg-black/10 border border-black/5" 
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center pointer-events-none">
              <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">View</span>
            </div>
          </div>
        );
      }
      return (
        <a 
          key={index} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-emerald-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{formatText(part)}</span>;
  });
};

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

    audio.addEventListener("loadedmetadata", setAudioData);
    audio.addEventListener("timeupdate", setAudioTime);
    audio.addEventListener("ended", handleEnded);

    // In case it's already loaded
    if (audio.readyState >= 1) {
      setAudioData();
    }

    return () => {
      audio.removeEventListener("loadedmetadata", setAudioData);
      audio.removeEventListener("timeupdate", setAudioTime);
      audio.removeEventListener("ended", handleEnded);
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
    if (isNaN(time) || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  // If we don't have duration yet, just show 0:00 or current time
  const displayTime = isPlaying ? currentTime : duration || 0;

  return (
    <div
      className="flex items-center space-x-2 bg-black/5 p-2 rounded-lg min-w-[160px]"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={togglePlay}
        className="p-2 bg-primary text-white rounded-full flex-shrink-0 hover:bg-primary/90 transition-colors"
      >
        {isPlaying ? (
          <Pause size={16} fill="currentColor" />
        ) : (
          <Play size={16} fill="currentColor" className="ml-0.5" />
        )}
      </button>
      <div className="flex-1 min-w-[80px]">
        <div className="h-1.5 bg-black/20 rounded-full overflow-hidden w-full relative">
          <div
            className="h-full bg-primary absolute left-0 top-0 transition-all duration-75"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
      <span className="text-xs opacity-70 w-8 text-right flex-shrink-0 tabular-nums font-medium">
        {formatTime(displayTime)}
      </span>
      <audio
        ref={audioRef}
        src={src}
        style={{ display: "none" }}
        preload="metadata"
      />
    </div>
  );
};

interface MessageBubbleProps {
  message: any;
  isMine: boolean;
  onReply?: () => void;
  onMediaClick?: (url: string, type: "IMAGE" | "VIDEO") => void;
  onCallClick?: (type: "AUDIO" | "VIDEO", callData?: any) => void;
  highlight?: boolean;
  hideInfoOption?: boolean;
  onForward?: () => void;
  fullWidth?: boolean;
}

export function MessageBubble({
  message,
  isMine,
  onReply,
  onMediaClick,
  onCallClick,
  highlight,
  hideInfoOption,
  onForward,
  fullWidth,
}: MessageBubbleProps) {
  const {
    toggleReaction,
    setMessageForInfo,
    chats,
    activeChatId,
    deleteMessage,
    selectedMessageIds,
    toggleMessageSelection,
    socket,
    setEditingMessageId,
    toggleStar,
    togglePinMessage,
    transcribeAudioMessage
  } = useChatStore();
  const { user: currentUser } = useAuthStore();
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const activeChat = chats.find(
    (c) => c.id === activeChatId || c.id === message.chatId,
  );
  const dragControls = useDragControls();
  const msgTime = new Date(message.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Long press / Context menu logic
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [showCallDetails, setShowCallDetails] = useState(false);
  const [showPollDetails, setShowPollDetails] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showReactionDetails, setShowReactionDetails] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showFullEmojiPicker, setShowFullEmojiPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [emojiPickerDirection, setEmojiPickerDirection] = useState<'down' | 'up'>('down');
  const [languagePickerDirection, setLanguagePickerDirection] = useState<'down' | 'up'>('down');

  const isImageOnly = message.type === 'TEXT' && 
                      message.content && 
                      message.content.match(/(https?:\/\/[^\s]+)/) && 
                      message.content.match(/\.(jpeg|jpg|gif|png|webp|bmp)($|\?)/i) && 
                      message.content.trim().split(/\s+/).length === 1;
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [translatedLanguage, setTranslatedLanguage] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const handleTranslate = async (targetLanguage: string) => {
    if (!message.content || message.type !== 'TEXT') return;
    try {
      setIsTranslating(true);
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/chats/messages/translate`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.content, targetLanguage })
      });
      const data = await res.json();
      if (data && data.translatedText) {
        setTranslatedText(data.translatedText);
        setTranslatedLanguage(targetLanguage);
      }
    } catch (err) {
      console.error('Failed to translate message:', err);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    if (e && "clientX" in e) {
      x = (e as React.MouseEvent).clientX;
      y = (e as React.MouseEvent).clientY;
    } else if (e && "touches" in e && e.touches[0]) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    }

    setMenuPosition({ x, y });
    setShowContextMenu(true);
    setShowReactions(false);
  };

  const handleRightClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    if (e && "clientX" in e) {
      x = (e as React.MouseEvent).clientX;
      y = (e as React.MouseEvent).clientY;
    } else if (e && "touches" in e && e.touches[0]) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    }

    setMenuPosition({ x, y });
    setShowReactions(true);
    setShowContextMenu(false);
    if (!selectedMessageIds.includes(message.id)) {
      handleInteraction(e);
    }
  };

  const handleInteraction = (e: any) => {
    if (selectedMessageIds.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      toggleMessageSelection(message.id);
    }
  };

  const startLongPress = useCallback(
    (e: any) => {
      e.persist?.();
      longPressTimerRef.current = setTimeout(() => {
        let x = window.innerWidth / 2;
        let y = window.innerHeight / 2;
        if (e && "clientX" in e && e.clientX > 0) {
          x = e.clientX;
          y = e.clientY;
        } else if (e && e.touches && e.touches[0]) {
          x = e.touches[0].clientX;
          y = e.touches[0].clientY;
        }
        setMenuPosition({ x, y });
        setShowReactions(true);
        setShowContextMenu(false);
        if (!selectedMessageIds.includes(message.id)) {
          handleInteraction(e);
        }
      }, 400);
    },
    [message.id, selectedMessageIds, toggleMessageSelection],
  );

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  }, []);

  useEffect(() => {
    return clearLongPress;
  }, [clearLongPress]);

  // Early return if deleted for this user
  if (message.deletedForUsers?.includes(currentUser?.id || "")) {
    return null;
  }

  // System Message (Disappearing timer updates, etc.)
  if (message.type === 'SYSTEM') {
    return (
      <div className="flex justify-center my-3 px-4">
        <div className="bg-surface-hover/80 text-text-secondary border border-border/40 text-xs px-3.5 py-1.5 rounded-xl shadow-xs text-center max-w-md flex items-center justify-center gap-1.5 font-medium">
          <Clock size={13} className="text-emerald-500 shrink-0" />
          <span>{message.content}</span>
        </div>
      </div>
    );
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
    if (!msg) return "Message content...";
    if (msg.type === "IMAGE") return "📷 Photo";
    if (msg.type === "VIDEO") return "🎥 Video";
    if (msg.type === "AUDIO") return "🎤 Voice message";
    if (msg.type === "LOCATION") return "📍 Location";
    if (msg.type === "DOCUMENT") return "📄 Document";
    if (msg.type === "CALL_LOG") {
      try {
        const callData = JSON.parse(msg.content);
        if (callData.type === "VIDEO") {
          return (
            <span className="flex items-center">
              <Video size={13} className="mr-1 inline" /> Video Call
            </span>
          );
        }
        return (
          <span className="flex items-center">
            <Phone size={13} className="mr-1 inline" /> Voice Call
          </span>
        );
      } catch (e) {
        return (
          <span className="flex items-center">
            <Phone size={13} className="mr-1 inline" /> Call History
          </span>
        );
      }
    }
    if (msg.content && typeof msg.content === 'string' && msg.content.startsWith('{"isEncrypted":true')) {
      const chatMsgs = useChatStore.getState().messages[message.chatId] || [];
      const decryptedMsg = chatMsgs.find(m => m.id === msg.id);
      if (decryptedMsg && decryptedMsg.content && !decryptedMsg.content.startsWith('{"isEncrypted":true')) {
        const content = decryptedMsg.content;
        const imageRegex = /\.(jpeg|jpg|gif|png|webp|bmp)($|\?)/i;
        if (content.match(imageRegex)) return "📷 Photo/GIF";
        return content;
      }
      return "🔒 Waiting for message. This may take a while.";
    }
    
    if (typeof msg.content === 'string') {
      const imageRegex = /\.(jpeg|jpg|gif|png|webp|bmp)($|\?)/i;
      if (msg.content.match(imageRegex)) return "📷 Photo/GIF";
    }
    return msg.content;
  };

  const renderContent = () => {
    if (message.deletedForEveryone) {
      return (
        <p className="text-[15px] italic text-text-secondary/70 flex items-center">
          <Trash2 size={14} className="mr-2" />
          {isMine ? "You deleted this message" : "This message was deleted"}
        </p>
      );
    }

    switch (message.type) {
      case "IMAGE":
      case "VIDEO": {
        let meta = message.metadata;
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta);
          } catch(e) {}
        }
        const isViewOnce = meta?.viewOnce;
        const viewedBy = meta?.viewedBy || [];
        const hasViewed = viewedBy.includes(currentUser?.id);

        if (isViewOnce) {
          if (isMine) {
            // Sender cannot view the media again, but can see if it was opened by someone else
            const openedByRecipient = viewedBy.some((id: string) => id !== currentUser?.id);
            
            if (openedByRecipient) {
              return (
                <div className="flex items-center gap-3 p-1.5 pr-4 bg-black/5 dark:bg-white/5 rounded-full border border-white/5 w-fit">
                  <div className="p-2 rounded-full">
                    <EyeOff className="w-4 h-4 opacity-50" />
                  </div>
                  <span className="text-[13px] italic opacity-60 font-medium">Opened {message.type === "IMAGE" ? "Photo" : "Video"}</span>
                </div>
              );
            }
            
            return (
              <div className="flex items-center gap-3 p-1.5 pr-4 bg-black/10 dark:bg-white/5 rounded-full border border-white/5 w-fit">
                <div className="bg-black/10 dark:bg-white/10 p-2 rounded-full">
                  {message.type === "IMAGE" ? <ImageIcon className="w-4 h-4 opacity-90" /> : <Video className="w-4 h-4 opacity-90" />}
                </div>
                <span className="text-[13px] font-medium opacity-90">{message.type === "IMAGE" ? "Photo" : "Video"}</span>
              </div>
            );
          } else {
            // Recipient view
            if (hasViewed) {
              return (
                <div className="flex items-center gap-3 p-1.5 pr-4 bg-black/5 dark:bg-white/5 rounded-full border border-white/5 w-fit">
                  <div className="p-2 rounded-full">
                    <EyeOff className="w-4 h-4 opacity-50" />
                  </div>
                  <span className="text-[13px] italic opacity-60 font-medium">Opened {message.type === "IMAGE" ? "Photo" : "Video"}</span>
                </div>
              );
            } else {
              return (
                <div 
                  className="cursor-pointer p-4 rounded-xl border border-white/10 bg-black/20 flex flex-col items-center min-w-[120px]"
                  onClick={() => {
                    onMediaClick?.(message.mediaUrl || message.content || "", message.type as "IMAGE" | "VIDEO");
                    useChatStore.getState().markViewOnceOpened(message.chatId, message.id);
                  }}
                >
                  <div className="bg-orange-500/20 text-orange-400 p-3 rounded-full mb-2">
                    <EyeOff size={24} />
                  </div>
                  <span className="font-semibold text-sm">View {message.type === 'IMAGE' ? 'Photo' : 'Video'}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-70 mt-1 flex items-center">
                    <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center mr-1 text-[8px] font-bold">1</div>
                    View Once
                  </span>
                </div>
              );
            }
          }
        }

        if (message.type === "IMAGE") {
          return (
            <div
              className="relative group cursor-pointer"
              onClick={() =>
                onMediaClick?.(message.mediaUrl || message.content || "", "IMAGE")
              }
            >
              <img
                src={message.mediaUrl || message.content || undefined}
                alt="Image"
                className="rounded-lg max-w-[250px] md:max-w-xs object-cover"
              />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <span className="text-white text-xs">View</span>
              </div>
            </div>
          );
        } else {
          return (
            <div
              className="relative group cursor-pointer"
              onClick={() =>
                onMediaClick?.(message.mediaUrl || message.content || "", "VIDEO")
              }
            >
              <video
                src={message.mediaUrl || message.content || undefined}
                className="rounded-lg max-w-[250px] md:max-w-xs object-cover"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center rounded-lg">
                <Play className="text-white w-10 h-10 opacity-80" />
              </div>
            </div>
          );
        }
      }
      case "AUDIO": {
        const transcription = message.metadata?.transcription;
        return (
          <div className="flex flex-col gap-2 min-w-[230px] max-w-[320px]">
            <AudioPlayer src={message.mediaUrl || message.content || ""} />
            
            {transcription ? (
              <div className="bg-black/15 border border-purple-500/20 rounded-xl p-2.5 flex flex-col gap-1 text-xs mt-1">
                <div className="flex items-center justify-between text-purple-400 font-semibold">
                  <span className="flex items-center gap-1 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Voice Transcript</span>
                  </span>
                </div>
                <p className="text-text-primary/95 text-xs leading-relaxed select-text font-normal">{transcription}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (isTranscribing) return;
                  setIsTranscribing(true);
                  try {
                    await transcribeAudioMessage(message.id);
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setIsTranscribing(false);
                  }
                }}
                className="self-start flex items-center gap-1.5 text-[11px] font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-2.5 py-1 rounded-lg transition-all cursor-pointer mt-0.5"
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Transcribing with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Transcribe Voice Note</span>
                  </>
                )}
              </button>
            )}
          </div>
        );
      }
      case "LOCATION":
        let loc;
        try {
          loc = JSON.parse(message.content);
        } catch (e) {
          loc = { lat: 0, lng: 0 };
        }
        const hasKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        return (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center justify-center bg-black/10 rounded-xl overflow-hidden hover:opacity-90 transition-opacity"
          >
            {hasKey ? (
              <img
                src={`https://maps.googleapis.com/maps/api/staticmap?center=${loc.lat},${loc.lng}&zoom=15&size=300x150&markers=color:red%7C${loc.lat},${loc.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`}
                alt="Map"
                className="w-full h-[120px] object-cover"
              />
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
      case "DOCUMENT":
      case "FILE":
        return (
          <a
            href={message.mediaUrl || message.content}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-3 bg-black/10 p-3 rounded-xl hover:bg-black/20 transition-colors"
          >
            <div className="bg-primary/20 p-2 rounded-lg">
              <FileText size={24} className="text-primary" />
            </div>
            <div className="flex flex-col max-w-[150px]">
              <span className="text-sm font-medium truncate">Document</span>
              <span className="text-xs opacity-70">Click to view</span>
            </div>
          </a>
        );
      case "CALL_LOG":
        let callData;
        try {
          callData = JSON.parse(message.content);
        } catch (e) {
          callData = { action: "ENDED", duration: 0, type: "AUDIO" };
        }
        const isMissed =
          callData.duration === 0 || callData.action === "MISSED";
        const CallIcon =
          callData.type === "VIDEO" ? Video : isMissed ? PhoneMissed : Phone;

        const isGroupCall = activeChat?.isGroup || callData.isGroup;
        const baseTitle =
          callData.type === "VIDEO" ? "Video Call" : "Voice Call";
        const callTitle = isGroupCall ? `Group ${baseTitle}` : baseTitle;
        const callSubtext = isMissed
          ? isMine
            ? "No answer"
            : "Missed"
          : callData.duration
            ? Math.floor(callData.duration / 60) > 0
              ? `${Math.floor(callData.duration / 60)}m ${callData.duration % 60}s`
              : `${callData.duration % 60}s`
            : "Ended";

        return (
          <>
            <div
              className="flex items-center space-x-2.5 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onCallClick?.(callData.type, callData)}
            >
              <div
                className={cn(
                  "p-2.5 rounded-full",
                  isMissed
                    ? "bg-danger/20 text-danger"
                    : "bg-success/20 text-success",
                )}
              >
                <CallIcon size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{callTitle}</span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    isMissed ? "text-danger" : "opacity-80",
                  )}
                >
                  {callSubtext}
                </span>
              </div>
            </div>

            {(() => {
              const payload = getCallDetailsPayload(callData, {
                currentUser,
                chat: activeChat,
                message,
                isOutgoing: isMine,
              });
              return (
                <CallDetailsModal
                  isOpen={showCallDetails}
                  onClose={() => setShowCallDetails(false)}
                  callData={payload?.callData || callData}
                  createdAt={payload?.createdAt || message.createdAt}
                  onReCall={(type) => onCallClick?.(type, callData)}
                  isMine={payload?.isMine ?? isMine}
                  currentUserId={currentUser?.id}
                />
              );
            })()}
          </>
        );
      case "POLL":
        const poll = message.metadata?.poll;
        if (!poll) return null;
        const totalVotes = poll.options.reduce((sum: number, opt: any) => sum + (opt.votes?.length || 0), 0);
        
        return (
          <>
            <div className="flex flex-col min-w-[240px] sm:min-w-[270px] p-2.5 sm:p-3">
              <h4 className="font-semibold text-[16px] mb-3 text-text-primary pr-2 leading-snug">{poll.question}</h4>
              <div className="space-y-3.5">
                {poll.options.map((opt: any) => {
                  const voteCount = opt.votes?.length || 0;
                  const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                  const hasVoted = opt.votes?.includes(currentUser?.id);

                  // Get avatars for up to 3 voters
                  const voterAvatars = opt.votes?.slice(0, 3).map((vId: string) => {
                    const participant = activeChat?.participants?.find(p => p.userId === vId)?.user;
                    return participant?.profilePicture || null;
                  }) || [];

                  return (
                    <div 
                      key={opt.id}
                      onClick={() => socket?.emit('vote-poll', { messageId: message.id, optionId: opt.id, chatId: message.chatId })}
                      className="cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          <div className={cn(
                            "w-[18px] h-[18px] rounded-full border shrink-0 flex items-center justify-center transition-colors",
                            hasVoted ? "border-[#00a884] bg-[#00a884]" : "border-text-secondary"
                          )}>
                            {hasVoted && <Check size={12} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className="text-[15px] text-text-primary leading-tight break-words min-w-0">
                            {opt.text}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-1.5 shrink-0 pl-1">
                          {voterAvatars.length > 0 && (
                            <div className="flex -space-x-1.5 shrink-0">
                              {voterAvatars.map((src: string, i: number) => (
                                <div key={i} className="w-5 h-5 rounded-full overflow-hidden border border-surface bg-surface-hover shrink-0 shadow-xs">
                                  {src ? <img src={src} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gray-500" />}
                                </div>
                              ))}
                            </div>
                          )}
                          {voteCount > 0 && (
                            <span className="text-xs font-medium text-text-secondary shrink-0 min-w-[14px] text-right">
                              {voteCount}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Progress Bar Container with safe padding */}
                      <div className="w-full pl-7 pr-1 mt-1">
                        <div className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden">
                          <div 
                            className={cn("h-full transition-all duration-300 rounded-full", hasVoted ? "bg-[#00a884]" : "bg-[#00a884]/60")}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 pt-3 border-t border-black/10 flex justify-center">
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowPollDetails(true); }}
                  className="text-[#00a884] text-[15px] font-medium hover:underline px-4 py-1"
                >
                  View votes
                </button>
              </div>
            </div>
            
            <PollDetailsModal 
              isOpen={showPollDetails} 
              onClose={() => setShowPollDetails(false)} 
              message={message} 
            />
          </>
        );
      default:
        return (
          <div className="flex flex-col">
            <div
              className={cn(
                "text-[15px] whitespace-pre-wrap break-words leading-relaxed",
                highlight && "bg-warning/30 text-warning px-1 rounded",
              )}
            >
              {renderMessageContent(message.content, onMediaClick)}
            </div>
            
            {isTranslating && (
              <div className="mt-2 flex items-center gap-2 text-xs opacity-60 bg-black/5 dark:bg-white/5 rounded-lg p-2 w-fit">
                <Loader2 size={12} className="animate-spin" /> 
                <span>Translating...</span>
              </div>
            )}
            
            {translatedText && (
              <div className="mt-2 bg-black/5 dark:bg-white/5 rounded-lg p-2.5 relative">
                <div className="flex items-center text-[10px] font-semibold opacity-50 mb-1">
                  Translated to {LANGUAGES.find(l => l.code === translatedLanguage)?.name || translatedLanguage}
                </div>
                <div className="text-[14px] whitespace-pre-wrap break-words leading-relaxed opacity-90">
                  {renderMessageContent(translatedText, onMediaClick)}
                </div>
              </div>
            )}
            {message.metadata?.linkPreview && (
              <a 
                href={message.metadata.linkPreview.url} 
                target="_blank" 
                rel="noreferrer"
                className="mt-2 flex flex-col overflow-hidden rounded-lg bg-black/5 hover:bg-black/10 transition-colors border border-black/5"
              >
                {message.metadata.linkPreview.image && (
                  <img 
                    src={message.metadata.linkPreview.image} 
                    alt="Preview" 
                    className="w-full h-[140px] object-cover"
                  />
                )}
                <div className="p-2.5 flex flex-col">
                  <span className="text-xs font-semibold truncate text-text-primary">
                    {message.metadata.linkPreview.title}
                  </span>
                  {message.metadata.linkPreview.description && (
                    <span className="text-[11px] line-clamp-2 text-text-secondary mt-0.5">
                      {message.metadata.linkPreview.description}
                    </span>
                  )}
                  <span className="text-[10px] text-text-tertiary uppercase mt-1 truncate">
                    {new URL(message.metadata.linkPreview.url).hostname.replace('www.', '')}
                  </span>
                </div>
              </a>
            )}
          </div>
        );
    }
  };

  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      layout="position"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex w-full group relative",
        isMine ? "justify-end" : "justify-start",
      )}
    >
      <div
        id={`msg-${message.id}`}
        className={cn(
          "relative rounded-2xl px-3 py-1.5 flex flex-col shadow-sm cursor-pointer transition-all duration-200",
          fullWidth
            ? "max-w-[95%] md:max-w-full"
            : "max-w-[75%] md:max-w-[65%]",
          isMine
            ? "bg-bubble-out text-text-primary rounded-br-sm"
            : "bg-bubble-in text-text-primary rounded-bl-sm",
          selectedMessageIds.includes(message.id) &&
            "bg-[#00A884]/20 ring-2 ring-[#00A884] opacity-90 text-text-primary",
          message.replyToId && "pt-2",
          message.reactions &&
            Object.keys(message.reactions).length > 0 &&
            "mb-3",
        )}
        onContextMenu={handleRightClick}
        onTouchStart={startLongPress}
        onTouchEnd={clearLongPress}
        onTouchMove={clearLongPress}
        onMouseDown={startLongPress}
        onMouseUp={clearLongPress}
        onMouseLeave={clearLongPress}
        onClick={handleInteraction}
      >
        {/* Dropdown Options Arrow Trigger */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleContextMenu(e);
          }}
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-black/40 hover:bg-black/70 text-white z-20 cursor-pointer shadow-md"
          title="Message options (Pin, Edit, Star...)"
        >
          <ChevronDown size={14} />
        </button>

        {/* Reply Context */}
        {message.replyToId && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              const el = document.getElementById(`msg-${message.replyToId}`);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.remove('reply-highlight');
                // trigger reflow to restart animation
                void el.offsetWidth;
                el.classList.add('reply-highlight');
                setTimeout(() => el.classList.remove('reply-highlight'), 1500);
              }
            }}
            className={cn(
              "relative overflow-hidden rounded-r-xl rounded-l-md p-2.5 mb-2 text-xs flex flex-col border-l-[4px] transition-colors hover:bg-black/30 cursor-pointer",
              isMine
                ? "bg-black/20 border-[#06cf9c]"
                : "bg-black/20 border-[#00a884]",
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none" />
            <span
              className={cn(
                "font-semibold text-[11px] mb-1 relative z-10",
                isMine ? "text-[#06cf9c]" : "text-[#00a884]",
              )}
            >
              {message.replyTo?.senderId === message.senderId
                ? "You"
                : message.replyTo?.sender?.name || "Replied Message"}
            </span>
            <span
              className={cn(
                "truncate max-w-[250px] relative z-10 text-[13px]",
                isMine ? "text-text-primary/95" : "text-text-primary/95",
              )}
            >
              {getReplyPreview(message.replyTo)}
            </span>
          </div>
        )}

        {/* Story Reply Context */}
        {message.type === 'STORY_REPLY' && message.metadata && (
          <div
            className={cn(
              "relative overflow-hidden rounded-r-xl rounded-l-md p-2 mb-2 text-xs flex flex-col border-l-[4px] transition-colors",
              isMine
                ? "bg-black/20 border-[#06cf9c]"
                : "bg-black/20 border-[#00a884]",
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none" />
            <span
              className={cn(
                "font-semibold text-[11px] mb-1 relative z-10 flex items-center justify-between",
                isMine ? "text-[#06cf9c]" : "text-[#00a884]",
              )}
            >
              <span>{isMine ? "You" : message.sender?.name || "User"} replied to {isMine ? "a" : "your"} {message.metadata.storyType === 'VIDEO' ? 'video' : message.metadata.storyType === 'IMAGE' ? 'photo' : 'status'}</span>
            </span>
            <div className="flex items-center space-x-2 relative z-10">
              {message.metadata.storyMediaUrl && (
                <div className="w-10 h-10 rounded shrink-0 overflow-hidden bg-black/40 flex items-center justify-center relative">
                   {message.metadata.storyType === 'VIDEO' && (
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                       <Video size={16} className="text-white" />
                     </div>
                   )}
                   <img src={message.metadata.storyMediaUrl} alt="Story" className="w-full h-full object-cover" />
                </div>
              )}
              <span
                className={cn(
                  "truncate max-w-[200px] text-[13px]",
                  isMine ? "text-text-primary/95" : "text-text-primary/95",
                )}
              >
                {message.metadata.storyContent || (message.metadata.storyType === 'VIDEO' ? 'Video' : message.metadata.storyType === 'IMAGE' ? 'Photo' : 'Status')}
              </span>
            </div>
          </div>
        )}

        {/* Content */}
        {renderContent()}
        <div
          className={cn(
            "flex items-center justify-end space-x-1 mt-1 text-[11px]",
            isMine ? "text-text-secondary" : "text-text-tertiary",
          )}
        >
          {message.expiresAt && <span title="Disappearing message"><Clock size={11} className="mr-0.5 text-emerald-400" /></span>}
          {message.isPinned && <span title="Pinned message"><Pin size={11} className="mr-0.5 fill-current text-amber-400 rotate-45" /></span>}
          {message.isStarred && <Star size={11} className="mr-0.5 fill-current" />}
          {message.isEncrypted && <span title="End-to-End Encrypted"><Lock size={11} className="mr-0.5 opacity-70" /></span>}
          {message.isEdited && <span className="italic mr-0.5">(Edited)</span>}
          {message.type === 'TEXT' && !isImageOnly && (
            <div 
              role="button"
              tabIndex={0}
              onClick={(e) => { 
                e.stopPropagation(); 
                const rect = e.currentTarget.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                setLanguagePickerDirection(spaceBelow > 350 ? 'down' : 'up');
                setShowLanguagePicker(!showLanguagePicker); 
              }}
              className="mr-1 hover:text-emerald-400 transition-colors relative cursor-pointer outline-none"
              title="Translate"
            >
              <Globe size={11} className={cn(isTranslating && "animate-spin")} />
              <LanguagePicker
                isOpen={showLanguagePicker}
                onClose={() => setShowLanguagePicker(false)}
                onSelectLanguage={(lang) => { handleTranslate(lang); setShowLanguagePicker(false); }}
              />
            </div>
          )}
          <span>{msgTime}</span>
          {isMine && message.type !== "CALL_LOG" && (
            <span>
              {(message.status || "SENT") === "READ" ? (
                <CheckCheck size={14} className="text-[#53bdeb]" />
              ) : (message.status || "SENT") === "DELIVERED" ? (
                <CheckCheck size={14} className="text-text-secondary" />
              ) : (message.status || "SENT") === "PENDING" ? (
                <Clock size={11} className="text-text-secondary opacity-70" />
              ) : (
                <Check size={14} className="text-text-secondary" />
              )}
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
                onClick={() => {
                  setShowReactions(false);
                  setShowFullEmojiPicker(false);
                }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className={cn(
                  "absolute top-[-50px] z-50 flex items-center bg-surface border border-surface-border shadow-xl rounded-full px-3 py-2 space-x-3",
                  isMine ? "right-0" : "left-0",
                )}
              >
                {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      handleReaction(emoji);
                      setShowReactions(false);
                      setShowFullEmojiPicker(false);
                    }}
                    className="hover:scale-125 transition-transform text-xl"
                  >
                    {emoji}
                  </button>
                ))}
                
                <div className="w-[1px] h-6 bg-surface-border mx-1" />
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const spaceBelow = window.innerHeight - rect.bottom;
                      setEmojiPickerDirection(spaceBelow > 350 ? 'down' : 'up');
                      setShowFullEmojiPicker(prev => !prev);
                    }}
                    className="flex items-center text-text-secondary hover:text-text-primary px-1 hover:scale-110 transition-transform"
                    title="Add Emoji Reaction"
                  >
                    <Plus size={18} />
                  </button>

                  {showFullEmojiPicker && (
                    <div className={cn(
                      "fixed md:absolute z-[60]",
                      "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                      "md:left-auto md:top-auto md:translate-x-0 md:translate-y-0",
                      isMine ? "md:right-0" : "md:left-0",
                      emojiPickerDirection === 'down' ? "md:top-10" : "md:bottom-10"
                    )}>
                      <EmojiPicker
                        isOpen={showFullEmojiPicker}
                        onClose={() => setShowFullEmojiPicker(false)}
                        onSelectEmoji={(emoji) => {
                          handleReaction(emoji);
                          setShowFullEmojiPicker(false);
                          setShowReactions(false);
                        }}
                      />
                    </div>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e);
                  }}
                  className="flex items-center text-text-secondary hover:text-text-primary px-1 hover:scale-110 transition-transform"
                  title="More Options (Reply, Edit, Star, Pin, Forward, Info, Delete...)"
                >
                  <MoreVertical size={18} />
                </button>
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
            setShowContextMenu(false);
            onForward?.();
          }}
          onTranslate={message.type === 'TEXT' ? handleTranslate : undefined}
          onCopy={() => {
            if (message.content) navigator.clipboard.writeText(message.content);
          }}
          onEdit={
            isMine && message.type === 'TEXT' && 
            (new Date().getTime() - new Date(message.createdAt).getTime()) < 15 * 60 * 1000
              ? () => { setEditingMessageId(message.id); }
              : undefined
          }
          onStar={() => { toggleStar(message.id, message.chatId); }}
          isStarred={message.isStarred}
          onPin={() => { togglePinMessage(message.chatId, message.id); }}
          isPinned={message.isPinned}
          onInfo={
            message.type === 'CALL_LOG'
              ? () => { setShowCallDetails(true); setShowReactions(false); }
              : !hideInfoOption
                ? () => { setMessageForInfo(message); setShowReactions(false); }
                : undefined
          }
          onDelete={() => setIsDeleteModalOpen(true)}
          canDelete={!message.deletedForEveryone}
        />

        <DeleteMessageModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          canDeleteForEveryone={isMine && !message.deletedForEveryone} // Could add 24h check here too
          onDeleteForMe={() => {
            deleteMessage(message.chatId, message.id, "me");
            setIsDeleteModalOpen(false);
          }}
          onDeleteForEveryone={() => {
            deleteMessage(message.chatId, message.id, "everyone");
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
              isMine ? "right-2" : "left-2",
            )}
          >
            {Array.from(
              new Set(
                Object.values(message.reactions).map((r: any) =>
                  typeof r === "string" ? r : r.emoji,
                ),
              ),
            ).map((r: any, idx) => (
              <span key={idx} className="z-10">
                {r}
              </span>
            ))}
          </div>
        )}

        {/* Swipe Hint */}
        <div
          onClick={onReply}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-10 transition-opacity cursor-pointer p-2",
            isMine ? "-left-10" : "-right-10",
          )}
        >
          <CornerUpLeft
            size={16}
            className={
              isMine ? "text-text-primary" : "text-text-primary scale-x-[-1]"
            }
          />
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
                <h3 className="font-semibold text-text-primary text-lg">
                  Reactions
                </h3>
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
                {Object.entries(message.reactions).map(
                  ([userId, reactionData]) => {
                    const participant = activeChat?.participants?.find(
                      (p) => p.userId === userId,
                    )?.user;
                    const isMe = userId === currentUser?.id;
                    const name = isMe
                      ? "You"
                      : participant?.name ||
                        participant?.phoneNumber ||
                        "Unknown";
                    const pfp = isMe
                      ? currentUser?.profilePicture
                      : participant?.profilePicture;

                    const emoji =
                      typeof reactionData === "string"
                        ? reactionData
                        : (reactionData as any).emoji;
                    const timestamp =
                      typeof reactionData === "string"
                        ? null
                        : (reactionData as any).timestamp;

                    let formattedDate = "";
                    if (timestamp) {
                      const d = new Date(timestamp);
                      formattedDate =
                        d.toLocaleDateString("en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }) +
                        " at " +
                        d.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        });
                    }

                    return (
                      <div
                        key={userId}
                        className="flex items-center justify-between p-4 border-b border-surface-border/50 last:border-0 hover:bg-surface-hover/30 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          {pfp ? (
                            <img
                              src={pfp}
                              alt={name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-surface-border flex items-center justify-center">
                              <User size={20} className="text-text-secondary" />
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="font-medium text-text-primary">
                              {name}
                            </span>
                            {formattedDate && (
                              <span className="text-[11px] text-text-tertiary">
                                {formattedDate}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-2xl">{emoji as string}</span>
                      </div>
                    );
                  },
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
