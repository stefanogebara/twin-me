/**
 * onboardingHelpers — Shared constants, utilities, and small UI primitives
 * for the InstantTwinOnboarding flow.
 */

import type { PlatformsSummary } from '@/hooks/usePlatformsSummary';

/**
 * Pure optimistic-disconnect surgery on the canonical platforms summary:
 * returns a NEW summary with the platform's breakdown entry removed and the
 * counts decremented to match. Used to keep the instant-removal feel on
 * /get-started after the legacy ['platformStatus'] cache was retired
 * (batch-3 state-unification).
 */
export function removePlatformFromSummary(
  summary: PlatformsSummary,
  platform: string
): PlatformsSummary {
  const entry = summary.breakdown.find(e => e.platform === platform);
  if (!entry) return summary;
  return {
    total: Math.max(0, summary.total - 1),
    active: Math.max(0, summary.active - (entry.state === 'active' ? 1 : 0)),
    expired: Math.max(0, summary.expired - (entry.state === 'expired' ? 1 : 0)),
    stale: Math.max(0, summary.stale - (entry.state === 'stale' ? 1 : 0)),
    breakdown: summary.breakdown.filter(e => e.platform !== platform),
  };
}

export const NANGO_PROVIDER_MAP: Record<string, string> = {
  'linkedin': 'linkedin',
  'github': 'github-getting-started',
  'reddit': 'reddit',
  'spotify': 'spotify',
  'youtube': 'youtube',
  'google-calendar': 'google-calendar',
  'strava': 'strava',
  'fitbit': 'fitbit',
  'garmin': 'garmin',
  'twitch': 'twitch',
  'whoop': 'whoop',
  'oura': 'oura',
  'microsoft_outlook': 'outlook',
};


