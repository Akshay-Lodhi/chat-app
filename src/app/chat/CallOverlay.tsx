'use client';

import React, { useEffect, useRef, useState } from 'react';
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

  // Timer logic
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

  const createPeer = (userId: string, stream: MediaStream, initiator: boolean, offerData?: any) => {
    const peer = new Peer({
      initiator,
      trickle: true,
      stream,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    peer.on('signal', (data) => {
      if (data.type === 'offer' || data.type === 'answer') {
        if (initiator) {
          socket?.emit('call-offer', {
            chatId: activeCallChatId,
            targetUserId: userId,
            signalData: data,
            type: callType
          });
        } else {
          socket?.emit('call-answer', {
            chatId: activeCallChatId,
            targetUserId: userId,
            signalData: data
          });
        }
      } else {
        // ICE candidates
        socket?.emit('ice-candidate', {
          chatId: activeCallChatId,
          targetUserId: userId,
          candidate: data
        });
      }
    });

    peer.on('stream', (remoteStream) => {
      addRemoteStream(userId, remoteStream);
    });

    if (!initiator && offerData) {
      peer.signal(offerData.signalData);
    }

    addPeer(userId, peer);
    return peer;
  };

  // Handle Socket Events for Signaling
  useEffect(() => {
    if (!socket) return;

    const handleCallOffer = async (data: { callerId: string, callerName?: string, signalData: any, chatId: string, type: 'AUDIO'|'VIDEO' }) => {
      // If we are already in a call and it's the SAME call, we just create a peer and answer
      if (isCalling && activeCallChatId === data.chatId && localStream) {
        createPeer(data.callerId, localStream, false, data);
        return;
      }
      if (isCalling) return;
      const displayName = data.callerName || data.callerId;
      useCallStore.getState().setIncomingCall(displayName, data.type, data.chatId, { ...data, signalData: data.signalData });
    };

    const handleCallAnswer = (data: { signalData: any, callerId: string }) => {
      const peer = useCallStore.getState().peers[data.callerId];
      if (peer) {
        peer.signal(data.signalData);
      }
    };

    const handleCallEnd = (data: { callerId: string }) => {
      if (data && data.callerId) {
        useCallStore.getState().removePeer(data.callerId);
        useCallStore.getState().removeRemoteStream(data.callerId);
        // If everyone left, end call
        if (Object.keys(useCallStore.getState().peers).length === 0 && !isReceivingCall) {
          endCall();
        }
      } else {
        endCall();
      }
    };

    const handleIceCandidate = (data: { candidate: any, callerId: string }) => {
      const peer = useCallStore.getState().peers[data.callerId];
      if (peer) {
        peer.signal(data.candidate);
      }
    };

    const handleGroupCallParticipants = (data: { chatId: string, participants: string[] }) => {
      // If we joined, we receive a list of participants already in the call.
      // We must initiate offers to everyone in this list EXCEPT the one who called us.
      if (!localStream || !activeCallChatId || activeCallChatId !== data.chatId) return;

      const offer = useCallStore.getState().pendingOffer;
      const callerIdToSkip = offer?.callerId;

      data.participants.forEach(userId => {
        if (userId !== currentUser?.id && userId !== callerIdToSkip && !useCallStore.getState().peers[userId]) {
          createPeer(userId, localStream, true);
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
  }, [socket, isCalling, endCall, isReceivingCall, activeCallChatId, localStream]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks()[0].enabled = !localStream.getAudioTracks()[0].enabled;
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream && callType === 'VIDEO') {
      localStream.getVideoTracks()[0].enabled = !localStream.getVideoTracks()[0].enabled;
      setIsVideoOff(!isVideoOff);
    }
  };

  const handleEndCall = () => {
    if (socket && activeCallChatId) {
      socket.emit('end-call', { 
        chatId: activeCallChatId, 
        duration: elapsedSeconds, 
        type: callType,
        isInitiator 
      });
      socket.emit('group-call-leave', { chatId: activeCallChatId });
    }
    endCall();
  };

  const answerCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'VIDEO',
        audio: true
      });
      setLocalStream(stream);
      acceptCall();

      const offer = useCallStore.getState().pendingOffer;
      if (offer && offer.callerId) {
        createPeer(offer.callerId, stream, false, offer);
      }
      
      // Emit group-call-join so server sends us existing participants and adds us to active list
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

  // When isCalling becomes true and we are the initiator, start the call with everyone in the chat
  useEffect(() => {
    if (isCalling && isInitiator && activeCallChatId && currentUser && Object.keys(peers).length === 0) {
      const startCall = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: callType === 'VIDEO',
            audio: true
          });
          setLocalStream(stream);

          const chat = chats.find(c => c.id === activeCallChatId);
          if (chat) {
            if (chat.isGroup) {
              if (socket) socket.emit('group-call-join', { chatId: activeCallChatId });
            }
            chat.participants.forEach(p => {
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
  }, [isCalling, isInitiator, activeCallChatId, currentUser, chats]);

  if (!isCalling && !isReceivingCall) return null;

  const remoteStreamEntries = Object.entries(remoteStreams);
  const gridCols = remoteStreamEntries.length > 1 ? 'grid-cols-2' : 'grid-cols-1';

  const activeChat = chats.find(c => c.id === activeCallChatId);
  const getCallAvatar = () => {
    if (activeChat?.isGroup) return activeChat.groupPicture || null;
    const other = activeChat?.participants?.find((p: any) => p.userId !== currentUser?.id);
    return other?.user?.profilePicture || null;
  };
  const getCallName = () => {
    if (activeChat?.isGroup) return activeChat.name || 'Group Call';
    const other = activeChat?.participants?.find((p: any) => p.userId !== currentUser?.id);
    return other?.user?.name || other?.user?.phoneNumber || caller || 'Unknown';
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

      {/* Outgoing Call UI */}
      {isCalling && remoteStreamEntries.length === 0 && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-32 h-32 bg-[#202C33] rounded-full flex items-center justify-center mb-8 shadow-2xl overflow-hidden">
            {callAvatar ? (
              <img src={callAvatar} alt="Caller" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl text-white font-light">{callDisplayName.charAt(0)}</span>
            )}
          </div>
          <h2 className="text-5xl font-semibold text-white mb-4 tracking-tight drop-shadow-md">{callDisplayName}</h2>
          <p className="text-xl text-white/60 tracking-widest font-light">Calling...</p>
        </div>
      )}

      {/* Active Call UI */}
      {isCalling && (
        <div className="w-full h-full max-w-5xl max-h-[800px] flex flex-col p-4">
          
          {/* Top Bar with Timer */}
          {callType === 'VIDEO' && (
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center bg-black/40 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 shadow-lg">
              <span className="text-white/90 text-sm font-medium mb-0.5">{callDisplayName}</span>
              <span className="text-white font-mono text-lg tracking-wider">
                {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:
                {(elapsedSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}

          <div className="flex-1 relative bg-black rounded-2xl overflow-hidden shadow-2xl border border-[#222D34] mt-12 flex">
            {/* Remote Videos Grid */}
            {callType === 'VIDEO' ? (
              remoteStreamEntries.length > 0 ? (
                <div className={`w-full h-full relative`}>
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
                  
                  {/* Local Stream PiP */}
                  {localStream && (
                    <div className="absolute top-4 right-4 w-32 md:w-48 aspect-[3/4] bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-[#202C33] z-20">
                      <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-[#8696A0]">
                  <div className="w-24 h-24 bg-[#202C33] rounded-full flex items-center justify-center mb-4">
                    <Video size={40} />
                  </div>
                  <p>Connecting to Video...</p>
                  
                  {/* Show local camera while waiting */}
                  {localStream && (
                    <div className="absolute top-4 right-4 w-32 md:w-48 aspect-[3/4] bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-[#202C33] z-20">
                      <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} />
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[#E9EDEF]">
                <div className="relative flex items-center justify-center mb-12 mt-10">
                  <div className="absolute w-40 h-40 bg-[#00A884] rounded-full animate-ping opacity-20"></div>
                  <div className="absolute w-56 h-56 bg-[#00A884]/10 rounded-full animate-pulse"></div>
                  <div className="absolute w-72 h-72 border border-[#00A884]/5 rounded-full animate-pulse" style={{ animationDuration: '3s' }}></div>
                  <div className="relative z-10 w-40 h-40 bg-gradient-to-br from-[#111B21] to-[#202C33] rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(0,168,132,0.15)] overflow-hidden border-[3px] border-[#00A884]/40">
                    {callAvatar ? (
                      <img src={callAvatar} alt="Caller" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-7xl text-white font-light drop-shadow-xl">{callDisplayName.charAt(0)}</span>
                    )}
                  </div>
                </div>
                <h2 className="text-4xl font-semibold mb-6 tracking-tight drop-shadow-md">{callDisplayName}</h2>
                <div className="bg-[#111B21]/80 px-8 py-3 rounded-full border border-[#222D34] shadow-inner flex items-center space-x-3">
                  <div className="w-2 h-2 rounded-full bg-[#00A884] animate-pulse"></div>
                  <p className="text-[#00A884] text-2xl font-mono tracking-widest font-medium">
                    {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:
                    {(elapsedSeconds % 60).toString().padStart(2, '0')}
                  </p>
                </div>
                {/* Audio streams */}
                <div className="hidden">
                  {remoteStreamEntries.map(([userId, stream]) => (
                    <VideoPlayer key={userId} stream={stream} />
                  ))}
                </div>
              </div>
            )}

            {/* Local Video Picture-in-Picture */}
            {callType === 'VIDEO' && localStream && (
              <div className="absolute bottom-6 right-6 w-48 h-72 bg-gray-800 rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl z-10">
                <VideoPlayer stream={localStream} isLocal={true} isVideoOff={isVideoOff} />
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
