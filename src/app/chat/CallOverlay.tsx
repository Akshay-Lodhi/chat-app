'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Peer, { Instance } from 'simple-peer';
import { useCallStore } from '@/store/useCallStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Maximize2, Minimize2, SwitchCamera, X, UserPlus, Check, Users, Lock, ChevronDown, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

const AudioPlayer = ({ stream }: { stream: MediaStream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let isMounted = true;
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          if (err.name !== 'AbortError' && isMounted) {
            console.error("Audio playback error:", err);
          }
        });
      }
    }
    return () => { isMounted = false; };
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline className="hidden" />;
};

const VideoPlayer = ({ stream, isLocal = false, isVideoOff = false }: { stream: MediaStream; isLocal?: boolean, isVideoOff?: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let isMounted = true;
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          if (err.name !== 'AbortError' && isMounted) {
            console.error("Video play error:", err);
          }
        });
      }
    }
    return () => { isMounted = false; };
  }, [stream]);
  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} className={cn("w-full h-full object-cover", isVideoOff && "hidden")} />
      {isVideoOff && (
        <div className="w-full h-full flex items-center justify-center bg-[#1a2730]">
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
  const [isPIP, setIsPIP] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [invitedUserIds, setInvitedUserIds] = useState<string[]>([]);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceCandidatesRef = useRef<Record<string, any[]>>({});

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
          if (err.name !== 'AbortError') {
            console.error("Audio playback failed:", err);
          }
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
      initiator, 
      trickle: true, 
      stream,
      config: { 
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ] 
      }
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

    peer.on('stream', (remoteStream) => {
      addRemoteStream(targetUserId, remoteStream);
    });

    peer.on('close', () => { 
      removePeer(targetUserId); 
      removeRemoteStream(targetUserId); 
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
    });
    
    if (!initiator && offerSignalData) {
      peer.signal(offerSignalData);
    }

    // Flush buffered ICE candidates
    if (pendingIceCandidatesRef.current[targetUserId]) {
      pendingIceCandidatesRef.current[targetUserId].forEach(cand => {
        try { peer.signal(cand); } catch(e) {}
      });
      delete pendingIceCandidatesRef.current[targetUserId];
    }

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
      if (peer && !peer.destroyed) {
        try { peer.signal(data.candidate); } catch(e) {}
      } else {
        if (!pendingIceCandidatesRef.current[data.callerId]) {
          pendingIceCandidatesRef.current[data.callerId] = [];
        }
        pendingIceCandidatesRef.current[data.callerId].push(data.candidate);
      }
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

    const handleGroupUserJoined = (data: any) => {
      if (localStreamRef.current && data.chatId === activeCallChatIdRef.current) {
        if (data.userId !== currentUser?.id && !peersRef.current[data.userId]) {
          createPeer(data.userId, localStreamRef.current!, true);
        }
      }
    };

    const handleGroupUserLeft = (data: any) => {
      if (data.chatId === activeCallChatIdRef.current && peersRef.current[data.userId]) {
        peersRef.current[data.userId].destroy();
        removePeer(data.userId);
        removeRemoteStream(data.userId);
      }
    };

    socket.on('call-offer', handleCallOffer);
    socket.on('call-answer', handleCallAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-end', handleCallEnd);
    socket.on('group-call-participants', handleGroupParticipants);
    socket.on('group-call-user-joined', handleGroupUserJoined);
    socket.on('group-call-user-left', handleGroupUserLeft);

    return () => {
      socket.off('call-offer', handleCallOffer);
      socket.off('call-answer', handleCallAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-end', handleCallEnd);
      socket.off('group-call-participants', handleGroupParticipants);
      socket.off('group-call-user-joined', handleGroupUserJoined);
      socket.off('group-call-user-left', handleGroupUserLeft);
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
      const isMulti = Boolean((activeChat?.isGroup) || (Object.keys(remoteStreams).length > 1) || (invitedUserIds.length > 1));
      
      const participantsInfo = allCallParticipants.map(p => ({
        userId: p.userId,
        name: p.name,
        avatar: p.avatar,
        status: p.stream ? 'JOINED' : 'INVITED'
      }));

      socket.emit('end-call', {
        chatId: activeCallChatId,
        duration: isReceivingCall && !isCalling ? -1 : elapsedSeconds,
        type: callType,
        isInitiator,
        isGroup: isMulti,
        participantsInfo
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
      const constraints = {
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: state.callType === 'VIDEO' ? { facingMode: 'user' } : false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      localStreamRef.current = stream;
      acceptCall();
      createPeer(state.pendingOffer.callerId, stream, false, state.pendingOffer.signalData);
    } catch (err) {
      console.error("Failed to answer call:", err);
      handleEndCall();
    }
  };

  useEffect(() => {
    if (isCalling && isInitiator && activeCallChatId && currentUser && Object.keys(peers).length === 0) {
      const startCall = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Camera and Microphone access requires a secure connection (HTTPS) or localhost.');
            handleEndCall();
            return;
          }
          const constraints = {
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: callType === 'VIDEO' ? { facingMode: 'user' } : false
          };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
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

  const switchCamera = async () => {
    if (callType !== 'VIDEO' || !localStreamRef.current) return;
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    
    try {
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: newMode } }
      });
      const newVideoTrack = newStream.getVideoTracks()[0];

      if (oldVideoTrack) {
        Object.values(peersRef.current).forEach(peer => {
          try {
            if (!peer.destroyed && peer.streams[0]) {
              peer.replaceTrack(oldVideoTrack, newVideoTrack, peer.streams[0]);
            }
          } catch(e) {
            console.error('Track replacement error:', e);
          }
        });

        oldVideoTrack.stop();
        localStreamRef.current.removeTrack(oldVideoTrack);
      }

      localStreamRef.current.addTrack(newVideoTrack);
      setFacingMode(newMode);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    } catch(err) {
      console.error('Failed to switch camera', err);
    }
  };

  const remoteStreamEntries = Object.entries(remoteStreams);
  const activeChat = chats.find(c => c.id === activeCallChatId);
  const isGroupCall = Boolean((activeChat?.isGroup) || (remoteStreamEntries.length > 1) || (invitedUserIds.length > 1));

  // Complete List of All Participants in the Group/Multi Call (hook must be called unconditionally)
  const allCallParticipants = useMemo(() => {
    const list: Array<{ userId: string; name: string; avatar?: string | null; stream?: MediaStream | null; isConnecting?: boolean }> = [];
    const addedIds = new Set<string>();

    if (activeChat?.isGroup) {
      activeChat.participants?.forEach((p: any) => {
        if (p.userId !== currentUser?.id) {
          const stream = remoteStreams[p.userId] || null;
          addedIds.add(p.userId);
          list.push({
            userId: p.userId,
            name: p.user?.name || p.user?.phoneNumber || 'Group Member',
            avatar: p.user?.profilePicture || null,
            stream,
            isConnecting: !stream
          });
        }
      });
    }

    // Add any connected remote streams not in group participants
    Object.keys(remoteStreams).forEach((uId) => {
      if (!addedIds.has(uId)) {
        addedIds.add(uId);
        const pUser = chats.flatMap(c => c.participants || []).find((p: any) => p.userId === uId)?.user;
        list.push({
          userId: uId,
          name: pUser?.name || pUser?.phoneNumber || 'Contact',
          avatar: pUser?.profilePicture || null,
          stream: remoteStreams[uId],
          isConnecting: false
        });
      }
    });

    // Add invited users if not yet connected
    invitedUserIds.forEach((uId) => {
      if (!addedIds.has(uId)) {
        addedIds.add(uId);
        const pUser = chats.flatMap(c => c.participants || []).find((p: any) => p.userId === uId)?.user;
        list.push({
          userId: uId,
          name: pUser?.name || pUser?.phoneNumber || 'Invited User',
          avatar: pUser?.profilePicture || null,
          stream: null,
          isConnecting: true
        });
      }
    });

    return list;
  }, [activeChat, currentUser, remoteStreams, invitedUserIds, chats]);

  if (!isCalling && !isReceivingCall) return null;

  const getCallAvatar = () => {
    if (isGroupCall && activeChat?.isGroup) return (activeChat as any).groupPicture || null;
    const other = activeChat?.participants?.find((p: any) => p.userId !== currentUser?.id);
    return (other as any)?.user?.profilePicture || null;
  };
  const getCallName = () => {
    if (activeChat?.isGroup) return activeChat.name || 'Group Call';
    if (isGroupCall) return 'Group Call';
    const other = activeChat?.participants?.find((p: any) => p.userId !== currentUser?.id);
    return (other as any)?.user?.name || (other as any)?.user?.phoneNumber || caller || 'Unknown';
  };

  const callAvatar = getCallAvatar();
  const callDisplayName = getCallName();
  const isConnected = remoteStreamEntries.length > 0;
  const timerDisplay = `${Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}`;

  // ─── PIP (Picture-in-Picture) Mode ───
  if (isPIP && isCalling) {
    return (
      <motion.div
        drag
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-24 right-4 z-[200] w-[160px] h-[220px] rounded-2xl overflow-hidden shadow-2xl border-2 border-primary/40 cursor-move bg-black"
        style={{ touchAction: 'none' }}
      >
        {/* Remote Video or Avatar */}
        {callType === 'VIDEO' && isConnected ? (
          <div className="w-full h-full relative">
            <VideoPlayer stream={remoteStreamEntries[0][1]} />
            {/* Mini local video */}
            {localStream && (
              <div className="absolute top-2 right-2 w-12 h-16 rounded-lg overflow-hidden border border-white/20 shadow-lg">
                <VideoPlayer stream={localStream} isLocal isVideoOff={isVideoOff} />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2730] to-[#0b141a]">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-primary/40 mb-2 flex items-center justify-center bg-surface">
              {callAvatar ? <img src={callAvatar} className="w-full h-full object-cover" /> : <span className="text-xl text-text-secondary">{callDisplayName.charAt(0)}</span>}
            </div>
            <p className="text-white text-xs font-medium truncate max-w-[140px] px-2">{callDisplayName}</p>
          </div>
        )}

        {/* PIP bottom bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm flex items-center justify-between px-3 py-2">
          <span className="text-white/80 text-[10px] font-mono">{isConnected ? timerDisplay : '...'}</span>
          <div className="flex items-center space-x-2">
            <button onClick={() => setIsPIP(false)} className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Maximize2 size={14} />
            </button>
            <button onClick={handleEndCall} className="p-1 rounded-full bg-danger hover:bg-danger/80 text-white transition-colors">
              <PhoneOff size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ─── Full-Screen Mode ───
  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-[#0b141a] flex flex-col"
      >
        <audio 
          ref={ringtoneRef} 
          src="/iphone-6-ringtone-qoybaffhmm2az4wnaazaqcsw8dg411-28159.mp3" 
          loop 
          autoPlay={((isReceivingCall && !isCalling) || (isCalling && isInitiator && !callStartTime)) ? true : false}
        />

        {/* Remote audio playback */}
        {remoteStreamEntries.map(([uId, s]) => (
          <AudioPlayer key={uId} stream={s} />
        ))}
        
        {/* ─── Incoming Call Screen ─── */}
        {isReceivingCall && !isCalling && (
          <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-b from-[#005c4b]/30 via-[#0b141a] to-[#0b141a] relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-80 h-80 rounded-full border border-primary/10 animate-ping" style={{ animationDuration: '3s' }} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-60 h-60 rounded-full border border-primary/5 animate-ping" style={{ animationDuration: '2s' }} />
            </div>

            <div className="relative z-10 flex flex-col items-center space-y-8">
              <div className="relative">
                <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary/30 shadow-[0_0_60px_rgba(0,168,132,0.2)]">
                  {callAvatar ? (
                    <img src={callAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-surface flex items-center justify-center">
                      <span className="text-5xl text-text-secondary">{callDisplayName.charAt(0)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center">
                {isGroupCall && (
                  <span className="bg-primary/20 text-primary text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">
                    Group {callType === 'VIDEO' ? 'Video' : 'Voice'} Call
                  </span>
                )}
                <h2 className="text-2xl font-semibold text-white mb-2">{callDisplayName}</h2>
                <p className="text-primary/90 text-sm font-medium animate-pulse">
                  {callType === 'VIDEO' ? 'Incoming WhatsApp video call...' : 'Incoming WhatsApp voice call...'}
                </p>
              </div>

              <p className="text-text-tertiary text-xs mt-8">Swipe up to answer</p>

              <div className="flex items-center space-x-12 mt-4">
                <div className="flex flex-col items-center space-y-2">
                  <Button size="icon" onClick={handleEndCall} className="w-16 h-16 bg-danger hover:bg-danger/90 rounded-full shadow-[0_0_30px_rgba(234,0,56,0.3)]">
                    <PhoneOff size={28} />
                  </Button>
                  <span className="text-xs text-text-secondary">Decline</span>
                </div>
                <div className="flex flex-col items-center space-y-2">
                  <Button size="icon" onClick={answerCall} className="w-16 h-16 bg-success hover:bg-success/90 rounded-full shadow-[0_0_30px_rgba(48,209,88,0.3)] animate-bounce">
                    <Phone size={28} />
                  </Button>
                  <span className="text-xs text-text-secondary">Accept</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Active Call Screen (WhatsApp Mobile Style) ─── */}
        {isCalling && (
          <div className="flex-1 flex flex-col relative bg-[#0b141a]">
            
            {/* Top Bar Header */}
            <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/90 via-black/50 to-transparent p-4 pt-6">
              <div className="flex items-center justify-between">
                <button onClick={() => setIsPIP(true)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm cursor-pointer">
                  <ChevronDown size={22} />
                </button>
                
                <div className="flex items-center space-x-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                  <Lock size={12} className="text-emerald-400" />
                  <span className="text-xs text-white/90 font-medium">End-to-end encrypted</span>
                </div>

                <button onClick={() => setShowAddParticipant(true)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm cursor-pointer">
                  <UserPlus size={20} />
                </button>
              </div>
            </div>

            {/* Main Grid Content Area */}
            <div ref={videoContainerRef} className="flex-1 relative pt-16 pb-32 px-3 overflow-hidden flex items-center justify-center">
              {allCallParticipants.length > 0 ? (
                /* Participant Tiles Grid */
                <div className={cn(
                  "w-full h-full grid gap-2.5 max-w-4xl mx-auto",
                  allCallParticipants.length === 1 && "grid-cols-1 grid-rows-1",
                  allCallParticipants.length === 2 && "grid-cols-1 sm:grid-cols-2 grid-rows-2 sm:grid-rows-1",
                  (allCallParticipants.length === 3 || allCallParticipants.length === 4) && "grid-cols-2 grid-rows-2",
                  allCallParticipants.length > 4 && "grid-cols-2 sm:grid-cols-3 overflow-y-auto"
                )}>
                  {allCallParticipants.map((item) => (
                    <div key={item.userId} className="relative w-full h-full bg-[#1f2c34] rounded-2xl overflow-hidden border border-white/10 shadow-lg flex items-center justify-center min-h-[160px]">
                      {/* Video Player or Profile Picture Avatar */}
                      {callType === 'VIDEO' && item.stream ? (
                        <VideoPlayer stream={item.stream} />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2730] to-[#0b141a]">
                          <div className={cn(
                            "w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 shadow-xl flex items-center justify-center bg-surface",
                            item.isConnecting ? "border-primary/40 animate-pulse" : "border-primary/60"
                          )}>
                            {item.avatar ? (
                              <img src={item.avatar} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-3xl sm:text-5xl text-white/80 font-semibold">{item.name.charAt(0)}</span>
                            )}
                          </div>
                          {item.isConnecting && (
                            <p className="text-white/60 text-xs mt-3 animate-pulse">Connecting...</p>
                          )}
                        </div>
                      )}

                      {/* Bottom-Left Name Pill (e.g. Aman, Neha, Rahul, Priya) */}
                      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-xl text-xs font-semibold text-white shadow-md">
                        {item.name}
                      </div>

                      {/* Bottom-Right Mic Status Badge */}
                      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md p-1.5 rounded-full text-white shadow-md">
                        {item.isConnecting ? <MicOff size={14} className="text-white/50" /> : <Mic size={14} className="text-emerald-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Connecting Fallback */
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-primary/30 shadow-[0_0_60px_rgba(0,168,132,0.2)] mb-4 flex items-center justify-center bg-surface">
                    {callAvatar ? <img src={callAvatar} className="w-full h-full object-cover" /> : <span className="text-5xl text-white">{callDisplayName.charAt(0)}</span>}
                  </div>
                  <h3 className="text-white font-semibold text-lg">{callDisplayName}</h3>
                  <p className="text-primary text-xs font-medium animate-pulse mt-1">Connecting call...</p>
                </div>
              )}

              {/* Local User Floating Video PIP (Bottom Right) */}
              {localStream && (
                <motion.div 
                  drag
                  dragMomentum={false}
                  dragConstraints={videoContainerRef}
                  dragElastic={0.1}
                  className="absolute bottom-28 right-4 w-[110px] h-[160px] sm:w-[130px] sm:h-[190px] bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-20 cursor-move"
                  style={{ touchAction: 'none' }}
                >
                  <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} />
                  
                  {/* Camera switch icon badge */}
                  {callType === 'VIDEO' && (
                    <button 
                      onClick={switchCamera}
                      className="absolute bottom-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-black/80 transition-colors"
                      title="Switch Camera"
                    >
                      <SwitchCamera size={14} />
                    </button>
                  )}
                </motion.div>
              )}
            </div>

            {/* Bottom Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-6 px-4">
              <div className="flex items-center justify-evenly max-w-md mx-auto">
                {/* Camera Switch */}
                {callType === 'VIDEO' && (
                  <div className="flex flex-col items-center space-y-1">
                    <button 
                      onClick={switchCamera}
                      className="w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
                    >
                      <SwitchCamera size={22} />
                    </button>
                    <span className="text-[11px] text-white/70 font-medium">Camera</span>
                  </div>
                )}

                {/* Video Off toggle */}
                {callType === 'VIDEO' && (
                  <div className="flex flex-col items-center space-y-1">
                    <button 
                      onClick={toggleVideo}
                      className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer",
                        isVideoOff ? "bg-white text-[#0b141a]" : "bg-white/10 text-white hover:bg-white/20"
                      )}
                    >
                      {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
                    </button>
                    <span className="text-[11px] text-white/70 font-medium">{isVideoOff ? 'Video on' : 'Video off'}</span>
                  </div>
                )}

                {/* Mute toggle */}
                <div className="flex flex-col items-center space-y-1">
                  <button 
                    onClick={toggleMute}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer",
                      isMuted ? "bg-white text-[#0b141a]" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                  </button>
                  <span className="text-[11px] text-white/70 font-medium">{isMuted ? 'Unmute' : 'Mute'}</span>
                </div>

                {/* More / Info */}
                <div className="flex flex-col items-center space-y-1">
                  <button 
                    onClick={() => setShowAddParticipant(true)}
                    className="w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
                  >
                    <MoreHorizontal size={22} />
                  </button>
                  <span className="text-[11px] text-white/70 font-medium">More</span>
                </div>

                {/* End call */}
                <div className="flex flex-col items-center space-y-1">
                  <button 
                    onClick={handleEndCall}
                    className="w-14 h-14 rounded-full bg-danger hover:bg-danger/80 flex items-center justify-center shadow-[0_0_20px_rgba(234,0,56,0.4)] transition-all active:scale-95 cursor-pointer"
                  >
                    <PhoneOff size={24} className="text-white" />
                  </button>
                  <span className="text-[11px] text-white/70 font-medium">End</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Call Info & Add Participant Modal */}
        <AnimatePresence>
          {showAddParticipant && (
            <div className="fixed inset-0 z-[250] flex items-end md:items-center justify-center p-0 md:p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-md" onClick={() => setShowAddParticipant(false)} />
              <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} className="bg-[#111b21] border border-surface-border w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden z-10 relative max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-surface-border bg-[#182229]">
                  <div className="flex items-center space-x-2">
                    <UserPlus size={20} className="text-primary" />
                    <h3 className="text-white font-medium text-base">Add person to call</h3>
                  </div>
                  <button onClick={() => setShowAddParticipant(false)} className="p-1 rounded-full text-white/60 hover:text-white cursor-pointer"><X size={20} /></button>
                </div>
                
                <div className="p-4 overflow-y-auto flex-1 space-y-3">
                  {/* Connected Section */}
                  <div>
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Connected Participants ({remoteStreamEntries.length + 1})</p>
                    <div className="space-y-2">
                      {/* You */}
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-surface/50 border border-surface-border">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold">
                            {currentUser?.name?.charAt(0) || 'Y'}
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{currentUser?.name || 'You'} (You)</p>
                            <p className="text-emerald-400 text-xs font-medium">Active • Speaker</p>
                          </div>
                        </div>
                        <span className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-full font-medium">You</span>
                      </div>

                      {/* Remote Connected */}
                      {remoteStreamEntries.map(([userId]) => {
                        const member = chats.flatMap(c => c.participants || []).find((p: any) => p.userId === userId)?.user;
                        const mName = member?.name || member?.phoneNumber || 'Participant';
                        return (
                          <div key={userId} className="flex items-center justify-between p-3 rounded-2xl bg-surface/50 border border-surface-border">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-semibold">
                                {mName.charAt(0)}
                              </div>
                              <div>
                                <p className="text-white text-sm font-medium">{mName}</p>
                                <p className="text-emerald-400 text-xs font-medium flex items-center gap-1"><Mic size={12} /> Connected</p>
                              </div>
                            </div>
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-medium">Connected</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add Individual People Section */}
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Invite Contacts</p>
                    <div className="space-y-2">
                      {chats.filter(c => !c.isGroup && c.id !== activeCallChatId).map(chat => {
                        const other = chat.participants?.find((p: any) => p.userId !== currentUser?.id);
                        if (!other) return null;
                        const name = other.user?.name || other.user?.phoneNumber || 'Contact';
                        const targetId = other.userId;
                        const isInvited = invitedUserIds.includes(targetId);

                        return (
                          <div key={chat.id} className="flex items-center justify-between p-3 rounded-2xl bg-surface/30 border border-surface-border">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-surface-hover text-text-secondary flex items-center justify-center font-medium overflow-hidden">
                                {other.user?.profilePicture ? (
                                  <img src={other.user.profilePicture} className="w-full h-full object-cover" />
                                ) : (
                                  name.charAt(0)
                                )}
                              </div>
                              <div>
                                <p className="text-white text-sm font-medium">{name}</p>
                                <p className="text-white/50 text-xs">{isInvited ? 'Invited' : 'Tap to add'}</p>
                              </div>
                            </div>
                            <button
                              disabled={isInvited}
                              onClick={() => {
                                if (localStream && !isInvited) {
                                  setInvitedUserIds(prev => [...prev, targetId]);
                                  createPeer(targetId, localStream, true);
                                }
                              }}
                              className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer",
                                isInvited ? "bg-white/10 text-white/60 cursor-default" : "bg-primary hover:bg-primary-hover text-white"
                              )}
                            >
                              {isInvited ? 'Invited' : 'Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
