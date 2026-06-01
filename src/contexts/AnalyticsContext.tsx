import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import posthog from 'posthog-js';
import { useAuth } from './AuthContext';

// ─── PostHog Initialization ─────────────────────────────────────
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let posthogInitialized = false;

export function initPostHog() {
  if (posthogInitialized || !POSTHOG_KEY || POSTHOG_KEY === 'placeholder' || POSTHOG_KEY.startsWith('phc_xxx')) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,     // We handle pageviews via React Router
    capture_pageleave: true,
    // autocapture disabled (audit-2026-05-31): PostHog's click/input autocapture
    // hooks EVERY interaction and builds the $autocapture event on the event
    // handler — it was the dominant cost on the user's first click (~300ms+ INP
    // measured on Talk to Twin, plus ~66ms on every subsequent click). The app is
    // richly hand-instrumented (88 trackEvent/trackFunnel/trackUserAction calls
    // across the auth, onboarding, connect, and chat funnels), so autocapture is
    // largely redundant. Off = clicks no longer run any PostHog work. Re-enable
    // if you want exploratory/heatmap auto-capture back.
    autocapture: false,
    persistence: 'localStorage',
    // perf (audit-2026-05-29): the session-replay recorder (rrweb) takes its
    // initial DOM snapshot lazily on the user's FIRST interaction — measured at
    // ~300ms+ of INP on the first click on Talk to Twin (the snapshot ran on
    // mouseup, blocking the click). Disable auto-start and kick replay off at
    // idle instead, so the snapshot never blocks an interaction. Trade-off: the
    // first few seconds of each session aren't replayed; events + autocapture
    // still fire immediately.
    disable_session_recording: true,
    loaded: () => {},
  });
  posthogInitialized = true;

  // Start session replay OFF the critical interaction path (idle, a few seconds
  // in). requestIdleCallback's timeout guarantees it still starts if the tab
  // never goes idle; setTimeout is the fallback for browsers without rIC.
  const startReplay = () => {
    try { posthog.startSessionRecording(); } catch { /* recorder optional */ }
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(startReplay, { timeout: 5000 });
  } else if (typeof window !== 'undefined') {
    window.setTimeout(startReplay, 3000);
  }
}

// ─── Context Interface ──────────────────────────────────────────
interface AnalyticsContextType {
  trackEvent: (eventType: string, eventData?: Record<string, unknown>) => void;
  trackPageView: (pagePath: string) => void;
  trackUserAction: (action: string, target: string, metadata?: Record<string, unknown>) => void;
  trackConversation: (twinId: string, messageCount: number, duration: number) => void;
  trackTwinInteraction: (twinId: string, interactionType: string, metadata?: Record<string, unknown>) => void;
  trackFunnel: (step: string, metadata?: Record<string, unknown>) => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

// ─── Provider ───────────────────────────────────────────────────
export const AnalyticsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const identifiedRef = useRef<string | null>(null);

  // Identify user in PostHog when auth changes
  useEffect(() => {
    if (!POSTHOG_KEY) return;

    if (user?.id && identifiedRef.current !== user.id) {
      posthog.identify(user.id, {
        email: user.email,
        name: user.name || user.full_name,
        created_at: user.created_at,
      });
      identifiedRef.current = user.id;
    } else if (!user?.id && identifiedRef.current) {
      posthog.reset();
      identifiedRef.current = null;
    }
  }, [user?.id, user?.email, user?.name, user?.full_name, user?.created_at]);

  const isEnabled = useCallback(() => {
    return !!POSTHOG_KEY;
  }, []);

  const trackEvent = useCallback((eventType: string, eventData: Record<string, unknown> = {}) => {
    if (!isEnabled()) return;
    posthog.capture(eventType, eventData);
  }, [isEnabled]);

  const trackPageView = useCallback((pagePath: string) => {
    if (!isEnabled()) return;
    posthog.capture('$pageview', {
      $current_url: window.location.origin + pagePath,
      path: pagePath,
      title: document.title,
    });
  }, [isEnabled]);

  const trackUserAction = useCallback((action: string, target: string, metadata: Record<string, unknown> = {}) => {
    if (!isEnabled()) return;
    posthog.capture('user_action', { action, target, ...metadata });
  }, [isEnabled]);

  const trackConversation = useCallback((twinId: string, messageCount: number, duration: number) => {
    if (!isEnabled()) return;
    posthog.capture('conversation_session', {
      twin_id: twinId,
      message_count: messageCount,
      duration_seconds: duration,
      engagement_level: messageCount > 10 ? 'high' : messageCount > 5 ? 'medium' : 'low',
    });
  }, [isEnabled]);

  const trackTwinInteraction = useCallback((twinId: string, interactionType: string, metadata: Record<string, unknown> = {}) => {
    if (!isEnabled()) return;
    posthog.capture('twin_interaction', {
      twin_id: twinId,
      interaction_type: interactionType,
      ...metadata,
    });
  }, [isEnabled]);

  const trackFunnel = useCallback((step: string, metadata: Record<string, unknown> = {}) => {
    if (!isEnabled()) return;
    posthog.capture(step, metadata);
  }, [isEnabled]);

  const value: AnalyticsContextType = {
    trackEvent,
    trackPageView,
    trackUserAction,
    trackConversation,
    trackTwinInteraction,
    trackFunnel,
  };

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
};

// ─── Hook ───────────────────────────────────────────────────────
export const useAnalytics = () => {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
};
