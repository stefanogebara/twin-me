/**
 * Knowledge Graph Constants
 * Domain colors, platform colors, physics config, keyword maps
 */

// Domain visual config (matches CLAUDE.md design system)
export const DOMAIN_CONFIG: Record<string, { label: string; color: string }> = {
  personality: { label: 'Personality', color: '#c9b99a' },
  lifestyle:   { label: 'Lifestyle',   color: '#34d399' },
  cultural:    { label: 'Cultural',    color: '#f59e0b' },
  social:      { label: 'Social',      color: '#60a5fa' },
  motivation:  { label: 'Motivation',  color: '#f97316' },
};

export const DOMAIN_ORDER = ['personality', 'lifestyle', 'cultural', 'social', 'motivation'] as const;

// Platform visual config
export const PLATFORM_CONFIG: Record<string, { label: string; color: string }> = {
  spotify:         { label: 'Spotify',    color: '#1DB954' },
  youtube:         { label: 'YouTube',    color: '#FF0000' },
  google_calendar: { label: 'Calendar',   color: '#4285F4' },
  discord:         { label: 'Discord',    color: '#5865F2' },
  linkedin:        { label: 'LinkedIn',   color: '#0A66C2' },
  github:          { label: 'GitHub',     color: '#8B949E' },
  reddit:          { label: 'Reddit',     color: '#FF4500' },
  gmail:           { label: 'Gmail',      color: '#EA4335' },
  twitch:          { label: 'Twitch',     color: '#9146FF' },
  whoop:           { label: 'Whoop',      color: '#44C7B1' },
  outlook:         { label: 'Outlook',    color: '#0078D4' },
  garmin:          { label: 'Garmin',     color: '#007CC3' },
  strava:          { label: 'Strava',     color: '#FC4C02' },
  fitbit:          { label: 'Fitbit',     color: '#00B0B9' },
};

// Keywords to detect platform mentions in wiki content
export const PLATFORM_KEYWORDS: Record<string, string[]> = {
  spotify:         ['spotify', 'playlist', 'listening', 'track', 'album', 'artist'],
  youtube:         ['youtube', 'video', 'watch', 'subscribe', 'channel'],
  google_calendar: ['calendar', 'schedule', 'meeting', 'event', 'appointment'],
  discord:         ['discord', 'server', 'community', 'channel'],
  linkedin:        ['linkedin', 'professional', 'career', 'network'],
  github:          ['github', 'repo', 'code', 'commit', 'repository'],
  reddit:          ['reddit', 'subreddit', 'post'],
  gmail:           ['gmail', 'email', 'inbox', 'mail'],
  twitch:          ['twitch', 'stream', 'gaming'],
  whoop:           ['whoop', 'recovery', 'strain', 'hrv', 'sleep score'],
};

// Node sizes
export const NODE_SIZE = {
  domain: 28,
  platform: 13,
} as const;

// d3-force physics config
export const PHYSICS = {
  chargeStrength: -280,
  linkDistanceCrossref: 130,
  linkDistancePlatform: 170,
  collisionPadding: 10,
  alphaDecay: 0.02,
  velocityDecay: 0.3,
} as const;
