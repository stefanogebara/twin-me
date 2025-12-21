import React, { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  children: ReactNode;
  fallbackPath?: string;
}

/**
 * ProtectedRoute - Wraps content that requires authentication
 *
 * This component prevents the auth redirect flicker by:
 * 1. Checking if auth is still loading - if so, show nothing (prevents flash)
 * 2. If auth is loaded and user is signed in - show protected content
 * 3. If auth is loaded and user is NOT signed in - redirect to auth page
 *
 * The key improvement over SignedIn/SignedOut is that this checks for
 * the presence of a cached user or token BEFORE deciding to redirect.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallbackPath = '/auth'
}) => {
  const { isSignedIn, isLoaded, isDemoMode } = useAuth();
  const location = useLocation();

  // Quick check: If demo mode is active, always allow access
  if (isDemoMode) {
    return <>{children}</>;
  }

  // Quick check: If there's a token in localStorage, likely signed in
  // This prevents the flash while async verification happens
  const hasToken = typeof window !== 'undefined' && localStorage.getItem('auth_token');
  const hasCachedUser = typeof window !== 'undefined' && localStorage.getItem('auth_user');

  // If we have evidence of authentication (token or cached user), render content
  // This allows the background verification to complete without flicker
  if (hasToken || hasCachedUser) {
    return <>{children}</>;
  }

  // If auth is not yet loaded, show nothing to prevent flash
  if (!isLoaded) {
    return null;
  }

  // If auth is loaded and user is signed in, show content
  if (isSignedIn) {
    return <>{children}</>;
  }

  // If auth is loaded and user is NOT signed in, redirect
  return <Navigate to={fallbackPath} state={{ from: location }} replace />;
};

export default ProtectedRoute;
