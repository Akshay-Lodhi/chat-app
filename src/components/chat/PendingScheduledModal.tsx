'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Trash2, X, Clock, Loader2 } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

interface PendingScheduledModalProps {
  chatId: string;
  onClose: () => void;
}

export default function PendingScheduledModal({ chatId, onClose }: PendingScheduledModalProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { fetchPendingScheduledMessages, cancelScheduledMessage } = useChatStore();

  const loadScheduled = async () => {
    setIsLoading(true);
    const data = await fetchPendingScheduledMessages(chatId);
    setMessages(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    loadScheduled();
  }, [chatId]);

  const handleCancel = async (msgId: string) => {
    const ok = await cancelScheduledMessage(chatId, msgId);
    if (ok) {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-light border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 relative flex flex-col gap-5 max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Upcoming Messages</h3>
              <p className="text-xs text-text-secondary">Messages queued to be sent automatically</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-2 rounded-full hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content List */}
        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-text-secondary gap-2 text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <span>Loading scheduled messages...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-10 text-text-secondary flex flex-col items-center gap-2">
              <Clock className="w-8 h-8 text-text-tertiary" />
              <p className="text-sm">No pending scheduled messages for this chat.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className="bg-surface border border-border/70 rounded-xl p-3.5 flex items-start justify-between gap-3 hover:border-border transition-colors"
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(msg.scheduledAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short'
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary break-words line-clamp-3">
                    {msg.content}
                  </p>
                </div>
                <button
                  onClick={() => handleCancel(msg.id)}
                  title="Cancel scheduled message"
                  className="text-text-tertiary hover:text-rose-500 p-2 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-xl transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
