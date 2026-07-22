'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { Instance } from 'simple-peer';
import { useCallStore } from '@/store/useCallStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Maximize, Minimize, SwitchCamera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

const VideoPlayer = ({ stream, isLocal = false, isVideoOff = false }: { stream: MediaStream; isLocal?: boolean, isVideoOff?: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} className={cn("w-full h-full object-cover", isVideoOff && "hidden")} />
      {isVideoOff && (
        <div className="w-full h-full flex items-center justify-center bg-surface">
          <VideoOff size={32} className="text-text-tertiary" />
        </div>
      )}
    </>
  );
};

export default function CallOverlay() {
  const { 
    isCalling, isReceivingCall, isInitiator, caller, callType, activeCallChatId, 
    localStream, remoteStreams, peers, callStartTime,
    setLocalStream, addRemoteStream, removeRemoteStream, addPeer, removePeer, acceptCall, endCall 
  } = useCallStore();
  
  const { socket, chats } = useChatStore();
  const { user: currentUser } = useAuthStore();

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }
  }, []);

  const startRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.currentTime = 0;
      const playPromise = ringtoneRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.error("Audio playback failed (Autoplay policy?):", err);
        });
      }
    }
  }, []);

  useEffect(() => {
    if ((isReceivingCall && !isCalling) || (isCalling && isInitiator && !callStartTime)) {
      startRingtone();
    } else {
      stopRingtone();
    }
    return stopRingtone;
  }, [isReceivingCall, isCalling, isInitiator, callStartTime, startRingtone, stopRingtone]);

  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallChatIdRef = useRef<string | null>(null);
  const callTypeRef = useRef<'AUDIO' | 'VIDEO' | null>(null);
  const peersRef = useRef<Record<string, Instance>>({});

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { activeCallChatIdRef.current = activeCallChatId; }, [activeCallChatId]);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);
  useEffect(() => { peersRef.current = peers; }, [peers]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStartTime && Object.keys(remoteStreams).length > 0) {
      interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - callStartTime) / 1000));
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(interval);
  }, [callStartTime, remoteStreams]);

  const createPeer = useCallback((targetUserId: string, stream: MediaStream, initiator: boolean, offerSignalData?: any) => {
    if (peersRef.current[targetUserId]) return peersRef.current[targetUserId];

    const peer = new Peer({
      initiator, trickle: true, stream,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });

    peer.on('signal', (data) => {
      if (!socket) return;
      if (data.type === 'offer' || data.type === 'answer') {
        const eventName = initiator ? 'call-offer' : 'call-answer';
        const payload = initiator
          ? { chatId: activeCallChatIdRef.current, targetUserId, signalData: data, type: callTypeRef.current }
          : { chatId: activeCallChatIdRef.current, targetUserId, signalData: data };
        socket.emit(eventName, payload);
      } else {
        socket.emit('ice-candidate', { chatId: activeCallChatIdRef.current, targetUserId, candidate: data });
      }
    });

    peer.on('stream', (remoteStream) => addRemoteStream(targetUserId, remoteStream));
    peer.on('close', () => { removePeer(targetUserId); removeRemoteStream(targetUserId); });
    
    if (!initiator && offerSignalData) peer.signal(offerSignalData);
    addPeer(targetUserId, peer);
    return peer;
  }, [socket, addRemoteStream, removePeer, removeRemoteStream, addPeer]);

  useEffect(() => {
    if (!socket) return;

    const handleCallOffer = async (data: any) => {
      const state = useCallStore.getState();
      if (state.isCalling && state.activeCallChatId === data.chatId && localStreamRef.current) {
        if (!peersRef.current[data.callerId]) createPeer(data.callerId, localStreamRef.current, false, data.signalData);
        return;
      }
      if (state.isCalling) return;
      useCallStore.getState().setIncomingCall(data.callerName || data.callerId, data.type, data.chatId, { ...data });
    };

    const handleCallAnswer = (data: any) => {
      const peer = peersRef.current[data.callerId];
      if (peer && !peer.destroyed) peer.signal(data.signalData);
    };

    const handleIceCandidate = (data: any) => {
      const peer = peersRef.current[data.callerId];
      if (peer && !peer.destroyed) peer.signal(data.candidate);
    };

    const handleCallEnd = (data: any) => {
      if (peersRef.current[data.callerId]) {
        peersRef.current[data.callerId].destroy();
        removePeer(data.callerId);
        removeRemoteStream(data.callerId);
      }
      if (Object.keys(peersRef.current).length === 0) endCall();
    };

    const handleGroupParticipants = (data: any) => {
      if (localStreamRef.current && data.chatId === activeCallChatIdRef.current) {
        data.participants.forEach((pId: string) => {
          if (pId !== currentUser?.id && !peersRef.current[pId]) {
            createPeer(pId, localStreamRef.current!, true);
          }
        });
      }
    };

    socket.on('call-offer', handleCallOffer);
    socket.on('call-answer', handleCallAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-end', handleCallEnd);
    socket.on('group-call-participants', handleGroupParticipants);

    return () => {
      socket.off('call-offer', handleCallOffer);
      socket.off('call-answer', handleCallAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-end', handleCallEnd);
      socket.off('group-call-participants', handleGroupParticipants);
    };
  }, [socket, createPeer, endCall, removePeer, removeRemoteStream, currentUser]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setIsMuted(!localStream.getAudioTracks()[0].enabled);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
      setIsVideoOff(!localStream.getVideoTracks()[0].enabled);
    }
  };

  const handleEndCall = () => {
    if (socket && activeCallChatId) {
      socket.emit('end-call', {
        chatId: activeCallChatId,
        duration: isReceivingCall && !isCalling ? -1 : elapsedSeconds,
        type: callType,
        isInitiator
      });
      if (activeChat?.isGroup) {
        socket.emit('group-call-leave', { chatId: activeCallChatId });
      }
    }
    stopRingtone();
    endCall();
  };

  const answerCall = async () => {
    const state = useCallStore.getState();
    if (!state.pendingOffer) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: state.callType === 'VIDEO', audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      acceptCall();
      createPeer(state.pendingOffer.callerId, stream, false, state.pendingOffer.signalData);
    } catch (err) {
      handleEndCall();
    }
  };

  useEffect(() => {
    if (isCalling && isInitiator && activeCallChatId && currentUser && Object.keys(peers).length === 0) {
      const startCall = async () => {
        try {
          if (!navigator.mediaDevices) {
            alert('Camera and Microphone access requires a secure connection (HTTPS) or localhost. Please test on localhost or configure HTTPS.');
            handleEndCall();
            return;
          }
          const stream = await navigator.mediaDevices.getUserMedia({ video: callType === 'VIDEO', audio: true });
          setLocalStream(stream);
          localStreamRef.current = stream;
          const chat = chats.find(c => c.id === activeCallChatId);
          if (chat) {
            if (chat.isGroup) socket?.emit('group-call-join', { chatId: activeCallChatId });
            chat.participants?.forEach((p: any) => {
              if (p.userId !== currentUser.id) createPeer(p.userId, stream, true);
            });
          }
        } catch (err) { 
          console.error('Failed to start call', err);
          alert('Failed to access camera/microphone. Please ensure permissions are granted.');
          handleEndCall(); 
        }
      };
      startCall();
    }
  }, [isCalling, isInitiator, activeCallChatId, currentUser]);

  if (!isCalling && !isReceivingCall) return null;

  const remoteStreamEntries = Object.entries(remoteStreams);
  const activeChat = chats.find(c => c.id === activeCallChatId);
  const getCallAvatar = () => {
    if (activeChat?.isGroup) return (activeChat as any).groupPicture || null;
    const other = activeChat?.participants?.find((p: any) => p.userId !== currentUser?.id);
    return (other as any)?.user?.profilePicture || null;
  };
  const getCallName = () => {
    if (activeChat?.isGroup) return activeChat.name || 'Group Call';
    const other = activeChat?.participants?.find((p: any) => p.userId !== currentUser?.id);
    return (other as any)?.user?.name || (other as any)?.user?.phoneNumber || caller || 'Unknown';
  };

  const switchCamera = async () => {
    if (callType !== 'VIDEO') return;
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: newMode }, 
        audio: !isMuted 
      });
      const videoTrack = stream.getVideoTracks()[0];
      
      // Update peers
      Object.values(peers).forEach(peer => {
        const oldTrack = localStream?.getVideoTracks()[0];
        if (oldTrack && peer.streams[0]) {
          peer.replaceTrack(oldTrack, videoTrack, peer.streams[0]);
        }
      });
      
      // Update local stream state
      setLocalStream(stream);
      localStreamRef.current = stream;
    } catch(err) {
      console.error('Failed to switch camera', err);
      setFacingMode(facingMode);
    }
  };
  const callAvatar = getCallAvatar();
  const callDisplayName = getCallName();

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col items-center justify-center"
      >
        <audio ref={ringtoneRef} src="/ringtone.mp3" loop style={{ display: 'none' }} />
        
        {isReceivingCall && !isCalling && (
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="glass-panel p-10 rounded-[32px] flex flex-col items-center space-y-10 shadow-2xl min-w-[320px]"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
              <div className="w-28 h-28 bg-surface rounded-full flex items-center justify-center shadow-2xl overflow-hidden relative z-10 border-2 border-primary">
                {callAvatar ? <img src={callAvatar} alt="" className="w-full h-full object-cover" /> : callType === 'VIDEO' ? <Video size={40} className="text-white" /> : <Phone size={40} className="text-white" />}
              </div>
            </div>
            
            <div className="text-center">
              <h2 className="text-3xl font-semibold text-text-primary tracking-tight mb-2">{callDisplayName}</h2>
              <p className="text-primary font-medium">Incoming {callType?.toLowerCase()} call</p>
            </div>
            
            <div className="flex space-x-8 w-full justify-center pt-4">
              <Button size="icon" onClick={handleEndCall} className="w-16 h-16 bg-danger hover:bg-danger/90 rounded-full shadow-[0_0_20px_rgba(255,69,58,0.3)]">
                <PhoneOff size={28} />
              </Button>
              <Button size="icon" onClick={answerCall} className="w-16 h-16 bg-success hover:bg-success/90 rounded-full shadow-[0_0_20px_rgba(48,209,88,0.3)] animate-bounce">
                <Phone size={28} />
              </Button>
            </div>
          </motion.div>
        )}

        {isCalling && (
          <div className={cn("w-full h-full flex flex-col transition-all duration-300", isFullScreen ? "p-0" : "p-4 max-w-6xl max-h-[850px]")}>
            
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 glass px-6 py-2 rounded-full shadow-2xl flex flex-col items-center">
              <span className="text-white/90 text-sm font-medium">{callDisplayName}</span>
              <span className="text-primary font-mono text-lg tracking-wider font-semibold">
                {remoteStreamEntries.length > 0 ? `${Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}` : 'Calling...'}
              </span>
            </div>

            <div className={cn("flex-1 relative bg-black overflow-hidden shadow-2xl flex", isFullScreen ? "rounded-none border-none" : "rounded-3xl border border-surface-border mt-16")}>
              
              <button 
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="absolute top-4 right-4 z-20 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white/80 transition-colors backdrop-blur-md"
              >
                {isFullScreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>

              {callType === 'VIDEO' ? (
                <>
                  {remoteStreamEntries.length > 0 ? (
                    <div className={cn("w-full h-full grid gap-1 p-1 bg-surface", remoteStreamEntries.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                      {remoteStreamEntries.map(([userId, stream]) => (
                        <div key={userId} className="relative w-full h-full bg-black rounded-2xl overflow-hidden border border-white/5">
                          <VideoPlayer stream={stream} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-text-secondary bg-surface-hover">
                      <div className="w-24 h-24 bg-surface rounded-full mb-6 border border-surface-border overflow-hidden p-1 shadow-inner flex items-center justify-center">
                        {callAvatar ? <img src={callAvatar} className="w-full h-full rounded-full object-cover" /> : <Video size={32} />}
                      </div>
                      <p className="animate-pulse">Connecting video...</p>
                    </div>
                  )}

                  {localStream && (
                    <motion.div 
                      drag dragConstraints={{ top: 10, right: 10, bottom: 10, left: 10 }}
                      className="absolute bottom-24 right-6 w-32 h-48 bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 z-20 cursor-move"
                    >
                      <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} />
                    </motion.div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-surface-hover relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
                  
                  <div className="relative mb-16">
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping scale-150" />
                    <div className="w-40 h-40 bg-surface rounded-full shadow-2xl overflow-hidden border-[4px] border-primary/40 relative z-10 flex items-center justify-center">
                       {callAvatar ? <img src={callAvatar} className="w-full h-full object-cover" /> : <span className="text-6xl text-text-secondary">{callDisplayName.charAt(0)}</span>}
                    </div>
                  </div>
                </div>
              )}

              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 glass px-8 py-4 rounded-full flex items-center space-x-6 z-30 shadow-2xl">
                <Button size="icon" onClick={toggleMute} variant={isMuted ? "secondary" : "ghost"} className={cn("w-12 h-12 rounded-full", isMuted ? "bg-white/20 text-white" : "bg-transparent text-white/80 hover:bg-white/10")}>
                  {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                </Button>
                
                {callType === 'VIDEO' && (
                  <>
                    <Button size="icon" onClick={toggleVideo} variant={isVideoOff ? "secondary" : "ghost"} className={cn("w-12 h-12 rounded-full", isVideoOff ? "bg-white/20 text-white" : "bg-transparent text-white/80 hover:bg-white/10")}>
                      {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-14 w-14 rounded-full bg-surface/20 text-white hover:bg-surface/30 border border-white/10" onClick={switchCamera}>
                      <SwitchCamera size={24} />
                    </Button>
                  </>
                )}
                
                <Button size="icon" onClick={handleEndCall} className="w-14 h-14 bg-danger hover:bg-danger/90 rounded-full shadow-[0_0_15px_rgba(255,69,58,0.4)] ml-2">
                  <PhoneOff size={24} />
                </Button>
              </div>
            </div>
          </div>
        )}
        <audio 
          ref={ringtoneRef} 
          src="/iphone-6-ringtone-qoybaffhmm2az4wnaazaqcsw8dg411-28159.mp3" 
          loop 
          autoPlay={((isReceivingCall && !isCalling) || (isCalling && isInitiator && !callStartTime)) ? true : false}
        />
      </motion.div>
    </AnimatePresence>
  );
}
