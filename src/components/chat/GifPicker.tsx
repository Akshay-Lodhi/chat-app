import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose?: () => void;
}

export function GifPicker({ onSelect }: GifPickerProps) {
  const [query, setQuery] = useState('');
  const [memes, setMemes] = useState<any[]>([]);
  const [filteredMemes, setFilteredMemes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchMemes = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('https://api.imgflip.com/get_memes');
        const data = await res.json();
        if (data.success) {
          setMemes(data.data.memes || []);
          setFilteredMemes(data.data.memes || []);
        }
      } catch (err) {
        console.error('Error fetching memes:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMemes();
  }, []);

  useEffect(() => {
    if (!query) {
      setFilteredMemes(memes);
    } else {
      const lowerQuery = query.toLowerCase();
      setFilteredMemes(memes.filter((m: any) => m.name.toLowerCase().includes(lowerQuery)));
    }
  }, [query, memes]);

  return (
    <div className="flex flex-col h-full w-full bg-transparent overflow-hidden">
      <div className="p-3 border-b border-surface-border bg-surface-hover/30 flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search Memes & Stickers..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-black/20 text-text-primary text-sm rounded-full pl-9 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-all border border-transparent focus:border-emerald-500/30"
          />
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-2 no-scrollbar scroll-smooth"
      >
        <div className="columns-2 gap-2 space-y-2">
          {filteredMemes.map((meme) => (
            <div
              key={meme.id}
              onClick={() => onSelect(meme.url)}
              className="relative cursor-pointer group break-inside-avoid overflow-hidden rounded-xl bg-black/20"
            >
              <img
                src={meme.url}
                alt={meme.name}
                className="w-full h-auto rounded-xl group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 rounded-xl flex items-end">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-xs font-semibold text-white truncate w-full text-center bg-black/50 rounded-b-xl">
                  {meme.name}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {isLoading && (
          <div className="flex justify-center p-4 w-full">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
          </div>
        )}

        {!isLoading && filteredMemes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-text-tertiary p-8 text-center">
            <div className="text-4xl mb-3">👻</div>
            <p className="text-sm font-medium">No Memes found</p>
            <p className="text-xs opacity-70 mt-1">Try another search term</p>
          </div>
        )}
      </div>
      
      <div className="p-2 border-t border-surface-border/50 bg-black/10 flex justify-center shrink-0">
        <span className="text-[10px] text-text-tertiary font-medium uppercase tracking-wider">Powered by Imgflip</span>
      </div>
    </div>
  );
}
