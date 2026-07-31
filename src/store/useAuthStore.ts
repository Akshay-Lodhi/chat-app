import { apiClient } from '@/lib/apiClient';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateKeyPair } from '@/lib/encryption';

interface User {
  id: string;
  phoneNumber: string;
  name?: string | null;
  about?: string;
  profilePicture?: string | null;
  publicKey?: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  privateKey: string | null;
  publicKey: string | null;
  setAuth: (token: string, user: User) => void;
  updateProfile: (data: Partial<User>) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      privateKey: null,
      publicKey: null,
      setAuth: async (token, user) => {
        let currentPriv = get().privateKey;
        let currentPub = get().publicKey;
        
        // If keys don't exist, generate them
        if (!currentPriv || !currentPub) {
          const keys = generateKeyPair();
          currentPriv = keys.privateKey;
          currentPub = keys.publicKey;
        }

        // Always sync public key on login to ensure backend is up-to-date
        if (currentPub) {
          try {
            await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/profile`, {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ publicKey: currentPub })
            });
          } catch (e) {
            console.error('Failed to sync public key on login', e);
          }
        }
        
        set({ token, user: { ...user, publicKey: currentPub }, privateKey: currentPriv, publicKey: currentPub });
      },
      updateProfile: async (data) => {
        const { token, user } = get();
        if (!token || !user) return;
        try {
          const res = await apiClient(`${process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:5000'}/api/users/profile`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
          });
          if (res.ok) {
            const updatedUser = await res.json();
            set({ user: { ...user, ...updatedUser } });
          }
        } catch (err) {
          console.error('Failed to update profile', err);
        }
      },
      logout: () => set({ token: null, user: null, privateKey: null, publicKey: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
);
