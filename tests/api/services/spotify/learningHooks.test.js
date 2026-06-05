/**
 * Spotify learning hooks — verify reflection writes + the artist
 * concentration anomaly threshold behaviour.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const supabaseChain = { from: vi.fn() };
const addReflectionMock = vi.fn();

vi.mock('../../../../api/services/database.js', () => ({ supabaseAdmin: supabaseChain }));
vi.mock('../../../../api/services/memoryStreamService.js', () => ({
  addReflection: addReflectionMock,
}));
vi.mock('../../../../api/services/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const { persistSpotifyLearning } = await import('../../../../api/services/spotify/learningHooks.js');

const USER = '00000000-0000-0000-0000-000000000001';

function chain({ existing = [], insertOk = true } = {}) {
  const insertFn = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi
        .fn()
        .mockResolvedValue({ data: insertOk ? { id: 'new' } : null, error: insertOk ? null : { message: 'x' } }),
    }),
  });
  const c = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: existing, error: null }),
    insert: insertFn,
  };
  supabaseChain.from.mockReturnValue(c);
  return { insertFn };
}

describe('persistSpotifyLearning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-05T13:00:00.000Z'));
  });

  it('does nothing for missing args', async () => {
    await persistSpotifyLearning(USER, null, 'summary');
    expect(addReflectionMock).not.toHaveBeenCalled();
  });

  it('writes a reflection memory tagged with spotify_listening + the date', async () => {
    chain();
    const recent = {
      totals: { plays: 12, unique_artists: 4 },
      top_artists: [{ artist: 'Phoebe Bridgers', plays: 3 }],
    };
    await persistSpotifyLearning(USER, recent, 'Spotify summary line');
    expect(addReflectionMock).toHaveBeenCalledTimes(1);
    const [, content, , metadata] = addReflectionMock.mock.calls[0];
    expect(content).toContain('My Spotify listening on 2026-06-05');
    expect(metadata.source).toBe('spotify_listening');
    expect(metadata.spotify_date).toBe('2026-06-05');
    expect(metadata.spotify_total_plays).toBe(12);
  });

  it('writes the concentration insight when top artist >= 40% of plays', async () => {
    const { insertFn } = chain();
    const recent = {
      totals: { plays: 30, unique_artists: 6 },
      top_artists: [{ artist: 'Drake', plays: 18 }, { artist: 'Kanye West', plays: 4 }],
    };
    await persistSpotifyLearning(USER, recent, 'summary');
    expect(insertFn).toHaveBeenCalledTimes(1);
    const payload = insertFn.mock.calls[0][0];
    expect(payload.urgency).toBe('low');
    expect(payload.category).toBe('culture');
    expect(payload.insight).toContain('Drake');
    expect(payload.insight).toContain('60%');
    expect(payload.sources).toEqual(['spotify_concentration:Drake:2026-06-05']);
  });

  it('does NOT write the concentration insight when top artist below 40%', async () => {
    const { insertFn } = chain();
    const recent = {
      totals: { plays: 30 },
      top_artists: [{ artist: 'Drake', plays: 10 }], // 33%
    };
    await persistSpotifyLearning(USER, recent, 'summary');
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('does NOT write the concentration insight when plays < 10', async () => {
    const { insertFn } = chain();
    const recent = {
      totals: { plays: 9 },
      top_artists: [{ artist: 'Drake', plays: 8 }], // 89% but under volume floor
    };
    await persistSpotifyLearning(USER, recent, 'summary');
    expect(insertFn).not.toHaveBeenCalled();
  });
});
