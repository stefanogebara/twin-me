/**
 * API Service Layer - Barrel Re-export
 *
 * All domain-specific API modules live in ./api/ subdirectory.
 * This file re-exports everything to maintain backwards compatibility
 * with existing imports like: import { spotifyAPI } from '@/services/apiService'
 */

// Base utilities
export { API_URL, getAuthHeaders, handleAPIError } from './api/apiBase';
export type { AuthHeaders } from './api/apiBase';

// Dashboard
export { dashboardAPI } from './api/dashboardAPI';
export type { DashboardStats, ActivityItem } from './api/dashboardAPI';

// Training
export { trainingAPI } from './api/trainingAPI';
export type { TrainingMetrics, TrainingStartResponse } from './api/trainingAPI';

// Calendar
export { calendarAPI } from './api/calendarAPI';
export type { CalendarEvent, CalendarEventsResponse, CalendarStatus } from './api/calendarAPI';

// Spotify
export { spotifyAPI } from './api/spotifyAPI';
export type {
  SpotifyPlaylist,
  SpotifyRecommendation,
  FilteredPlaylistsResponse,
  SpotifyStatus,
  SpotifyTrack,
  SpotifyPlaybackState,
  MusicSession,
} from './api/spotifyAPI';

// Whoop
export { whoopAPI } from './api/whoopAPI';
export type { WhoopStatus, WhoopCurrentState } from './api/whoopAPI';

// Soul Signature
export { soulSignatureAPI } from './api/soulSignatureAPI';

// Onboarding
export { onboardingAPI } from './api/onboardingAPI';
export type {
  OnboardingQuestion,
  OnboardingAnswers,
  OnboardingPreferences,
  OnboardingStatus,
} from './api/onboardingAPI';

// Journal
export { journalAPI } from './api/journalAPI';
export type {
  JournalEntry,
  JournalAnalysis,
  JournalInsights,
  CreateJournalEntry,
} from './api/journalAPI';

// Goals
export { goalsAPI } from './api/goalsAPI';
export type {
  Goal,
  GoalProgress,
  GoalWithProgress,
  GoalSummary,
} from './api/goalsAPI';
