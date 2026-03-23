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

export const TYPE_FILTERS = [
  { key: null, label: 'All Types', color: 'rgba(255,255,255,0.5)' },
  { key: 'reflection', label: 'Reflections', color: '#C9B99A' },
  { key: 'platform_data', label: 'Platform Data', color: '#2dd4bf' },
  { key: 'fact', label: 'Facts', color: '#5d5cae' },
  { key: 'conversation', label: 'Conversations', color: '#60a5fa' },
] as const;

export const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'importance', label: 'Most Important' },
  { key: 'accessed', label: 'Most Accessed' },
] as const;

export const EXPERT_COLORS: Record<string, string> = {
  personality_psychologist: '#a78bfa',
  lifestyle_analyst: '#34d399',
  cultural_identity: '#fbbf24',
  social_dynamics: '#60a5fa',
  motivation_analyst: '#fb923c',
};

export const EXPERT_LABELS: Record<string, string> = {
  personality_psychologist: 'Personality',
  lifestyle_analyst: 'Lifestyle',
  cultural_identity: 'Cultural',
  social_dynamics: 'Social',
  motivation_analyst: 'Motivation',
};

export const TYPE_COLORS: Record<string, string> = {
  reflection: '#C9B99A',
  platform_data: '#2dd4bf',
  fact: '#5d5cae',
  conversation: '#60a5fa',
  observation: '#6B7280',
};

export const TYPE_LABELS: Record<string, string> = {
  reflection: 'reflections',
  platform_data: 'platform data',
  fact: 'facts',
  conversation: 'conversations',
  observation: 'observations',
};

export const DEMO_MEMORIES: Memory[] = [
  {
    id: 'demo-1',
    content: 'Your music shifts dramatically between focused work hours and evenings — you seem to use sound as a deliberate tool for managing mental state. During deep work, you default to ambient or lo-fi instrumentals, while evenings shift toward emotionally rich vocal tracks.',
    memory_type: 'reflection',
    importance_score: 9,
    retrieval_count: 12,
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    last_accessed_at: new Date(Date.now() - 3600000).toISOString(),
    metadata: { expert: 'lifestyle_analyst' },
  },
  {
    id: 'demo-2',
    content: 'Listened to "Bohemian Rhapsody" by Queen, "Stairway to Heaven" by Led Zeppelin, and "Hotel California" by Eagles during evening session.',
    memory_type: 'platform_data',
    importance_score: 4,
    retrieval_count: 2,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    last_accessed_at: null,
    metadata: { source: 'spotify', platform: 'spotify' },
  },
  {
    id: 'demo-3',
    content: 'You gravitate toward the same 3-4 artists repeatedly during high-stress weeks, suggesting music is a comfort mechanism for you. This pattern is consistent across the last 3 months of listening data.',
    memory_type: 'reflection',
    importance_score: 8,
    retrieval_count: 7,
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    last_accessed_at: new Date(Date.now() - 86400000).toISOString(),
    metadata: { expert: 'personality_psychologist' },
  },
  {
    id: 'demo-4',
    content: 'Prefers working in the morning, typically starts deep work between 8-9 AM. Calendar blocks are consistently longer on Tuesdays and Thursdays.',
    memory_type: 'fact',
    importance_score: 6,
    retrieval_count: 15,
    created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    last_accessed_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    metadata: { expert: 'lifestyle_analyst' },
  },
  {
    id: 'demo-5',
    content: 'There\'s a recurring curiosity around creative and technical topics that suggests an unusual blend of left-brain and right-brain engagement. You switch between analytical deep-dives and creative exploration within the same day.',
    memory_type: 'reflection',
    importance_score: 9,
    retrieval_count: 4,
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    last_accessed_at: new Date(Date.now() - 12 * 3600000).toISOString(),
    metadata: { expert: 'motivation_analyst' },
  },
  {
    id: 'demo-6',
    content: 'Asked about favorite way to unwind after a long day. Mentioned cooking while listening to podcasts.',
    memory_type: 'conversation',
    importance_score: 5,
    retrieval_count: 1,
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    last_accessed_at: null,
    metadata: {},
  },
];

export const DEMO_COMPOSITION: Composition = {
  reflection: 52,
  platform_data: 40,
  fact: 4,
  conversation: 4,
  observation: 0,
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
