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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: 'google', redirectAfterAuth?: string) => Promise<void>;
  clearAuth: () => void;
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
      console.log('[AuthContext] 🎭 Demo mode active - using DEMO_USER');
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
  const [isLoaded, setIsLoaded] = useState(true); // Set to true immediately for optimistic UI
  const [isLoading, setIsLoading] = useState(false);

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
      console.log('[AuthContext] 🎭 Demo mode active - skipping real auth check');
      setUser(DEMO_USER);
      setIsLoaded(true);
      return;
    }

    const token = localStorage.getItem('auth_token');
    console.log('🔍 Auth check - token exists:', !!token);

    if (!token) {
      console.log('🔍 No token found, user not signed in');
      setUser(null);
      localStorage.removeItem('auth_user');
      setIsLoaded(true);
      return;
    }

    // If we have a cached user, use it optimistically
    // Verify token in the background without blocking UI
    const cachedUser = getCachedUser();
    if (cachedUser) {
      setUser(cachedUser);
      setIsLoaded(true); // UI loads immediately
    }

    // Background token verification
    try {
      console.log('🔍 Verifying token in background...');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('🔍 Token verification response:', response.status, response.ok);

      if (response.ok) {
        const userData = await response.json();
        console.log('✅ Token valid, updating user:', userData.user);
        setUser(userData.user);
        // Cache user data for next load
        localStorage.setItem('auth_user', JSON.stringify(userData.user));
      } else {
        console.log('❌ Invalid token, clearing auth');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setUser(null);
      }
    } catch (error) {
      console.error('❌ Auth verification failed:', error);
      // Don't clear auth on network errors - keep cached state
      // This prevents logout on temporary network issues
    } finally {
      setIsLoaded(true); // Ensure loaded state
      console.log('🔍 Auth check complete');
    }
  };

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Sign in failed');
      }

      const data = await response.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string, firstName?: string, lastName?: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });

      if (!response.ok) {
        throw new Error('Sign up failed');
      }

      const data = await response.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    console.log('🚪 Signing out user');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('demo_mode'); // Also exit demo mode
    setUser(null);
  };

  const clearAuth = () => {
    console.log('🧹 Clearing auth state and localStorage');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
  };

  const signInWithOAuth = async (provider: 'google', redirectAfterAuth?: string) => {
    try {
      // Build OAuth URL with optional redirect parameter
      let oauthUrl = `${import.meta.env.VITE_API_URL}/auth/oauth/${provider}`;

      // If redirectAfterAuth is provided, pass it as a query parameter
      if (redirectAfterAuth) {
        console.log(`[OAuth] Redirecting to ${provider} with post-auth redirect: ${redirectAfterAuth}`);
        oauthUrl += `?redirect=${encodeURIComponent(redirectAfterAuth)}`;
      }

      // Redirect to OAuth provider
      window.location.href = oauthUrl;
    } catch (error) {
      console.error('OAuth sign in error:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoaded,
    isSignedIn: !!user,
    isLoading,
    isDemoMode: localStorage.getItem('demo_mode') === 'true',
    signIn,
    signUp,
    signOut,
    signInWithOAuth,
    clearAuth,
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