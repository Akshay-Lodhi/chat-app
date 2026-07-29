'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, X, Check, Copy, Loader2, ListChecks, CheckCircle2 } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';

interface AISummaryModalProps {
  chatId: string;
  onClose: () => void;
}

export default function AISummaryModal({ chatId, onClose }: AISummaryModalProps) {
  const [summaryData, setSummaryData] = useState<{
    mainTopic: string;
    summary: string;
    keyPoints: string[];
    decisions: string[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const summarizeChat = useChatStore((state) => state.summarizeChat);

  useEffect(() => {
    let isMounted = true;
    const fetchSummary = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await summarizeChat(chatId);
        if (isMounted) {
          setSummaryData(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to generate AI summary');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchSummary();
    return () => { isMounted = false; };
  }, [chatId]);

  const handleCopy = () => {
    if (!summaryData) return;
    const text = `🤖 Nexus AI Summary: ${summaryData.mainTopic}\n\n📌 Overview:\n${summaryData.summary}\n\nKey Points:\n${summaryData.keyPoints.map(p => `• ${p}`).join('\n')}${summaryData.decisions.length > 0 ? `\n\nDecisions:\n${summaryData.decisions.map(d => `✓ ${d}`).join('\n')}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-surface-light border border-border/80 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative flex flex-col gap-5 max-h-[85vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500/20 to-emerald-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <span>AI Chat Summary</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Nexus AI
                </span>
              </h3>
              <p className="text-xs text-text-secondary">Smart summary of recent conversation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-2 rounded-full hover:bg-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-secondary">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
              <p className="text-sm font-medium animate-pulse">Analyzing recent messages with Gemini AI...</p>
            </div>
          ) : error ? (
            <div className="text-center py-10 text-rose-400 text-sm">
              {error}
            </div>
          ) : summaryData ? (
            <>
              {/* Main Topic Badge */}
              <div className="bg-gradient-to-r from-purple-500/10 via-emerald-500/10 to-transparent border border-purple-500/20 rounded-xl p-3.5 flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">Main Topic</span>
                <h4 className="text-base font-bold text-text-primary">{summaryData.mainTopic}</h4>
              </div>

              {/* Overview */}
              <div className="bg-surface border border-border/50 rounded-xl p-3.5 flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Overview</span>
                <p className="text-sm text-text-primary leading-relaxed">{summaryData.summary}</p>
              </div>

              {/* Key Points */}
              {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
                <div className="bg-surface border border-border/50 rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                    <ListChecks className="w-4 h-4 text-emerald-500" />
                    <span>Key Takeaways</span>
                  </div>
                  <ul className="space-y-1.5 text-sm text-text-primary pl-1">
                    {summaryData.keyPoints.map((point, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Decisions */}
              {summaryData.decisions && summaryData.decisions.length > 0 && (
                <div className="bg-surface border border-border/50 rounded-xl p-3.5 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                    <CheckCircle2 className="w-4 h-4 text-purple-400" />
                    <span>Decisions & Action Items</span>
                  </div>
                  <ul className="space-y-1.5 text-sm text-text-primary pl-1">
                    {summaryData.decisions.map((decision, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                        <span>{decision}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40">
          <button
            onClick={handleCopy}
            disabled={!summaryData || isLoading}
            className="px-4 py-2 text-xs font-medium bg-surface hover:bg-surface-hover border border-border text-text-primary rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
