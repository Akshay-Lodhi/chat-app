'use client';

import React from 'react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';

interface MediaViewerProps {
  url: string;
  type: 'IMAGE' | 'VIDEO';
  onClose: () => void;
}

export default function MediaViewer({ url, type, onClose }: MediaViewerProps) {
  const [scale, setScale] = React.useState(1);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.5, 0.5));

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
      {/* Header Toolbar */}
      <div className="absolute top-0 w-full h-16 flex items-center justify-between px-6 bg-black/50 z-50">
        <div className="flex items-center space-x-6">
          <button onClick={onClose} className="text-white hover:text-gray-300 transition">
            <X size={28} />
          </button>
        </div>
        <div className="flex items-center space-x-6 text-white">
          {type === 'IMAGE' && (
            <>
              <button onClick={handleZoomOut} className="hover:text-gray-300"><ZoomOut size={24} /></button>
              <button onClick={handleZoomIn} className="hover:text-gray-300"><ZoomIn size={24} /></button>
            </>
          )}
          <a href={url} download target="_blank" rel="noreferrer" className="hover:text-gray-300">
            <Download size={24} />
          </a>
        </div>
      </div>

      {/* Media Container */}
      <div className="flex-1 w-full h-full flex items-center justify-center overflow-auto p-12 relative" onClick={onClose}>
        {type === 'IMAGE' ? (
          <img 
            src={url} 
            alt="Media" 
            style={{ transform: `scale(${scale})` }}
            className="max-w-full max-h-full object-contain transition-transform duration-200 cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <video 
            src={url} 
            controls 
            autoPlay
            className="max-w-[90%] max-h-[90%] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}
