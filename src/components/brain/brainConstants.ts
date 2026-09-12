/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Memory {
  id: string;
  content: string;
  memory_type: string;
  importance_score: number;
  retrieval_count: number;
  created_at: string;
  last_accessed_at: string | null;
  metadata: Record<string, unknown> | null;
}

export interface Composition {
  reflection: number;
  platform_data: number;
  fact: number;
  conversation: number;
  observation: number;
}

export interface BrainSnapshot {
  id: string;
  snapshot_date: string;
  node_count: number;
  avg_confidence: number;
  snapshot_type: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const EXPERT_FILTERS = [
  { key: null, label: 'All' },
  { key: 'personality_psychologist', label: 'Personality' },
  { key: 'lifestyle_analyst', label: 'Lifestyle' },
  { key: 'cultural_identity', label: 'Cultural' },
  { key: 'social_dynamics', label: 'Social' },
  { key: 'motivation_analyst', label: 'Motivation' },
] as const;

/* Colours are MARKS only (a dot, a bar segment), never text: the register's
   signature values from src/styles/register.css, each 3:1 or better as a mark
   on the page. Written as hex because the composition bar and chart read them
   outside CSS custom properties. Types and experts keep the reflection
   experts' own hues: personality iris, lifestyle periwinkle, cultural
   verdigris, social orchid, motivation ember. */
export const TYPE_FILTERS = [
  { key: null, label: 'All types', color: '#585254' },
  { key: 'reflection', label: 'Reflections', color: '#8179fb' },
  { key: 'platform_data', label: 'Platform data', color: '#4c9786' },
  { key: 'fact', label: 'Facts', color: '#c47833' },
  { key: 'conversation', label: 'Conversations', color: '#668cc2' },
] as const;

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'importance', label: 'Most important' },
  { key: 'accessed', label: 'Most used' },
] as const;

export const EXPERT_COLORS: Record<string, string> = {
  personality_psychologist: '#8179fb',
  lifestyle_analyst: '#668cc2',
  cultural_identity: '#4c9786',
  social_dynamics: '#ba70b6',
  motivation_analyst: '#c47833',
};

export const EXPERT_LABELS: Record<string, string> = {
  personality_psychologist: 'Personality',
  lifestyle_analyst: 'Lifestyle',
  cultural_identity: 'Cultural',
  social_dynamics: 'Social',
  motivation_analyst: 'Motivation',
};

export const TYPE_COLORS: Record<string, string> = {
  reflection: '#8179fb',
  platform_data: '#4c9786',
  fact: '#c47833',
  conversation: '#668cc2',
  observation: '#8c8889',
};

export const TYPE_LABELS: Record<string, string> = {
  reflection: 'reflections',
  platform_data: 'platform data',
  fact: 'facts',
  conversation: 'conversations',
  observation: 'observations',
};

export const PAGE_SIZE = 20;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function getPlatformLabel(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const source = (metadata.source || metadata.platform) as string | undefined;
  if (!source) return null;
  const labels: Record<string, string> = {
    spotify: 'Spotify',
    google_calendar: 'Google Calendar',
    youtube: 'YouTube',
    discord: 'Discord',
    linkedin: 'LinkedIn',
    whoop: 'Whoop',
    github: 'GitHub',
    reddit: 'Reddit',
    twitch: 'Twitch',
    gmail: 'Gmail',
    browser_extension: 'Browser',
  };
  return labels[source] || source;
}
