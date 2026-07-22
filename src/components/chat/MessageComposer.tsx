import React, { useState, useRef } from 'react';
import { Paperclip, Smile, Send, Mic, X, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useChatStore } from '@/store/useChatStore';
import { motion, AnimatePresence } from 'framer-motion';

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
  const { activeChatId, socket, chats, blockedUsers } = useChatStore();
  const [message, setMessage] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (message.trim()) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);
    if (socket && activeChatId) {
      socket.emit('typing', { chatId: activeChatId });
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
        <div className="bg-surface-hover px-4 py-6 border-t border-surface-border relative shrink-0 z-20 flex justify-center text-text-secondary text-sm">
          You have blocked this contact.
        </div>
      );
    }

  return (
    <div className="bg-surface-hover px-4 py-3 border-t border-surface-border relative shrink-0 z-20">
      
      {/* Reply Context */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div 
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            className="flex items-center justify-between bg-surface p-3 rounded-t-2xl border-l-4 border-primary mx-2 -mt-4 mb-2 shadow-lg relative z-0"
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
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute bottom-[calc(100%+10px)] left-4 bg-surface rounded-2xl shadow-xl border border-surface-border p-2 flex flex-col space-y-2"
          >
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-3 p-3 hover:bg-surface-hover rounded-xl text-text-primary transition-colors"
            >
              <div className="bg-blue-500/20 text-blue-500 p-2 rounded-full"><Paperclip size={20} /></div>
              <span className="text-sm font-medium">Document / Media</span>
            </button>
            <button 
              onClick={() => { onSendLocation(); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-3 hover:bg-surface-hover rounded-xl text-text-primary transition-colors"
            >
              <div className="bg-green-500/20 text-green-500 p-2 rounded-full"><MapPin size={20} /></div>
              <span className="text-sm font-medium">Location</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="flex items-end space-x-2 relative z-10">
        
        {isRecording ? (
          <div className="flex-1 flex items-center justify-between bg-surface rounded-3xl px-4 py-2 border border-danger/50 shadow-inner">
            <div className="flex items-center space-x-3">
              <div className="w-2.5 h-2.5 bg-danger rounded-full animate-pulse" />
              <span className="text-danger font-medium">{formatDuration(recordingDuration)}</span>
            </div>
            <button type="button" onClick={cancelRecording} className="text-text-tertiary hover:text-danger p-2 transition-colors">
              <X size={20} />
            </button>
          </div>
        ) : (
          <>
            <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className="p-3 text-text-secondary hover:text-text-primary transition-colors">
              <Paperclip size={24} />
            </button>
            <div className="flex-1 bg-surface rounded-3xl flex items-end border border-surface-border focus-within:border-primary/50 transition-colors shadow-sm overflow-hidden min-h-[44px]">
              <button type="button" className="p-3 pb-[10px] text-text-secondary hover:text-text-primary transition-colors shrink-0">
                <Smile size={24} />
              </button>
              <input
                type="text"
                placeholder="Type a message..."
                value={message}
                onChange={handleChange}
                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-text-primary placeholder-text-tertiary py-3 text-[15px]"
              />
            </div>
          </>
        )}

        {message.trim() ? (
          <Button type="submit" size="icon" className="h-12 w-12 rounded-full shrink-0 shadow-lg">
            <Send size={20} className="ml-1" />
          </Button>
        ) : isRecording ? (
          <Button type="button" size="icon" onClick={stopRecording} className="h-12 w-12 rounded-full shrink-0 shadow-lg bg-danger hover:bg-danger/90">
            <Send size={20} className="ml-1" />
          </Button>
        ) : (
          <Button type="button" size="icon" onMouseDown={startRecording} variant="secondary" className="h-12 w-12 rounded-full shrink-0 hover:bg-surface border-none shadow-none text-text-secondary hover:text-text-primary">
            <Mic size={24} />
          </Button>
        )}
      </form>
    </div>
  );
}
