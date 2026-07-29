import { useAuthStore } from '@/store/useAuthStore';

export const apiClient = async (url: string | URL | globalThis.Request, options: RequestInit = {}): Promise<Response> => {
  const token = useAuthStore.getState().token;
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const mergedOptions: RequestInit = {
    ...options,
    credentials: options.credentials || 'include',
    headers
  };

  const response = await fetch(url, mergedOptions);

  if (response.status === 401) {
    // Check if we are not already on the login page to prevent redirect loops
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      const logout = useAuthStore.getState().logout;
      logout();
      window.location.href = '/login';
    }
  }

  return response;
};
