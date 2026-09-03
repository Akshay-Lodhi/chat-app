import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Smile, Send, Mic, X, MapPin, Camera, IndianRupee, Video, Phone, BarChart2, Calendar, Clock, Sparkles, Bot, EyeOff, Plus, Type } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/apiClient';
import { motion, AnimatePresence } from 'framer-motion';
import { EmojiPicker } from './EmojiPicker';
import { GifPicker } from './GifPicker';
import CreatePollModal from './CreatePollModal';
import ScheduleMessageModal from './ScheduleMessageModal';
import PendingScheduledModal from './PendingScheduledModal';
import AIAssistantModal from './AIAssistantModal';
import { AudioEffectsPreview } from './AudioEffectsPreview';
import { ScribbleModal } from './ScribbleModal';
import { cn } from '@/lib/utils';

interface MessageComposerProps {
  onSendMessage: (text: string) => void;
  onSendMedia: (file: File, isViewOnce?: boolean) => void;
  onSendLocation: () => void;
  onSendVoice: (blob: Blob) => void;
  replyingTo: any | null;
  onCancelReply: () => void;
}

export function MessageComposer({
  onSendMessage,
  onSendMedia,
  onSendLocation,
  onSendVoice,
  replyingTo,
  onCancelReply
}: MessageComposerProps) {
  const { activeChatId, socket, chats, blockedUsers, sendTypingStatus, editingMessageId, setEditingMessageId, messages } = useChatStore();
  const [message, setMessage] = useState('');

  const editingMessage = editingMessageId && activeChatId ? messages[activeChatId]?.find(m => m.id === editingMessageId) : null;

  useEffect(() => {
    if (editingMessage && editingMessage.type === 'TEXT') {
      setMessage(editingMessage.content || '');
    } else if (!editingMessageId) {
      setMessage('');
    }
  }, [editingMessageId, editingMessage]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAiSuggest, setShowAiSuggest] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showPendingScheduledModal, setShowPendingScheduledModal] = useState(false);
  const [showAiAssistantModal, setShowAiAssistantModal] = useState(false);
  const [showScribbleModal, setShowScribbleModal] = useState(false);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewOnceFileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setShowAttachMenu(false);
      }
    };

    if (showAttachMenu) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showAttachMenu]);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (message.trim()) {
      if (activeChatId) sendTypingStatus(activeChatId, false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      if (editingMessageId && activeChatId) {
        useChatStore.getState().editMessage(activeChatId, editingMessageId, message.trim());
        setEditingMessageId(null);
        setMessage('');
      } else {
        onSendMessage(message);
        setMessage('');
      }
    }
  };

  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const lastFetchedMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeChatId) {
      setSmartReplies([]);
      lastFetchedMsgIdRef.current = null;
      return;
    }
    const chatMsgs = messages[activeChatId] || [];
    const lastMsg = chatMsgs[chatMsgs.length - 1];

    if (!lastMsg) {
      setSmartReplies([]);
      return;
    }

    if (lastMsg.id === lastFetchedMsgIdRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      if (lastMsg.senderId !== 'nexus-ai-system' && lastMsg.type === 'TEXT' && lastMsg.content) {
        lastFetchedMsgIdRef.current = lastMsg.id;
        const currentUserId = useAuthStore.getState().user?.id;
        const isOwnMessage = lastMsg.senderId === currentUserId;
        const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
        apiClient(`${SERVER_URL}/api/chats/smart-replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: lastMsg.content,
            senderName: (lastMsg as any).sender?.name,
            isOwnMessage
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data?.replies && Array.isArray(data.replies)) {
            setSmartReplies(data.replies);
          }
        })
        .catch(() => setSmartReplies([]));
      } else {
        setSmartReplies([]);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [activeChatId, messages]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessage(val);

    if (val.endsWith('@') || val.toLowerCase().endsWith('@a') || val.toLowerCase().endsWith('@ai')) {
      setShowAiSuggest(true);
    } else {
      setShowAiSuggest(false);
    }

    if (activeChatId) {
      if (val.trim()) {
        sendTypingStatus(activeChatId, true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
          sendTypingStatus(activeChatId, false);
        }, 2500);
      } else {
        sendTypingStatus(activeChatId, false);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMedia(file, false);
      setShowAttachMenu(false);
      e.target.value = '';
    }
  };

  const handleViewOnceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMedia(file, true);
      setShowAttachMenu(false);
      e.target.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setRecordedAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingIntervalRef.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
    } catch (err) {
      console.error('Mic permission denied', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;
  const isGroup = activeChat?.isGroup || false;
  const currentUserId = require('@/store/useAuthStore').useAuthStore.getState().user?.id;
  const otherParticipant = !isGroup && activeChat?.participants.find(p => p.userId !== currentUserId);
  const isBlocked = otherParticipant ? blockedUsers.some(b => b.blockedId === otherParticipant.userId) : false;

  if (isBlocked) {
    return (
      <div className="bg-surface/50 backdrop-blur-md px-4 py-4 relative shrink-0 z-20 flex justify-center text-text-secondary text-sm border-t border-surface-border">
        You have blocked this contact.
      </div>
    );
  }

  if (recordedAudioBlob) {
    return (
      <div className="p-3 w-full bg-surface/80 backdrop-blur-xl border-t border-surface-border/50">
        <AudioEffectsPreview 
          blob={recordedAudioBlob} 
          onSend={(blob) => {
            onSendVoice(blob);
            setRecordedAudioBlob(null);
          }} 
          onCancel={() => setRecordedAudioBlob(null)} 
        />
      </div>
    );
  }

  return (
    <div 
      className="bg-surface/70 backdrop-blur-2xl py-3 px-3 sm:px-4 relative shrink-0 z-20 w-full box-border border-t border-surface-border/50 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] transition-colors"
      style={{
        paddingLeft: 'max(12px, env(safe-area-inset-left))',
        paddingRight: 'max(12px, env(safe-area-inset-right))',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))'
      }}
    >
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
      <input type="file" ref={viewOnceFileInputRef} className="hidden" accept="image/*,video/*" onChange={handleViewOnceFileChange} />

      {/* Edit/Reply Context */}
      <AnimatePresence>
        {editingMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            className="flex items-center justify-between bg-surface-hover/80 p-3 rounded-2xl border-l-4 border-warning mb-3 shadow-sm relative z-0"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-warning text-xs font-bold flex items-center tracking-wide uppercase">
                <Type size={12} className="mr-1" /> Editing message
              </span>
              <span className="text-text-primary text-sm truncate max-w-sm mt-1">
                {editingMessage.content}
              </span>
            </div>
            <button onClick={() => setEditingMessageId(null)} className="p-2 hover:bg-black/10 rounded-full text-text-secondary transition-colors shrink-0">
              <X size={18} />
            </button>
          </motion.div>
        )}
        {!editingMessage && replyingTo && (
          <motion.div 
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            className="flex items-center justify-between bg-surface-hover/80 p-3 rounded-2xl border-l-4 border-primary mb-3 shadow-sm relative z-0"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-primary text-xs font-bold tracking-wide uppercase">Replying to message</span>
              <span className="text-text-primary text-sm truncate max-w-sm mt-1">
                {(() => {
                  const msg = replyingTo;
                  if (!msg) return '';
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
                })()}
              </span>
            </div>
            <button onClick={onCancelReply} className="text-text-secondary hover:text-text-primary p-2 hover:bg-black/10 rounded-full transition-colors">
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Attach Menu */}
      <AnimatePresence>
        {showAttachMenu && (
          <motion.div 
            ref={attachMenuRef}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="absolute bottom-[calc(100%+16px)] left-4 bg-surface/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-surface-border/50 p-2.5 flex flex-col space-y-1 z-30 w-56 overflow-hidden"
          >
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-3 p-2.5 hover:bg-surface-hover rounded-2xl text-text-primary transition-colors text-left group"
            >
              <div className="bg-blue-500/10 text-blue-500 p-2.5 rounded-xl group-hover:scale-110 transition-transform"><Paperclip size={20} /></div>
              <span className="text-sm font-semibold">Media & Docs</span>
            </button>
            <button 
              onClick={() => viewOnceFileInputRef.current?.click()}
              className="flex items-center space-x-3 p-2.5 hover:bg-surface-hover rounded-2xl text-text-primary transition-colors text-left group"
            >
              <div className="bg-orange-500/10 text-orange-500 p-2.5 rounded-xl group-hover:scale-110 transition-transform"><EyeOff size={20} /></div>
              <span className="text-sm font-semibold">View Once</span>
            </button>
            <button 
              onClick={() => { onSendLocation(); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-2.5 hover:bg-surface-hover rounded-2xl text-text-primary transition-colors text-left group"
            >
              <div className="bg-emerald-500/10 text-emerald-500 p-2.5 rounded-xl group-hover:scale-110 transition-transform"><MapPin size={20} /></div>
              <span className="text-sm font-semibold">Location</span>
            </button>
            <button 
              onClick={() => { setShowPollModal(true); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-2.5 hover:bg-surface-hover rounded-2xl text-text-primary transition-colors text-left group"
            >
              <div className="bg-yellow-500/10 text-yellow-500 p-2.5 rounded-xl group-hover:scale-110 transition-transform"><BarChart2 size={20} /></div>
              <span className="text-sm font-semibold">Poll</span>
            </button>
            <button 
              onClick={() => { setShowScribbleModal(true); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-2.5 hover:bg-surface-hover rounded-2xl text-text-primary transition-colors text-left group"
            >
              <div className="bg-pink-500/10 text-pink-500 p-2.5 rounded-xl group-hover:scale-110 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              </div>
              <span className="text-sm font-semibold">Scribble</span>
            </button>
            <div className="h-px bg-surface-border/50 my-1 mx-2" />
            <button 
              onClick={() => { setShowScheduleModal(true); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-2.5 hover:bg-surface-hover rounded-2xl text-text-primary transition-colors text-left group"
            >
              <div className="bg-primary/10 text-primary p-2.5 rounded-xl group-hover:scale-110 transition-transform"><Calendar size={20} /></div>
              <span className="text-sm font-semibold">Schedule</span>
            </button>
            <button 
              onClick={() => { setShowPendingScheduledModal(true); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-2.5 hover:bg-surface-hover rounded-2xl text-text-primary transition-colors text-left group"
            >
              <div className="bg-accent/10 text-accent p-2.5 rounded-xl group-hover:scale-110 transition-transform"><Clock size={20} /></div>
              <span className="text-sm font-semibold">Upcoming</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <EmojiPicker 
        isOpen={showEmojiPicker} 
        onClose={() => setShowEmojiPicker(false)} 
        onSelectEmoji={(emoji) => setMessage(prev => prev + emoji)} 
        onSelectGif={(url) => {
          onSendMessage(url);
          setShowEmojiPicker(false);
        }}
        className="absolute bottom-[calc(100%+16px)] left-2"
      />

      {/* AI Smart Reply Chips */}
      {smartReplies.length > 0 && !message.trim() && (
        <motion.div 
          initial={{ opacity: 0, y: 10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: 10, height: 0 }}
          className="flex items-center space-x-2 px-1 py-1 mb-3 overflow-x-auto no-scrollbar shrink-0 relative z-10"
        >
          <div className="flex items-center space-x-1 text-[11px] font-bold text-accent shrink-0 bg-accent/10 px-2.5 py-1 rounded-full border border-accent/20">
            <Sparkles size={12} className="animate-pulse" />
            <span>AI Suggest</span>
          </div>
          {smartReplies.map((reply, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onSendMessage(reply);
                setSmartReplies([]);
              }}
              className="text-xs bg-surface/50 backdrop-blur-md hover:bg-accent/20 hover:border-accent/40 text-text-primary border border-surface-border/50 px-3.5 py-1.5 rounded-full transition-all shrink-0 active:scale-95 shadow-sm font-semibold cursor-pointer"
            >
              {reply}
            </button>
          ))}
        </motion.div>
      )}

      {/* @AI Mention Autocomplete Suggestion Popup */}
      <AnimatePresence>
        {showAiSuggest && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute bottom-16 left-4 z-30 bg-surface/95 border border-accent/30 rounded-2xl p-3 shadow-2xl backdrop-blur-xl flex items-center space-x-3 cursor-pointer hover:bg-accent/10 transition-colors"
            onClick={() => {
              const base = message.replace(/@\w*$/, '');
              setMessage(base + '@AI ');
              setShowAiSuggest(false);
            }}
          >
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-accent to-purple-500 flex items-center justify-center text-white shadow-lg shrink-0">
              <Bot size={20} />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-sm font-bold text-text-primary">@AI</span>
                <span className="text-[10px] bg-accent/20 text-accent font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Nexus Bot</span>
              </div>
              <p className="text-xs text-text-secondary font-medium mt-0.5">Mention @AI in any chat for instant answers</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="flex items-center space-x-2 relative z-10 w-full min-w-0 flex-nowrap">
        
        <button 
          type="button" 
          onClick={(e) => {
            e.stopPropagation();
            setShowAttachMenu(!showAttachMenu);
          }} 
          className={cn(
            "p-2.5 rounded-full transition-colors shrink-0",
            showAttachMenu ? "bg-primary/20 text-primary rotate-45" : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
          )}
          title="Attach"
        >
          <Plus size={22} className="transition-transform duration-300" />
        </button>

        {isRecording ? (
          <div className="flex-1 min-w-0 flex items-center justify-between bg-surface-hover/80 rounded-2xl px-4 py-3 shadow-inner border border-surface-border/50">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-danger rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
              <span className="text-danger font-bold text-sm tracking-wide">{formatDuration(recordingDuration)}</span>
            </div>
            <button type="button" onClick={cancelRecording} className="text-text-secondary hover:text-danger p-1 transition-colors">
              <X size={20} />
            </button>
          </div>
        ) : (
          /* Premium iOS-style Input Field */
          <div className="flex-1 min-w-0 bg-surface-hover/60 rounded-2xl flex items-center px-2 py-1.5 shadow-sm min-h-[48px] border border-surface-border/50 focus-within:border-primary/50 focus-within:bg-surface focus-within:shadow-md transition-all overflow-hidden group">
            
            <input
              type="text"
              placeholder="Message..."
              value={message}
              onChange={handleChange}
              onFocus={(e) => {
                setTimeout(() => {
                  try { e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(err) {}
                }, 300);
              }}
              className="flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-0 text-text-primary placeholder:text-text-tertiary px-3 py-1 text-[15px]"
            />

            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setShowAiAssistantModal(true);
              }}
              className="p-1.5 text-accent hover:text-accent hover:bg-accent/10 transition-colors shrink-0 rounded-full mr-1" 
              title="AI Writing Assistant"
            >
              <Sparkles size={18} />
            </button>

            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(!showEmojiPicker);
                setShowAttachMenu(false);
              }}
              className="p-1.5 hover:bg-black/10 rounded-full text-text-secondary hover:text-text-primary transition-colors shrink-0 mr-1" 
              title="Stickers & Emoji"
            >
              <Smile size={20} />
            </button>
          </div>
        )}

        {/* Action Button */}
        {message.trim() ? (
          <button type="submit" className="w-12 h-12 shrink-0 rounded-full bg-primary hover:bg-primary-hover flex items-center justify-center text-white shadow-lg shadow-primary/30 transition-transform active:scale-90 cursor-pointer">
            <Send size={20} className="ml-1" />
          </button>
        ) : isRecording ? (
          <button type="button" onClick={stopRecording} className="w-12 h-12 shrink-0 rounded-full bg-primary hover:bg-primary-hover flex items-center justify-center text-white shadow-lg shadow-primary/30 transition-transform active:scale-90 cursor-pointer">
            <Send size={20} className="ml-1" />
          </button>
        ) : (
          <button type="button" onMouseDown={startRecording} className="w-12 h-12 shrink-0 rounded-full bg-primary hover:bg-primary-hover flex items-center justify-center text-white shadow-lg shadow-primary/30 transition-transform active:scale-90 cursor-pointer">
            <Mic size={22} />
          </button>
        )}
      </form>

      <AnimatePresence>
        {showPollModal && activeChatId && (
          <CreatePollModal 
            chatId={activeChatId} 
            onClose={() => setShowPollModal(false)} 
          />
        )}
        {showScheduleModal && activeChatId && (
          <ScheduleMessageModal
            chatId={activeChatId}
            initialContent={message}
            onClose={() => setShowScheduleModal(false)}
            onScheduledSuccess={() => setMessage('')}
          />
        )}
        {showPendingScheduledModal && activeChatId && (
          <PendingScheduledModal
            chatId={activeChatId}
            onClose={() => setShowPendingScheduledModal(false)}
          />
        )}
        {showAiAssistantModal && activeChatId && (
          <AIAssistantModal
            chatId={activeChatId}
            lastMessageContent={
              (messages[activeChatId] && messages[activeChatId].length > 0)
                ? messages[activeChatId][messages[activeChatId].length - 1]?.content || ''
                : ''
            }
            onUseDraft={(draftText) => setMessage(draftText)}
            onSendMessage={(sendText) => onSendMessage(sendText)}
            onClose={() => setShowAiAssistantModal(false)}
          />
        )}
        {showScribbleModal && (
          <ScribbleModal
            isOpen={showScribbleModal}
            onClose={() => setShowScribbleModal(false)}
            onSend={(file) => onSendMedia(file)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
