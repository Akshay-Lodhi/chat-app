import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Image as ImageIcon, Sparkles, Upload, RotateCcw } from 'lucide-react';
import { useWallpaperStore, WallpaperType } from '@/store/useWallpaperStore';

interface WallpaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId?: string | null;
}

const PRESETS: { type: WallpaperType; label: string; bgClass: string; color: string }[] = [
  { type: 'doodle-dark', label: 'Default NexusChat Dark', bgClass: 'bg-[#0b141a] chat-bg-pattern', color: '#0b141a' },
  { type: 'doodle-light', label: 'NexusChat Light Doodle', bgClass: 'bg-[#efeae2] chat-bg-pattern-light text-black', color: '#efeae2' },
  { type: 'solid-teal', label: 'Emerald Teal', bgClass: 'bg-[#075e54]', color: '#075e54' },
  { type: 'solid-midnight', label: 'Midnight Blue', bgClass: 'bg-[#0d1418]', color: '#0d1418' },
  { type: 'solid-black', label: 'AMOLED Pitch Black', bgClass: 'bg-[#000000]', color: '#000000' },
  { type: 'solid-purple', label: 'Dark Purple', bgClass: 'bg-[#1f1b24]', color: '#1f1b24' },
];

export function WallpaperModal({ isOpen, onClose, chatId }: WallpaperModalProps) {
  const { setChatWallpaper, getChatWallpaper } = useWallpaperStore();
  const currentConfig = getChatWallpaper(chatId || null);

  const [urlInput, setUrlInput] = useState(currentConfig.customUrl);
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  const [mounted, setMounted] = useState(false);
  const customFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatId && isOpen) {
      const cfg = useWallpaperStore.getState().getChatWallpaper(chatId);
      setUrlInput(cfg.customUrl);
      if (cfg.wallpaper === 'custom') {
        setActiveTab('custom');
      }
    }
  }, [chatId, isOpen]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setUrlInput(dataUrl);
      if (chatId) {
        setChatWallpaper(chatId, 'custom', dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen || !mounted) return null;

  const content = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-surface border border-surface-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden z-10 relative flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-surface-border bg-[#111b21]">
            <div className="flex items-center space-x-2">
              <Sparkles size={20} className="text-primary" />
              <h2 className="text-lg font-medium text-text-primary">Chat Wallpaper & Theme</h2>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer">
              <X size={20} />
            </button>
          </div>

          {/* Segmented Control Tabs */}
          <div className="p-3 border-b border-surface-border bg-[#111b21]">
            <div className="flex bg-[#202c33] p-1 rounded-xl border border-surface-border/50">
              <button 
                type="button"
                onClick={() => setActiveTab('presets')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeTab === 'presets' ? 'bg-primary text-white shadow-md' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
              >
                Preset Wallpapers
              </button>
              <button 
                type="button"
                onClick={() => setActiveTab('custom')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${activeTab === 'custom' ? 'bg-primary text-white shadow-md' : 'text-[#8696a0] hover:text-[#e9edef]'}`}
              >
                Custom Photo / URL
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 max-h-[400px] overflow-y-auto">
            {/* Reset to Default Button */}
            <div className="mb-3">
              <button
                type="button"
                onClick={() => {
                  if (chatId) {
                    setChatWallpaper(chatId, 'doodle-dark');
                    setUrlInput('');
                  }
                }}
                className="w-full py-2.5 px-3 bg-surface-hover hover:bg-surface-active text-text-secondary hover:text-text-primary border border-surface-border rounded-xl flex items-center justify-between text-xs font-medium transition-colors cursor-pointer"
              >
                <div className="flex items-center space-x-2">
                  <RotateCcw size={15} className="text-primary" />
                  <span>Reset to Default Wallpaper</span>
                </div>
                {currentConfig.wallpaper === 'doodle-dark' && !currentConfig.customUrl && (
                  <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-semibold">Active</span>
                )}
              </button>
            </div>
            {activeTab === 'presets' ? (
              <div className="grid grid-cols-2 gap-3">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.type}
                    onClick={() => {
                      if (chatId) setChatWallpaper(chatId, preset.type);
                    }}
                    className={`h-24 rounded-xl border-2 flex flex-col justify-between p-3 relative overflow-hidden transition-all text-left ${preset.bgClass} ${currentConfig.wallpaper === preset.type ? 'border-primary ring-2 ring-primary/30 scale-[1.02]' : 'border-surface-border hover:border-text-tertiary'}`}
                  >
                    <span className="text-xs font-medium truncate drop-shadow">{preset.label}</span>
                    {currentConfig.wallpaper === preset.type && (
                      <div className="absolute top-2 right-2 bg-primary text-white p-1 rounded-full shadow-md">
                        <Check size={12} />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <input type="file" ref={customFileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                
                {/* Device Upload Button */}
                <button
                  onClick={() => customFileInputRef.current?.click()}
                  className="w-full py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl flex items-center justify-center space-x-2 text-xs font-medium transition-colors"
                >
                  <Upload size={16} />
                  <span>Choose Photo from Device</span>
                </button>

                <div className="flex items-center my-2">
                  <div className="flex-1 border-t border-surface-border" />
                  <span className="px-2 text-[10px] text-text-tertiary uppercase">Or paste URL</span>
                  <div className="flex-1 border-t border-surface-border" />
                </div>

                <div>
                  <div className="flex space-x-2">
                    <input 
                      type="url"
                      placeholder="https://example.com/wallpaper.jpg"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="flex-1 bg-surface-hover border border-surface-border text-text-primary rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary"
                    />
                    <button 
                      onClick={() => {
                        if (urlInput.trim() && chatId) {
                          setChatWallpaper(chatId, 'custom', urlInput.trim());
                        }
                      }}
                      className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </div>

                {(currentConfig.customUrl || urlInput) && (
                  <div className="relative rounded-xl overflow-hidden h-36 border border-surface-border mt-2">
                    <img src={currentConfig.customUrl || urlInput} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <span className="text-white text-xs bg-black/60 px-3 py-1 rounded-full font-medium">
                        {currentConfig.wallpaper === 'custom' ? '✓ Active Custom Image' : 'Custom Image Ready'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
