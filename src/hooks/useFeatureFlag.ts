/**
 * useFeatureFlag — frontend read of the user's feature flags.
 *
 * Source of truth is GET /api/feature-flags (DB-backed, same endpoint
 * Settings.tsx writes through). Flags the backend does not expose resolve
 * to `defaultValue` — for park-flags that means absent/unknown = OFF, which
 * is exactly the safe behavior: a fetch failure parks the surface instead
 * of un-parking it.
 */

import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/services/api/apiBase';

async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  const res = await authFetch('/feature-flags');
  if (!res.ok) return {};
  try {
    const json = await res.json();
    return json?.success && json.flags && typeof json.flags === 'object'
      ? (json.flags as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export function useFeatureFlags() {
  return useQuery<Record<string, boolean>>({
    queryKey: ['feature-flags'],
    queryFn: fetchFeatureFlags,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Read one flag. Returns `defaultValue` while loading, on fetch failure,
 * and when the backend does not know the flag.
 */
export function useFeatureFlag(flag: string, defaultValue = false): boolean {
  const { data } = useFeatureFlags();
  if (!data || !(flag in data)) return defaultValue;
  return !!data[flag];
}
