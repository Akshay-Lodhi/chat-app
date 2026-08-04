import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Undo, Trash2, Send, Palette, Pen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScribbleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (file: File) => void;
}

const COLORS = [
  '#000000', // Black
  '#ffffff', // White
  '#ff3b30', // Red
  '#ff9500', // Orange
  '#ffcc00', // Yellow
  '#4cd964', // Green
  '#5ac8fa', // Light Blue
  '#007aff', // Blue
  '#5856d6', // Purple
  '#ff2d55', // Pink
];

const BRUSH_SIZES = [
  { id: 'thin', size: 2 },
  { id: 'medium', size: 5 },
  { id: 'thick', size: 10 },
  { id: 'xl', size: 20 },
];

export function ScribbleModal({ isOpen, onClose, onSend }: ScribbleModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[2]); // Default red
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size);
  const [showPalette, setShowPalette] = useState(false);
  
  // History for undo
  const [history, setHistory] = useState<ImageData[]>([]);
  
  // Initialize canvas
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas resolution to match display size exactly to prevent scaling issues
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Save initial empty state
    saveState();
  }, [isOpen]);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory(prev => [...prev, imageData]);
  };

  const undo = () => {
    if (history.length <= 1) {
      clearCanvas();
      return;
    }
    
    const newHistory = [...history];
    newHistory.pop(); // Remove current state
    const previousState = newHistory[newHistory.length - 1];
    
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && previousState) {
      ctx.putImageData(previousState, 0, 0);
    }
    setHistory(newHistory);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Reset history to just the cleared state
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([imageData]);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Prevent scrolling on touch
    setIsDrawing(true);
    const pos = getCoordinates(e);
    if (!pos) return;
    
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    
    const pos = getCoordinates(e);
    if (!pos) return;
    
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Scale factor to map visual pixels to actual canvas coordinate space
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handleSend = () => {
    if (!canvasRef.current) return;
    
    canvasRef.current.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `scribble_${Date.now()}.png`, { type: 'image/png' });
        onSend(file);
        onClose();
      }
    }, 'image/png');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden border border-surface-border"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-surface-border">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Pen size={18} /> Scribble
            </h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={undo}
                disabled={history.length <= 1}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-full transition-colors disabled:opacity-50"
                title="Undo"
              >
                <Undo size={18} />
              </button>
              <button 
                onClick={clearCanvas}
                className="p-2 text-text-secondary hover:text-danger hover:bg-danger/10 rounded-full transition-colors"
                title="Clear"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={onClose}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-full transition-colors ml-2"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          
          {/* Canvas Area */}
          <div 
            ref={containerRef}
            className="w-full aspect-[4/5] bg-white relative cursor-crosshair touch-none"
          >
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="absolute inset-0 w-full h-full"
            />
          </div>
          
          {/* Tools Area */}
          <div className="p-4 border-t border-surface-border bg-surface flex flex-col gap-4">
            {/* Brush Size */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {BRUSH_SIZES.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => setBrushSize(size.size)}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                      brushSize === size.size ? "bg-primary/20" : "hover:bg-surface-hover"
                    )}
                  >
                    <div 
                      className="rounded-full bg-text-primary transition-all"
                      style={{ 
                        width: Math.max(4, size.size), 
                        height: Math.max(4, size.size) 
                      }} 
                    />
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => setShowPalette(!showPalette)}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors shadow-sm border border-surface-border"
                style={{ color }}
              >
                <Palette size={20} fill="currentColor" />
              </button>
            </div>
            
            {/* Color Palette */}
            <AnimatePresence>
              {showPalette && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-2 pt-2">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setColor(c);
                          setShowPalette(false);
                        }}
                        className={cn(
                          "w-8 h-8 rounded-full shadow-sm transition-transform hover:scale-110",
                          color === c && "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Send Button */}
            <button
              onClick={handleSend}
              className="w-full mt-2 bg-primary hover:bg-primary/90 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Send size={18} /> Send Scribble
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
