/**
 * usePlatformInsights
 *
 * Shared data hook for the per-platform Insights pages (Spotify, YouTube,
 * Calendar, Discord, Web). Replaces the fetch logic that was
 * copy-pasted across the pages.
 *
 * Handles the cold-start `generating` contract (2026-06-06 audit fix):
 * GET /api/insights/:platform returns `{ generating: true }` immediately when
 * the reflection cache is cold (the backend warms it in the background). This
 * hook keeps the loading state and polls until the real reflection lands —
 * instead of falling through to a misleading "Connect <platform>" empty state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { API_URL, getAccessToken, isAbortError } from '@/services/api/apiBase';

const POLL_INTERVAL_MS = 6000;
const MAX_POLLS = 15; // ~90s — matches the backend generation lock window

export interface PlatformInsightsState<T> {
  /** The full insights payload from the API, or null until it arrives. */
  insights: T | null;
  /** Initial load with no data yet. */
  loading: boolean;
  /** Backend is generating the reflection in the background; we're polling. */
  generating: boolean;
  /** A user-triggered refresh POST is in flight. */
  refreshing: boolean;
  /**
   * Stale-while-revalidate signal (audit-2026-06-10): true for the whole
   * refresh window — POST + the generating poll loop — while the previous
   * insights stay rendered. Pages show a small inline "Refreshing..."
   * indicator instead of swapping back to the skeleton.
   */
  isRefreshing: boolean;
  error: string | null;
  /**
   * Non-transient backend generation failure with nothing on screen.
   * Pages render an inline error with a retry action — NOT a "Connect"
   * CTA, since the platform is connected (audit-2026-06-10).
   */
  generationError: string | null;
  refresh: () => Promise<void>;
}

export function usePlatformInsights<T = unknown>(
  platform: string,
  signInMessage = 'Please sign in to see your insights',
): PlatformInsightsState<T> {
  const { token } = useAuth();
  const [insights, setInsights] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors `insights` so the give-up branch (inside a stale closure) can tell
  // whether anything is on screen before deciding to surface an error.
  const insightsRef = useRef<T | null>(null);

  const clearPoll = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const fetchInsights = useCallback(
    async (signal?: AbortSignal) => {
      const authToken = token || getAccessToken();
      if (!authToken) {
        setError(signInMessage);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/insights/${platform}`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal,
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const data = await response.json();

        // Cold/stale cache: backend warms it in the background. Keep showing the
        // loading state and poll — never fall through to the empty/connect state.
        if (data?.generating) {
          setGenerating(true);
          // A real generation is running again — drop any stale failure state
          // (e.g. the user hit retry from the inline error).
          setGenerationError(null);
          if (!signal?.aborted && pollCount.current < MAX_POLLS) {
            pollCount.current += 1;
            clearPoll();
            pollTimer.current = setTimeout(() => fetchInsights(signal), POLL_INTERVAL_MS);
          } else {
            // Gave up after MAX_POLLS — a legitimately slow generation can
            // still exceed the 90s window. With no data loaded, going quiet
            // here would render the misleading "Connect <platform>" empty
            // state for an already-connected user (audit-2026-06-10). Surface
            // an error instead; keep existing insights on screen if we have them.
            setGenerating(false);
            if (!insightsRef.current) {
              setError('Your insights are taking longer than expected. Please try again in a few minutes.');
            }
          }
          return;
        }

        // Non-transient backend failure (audit-2026-06-10): the API flags these
        // with { error: true, message } instead of masquerading as
        // generating:true (which forced a 90s poll before a fake state).
        if (data?.error === true) {
          clearPoll();
          setGenerating(false);
          const message =
            typeof data.message === 'string' && data.message
              ? data.message
              : 'Something went wrong while generating your insights.';
          if (insightsRef.current) {
            // Previous reflection is still valid — keep it rendered, report
            // the failed refresh as a toast.
            toast.error(message);
          } else {
            setGenerationError(message);
          }
          return;
        }

        if (data?.success === false) {
          setError(data.error || 'Failed to load insights');
          setGenerating(false);
          return;
        }

        setInsights(data as T);
        insightsRef.current = data as T;
        setGenerating(false);
        setError(null);
        setGenerationError(null);
        pollCount.current = 0;
        clearPoll();
      } catch (err) {
        if (isAbortError(err)) return;
        // Browser cancels in-flight requests at the network layer on navigation,
        // throwing TypeError before our AbortController cleanup fires. Yield a
        // microtask so cleanup can flip signal.aborted, then re-check.
        if (signal && !signal.aborted) await new Promise((r) => setTimeout(r, 0));
        if (signal?.aborted) return;
        console.error(`Failed to fetch ${platform} insights:`, err);
        setError('Unable to load your insights right now');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [platform, token, signInMessage],
  );

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    pollCount.current = 0;
    fetchInsights(controller.signal);
    return () => {
      controller.abort();
      clearPoll();
    };
  }, [fetchInsights]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const authToken = token || getAccessToken();
    try {
      const response = await fetch(`${API_URL}/insights/${platform}/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      // Backend regenerates in the background while holding the generation
      // lock, so the refetch returns generating:true and the poll loop picks
      // up the fresh reflection once it lands.
      pollCount.current = 0;
      await fetchInsights(abortRef.current?.signal);
    } catch (err) {
      console.error(`Failed to refresh ${platform} insights:`, err);
      // The current reflection is still valid, so report the failure as a
      // toast instead of replacing the page with an error state.
      toast.error('Could not refresh your insights. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [platform, token, fetchInsights]);

  // Stale-while-revalidate: covers both the refresh POST and the generating
  // poll loop that follows it while previous insights are still on screen.
  const isRefreshing = refreshing || (generating && insights !== null);

  return { insights, loading, generating, refreshing, isRefreshing, error, generationError, refresh };
}
