/**
 * Demo Data Service
 * Barrel re-export file - maintains backwards compatibility for all existing imports.
 * Actual implementations are in ./demo/ subdirectory modules.
 */

// Helpers
export {
  randomInRange,
  randomFloat,
  randomFromArray,
  RECOVERY_LABELS,
  STRAIN_LABELS,
  SLEEP_QUALITIES,
  MOODS,
  ARTIST_POOLS,
  TRACK_POOLS,
  GENRE_POOLS,
  PEAK_HOURS,
  getRelativeDate,
  getRelativeDateDays,
  formatTimeAgo,
  getDayName,
  generateRecentTrackTime,
  generateListeningHours,
} from './demo/demoHelpers';

// User
export { DEMO_USER, DEMO_PLATFORM_CONNECTIONS } from './demo/demoUser';

// Calendar
export { generateEventTypeDistribution, generateWeeklyHeatmap, DEMO_CALENDAR_DATA } from './demo/demoCalendar';

// Spotify
export { getDemoSpotifyData, DEMO_SPOTIFY_DATA, DEMO_SPOTIFY_PERSONALITY } from './demo/demoSpotify';

// Soul Signature & Twin Portrait
export { DEMO_SOUL_SIGNATURE, DEMO_INSIGHTS, DEMO_TWIN_PORTRAIT } from './demo/demoSoulSignature';

// Goals
export { DEMO_ACTIVE_GOALS, DEMO_SUGGESTED_GOALS, DEMO_COMPLETED_GOALS, DEMO_GOAL_SUMMARY } from './demo/demoGoals';

// Personality
export type { DemoPersonalityScores, DemoSoulArchetype, DemoBehavioralFeature, DemoMBTIQuestion } from './demo/demoPersonality';
export {
  DEMO_PERSONALITY_SCORES,
  DEMO_SOUL_ARCHETYPE,
  DEMO_BEHAVIORAL_FEATURES,
  DEMO_MBTI_QUESTIONS,
  MBTI_ARCHETYPES,
  generateDemoPersonalityResult,
} from './demo/demoPersonality';

// Journal
export type { DemoJournalEntry, DemoJournalAnalysis } from './demo/demoJournal';
export { getDemoJournalData } from './demo/demoJournal';

// Today Insights
export type { DemoTodayInsight } from './demo/demoTodayInsights';
export { DEMO_TODAY_INSIGHTS } from './demo/demoTodayInsights';

// Discord
export type { DemoDiscordInsights, DemoDiscordData, DemoDiscordServer } from './demo/demoDiscord';
export { getDemoDiscordInsights, getDemoDiscordData } from './demo/demoDiscord';

// LinkedIn
export type { DemoLinkedInInsights, DemoLinkedInData } from './demo/demoLinkedIn';
export { getDemoLinkedInInsights, getDemoLinkedInData } from './demo/demoLinkedIn';

// Combined
export { getDemoContext, DEMO_CONTEXT, DEMO_TWIN_STATS, getDemoData, DEMO_DATA } from './demo/demoCombined';
