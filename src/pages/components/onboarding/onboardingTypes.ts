/**
 * onboardingTypes — Shared type definitions for the InstantTwinOnboarding flow.
 */

import { DataProvider } from '@/types/data-integration';

export interface RevealedArchetype {
  archetype_name: string;
  signature_quote?: string;
  first_impression?: string;
  core_traits?: unknown[];
}

export interface OnboardingColors {
  textPrimary: string;
  textSecondary: string;
  muted: string;
  categoryEntertainment: string;
  categorySocial: string;
  categoryProfessional: string;
  categoryHealth: string;
  categoryBrowsing: string;
  connected: string;
}

export interface PlatformStatusEntry {
  tokenExpired?: boolean;
  status?: string;
  [key: string]: unknown;
}

export type PlatformStatusData = Record<string, PlatformStatusEntry>;

export interface ConnectionCounts {
  activeConnections: DataProvider[];
  expiredConnections: DataProvider[];
}
