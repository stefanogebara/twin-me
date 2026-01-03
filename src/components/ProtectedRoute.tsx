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
 * This component properly waits for authentication verification to complete before:
 * 1. Showing protected content (if authenticated)
 * 2. Redirecting to auth page (if not authenticated)
 *
 * The key is that we wait for `isLoaded` to be true, which only happens
 * AFTER token verification completes. This prevents the "session expired"
 * feeling that occurred when content was shown before verification.
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

  // Wait for auth verification to complete before making any decisions
  // This prevents showing content then redirecting (the "session expired" feeling)
  if (!isLoaded) {
    // Show a subtle loading state while verifying
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Verifying session...</p>
        </div>
      </div>
    );
  }

  // Auth is loaded - now we can make a decision
  if (isSignedIn) {
    return <>{children}</>;
  }

  // Not signed in - redirect to auth page
  return <Navigate to={fallbackPath} state={{ from: location }} replace />;
};

export default ProtectedRoute;
