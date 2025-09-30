import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: 'google') => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Check for existing session on mount
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      console.log('🔍 Auth check - token exists:', !!token);

      if (token) {
        console.log('🔍 Verifying token with backend...');
        // Verify token with backend
        const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/verify`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        console.log('🔍 Token verification response:', response.status, response.ok);

        if (response.ok) {
          const userData = await response.json();
          console.log('✅ Token valid, user:', userData.user);
          setUser(userData.user);
        } else {
          console.log('❌ Invalid token, removing from localStorage');
          localStorage.removeItem('auth_token');
          setUser(null);
        }
      } else {
        console.log('🔍 No token found, user not signed in');
        setUser(null);
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
      localStorage.removeItem('auth_token');
      setUser(null);
    } finally {
      setIsLoaded(true);
      console.log('🔍 Auth check complete, isLoaded set to true');
    }
  };

  const signIn = async (email: string, password: string) => {
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
      setUser(data.user);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, firstName?: string, lastName?: string) => {
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
      setUser(data.user);
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    }
  };

  const signOut = async () => {
    console.log('🚪 Signing out user');
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const clearAuth = () => {
    console.log('🧹 Clearing auth state and localStorage');
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const signInWithOAuth = async (provider: 'google') => {
    try {
      // Redirect to OAuth provider
      window.location.href = `${import.meta.env.VITE_API_URL}/auth/oauth/${provider}`;
    } catch (error) {
      console.error('OAuth sign in error:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoaded,
    isSignedIn: !!user,
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