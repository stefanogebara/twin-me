/**
 * usePlatformInsights
 *
 * Shared data hook for the per-platform Insights pages (Spotify, YouTube,
 * Calendar, Discord, LinkedIn, Web). Replaces the fetch logic that was
 * copy-pasted across all six pages.
 *
 * Handles the cold-start `generating` contract (2026-06-06 audit fix):
 * GET /api/insights/:platform returns `{ generating: true }` immediately when
 * the reflection cache is cold (the backend warms it in the background). This
 * hook keeps the loading state and polls until the real reflection lands —
 * instead of falling through to a misleading "Connect <platform>" empty state.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  /** A user-triggered refresh is in flight. */
  refreshing: boolean;
  error: string | null;
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

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCount = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

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
          if (!signal?.aborted && pollCount.current < MAX_POLLS) {
            pollCount.current += 1;
            clearPoll();
            pollTimer.current = setTimeout(() => fetchInsights(signal), POLL_INTERVAL_MS);
          } else {
            // Gave up after MAX_POLLS — surface whatever state we have.
            setGenerating(false);
          }
          return;
        }

        if (data?.success === false) {
          setError(data.error || 'Failed to load insights');
          setGenerating(false);
          return;
        }

        setInsights(data as T);
        setGenerating(false);
        setError(null);
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
      await fetch(`${API_URL}/insights/${platform}/refresh`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      // Backend regenerates in the background, so the refetch returns
      // generating:true and the poll loop picks up the fresh reflection.
      pollCount.current = 0;
      await fetchInsights(abortRef.current?.signal);
    } catch (err) {
      console.error(`Failed to refresh ${platform} insights:`, err);
    } finally {
      setRefreshing(false);
    }
  }, [platform, token, fetchInsights]);

  return { insights, loading, generating, refreshing, error, refresh };
}
