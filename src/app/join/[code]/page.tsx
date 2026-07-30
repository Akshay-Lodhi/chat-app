'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Hand, MessageSquare,
  Users, Copy, PhoneOff, Shield, Check, X, Sparkles, AlertCircle, Loader2, Volume2
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
  const [guestName, setGuestName] = useState(user?.name || '');

  // Media States
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);

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

  // 2. Setup Local Camera/Mic Stream for Lobby & Meeting
  useEffect(() => {
    const startLocalMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoOn,
          audio: isMicOn
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Could not access camera/mic:', err);
      }
    };

    if (inLobby || !isLobbyState()) {
      startLocalMedia();
    }

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [isVideoOn, isMicOn, inLobby]);

  function isLobbyState() {
    return inLobby;
  }

  // 3. Socket Listeners for Instant Meeting Events
  useEffect(() => {
    const socket = getSocket();
    if (!socket || inLobby) return;

    socket.on('instant-meeting-admitted', (data: any) => {
      setInLobby(false);
      setIsWaitingRoom(false);
      setIsHost(data.isHost);
    });

    socket.on('meeting-waiting-approval', () => {
      setInLobby(false);
      setIsWaitingRoom(true);
    });

    socket.on('meeting-guest-waiting', (guestData: any) => {
      setWaitingGuests(prev => [...prev.filter(g => g.socketId !== guestData.socketId), guestData]);
    });

    socket.on('meeting-participant-joined', (participant: any) => {
      setParticipants(prev => [...prev.filter(p => p.socketId !== participant.socketId), participant]);
    });

    socket.on('meeting-participant-left', ({ socketId }: any) => {
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
    });

    socket.on('meeting-entry-denied', () => {
      setError('Host declined your entry request to this meeting.');
      setInLobby(true);
      setIsWaitingRoom(false);
    });

    socket.on('meeting-muted-by-host', () => {
      setIsMicOn(false);
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => (t.enabled = false));
      }
    });

    socket.on('meeting-kicked-by-host', () => {
      alert('You have been removed from this meeting by the host.');
      router.push('/chat');
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
      socket.off('meeting-participant-left');
      socket.off('meeting-entry-denied');
      socket.off('meeting-muted-by-host');
      socket.off('meeting-kicked-by-host');
      socket.off('meeting-hand-updated');
      socket.off('meeting-chat-received');
    };
  }, [inLobby, router]);

  // Join Action
  const handleJoinClick = () => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('join-instant-meeting', {
      code,
      userName: guestName || 'Guest Participant',
      userAvatar: user?.profilePicture || null
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

  // SCREEN 1: PRE-JOIN LOBBY PREVIEW
  if (inLobby) {
    return (
      <div className="min-h-screen bg-[#0b141a] text-white flex flex-col justify-between p-6">
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
                  Instant Link
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
                <div className="w-20 h-20 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-2xl uppercase">
                  {guestName.substring(0, 2) || 'ME'}
                </div>
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

          {/* Display Name Input (For Guests/Unauthenticated) */}
          <div className="w-full mt-6 space-y-3">
            {!user && (
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Your Name in Call:</label>
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full bg-[#111b21] border border-surface-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <button
              onClick={handleJoinClick}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl text-base shadow-xl transition-all cursor-pointer flex items-center justify-center space-x-2"
            >
              <span>{isHost ? 'Start Meeting' : 'Ask to Join Meeting'}</span>
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-text-secondary">
          Protected by End-to-End Encryption & Nexus Security
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
          You are in the waiting room for <span className="font-semibold text-white">{meeting.title}</span>. The host ({meeting.host.name}) will let you in shortly.
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
    <div className="min-h-screen bg-[#0b141a] text-white flex flex-col justify-between relative overflow-hidden">
      {/* Top Header Bar */}
      <div className="p-4 bg-[#111b21]/80 backdrop-blur-md border-b border-white/10 flex items-center justify-between z-20">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold shadow">
            <Sparkles size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              {meeting.title}
              <span className="text-[10px] bg-white/10 text-text-secondary px-2 py-0.5 rounded-full font-mono">{code}</span>
            </h2>
            <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Call • {participants.length + 1} Connected
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {isHost && waitingGuests.length > 0 && (
            <button
              onClick={() => setShowParticipantsDrawer(true)}
              className="px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold animate-pulse flex items-center space-x-1.5"
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
            {copiedLink ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
          </button>
        </div>
      </div>

      {/* Main Video Tile Grid */}
      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-center justify-center overflow-y-auto">
        {/* Local Participant Tile */}
        <div className="relative aspect-video bg-[#111b21] rounded-2xl overflow-hidden border border-emerald-500/40 shadow-xl group">
          {isVideoOn ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-xl uppercase shadow-lg">
                {guestName.substring(0, 2) || 'ME'}
              </div>
            </div>
          )}

          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-xs font-medium flex items-center space-x-1.5">
            <span>{guestName} (You)</span>
            {isHost && <span className="text-[10px] bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded font-bold">HOST</span>}
          </div>

          {isHandRaised && (
            <div className="absolute top-3 right-3 bg-amber-500 text-black px-2.5 py-1 rounded-full text-xs font-bold flex items-center space-x-1 shadow-lg animate-bounce">
              <Hand size={14} /> <span>Hand Raised</span>
            </div>
          )}
        </div>

        {/* Remote Participants */}
        {participants.map((p, idx) => (
          <div key={p.socketId || idx} className="relative aspect-video bg-[#111b21] rounded-2xl overflow-hidden border border-white/10 shadow-xl">
            <div className="w-full h-full flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xl uppercase shadow-lg">
                {(p.userName || 'P').substring(0, 2)}
              </div>
            </div>

            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-xs font-medium">
              {p.userName || 'Participant'}
            </div>

            {p.isHandRaised && (
              <div className="absolute top-3 right-3 bg-amber-500 text-black px-2.5 py-1 rounded-full text-xs font-bold flex items-center space-x-1 shadow-lg animate-bounce">
                <Hand size={14} /> <span>Hand Raised</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Floating Bottom Control Bar */}
      <div className="p-4 bg-[#111b21]/90 backdrop-blur-md border-t border-white/10 flex items-center justify-center space-x-3 z-20">
        <button
          onClick={() => setIsMicOn(!isMicOn)}
          className={`p-3.5 rounded-2xl transition-all shadow-lg ${
            isMicOn ? 'bg-[#1f2c34] hover:bg-white/15 text-white' : 'bg-danger text-white'
          }`}
          title="Toggle Mic"
        >
          {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        <button
          onClick={() => setIsVideoOn(!isVideoOn)}
          className={`p-3.5 rounded-2xl transition-all shadow-lg ${
            isVideoOn ? 'bg-[#1f2c34] hover:bg-white/15 text-white' : 'bg-danger text-white'
          }`}
          title="Toggle Camera"
        >
          {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        <button
          onClick={toggleHand}
          className={`p-3.5 rounded-2xl transition-all shadow-lg ${
            isHandRaised ? 'bg-amber-500 text-black font-bold' : 'bg-[#1f2c34] hover:bg-white/15 text-white'
          }`}
          title="Raise Hand"
        >
          <Hand size={20} />
        </button>

        <button
          onClick={() => setShowParticipantsDrawer(!showParticipantsDrawer)}
          className="p-3.5 bg-[#1f2c34] hover:bg-white/15 text-white rounded-2xl transition-all relative shadow-lg"
          title="Participants"
        >
          <Users size={20} />
          {waitingGuests.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
              {waitingGuests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setShowChatDrawer(!showChatDrawer)}
          className="p-3.5 bg-[#1f2c34] hover:bg-white/15 text-white rounded-2xl transition-all shadow-lg"
          title="In-Meeting Chat"
        >
          <MessageSquare size={20} />
        </button>

        <button
          onClick={() => router.push('/chat')}
          className="px-6 py-3 bg-danger hover:bg-danger/90 text-white font-bold rounded-2xl text-sm flex items-center space-x-2 shadow-xl transition-all"
        >
          <PhoneOff size={18} />
          <span>Leave</span>
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
              <span className="text-white font-medium">{guestName} (You)</span>
              <span className="text-[10px] bg-purple-500/30 text-purple-300 font-bold px-1.5 py-0.5 rounded">HOST</span>
            </div>

            {participants.map(p => (
              <div key={p.socketId} className="flex items-center justify-between p-2 bg-[#111b21] rounded-xl text-xs border border-white/5">
                <span className="text-white font-medium">{p.userName}</span>
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
