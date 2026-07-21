'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { Instance } from 'simple-peer';
import { useCallStore } from '../../store/useCallStore';
import { useChatStore } from '../../store/useChatStore';
import { useAuthStore } from '../../store/useAuthStore';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from 'lucide-react';

const VideoPlayer = ({ stream, isLocal = false, isVideoOff = false }: { stream: MediaStream; isLocal?: boolean, isVideoOff?: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`} />
      {isVideoOff && (
        <div className="w-full h-full flex items-center justify-center bg-[#202C33]">
          <VideoOff size={32} className="text-[#8696A0]" />
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
  const socket = useChatStore(state => state.socket);
  const chats = useChatStore(state => state.chats);
  const currentUser = useAuthStore(state => state.user);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Ringtone using Web Audio API
  const ringtoneCtxRef = useRef<AudioContext | null>(null);
  const ringtoneStopRef = useRef<(() => void) | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringtoneStopRef.current) {
      ringtoneStopRef.current();
      ringtoneStopRef.current = null;
    }
    if (ringtoneCtxRef.current) {
      ringtoneCtxRef.current.close().catch(() => {});
      ringtoneCtxRef.current = null;
    }
  }, []);

  const startRingtone = useCallback(() => {
    stopRingtone();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ringtoneCtxRef.current = ctx;
      let stopped = false;

      const playRing = () => {
        if (stopped || !ringtoneCtxRef.current) return;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
        osc1.frequency.value = 480; osc2.frequency.value = 620;
        osc1.type = 'sine'; osc2.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + 0.35);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        osc1.start(ctx.currentTime); osc2.start(ctx.currentTime);
        osc1.stop(ctx.currentTime + 0.4); osc2.stop(ctx.currentTime + 0.4);
        // second beep
        const osc3 = ctx.createOscillator();
        const osc4 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc3.connect(gain2); osc4.connect(gain2); gain2.connect(ctx.destination);
        osc3.frequency.value = 480; osc4.frequency.value = 620;
        osc3.type = 'sine'; osc4.type = 'sine';
        gain2.gain.setValueAtTime(0, ctx.currentTime + 0.5);
        gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.55);
        gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.85);
        gain2.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.9);
        osc3.start(ctx.currentTime + 0.5); osc4.start(ctx.currentTime + 0.5);
        osc3.stop(ctx.currentTime + 0.9); osc4.stop(ctx.currentTime + 0.9);
        // repeat every 3s
        const timerId = setTimeout(playRing, 3000);
        ringtoneStopRef.current = () => { stopped = true; clearTimeout(timerId); };
      };
      playRing();
    } catch (e) {
      console.warn('Ringtone not supported', e);
    }
  }, [stopRingtone]);

  // Play ringtone when call is incoming, stop when answered/ended
  useEffect(() => {
    if (isReceivingCall && !isCalling) {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [isReceivingCall, isCalling, startRingtone, stopRingtone]);

  // Use refs so callbacks in useEffect always see fresh values without triggering re-runs
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallChatIdRef = useRef<string | null>(null);
  const callTypeRef = useRef<'AUDIO' | 'VIDEO' | null>(null);
  const peersRef = useRef<Record<string, Instance>>({});

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { activeCallChatIdRef.current = activeCallChatId; }, [activeCallChatId]);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);
  useEffect(() => { peersRef.current = peers; }, [peers]);

  // Timer
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
    // Don't create duplicate peers
    if (peersRef.current[targetUserId]) {
      console.log('Peer already exists for', targetUserId);
      return peersRef.current[targetUserId];
    }

    const peer = new Peer({
      initiator,
      trickle: true,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
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
        // ICE candidates
        socket.emit('ice-candidate', {
          chatId: activeCallChatIdRef.current,
          targetUserId,
          candidate: data
        });
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

    addPeer(targetUserId, peer);
    return peer;
  }, [socket, addRemoteStream, removePeer, removeRemoteStream, addPeer]);

  // Handle Socket Events - stable dependency on socket only, use refs for other values
  useEffect(() => {
    if (!socket) return;

    const handleCallOffer = async (data: { callerId: string, callerName?: string, signalData: any, chatId: string, type: 'AUDIO'|'VIDEO' }) => {
      const state = useCallStore.getState();
      
      // If already in same call (group), answer the offer from new participant
      if (state.isCalling && state.activeCallChatId === data.chatId && localStreamRef.current) {
        // Don't create duplicate peer
        if (!peersRef.current[data.callerId]) {
          createPeer(data.callerId, localStreamRef.current, false, data.signalData);
        }
        return;
      }
      
      if (state.isCalling) return; // in different call, ignore
      
      const displayName = data.callerName || data.callerId;
      useCallStore.getState().setIncomingCall(displayName, data.type, data.chatId, { ...data });
    };

    const handleCallAnswer = (data: { signalData: any, callerId: string }) => {
      const peer = peersRef.current[data.callerId];
      if (peer) {
        peer.signal(data.signalData);
      }
    };

    const handleCallEnd = (data: { callerId: string }) => {
      if (data?.callerId) {
        removePeer(data.callerId);
        removeRemoteStream(data.callerId);
        if (Object.keys(peersRef.current).length === 0) {
          endCall();
        }
      } else {
        endCall();
      }
    };

    const handleIceCandidate = (data: { candidate: any, callerId: string }) => {
      const peer = peersRef.current[data.callerId];
      if (peer) {
        peer.signal(data.candidate);
      }
    };

    const handleGroupCallParticipants = (data: { chatId: string, participants: string[] }) => {
      if (!localStreamRef.current || !activeCallChatIdRef.current || activeCallChatIdRef.current !== data.chatId) return;
      const offer = useCallStore.getState().pendingOffer;
      const callerIdToSkip = offer?.callerId;
      data.participants.forEach(userId => {
        if (userId !== currentUser?.id && userId !== callerIdToSkip && !peersRef.current[userId]) {
          createPeer(userId, localStreamRef.current!, true);
        }
      });
    };

    socket.on('call-offer', handleCallOffer);
    socket.on('call-answer', handleCallAnswer);
    socket.on('call-end', handleCallEnd);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('group-call-participants', handleGroupCallParticipants);

    return () => {
      socket.off('call-offer', handleCallOffer);
      socket.off('call-answer', handleCallAnswer);
      socket.off('call-end', handleCallEnd);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('group-call-participants', handleGroupCallParticipants);
    };
  }, [socket, createPeer, endCall, removePeer, removeRemoteStream, currentUser]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsMuted(prev => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStream && callType === 'VIDEO') {
      localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsVideoOff(prev => !prev);
    }
  };

  const handleEndCall = () => {
    stopRingtone();
    if (socket && activeCallChatId) {
      socket.emit('end-call', { chatId: activeCallChatId, duration: elapsedSeconds, type: callType, isInitiator });
      socket.emit('group-call-leave', { chatId: activeCallChatId });
    }
    endCall();
  };

  const answerCall = async () => {
    stopRingtone();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'VIDEO',
        audio: true
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      acceptCall();

      const offer = useCallStore.getState().pendingOffer;
      if (offer?.callerId) {
        createPeer(offer.callerId, stream, false, offer.signalData);
      }

      if (socket && activeCallChatId) {
        socket.emit('group-call-join', { chatId: activeCallChatId });
      }
      useCallStore.setState({ pendingOffer: null });
    } catch (err) {
      console.error('Failed to get media permissions', err);
      alert('Camera/Microphone permission denied. Please allow it in your browser settings.');
      handleEndCall();
    }
  };

  // Initiator starts the call
  useEffect(() => {
    if (isCalling && isInitiator && activeCallChatId && currentUser && Object.keys(peers).length === 0) {
      const startCall = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: callType === 'VIDEO',
            audio: true
          });
          setLocalStream(stream);
          localStreamRef.current = stream;

          const chat = chats.find(c => c.id === activeCallChatId);
          if (chat) {
            if (chat.isGroup) {
              socket?.emit('group-call-join', { chatId: activeCallChatId });
            }
            chat.participants?.forEach((p: any) => {
              if (p.userId !== currentUser.id) {
                createPeer(p.userId, stream, true);
              }
            });
          }
        } catch (err) {
          console.error('Failed to get media permissions', err);
          alert('Camera/Microphone permission denied. Please allow it in your browser settings.');
          handleEndCall();
        }
      };
      startCall();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCalling, isInitiator, activeCallChatId, currentUser]);

  if (!isCalling && !isReceivingCall) return null;

  const remoteStreamEntries = Object.entries(remoteStreams);
  const gridCols = remoteStreamEntries.length > 1 ? 'grid-cols-2' : 'grid-cols-1';

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
  const callAvatar = getCallAvatar();
  const callDisplayName = getCallName();

  return (
    <div className="absolute inset-0 z-50 bg-[#0B141A]/95 flex flex-col items-center justify-center backdrop-blur-sm">
      
      {/* Receiving Call UI */}
      {isReceivingCall && !isCalling && (
        <div className="bg-[#111B21]/95 p-12 rounded-[2rem] flex flex-col items-center space-y-10 shadow-2xl border border-[#222D34] w-[400px]">
          <div className="w-32 h-32 bg-[#00A884]/20 rounded-full flex items-center justify-center animate-pulse">
            <div className="w-24 h-24 bg-[#00A884] rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(0,168,132,0.6)] overflow-hidden">
              {callAvatar ? (
                <img src={callAvatar} alt="Caller" className="w-full h-full object-cover" />
              ) : (
                callType === 'VIDEO' ? <Video size={48} className="text-white" /> : <Phone size={48} className="text-white" />
              )}
            </div>
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-semibold text-[#E9EDEF] tracking-tight truncate max-w-[300px]">{callDisplayName}</h2>
            <p className="text-lg text-[#00A884] font-medium tracking-wide">Incoming {callType?.toLowerCase()} call</p>
          </div>
          <div className="flex space-x-12 pt-6">
            <button onClick={handleEndCall} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-all hover:scale-110 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
              <PhoneOff size={28} className="text-white" />
            </button>
            <button onClick={answerCall} className="w-16 h-16 bg-[#00A884] rounded-full flex items-center justify-center hover:bg-[#029676] transition-all hover:scale-110 shadow-[0_0_20px_rgba(0,168,132,0.4)] animate-bounce">
              <Phone size={28} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* Outgoing / Active Call UI */}
      {isCalling && (
        <div className="w-full h-full max-w-5xl max-h-[800px] flex flex-col p-4">
          
          {/* Top Bar */}
          <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 shadow-lg">
            <span className="text-white/90 text-sm font-medium mb-0.5">{callDisplayName}</span>
            <span className="text-white font-mono text-lg tracking-wider">
              {remoteStreamEntries.length > 0
                ? `${Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}`
                : 'Calling...'}
            </span>
          </div>

          <div className="flex-1 relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-[#222D34] mt-16 flex">
            {callType === 'VIDEO' ? (
              <>
                {/* Remote video - full screen */}
                {remoteStreamEntries.length > 0 ? (
                  <div className={`w-full h-full grid ${gridCols} gap-2 p-2 bg-[#111B21]`}>
                    {remoteStreamEntries.map(([userId, stream]) => (
                      <div key={userId} className="relative w-full h-full bg-black rounded-xl overflow-hidden shadow-lg border border-white/10">
                        <VideoPlayer stream={stream} />
                        <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-full text-white/90 text-sm backdrop-blur-md">
                          Participant
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[#8696A0]">
                    <div className="w-24 h-24 bg-[#202C33] rounded-full flex items-center justify-center mb-4">
                      {callAvatar ? <img src={callAvatar} alt="" className="w-full h-full object-cover rounded-full" /> : <Video size={40} />}
                    </div>
                    <p className="text-lg">Connecting video...</p>
                  </div>
                )}

                {/* Local camera - single PiP, bottom right */}
                {localStream && (
                  <div className="absolute bottom-4 right-4 w-36 h-48 bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 z-20">
                    <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} />
                    <span className="absolute bottom-1 left-0 right-0 text-center text-white/70 text-xs">You</span>
                  </div>
                )}
              </>
            ) : (
              /* Audio call */
              <div className="w-full h-full flex flex-col items-center justify-center text-[#E9EDEF]">
                <div className="relative flex items-center justify-center mb-12 mt-10">
                  <div className="absolute w-40 h-40 bg-[#00A884] rounded-full animate-ping opacity-20"></div>
                  <div className="absolute w-56 h-56 bg-[#00A884]/10 rounded-full animate-pulse"></div>
                  <div className="relative z-10 w-40 h-40 bg-gradient-to-br from-[#111B21] to-[#202C33] rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(0,168,132,0.15)] overflow-hidden border-[3px] border-[#00A884]/40">
                    {callAvatar ? (
                      <img src={callAvatar} alt="Caller" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-7xl text-white font-light drop-shadow-xl">{callDisplayName.charAt(0)}</span>
                    )}
                  </div>
                </div>
                <h2 className="text-4xl font-semibold mb-6 tracking-tight drop-shadow-md">{callDisplayName}</h2>
                {remoteStreamEntries.length > 0 && (
                  <div className="bg-[#111B21]/80 px-8 py-3 rounded-full border border-[#222D34] shadow-inner flex items-center space-x-3">
                    <div className="w-2 h-2 rounded-full bg-[#00A884] animate-pulse"></div>
                    <p className="text-[#00A884] text-2xl font-mono tracking-widest font-medium">
                      {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:
                      {(elapsedSeconds % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                )}
                {/* Hidden audio players */}
                <div className="hidden">
                  {remoteStreamEntries.map(([userId, stream]) => (
                    <VideoPlayer key={userId} stream={stream} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Call Controls */}
          <div className="h-24 mt-4 flex items-center justify-center space-x-6">
            <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors shadow-lg ${isMuted ? 'bg-white text-black' : 'bg-[#202C33] text-white hover:bg-[#2A3942]'}`}>
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            
            {callType === 'VIDEO' && (
              <button onClick={toggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors shadow-lg ${isVideoOff ? 'bg-white text-black' : 'bg-[#202C33] text-white hover:bg-[#2A3942]'}`}>
                {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
              </button>
            )}

            <button onClick={handleEndCall} className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20">
              <PhoneOff size={28} className="text-white" />
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
