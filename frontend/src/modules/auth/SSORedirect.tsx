import { useEffect } from 'react';
import { API_BASE_URL } from '@/services/apiClient';

export const SSORedirect = () => {
  useEffect(() => {
    // Forward the exact query string (including ?code=...) to the backend
    window.location.href = `${API_BASE_URL}/sso/callback${window.location.search}`;
  }, []);
  
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
        <p className="text-lg font-medium text-gray-600">Completing login...</p>
      </div>
    </div>
  );
};
