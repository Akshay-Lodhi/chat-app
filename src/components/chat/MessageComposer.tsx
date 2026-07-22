import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Smile, Send, Mic, X, MapPin, Camera, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useChatStore } from '@/store/useChatStore';
import { motion, AnimatePresence } from 'framer-motion';
import { EmojiPicker } from './EmojiPicker';

interface MessageComposerProps {
  onSendMessage: (text: string) => void;
  onSendMedia: (file: File) => void;
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
  const { activeChatId, socket, chats, blockedUsers, sendTypingStatus } = useChatStore();
  const [message, setMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMessage(val);
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
      onSendMedia(file);
      setShowAttachMenu(false);
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
        onSendVoice(audioBlob);
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
        <div className="bg-transparent px-4 py-4 relative shrink-0 z-20 flex justify-center text-text-secondary text-sm">
          You have blocked this contact.
        </div>
      );
    }

  return (
    <div className="bg-transparent px-3 py-2 relative shrink-0 z-20">
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

      {/* Reply Context */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div 
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            className="flex items-center justify-between bg-[#1f2c34] p-3 rounded-2xl border-l-4 border-primary mb-2 shadow-lg relative z-0"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-primary text-xs font-semibold">Replying to message</span>
              <span className="text-text-secondary text-sm truncate max-w-sm">
                {(() => {
                  const msg = replyingTo;
                  if (!msg) return '';
                  if (msg.type === 'IMAGE') return '📷 Photo';
                  if (msg.type === 'VIDEO') return '🎥 Video';
                  if (msg.type === 'AUDIO') return '🎤 Voice message';
                  if (msg.type === 'LOCATION') return '📍 Location';
                  if (msg.type === 'DOCUMENT') return '📄 Document';
                  if (msg.type === 'CALL_LOG') return '📞 Call History';
                  return msg.content;
                })()}
              </span>
            </div>
            <button onClick={onCancelReply} className="text-text-tertiary hover:text-text-primary p-1">
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
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute bottom-[calc(100%+10px)] left-4 bg-[#1f2c34] rounded-2xl shadow-2xl border border-surface-border p-2 flex flex-col space-y-2 z-30"
          >
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-3 p-3 hover:bg-surface-hover rounded-xl text-text-primary transition-colors text-left"
            >
              <div className="bg-blue-500/20 text-blue-400 p-2.5 rounded-full"><Paperclip size={20} /></div>
              <span className="text-sm font-medium">Document & Media</span>
            </button>
            <button 
              onClick={() => { onSendLocation(); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-3 hover:bg-surface-hover rounded-xl text-text-primary transition-colors text-left"
            >
              <div className="bg-emerald-500/20 text-emerald-400 p-2.5 rounded-full"><MapPin size={20} /></div>
              <span className="text-sm font-medium">Location</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emoji Picker */}
      <EmojiPicker 
        isOpen={showEmojiPicker} 
        onClose={() => setShowEmojiPicker(false)} 
        onSelectEmoji={(emoji) => setMessage(prev => prev + emoji)} 
      />

      <form onSubmit={handleSubmit} className="flex items-center space-x-2 relative z-10">
        
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between bg-[#1f2c34] rounded-full px-4 py-2.5 shadow-md">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 bg-danger rounded-full animate-pulse" />
              <span className="text-danger font-medium text-sm">{formatDuration(recordingDuration)}</span>
            </div>
            <button type="button" onClick={cancelRecording} className="text-[#8696a0] hover:text-danger p-1 transition-colors">
              <X size={20} />
            </button>
          </div>
        ) : (
          /* WhatsApp-style Input Pill */
          <div className="flex-1 bg-[#1f2c34] rounded-full flex items-center px-3 py-1.5 shadow-md min-h-[46px] border border-transparent focus-within:border-primary/30 transition-all">
            {/* Smile / Emoji */}
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(!showEmojiPicker);
              }}
              className="p-1.5 text-[#8696a0] hover:text-[#aebac1] transition-colors shrink-0" 
              title="Emoji"
            >
              <Smile size={24} />
            </button>

            {/* Input field */}
            <input
              type="text"
              placeholder="Message"
              value={message}
              onChange={handleChange}
              className="flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-0 text-[#e9edef] placeholder-[#8696a0] px-2 py-1 text-[15px] leading-normal"
            />

            {/* Attach Icon */}
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setShowAttachMenu(!showAttachMenu);
              }} 
              className="p-1.5 text-[#8696a0] hover:text-[#aebac1] transition-colors shrink-0 rotate-45" 
              title="Attach file"
            >
              <Paperclip size={22} />
            </button>

            {/* Rupee Icon (hidden when typing, matching WhatsApp) */}
            {!message.trim() && (
              <button type="button" className="p-1.5 text-[#8696a0] hover:text-[#aebac1] transition-colors shrink-0 hidden sm:flex items-center justify-center" title="Payment">
                <IndianRupee size={20} />
              </button>
            )}

            {/* Camera Icon (hidden when typing, matching WhatsApp) */}
            {!message.trim() && (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-[#8696a0] hover:text-[#aebac1] transition-colors shrink-0" title="Camera">
                <Camera size={22} />
              </button>
            )}
          </div>
        )}

        {/* WhatsApp Green Standalone Action Circle */}
        {message.trim() ? (
          <button type="submit" className="w-12 h-12 rounded-full bg-[#00a884] hover:bg-[#008f70] flex items-center justify-center text-white shrink-0 shadow-lg transition-transform active:scale-95" title="Send">
            <Send size={22} className="ml-0.5" />
          </button>
        ) : isRecording ? (
          <button type="button" onClick={stopRecording} className="w-12 h-12 rounded-full bg-[#00a884] hover:bg-[#008f70] flex items-center justify-center text-white shrink-0 shadow-lg transition-transform active:scale-95" title="Send Voice">
            <Send size={22} className="ml-0.5" />
          </button>
        ) : (
          <button type="button" onMouseDown={startRecording} className="w-12 h-12 rounded-full bg-[#00a884] hover:bg-[#008f70] flex items-center justify-center text-white shrink-0 shadow-lg transition-transform active:scale-95" title="Record Voice">
            <Mic size={24} />
          </button>
        )}
      </form>
    </div>
  );
}
