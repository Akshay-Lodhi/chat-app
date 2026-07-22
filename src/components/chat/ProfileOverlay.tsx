import React, { useRef, useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { ArrowLeft, Search, Camera, Palette } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { WallpaperModal } from './WallpaperModal';

interface ProfileOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileOverlay({ isOpen, onClose }: ProfileOverlayProps) {
  const { user, updateProfile } = useAuthStore();
  const profilePicRef = useRef<HTMLInputElement>(null);
  
  const [editName, setEditName] = useState(user?.name || '');
  const [editAbout, setEditAbout] = useState(user?.about || 'Hey there! I am using WhatsApp.');
  const [showWallpaperModal, setShowWallpaperModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEditName(user?.name || '');
      setEditAbout(user?.about || 'Hey there! I am using WhatsApp.');
    }
  }, [isOpen, user]);

  const handleProfileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        updateProfile({ profilePicture: data.url });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) return;
    await updateProfile({ name: editName, about: editAbout });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ x: '-100%' }}
          animate={{ x: 0 }}
          exit={{ x: '-100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute top-0 left-0 w-full md:w-[30%] md:min-w-[350px] max-w-full md:max-w-[450px] h-full bg-surface z-40 flex flex-col shadow-2xl border-r border-surface-border"
        >
          {/* Header */}
          <div className="h-28 bg-surface-hover flex items-end px-4 pb-4 shrink-0 shadow-sm border-b border-surface-border">
            {user?.name && (
              <button onClick={onClose} className="text-text-primary mr-6 hover:text-primary transition-colors">
                <ArrowLeft size={24} />
              </button>
            )}
            <h1 className="text-2xl font-semibold text-text-primary tracking-tight">Profile</h1>
          </div>
          
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-border p-6 flex flex-col items-center">
            <input type="file" ref={profilePicRef} className="hidden" onChange={handleProfileUpload} accept="image/*" />
            
            <div 
              onClick={() => profilePicRef.current?.click()}
              className="w-48 h-48 rounded-full mb-8 relative group cursor-pointer border-4 border-transparent hover:border-primary transition-all shadow-xl shrink-0 overflow-hidden"
            >
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-surface-border flex items-center justify-center text-5xl font-semibold text-text-primary">
                  {user?.name ? user.name.charAt(0) : user?.phoneNumber?.charAt(0) || 'U'}
                </div>
              )}
              
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-sm text-center px-4 backdrop-blur-sm">
                <Camera size={28} className="mb-2" />
                <span className="font-medium">CHANGE PROFILE PHOTO</span>
              </div>
            </div>

            <div className="w-full mb-8">
              <p className="text-primary text-sm font-medium mb-3">Your name</p>
              <div className="relative border-b-2 border-primary focus-within:border-primary-hover transition-colors">
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => updateProfile({ name: editName })}
                  className="w-full bg-transparent text-text-primary text-lg focus:outline-none pb-2 placeholder-text-tertiary"
                  placeholder="Enter your name"
                />
              </div>
              <p className="text-text-secondary text-xs mt-3 leading-relaxed">
                This is not your username or pin. This name will be visible to your WhatsApp contacts.
              </p>
            </div>

            <div className="w-full mb-8">
              <p className="text-primary text-sm font-medium mb-3">About</p>
              <div className="relative border-b-2 border-primary focus-within:border-primary-hover transition-colors">
                <input 
                  type="text" 
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  onBlur={() => updateProfile({ about: editAbout })}
                  className="w-full bg-transparent text-text-primary text-lg focus:outline-none pb-2 placeholder-text-tertiary"
                  placeholder="Hey there! I am using WhatsApp."
                />
              </div>
            </div>

            <WallpaperModal isOpen={showWallpaperModal} onClose={() => setShowWallpaperModal(false)} />

            <div className="w-full mb-8">
              <p className="text-primary text-sm font-medium mb-3">Appearance</p>
              <button 
                type="button"
                onClick={() => setShowWallpaperModal(true)}
                className="w-full bg-surface-hover hover:bg-surface-active border border-surface-border rounded-2xl p-4 flex items-center justify-between text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <Palette size={22} />
                  </div>
                  <div>
                    <p className="text-text-primary text-sm font-medium">Chat Wallpaper & Theme</p>
                    <p className="text-text-secondary text-xs mt-0.5">Customize chat background colors & wallpapers</p>
                  </div>
                </div>
              </button>
            </div>

            <div className="mt-auto pt-8 w-full pb-4">
              <Button 
                onClick={handleSaveProfile}
                size="lg"
                className="w-full py-4 text-base tracking-wide rounded-2xl shadow-lg"
              >
                SAVE PROFILE
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
