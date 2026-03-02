import React, { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useDemo } from '../contexts/DemoContext';
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
  const { isSignedIn, isLoaded, isDemoMode: authDemoMode, needsOnboarding } = useAuth();
  const { isDemoMode: demoDemoMode } = useDemo();
  const location = useLocation();

  // Quick check: If demo mode is active (from either context), always allow access
  // We check both contexts because DemoContext state updates immediately on enterDemoMode(),
  // while AuthContext's isDemoMode (which reads localStorage) may lag by one render cycle.
  if (authDemoMode || demoDemoMode) {
    return <>{children}</>;
  }

  // Wait for auth verification to complete before making any decisions
  // This prevents showing content then redirecting (the "session expired" feeling)
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] dark:bg-[#232320]">
        <div className="flex flex-col items-center gap-5">
          {/* Pulsing brand mark */}
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl bg-[#0c0a09] dark:bg-[#C1C0B6] flex items-center justify-center animate-pulse">
              <span className="text-lg font-semibold text-[#FAFAFA] dark:text-[#232320]" style={{ fontFamily: 'var(--font-heading)' }}>
                T
              </span>
            </div>
          </div>
          {/* Skeleton content shimmer */}
          <div className="flex flex-col items-center gap-2">
            <div className="h-2 w-24 rounded-full bg-[#0c0a09]/10 dark:bg-[#C1C0B6]/10 animate-pulse" />
            <div className="h-2 w-16 rounded-full bg-[#0c0a09]/5 dark:bg-[#C1C0B6]/5 animate-pulse" style={{ animationDelay: '150ms' }} />
          </div>
        </div>
      </div>
    );
  }

  // Auth is loaded - now we can make a decision
  if (isSignedIn) {
    // Gate new users to cinematic onboarding (skip if already on /onboarding)
    if (needsOnboarding && location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
    return <>{children}</>;
  }

  // Not signed in - redirect to auth page
  return <Navigate to={fallbackPath} state={{ from: location }} replace />;
};

export default ProtectedRoute;
