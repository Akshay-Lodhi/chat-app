import { useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/apiClient';

interface UseRecordingProps {
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  callType: 'AUDIO' | 'VIDEO' | null;
}

export function useRecording({ localStream, remoteStreams, callType }: UseRecordingProps) {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(() => {
    if (!localStream) {
      toast.error('Cannot start recording without a stream');
      return;
    }

    try {
      chunksRef.current = [];
      const isVideo = callType === 'VIDEO';

      // Setup Audio Context for mixing
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioCtx;
      audioCtx.resume();
      const destination = audioCtx.createMediaStreamDestination();

      const connectStreamToAudio = (stream: MediaStream) => {
        if (stream.getAudioTracks().length > 0) {
          const source = audioCtx.createMediaStreamSource(new MediaStream([stream.getAudioTracks()[0]]));
          source.connect(destination);
        }
      };

      connectStreamToAudio(localStream);
      Object.values(remoteStreams).forEach(connectStreamToAudio);

      let finalStream: MediaStream;

      if (isVideo) {
        // Setup Canvas for Video Mixing
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Canvas 2D context not available');
        }

        const videoElements: HTMLVideoElement[] = [];

        const createVideoEl = (stream: MediaStream) => {
          if (stream.getVideoTracks().length > 0) {
            const video = document.createElement('video');
            video.srcObject = new MediaStream([stream.getVideoTracks()[0]]);
            video.autoplay = true;
            video.muted = true;
            video.play().catch(() => {});
            videoElements.push(video);
          }
        };

        createVideoEl(localStream);
        Object.values(remoteStreams).forEach(createVideoEl);

        const drawCanvas = () => {
          if (!canvasRef.current || !ctx) return;
          
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          const numVideos = videoElements.length;
          if (numVideos === 1) {
            ctx.drawImage(videoElements[0], 0, 0, canvas.width, canvas.height);
          } else if (numVideos === 2) {
            ctx.drawImage(videoElements[0], 0, 180, 640, 360);
            ctx.drawImage(videoElements[1], 640, 180, 640, 360);
          } else if (numVideos > 2) {
            // Simple grid for more videos
            const cols = Math.ceil(Math.sqrt(numVideos));
            const rows = Math.ceil(numVideos / cols);
            const w = canvas.width / cols;
            const h = canvas.height / rows;

            videoElements.forEach((video, i) => {
              const x = (i % cols) * w;
              const y = Math.floor(i / cols) * h;
              ctx.drawImage(video, x, y, w, h);
            });
          }

          animationFrameRef.current = requestAnimationFrame(drawCanvas);
        };

        drawCanvas();

        const canvasStream = canvas.captureStream(30); // 30 FPS
        
        finalStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...destination.stream.getAudioTracks()
        ]);
      } else {
        finalStream = destination.stream;
      }

      const options = { mimeType: isVideo ? 'video/webm; codecs=vp8,opus' : 'audio/webm' };
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(finalStream, options);
      } catch (e) {
        recorder = new MediaRecorder(finalStream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
        }
        canvasRef.current = null;

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        
        // Upload the blob
        await uploadRecording(blob, isVideo ? 'VIDEO' : 'AUDIO');
      };

      recorder.start(1000); // Capture chunks every second
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setIsRecording(true);
      toast.success('Recording started');

    } catch (err) {
      console.error('Error starting recording:', err);
      toast.error('Failed to start recording');
    }
  }, [localStream, remoteStreams, callType]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success('Recording stopped. Saving...');
    }
  }, []);

  const uploadRecording = async (blob: Blob, type: 'AUDIO' | 'VIDEO') => {
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const formData = new FormData();
    formData.append('file', blob, `recording.${type === 'VIDEO' ? 'webm' : 'webm'}`);
    formData.append('type', type);
    formData.append('duration', duration.toString());

    try {
      const response = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/recordings`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to upload recording');
      }

      toast.success('Recording saved successfully!');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to save recording to server.');
    }
  };

  return {
    isRecording,
    startRecording,
    stopRecording
  };
}
