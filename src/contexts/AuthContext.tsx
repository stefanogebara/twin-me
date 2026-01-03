import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DEMO_USER } from '../services/demoDataService';

/**
 * AuthContext - Authentication Management
 *
 * DEMO MODE SUPPORT:
 * - Demo mode is enabled when localStorage has 'demo_mode' = 'true'
 * - Demo mode uses DEMO_USER from demoDataService
 * - Demo mode is clearly marked with isDemoMode flag
 * - All API calls should check isDemoMode before making real requests
 *
 * REAL AUTH:
 * - Uses JWT tokens stored in localStorage ('auth_token')
 * - Supports email/password and OAuth (Google) authentication
 * - Validates tokens on mount via /api/auth/verify endpoint
 */

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  profileImageUrl?: string;
}

interface AuthContextType {
  user: User | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: 'google', redirectAfterAuth?: string) => Promise<void>;
  clearAuth: () => void;
  refreshAccessToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // DEMO MODE: Check if demo mode is active
  // This allows users to explore the platform without connecting real accounts
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  // Optimistic initialization: Check localStorage for cached user data or demo user
  const getCachedUser = (): User | null => {
    // DEMO MODE: If in demo mode, return demo user immediately
    if (isDemoMode) {
      return DEMO_USER;
    }

    try {
      const cachedUser = localStorage.getItem('auth_user');
      return cachedUser ? JSON.parse(cachedUser) : null;
    } catch {
      return null;
    }
  };

  const [user, setUser] = useState<User | null>(getCachedUser());
  const [isLoaded, setIsLoaded] = useState(false); // Don't set true until verification completes
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    // Check for existing session on mount
    checkAuth();

    // Listen for demo mode changes
    const handleDemoModeChange = () => {
      const demoActive = localStorage.getItem('demo_mode') === 'true';
      if (demoActive) {
        setUser(DEMO_USER);
      } else {
        checkAuth();
      }
    };

    window.addEventListener('storage', handleDemoModeChange);
    return () => window.removeEventListener('storage', handleDemoModeChange);
  }, []);

  const checkAuth = async () => {
    // DEMO MODE: Skip real auth check if in demo mode
    if (localStorage.getItem('demo_mode') === 'true') {
      setUser(DEMO_USER);
      setIsLoaded(true);
      return;
    }

    const token = localStorage.getItem('auth_token');

    if (!token) {
      setUser(null);
      localStorage.removeItem('auth_user');
      setIsLoaded(true);
      return;
    }

    // If we have a cached user, use it for display while verifying
    // But don't set isLoaded until verification completes
    const cachedUser = getCachedUser();
    if (cachedUser) {
      setUser(cachedUser);
      // Note: isLoaded stays false until verification completes
    }

    // Token verification - must complete before isLoaded is set
    setIsVerifying(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData.user);
        // Cache user data for next load
        localStorage.setItem('auth_user', JSON.stringify(userData.user));
      } else {
        // Token is invalid - clear auth state
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setUser(null);
      }
    } catch (error) {
      // Network error - keep cached state if we have one
      // This prevents logout on temporary network issues
      if (!cachedUser) {
        // No cached user and network error - clear everything
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setUser(null);
      }
      // If we have cached user, keep them logged in despite network error
    } finally {
      setIsVerifying(false);
      setIsLoaded(true);
    }
  };

  const signOut = async () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('demo_mode'); // Also exit demo mode
    setUser(null);
  };

  const clearAuth = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('auth_user');
    setUser(null);
  };

  // Refresh access token using refresh token
  const refreshAccessToken = async (): Promise<boolean> => {
    const refreshToken = localStorage.getItem('refresh_token');

    if (!refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken })
      });

      if (response.ok) {
        const data = await response.json();
        // Store new tokens
        localStorage.setItem('auth_token', data.accessToken);
        localStorage.setItem('refresh_token', data.refreshToken);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        setUser(data.user);
        return true;
      } else {
        // Refresh token is invalid or expired - force re-login
        clearAuth();
        return false;
      }
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  };

  // Set up automatic token refresh before expiration
  useEffect(() => {
    if (!user || localStorage.getItem('demo_mode') === 'true') {
      return;
    }

    // Refresh token 5 minutes before expiration (access token is 1 hour)
    const REFRESH_INTERVAL = 55 * 60 * 1000; // 55 minutes

    const refreshInterval = setInterval(() => {
      refreshAccessToken();
    }, REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [user]);

  const signInWithOAuth = async (provider: 'google', redirectAfterAuth?: string) => {
    try {
      // Build OAuth URL with optional redirect parameter
      let oauthUrl = `${import.meta.env.VITE_API_URL}/auth/oauth/${provider}`;

      // If redirectAfterAuth is provided, pass it as a query parameter
      if (redirectAfterAuth) {
        oauthUrl += `?redirect=${encodeURIComponent(redirectAfterAuth)}`;
      }

      // Redirect to OAuth provider
      window.location.href = oauthUrl;
    } catch (error) {
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoaded,
    isSignedIn: !!user,
    isLoading,
    isDemoMode: localStorage.getItem('demo_mode') === 'true',
    signOut,
    signInWithOAuth,
    clearAuth,
    refreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Compatibility components for Clerk replacement
export const SignedIn: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded } = useAuth();
  return isLoaded && isSignedIn ? <>{children}</> : null;
};

export const SignedOut: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isSignedIn, isLoaded } = useAuth();
  return isLoaded && !isSignedIn ? <>{children}</> : null;
};

export const SignInButton: React.FC<{
  mode?: 'modal' | 'redirect';
  afterSignInUrl?: string;
  fallbackRedirectUrl?: string;
  forceRedirectUrl?: string;
  children: ReactNode;
}> = ({ children }) => {
  const handleClick = () => {
    // Navigate to custom sign in page
    window.location.href = '/auth';
  };

  return <div onClick={handleClick}>{children}</div>;
};

export const SignUpButton: React.FC<{
  mode?: 'modal' | 'redirect';
  afterSignUpUrl?: string;
  fallbackRedirectUrl?: string;
  forceRedirectUrl?: string;
  children: ReactNode;
}> = ({ children }) => {
  const handleClick = () => {
    // Navigate to custom sign up page
    window.location.href = '/auth?mode=signup';
  };

  return <div onClick={handleClick}>{children}</div>;
};