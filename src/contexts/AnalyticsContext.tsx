import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import type posthogType from 'posthog-js';
import { useAuth } from './AuthContext';

// ─── PostHog Initialization ─────────────────────────────────────
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

type PostHog = typeof posthogType;
/* posthog-js is 209 KB of the entry chunk and nothing on the first paint needs it (M3-2,
   2026-09-19). It is fetched once the browser is idle; until then every call is queued in
   order and delivered when it arrives, so no event is lost and no screen waits on it. */
let client: PostHog | null = null;
let loading: Promise<void> | null = null;
const queued: Array<(p: PostHog) => void> = [];
const enabled = Boolean(POSTHOG_KEY) && POSTHOG_KEY !== 'placeholder' && !String(POSTHOG_KEY).startsWith('phc_xxx');

function withPostHog(fn: (p: PostHog) => void) {
  if (!enabled) return;
  if (client) { fn(client); return; }
  queued.push(fn);
}

/** How many calls wait for the client; for tests. */
export function postHogQueued(): number { return queued.length; }

const onIdle = (fn: () => void, timeout: number, fallbackMs: number) => {
  if (typeof window === 'undefined') { fn(); return; }
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, fallbackMs);
};

function loadPostHog(): Promise<void> {
  if (loading) return loading;
  loading = import('posthog-js').then(({ default: posthog }) => {
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
    client = posthog;
    for (const fn of queued.splice(0)) fn(posthog);
    // Start session replay OFF the critical interaction path (idle, a few seconds
    // in). requestIdleCallback's timeout guarantees it still starts if the tab
    // never goes idle; setTimeout is the fallback for browsers without rIC.
    onIdle(() => { try { posthog.startSessionRecording(); } catch { /* recorder optional */ } }, 5000, 3000);
  });
  return loading;
}

/**
 * Asks for the client once the browser is idle (or after two seconds, whichever is first)
 * and resolves when it is ready. Safe to call more than once.
 */
export function initPostHog(): Promise<void> {
  if (!enabled) return Promise.resolve();
  if (loading) return loading;
  return new Promise<void>((resolve) => { onIdle(() => { void loadPostHog().then(resolve, resolve); }, 2000, 1500); });
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
      withPostHog((p) => p.identify(user.id, {
        email: user.email,
        name: user.fullName,
        created_at: user.created_at,
      }));
      identifiedRef.current = user.id;
    } else if (!user?.id && identifiedRef.current) {
      withPostHog((p) => p.reset());
      identifiedRef.current = null;
    }
  }, [user?.id, user?.email, user?.fullName, user?.created_at]);

  const isEnabled = useCallback(() => {
    return !!POSTHOG_KEY;
  }, []);

  const trackEvent = useCallback((eventType: string, eventData: Record<string, unknown> = {}) => {
    if (!isEnabled()) return;
    withPostHog((p) => p.capture(eventType, eventData));
  }, [isEnabled]);

  const trackPageView = useCallback((pagePath: string) => {
    if (!isEnabled()) return;
    const props = { $current_url: window.location.origin + pagePath, path: pagePath, title: document.title };
    withPostHog((p) => p.capture('$pageview', props));
  }, [isEnabled]);

  const trackUserAction = useCallback((action: string, target: string, metadata: Record<string, unknown> = {}) => {
    if (!isEnabled()) return;
    withPostHog((p) => p.capture('user_action', { action, target, ...metadata }));
  }, [isEnabled]);

  const trackConversation = useCallback((twinId: string, messageCount: number, duration: number) => {
    if (!isEnabled()) return;
    withPostHog((p) => p.capture('conversation_session', {
      twin_id: twinId,
      message_count: messageCount,
      duration_seconds: duration,
      engagement_level: messageCount > 10 ? 'high' : messageCount > 5 ? 'medium' : 'low',
    }));
  }, [isEnabled]);

  const trackTwinInteraction = useCallback((twinId: string, interactionType: string, metadata: Record<string, unknown> = {}) => {
    if (!isEnabled()) return;
    withPostHog((p) => p.capture('twin_interaction', {
      twin_id: twinId,
      interaction_type: interactionType,
      ...metadata,
    }));
  }, [isEnabled]);

  const trackFunnel = useCallback((step: string, metadata: Record<string, unknown> = {}) => {
    if (!isEnabled()) return;
    withPostHog((p) => p.capture(step, metadata));
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
