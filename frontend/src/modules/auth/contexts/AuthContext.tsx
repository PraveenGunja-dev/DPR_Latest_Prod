import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthResponse, SSOAuthResponse, loginUser, getUserProfile, refreshAccessToken, logoutUser, ssoLogin as ssoLoginService } from '../services/authService';

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

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isPendingApproval = user?.Role === 'pending_approval';

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setIsAuthenticated(true);
    }
  }, []);

  // Token refresh effect
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout | null = null;

    if (token && refreshTokenState) {
      refreshInterval = setInterval(async () => {
        try {
          const response = await refreshAccessToken(refreshTokenState);
          setToken(response.accessToken);
          setRefreshToken(response.refreshToken);
          localStorage.setItem('token', response.accessToken);
          localStorage.setItem('refreshToken', response.refreshToken);
        } catch (error) {
          console.error('Token refresh failed:', error);
          logout();
        }
      }, 10 * 60 * 1000);
    }

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  }, [token, refreshTokenState]);

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
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, token, refreshToken: refreshTokenState, 
      login, ssoLogin, logout, 
      isAuthenticated, isLoading, isPendingApproval,
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