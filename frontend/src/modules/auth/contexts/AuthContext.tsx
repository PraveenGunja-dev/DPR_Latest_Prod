import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loginUser, getUserProfile, refreshAccessToken, logoutUser, ssoLogin as ssoLoginService } from '@/services/userService';
import { User, AuthResponse, SSOAuthResponse } from '@/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  ssoLogin: (idToken: string, accessToken: string) => Promise<SSOAuthResponse>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPendingApproval: boolean;
  hasPendingRequest: boolean;
  setHasPendingRequest: (val: boolean) => void;
  refreshUserProfile: () => Promise<void>;
  setUserFromSSO: (user: User, accessToken: string, refreshToken: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [refreshTokenState, setRefreshToken] = useState<string | null>(() => localStorage.getItem('refreshToken'));

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem('token') && !!localStorage.getItem('user');
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    // If we're coming back with SSO data, start in loading state
    return window.location.hash.includes('sso_data=');
  });
  const [hasPendingRequestState, setHasPendingRequestState] = useState<boolean>(() => {
    return localStorage.getItem('has_pending_request') === 'true';
  });

  const setHasPendingRequest = (val: boolean) => {
    setHasPendingRequestState(val);
    localStorage.setItem('has_pending_request', val ? 'true' : 'false');
  };

  const isPendingApproval = (user?.role || user?.Role) === 'pending_approval';

  // Handle SSO data from URL hash (redirected from Python backend)
  useEffect(() => {
    const handleSSOCallback = () => {
      const hash = window.location.hash;
      if (hash && hash.includes('sso_data=')) {
        try {
          // Keep isLoading as true while processing
          const ssoDataRaw = hash.split('sso_data=')[1];
          const ssoData = JSON.parse(decodeURIComponent(ssoDataRaw));
          
          if (ssoData.token && ssoData.refreshToken && ssoData.user) {
            setUserFromSSO(ssoData.user, ssoData.token, ssoData.refreshToken);
            // Clear the hash to keep URL clean
            window.history.replaceState(null, '', window.location.pathname);
          } else if (ssoData.status === 'pending_approval') {
            setIsAuthenticated(false);
            setUser(ssoData.user);
            setHasPendingRequest(!!ssoData.hasPendingRequest);
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.setItem('user', JSON.stringify(ssoData.user));
            localStorage.setItem('sso_pending_user', JSON.stringify(ssoData.user));
            localStorage.setItem('has_pending_request', ssoData.hasPendingRequest ? 'true' : 'false');
            window.history.replaceState(null, '', window.location.pathname);
          }
        } catch (err) {
          console.error('[AuthContext] Error parsing SSO data from fragment:', err);
        } finally {
          setIsLoading(false);
        }
      } else {
        // No SSO hash, ensure were not stuck in loading
        if (isLoading && window.location.hash.includes('sso_data=')) {
           // This shouldn't really happen if the hash was just there, 
           // but let's be safe.
        } else if (isLoading) {
           setIsLoading(false);
        }
      }
    };
    handleSSOCallback();
  }, []);

  // Token refresh effect removed: apiClient handles 401 refreshes automatically.
  // Proactive refresh with setInterval causes race conditions across multiple tabs
  // because the backend rotates the refresh token (single-use).

  const login = async (email: string, password: string) => {
    try {
      const response: AuthResponse = await loginUser({ email, password });
      setToken(response.accessToken);
      setRefreshToken(response.refreshToken);
      setUser(response.user);
      setIsAuthenticated(true);
      localStorage.setItem('token', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      localStorage.setItem('user', JSON.stringify(response.user));
    } catch (error) {
      throw error;
    }
  };

  const ssoLogin = async (idToken: string, accessToken: string): Promise<SSOAuthResponse> => {
    try {
      const response: SSOAuthResponse = await ssoLoginService(idToken, accessToken);

      if (response.status === 'authenticated' && response.accessToken && response.refreshToken) {
        setToken(response.accessToken);
        setRefreshToken(response.refreshToken);
        setUser(response.user);
        setIsAuthenticated(true);
        localStorage.setItem('token', response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
        localStorage.setItem('user', JSON.stringify(response.user));
      } else if (response.status === 'pending_approval') {
        // Store user info but not tokens - limited access
        setUser(response.user);
        localStorage.setItem('user', JSON.stringify(response.user));
        localStorage.setItem('sso_pending_user', JSON.stringify(response.user));
      }

      return response;
    } catch (error) {
      throw error;
    }
  };

  // Helper to set user from SSO callback (useful after admin approves access)
  const setUserFromSSO = (user: User, accessToken: string, refreshToken: string) => {
    setToken(accessToken);
    setRefreshToken(refreshToken);
    setUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('token', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
  };

  const refreshUserProfile = async () => {
    if (token) {
      try {
        const profile = await getUserProfile();
        setUser(profile);
        localStorage.setItem('user', JSON.stringify(profile));
      } catch (error) {
        console.error('Failed to refresh user profile:', error);
      }
    }
  };

  const logout = async () => {
    try {
      if (refreshTokenState) {
        await logoutUser(refreshTokenState);
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      setUser(null);
      setToken(null);
      setRefreshToken(null);
      setIsAuthenticated(false);
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('sso_pending_user');
      localStorage.removeItem('has_pending_request');
      setHasPendingRequest(false);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, token, refreshToken: refreshTokenState, 
      login, ssoLogin, logout, 
      isAuthenticated, isLoading, isPendingApproval, 
      hasPendingRequest: hasPendingRequestState, 
      setHasPendingRequest,
      refreshUserProfile, setUserFromSSO
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};