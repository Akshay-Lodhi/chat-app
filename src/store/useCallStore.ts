import { create } from 'zustand';
import Peer, { Instance } from 'simple-peer';
import toast from 'react-hot-toast';

export interface ActiveCallInfo {
  chatId: string;
  activeCount: number;
  callType: 'AUDIO' | 'VIDEO';
}

export interface ParticipantInfo {
  userId: string;
  name: string;
  avatar: string | null;
  status: 'INVITED' | 'RINGING' | 'CONNECTED' | 'LEFT';
  isMuted: boolean;
  isVideoOff: boolean;
}

interface CallState {
  isCalling: boolean;
  isReceivingCall: boolean;
  isInitiator: boolean;
  caller: string | null;
  callType: 'AUDIO' | 'VIDEO' | null;
  activeCallChatId: string | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peers: Record<string, Instance>;
  pendingOffer: any | null;
  callStartTime: number | null;
  invitedUserIds: string[];

  roomParticipants: Record<string, ParticipantInfo>;
  activeCalls: Record<string, ActiveCallInfo>;
  isScreenSharing: boolean;

  setIncomingCall: (caller: any, callType: 'AUDIO' | 'VIDEO', chatId: string, offer: any) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  addRemoteStream: (userId: string, stream: MediaStream) => void;
  removeRemoteStream: (userId: string) => void;
  addPeer: (userId: string, peer: Instance) => void;
  removePeer: (userId: string) => void;
  setRoomParticipants: (participants: ParticipantInfo[]) => void;
  updateParticipantMedia: (userId: string, isMuted: boolean, isVideoOff: boolean) => void;
  setCallStartTime: (time: number | null) => void;
  acceptCall: () => void;
  endCall: () => void;
  initiateCall: (callType: 'AUDIO' | 'VIDEO', chatId: string, invitedUserIds?: string[], initialProfiles?: Record<string, { name: string; avatar: string | null }>) => void;
  joinOngoingCall: (chatId: string, callType: 'AUDIO' | 'VIDEO') => void;
  setActiveCallInfo: (chatId: string, info: ActiveCallInfo | null) => void;
  toggleScreenShare: () => Promise<void>;
}

export const useCallStore = create<CallState>((set, get) => ({
  isCalling: false,
  isReceivingCall: false,
  isInitiator: false,
  caller: null,
  callType: null,
  activeCallChatId: null,
  localStream: null,
  remoteStreams: {},
  peers: {},
  pendingOffer: null,
  callStartTime: null,
  invitedUserIds: [],
  roomParticipants: {},
  activeCalls: {},

  setIncomingCall: (caller, callType, chatId, offer) => set({
    isReceivingCall: true,
    isInitiator: false,
    caller,
    callType,
    activeCallChatId: chatId,
    pendingOffer: offer
  }),

  setLocalStream: (stream) => set({ localStream: stream }),
  addRemoteStream: (userId, stream) => set((state) => ({ 
    remoteStreams: { ...state.remoteStreams, [userId]: stream },
    callStartTime: Object.keys(state.remoteStreams).length === 0 ? Date.now() : state.callStartTime
  })),
  removeRemoteStream: (userId) => set((state) => {
    const newStreams = { ...state.remoteStreams };
    delete newStreams[userId];
    return { remoteStreams: newStreams };
  }),
  
  addPeer: (userId, peer) => set((state) => ({ peers: { ...state.peers, [userId]: peer } })),
  removePeer: (userId) => set((state) => {
    const newPeers = { ...state.peers };
    if (newPeers[userId]) {
      try { newPeers[userId].destroy(); } catch(e) {}
      delete newPeers[userId];
    }
    return { peers: newPeers };
  }),

  setRoomParticipants: (participants) => set(() => {
    const map: Record<string, ParticipantInfo> = {};
    participants.forEach(p => {
      map[p.userId] = p;
    });
    return { roomParticipants: map };
  }),

  updateParticipantMedia: (userId, isMuted, isVideoOff) => set((state) => {
    if (!state.roomParticipants[userId]) return state;
    return {
      roomParticipants: {
        ...state.roomParticipants,
        [userId]: {
          ...state.roomParticipants[userId],
          isMuted,
          isVideoOff
        }
      }
    };
  }),
  
  setCallStartTime: (time) => set({ callStartTime: time }),

  acceptCall: () => set({ isReceivingCall: false, isCalling: true }),

  endCall: () => {
    const { peers, localStream, activeCallChatId } = get();
    Object.values(peers).forEach(peer => {
      try { peer.destroy(); } catch(e) {}
    });
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    const newActiveCalls = { ...get().activeCalls };
    if (activeCallChatId) {
      delete newActiveCalls[activeCallChatId];
    }

    set({ 
      isCalling: false, 
      isReceivingCall: false,
      isInitiator: false,
      caller: null, 
      callType: null,
      activeCallChatId: null,
      localStream: null, 
      remoteStreams: {}, 
      peers: {},
      pendingOffer: null,
      callStartTime: null,
      invitedUserIds: [],
      roomParticipants: {},
      activeCalls: newActiveCalls,
      isScreenSharing: false
    });
  },

  initiateCall: (type, chatId, invitedUserIds = [], initialProfiles = {}) => {
    const { peers, localStream } = get();
    Object.values(peers).forEach(peer => {
      try { peer.destroy(); } catch(e) {}
    });
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    const roomParts: Record<string, ParticipantInfo> = {};
    Object.entries(initialProfiles).forEach(([uId, prof]: [string, any]) => {
      roomParts[uId] = {
        userId: uId,
        name: prof.name || 'Participant',
        avatar: prof.avatar || null,
        status: 'INVITED',
        isMuted: false,
        isVideoOff: false
      };
    });

    set({
      isCalling: true,
      isInitiator: true,
      callType: type,
      activeCallChatId: chatId,
      localStream: null,
      remoteStreams: {},
      peers: {},
      pendingOffer: null,
      callStartTime: null,
      invitedUserIds,
      roomParticipants: roomParts
    });
  },

  joinOngoingCall: (chatId, type) => set({
    isCalling: true,
    isInitiator: false,
    callType: type,
    activeCallChatId: chatId
  }),

  isScreenSharing: false,

  setActiveCallInfo: (chatId, info) => set((state) => {
    const newCalls = { ...state.activeCalls };
    if (info) {
      newCalls[chatId] = info;
    } else {
      delete newCalls[chatId];
    }
    return { activeCalls: newCalls };
  }),

  toggleScreenShare: async () => {
    const { isScreenSharing, localStream, peers } = get();

    if (isScreenSharing) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const newVideoTrack = camStream.getVideoTracks()[0];
        const oldScreenTrack = localStream?.getVideoTracks()[0];

        Object.values(peers).forEach((peer: any) => {
          if (peer && !peer.destroyed) {
            let replaced = false;
            try {
              if (peer._pc) {
                const senders = peer._pc.getSenders();
                const videoSender = senders.find((s: any) => s.track && s.track.kind === 'video');
                if (videoSender) {
                  videoSender.replaceTrack(newVideoTrack);
                  replaced = true;
                }
              }
            } catch (err) {
              console.warn('Native replaceTrack error:', err);
            }

            if (!replaced && oldScreenTrack && typeof peer.replaceTrack === 'function') {
              try {
                peer.replaceTrack(oldScreenTrack, newVideoTrack, camStream);
              } catch (e) {
                // Ignore simple-peer internal tracking error
              }
            }
          }
        });

        if (oldScreenTrack) oldScreenTrack.stop();

        set({ localStream: camStream, isScreenSharing: false });
      } catch (err) {
        console.error('Error reverting to camera stream:', err);
        set({ isScreenSharing: false });
      }
    } else {
      try {
        let screenStream: MediaStream | null = null;
        const mediaDevices = navigator.mediaDevices as any;

        if (mediaDevices && typeof mediaDevices.getDisplayMedia === 'function') {
          try {
            screenStream = await mediaDevices.getDisplayMedia({ video: true });
          } catch (err: any) {
            if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
              return; // User cancelled browser screen picker
            }
          }
        }

        if (!screenStream && (navigator as any).getDisplayMedia) {
          try {
            screenStream = await (navigator as any).getDisplayMedia({ video: true });
          } catch (e) {}
        }

        if (!screenStream) {
          toast.error("Screen sharing is not supported by your browser. Please use Chrome/Edge/Firefox on Desktop or enable screen capture in browser settings.");
          return;
        }

        const screenVideoTrack = screenStream.getVideoTracks()[0];

        screenVideoTrack.onended = () => {
          if (get().isScreenSharing) {
            get().toggleScreenShare();
          }
        };

        const oldVideoTrack = localStream?.getVideoTracks()[0];

        Object.values(peers).forEach((peer: any) => {
          if (peer && !peer.destroyed) {
            let replaced = false;
            try {
              if (peer._pc) {
                const senders = peer._pc.getSenders();
                const videoSender = senders.find((s: any) => s.track && s.track.kind === 'video');
                if (videoSender) {
                  videoSender.replaceTrack(screenVideoTrack);
                  replaced = true;
                }
              }
            } catch (err) {
              console.warn('Native replaceTrack error:', err);
            }

            if (!replaced && oldVideoTrack && typeof peer.replaceTrack === 'function') {
              try {
                peer.replaceTrack(oldVideoTrack, screenVideoTrack, screenStream!);
              } catch (e) {
                // Ignore simple-peer internal tracking error
              }
            }
          }
        });

        set({ localStream: screenStream, isScreenSharing: true });
      } catch (err: any) {
        if (err?.name !== 'NotAllowedError' && err?.name !== 'AbortError') {
          console.error('Error starting screen share:', err);
        }
      }
    }
  }
}));
