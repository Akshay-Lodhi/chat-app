import React, { useState, useRef } from 'react';
import { X, Send, Image as ImageIcon, Video, Type } from 'lucide-react';
import { useStoryStore } from '@/store/useStoryStore';
import { apiClient } from '@/lib/apiClient';
import toast from 'react-hot-toast';

interface StoryCreatorModalProps {
  type: 'TEXT' | 'MEDIA';
  onClose: () => void;
}

const COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A8', '#33FFF5', '#F5FF33', '#A833FF'
];

export const StoryCreatorModal = ({ type, onClose }: StoryCreatorModalProps) => {
  const { createStory } = useStoryStore();
  
  const [content, setContent] = useState('');
  const [bgColor, setBgColor] = useState(COLORS[0]);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      const url = URL.createObjectURL(file);
      setMediaPreview(url);
    }
  };

  const handleSubmit = async () => {
    setIsUploading(true);
    try {
      let mediaUrl = undefined;
      let finalType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'MEDIA' = type;

      if (mediaFile) {
        const formData = new FormData();
        formData.append('file', mediaFile);
        const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/upload`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        mediaUrl = data.url;
        finalType = data.type === 'VIDEO' ? 'VIDEO' : 'IMAGE';
      }

      await createStory({
        type: finalType as 'TEXT' | 'IMAGE' | 'VIDEO',
        content: content || undefined,
        mediaUrl,
        bgColor: finalType === 'TEXT' ? bgColor : undefined
      });
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to post status update');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white">
      {/* Header */}
      <div className="flex justify-between items-center p-4 bg-black/40 absolute top-0 w-full z-10">
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={24} />
        </button>
        {type === 'TEXT' && (
          <div className="flex space-x-2">
            {COLORS.map(color => (
              <button 
                key={color}
                onClick={() => setBgColor(color)}
                className={`w-8 h-8 rounded-full border-2 ${bgColor === color ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div 
        className="flex-1 flex items-center justify-center relative"
        style={{ backgroundColor: type === 'TEXT' ? bgColor : '#000' }}
      >
        {type === 'TEXT' ? (
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a status..."
            className="w-full bg-transparent text-center text-4xl font-bold outline-none resize-none px-4 h-auto min-h-[100px]"
            maxLength={250}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            {mediaPreview ? (
              mediaFile?.type.startsWith('video/') ? (
                <video src={mediaPreview} controls autoPlay loop className="max-w-full max-h-full object-contain" />
              ) : (
                <img src={mediaPreview} alt="Preview" className="max-w-full max-h-full object-contain" />
              )
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white/20 p-6 rounded-full hover:bg-white/30 transition-colors"
                >
                  <ImageIcon size={48} />
                </button>
                <p className="text-xl">Select a photo or video</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*,video/*" 
                  className="hidden" 
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer / Send Button */}
      {(type === 'TEXT' ? content.trim().length > 0 : mediaPreview) && (
        <div className="absolute bottom-6 right-6 z-10">
          {type === 'MEDIA' && (
             <div className="mb-4 bg-black/50 p-2 rounded-full w-[80vw] max-w-[400px] left-1/2 -translate-x-1/2 absolute bottom-16">
               <input
                 type="text"
                 value={content}
                 onChange={(e) => setContent(e.target.value)}
                 placeholder="Add a caption..."
                 className="w-full bg-transparent outline-none text-white px-4"
               />
             </div>
          )}
          <button 
            onClick={handleSubmit}
            disabled={isUploading}
            className="bg-primary p-4 rounded-full shadow-lg hover:bg-primary/90 transition-all flex items-center justify-center disabled:opacity-50"
          >
            {isUploading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send size={24} className="ml-1 text-white" />
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// Trigger TS Server Sync
