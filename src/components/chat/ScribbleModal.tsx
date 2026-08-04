import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Undo, Trash2, Send, Palette, Pen, Eraser, Highlighter, LayoutGrid, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScribbleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (file: File) => void;
}

const COLORS = [
  '#000000', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00',
  '#4cd964', '#5ac8fa', '#007aff', '#5856d6', '#ff2d55',
];

const BRUSH_SIZES = [
  { id: 'thin', size: 2 },
  { id: 'medium', size: 5 },
  { id: 'thick', size: 10 },
  { id: 'xl', size: 20 },
];

type ToolType = 'pen' | 'marker' | 'eraser';
type ThemeType = 'white' | 'dark' | 'ruled' | 'grid';

export function ScribbleModal({ isOpen, onClose, onSend }: ScribbleModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState(COLORS[2]); // Default red
  const [customColor, setCustomColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES[1].size);
  const [showPalette, setShowPalette] = useState(false);
  const [tool, setTool] = useState<ToolType>('pen');
  const [theme, setTheme] = useState<ThemeType>('white');
  
  // History for undo
  const [history, setHistory] = useState<ImageData[]>([]);
  
  // Initialize canvas
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas resolution to match display size exactly
    const rect = containerRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    // Clear canvas to transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
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
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Reset history
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([imageData]);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getCoordinates(e);
    if (!pos) return;
    
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = brushSize * 3;
      ctx.strokeStyle = '#000'; 
      ctx.globalAlpha = 1.0;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = tool === 'marker' ? brushSize * 2 : brushSize;
      ctx.globalAlpha = tool === 'marker' ? 0.4 : 1.0;
    }
    
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
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.globalAlpha = 1.0; // Reset alpha
        ctx.globalCompositeOperation = 'source-over';
      }
      saveState();
    }
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return null;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
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

  const drawBackgroundToCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Fill base color
    ctx.fillStyle = theme === 'dark' ? '#121212' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    if (theme === 'ruled') {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let y = 30; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (theme === 'grid') {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let x = 20; x < width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 20; y < height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
  };

  const handleSend = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Create temporary canvas for export
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    // Draw background
    drawBackgroundToCanvas(tempCtx, tempCanvas.width, tempCanvas.height);
    
    // Draw user drawing on top
    tempCtx.drawImage(canvas, 0, 0);
    
    tempCanvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `scribble_${Date.now()}.png`, { type: 'image/png' });
        onSend(file);
        onClose();
      }
    }, 'image/png');
  };

  // Determine CSS classes for background rendering
  const getThemeBackgroundClass = () => {
    switch (theme) {
      case 'dark': return 'bg-[#121212]';
      case 'ruled': return 'bg-white bg-[linear-gradient(transparent_29px,#e2e8f0_30px)] bg-[length:100%_30px]';
      case 'grid': return 'bg-white bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:20px_20px]';
      case 'white':
      default: return 'bg-white';
    }
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
              <Pen size={18} /> Board
            </h2>
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Theme selector */}
              <div className="flex bg-surface-hover rounded-lg p-1 mr-2">
                <button onClick={() => setTheme('white')} className={cn("p-1.5 rounded-md transition-colors", theme === 'white' ? "bg-surface shadow-sm" : "text-text-secondary hover:text-text-primary")} title="Whiteboard"><Square size={16} fill="white" className="text-gray-300" /></button>
                <button onClick={() => setTheme('dark')} className={cn("p-1.5 rounded-md transition-colors", theme === 'dark' ? "bg-surface shadow-sm" : "text-text-secondary hover:text-text-primary")} title="Blackboard"><Square size={16} fill="#121212" className="text-gray-700" /></button>
                <button onClick={() => setTheme('ruled')} className={cn("p-1.5 rounded-md transition-colors", theme === 'ruled' ? "bg-surface shadow-sm" : "text-text-secondary hover:text-text-primary")} title="Ruled"><LayoutGrid size={16} /></button>
                <button onClick={() => setTheme('grid')} className={cn("p-1.5 rounded-md transition-colors", theme === 'grid' ? "bg-surface shadow-sm" : "text-text-secondary hover:text-text-primary")} title="Grid"><LayoutGrid size={16} className="rotate-90" /></button>
              </div>

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
            className={cn("w-full aspect-[4/5] relative cursor-crosshair touch-none", getThemeBackgroundClass())}
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
            
            <div className="flex items-center justify-between gap-2">
              {/* Tool Selector */}
              <div className="flex items-center bg-surface-hover rounded-xl p-1 gap-1">
                <button
                  onClick={() => setTool('pen')}
                  className={cn("p-2 rounded-lg flex items-center transition-colors", tool === 'pen' ? "bg-surface shadow-sm text-primary" : "text-text-secondary hover:text-text-primary")}
                  title="Pen"
                >
                  <Pen size={18} />
                </button>
                <button
                  onClick={() => setTool('marker')}
                  className={cn("p-2 rounded-lg flex items-center transition-colors", tool === 'marker' ? "bg-surface shadow-sm text-primary" : "text-text-secondary hover:text-text-primary")}
                  title="Highlighter"
                >
                  <Highlighter size={18} />
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={cn("p-2 rounded-lg flex items-center transition-colors", tool === 'eraser' ? "bg-surface shadow-sm text-primary" : "text-text-secondary hover:text-text-primary")}
                  title="Eraser"
                >
                  <Eraser size={18} />
                </button>
              </div>

              {/* Brush Size */}
              <div className="flex items-center gap-1 sm:gap-2">
                {BRUSH_SIZES.map((size) => (
                  <button
                    key={size.id}
                    onClick={() => setBrushSize(size.size)}
                    className={cn(
                      "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all",
                      brushSize === size.size ? "bg-primary/20 ring-1 ring-primary/50" : "hover:bg-surface-hover"
                    )}
                  >
                    <div 
                      className="rounded-full bg-text-primary transition-all"
                      style={{ 
                        width: Math.max(3, size.size), 
                        height: Math.max(3, size.size),
                        opacity: tool === 'marker' ? 0.6 : 1.0
                      }} 
                    />
                  </button>
                ))}
              </div>
              
              {/* Color Palette Toggle */}
              <button
                onClick={() => {
                  if (tool === 'eraser') setTool('pen');
                  setShowPalette(!showPalette);
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-hover transition-colors shadow-sm border border-surface-border relative"
                style={{ color: tool === 'eraser' ? '#aaa' : color }}
              >
                <Palette size={20} fill="currentColor" />
              </button>
            </div>
            
            {/* Color Palette Panel */}
            <AnimatePresence>
              {showPalette && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-wrap gap-2 pt-2 items-center">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setColor(c);
                          if (tool === 'eraser') setTool('pen');
                          setShowPalette(false);
                        }}
                        className={cn(
                          "w-8 h-8 rounded-full shadow-sm transition-transform hover:scale-110",
                          color === c && tool !== 'eraser' && "ring-2 ring-primary ring-offset-2 ring-offset-surface"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    {/* Custom Color Picker */}
                    <div className="relative w-8 h-8 rounded-full overflow-hidden shadow-sm hover:scale-110 transition-transform">
                      <input 
                        type="color" 
                        value={customColor}
                        onChange={(e) => {
                          setCustomColor(e.target.value);
                          setColor(e.target.value);
                          if (tool === 'eraser') setTool('pen');
                        }}
                        className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
                        title="Custom Color"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Send Button */}
            <button
              onClick={handleSend}
              className="w-full mt-2 bg-primary hover:bg-primary/90 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Send size={18} /> Send
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
