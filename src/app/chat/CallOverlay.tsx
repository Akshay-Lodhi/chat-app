'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Peer, { Instance } from 'simple-peer';
import { useCallStore } from '@/store/useCallStore';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { 
  Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Maximize2, 
  SwitchCamera, X, UserPlus, Lock, ChevronDown, MoreHorizontal, Users, BellRing, Monitor,
  Circle, Square
} from 'lucide-react';
import { useRecording } from '@/hooks/useRecording';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const AudioPlayer = ({ stream }: { stream: MediaStream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    let isMounted = true;
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.volume = 1.0;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          if (err.name !== 'NotAllowedError' && isMounted) {
            console.error("Audio playback error:", err);
          }
        });
      }
    }
    return () => { isMounted = false; };
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline controls={false} className="hidden" />;
};

interface VideoPlayerProps {
  stream: MediaStream;
  isLocal?: boolean;
  isVideoOff?: boolean;
  avatar?: string;
  name?: string;
}

const VideoPlayer = ({ stream, isLocal = false, isVideoOff = false, avatar, name }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoTrackId = stream?.getVideoTracks()[0]?.id;

  useEffect(() => {
    let isMounted = true;
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          if (err.name !== "AbortError" && isMounted) {
            console.error("Video play error:", err);
          }
        });
      }
    }
    return () => { isMounted = false; };
  }, [stream, videoTrackId]);

  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} className={cn("w-full h-full object-cover", isVideoOff && "hidden")} />
      {isVideoOff && (
        <div className="w-full h-full relative flex flex-col items-center justify-center bg-black overflow-hidden">
          {/* Dynamic Blurred Background for Empty State */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            {avatar ? (
              <>
                <img src={avatar} alt="" className="w-full h-full object-cover opacity-50 filter blur-[60px] scale-150 transform transition-transform duration-[10000ms]" />
                <div className="absolute inset-0 bg-black/30 backdrop-blur-[10px]" />
              </>
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#1a2a3a] to-[#0a1118]" />
            )}
          </div>
          <div className="relative z-10 w-20 h-20 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl flex items-center justify-center bg-surface/50 backdrop-blur-md">
            {avatar ? (
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-semibold text-white">{(name || "U").charAt(0)}</span>
            )}
          </div>
          <span className="relative z-10 text-xs text-white/70 font-medium mt-3 bg-black/40 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-lg">Camera Off</span>
        </div>
      )}
    </>
  );
};

export default function CallOverlay() {
  const { 
    isCalling, isReceivingCall, isInitiator, caller, callType, activeCallChatId, 
    localStream, remoteStreams, peers, callStartTime, roomParticipants,
    setLocalStream, addRemoteStream, removeRemoteStream, addPeer, removePeer, acceptCall, endCall,
    isScreenSharing, toggleScreenShare
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
  
  const storeInvitedUserIds = useCallStore(state => state.invitedUserIds);
  const [invitedUserIds, setInvitedUserIds] = useState<string[]>([]);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const { isRecording, startRecording, stopRecording } = useRecording({
    localStream,
    remoteStreams,
    callType
  });

  // Auto-hide controls timer
  useEffect(() => {
    const hasRemote = Object.keys(remoteStreams).length > 0;
    if (!showControls || !hasRemote) return;
    const timeout = setTimeout(() => {
      setShowControls(false);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [showControls, remoteStreams]);

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

  useEffect(() => {
    if (!isCalling && !isReceivingCall) {
      setIsMuted(false);
      setIsVideoOff(false);
      setElapsedSeconds(0);
      setIsPIP(false);
      setFacingMode('user');
      setShowAddParticipant(false);
      setShowControls(true);
      setInvitedUserIds([]);
    }
  }, [isCalling, isReceivingCall]);

  // Sync initial invited user ids when call starts (e.g. from Call Log)
  // IMPORTANT: We MERGE store IDs into local state, never replace, to avoid losing
  // participants that were added manually via the "Add Person" button during the call.
  useEffect(() => {
    if (isCalling && storeInvitedUserIds.length > 0) {
      setInvitedUserIds(prev => {
        const existing = new Set(prev);
        const merged = [...prev];
        storeInvitedUserIds.forEach(id => {
          if (!existing.has(id)) merged.push(id);
        });
        return merged;
      });
    }
  }, [isCalling, storeInvitedUserIds]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isCalling && socket && activeCallChatIdRef.current) {
        try {
          socket.emit('end-call', { chatId: activeCallChatIdRef.current, duration: elapsedSeconds || 0 });
          socket.emit('leave-call-room', { chatId: activeCallChatIdRef.current });
        } catch (e) {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isCalling, socket, elapsedSeconds]);

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

    peer.on('error', (err: any) => {
      if (err?.message?.includes('User-Initiated Abort')) return;
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

      const remainingPeersCount = Object.keys(peersRef.current).length;
      if (remainingPeersCount === 0) {
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
      if (data.userId && peersRef.current[data.userId]) {
        try { peersRef.current[data.userId].destroy(); } catch(e) {}
        delete peersRef.current[data.userId];
        removePeer(data.userId);
        removeRemoteStream(data.userId);
      }
      if (data.userId && pendingIceCandidatesRef.current[data.userId]) {
        delete pendingIceCandidatesRef.current[data.userId];
      }
    };

    const handleActiveCallUpdate = (data: any) => {
      if (data?.chatId) {
        useCallStore.getState().setActiveCallInfo(
          data.chatId, 
          data.activeCount > 0 ? { chatId: data.chatId, activeCount: data.activeCount, callType: data.callType || 'VIDEO' } : null
        );
      }
    };

    const handleCallRoomStateUpdated = (data: any) => {
      if (data?.participants && Array.isArray(data.participants)) {
        useCallStore.getState().setRoomParticipants(data.participants);
      }
    };

    const handleParticipantMediaToggled = (data: { userId: string; isMuted: boolean; isVideoOff: boolean }) => {
      if (data?.userId) {
        useCallStore.getState().updateParticipantMedia(data.userId, data.isMuted, data.isVideoOff);
      }
    };

    const handleParticipantInvited = (data: { targetUserId: string; inviterId: string }) => {
      if (data.targetUserId && data.targetUserId !== currentUser?.id) {
        setInvitedUserIds(prev => {
          if (!prev.includes(data.targetUserId)) return [...prev, data.targetUserId];
          return prev;
        });
      }
    };

    socket.on('call-offer', handleCallOffer);
    socket.on('call-answer', handleCallAnswer);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-end', handleCallEnd);
    socket.on('group-call-participants', handleGroupParticipants);
    socket.on('group-call-user-joined', handleGroupUserJoined);
    socket.on('group-call-user-left', handleGroupUserLeft);
    socket.on('call-room-participants', handleGroupParticipants);
    socket.on('call-room-user-joined', handleGroupUserJoined);
    socket.on('call-room-user-left', handleGroupUserLeft);
    socket.on('active-call-update', handleActiveCallUpdate);
    socket.on('call-room-state-updated', handleCallRoomStateUpdated);
    socket.on('participant-media-toggled', handleParticipantMediaToggled);
    socket.on('participant-invited', handleParticipantInvited);

    return () => {
      socket.off('call-offer', handleCallOffer);
      socket.off('call-answer', handleCallAnswer);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-end', handleCallEnd);
      socket.off('group-call-participants', handleGroupParticipants);
      socket.off('group-call-user-joined', handleGroupUserJoined);
      socket.off('group-call-user-left', handleGroupUserLeft);
      socket.off('call-room-participants', handleGroupParticipants);
      socket.off('call-room-user-joined', handleGroupUserJoined);
      socket.off('call-room-user-left', handleGroupUserLeft);
      socket.off('active-call-update', handleActiveCallUpdate);
      socket.off('call-room-state-updated', handleCallRoomStateUpdated);
      socket.off('participant-media-toggled', handleParticipantMediaToggled);
      socket.off('participant-invited', handleParticipantInvited);
    };
  }, [socket, createPeer, endCall, removePeer, removeRemoteStream, currentUser]);

  const toggleMute = () => {
    if (localStream) {
      const newMuted = !isMuted;
      localStream.getAudioTracks().forEach(t => t.enabled = !newMuted);
      setIsMuted(newMuted);
      if (socket && activeCallChatId) {
        socket.emit('toggle-media-status', { chatId: activeCallChatId, isMuted: newMuted, isVideoOff });
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const newVideoOff = !isVideoOff;
      localStream.getVideoTracks().forEach(t => t.enabled = !newVideoOff);
      setIsVideoOff(newVideoOff);
      if (socket && activeCallChatId) {
        socket.emit('toggle-media-status', { chatId: activeCallChatId, isMuted, isVideoOff: newVideoOff });
      }
    }
  };

  const handleEndCall = () => {
    if (socket && activeCallChatId) {
      const remainingRemoteCount = Object.keys(remoteStreams).length;

      if (isInitiator) {
        if (remainingRemoteCount >= 2) {
          socket.emit('leave-call-room', { chatId: activeCallChatId });
        } else {
          const isMulti = Boolean((activeChat?.isGroup) || (Object.keys(remoteStreams).length > 1) || (invitedUserIds.length > 1) || Object.keys(roomParticipants).length > 2);
          
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
        }
      }

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
      if (socket && state.activeCallChatId) {
        socket.emit('join-call-room', { chatId: state.activeCallChatId, type: state.callType });
      }
      createPeer(state.pendingOffer.callerId, stream, false, state.pendingOffer.signalData);
    } catch (err) {
      console.error("Failed to answer call:", err);
      handleEndCall();
    }
  };

  // UNIFIED MEDIA INITIALIZATION EFFECT (FOR INITIATOR, RECEIVER & RE-JOINER)
  useEffect(() => {
    if (isCalling && activeCallChatId && currentUser && !localStreamRef.current) {
      const initializeCallMedia = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast.error('Camera and Microphone access requires a secure connection (HTTPS) or localhost.');
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

          if (socket && activeCallChatId) {
            socket.emit('join-call-room', { chatId: activeCallChatId, type: callType });
          }

          if (isInitiator) {
            const chat = chats.find(c => c.id === activeCallChatId);
            if (chat) {
              if (chat.isGroup) socket?.emit('group-call-join', { chatId: activeCallChatId });
              
              const allTargets = new Set<string>();
              chat.participants?.forEach((p: any) => allTargets.add(p.userId));
              useCallStore.getState().invitedUserIds.forEach(id => allTargets.add(id));
              
              allTargets.forEach(id => {
                if (id !== currentUser.id && id !== 'nexus-ai-system') createPeer(id, stream, true);
              });
            }
          }
        } catch (err) { 
          console.error('Failed to initialize call media:', err);
          toast.error('Failed to access camera/microphone. Please ensure permissions are granted.');
          handleEndCall(); 
        }
      };
      initializeCallMedia();
    }
  }, [isCalling, isInitiator, activeCallChatId, currentUser, callType, chats, createPeer, setLocalStream, socket]);

  const switchCamera = async () => {
    if (callType !== 'VIDEO' || !localStreamRef.current) return;
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    
    try {
      const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
      
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

  const getUserProfile = useCallback((uId: string) => {
    if (uId === currentUser?.id) {
      return { name: currentUser.name || currentUser.phoneNumber || 'You', avatar: currentUser.profilePicture || null };
    }
    const pInfo = roomParticipants[uId];
    if (pInfo && pInfo.name && pInfo.name !== 'User') return { name: pInfo.name, avatar: pInfo.avatar };
    
    const fallbackChatUser = chats.flatMap(c => c.participants || []).find((p: any) => p.userId === uId)?.user;
    if (fallbackChatUser) {
      return { name: fallbackChatUser.name || fallbackChatUser.phoneNumber || 'Participant', avatar: fallbackChatUser.profilePicture || null };
    }

    if (pInfo) return { name: pInfo.name, avatar: pInfo.avatar };

    return { name: 'Participant', avatar: null };
  }, [currentUser, roomParticipants, chats]);

  const allCallParticipants = useMemo(() => {
    const list: Array<{ userId: string; name: string; avatar?: string | null; stream?: MediaStream | null; isConnecting?: boolean; isMuted?: boolean; isVideoOff?: boolean }> = [];
    const addedIds = new Set<string>();

    // 1. Connected remote streams
    Object.entries(remoteStreams).forEach(([uId, stream]) => {
      if (!addedIds.has(uId) && uId !== currentUser?.id && uId !== 'nexus-ai-system') {
        addedIds.add(uId);
        const prof = getUserProfile(uId);
        const pInfo = roomParticipants[uId];
        list.push({
          userId: uId,
          name: prof.name,
          avatar: prof.avatar,
          stream,
          isConnecting: false,
          isMuted: pInfo?.isMuted || false,
          isVideoOff: pInfo?.isVideoOff || false
        });
      }
    });

    // 2. Authoritative server room participants (EXCLUDE ANY WITH STATUS === 'LEFT' or current user)
    Object.values(roomParticipants).forEach((pInfo) => {
      if (!addedIds.has(pInfo.userId) && pInfo.userId !== currentUser?.id && pInfo.userId !== 'nexus-ai-system' && pInfo.status !== 'LEFT') {
        addedIds.add(pInfo.userId);
        const prof = getUserProfile(pInfo.userId);
        list.push({
          userId: pInfo.userId,
          name: pInfo.name || prof.name || 'Participant',
          avatar: pInfo.avatar || prof.avatar,
          stream: null,
          isConnecting: pInfo.status !== 'CONNECTED',
          isMuted: pInfo.isMuted || false,
          isVideoOff: pInfo.isVideoOff || false
        });
      }
    });

    // 3. Pending invitations not yet tracked by server (fallback)
    invitedUserIds.forEach((uId) => {
      if (!addedIds.has(uId) && uId !== currentUser?.id && uId !== 'nexus-ai-system') {
        addedIds.add(uId);
        const prof = getUserProfile(uId);
        list.push({
          userId: uId,
          name: prof.name,
          avatar: prof.avatar,
          stream: null,
          isConnecting: true
        });
      }
    });

    // 4. Initial group participants (if ringing everyone in group)
    if (activeChat) {
      activeChat.participants.forEach((p: any) => {
        if (!addedIds.has(p.userId) && p.userId !== currentUser?.id && p.userId !== 'nexus-ai-system') {
          addedIds.add(p.userId);
          list.push({
            userId: p.userId,
            name: p.user?.name || p.user?.phoneNumber || 'Participant',
            avatar: p.user?.profilePicture || null,
            stream: null,
            isConnecting: true
          });
        }
      });
    }

    // 5. Fallback 1-to-1 recipient
    if (list.length === 0 && !activeChat?.isGroup) {
      const other = activeChat?.participants?.find((p: any) => p.userId !== currentUser?.id && p.userId !== 'nexus-ai-system');
      if (other && !addedIds.has(other.userId)) {
        addedIds.add(other.userId);
        list.push({
          userId: other.userId,
          name: other.user?.name || other.user?.phoneNumber || caller || 'Contact',
          avatar: other.user?.profilePicture || null,
          stream: null,
          isConnecting: true,
          isMuted: false,
          isVideoOff: false
        });
      }
    }

    return list;
  }, [activeChat, currentUser, remoteStreams, roomParticipants, invitedUserIds, getUserProfile, caller]);

  const gridParticipants = useMemo(() => {
    return allCallParticipants.filter(p => !p.isConnecting);
  }, [allCallParticipants]);

  const isGroupCall = useMemo(() => {
    if (activeChat?.isGroup) return true;
    return allCallParticipants.length >= 2;
  }, [activeChat, allCallParticipants]);

  const getGridContainerClass = (n: number) => {
    if (n <= 1) return "grid-cols-1 grid-rows-1";
    if (n === 2) return "grid-cols-1 sm:grid-cols-2 grid-rows-2 sm:grid-rows-1";
    if (n === 3) return "grid-cols-2 grid-rows-2";
    if (n === 4) return "grid-cols-2 grid-rows-2";
    if (n === 5) return "grid-cols-4 grid-rows-[2fr_1fr]";
    if (n === 6) return "grid-cols-2 grid-rows-3 sm:grid-cols-3 sm:grid-rows-2";
    if (n >= 7 && n <= 8) return "grid-cols-2 sm:grid-cols-4 auto-rows-fr";
    return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 auto-rows-fr";
  };

  const getTileClass = (n: number, index: number) => {
    if (n === 3 && index === 0) return "col-span-2 row-span-1";
    if (n === 5 && index === 0) return "col-span-4 row-span-1";
    return "col-span-1 row-span-1";
  };

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
        dragElastic={0.1}
        initial={{ opacity: 0, scale: 0.5, y: 50 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="fixed bottom-24 right-4 z-[200] w-[140px] h-[220px] sm:w-[160px] sm:h-[250px] rounded-2xl overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.6)] border border-white/20 cursor-move bg-black select-none"
        style={{ touchAction: 'none' }}
      >
        {callType === 'VIDEO' && isConnected ? (
          <div className="w-full h-full relative">
            <VideoPlayer stream={remoteStreamEntries[0][1]} avatar={allCallParticipants[0]?.avatar || ''} name={allCallParticipants[0]?.name || ''} isVideoOff={allCallParticipants[0]?.isVideoOff} />
            {localStream && (
              <div className="absolute top-3 right-3 w-12 h-16 sm:w-14 sm:h-20 rounded-xl overflow-hidden border border-white/30 shadow-xl bg-black">
                <VideoPlayer stream={localStream} isLocal isVideoOff={isVideoOff} avatar={currentUser?.profilePicture || ''} name={currentUser?.name || ''} />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a2a3a] to-[#0a1118]">
            <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/20 mb-3 flex items-center justify-center bg-surface/50 backdrop-blur-md shadow-lg">
              {callAvatar ? <img src={callAvatar} className="w-full h-full object-cover" /> : <span className="text-2xl text-white font-medium">{callDisplayName.charAt(0)}</span>}
            </div>
            <p className="text-white text-xs font-medium truncate max-w-[120px] px-2 drop-shadow-md">{callDisplayName}</p>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent flex items-end justify-between px-3 py-3 h-16">
          <span className="text-white/90 text-[11px] font-mono font-medium drop-shadow-md">{isConnected ? timerDisplay : '...'}</span>
          <div className="flex items-center space-x-2">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setIsPIP(false)} className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white transition-colors">
              <Maximize2 size={14} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={handleEndCall} className="p-1.5 rounded-full bg-[#FF3B30] text-white transition-colors shadow-lg">
              <PhoneOff size={14} />
            </motion.button>
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
        className="fixed inset-0 z-[100] bg-chat-bg flex flex-col select-none overflow-hidden"
      >
        <audio 
          ref={ringtoneRef} 
          src={(isCalling && isInitiator) ? "/freesound_community-ring-tone-68676.mp3" : "/iphone-6-ringtone-qoybaffhmm2az4wnaazaqcsw8dg411-28159.mp3"}
          loop 
          autoPlay={((isReceivingCall && !isCalling) || (isCalling && isInitiator && !callStartTime)) ? true : false}
        />

        {remoteStreamEntries.map(([uId, s]) => (
          <AudioPlayer key={uId} stream={s} />
        ))}
        
        {/* ─── Incoming Call Screen ─── */}
        {isReceivingCall && !isCalling && (
          <div 
            className="flex-1 flex flex-col items-center justify-between relative overflow-hidden bg-chat-bg"
            style={{ 
              paddingTop: 'max(48px, env(safe-area-inset-top))', 
              paddingBottom: 'max(48px, env(safe-area-inset-bottom))', 
              paddingLeft: 'max(16px, env(safe-area-inset-left))', 
              paddingRight: 'max(16px, env(safe-area-inset-right))' 
            }}
          >
            {/* Dynamic Blurred Background */}
            <div className="absolute inset-0 z-0 overflow-hidden bg-black">
              {callAvatar ? (
                <>
                  <img src={callAvatar} alt="" className="w-full h-full object-cover opacity-60 filter blur-[80px] scale-150 transform transition-transform duration-[10000ms]" />
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[20px]" />
                </>
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#1a2a3a] to-[#0a1118]" />
              )}
            </div>
            
            <div className="relative z-10 flex flex-col items-center mt-8 text-center space-y-3">
              <div className="flex items-center space-x-1.5 bg-black/30 backdrop-blur-xl px-4 py-1.5 rounded-full border border-white/10 shadow-lg">
                <Lock size={12} className="text-emerald-400" />
                <span className="text-xs text-white/90 font-medium tracking-wide">End-to-end encrypted</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight drop-shadow-lg">{callDisplayName}</h2>
              <p className="text-white/70 text-base font-medium animate-pulse flex items-center gap-2 justify-center drop-shadow-md">
                {callType === 'VIDEO' ? 'NexusChat Video Call' : 'NexusChat Audio Call'}
              </p>
            </div>

            <div className="relative z-10 flex items-center justify-center flex-1 w-full my-8">
              <div className="relative flex items-center justify-center">
                {/* Smooth pulsing rings */}
                <motion.div 
                  className="absolute w-48 h-48 rounded-full border border-white/20"
                  animate={{ scale: [1, 1.5, 2], opacity: [0.8, 0.3, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
                />
                <motion.div 
                  className="absolute w-48 h-48 rounded-full border border-white/10"
                  animate={{ scale: [1, 1.5, 2], opacity: [0.8, 0.3, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 1 }}
                />
                
                <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl bg-surface flex items-center justify-center relative z-10 backdrop-blur-md">
                  {callAvatar ? (
                    <img src={callAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-7xl text-white font-semibold">{callDisplayName.charAt(0)}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="relative z-10 w-full max-w-sm mx-auto flex items-center justify-between px-8">
              <div className="flex flex-col items-center space-y-3">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={handleEndCall}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer"
                >
                  <PhoneOff size={32} />
                </motion.button>
              </div>

              <div className="flex flex-col items-center space-y-3">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={answerCall}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#34C759] hover:bg-[#34C759]/90 text-white flex items-center justify-center shadow-lg transition-colors cursor-pointer relative"
                >
                  <motion.div 
                    className="absolute inset-0 rounded-full bg-[#34C759]"
                    animate={{ scale: [1, 1.3], opacity: [0.5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                  />
                  {callType === 'VIDEO' ? <Video size={32} className="relative z-10" /> : <Phone size={32} className="relative z-10" />}
                </motion.button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Active Call Screen ─── */}
        {isCalling && (
          <div 
            className="flex-1 flex flex-col relative bg-chat-bg overflow-hidden"
            onClick={() => setShowControls(prev => !prev)}
          >
            {/* Top Bar Header */}
            <div 
              className={cn(
                "absolute top-0 left-0 right-0 z-30 transition-all duration-300 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 pt-6",
                !showControls && callType === 'VIDEO' && allCallParticipants.length === 1 && !isGroupCall && "opacity-0 -translate-y-4 pointer-events-none"
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
              {/* RINGING STATE (NO ONE CONNECTED YET) - VIDEO */}
              {!isConnected && callType === 'VIDEO' ? (
                <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden">
                  {localStream ? (
                    <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} avatar={currentUser?.profilePicture || ''} name={currentUser?.name || ''} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-chat-bg" />
                  )}

                  {/* Calling Status at the Top */}
                  <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center space-y-4 text-center w-full px-4">
                    <div className="flex -space-x-4 mb-2 justify-center">
                      {allCallParticipants.slice(0, 3).map((p) => (
                        <div key={p.userId} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl bg-surface flex items-center justify-center z-10 relative backdrop-blur-md">
                          {p.avatar ? (
                            <img src={p.avatar} className="w-full h-full object-cover" />
                          ) : (
                            <span className="w-full h-full flex items-center justify-center text-3xl text-white font-semibold">{p.name.charAt(0)}</span>
                          )}
                          <div className="absolute inset-0 rounded-full border border-white/30 animate-ping" style={{ animationDuration: '3s' }} />
                        </div>
                      ))}
                      {allCallParticipants.length > 3 && (
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white/20 shadow-2xl bg-black/40 backdrop-blur-md text-white flex items-center justify-center z-10 text-xl font-semibold">
                          +{allCallParticipants.length - 3}
                        </div>
                      )}
                    </div>
                    <div className="bg-black/40 backdrop-blur-xl px-6 py-2.5 rounded-full text-white shadow-2xl border border-white/10 max-w-[80vw]">
                      <h3 className="text-lg sm:text-xl font-semibold tracking-wide truncate drop-shadow-md">Calling {allCallParticipants.map(p => p.name.split(' ')[0]).join(' & ')}...</h3>
                    </div>
                  </div>
                </div>
              ) : !isConnected && callType === 'AUDIO' ? (
                /* RINGING STATE (NO ONE CONNECTED YET) - AUDIO */
                <div className="w-full h-full flex flex-col items-center justify-center text-center space-y-6 pt-16 pb-28 relative">
                  {/* Dynamic Blurred Background for Audio Calling */}
                  <div className="absolute inset-0 z-0 overflow-hidden bg-black">
                    {callAvatar ? (
                      <>
                        <img src={callAvatar} alt="" className="w-full h-full object-cover opacity-50 filter blur-[80px] scale-150 transform transition-transform duration-[10000ms]" />
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[20px]" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#1a2a3a] to-[#0a1118]" />
                    )}
                  </div>
                  
                  <div className="relative flex items-center justify-center z-10">
                    <div className="flex -space-x-4 mb-2 justify-center">
                      {allCallParticipants.slice(0, 3).map((p) => (
                        <div key={p.userId} className="w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl bg-surface flex items-center justify-center z-10 relative backdrop-blur-md">
                          {p.avatar ? (
                            <img src={p.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-5xl text-white font-semibold">{(p.name || 'U').charAt(0)}</span>
                          )}
                          <div className="absolute inset-0 rounded-full border border-white/30 animate-ping" style={{ animationDuration: '2.5s' }} />
                        </div>
                      ))}
                      {allCallParticipants.length > 3 && (
                        <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full border-4 border-white/20 shadow-2xl bg-black/40 backdrop-blur-md text-white flex items-center justify-center z-10 text-3xl font-semibold">
                          +{allCallParticipants.length - 3}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 relative z-10">
                    <h3 className="text-2xl font-semibold text-white">
                      Calling {allCallParticipants.map(p => p.name.split(' ')[0]).join(' & ')}...
                    </h3>
                    <p className="text-emerald-400 text-xs font-medium">NexusChat Voice Call</p>
                  </div>
                </div>
              ) : gridParticipants.length === 1 ? (
                /* CONNECTED: SINGLE REMOTE PARTICIPANT (FULL BLEED) */
                <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden">
                  {callType === 'VIDEO' ? (
                    gridParticipants[0].stream ? (
                      <VideoPlayer stream={gridParticipants[0].stream} avatar={gridParticipants[0].avatar || ''} name={gridParticipants[0].name || ''} isVideoOff={gridParticipants[0].isVideoOff} />
                    ) : (
                      <div className="w-full h-full relative flex flex-col items-center justify-center bg-black overflow-hidden">
                        <div className="absolute inset-0 z-0 overflow-hidden">
                          {gridParticipants[0].avatar ? (
                            <>
                              <img src={gridParticipants[0].avatar} className="w-full h-full object-cover opacity-30 filter blur-[60px] scale-150 transform transition-transform duration-[10000ms]" />
                              <div className="absolute inset-0 bg-black/50 backdrop-blur-[10px]" />
                            </>
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[#1a2a3a] to-[#0a1118]" />
                          )}
                        </div>
                        <div className="relative z-10 w-32 h-32 rounded-full flex items-center justify-center animate-pulse border-[3px] border-white/20 shadow-2xl mb-6">
                          <div className="w-full h-full rounded-full overflow-hidden bg-surface/50 backdrop-blur-md flex items-center justify-center">
                            {gridParticipants[0].avatar ? (
                              <img src={gridParticipants[0].avatar} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-5xl text-white font-semibold">{gridParticipants[0].name.charAt(0)}</span>
                            )}
                          </div>
                        </div>
                        <h3 className="relative z-10 text-white text-2xl font-semibold drop-shadow-md">{gridParticipants[0].name}</h3>
                        <p className="relative z-10 text-emerald-400 text-sm font-medium animate-pulse mt-2 bg-black/40 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/10 shadow-lg">Connecting...</p>
                      </div>
                    )
                  ) : (
                    /* Audio mode full bleed (same as ringing but without pulse) */
                    <div className="w-full h-full flex flex-col items-center justify-center text-center space-y-6 pt-16 pb-28 bg-chat-bg">
                      <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-full overflow-hidden border-4 border-emerald-500/40 shadow-[0_0_60px_rgba(0,168,132,0.2)] bg-surface flex items-center justify-center">
                        {gridParticipants[0].avatar ? (
                          <img src={gridParticipants[0].avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-5xl text-white/90 font-semibold">{gridParticipants[0].name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-2xl font-semibold text-white flex items-center justify-center gap-2">
                          {gridParticipants[0].name}
                          {gridParticipants[0].isMuted && <MicOff size={18} className="text-danger" />}
                        </h3>
                        <p className="text-emerald-400 text-xs font-medium">NexusChat Voice Call</p>
                      </div>
                    </div>
                  )}

                  {/* Contact Name Label Badge + Calling Indicators */}
                  <div className="absolute top-20 left-4 z-20 flex flex-col space-y-2">
                    <div className="bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white shadow-lg border border-white/10 flex items-center space-x-2 w-max">
                      <span>{gridParticipants[0].name}</span>
                      {gridParticipants[0].isMuted && <MicOff size={14} className="text-danger" />}
                    </div>
                    {/* Show who else is being called */}
                    {allCallParticipants.filter(p => p.isConnecting).map(p => (
                      <div key={p.userId} className="bg-emerald-500/20 backdrop-blur-md px-3.5 py-1.5 rounded-xl text-[11px] font-semibold text-emerald-400 shadow-lg border border-emerald-500/20 flex items-center space-x-2 w-max animate-pulse">
                        <Phone size={12} className="animate-bounce" />
                        <span>Calling {p.name}...</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* CONNECTED: MULTI PARTICIPANT GRID */
                <div className="relative w-full h-full flex flex-col pt-20 pb-36 px-4">
                  {/* Show who else is being called in Grid view */}
                  {allCallParticipants.some(p => p.isConnecting) && (
                    <div className="absolute top-20 left-4 z-20 flex flex-col space-y-2">
                      {allCallParticipants.filter(p => p.isConnecting).map(p => (
                        <div key={p.userId} className="bg-emerald-500/20 backdrop-blur-md px-3.5 py-1.5 rounded-xl text-[11px] font-semibold text-emerald-400 shadow-lg border border-emerald-500/20 flex items-center space-x-2 w-max animate-pulse">
                          <Phone size={12} className="animate-bounce" />
                          <span>Calling {p.name}...</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={cn(
                    "w-full h-full grid gap-3 max-w-7xl mx-auto items-center justify-center transition-all duration-500 px-2 sm:px-4",
                    getGridContainerClass(gridParticipants.length)
                  )}>
                  {gridParticipants.map((item, index) => (
                    <div 
                      key={item.userId} 
                      className={cn(
                        "relative w-full h-full bg-surface rounded-2xl overflow-hidden border border-white/10 shadow-xl flex items-center justify-center min-h-[140px] transition-all duration-500",
                        getTileClass(gridParticipants.length, index)
                      )}
                    >
                      {callType === 'VIDEO' && item.stream ? (
                        <VideoPlayer stream={item.stream} avatar={item.avatar || ''} name={item.name || ''} isVideoOff={item.isVideoOff} />
                      ) : (
                        <div className="w-full h-full relative flex flex-col items-center justify-center bg-black overflow-hidden">
                          <div className="absolute inset-0 z-0 overflow-hidden">
                            {item.avatar ? (
                              <>
                                <img src={item.avatar} className="w-full h-full object-cover opacity-40 filter blur-[40px] scale-150" />
                                <div className="absolute inset-0 bg-black/40 backdrop-blur-[10px]" />
                              </>
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-[#1a2a3a] to-[#0a1118]" />
                            )}
                          </div>
                          
                          {/* Active Speaker / Connecting Ring */}
                          <div className={cn(
                            "relative z-10 w-16 h-16 sm:w-24 sm:h-24 rounded-full flex items-center justify-center transition-all duration-300",
                            item.isConnecting ? "animate-pulse border-2 border-white/30" : 
                            !item.isMuted ? "shadow-[0_0_20px_rgba(52,199,89,0.4)] border-[3px] border-[#34C759] scale-105" : "border-2 border-white/20 shadow-xl"
                          )}>
                            <div className="w-full h-full rounded-full overflow-hidden bg-surface/50 backdrop-blur-md flex items-center justify-center">
                              {item.avatar ? (
                                <img src={item.avatar} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-2xl sm:text-3xl text-white font-semibold">{item.name.charAt(0)}</span>
                              )}
                            </div>
                          </div>
                          {item.isConnecting && (
                            <span className="relative z-10 text-[11px] text-white/70 font-medium mt-3 bg-black/40 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-lg animate-pulse">Connecting...</span>
                          )}
                        </div>
                      )}

                      <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-xl text-xs font-semibold text-white shadow-md">
                        {item.name}
                      </div>

                      <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md p-1.5 rounded-full text-white shadow-md">
                        {item.isMuted ? <MicOff size={14} className="text-danger" /> : <Mic size={14} className="text-emerald-400" />}
                      </div>
                    </div>
                  ))}
                </div>
                </div>
              )}

              {/* Local Video PIP Window */}
              {localStream && callType === 'VIDEO' && isConnected && (
                <motion.div 
                  drag
                  dragMomentum={false}
                  dragConstraints={videoContainerRef}
                  dragElastic={0.1}
                  className="absolute bottom-28 right-4 w-[110px] h-[160px] sm:w-[130px] sm:h-[190px] bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-20 cursor-move"
                  style={{ touchAction: 'none' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} avatar={currentUser?.profilePicture || ''} name={currentUser?.name || ''} />
                  
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
                "absolute bottom-0 left-0 right-0 z-30 transition-all duration-500 pb-4 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none",
                !showControls && "opacity-0 translate-y-12"
              )}
              style={{ 
                paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
                paddingLeft: 'max(16px, env(safe-area-inset-left))',
                paddingRight: 'max(16px, env(safe-area-inset-right))'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pointer-events-auto w-full max-w-[380px] sm:max-w-md mx-auto px-2">
                <div className="bg-[#1c1c1e]/80 backdrop-blur-3xl border border-white/15 rounded-[2.5rem] px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-around shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                  {callType === 'VIDEO' && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={switchCamera}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      title="Switch Camera"
                    >
                      <SwitchCamera size={22} />
                    </motion.button>
                  )}

                  {callType === 'VIDEO' && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={toggleVideo}
                      className={cn(
                        "w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-lg",
                        isVideoOff ? "bg-[#FF3B30] text-white" : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                      title={isVideoOff ? "Turn Video On" : "Turn Video Off"}
                    >
                      {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
                    </motion.button>
                  )}
                  
                  {callType === 'VIDEO' && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={toggleScreenShare}
                      className={cn(
                        "hidden sm:flex w-12 h-12 sm:w-14 sm:h-14 rounded-full items-center justify-center transition-colors cursor-pointer shrink-0 shadow-lg",
                        isScreenSharing ? "bg-[#34C759] text-white" : "bg-white/10 hover:bg-white/20 text-white"
                      )}
                      title={isScreenSharing ? "Stop Screen Share" : "Share Screen (Desktop only)"}
                    >
                      <Monitor size={22} />
                    </motion.button>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleMute}
                    className={cn(
                      "w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-lg",
                      isMuted ? "bg-[#FF3B30] text-white" : "bg-white/10 hover:bg-white/20 text-white"
                    )}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAddParticipant(true)}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    title="Add Contact"
                  >
                    <UserPlus size={22} />
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn(
                      "w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-lg",
                      isRecording ? "bg-red-500 animate-pulse text-white" : "bg-white/10 hover:bg-white/20 text-white"
                    )}
                    title={isRecording ? "Stop Recording" : "Record Call"}
                  >
                    {isRecording ? <Square size={18} fill="currentColor" /> : <Circle size={22} />}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleEndCall}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#FF3B30] hover:bg-[#FF3B30]/90 text-white flex items-center justify-center shadow-[0_0_20px_rgba(255,59,48,0.4)] transition-colors cursor-pointer shrink-0 ml-1"
                    title="End Call"
                  >
                    <PhoneOff size={26} />
                  </motion.button>
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
                className="bg-background border border-surface-border w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden z-10 relative max-h-[80vh] flex flex-col"
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
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-semibold overflow-hidden">
                            {currentUser?.profilePicture ? (
                              <img src={currentUser.profilePicture} className="w-full h-full object-cover" />
                            ) : (
                              currentUser?.name?.charAt(0) || 'Y'
                            )}
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
                        if (!other || other.userId === 'nexus-ai-system') return null;
                        const name = other.user?.name || other.user?.phoneNumber || 'Contact';
                        const targetId = other.userId;
                        const isInvited = invitedUserIds.includes(targetId) || roomParticipants[targetId];
                        const isJoined = roomParticipants[targetId]?.status === 'CONNECTED' || remoteStreams[targetId];
                        if (isJoined) return null; // Already in Connected section
                        
                        const status = roomParticipants[targetId]?.status;
                        let displayStatus = 'Tap to add';
                        if (isInvited) {
                           if (status === 'RINGING') displayStatus = 'Ringing...';
                           else displayStatus = 'Calling...';
                        }

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
                                <p className={cn("text-xs font-medium", isInvited ? "text-emerald-400 animate-pulse" : "text-white/50")}>{displayStatus}</p>
                              </div>
                            </div>
                            {isInvited ? (
                              <button
                                onClick={() => {
                                  if (localStream) {
                                    if (peersRef.current[targetId]) {
                                      try { peersRef.current[targetId].destroy(); } catch(e) {}
                                      delete peersRef.current[targetId];
                                      removePeer(targetId);
                                      removeRemoteStream(targetId);
                                    }
                                    createPeer(targetId, localStream, true);
                                    if (socket && activeCallChatId) {
                                      socket.emit('join-call-room', { chatId: activeCallChatId, type: callType });
                                    }
                                  }
                                }}
                                className="w-8 h-8 rounded-full bg-surface-hover hover:bg-surface text-emerald-400 flex items-center justify-center transition-colors cursor-pointer"
                                title="Ring Again"
                              >
                                <BellRing size={16} />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                if (localStream && !isInvited) {
                                  setInvitedUserIds(prev => [...prev, targetId]);
                                  createPeer(targetId, localStream, true);
                                  if (socket && activeCallChatId) {
                                    socket.emit('call-invite-participant', { chatId: activeCallChatId, targetUserId: targetId });
                                    socket.emit('join-call-room', { chatId: activeCallChatId, type: callType });
                                  }
                                }
                              }}
                              className={cn(
                                "px-4 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer",
                                isInvited ? "bg-white/10 text-white/60 cursor-default" : "bg-emerald-500 hover:bg-emerald-600 text-white"
                              )}
                            >
                              {isInvited ? 'Invited' : 'Add'}
                              </button>
                            )}
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
