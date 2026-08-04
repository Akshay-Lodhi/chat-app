import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Trash2, FileAudio, FileVideo, Download } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import toast from 'react-hot-toast';

interface Recording {
  id: string;
  userId: string;
  url: string;
  type: 'AUDIO' | 'VIDEO';
  duration: number | null;
  createdAt: string;
}

interface RecordingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RecordingsModal({ isOpen, onClose }: RecordingsModalProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchRecordings();
    } else {
      setPlayingRecording(null);
    }
  }, [isOpen]);

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/recordings`);
      if (res.ok) {
        const data = await res.json();
        setRecordings(data);
      }
    } catch (err) {
      console.error('Failed to fetch recordings:', err);
      toast.error('Failed to load recordings');
    } finally {
      setLoading(false);
    }
  };

  const deleteRecording = async (id: string) => {
    try {
      const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/recordings/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setRecordings(prev => prev.filter(r => r.id !== id));
        toast.success('Recording deleted');
        if (playingRecording?.id === id) {
          setPlayingRecording(null);
        }
      } else {
        toast.error('Failed to delete recording');
      }
    } catch (err) {
      console.error('Failed to delete recording:', err);
      toast.error('Failed to delete recording');
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'Unknown length';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/10 flex flex-col max-h-[85vh] relative"
        >
          <div className="p-2 flex justify-end absolute top-0 right-0 z-10">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors bg-black/20">
              <X size={20} className="text-white/70" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-12">
            {playingRecording ? (
              <div className="mb-6 bg-black/40 rounded-xl p-4 border border-white/10 relative">
                <button 
                  onClick={() => setPlayingRecording(null)}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-white/20 rounded-full z-10 transition-colors"
                >
                  <X size={16} className="text-white" />
                </button>
                <div className="aspect-video w-full rounded-lg overflow-hidden bg-black flex items-center justify-center">
                  {playingRecording.type === 'VIDEO' ? (
                    <video src={playingRecording.url} controls autoPlay className="w-full h-full object-contain" />
                  ) : (
                    <audio src={playingRecording.url} controls autoPlay className="w-full max-w-md" />
                  )}
                </div>
                <div className="mt-3 flex justify-between items-center px-1">
                  <span className="text-sm font-medium text-white/90">
                    {playingRecording.type === 'VIDEO' ? 'Video' : 'Audio'} Recording
                  </span>
                  <a href={playingRecording.url} download target="_blank" rel="noreferrer" className="flex items-center text-xs text-primary hover:underline">
                    <Download size={14} className="mr-1" /> Download File
                  </a>
                </div>
              </div>
            ) : null}

            {loading ? (
              <div className="flex justify-center items-center h-32">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : recordings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-white/50">
                <FileVideo size={48} className="mb-4 opacity-50" />
                <p>No recordings found.</p>
                <p className="text-sm mt-1">Recordings you make during calls will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recordings.map(recording => (
                  <div key={recording.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-full ${recording.type === 'VIDEO' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                        {recording.type === 'VIDEO' ? <FileVideo size={20} /> : <FileAudio size={20} />}
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">
                          {recording.type === 'VIDEO' ? 'Video' : 'Audio'} Call Recording
                        </p>
                        <p className="text-white/50 text-xs">
                          {formatDate(recording.createdAt)} • {formatDuration(recording.duration)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setPlayingRecording(recording)}
                        className="p-2 hover:bg-primary/20 hover:text-primary text-white/70 rounded-full transition-colors"
                        title="Play"
                      >
                        <Play size={18} />
                      </button>
                      <button
                        onClick={() => deleteRecording(recording.id)}
                        className="p-2 hover:bg-red-500/20 hover:text-red-400 text-white/70 rounded-full transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
