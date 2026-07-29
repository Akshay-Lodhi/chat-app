import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, Smile, Send, Mic, X, MapPin, Camera, IndianRupee, Video, Phone, BarChart2, Calendar, Clock, Sparkles, Bot } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useChatStore } from '@/store/useChatStore';
import { apiClient } from '@/lib/apiClient';
import { motion, AnimatePresence } from 'framer-motion';
import { EmojiPicker } from './EmojiPicker';
import CreatePollModal from './CreatePollModal';
import ScheduleMessageModal from './ScheduleMessageModal';
import PendingScheduledModal from './PendingScheduledModal';
import AIAssistantModal from './AIAssistantModal';

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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showPendingScheduledModal, setShowPendingScheduledModal] = useState(false);
  const [showAiAssistantModal, setShowAiAssistantModal] = useState(false);
  
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
      
      if (editingMessageId && activeChatId) {
        socket?.emit('edit-message', {
          messageId: editingMessageId,
          content: message.trim(),
          chatId: activeChatId
        });
        setEditingMessageId(null);
        setMessage('');
      } else {
        onSendMessage(message);
        setMessage('');
      }
    }
  };

  const [smartReplies, setSmartReplies] = useState<string[]>([]);
  const [showAiSuggest, setShowAiSuggest] = useState(false);

  useEffect(() => {
    if (!activeChatId) {
      setSmartReplies([]);
      return;
    }
    const chatMsgs = messages[activeChatId] || [];
    const lastMsg = chatMsgs[chatMsgs.length - 1];

    if (lastMsg && lastMsg.senderId !== 'nexus-ai-system' && lastMsg.type === 'TEXT' && lastMsg.content) {
      const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      apiClient(`${SERVER_URL}/api/chats/smart-replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: lastMsg.content,
          senderName: (lastMsg as any).sender?.name
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
    <div 
      className="bg-transparent py-1.5 px-2 sm:px-3 relative shrink-0 z-20 w-full max-w-[100vw] box-border"
      style={{
        paddingLeft: 'max(6px, env(safe-area-inset-left))',
        paddingRight: 'max(6px, env(safe-area-inset-right))',
        paddingBottom: 'max(6px, env(safe-area-inset-bottom))'
      }}
    >
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />

      {/* Edit/Reply Context */}
      <AnimatePresence>
        {editingMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            className="flex items-center justify-between bg-[#1f2c34] p-3 rounded-2xl border-l-4 border-warning mb-2 shadow-lg relative z-0"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-warning text-xs font-semibold flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                Editing message
              </span>
              <span className="text-text-secondary text-sm truncate max-w-sm mt-1">
                {editingMessage.content}
              </span>
            </div>
            <button onClick={() => setEditingMessageId(null)} className="p-2 hover:bg-white/10 rounded-full text-text-secondary transition-colors shrink-0">
              <X size={18} />
            </button>
          </motion.div>
        )}
        {!editingMessage && replyingTo && (
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
            <button 
              onClick={() => { setShowPollModal(true); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-3 hover:bg-surface-hover rounded-xl text-text-primary transition-colors text-left"
            >
              <div className="bg-yellow-500/20 text-yellow-400 p-2.5 rounded-full"><BarChart2 size={20} /></div>
              <span className="text-sm font-medium">Poll</span>
            </button>
            <button 
              onClick={() => { setShowScheduleModal(true); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-3 hover:bg-surface-hover rounded-xl text-text-primary transition-colors text-left"
            >
              <div className="bg-emerald-500/20 text-emerald-400 p-2.5 rounded-full"><Calendar size={20} /></div>
              <span className="text-sm font-medium">Schedule Message</span>
            </button>
            <button 
              onClick={() => { setShowPendingScheduledModal(true); setShowAttachMenu(false); }}
              className="flex items-center space-x-3 p-3 hover:bg-surface-hover rounded-xl text-text-primary transition-colors text-left"
            >
              <div className="bg-purple-500/20 text-purple-400 p-2.5 rounded-full"><Clock size={20} /></div>
              <span className="text-sm font-medium">Upcoming Messages</span>
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

      {/* AI Smart Reply Chips */}
      {smartReplies.length > 0 && !message.trim() && (
        <motion.div 
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          className="flex items-center space-x-2 px-2 py-1 mb-1.5 overflow-x-auto no-scrollbar shrink-0 relative z-10"
        >
          <div className="flex items-center space-x-1 text-[11px] font-semibold text-purple-400 shrink-0 bg-purple-500/10 px-2 py-1 rounded-full border border-purple-500/20">
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
              className="text-xs bg-[#1f2c34] hover:bg-purple-500/20 hover:border-purple-400/50 text-[#e9edef] border border-white/10 px-3 py-1 rounded-full transition-all shrink-0 active:scale-95 shadow-sm font-medium cursor-pointer"
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
            initial={{ opacity: 0, y: 5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.98 }}
            className="absolute bottom-16 left-4 z-30 bg-[#1f2c34] border border-purple-500/30 rounded-xl p-2.5 shadow-2xl backdrop-blur-lg flex items-center space-x-3 cursor-pointer hover:bg-purple-500/10 transition-colors"
            onClick={() => {
              const base = message.replace(/@\w*$/, '');
              setMessage(base + '@AI ');
              setShowAiSuggest(false);
            }}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shadow-md shrink-0">
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-sm font-semibold text-white">@AI</span>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold px-1.5 py-0.5 rounded-full uppercase">Nexus Bot</span>
              </div>
              <p className="text-xs text-text-secondary">Mention @AI in any chat for instant answers, code, or help</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="flex items-center space-x-1.5 relative z-10 w-full min-w-0 flex-nowrap">
        
        {isRecording ? (
          <div className="flex-1 min-w-0 flex items-center justify-between bg-[#1f2c34] rounded-full px-4 py-2.5 shadow-md">
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
          <div className="flex-1 min-w-0 bg-[#1f2c34] rounded-full flex items-center px-2.5 py-1 shadow-md min-h-[44px] border border-transparent focus-within:border-primary/30 transition-all overflow-hidden">
            {/* Smile / Emoji */}
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(!showEmojiPicker);
              }}
              className="p-1 text-[#8696a0] hover:text-[#aebac1] transition-colors shrink-0" 
              title="Emoji"
            >
              <Smile size={22} />
            </button>

            {/* Private AI Writing Assistant */}
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setShowAiAssistantModal(true);
              }}
              className="p-1 text-purple-400 hover:text-purple-300 transition-colors shrink-0 hover:bg-purple-500/10 rounded-full" 
              title="Private AI Writing Assistant"
            >
              <Sparkles size={19} className="animate-pulse" />
            </button>

            {/* Input field */}
            <input
              type="text"
              placeholder="Message"
              value={message}
              onChange={handleChange}
              className="flex-1 min-w-0 bg-transparent border-none focus:outline-none focus:ring-0 text-[#e9edef] placeholder-[#8696a0] px-1.5 py-1 text-[15px] leading-normal"
            />

            {/* Attach Icon */}
            <button 
              type="button" 
              onClick={(e) => {
                e.stopPropagation();
                setShowAttachMenu(!showAttachMenu);
              }} 
              className="p-1 text-[#8696a0] hover:text-[#aebac1] transition-colors shrink-0 rotate-45" 
              title="Attach file"
            >
              <Paperclip size={20} />
            </button>

            {/* Rupee Icon (hidden when typing, matching WhatsApp) */}
            {!message.trim() && (
              <button type="button" className="p-1 text-[#8696a0] hover:text-[#aebac1] transition-colors shrink-0 hidden sm:flex items-center justify-center" title="Payment">
                <IndianRupee size={18} />
              </button>
            )}

            {/* Camera Icon (hidden when typing, matching WhatsApp) */}
            {!message.trim() && (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1 text-[#8696a0] hover:text-[#aebac1] transition-colors shrink-0 hidden sm:flex" title="Camera">
                <Camera size={20} />
              </button>
            )}
          </div>
        )}

        {/* WhatsApp Green Standalone Action Circle */}
        {message.trim() ? (
          <button type="submit" className="w-11 h-11 shrink-0 rounded-full bg-[#00a884] hover:bg-[#008f70] flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 cursor-pointer ml-0.5" title="Send">
            <Send size={20} className="ml-0.5" />
          </button>
        ) : isRecording ? (
          <button type="button" onClick={stopRecording} className="w-11 h-11 shrink-0 rounded-full bg-[#00a884] hover:bg-[#008f70] flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 cursor-pointer ml-0.5" title="Send Voice">
            <Send size={20} className="ml-0.5" />
          </button>
        ) : (
          <button type="button" onMouseDown={startRecording} className="w-11 h-11 shrink-0 rounded-full bg-[#00a884] hover:bg-[#008f70] flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 cursor-pointer ml-0.5" title="Record Voice">
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
      </AnimatePresence>
    </div>
  );
}
