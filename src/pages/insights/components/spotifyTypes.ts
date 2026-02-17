export interface Reflection {
  id: string | null;
  text: string;
  generatedAt: string;
  expiresAt: string | null;
  confidence: 'high' | 'medium' | 'low';
  themes: string[];
}

export interface Pattern {
  id: string;
  text: string;
  occurrences: 'often' | 'sometimes' | 'noticed';
}

export interface HistoryItem {
  id: string;
  text: string;
  generatedAt: string;
}

export interface EvidenceItem {
  id: string;
  observation: string;
  dataPoints: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface CrossPlatformContext {
  lifeContext?: {
    isOnVacation?: boolean;
    vacationTitle?: string;
    daysRemaining?: number;
  };
  recovery?: number;
  calendarDensity?: string;
}

export interface RecentTrack {
  name: string;
  artist: string;
  playedAt?: string;
}

export interface ArtistWithPlays {
  name: string;
  plays: number;
  genre?: string;
}

export interface GenreData {
  genre: string;
  percentage: number;
}

export interface ListeningHour {
  hour: number;
  plays: number;
}

export interface InsightsResponse {
  success: boolean;
  reflection: Reflection;
  patterns: Pattern[];
  history: HistoryItem[];
  evidence?: EvidenceItem[];
  crossPlatformContext?: CrossPlatformContext;
  // New: Specific data for visual display
  recentTracks?: RecentTrack[];
  topArtists?: string[];
  topArtistsWithPlays?: ArtistWithPlays[];
  topGenres?: GenreData[];
  listeningHours?: ListeningHour[];
  currentMood?: {
    label: string;
    energy: number;
    valence: number;
  };
  error?: string;
}

/**
 * Format a timestamp into a human-readable relative time string
 */
export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  // For older dates, show the date
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Deduplicate tracks by name+artist, keeping only the most recent play
 */
export function deduplicateTracks(tracks: RecentTrack[]): RecentTrack[] {
  const seen = new Map<string, RecentTrack>();
  for (const track of tracks) {
    const key = `${track.name.toLowerCase()}|${track.artist.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.set(key, track);
    }
  }
  return Array.from(seen.values());
}
