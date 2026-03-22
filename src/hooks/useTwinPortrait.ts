/**
 * useTwinPortrait Hook
 *
 * Fetches the complete twin portrait data for the Soul Signature page.
 * Uses @tanstack/react-query for caching, stale management, and background refetch.
 * In demo mode, returns DEMO_TWIN_PORTRAIT without making any API calls.
 */

import { useQuery } from '@tanstack/react-query';
import type { TwinPortraitData } from '../pages/components/soul-portrait/types';
import { DEMO_TWIN_PORTRAIT } from '../services/demoDataService';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL;

async function fetchPortrait(): Promise<TwinPortraitData> {
  const token = getAccessToken() || localStorage.getItem('auth_token');
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/twin/portrait`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Portrait fetch failed: ${res.status}`);
  }

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to load portrait');
  }

  return json.portrait;
}

export function useTwinPortrait(enabled = true) {
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  return useQuery<TwinPortraitData>({
    queryKey: ['twin-portrait', isDemoMode ? 'demo' : 'live'],
    queryFn: isDemoMode ? () => Promise.resolve(DEMO_TWIN_PORTRAIT) : fetchPortrait,
    enabled,
    staleTime: isDemoMode ? Infinity : 2 * 60 * 1000,
    refetchInterval: isDemoMode ? false : 5 * 60 * 1000,
    retry: isDemoMode ? false : 1,
  });
}
