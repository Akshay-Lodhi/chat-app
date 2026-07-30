import { io, Socket } from 'socket.io-client';
import { useChatStore } from '@/store/useChatStore';

let standaloneSocket: Socket | null = null;

export const getSocket = (): Socket | null => {
  const storeSocket = useChatStore.getState().socket;
  if (storeSocket && storeSocket.connected) {
    return storeSocket;
  }

  if (standaloneSocket && standaloneSocket.connected) {
    return standaloneSocket;
  }

  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000';
  standaloneSocket = io(`${SERVER_URL}/chat`, {
    withCredentials: true,
    transports: ['websocket', 'polling']
  });

  return standaloneSocket;
};
