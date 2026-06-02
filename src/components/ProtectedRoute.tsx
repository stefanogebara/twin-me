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
 *
 * 2026-05-10: demo-mode bypass removed. The previous branch granted access
 * to anyone with `localStorage.demo_mode === 'true'`; the only path past
 * this gate now is a real signed-in user.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  fallbackPath = '/auth'
}) => {
  const { isSignedIn, isLoaded, needsOnboarding } = useAuth();
  const location = useLocation();

  // Wait for auth verification to complete before making any decisions
  // This prevents showing content then redirecting (the "session expired" feeling)
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-5">
          {/* Pulsing brand mark */}
          <div className="relative">
            <img
              src="/images/backgrounds/flower-hero.webp"
              alt="Twin Me"
              className="w-12 h-12 animate-pulse"
              style={{ objectFit: 'contain' }}
            />
          </div>
          {/* Skeleton content shimmer */}
          <div className="flex flex-col items-center gap-2">
            <div className="h-2 w-24 rounded-full bg-foreground/10 animate-pulse" />
            <div className="h-2 w-16 rounded-full bg-foreground/5 animate-pulse" style={{ animationDelay: '150ms' }} />
          </div>
        </div>
      </div>
    );
  }

  // Auth is loaded - now we can make a decision
  if (isSignedIn) {
    // Gate new users to cinematic onboarding (skip if already on /onboarding).
    // Also allow /soul-reveal so the desktop "look you up" research reveal can
    // run once right after Google sign-in before the onboarding gate sends the
    // user onward.
    if (needsOnboarding && location.pathname !== '/onboarding' && location.pathname !== '/soul-reveal') {
      return <Navigate to="/onboarding" replace />;
    }
    return <>{children}</>;
  }

  // Not signed in - redirect to auth page.
  // audit-2026-05-09 F-M3: also serialize the original path into a
  // ?redirect= query param so the auth page can route back after sign-in
  // even on a full-page reload (state.from only survives SPA navigation).
  // Skip for the root '/' since that's the default landing post-auth.
  const intendedPath = location.pathname + (location.search || '') + (location.hash || '');
  const redirectQuery =
    intendedPath && intendedPath !== '/' && intendedPath !== '/auth'
      ? `?redirect=${encodeURIComponent(intendedPath)}`
      : '';
  return (
    <Navigate
      to={`${fallbackPath}${redirectQuery}`}
      state={{ from: location }}
      replace
    />
  );
};

export default ProtectedRoute;
