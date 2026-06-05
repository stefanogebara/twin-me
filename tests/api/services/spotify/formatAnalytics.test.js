/**
 * Tests for spotify/formatAnalytics.js.
 */

import { describe, it, expect } from 'vitest';
import { formatRecentListening } from '../../../../api/services/spotify/formatAnalytics.js';

describe('formatRecentListening', () => {
  const base = {
    totals: { plays: 12, unique_artists: 6, unique_tracks: 10, total_duration_ms: 2_400_000 },
    top_artists: [
      { artist: 'Radiohead', plays: 4 },
      { artist: 'Boards of Canada', plays: 3 },
    ],
    top_tracks: [
      { track: 'Idioteque', artist: 'Radiohead', plays: 2 },
      { track: 'Dayvan Cowboy', artist: 'Boards of Canada', plays: 2 },
      { track: 'Pyramid Song', artist: 'Radiohead', plays: 1 },
    ],
    top_genres: [
      { genre: 'rock', weight: 5 },
      { genre: 'electronic', weight: 3 },
    ],
    sessions: { morning: 3, afternoon: 5, evening: 4, late_night: 0 },
    list: [
      { played_at: '2026-06-05T14:30:00Z', track: 'Idioteque', artist: 'Radiohead', duration_ms: 240000 },
      { played_at: '2026-06-05T14:00:00Z', track: 'Dayvan Cowboy', artist: 'Boards of Canada', duration_ms: 300000 },
    ],
  };

  it('returns null for null input', () => {
    expect(formatRecentListening(null)).toBeNull();
  });

  it('renders an empty-state line when there are no plays', () => {
    const out = formatRecentListening({ totals: { plays: 0, unique_artists: 0, unique_tracks: 0, total_duration_ms: 0 } });
    expect(out).toContain('0 plays in the recent window');
  });

  it('renders totals (plays, unique counts, duration in minutes)', () => {
    const out = formatRecentListening(base);
    expect(out).toContain('12 plays');
    expect(out).toContain('6 unique artists');
    expect(out).toContain('10 unique tracks');
    expect(out).toContain('40 min total');
  });

  it('renders top artists with play counts', () => {
    const out = formatRecentListening(base);
    expect(out).toContain('Radiohead ×4');
    expect(out).toContain('Boards of Canada ×3');
  });

  it('renders top tracks limited to 3', () => {
    const out = formatRecentListening(base);
    expect(out).toContain('"Idioteque" by Radiohead');
    expect(out).toContain('"Dayvan Cowboy" by Boards of Canada');
    expect(out).toContain('"Pyramid Song" by Radiohead');
  });

  it('renders top genres line', () => {
    const out = formatRecentListening(base);
    expect(out).toContain('rock');
    expect(out).toContain('electronic');
  });

  it('renders time-of-day distribution', () => {
    const out = formatRecentListening(base);
    expect(out).toContain('morning 3 / afternoon 5 / evening 4 / late-night 0');
  });

  it('renders most-recent stream (truncated to 5)', () => {
    const out = formatRecentListening(base);
    expect(out).toContain('"Idioteque" by Radiohead');
    expect(out).toContain('"Dayvan Cowboy" by Boards of Canada');
  });
});
