'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Hand, MessageSquare,
  Users, Copy, PhoneOff, Shield, Check, X, Sparkles, AlertCircle, Loader2, Volume2, Upload, Camera
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { apiClient } from '@/lib/apiClient';
import { getSocket } from '../../../lib/socket';

interface MeetingInfo {
  id: string;
  code: string;
  title: string;
  callType: string;
  requiresApproval: boolean;
  isActive: boolean;
  host: {
    id: string;
    name: string | null;
    profilePicture: string | null;
  };
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=250&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=250&q=80'
];

export default function InstantMeetingPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const { user } = useAuthStore();

  const [meeting, setMeeting] = useState<MeetingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pre-join Lobby States
  const [inLobby, setInLobby] = useState(true);
  const [isWaitingRoom, setIsWaitingRoom] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [customAvatar, setCustomAvatar] = useState<string | null>(null);

  // Media States
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [activeRemoteStreams, setActiveRemoteStreams] = useState<Record<string, boolean>>({});

  // In-Meeting UI drawers
  const [showParticipantsDrawer, setShowParticipantsDrawer] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Meeting Participants
  const [participants, setParticipants] = useState<any[]>([]);
  const [waitingGuests, setWaitingGuests] = useState<any[]>([]);
  const [isHost, setIsHost] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());

  // Auto-sync name/avatar on mount
  useEffect(() => {
    if (user) {
      setGuestName(user.name || user.phoneNumber || 'User');
      setCustomAvatar(user.profilePicture || (user as any)?.image || null);
    } else {
      setGuestName(`Guest ${Math.floor(100 + Math.random() * 900)}`);
    }
  }, [user]);

  // 1. Fetch Meeting Details on Mount
  useEffect(() => {
    if (!code) return;
    const fetchInfo = async () => {
      try {
        const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
        const res = await apiClient(`${SERVER_URL}/api/meetings/${code}`);
        if (!res.ok) {
          throw new Error('Meeting not found or has expired');
        }
        const data = await res.json();
        setMeeting(data);
        if (user && data.hostId === user.id) {
          setIsHost(true);
        }
      } catch (err: any) {
        setError(err.message || 'Invalid meeting link');
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [code, user]);

  // 2. Setup Local Camera/Mic Stream
  useEffect(() => {
    const startLocalMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Apply initial mic/video enable toggles
        stream.getVideoTracks().forEach(t => (t.enabled = isVideoOn));
        stream.getAudioTracks().forEach(t => (t.enabled = isMicOn));

        // Attach tracks to any peer connections initialized prior to stream readiness
        peerConnectionsRef.current.forEach(pc => {
          const senders = pc.getSenders();
          stream.getTracks().forEach(track => {
            const exists = senders.some(s => s.track && s.track.kind === track.kind);
            if (!exists) {
              pc.addTrack(track, stream);
            }
          });
        });
      } catch (err) {
        console.warn('Could not access camera/mic:', err);
      }
    };

    startLocalMedia();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Update track enabled states when mic/video toggling
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => (t.enabled = isVideoOn));
    }
  }, [isVideoOn]);

  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = isMicOn));
    }
  }, [isMicOn]);

  // WebRTC Peer Connection Helper
  const getOrCreatePeerConnection = (targetSocketId: string) => {
    if (peerConnectionsRef.current.has(targetSocketId)) {
      return peerConnectionsRef.current.get(targetSocketId)!;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      let remoteStream = remoteStreamsRef.current.get(targetSocketId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteStreamsRef.current.set(targetSocketId, remoteStream);
      }

      if (event.track) {
        remoteStream.addTrack(event.track);
      } else if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach(t => remoteStream!.addTrack(t));
      }

      setActiveRemoteStreams(prev => ({ ...prev, [targetSocketId]: true }));

      const vidElem = remoteVideoRefs.current.get(targetSocketId);
      if (vidElem) {
        vidElem.srcObject = remoteStream;
        vidElem.play().catch(err => console.warn('Video play error:', err));
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const socket = getSocket();
        if (socket) {
          socket.emit('meeting-signal-candidate', {
            code,
            targetSocketId,
            candidate: event.candidate
          });
        }
      }
    };

    peerConnectionsRef.current.set(targetSocketId, pc);
    return pc;
  };

  // 3. Socket Listeners for Instant Meeting Events & WebRTC
  useEffect(() => {
    const socket = getSocket();
    if (!socket || inLobby) return;

    socket.on('instant-meeting-admitted', async (data: any) => {
      setInLobby(false);
      setIsWaitingRoom(false);
      setIsHost(data.isHost);

      if (data.existingParticipants && Array.isArray(data.existingParticipants)) {
        setParticipants(data.existingParticipants);

        // Initiate WebRTC peer connections to all existing room participants
        for (const p of data.existingParticipants) {
          try {
            const pc = getOrCreatePeerConnection(p.socketId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.emit('meeting-signal-offer', {
              code,
              targetSocketId: p.socketId,
              offer,
              callerName: guestName,
              callerAvatar: customAvatar,
              isHost: data.isHost
            });
          } catch (err) {
            console.error('Error connecting to existing participant:', err);
          }
        }
      }
    });

    socket.on('meeting-waiting-approval', () => {
      setInLobby(false);
      setIsWaitingRoom(true);
    });

    socket.on('meeting-guest-waiting', (guestData: any) => {
      setWaitingGuests(prev => [...prev.filter(g => g.socketId !== guestData.socketId), guestData]);
    });

    socket.on('meeting-participant-joined', async (participant: any) => {
      setParticipants(prev => [...prev.filter(p => p.socketId !== participant.socketId), participant]);

      // Create WebRTC Offer for newly joined participant
      try {
        const pc = getOrCreatePeerConnection(participant.socketId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit('meeting-signal-offer', {
          code,
          targetSocketId: participant.socketId,
          offer,
          callerName: guestName,
          callerAvatar: customAvatar,
          isHost
        });
      } catch (err) {
        console.error('Error creating WebRTC offer:', err);
      }
    });

    // Handle incoming WebRTC Offer
    socket.on('meeting-signal-offer', async ({ callerSocketId, offer, callerName, callerAvatar, isHost: callerIsHost }: any) => {
      setParticipants(prev => [
        ...prev.filter(p => p.socketId !== callerSocketId),
        { socketId: callerSocketId, userName: callerName, userAvatar: callerAvatar, isHost: callerIsHost }
      ]);

      try {
        const pc = getOrCreatePeerConnection(callerSocketId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('meeting-signal-answer', {
          code,
          targetSocketId: callerSocketId,
          answer
        });
      } catch (err) {
        console.error('Error handling WebRTC offer:', err);
      }
    });

    // Handle incoming WebRTC Answer
    socket.on('meeting-signal-answer', async ({ responderSocketId, answer }: any) => {
      try {
        const pc = peerConnectionsRef.current.get(responderSocketId);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (err) {
        console.error('Error handling WebRTC answer:', err);
      }
    });

    // Handle incoming ICE Candidate
    socket.on('meeting-signal-candidate', async ({ senderSocketId, candidate }: any) => {
      try {
        const pc = peerConnectionsRef.current.get(senderSocketId);
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('Error handling ICE candidate:', err);
      }
    });

    socket.on('meeting-participant-left', ({ socketId }: any) => {
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
      setActiveRemoteStreams(prev => {
        const copy = { ...prev };
        delete copy[socketId];
        return copy;
      });
      if (peerConnectionsRef.current.has(socketId)) {
        peerConnectionsRef.current.get(socketId)?.close();
        peerConnectionsRef.current.delete(socketId);
      }
      remoteStreamsRef.current.delete(socketId);
    });

    socket.on('meeting-entry-denied', () => {
      setError('Host declined your entry request to this meeting.');
      setInLobby(true);
      setIsWaitingRoom(false);
    });

    socket.on('meeting-muted-by-host', () => {
      setIsMicOn(false);
    });

    socket.on('meeting-kicked-by-host', () => {
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
      remoteStreamsRef.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      alert('You have been removed from this meeting by the host.');
      window.location.href = '/chat';
    });

    socket.on('meeting-hand-updated', ({ socketId, isRaised }: any) => {
      setParticipants(prev =>
        prev.map(p => (p.socketId === socketId ? { ...p, isHandRaised: isRaised } : p))
      );
    });

    socket.on('meeting-chat-received', (msg: any) => {
      setChatMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.off('instant-meeting-admitted');
      socket.off('meeting-waiting-approval');
      socket.off('meeting-guest-waiting');
      socket.off('meeting-participant-joined');
      socket.off('meeting-signal-offer');
      socket.off('meeting-signal-answer');
      socket.off('meeting-signal-candidate');
      socket.off('meeting-participant-left');
      socket.off('meeting-entry-denied');
      socket.off('meeting-muted-by-host');
      socket.off('meeting-kicked-by-host');
      socket.off('meeting-hand-updated');
      socket.off('meeting-chat-received');
    };
  }, [inLobby, router, guestName, customAvatar]);

  // Screen Share Handler
  const screenStreamRef = useRef<MediaStream | null>(null);

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);

      if (localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }

        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
        });
      }
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);

        const screenTrack = screenStream.getVideoTracks()[0];
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        peerConnectionsRef.current.forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });

        screenTrack.onended = () => {
          if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
          }
          setIsScreenSharing(false);
          if (localStreamRef.current) {
            const vTrack = localStreamRef.current.getVideoTracks()[0];
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = localStreamRef.current;
            }
            peerConnectionsRef.current.forEach(pc => {
              const sender = pc.getSenders().find(s => s.track?.kind === 'video');
              if (sender && vTrack) {
                sender.replaceTrack(vTrack);
              }
            });
          }
        };
      } catch (err) {
        console.warn('Screen share cancelled:', err);
      }
    }
  };

  // Image Upload Handler in Lobby
  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Join Action
  const handleJoinClick = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('join-instant-meeting', {
      code,
      userName: guestName || 'Participant',
      userAvatar: customAvatar
    });

    setInLobby(false);
  };

  const handleCopyLink = () => {
    const fullUrl = window.location.href;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleApproveGuest = (guestSocketId: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('approve-meeting-guest', { code, guestSocketId });
      setWaitingGuests(prev => prev.filter(g => g.socketId !== guestSocketId));
    }
  };

  const handleRejectGuest = (guestSocketId: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('reject-meeting-guest', { code, guestSocketId });
      setWaitingGuests(prev => prev.filter(g => g.socketId !== guestSocketId));
    }
  };

  const handleMuteAll = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('meeting-host-mute-all', { code });
    }
  };

  const handleRemoveParticipant = (targetSocketId: string) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('meeting-host-remove-participant', { code, targetSocketId });
    }
  };

  const toggleHand = () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
    const socket = getSocket();
    if (socket) {
      socket.emit('meeting-hand-toggle', { code, isRaised: nextState, userName: guestName });
    }
  };

  const handleLeaveMeeting = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('leave-instant-meeting', { code });
    }
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
    }
    window.location.href = '/chat';
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const socket = getSocket();
    if (socket) {
      socket.emit('meeting-send-chat', { code, content: chatInput.trim(), userName: guestName });
      setChatInput('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex flex-col items-center justify-center text-white space-y-4">
        <Loader2 size={36} className="animate-spin text-emerald-500" />
        <p className="text-sm text-text-secondary">Loading Instant Meeting Room...</p>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-danger/10 border border-danger/30 flex items-center justify-center text-danger mb-4 shadow-lg">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Meeting Unavailable</h2>
        <p className="text-sm text-text-secondary max-w-md mb-6">{error || 'This meeting link is invalid or has ended.'}</p>
        <button
          onClick={() => router.push('/chat')}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg"
        >
          Return to Chat App
        </button>
      </div>
    );
  }

  // SCREEN 1: PRE-JOIN LOBBY PREVIEW (With Name & Avatar Selection)
  if (inLobby) {
    return (
      <div className="min-h-screen bg-[#0b141a] text-white flex flex-col justify-between p-6 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white font-bold shadow-md">
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                {meeting.title}
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase">
                  Instant Call
                </span>
              </h1>
              <p className="text-xs text-text-secondary">Host: {meeting.host.name || 'Nexus User'}</p>
            </div>
          </div>

          <button
            onClick={handleCopyLink}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#1f2c34] hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs font-medium transition-all"
          >
            {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
          </button>
        </div>

        {/* Video Camera Preview Container */}
        <div className="flex-1 my-6 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
          <div className="relative w-full aspect-video bg-[#111b21] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
            {isVideoOn ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />
            ) : (
              <div className="flex flex-col items-center space-y-3">
                {customAvatar ? (
                  <img src={customAvatar} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-emerald-500 shadow-xl" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-2xl uppercase">
                    {(guestName || 'ME').substring(0, 2)}
                  </div>
                )}
                <p className="text-xs text-text-secondary">Camera is turned off</p>
              </div>
            )}

            {/* Media Toggles overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center space-x-3 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/15">
              <button
                type="button"
                onClick={() => setIsMicOn(!isMicOn)}
                className={`p-3 rounded-full transition-all ${
                  isMicOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-danger text-white shadow-lg'
                }`}
              >
                {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>

              <button
                type="button"
                onClick={() => setIsVideoOn(!isVideoOn)}
                className={`p-3 rounded-full transition-all ${
                  isVideoOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-danger text-white shadow-lg'
                }`}
              >
                {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            </div>
          </div>

          {/* Name & Avatar Customization Box */}
          <div className="w-full mt-6 bg-[#111b21] border border-white/10 rounded-2xl p-4 space-y-4 shadow-xl">
            <div>
              <label className="text-xs font-semibold text-text-secondary mb-1.5 block">Your Call Display Name:</label>
              <input
                type="text"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                placeholder="Enter your name for the call..."
                className="w-full bg-[#1f2c34] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-text-secondary mb-2 block">Choose Profile Photo / Avatar:</label>
              <div className="flex items-center space-x-3 overflow-x-auto pb-1">
                {/* Upload File Button */}
                <label className="w-12 h-12 rounded-full bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 flex items-center justify-center text-emerald-400 cursor-pointer transition-all flex-shrink-0">
                  <Camera size={20} />
                  <input type="file" accept="image/*" onChange={handleAvatarFileUpload} className="hidden" />
                </label>

                {/* Preset Avatars */}
                {PRESET_AVATARS.map((avatar, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCustomAvatar(avatar)}
                    className={`relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all flex-shrink-0 ${
                      customAvatar === avatar ? 'border-emerald-400 scale-105 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={avatar} alt="Preset Avatar" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleJoinClick}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-base shadow-xl transition-all cursor-pointer flex items-center justify-center space-x-2 mt-2"
            >
              <span>{isHost ? 'Start Instant Call' : 'Join Call Now'}</span>
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-text-secondary">
          Protected by End-to-End Encryption & WebRTC Real-Time Protocol
        </div>
      </div>
    );
  }

  // SCREEN 2: WAITING ROOM SCREEN
  if (isWaitingRoom) {
    return (
      <div className="min-h-screen bg-[#0b141a] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="relative w-24 h-24 mb-6">
          <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-2xl">
            <Shield size={40} className="text-white animate-pulse" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white mb-2">Waiting for Host Approval...</h2>
        <p className="text-sm text-text-secondary max-w-md mb-6">
          You are in the waiting room for <span className="font-semibold text-white">{meeting.title}</span> as <span className="text-emerald-400 font-bold">{guestName}</span>.
        </p>

        <div className="flex items-center space-x-3 bg-[#111b21] border border-white/10 px-4 py-2.5 rounded-full text-xs text-emerald-400">
          <Volume2 size={16} className="animate-bounce" />
          <span>Camera & Mic ready</span>
        </div>
      </div>
    );
  }

  // SCREEN 3: ACTIVE ZOOM/MEET-STYLE FULLSCREEN MEETING ROOM
  return (
    <div className="h-[100dvh] w-full min-h-[100dvh] bg-[#0b141a] text-white flex flex-col justify-between relative overflow-hidden select-none">
      {/* Top Header Bar */}
      <div className="p-3 sm:p-4 bg-[#111b21]/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between z-20">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5">
              <span className="truncate max-w-[140px] sm:max-w-none">{meeting.title}</span>
              <span className="text-[10px] bg-white/10 text-text-secondary px-2 py-0.5 rounded-full font-mono">{code}</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Call • {participants.length + 1} Connected
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {isHost && waitingGuests.length > 0 && (
            <button
              onClick={() => setShowParticipantsDrawer(true)}
              className="px-2.5 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-[11px] sm:text-xs font-bold animate-pulse flex items-center space-x-1"
            >
              <Users size={14} />
              <span>{waitingGuests.length} Waiting</span>
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="p-2 bg-[#1f2c34] hover:bg-white/10 text-white border border-white/10 rounded-xl transition-all"
            title="Copy Invite Link"
          >
            {copiedLink ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      {/* Main Video Tile Grid */}
      <div className="flex-1 p-2 sm:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 items-center justify-center overflow-y-auto">
        {/* Local Participant Tile */}
        <div className={`relative bg-[#111b21] rounded-2xl overflow-hidden shadow-xl transition-all ${
          isScreenSharing 
            ? 'col-span-full aspect-video h-[50vh] sm:h-[65vh] w-full border-2 border-emerald-500 bg-black' 
            : 'aspect-video border border-emerald-500/40'
        }`}>
          {isVideoOn ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full ${isScreenSharing ? 'object-contain bg-black' : 'object-cover transform -scale-x-100'}`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              {customAvatar && customAvatar.trim() ? (
                <img
                  src={customAvatar}
                  alt={guestName}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-lg border-2 border-emerald-500"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xl sm:text-2xl uppercase shadow-lg">
                  {guestName.substring(0, 2) || 'ME'}
                </div>
              )}
            </div>
          )}

          <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] sm:text-xs font-medium flex items-center space-x-1.5 z-10">
            <span className="truncate max-w-[120px]">{guestName} (You)</span>
            {isHost && <span className="text-[9px] bg-purple-500/30 text-purple-300 px-1 py-0.5 rounded font-bold">HOST</span>}
          </div>

          {isHandRaised && (
            <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-amber-500 text-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold flex items-center space-x-1 shadow-lg animate-bounce z-10">
              <Hand size={12} /> <span>Hand Raised</span>
            </div>
          )}
        </div>

        {/* Remote Participants Video Tiles */}
        {participants.map((p, idx) => (
          <div key={p.socketId || idx} className="relative aspect-video bg-[#111b21] rounded-2xl overflow-hidden border border-white/10 shadow-xl">
            <video
              ref={el => {
                remoteVideoRefs.current.set(p.socketId, el);
                if (el && remoteStreamsRef.current.has(p.socketId)) {
                  el.srcObject = remoteStreamsRef.current.get(p.socketId)!;
                }
              }}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {!activeRemoteStreams[p.socketId] && (
              <div className="absolute inset-0 bg-[#111b21] flex flex-col items-center justify-center pointer-events-none">
                {p.userAvatar && p.userAvatar.trim() ? (
                  <img src={p.userAvatar} alt={p.userName} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-indigo-500 shadow-lg" />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xl sm:text-2xl uppercase shadow-lg">
                    {(p.userName || 'P').substring(0, 2)}
                  </div>
                )}
              </div>
            )}

            <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10 text-[11px] sm:text-xs font-medium flex items-center space-x-1.5 z-10">
              <span className="truncate max-w-[120px]">{p.userName || 'Participant'}</span>
              {p.isHost && <span className="text-[9px] bg-purple-500/30 text-purple-300 px-1 py-0.5 rounded font-bold">HOST</span>}
            </div>

            {p.isHandRaised && (
              <div className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-amber-500 text-black px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold flex items-center space-x-1 shadow-lg animate-bounce z-10">
                <Hand size={12} /> <span>Hand Raised</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Floating Bottom Control Bar Optimized for Mobile Navigation/Gesture Bar */}
      <div className="p-2 sm:p-4 pb-6 sm:pb-4 bg-[#111b21]/95 backdrop-blur-md border-t border-white/10 flex items-center justify-center space-x-1.5 sm:space-x-3 z-20">
        <button
          onClick={() => setIsMicOn(!isMicOn)}
          className={`p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl transition-all shadow-lg ${
            isMicOn ? 'bg-[#1f2c34] hover:bg-white/15 text-white' : 'bg-danger text-white'
          }`}
          title="Toggle Mic"
        >
          {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>

        <button
          onClick={() => setIsVideoOn(!isVideoOn)}
          className={`p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl transition-all shadow-lg ${
            isVideoOn ? 'bg-[#1f2c34] hover:bg-white/15 text-white' : 'bg-danger text-white'
          }`}
          title="Toggle Camera"
        >
          {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl transition-all shadow-lg ${
            isScreenSharing ? 'bg-emerald-500 text-black font-bold' : 'bg-[#1f2c34] hover:bg-white/15 text-white'
          }`}
          title="Share Screen"
        >
          {isScreenSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
        </button>

        <button
          onClick={toggleHand}
          className={`p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl transition-all shadow-lg ${
            isHandRaised ? 'bg-amber-500 text-black font-bold' : 'bg-[#1f2c34] hover:bg-white/15 text-white'
          }`}
          title="Raise Hand"
        >
          <Hand size={18} />
        </button>

        <button
          onClick={() => setShowParticipantsDrawer(!showParticipantsDrawer)}
          className="p-2.5 sm:p-3.5 bg-[#1f2c34] hover:bg-white/15 text-white rounded-xl sm:rounded-2xl transition-all relative shadow-lg"
          title="Participants"
        >
          <Users size={18} />
          {waitingGuests.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
              {waitingGuests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setShowChatDrawer(!showChatDrawer)}
          className="p-2.5 sm:p-3.5 bg-[#1f2c34] hover:bg-white/15 text-white rounded-xl sm:rounded-2xl transition-all shadow-lg"
          title="In-Meeting Chat"
        >
          <MessageSquare size={18} />
        </button>

        <button
          onClick={handleLeaveMeeting}
          className="px-3 sm:px-6 py-2.5 sm:py-3 bg-danger hover:bg-danger/90 text-white font-bold rounded-xl sm:rounded-2xl text-xs sm:text-sm flex items-center space-x-1.5 shadow-xl transition-all"
        >
          <PhoneOff size={16} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>

      {/* Participants & Host Drawer */}
      {showParticipantsDrawer && (
        <div className="absolute right-4 top-16 bottom-20 w-80 bg-[#1f2c34] border border-white/15 rounded-2xl p-4 shadow-2xl flex flex-col z-30 animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Users size={16} /> Participants ({participants.length + 1})
            </h3>
            <button onClick={() => setShowParticipantsDrawer(false)} className="text-text-secondary hover:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Host Mute All Option */}
          {isHost && (
            <button
              onClick={handleMuteAll}
              className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold mb-3 transition-all"
            >
              Mute All Participants
            </button>
          )}

          {/* Waiting Room Section for Host */}
          {isHost && waitingGuests.length > 0 && (
            <div className="mb-4 space-y-2">
              <h4 className="text-xs font-bold text-amber-400 uppercase">Waiting Room ({waitingGuests.length})</h4>
              {waitingGuests.map(g => (
                <div key={g.socketId} className="flex items-center justify-between bg-[#111b21] p-2.5 rounded-xl border border-amber-500/30">
                  <span className="text-xs font-medium text-white">{g.userName}</span>
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleApproveGuest(g.socketId)}
                      className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500"
                      title="Admit"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => handleRejectGuest(g.socketId)}
                      className="p-1 bg-danger text-white rounded-lg hover:bg-danger/80"
                      title="Deny"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Participants List */}
          <div className="flex-1 overflow-y-auto space-y-2">
            <div className="flex items-center justify-between p-2 bg-black/20 rounded-xl text-xs">
              <div className="flex items-center space-x-2">
                {customAvatar && <img src={customAvatar} className="w-5 h-5 rounded-full object-cover" />}
                <span className="text-white font-medium">{guestName} (You)</span>
              </div>
              <span className="text-[10px] bg-purple-500/30 text-purple-300 font-bold px-1.5 py-0.5 rounded">HOST</span>
            </div>

            {participants.map(p => (
              <div key={p.socketId} className="flex items-center justify-between p-2 bg-[#111b21] rounded-xl text-xs border border-white/5">
                <div className="flex items-center space-x-2">
                  {p.userAvatar && <img src={p.userAvatar} className="w-5 h-5 rounded-full object-cover" />}
                  <span className="text-white font-medium">{p.userName}</span>
                </div>
                {isHost && (
                  <button
                    onClick={() => handleRemoveParticipant(p.socketId)}
                    className="text-danger hover:underline text-[11px]"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In-Meeting Chat Drawer */}
      {showChatDrawer && (
        <div className="absolute right-4 top-16 bottom-20 w-80 bg-[#1f2c34] border border-white/15 rounded-2xl p-4 shadow-2xl flex flex-col z-30 animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <MessageSquare size={16} /> Meeting Messages
            </h3>
            <button onClick={() => setShowChatDrawer(false)} className="text-text-secondary hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 mb-3">
            {chatMessages.length === 0 ? (
              <p className="text-xs text-text-secondary text-center mt-10">No messages yet in this meeting.</p>
            ) : (
              chatMessages.map(m => (
                <div key={m.id} className="bg-[#111b21] p-2.5 rounded-xl border border-white/5 text-xs">
                  <span className="font-bold text-emerald-400 block mb-0.5">{m.senderName}:</span>
                  <p className="text-white">{m.content}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={sendChatMessage} className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Send message to call..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              className="flex-1 bg-[#111b21] border border-surface-border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
            <button type="submit" className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
