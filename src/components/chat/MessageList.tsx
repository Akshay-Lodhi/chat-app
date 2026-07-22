import React, { useRef, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { useCallStore } from '@/store/useCallStore';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { motion } from 'framer-motion';


interface MessageListProps {
  onReply: (message: any) => void;
  onMediaClick: (url: string, type: 'IMAGE' | 'VIDEO') => void;
  searchQuery?: string;
}

export function MessageList({ onReply, onMediaClick, searchQuery = '' }: MessageListProps) {
  const { user } = useAuthStore();
  const { activeChatId, messages, chats } = useChatStore();
  const initiateCall = useCallStore(state => state.initiateCall);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeMessages = activeChatId ? messages[activeChatId] || [] : [];
  const activeChat = chats.find(c => c.id === activeChatId);
  
  // Filter messages based on search
  const filteredMessages = activeMessages.filter(msg => 
    !searchQuery || (msg.content && msg.content.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredMessages]);

  if (!activeChatId) return null;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-2 scrollbar-thin scrollbar-thumb-surface-border">
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
            <React.Fragment key={msg.id || index}>
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
                onCallClick={(type: 'AUDIO' | 'VIDEO') => {
                  const chatName = activeChat?.isGroup ? activeChat.name : activeChat?.participants?.find((p: any) => p.userId !== user?.id)?.user?.name || 'Unknown';
                  useCallStore.setState({ caller: chatName });
                  initiateCall(type, activeChatId!);
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
