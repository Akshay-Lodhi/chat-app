import React, { useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useCallStore } from '@/store/useCallStore';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';


interface MessageListProps {
  onReply: (message: any) => void;
  onMediaClick: (url: string, type: 'IMAGE' | 'VIDEO') => void;
  searchQuery?: string;
}

export function MessageList({ onReply, onMediaClick, searchQuery = '' }: MessageListProps) {
  const { messages, activeChatId, chats } = useChatStore();
  const { user } = useAuthStore();
  const { initiateCall } = useCallStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;
  const chatMessages = activeChatId ? (messages[activeChatId] || []) : [];
  
  const filteredMessages = searchQuery ? chatMessages.filter(m => 
    m.content?.toLowerCase().includes(searchQuery.toLowerCase())
  ) : chatMessages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredMessages]);

  if (!activeChatId) return null;

  return (
    <div 
      className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 space-y-2 scrollbar-thin scrollbar-thumb-surface-border"
      style={{
        paddingLeft: 'max(16px, env(safe-area-inset-left))',
        paddingRight: 'max(16px, env(safe-area-inset-right))'
      }}
    >
      {/* End-to-End Encryption Notice */}
      <div className="flex justify-center mb-4 px-2">
        <div className="bg-[#182229] border border-[#222d34] rounded-xl px-4 py-2.5 max-w-sm md:max-w-md text-center shadow-sm flex items-start space-x-2">
          <Lock size={13} className="text-[#febd2d] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#febd2d] leading-normal font-normal">
            Messages and calls are end-to-end encrypted. No one outside of this chat, not even NexusChat, can read or listen to them. <span className="hover:underline cursor-pointer">Tap to learn more.</span>
          </p>
        </div>
      </div>
      {filteredMessages.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-text-tertiary bg-surface-hover px-4 py-2 rounded-full text-sm">
            {searchQuery ? 'No messages found.' : 'Say hello!'}
          </p>
        </div>
      ) : (
        filteredMessages.map((msg, index) => {
          const isMine = msg.senderId === user?.id;
          const showDate = index === 0 || 
            new Date(filteredMessages[index - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
            
          return (
            <React.Fragment key={`${msg.id || msg.tempId || 'msg'}_${index}`}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="bg-surface-hover text-text-secondary text-xs px-3 py-1 rounded-full shadow-sm">
                    {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
              <MessageBubble 
                message={msg} 
                isMine={isMine} 
                onReply={() => onReply(msg)}
                onMediaClick={() => onMediaClick(msg.mediaUrl || msg.content || '', msg.type as 'IMAGE' | 'VIDEO')}
                onCallClick={(type: 'AUDIO' | 'VIDEO', callData?: any) => {
                  const isGroupLog = callData?.isGroup || activeChat?.isGroup;
                  const chatName = isGroupLog
                    ? (activeChat?.isGroup ? activeChat.name : 'Group Call')
                    : (activeChat?.participants?.find((p: any) => p.userId !== user?.id)?.user?.name || 'Unknown');
                  
                  useCallStore.setState({ caller: chatName });

                  let invitedIds: string[] = [];
                  if (callData?.participants && Array.isArray(callData.participants)) {
                    invitedIds = callData.participants
                      .map((p: any) => p.userId)
                      .filter((id: string) => id && id !== user?.id);
                  }

                  initiateCall(type, activeChatId!, invitedIds);
                }}
                highlight={searchQuery !== '' && msg.content?.toLowerCase().includes(searchQuery.toLowerCase())}
              />
            </React.Fragment>
          );
        })
      )}
      <div ref={messagesEndRef} className="h-1" />
    </div>
  );
}
