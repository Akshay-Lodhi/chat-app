'use client';

import React, { useState } from 'react';
import { Sparkles, X, Send, Edit3, Globe, Wand2, Loader2, Bot } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

interface AIAssistantModalProps {
  chatId: string;
  lastMessageContent?: string;
  onUseDraft: (text: string) => void;
  onSendMessage: (text: string) => void;
  onClose: () => void;
}

export default function AIAssistantModal({
  chatId,
  lastMessageContent,
  onUseDraft,
  onSendMessage,
  onClose
}: AIAssistantModalProps) {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'SUGGEST' | 'TRANSLATE' | 'REWRITE' | 'CUSTOM'>('SUGGEST');
  const [targetLang, setTargetLang] = useState('Hindi');
  const [generatedText, setGeneratedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async (selectedMode?: string, customInput?: string) => {
    const activeMode = selectedMode || mode;
    const inputPrompt = customInput || prompt;
    
    setIsLoading(true);
    setGeneratedText('');

    try {
      let finalPrompt = inputPrompt;
      if (activeMode === 'SUGGEST') {
        finalPrompt = `Based on this incoming chat message: "${lastMessageContent || 'Hi, how are you?'}", write ONE short, natural, polite response to reply back directly. Do not include option numbers or introductory fluff.`;
      } else if (activeMode === 'REWRITE') {
        finalPrompt = `Rewrite and improve the following draft message to be clear, professional, and friendly: "${inputPrompt || lastMessageContent || 'hello'}"`;
      } else if (activeMode === 'TRANSLATE') {
        finalPrompt = `Translate the following message into ${targetLang}: "${inputPrompt || lastMessageContent || 'hello'}"`;
      }

      const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
      const res = await apiClient(`${SERVER_URL}/api/chats/ai-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, prompt: finalPrompt })
      });

      const data = await res.json();
      if (data?.response) {
        setGeneratedText(data.response.trim());
      } else {
        setGeneratedText("Sorry, couldn't generate response. Please try again.");
      }
    } catch (err) {
      console.error(err);
      setGeneratedText("An error occurred while communicating with AI.");
    } finally {
      setIsLoading(false);
    }
  };

  const parsedOptions = React.useMemo(() => {
    if (!generatedText) return [];
    const lines = generatedText.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const isNumberedList = lines.length > 1 && lines.every(l => /^\d+[\.\)]\s*/.test(l));
    if (isNumberedList) {
      return lines.map(l => l.replace(/^\d+[\.\)]\s*/, '').trim());
    }
    return [generatedText];
  }, [generatedText]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-surface-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-hover">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shadow">
              <Sparkles size={18} className="animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary text-base flex items-center gap-2">
                Private AI Assistant
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase font-bold border border-primary/20">Private</span>
              </h3>
              <p className="text-xs text-text-secondary">Get private suggestions, translations, or writing help</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-active rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Quick Action Selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('SUGGEST');
                handleGenerate('SUGGEST');
              }}
              className={`p-3 rounded-xl border flex items-center space-x-2.5 text-xs font-medium transition-all cursor-pointer ${
                mode === 'SUGGEST' 
                  ? 'bg-primary/10 border-primary text-primary shadow' 
                  : 'bg-background border-surface-border text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Wand2 size={16} className={`${mode === 'SUGGEST' ? 'text-primary' : 'text-text-tertiary'} shrink-0`} />
              <span>Suggest Reply</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('REWRITE');
              }}
              className={`p-3 rounded-xl border flex items-center space-x-2.5 text-xs font-medium transition-all cursor-pointer ${
                mode === 'REWRITE' 
                  ? 'bg-primary/10 border-primary text-primary shadow' 
                  : 'bg-background border-surface-border text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Edit3 size={16} className={`${mode === 'REWRITE' ? 'text-primary' : 'text-text-tertiary'} shrink-0`} />
              <span>Improve My Draft</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('TRANSLATE');
              }}
              className={`p-3 rounded-xl border flex items-center space-x-2.5 text-xs font-medium transition-all cursor-pointer ${
                mode === 'TRANSLATE' 
                  ? 'bg-primary/10 border-primary text-primary shadow' 
                  : 'bg-background border-surface-border text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Globe size={16} className={`${mode === 'TRANSLATE' ? 'text-primary' : 'text-text-tertiary'} shrink-0`} />
              <span>Translate Text</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('CUSTOM');
              }}
              className={`p-3 rounded-xl border flex items-center space-x-2.5 text-xs font-medium transition-all cursor-pointer ${
                mode === 'CUSTOM' 
                  ? 'bg-primary/10 border-primary text-primary shadow' 
                  : 'bg-background border-surface-border text-text-secondary hover:bg-surface-hover'
              }`}
            >
              <Bot size={16} className={`${mode === 'CUSTOM' ? 'text-primary' : 'text-text-tertiary'} shrink-0`} />
              <span>Ask AI Anything</span>
            </button>
          </div>

          {/* Mode Inputs */}
          {mode === 'TRANSLATE' && (
            <div className="flex flex-wrap items-center gap-2 bg-background p-2.5 rounded-xl border border-surface-border">
              <span className="text-xs text-text-secondary shrink-0">Translate to:</span>
              {['Hindi', 'English', 'Hinglish', 'Spanish'].map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setTargetLang(lang)}
                  className={`px-2.5 py-1 rounded-full text-xs transition-all cursor-pointer whitespace-nowrap ${
                    targetLang === lang ? 'bg-primary text-white font-semibold' : 'bg-surface-hover text-text-secondary hover:bg-surface-active'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          )}

          {(mode === 'CUSTOM' || mode === 'REWRITE' || mode === 'TRANSLATE') && (
            <div className="space-y-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  mode === 'CUSTOM' ? "Ask AI anything e.g. 'Suggest top 3 movies to watch tonight'..." :
                  mode === 'REWRITE' ? "Type your draft message to make it sound professional & clear..." :
                  "Type text to translate..."
                }
                rows={3}
                className="w-full bg-background border border-surface-border rounded-xl p-3 text-sm text-text-primary focus:outline-none focus:border-purple-500 resize-none placeholder-text-secondary/60"
              />
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isLoading}
                className="w-full py-2.5 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl text-xs flex items-center justify-center space-x-2 shadow transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                <span>Generate Private Suggestion</span>
              </button>
            </div>
          )}

          {/* Generated Result Output */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center p-6 space-y-3 bg-background rounded-xl border border-surface-border">
              <Loader2 size={24} className="animate-spin text-primary" />
              <p className="text-xs text-primary font-medium">Generating AI suggestion for you...</p>
            </div>
          )}

          {generatedText && !isLoading && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <Sparkles size={14} /> AI Recommendation:
                </span>
              </div>

              {parsedOptions.map((optionText, idx) => (
                <div key={idx} className="bg-background border border-primary/40 rounded-xl p-4 space-y-3">
                  {parsedOptions.length > 1 && (
                    <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-md font-bold uppercase">
                      Option {idx + 1}
                    </span>
                  )}
                  <p className="text-sm text-text-primary whitespace-pre-wrap leading-relaxed bg-surface p-3 rounded-lg border border-surface-border">
                    {optionText}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onUseDraft(optionText);
                        onClose();
                      }}
                      className="flex-1 py-2 px-3 bg-surface hover:bg-surface-hover text-text-primary border border-surface-border rounded-xl text-xs font-medium flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Edit3 size={14} className="text-primary" />
                      <span>Insert in Message Box</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onSendMessage(optionText);
                        onClose();
                      }}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 shadow transition-all cursor-pointer"
                    >
                      <Send size={14} />
                      <span>Send to Chat</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
