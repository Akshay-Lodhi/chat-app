'use client';

import React, { useState } from 'react';
import { Calendar, Clock, X, Send, Sparkles } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

interface ScheduleMessageModalProps {
  chatId: string;
  initialContent?: string;
  onClose: () => void;
  onScheduledSuccess?: () => void;
}

export default function ScheduleMessageModal({
  chatId,
  initialContent = '',
  onClose,
  onScheduledSuccess
}: ScheduleMessageModalProps) {
  const [content, setContent] = useState(initialContent);
  // Default to 1 hour from now formatted for datetime-local input
  const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
  const localISO = new Date(defaultDate.getTime() - (defaultDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
  
  const [scheduledAt, setScheduledAt] = useState(localISO);
  const [isScheduling, setIsScheduling] = useState(false);
  const scheduleMessage = useChatStore((state) => state.scheduleMessage);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !scheduledAt) return;

    setIsScheduling(true);
    const success = await scheduleMessage(chatId, content.trim(), new Date(scheduledAt).toISOString());
    setIsScheduling(false);

    if (success) {
      if (onScheduledSuccess) onScheduledSuccess();
      onClose();
    }
  };

  const setPreset = (hoursToAdd: number, targetHour?: number) => {
    const d = new Date();
    if (targetHour !== undefined) {
      if (hoursToAdd > 0) d.setDate(d.getDate() + 1);
      d.setHours(targetHour, 0, 0, 0);
    } else {
      d.setTime(d.getTime() + hoursToAdd * 60 * 60 * 1000);
    }
    const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    setScheduledAt(local);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-light border border-border rounded-2xl w-full max-w-lg shadow-2xl p-6 relative flex flex-col gap-5">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Schedule Message</h3>
              <p className="text-xs text-text-secondary">Send a message automatically at a future time</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-2 rounded-full hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSchedule} className="flex flex-col gap-4">
          {/* Message Textarea */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Message Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type the message you want to schedule..."
              rows={3}
              required
              className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-emerald-500 transition-all resize-none"
            />
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreset(0, 0)} // Midnight 12 AM
              className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-secondary hover:text-emerald-500 hover:border-emerald-500/50 transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Midnight 12:00 AM (Birthday)</span>
            </button>
            <button
              type="button"
              onClick={() => setPreset(1, 9)} // Tomorrow 9 AM
              className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-secondary hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
            >
              Tomorrow 9:00 AM
            </button>
            <button
              type="button"
              onClick={() => setPreset(2)} // 2 hours from now
              className="px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-secondary hover:text-emerald-500 hover:border-emerald-500/50 transition-all"
            >
              In 2 Hours
            </button>
          </div>

          {/* DateTime Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-500" />
              <span>Date & Time</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
              className="w-full bg-surface border border-border rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isScheduling || !content.trim()}
              className="px-5 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{isScheduling ? 'Scheduling...' : 'Schedule Message'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
