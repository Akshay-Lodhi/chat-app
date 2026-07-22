import React, { useRef, useState } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useChatStore } from '@/store/useChatStore';
import { ArrowLeft, UserPlus, Camera, Edit2, LogOut, Check } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { motion, AnimatePresence } from 'framer-motion';

interface GroupInfoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMemberClick: () => void;
}

export function GroupInfoOverlay({ isOpen, onClose, onAddMemberClick }: GroupInfoOverlayProps) {
  const { user } = useAuthStore();
  const { chats, activeChatId, updateGroupPicture } = useChatStore();
  
  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');

  if (!isOpen || !activeChat || !activeChat.isGroup) return null;

  const isAdmin = activeChat.adminId === user?.id;

  const handlePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        await updateGroupPicture(activeChat.id, data.url);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const saveGroupName = async () => {
    // In a real app we'd have a backend route for this.
    // For now we'll just optimistically update or leave it if backend not implemented
    setIsEditingName(false);
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="absolute top-0 right-0 w-full md:w-[350px] lg:w-[400px] h-full bg-surface z-40 flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.1)] border-l border-surface-border"
      >
        {/* Header */}
        <div className="h-16 bg-surface-hover flex items-center px-4 shrink-0 shadow-sm border-b border-surface-border">
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary mr-4 transition-colors">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-base font-medium text-text-primary">Contact info</h1>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-border">
          {/* Profile Section */}
          <div className="bg-surface flex flex-col items-center py-8 shadow-sm">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handlePictureUpload} accept="image/*" />
            
            <div 
              onClick={() => isAdmin && fileInputRef.current?.click()}
              className={`w-48 h-48 rounded-full mb-6 relative group border-4 border-surface-hover overflow-hidden transition-all shadow-xl ${isAdmin ? 'cursor-pointer hover:border-primary' : ''}`}
            >
              <Avatar src={activeChat.groupPicture} fallback={activeChat.name || undefined} size="xl" className="w-full h-full rounded-none" />
              
              {isAdmin && (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-sm text-center backdrop-blur-sm">
                  <Camera size={28} className="mb-2" />
                  <span className="font-medium">CHANGE GROUP PHOTO</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-2 text-2xl text-text-primary font-medium px-4 text-center">
              {isEditingName ? (
                <div className="flex items-center space-x-2">
                  <Input 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="h-10 text-lg w-48 text-center"
                  />
                  <Button size="icon" variant="ghost" onClick={saveGroupName}><Check size={20} className="text-primary" /></Button>
                </div>
              ) : (
                <>
                  <span>{activeChat.name}</span>
                  {isAdmin && (
                    <button onClick={() => { setEditName(activeChat.name || ''); setIsEditingName(true); }} className="text-text-secondary hover:text-primary transition-colors">
                      <Edit2 size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="text-text-secondary text-base mt-2">Group • {activeChat.participants?.length || 0} participants</p>
          </div>

          <div className="h-2 bg-background w-full"></div>

          {/* Participants */}
          <div className="bg-surface py-4">
            <div className="px-6 mb-4 text-primary text-sm font-medium tracking-wide">
              {activeChat.participants?.length || 0} participants
            </div>
            
            {isAdmin && (
              <div 
                onClick={onAddMemberClick} 
                className="flex items-center px-6 py-3 cursor-pointer hover:bg-surface-hover transition-colors group"
              >
                <div className="w-12 h-12 bg-primary rounded-full mr-4 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                  <UserPlus size={20} />
                </div>
                <h2 className="text-base text-text-primary font-medium">Add participant</h2>
              </div>
            )}

            <div className="flex flex-col">
              {activeChat.participants?.map((p: any) => (
                <div key={p.userId} className="flex items-center px-6 py-3 hover:bg-surface-hover transition-colors">
                  <Avatar src={p.user?.profilePicture} fallback={p.user?.name || p.user?.phoneNumber} size="lg" className="mr-4" />
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base text-text-primary font-medium truncate">
                      {p.userId === user?.id ? 'You' : (p.user?.name || p.user?.phoneNumber)}
                    </h2>
                    {p.user?.about && <p className="text-sm text-text-secondary truncate">{p.user?.about}</p>}
                  </div>
                  {activeChat.adminId === p.userId && (
                    <span className="text-xs border border-primary text-primary px-2 py-0.5 rounded-full font-medium">Group Admin</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="h-2 bg-background w-full"></div>

          {/* Actions */}
          <div className="bg-surface py-2">
            <div className="flex items-center px-6 py-4 cursor-pointer hover:bg-surface-hover transition-colors text-danger group">
              <LogOut size={24} className="mr-6 group-hover:-translate-x-1 transition-transform" />
              <h2 className="text-base font-medium">Exit group</h2>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
