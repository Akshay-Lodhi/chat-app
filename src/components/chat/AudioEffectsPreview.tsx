import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Send, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AudioEffectType = 'normal' | 'robot' | 'telephone' | 'radio' | 'cave' | 'hall' | 'megaphone' | 'bass' | 'treble' | 'vintage';

interface AudioEffectsPreviewProps {
  blob: Blob;
  onSend: (processedBlob: Blob) => void;
  onCancel: () => void;
}

const EFFECTS: { id: AudioEffectType; label: string; icon: string }[] = [
  { id: 'normal', label: 'Normal', icon: '🎤' },
  { id: 'robot', label: 'Robot', icon: '🤖' },
  { id: 'telephone', label: 'Phone', icon: '📞' },
  { id: 'radio', label: 'Radio', icon: '📻' },
  { id: 'megaphone', label: 'Megaphone', icon: '📢' },
  { id: 'cave', label: 'Cave', icon: '🦇' },
  { id: 'hall', label: 'Hall', icon: '🏛️' },
  { id: 'bass', label: 'Bass Boost', icon: '🔊' },
  { id: 'treble', label: 'Treble Boost', icon: '🎼' },
  { id: 'vintage', label: 'Vintage', icon: '🎙️' },
];

export function AudioEffectsPreview({ blob, onSend, onCancel }: AudioEffectsPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeEffect, setActiveEffect] = useState<AudioEffectType>('normal');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  
  const [duration, setDuration] = useState(0);

  // Initialize AudioContext and decode blob
  useEffect(() => {
    const initAudio = async () => {
      const arrayBuffer = await blob.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      audioBufferRef.current = buffer;
      setDuration(buffer.duration);
    };
    initAudio();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [blob]);

  const applyNodes = (ctx: BaseAudioContext, source: AudioBufferSourceNode, effect: AudioEffectType) => {
    const nodes: AudioNode[] = [];
    
    switch (effect) {
      case 'robot':
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 50;
        const gainNode = ctx.createGain();
        osc.connect(gainNode.gain);
        source.connect(gainNode);
        nodes.push(gainNode);
        osc.start();
        break;
      case 'telephone':
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 400;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 3400;
        source.connect(hp);
        hp.connect(lp);
        nodes.push(hp, lp);
        break;
      case 'radio':
        const radioHp = ctx.createBiquadFilter();
        radioHp.type = 'highpass';
        radioHp.frequency.value = 800;
        const radioLp = ctx.createBiquadFilter();
        radioLp.type = 'lowpass';
        radioLp.frequency.value = 2500;
        const distortion = ctx.createWaveShaper();
        distortion.curve = makeDistortionCurve(10);
        source.connect(radioHp);
        radioHp.connect(distortion);
        distortion.connect(radioLp);
        nodes.push(radioHp, distortion, radioLp);
        break;
      case 'megaphone':
        const megaHp = ctx.createBiquadFilter();
        megaHp.type = 'highpass';
        megaHp.frequency.value = 1000;
        const megaLp = ctx.createBiquadFilter();
        megaLp.type = 'lowpass';
        megaLp.frequency.value = 3000;
        const megaDist = ctx.createWaveShaper();
        megaDist.curve = makeDistortionCurve(50);
        source.connect(megaHp);
        megaHp.connect(megaDist);
        megaDist.connect(megaLp);
        nodes.push(megaHp, megaDist, megaLp);
        break;
      case 'cave':
        const caveDelay = ctx.createDelay();
        caveDelay.delayTime.value = 0.4;
        const caveFeedback = ctx.createGain();
        caveFeedback.gain.value = 0.6;
        source.connect(caveDelay);
        caveDelay.connect(caveFeedback);
        caveFeedback.connect(caveDelay);
        nodes.push(caveDelay, caveFeedback);
        break;
      case 'hall':
        const hallDelay = ctx.createDelay();
        hallDelay.delayTime.value = 0.15;
        const hallFeedback = ctx.createGain();
        hallFeedback.gain.value = 0.3;
        source.connect(hallDelay);
        hallDelay.connect(hallFeedback);
        hallFeedback.connect(hallDelay);
        nodes.push(hallDelay, hallFeedback);
        break;
      case 'bass':
        const bassFilter = ctx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 200;
        bassFilter.gain.value = 15;
        source.connect(bassFilter);
        nodes.push(bassFilter);
        break;
      case 'treble':
        const trebleFilter = ctx.createBiquadFilter();
        trebleFilter.type = 'highshelf';
        trebleFilter.frequency.value = 3000;
        trebleFilter.gain.value = 15;
        source.connect(trebleFilter);
        nodes.push(trebleFilter);
        break;
      case 'vintage':
        const vinLp = ctx.createBiquadFilter();
        vinLp.type = 'lowpass';
        vinLp.frequency.value = 4000;
        const vinDist = ctx.createWaveShaper();
        vinDist.curve = makeDistortionCurve(5);
        source.connect(vinLp);
        vinLp.connect(vinDist);
        nodes.push(vinLp, vinDist);
        break;
      case 'normal':
      default:
        break;
    }
    
    if (nodes.length > 0) {
      nodes[nodes.length - 1].connect(ctx.destination);
    } else {
      source.connect(ctx.destination);
    }
    
    return nodes;
  };

  const makeDistortionCurve = (amount: number) => {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = i * 2 / n_samples - 1;
      curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
  };

  const togglePlay = () => {
    if (!audioContextRef.current || !audioBufferRef.current) return;
    
    if (isPlaying) {
      sourceNodeRef.current?.stop();
      setIsPlaying(false);
    } else {
      const ctx = audioContextRef.current;
      const source = ctx.createBufferSource();
      source.buffer = audioBufferRef.current;
      
      applyNodes(ctx, source, activeEffect);
      
      source.onended = () => setIsPlaying(false);
      source.start();
      sourceNodeRef.current = source;
      setIsPlaying(true);
    }
  };
  
  const processAndSend = async () => {
    setIsProcessing(true);
    try {
      if (activeEffect === 'normal') {
        onSend(blob);
        return;
      }
      
      if (!audioBufferRef.current) return;
      
      const buffer = audioBufferRef.current;
      const offlineCtx = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
      );
      
      const source = offlineCtx.createBufferSource();
      source.buffer = buffer;
      
      applyNodes(offlineCtx, source, activeEffect);
      source.start();
      
      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWav(renderedBuffer);
      onSend(wavBlob);
    } catch (e) {
      console.error(e);
      onSend(blob); // fallback
    } finally {
      setIsProcessing(false);
    }
  };

  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const result = new ArrayBuffer(length);
    const view = new DataView(result);
    const channels = [];
    let sample = 0;
    let offset = 0;
    let pos = 0;

    const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };
    const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };

    setUint32(0x46464952);
    setUint32(length - 8);
    setUint32(0x45564157);
    setUint32(0x20746d66);
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    setUint32(0x61746164);
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([result], { type: 'audio/wav' });
  };

  return (
    <div className="bg-surface p-4 rounded-t-2xl sm:rounded-2xl border border-surface-border shadow-lg flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">Audio Effects</h3>
        <button onClick={onCancel} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-text-secondary">
          <X size={20} />
        </button>
      </div>

      <div className="flex items-center gap-3 bg-black/20 p-3 rounded-xl border border-white/5">
        <button 
          onClick={togglePlay}
          className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white shrink-0 hover:scale-105 transition-transform"
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
        </button>
        
        <div className="flex-1 flex items-center h-8 gap-0.5 opacity-80 overflow-hidden">
          {Array.from({ length: 40 }).map((_, i) => (
            <div 
              key={i} 
              className="w-1 bg-primary/70 rounded-full" 
              style={{ height: `${Math.max(10, Math.sin(i * 0.5) * 100)}%`, opacity: i < (isPlaying ? 20 : 0) ? 1 : 0.4 }} 
            />
          ))}
        </div>
        
        <span className="text-xs font-medium font-mono opacity-80 shrink-0">
          {Math.floor(duration / 60)}:{(Math.floor(duration % 60)).toString().padStart(2, '0')}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-2 px-2 mask-edges">
        {EFFECTS.map((effect) => (
          <button
            key={effect.id}
            onClick={() => {
              setActiveEffect(effect.id);
              if (isPlaying) {
                sourceNodeRef.current?.stop();
                setIsPlaying(false);
              }
            }}
            className={cn(
              "flex flex-col items-center gap-1.5 p-3 rounded-xl border min-w-[72px] transition-all",
              activeEffect === effect.id 
                ? "bg-primary/20 border-primary text-primary" 
                : "bg-surface-hover border-transparent text-text-secondary hover:bg-white/10"
            )}
          >
            <span className="text-xl leading-none">{effect.icon}</span>
            <span className="text-[10px] font-medium tracking-wide truncate w-full text-center">{effect.label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={processAndSend}
        disabled={isProcessing}
        className="w-full mt-2 bg-primary hover:bg-primary/90 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Processing...
          </>
        ) : (
          <>
            <Send size={18} /> Send Voice Note
          </>
        )}
      </button>
    </div>
  );
}
