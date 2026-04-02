import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { DEMO_USER } from '../services/demoDataService';
import { setAccessToken, getAccessToken, authFetch } from '../services/api/apiBase';

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
  authToken: string | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  needsOnboarding: boolean;
  setNeedsOnboarding: (v: boolean) => void;
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
  const [authToken, setAuthToken] = useState<string | null>(getAccessToken() || localStorage.getItem('auth_token'));
  const [isLoaded, setIsLoaded] = useState(false); // Don't set true until verification completes
  const [isLoading, setIsLoading] = useState(true); // Start true — we're verifying on mount
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Guard against concurrent checkAuth calls (StrictMode double-mount, demo-mode events)
  const verifyInFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Page reload recovery: if no in-memory token, try cookie-based refresh first
    const initAuth = async () => {
      if (!getAccessToken() && !localStorage.getItem('auth_token')) {
        // Only attempt cookie-based refresh if we've had a previous session on this device
        // (auth_user exists = user logged in before, refresh cookie may still be valid)
        if (localStorage.getItem('auth_user')) {
          await refreshAccessToken();
        }
      }
      checkAuth();
    };
    initAuth();

    // Listen for demo mode changes (cross-tab via 'storage', same-tab via custom event)
    const handleDemoModeChange = () => {
      const demoActive = localStorage.getItem('demo_mode') === 'true';
      if (demoActive) {
        setUser(DEMO_USER);
        setIsLoaded(true);
        setIsLoading(false);
      } else {
        setUser(null);
        checkAuth();
      }
    };

    window.addEventListener('storage', handleDemoModeChange);
    window.addEventListener('demo-mode-change', handleDemoModeChange);
    return () => {
      window.removeEventListener('storage', handleDemoModeChange);
      window.removeEventListener('demo-mode-change', handleDemoModeChange);
      // Abort any in-flight verify request on unmount (StrictMode cleanup)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      verifyInFlightRef.current = false;
    };
  }, []);

  const checkAuth = async () => {
    // DEMO MODE: Skip real auth check if in demo mode
    if (localStorage.getItem('demo_mode') === 'true') {
      setUser(DEMO_USER);
      setIsLoaded(true);
      setIsLoading(false);
      return;
    }

    const token = getAccessToken() || localStorage.getItem('auth_token');

    if (!token) {
      setUser(null);
      setAuthToken(null);
      localStorage.removeItem('auth_user');
      setIsLoaded(true);
      setIsLoading(false);
      return;
    }

    // Prevent concurrent verify calls (StrictMode fires effects twice)
    if (verifyInFlightRef.current) {
      return;
    }

    // Abort any previous in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    verifyInFlightRef.current = true;

    // Sync authToken state with localStorage
    setAuthToken(token);
    setIsLoading(true);

    // If we have a cached user, use it for display while verifying
    // But don't set isLoaded until verification completes
    const cachedUser = getCachedUser();
    if (cachedUser) {
      setUser(cachedUser);
      // Note: isLoaded stays false until verification completes
    }

    // Token verification - must complete before isLoaded is set
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include',
        signal: abortController.signal,
      });

      // If this request was aborted (component unmounted), bail out silently
      if (abortController.signal.aborted) return;

      if (response.ok) {
        const userData = await response.json();
        setUser(userData.user);
        // Cache user data for next load
        localStorage.setItem('auth_user', JSON.stringify(userData.user));
        // Store account creation date for welcome guide auto-dismiss
        if (userData.user?.createdAt) {
          localStorage.setItem('twinme_account_created', userData.user.createdAt);
        }
        // Non-blocking: check if new user needs onboarding
        fetch(`${import.meta.env.VITE_API_URL}/onboarding/new-user-check`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.isNew) setNeedsOnboarding(true); })
          .catch(() => {});
        // Non-blocking: sync browser timezone to backend
        const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detectedTz) {
          authFetch('/account/timezone', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: detectedTz }),
          }).catch(() => {}); // Fire-and-forget
        }
      } else {
        // Token is invalid - clear auth state
        setAccessToken(null);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setUser(null);
        setAuthToken(null);
      }
    } catch (error: unknown) {
      // Aborted fetch — component unmounted, don't touch state
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      // Network error - keep cached state if we have one
      // This prevents logout on temporary network issues
      if (!cachedUser) {
        // No cached user and network error - clear everything
        setAccessToken(null);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setUser(null);
        setAuthToken(null);
      }
      // If we have cached user, keep them logged in despite network error
    } finally {
      // Only update loading states if this request wasn't aborted
      if (!abortController.signal.aborted) {
        verifyInFlightRef.current = false;
        abortControllerRef.current = null;
        setIsLoading(false);
        setIsLoaded(true);
      }
    }
  };

  const signOut = async () => {
    // Tell the server to invalidate the refresh token cookie
    const token = getAccessToken() || localStorage.getItem('auth_token');
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      }).catch(() => {});
    }

    setAccessToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('demo_mode'); // Also exit demo mode
    setUser(null);
    setAuthToken(null);
    setNeedsOnboarding(false);
  };

  const clearAuth = () => {
    // Before clearing, tell the server to invalidate the refresh token cookie
    const token = getAccessToken() || localStorage.getItem('auth_token');
    if (token) {
      fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      }).catch(() => {});
    }

    setAccessToken(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
    setAuthToken(null);
  };

  // Refresh access token using httpOnly refresh token cookie
  const refreshAccessToken = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        // Store access token in memory (not localStorage — XSS protection)
        setAccessToken(data.accessToken);
        setAuthToken(data.accessToken);
        if (data.user) {
          localStorage.setItem('auth_user', JSON.stringify(data.user));
          setUser(data.user);
        }
        return true;
      } else {
        // Refresh token cookie is invalid or expired — DON'T clear localStorage here.
        // Let checkAuth() decide based on any remaining localStorage token (backward compat).
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

    // Refresh token 5 minutes before expiration (access token is 30 minutes)
    const REFRESH_INTERVAL = 25 * 60 * 1000; // 25 minutes

    const refreshInterval = setInterval(() => {
      refreshAccessToken();
    }, REFRESH_INTERVAL);

    return () => clearInterval(refreshInterval);
  }, [user]);

  const signInWithOAuth = async (provider: 'google', redirectAfterAuth?: string) => {
    // Build OAuth URL with query parameters
    let oauthUrl = `${import.meta.env.VITE_API_URL}/auth/oauth/${provider}`;
    const params = new URLSearchParams();

    if (redirectAfterAuth) {
      params.set('redirect', redirectAfterAuth);
    }

    // Pass beta invite code through to backend OAuth state
    const inviteCode = sessionStorage.getItem('beta_invite_code');
    if (inviteCode) {
      params.set('invite', inviteCode);
    }

    if (params.toString()) {
      oauthUrl += `?${params.toString()}`;
    }

    // Redirect to OAuth provider
    window.location.href = oauthUrl;
  };

  const value: AuthContextType = {
    user,
    authToken,
    isLoaded,
    isSignedIn: !!user,
    isLoading,
    isDemoMode: localStorage.getItem('demo_mode') === 'true',
    needsOnboarding,
    setNeedsOnboarding,
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