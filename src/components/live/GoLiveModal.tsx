'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Video, Radio, Sparkles } from 'lucide-react';
import { useLiveStore } from '@/store/useLiveStore';

interface GoLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  'General', 'Astrology', 'Coding', 'Gaming', 
  'Music', 'Education', 'Fitness', 'Art', 'Tech'
];

export function GoLiveModal({ isOpen, onClose }: GoLiveModalProps) {
  const { startLiveStream, setLocalStream } = useLiveStore();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [description, setDescription] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (isOpen) {
      navigator.mediaDevices?.getUserMedia({ video: true, audio: true })
        .then((stream) => {
          streamRef.current = stream;
          setLocalStream(stream);
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.warn('Camera preview error:', err);
        });
    }

    return () => {
      // Cleanup preview tracks if modal closed without starting
    };
  }, [isOpen, setLocalStream]);

  if (!isOpen) return null;

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsStarting(true);
    const stream = await startLiveStream({
      title: title.trim(),
      category,
      description: description.trim()
    });
    setIsStarting(false);

    if (stream) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-surface rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-surface-border z-10 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-surface-border bg-surface-hover/50">
            <div className="flex items-center space-x-2">
              <div className="p-2 rounded-full bg-[#25D366]/20 text-[#25D366]">
                <Radio size={20} className="animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-text-primary">Go Live</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-secondary hover:text-text-primary"
            >
              <X size={20} />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleStart} className="p-6 space-y-5">
            {/* Camera Preview Surface */}
            <div className="relative w-full h-48 bg-black rounded-2xl overflow-hidden border border-surface-border flex items-center justify-center">
              <video 
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center space-x-1 shadow-sm">
                <Sparkles size={12} />
                <span>PREVIEW</span>
              </div>
            </div>

            {/* Title Input */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Live Stream Title *
              </label>
              <input 
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is your live stream about?"
                className="w-full bg-chat-bg border border-surface-border text-text-primary px-4 py-3 rounded-xl focus:outline-none focus:border-[#25D366] transition-colors text-sm"
              />
            </div>

            {/* Category Select */}
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      category === cat 
                        ? 'bg-[#25D366] text-black font-bold shadow-[0_0_12px_rgba(37,211,102,0.4)]' 
                        : 'bg-surface-hover text-text-secondary hover:text-text-primary border border-surface-border'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isStarting || !title.trim()}
              className="w-full py-3.5 bg-gradient-to-r from-[#25D366] to-[#1EBE5D] text-black font-extrabold text-base rounded-2xl shadow-lg hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <Radio size={20} />
              <span>{isStarting ? 'Starting Broadcast...' : 'Start Live Broadcast'}</span>
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
