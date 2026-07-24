import { useAuthStore } from "@/store/useAuthStore";

type CallType = "VIDEO" | "AUDIO";

interface ParticipantInfo {
  userId: string;
  name: string;
  avatar?: string | null;
  status: "JOINED" | "INVITED" | "MISSED";
  isInitiator?: boolean;
}

interface NormalizedCallPayload {
  callData: {
    action?: string;
    duration?: number;
    type?: CallType;
    isGroup?: boolean;
    participants?: ParticipantInfo[];
    initiatorId?: string;
  };
  createdAt: string;
  isMine: boolean;
}

// Normalizes different call shapes (message call log vs DB call object)
// and returns the payload shape expected by `CallDetailsModal` used across the app.
export function getCallDetailsPayload(
  call: any,
  opts: {
    currentUser?: any;
    chat?: any;
    message?: any;
    isOutgoing?: boolean;
  } = {},
): NormalizedCallPayload | null {
  const { currentUser, chat, message, isOutgoing } = opts;

  if (!call) return null;

  const isGroup = Boolean(call.isGroup || chat?.isGroup);
  const isVideo = call.type === "VIDEO";
  const duration = typeof call.duration === "number" ? call.duration : call.duration || 0;
  const isMissed = duration === 0 || call.action === "MISSED" || call.status === "MISSED" || call.action === "NO_ANSWER";

  // Build raw participants list from a few possible shapes
  let rawParticipants: any[] = [];
  if (Array.isArray(call.participants) && call.participants.length > 0) {
    rawParticipants = call.participants.map((p: any) => {
      if (p.user) {
        return {
          id: p.user.id || p.userId,
          name: p.user.name,
          profilePicture: p.user.profilePicture,
          joined: p.hasJoined || p.joined || p.status === "JOINED",
        };
      }
      return {
        id: p.id || p.userId || p,
        name: p.name || p.displayName,
        profilePicture: p.profilePicture || p.avatar,
        joined: p.hasJoined || p.joined || p.status === "JOINED",
      };
    });
  }

  // Support legacy/other shape where calls are stored with `groupParticipants`
  if (rawParticipants.length === 0 && Array.isArray(call.groupParticipants) && call.groupParticipants.length > 0) {
    rawParticipants = call.groupParticipants.map((u: any) => ({
      id: u.id || u.userId,
      name: u.name || u.displayName || u.user?.name,
      profilePicture: u.profilePicture || u.avatar || u.user?.profilePicture,
      joined: u.joined || u.hasJoined || u.status === 'JOINED'
    }));
  }

  // If call has an `otherUser` (extracted from message logs), include it
  if (rawParticipants.length === 0 && call.otherUser) {
    rawParticipants = [{ id: call.otherUser.id, name: call.otherUser.name, profilePicture: call.otherUser.profilePicture }];
  }

  if (rawParticipants.length === 0 && chat && Array.isArray(chat.participants)) {
    rawParticipants = chat.participants.map((p: any) => ({
      id: p.userId || p.id,
      name: p.user?.name || p.name,
      profilePicture: p.user?.profilePicture || p.profilePicture,
    }));
  }

  const allMap = new Map<string, any>();
  // Seed with chat participants (if any) so we have full user info available
  if (chat && Array.isArray(chat.participants)) {
    chat.participants.forEach((p: any) => {
      const uid = p.userId || p.id;
      if (!uid) return;
      const userObj = p.user || p;
      allMap.set(uid, {
        id: uid,
        name: userObj?.name || userObj?.displayName,
        profilePicture: userObj?.profilePicture || userObj?.profilePicture,
      });
    });
  }

  // Overlay raw participants (from call payload) to add joined/initiator flags
  rawParticipants.forEach((p) => {
    if (p && p.id) {
      const existing = allMap.get(p.id) || {};
      allMap.set(p.id, { ...existing, ...p });
    }
  });

  // Ensure current user is present and overrides where necessary
  if (currentUser && currentUser.id)
    allMap.set(currentUser.id, { id: currentUser.id, name: currentUser.name, profilePicture: currentUser.profilePicture });

  const initiatorId = call.initiatorId || call.callerId || call.senderId || (isOutgoing && currentUser ? currentUser.id : undefined);
  const joinedIds = call.joinedParticipantIds || (Array.isArray(call.joinedParticipantIds) ? call.joinedParticipantIds : (call.joined ? call.joined.map((x: any) => x.id || x.userId) : []));

  const participantsList: ParticipantInfo[] = Array.from(allMap.values()).map((u: any) => {
    const userId = u.id || u.userId;
    const isInitiator = Boolean((initiatorId && userId === initiatorId) || (call.callerId && userId === call.callerId));
    let isJoined = isInitiator;
    if (Array.isArray(joinedIds) && joinedIds.includes(userId)) isJoined = true;
    if (!isMissed && duration > 0) isJoined = true;

    return {
      userId,
      name: userId === currentUser?.id ? (u.name || 'You') : (u.name || u.displayName || u.phoneNumber || 'User'),
      avatar: u.profilePicture || u.avatar || null,
      isInitiator,
      status: isJoined ? 'JOINED' : 'MISSED'
    } as ParticipantInfo;
  });

  const callType: CallType = isVideo ? 'VIDEO' : 'AUDIO';

  return {
    callData: {
      action: isMissed ? 'MISSED' : 'COMPLETED',
      duration,
      type: callType,
      isGroup,
      participants: participantsList,
      initiatorId
    },
    createdAt: message?.createdAt || call.startedAt || new Date().toISOString(),
    isMine: Boolean(isOutgoing || call.isOutgoing || call.senderId === currentUser?.id)
  };
}
