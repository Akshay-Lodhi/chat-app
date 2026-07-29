'use client';

import React, { useState } from 'react';
import { Clock, Check, X, ShieldAlert } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

interface DisappearingMessagesModalProps {
  chatId: string;
  currentTimer?: number | null;
  onClose: () => void;
}

const TIMER_OPTIONS = [
  { label: '24 hours', value: 86400 },
  { label: '7 days', value: 604800 },
  { label: '90 days', value: 7776000 },
  { label: 'Off', value: 0 },
];

export default function DisappearingMessagesModal({
  chatId,
  currentTimer = 0,
  onClose
}: DisappearingMessagesModalProps) {
  const [selectedTimer, setSelectedTimer] = useState<number>(currentTimer || 0);
  const [isSaving, setIsSaving] = useState(false);
  const setDisappearingTimer = useChatStore((state) => state.setDisappearingTimer);

  const handleSave = async () => {
    setIsSaving(true);
    await setDisappearingTimer(chatId, selectedTimer);
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-light border border-border rounded-2xl w-full max-w-md shadow-2xl p-6 relative flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Disappearing Messages</h3>
              <p className="text-xs text-text-secondary">Make new messages in this chat disappear</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-2 rounded-full hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Banner */}
        <div className="bg-surface border border-border/50 rounded-xl p-3.5 flex items-start gap-3 text-xs text-text-secondary">
          <ShieldAlert className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <span>
            When turned on, new messages sent in this chat will disappear after the selected duration. Existing messages will not be affected.
          </span>
        </div>

        {/* Timer Options List */}
        <div className="space-y-2">
          {TIMER_OPTIONS.map((option) => {
            const isSelected = selectedTimer === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setSelectedTimer(option.value)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-500 font-medium'
                    : 'border-border/60 bg-surface hover:bg-surface-hover text-text-primary'
                }`}
              >
                <span>{option.label}</span>
                {isSelected && <Check className="w-4 h-4 text-emerald-500" />}
              </button>
            );
          })}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || selectedTimer === currentTimer}
            className="px-5 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
          >
            {isSaving ? 'Saving...' : 'Done'}
          </button>
        </div>

      </div>
    </div>
  );
}
