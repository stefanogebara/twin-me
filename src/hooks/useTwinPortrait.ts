/**
 * useTwinPortrait Hook
 *
 * Fetches the complete twin portrait data for the Soul Signature page.
 * Uses @tanstack/react-query for caching, stale management, and background refetch.
 */

import { useQuery } from '@tanstack/react-query';
import type { TwinPortraitData } from '../pages/components/soul-portrait/types';

const API_URL = import.meta.env.VITE_API_URL;

async function fetchPortrait(): Promise<TwinPortraitData> {
  const token = localStorage.getItem('auth_token');
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
  return useQuery<TwinPortraitData>({
    queryKey: ['twin-portrait'],
    queryFn: fetchPortrait,
    enabled,
    staleTime: 2 * 60 * 1000,       // 2 minutes
    refetchInterval: 5 * 60 * 1000,  // 5 minutes
    retry: 1,
  });
}
