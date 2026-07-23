'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Peer, { Instance } from 'simple-peer';
import { useCallStore } from '@/store/useCallStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { 
  Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Maximize2, 
  SwitchCamera, X, UserPlus, Lock, ChevronDown, MoreHorizontal, Users 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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
        <div className="w-full h-full flex items-center justify-center bg-[#1f2c34]">
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
  const [showControls, setShowControls] = useState(true);
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
      if (data?.callerId && peersRef.current[data.callerId]) {
        try {
          peersRef.current[data.callerId].destroy();
        } catch(e) {}
        delete peersRef.current[data.callerId];
        removePeer(data.callerId);
        removeRemoteStream(data.callerId);
      } else {
        Object.keys(peersRef.current).forEach(id => {
          try { peersRef.current[id].destroy(); } catch(e) {}
          delete peersRef.current[id];
        });
      }

      const currentChat = chats.find(c => c.id === activeCallChatIdRef.current);
      if (!currentChat?.isGroup || Object.keys(peersRef.current).length === 0) {
        stopRingtone();
        endCall();
      }
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
      
      // Stop old video track FIRST to release hardware lock on mobile Android
      if (oldVideoTrack) {
        oldVideoTrack.stop();
      }

      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { exact: newMode } }
        });
      } catch(e) {
        newStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: newMode }
        });
      }

      const newVideoTrack = newStream.getVideoTracks()[0];

      if (oldVideoTrack && newVideoTrack) {
        Object.values(peersRef.current).forEach(peer => {
          try {
            if (!peer.destroyed && peer.streams[0]) {
              peer.replaceTrack(oldVideoTrack, newVideoTrack, peer.streams[0]);
            }
          } catch(e) {
            console.error('Track replacement error:', e);
          }
        });

        localStreamRef.current.removeTrack(oldVideoTrack);
      }

      if (newVideoTrack) {
        localStreamRef.current.addTrack(newVideoTrack);
        setFacingMode(newMode);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
    } catch(err) {
      console.error('Failed to switch camera', err);
    }
  };

  const remoteStreamEntries = Object.entries(remoteStreams);
  const activeChat = chats.find(c => c.id === activeCallChatId);
  const isGroupCall = Boolean((activeChat?.isGroup) || (remoteStreamEntries.length > 1) || (invitedUserIds.length > 1));

  const allCallParticipants = useMemo(() => {
    const list: Array<{ userId: string; name: string; avatar?: string | null; stream?: MediaStream | null; isConnecting?: boolean }> = [];
    const addedIds = new Set<string>();

    Object.entries(remoteStreams).forEach(([uId, stream]) => {
      if (!addedIds.has(uId) && uId !== currentUser?.id) {
        addedIds.add(uId);
        const pUser = chats.flatMap(c => c.participants || []).find((p: any) => p.userId === uId)?.user;
        list.push({
          userId: uId,
          name: pUser?.name || pUser?.phoneNumber || caller || 'Participant',
          avatar: pUser?.profilePicture || null,
          stream,
          isConnecting: false
        });
      }
    });

    invitedUserIds.forEach((uId) => {
      if (!addedIds.has(uId) && uId !== currentUser?.id) {
        addedIds.add(uId);
        const pUser = chats.flatMap(c => c.participants || []).find((p: any) => p.userId === uId)?.user;
        list.push({
          userId: uId,
          name: pUser?.name || pUser?.phoneNumber || 'Invited Contact',
          avatar: pUser?.profilePicture || null,
          stream: null,
          isConnecting: true
        });
      }
    });

    if (list.length === 0) {
      const other = activeChat?.participants?.find((p: any) => p.userId !== currentUser?.id);
      if (other && !addedIds.has(other.userId)) {
        addedIds.add(other.userId);
        list.push({
          userId: other.userId,
          name: other.user?.name || other.user?.phoneNumber || caller || 'Contact',
          avatar: other.user?.profilePicture || null,
          stream: null,
          isConnecting: true
        });
      }
    }

    return list;
  }, [activeChat, currentUser, remoteStreams, invitedUserIds, chats, caller]);

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

  // PIP Mode
  if (isPIP && isCalling) {
    return (
      <motion.div
        drag
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-20 right-4 z-[200] w-[140px] h-[200px] sm:w-[160px] sm:h-[220px] rounded-2xl overflow-hidden shadow-2xl border-2 border-emerald-500/40 cursor-move bg-black select-none"
        style={{ touchAction: 'none' }}
      >
        {callType === 'VIDEO' && isConnected ? (
          <div className="w-full h-full relative">
            <VideoPlayer stream={remoteStreamEntries[0][1]} />
            {localStream && (
              <div className="absolute top-2 right-2 w-12 h-16 rounded-lg overflow-hidden border border-white/20 shadow-lg">
                <VideoPlayer stream={localStream} isLocal isVideoOff={isVideoOff} />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2730] to-[#0b141a]">
            <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-emerald-500/40 mb-2 flex items-center justify-center bg-surface">
              {callAvatar ? <img src={callAvatar} className="w-full h-full object-cover" /> : <span className="text-xl text-white">{callDisplayName.charAt(0)}</span>}
            </div>
            <p className="text-white text-xs font-medium truncate max-w-[120px] px-2">{callDisplayName}</p>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-md flex items-center justify-between px-2.5 py-1.5">
          <span className="text-white/80 text-[10px] font-mono">{isConnected ? timerDisplay : '...'}</span>
          <div className="flex items-center space-x-1.5">
            <button onClick={() => setIsPIP(false)} className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <Maximize2 size={13} />
            </button>
            <button onClick={handleEndCall} className="p-1 rounded-full bg-danger text-white transition-colors">
              <PhoneOff size={13} />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Full-Screen Mode
  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-[#0b141a] flex flex-col select-none overflow-hidden"
      >
        <audio 
          ref={ringtoneRef} 
          src="/iphone-6-ringtone-qoybaffhmm2az4wnaazaqcsw8dg411-28159.mp3" 
          loop 
          autoPlay={((isReceivingCall && !isCalling) || (isCalling && isInitiator && !callStartTime)) ? true : false}
        />

        {remoteStreamEntries.map(([uId, s]) => (
          <AudioPlayer key={uId} stream={s} />
        ))}
        
        {/* ─── Incoming Call Screen ─── */}
        {isReceivingCall && !isCalling && (
          <div 
            className="flex-1 flex flex-col items-center justify-between relative overflow-hidden bg-[#0b141a]"
            style={{ 
              paddingTop: 'max(24px, env(safe-area-inset-top))', 
              paddingBottom: 'max(36px, env(safe-area-inset-bottom))', 
              paddingLeft: 'max(16px, env(safe-area-inset-left))', 
              paddingRight: 'max(16px, env(safe-area-inset-right))' 
            }}
          >
            {callAvatar && (
              <div className="absolute inset-0 z-0 opacity-25 filter blur-3xl scale-125">
                <img src={callAvatar} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            
            <div className="relative z-10 flex flex-col items-center mt-4 text-center space-y-2">
              <div className="flex items-center space-x-1.5 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 mb-2">
                <Lock size={12} className="text-emerald-400" />
                <span className="text-xs text-white/80 font-medium">End-to-end encrypted</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold text-white tracking-wide">{callDisplayName}</h2>
              <p className="text-emerald-400 text-sm font-medium animate-pulse flex items-center gap-2 justify-center">
                {callType === 'VIDEO' ? <Video size={16} /> : <Phone size={16} />}
                {callType === 'VIDEO' ? 'Incoming NexusChat video call...' : 'Incoming NexusChat voice call...'}
              </p>
            </div>

            <div className="relative z-10 flex items-center justify-center my-auto">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-44 h-44 rounded-full border-2 border-emerald-500/30 animate-ping" style={{ animationDuration: '2.5s' }} />
                <div className="absolute w-56 h-56 rounded-full border border-emerald-500/15 animate-ping" style={{ animationDuration: '3.5s' }} />
                
                <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full overflow-hidden border-4 border-emerald-500/40 shadow-[0_0_50px_rgba(0,168,132,0.3)] bg-[#1f2c34] flex items-center justify-center relative z-10">
                  {callAvatar ? (
                    <img src={callAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-6xl text-white/90 font-semibold">{callDisplayName.charAt(0)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="relative z-10 w-full max-w-xs mx-auto flex items-center justify-around">
              <div className="flex flex-col items-center space-y-2">
                <button
                  onClick={handleEndCall}
                  className="w-16 h-16 rounded-full bg-danger hover:bg-danger/90 text-white flex items-center justify-center shadow-[0_0_30px_rgba(234,0,56,0.4)] transition-transform active:scale-90 cursor-pointer"
                >
                  <PhoneOff size={28} />
                </button>
                <span className="text-xs text-white/80 font-medium">Decline</span>
              </div>

              <div className="flex flex-col items-center space-y-2">
                <button
                  onClick={answerCall}
                  className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-[0_0_30px_rgba(0,168,132,0.4)] transition-transform active:scale-90 animate-bounce cursor-pointer"
                >
                  {callType === 'VIDEO' ? <Video size={28} /> : <Phone size={28} />}
                </button>
                <span className="text-xs text-white/80 font-medium">Accept</span>
              </div>
            </div>
          </div>
        )}

        {/* ─── Active Call Screen ─── */}
        {isCalling && (
          <div 
            className="flex-1 flex flex-col relative bg-[#0b141a] overflow-hidden"
            onClick={() => setShowControls(prev => !prev)}
          >
            {/* Top Bar Header */}
            <div 
              className={cn(
                "absolute top-0 left-0 right-0 z-30 transition-all duration-300 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 pt-6",
                !showControls && callType === 'VIDEO' && allCallParticipants.length === 1 && "opacity-0 -translate-y-4 pointer-events-none"
              )}
              style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between max-w-4xl mx-auto">
                <button 
                  onClick={() => setIsPIP(true)} 
                  className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md cursor-pointer"
                  title="Minimize Call"
                >
                  <ChevronDown size={20} />
                </button>
                
                <div className="flex flex-col items-center">
                  <div className="flex items-center space-x-1.5 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                    <Lock size={12} className="text-emerald-400" />
                    <span className="text-xs text-white/90 font-medium">End-to-end encrypted</span>
                  </div>
                  <span className="text-xs text-white/70 font-mono mt-1">
                    {isConnected ? timerDisplay : (isInitiator ? 'Calling...' : 'Ringing...')}
                  </span>
                </div>

                <button 
                  onClick={() => setShowAddParticipant(true)} 
                  className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-md cursor-pointer"
                  title="Add Person"
                >
                  <UserPlus size={20} />
                </button>
              </div>
            </div>

            {/* Main Content View (Full-Bleed 1-to-1 or Group Grid) */}
            <div 
              ref={videoContainerRef} 
              className="flex-1 relative w-full h-full overflow-hidden flex items-center justify-center"
            >
              {/* Single Remote Participant Video Mode (FULL BLEED) */}
              {allCallParticipants.length === 1 && callType === 'VIDEO' ? (
                <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden">
                  {allCallParticipants[0].stream ? (
                    <VideoPlayer stream={allCallParticipants[0].stream} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2730] to-[#0b141a]">
                      <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-emerald-500/30 shadow-2xl mb-4 flex items-center justify-center bg-surface">
                        {allCallParticipants[0].avatar ? (
                          <img src={allCallParticipants[0].avatar} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-5xl text-white font-semibold">{allCallParticipants[0].name.charAt(0)}</span>
                        )}
                      </div>
                      <h3 className="text-white text-xl font-semibold">{allCallParticipants[0].name}</h3>
                      <p className="text-emerald-400 text-xs font-medium animate-pulse mt-1">Connecting...</p>
                    </div>
                  )}

                  {/* Contact Name Label Badge */}
                  <div className="absolute top-20 left-4 z-20 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white shadow-lg border border-white/10">
                    {allCallParticipants[0].name}
                  </div>
                </div>
              ) : allCallParticipants.length === 1 && callType === 'AUDIO' ? (
                /* Single Remote Participant Audio Mode */
                <div className="w-full h-full flex flex-col items-center justify-center text-center space-y-6 pt-16 pb-28">
                  <div className="relative flex items-center justify-center">
                    {isConnected && (
                      <div className="absolute w-44 h-44 rounded-full border border-emerald-500/20 animate-pulse" />
                    )}
                    <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden border-4 border-emerald-500/40 shadow-[0_0_60px_rgba(0,168,132,0.2)] bg-[#1f2c34] flex items-center justify-center">
                      {allCallParticipants[0].avatar ? (
                        <img src={allCallParticipants[0].avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-5xl text-white/90 font-semibold">{allCallParticipants[0].name.charAt(0)}</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-2xl font-semibold text-white">{allCallParticipants[0].name}</h3>
                    <p className="text-emerald-400 text-xs font-medium">
                      {isConnected ? 'NexusChat Voice Call' : (isInitiator ? 'Calling...' : 'Ringing...')}
                    </p>
                  </div>
                </div>
              ) : (
                /* Multi Participant Grid Layout */
                <div className={cn(
                  "w-full h-full grid gap-3 max-w-4xl mx-auto items-center justify-center pt-20 pb-36 px-4",
                  allCallParticipants.length === 2 && "grid-cols-1 sm:grid-cols-2 grid-rows-2 sm:grid-rows-1",
                  (allCallParticipants.length === 3 || allCallParticipants.length === 4) && "grid-cols-2 grid-rows-2",
                  allCallParticipants.length > 4 && "grid-cols-2 sm:grid-cols-3 overflow-y-auto"
                )}>
                  {allCallParticipants.map((item) => (
                    <div 
                      key={item.userId} 
                      className="relative w-full h-full bg-[#1f2c34] rounded-2xl overflow-hidden border border-white/10 shadow-xl flex items-center justify-center min-h-[140px]"
                    >
                      {callType === 'VIDEO' && item.stream ? (
                        <VideoPlayer stream={item.stream} />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a2730] to-[#0b141a] p-4">
                          <div className={cn(
                            "w-16 h-16 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 shadow-lg flex items-center justify-center bg-surface",
                            item.isConnecting ? "border-emerald-500/30 animate-pulse" : "border-emerald-500/60"
                          )}>
                            {item.avatar ? (
                              <img src={item.avatar} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-2xl sm:text-3xl text-white font-semibold">{item.name.charAt(0)}</span>
                            )}
                          </div>
                          {item.isConnecting && (
                            <p className="text-white/60 text-xs mt-2 animate-pulse">Connecting...</p>
                          )}
                        </div>
                      )}

                      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-xl text-xs font-semibold text-white shadow-md">
                        {item.name}
                      </div>

                      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md p-1.5 rounded-full text-white shadow-md">
                        {item.isConnecting ? <MicOff size={14} className="text-white/50" /> : <Mic size={14} className="text-emerald-400" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Local Video PIP Window */}
              {localStream && callType === 'VIDEO' && (
                <motion.div 
                  drag
                  dragMomentum={false}
                  dragConstraints={videoContainerRef}
                  dragElastic={0.1}
                  className="absolute bottom-28 right-4 w-[110px] h-[160px] sm:w-[130px] sm:h-[190px] bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-20 cursor-move"
                  style={{ touchAction: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} />
                  
                  <button 
                    onClick={switchCamera}
                    className="absolute bottom-2 right-2 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:bg-black/80 transition-colors cursor-pointer"
                    title="Switch Camera"
                  >
                    <SwitchCamera size={14} />
                  </button>
                </motion.div>
              )}
            </div>

            {/* Bottom Controls Floating Glassmorphism Bar */}
            <div 
              className={cn(
                "absolute bottom-0 left-0 right-0 z-30 transition-all duration-300 pb-4 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none",
                !showControls && callType === 'VIDEO' && allCallParticipants.length === 1 && "opacity-0 translate-y-6"
              )}
              style={{ 
                paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
                paddingLeft: 'max(16px, env(safe-area-inset-left))',
                paddingRight: 'max(16px, env(safe-area-inset-right))'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pointer-events-auto max-w-sm sm:max-w-md mx-auto px-2">
                <div className="bg-black/60 backdrop-blur-xl border border-white/15 rounded-full px-4 py-3 flex items-center justify-evenly shadow-2xl">
                  {callType === 'VIDEO' && (
                    <button
                      onClick={switchCamera}
                      className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                      title="Switch Camera"
                    >
                      <SwitchCamera size={20} />
                    </button>
                  )}

                  {callType === 'VIDEO' && (
                    <button
                      onClick={toggleVideo}
                      className={cn(
                        "w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer",
                        isVideoOff ? "bg-white text-[#0b141a]" : "bg-white/10 text-white hover:bg-white/20"
                      )}
                      title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                    >
                      {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                    </button>
                  )}

                  <button
                    onClick={toggleMute}
                    className={cn(
                      "w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer",
                      isMuted ? "bg-white text-[#0b141a]" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>

                  <button
                    onClick={() => setShowAddParticipant(true)}
                    className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                    title="Add Contact"
                  >
                    <UserPlus size={20} />
                  </button>

                  <button
                    onClick={handleEndCall}
                    className="w-13 h-13 rounded-full bg-danger hover:bg-danger/90 text-white flex items-center justify-center shadow-[0_0_25px_rgba(234,0,56,0.5)] transition-all active:scale-90 cursor-pointer ml-1"
                    title="End Call"
                  >
                    <PhoneOff size={22} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Add Participant Modal Sheet ─── */}
        <AnimatePresence>
          {showAddParticipant && (
            <div className="fixed inset-0 z-[250] flex items-end md:items-center justify-center p-0 md:p-4">
              <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="fixed inset-0 bg-black/70 backdrop-blur-md" 
                onClick={() => setShowAddParticipant(false)} 
              />
              <motion.div 
                initial={{ y: '100%' }} 
                animate={{ y: 0 }} 
                exit={{ y: '100%' }} 
                className="bg-[#111b21] border border-surface-border w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden z-10 relative max-h-[80vh] flex flex-col"
              >
                <div className="flex items-center justify-between p-4 border-b border-surface-border bg-[#182229]">
                  <div className="flex items-center space-x-2">
                    <UserPlus size={20} className="text-emerald-400" />
                    <h3 className="text-white font-medium text-base">Add person to call</h3>
                  </div>
                  <button onClick={() => setShowAddParticipant(false)} className="p-1 rounded-full text-white/60 hover:text-white cursor-pointer"><X size={20} /></button>
                </div>
                
                <div className="p-4 overflow-y-auto flex-1 space-y-4">
                  {/* Connected Section */}
                  <div>
                    <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Connected Participants ({remoteStreamEntries.length + 1})</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 rounded-2xl bg-surface/50 border border-surface-border">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-semibold">
                            {currentUser?.name?.charAt(0) || 'Y'}
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{currentUser?.name || 'You'} (You)</p>
                            <p className="text-emerald-400 text-xs font-medium">Active • Speaker</p>
                          </div>
                        </div>
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full font-medium">You</span>
                      </div>

                      {remoteStreamEntries.map(([userId]) => {
                        const member = chats.flatMap(c => c.participants || []).find((p: any) => p.userId === userId)?.user;
                        const mName = member?.name || member?.phoneNumber || 'Participant';
                        return (
                          <div key={userId} className="flex items-center justify-between p-3 rounded-2xl bg-surface/50 border border-surface-border">
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-semibold overflow-hidden">
                                {member?.profilePicture ? (
                                  <img src={member.profilePicture} className="w-full h-full object-cover" />
                                ) : (
                                  mName.charAt(0)
                                )}
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

                  {/* Contacts Section */}
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
                                isInvited ? "bg-white/10 text-white/60 cursor-default" : "bg-emerald-500 hover:bg-emerald-600 text-white"
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
