import { create } from 'zustand';
import Peer, { Instance } from 'simple-peer';

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

  setIncomingCall: (caller: any, callType: 'AUDIO' | 'VIDEO', chatId: string, offer: any) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  addRemoteStream: (userId: string, stream: MediaStream) => void;
  removeRemoteStream: (userId: string) => void;
  addPeer: (userId: string, peer: Instance) => void;
  removePeer: (userId: string) => void;
  setCallStartTime: (time: number | null) => void;
  acceptCall: () => void;
  endCall: () => void;
  initiateCall: (callType: 'AUDIO' | 'VIDEO', chatId: string, invitedUserIds?: string[]) => void;
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
      newPeers[userId].destroy();
      delete newPeers[userId];
    }
    return { peers: newPeers };
  }),
  
  setCallStartTime: (time) => set({ callStartTime: time }),

  acceptCall: () => set({ isReceivingCall: false, isCalling: true }),

  endCall: () => {
    const { peers, localStream } = get();
    Object.values(peers).forEach(peer => peer.destroy());
    
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
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
      invitedUserIds: []
    });
  },

  initiateCall: (type, chatId, invitedUserIds = []) => set({
    isCalling: true,
    isInitiator: true,
    callType: type,
    activeCallChatId: chatId,
    invitedUserIds
  })
}));
