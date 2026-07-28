/**
 * Regression test for the YouTube "Learning vs Entertainment" ratio.
 *
 * audit-2026-06-10 finding: when none of a user's liked videos matched any
 * learning/entertainment category, getYouTubeData divided by a `|| 1`
 * fallback and produced learningRatio = 0. reflectionStore then passed 0
 * through and the YouTubeInsightsPage `!= null` gate happily rendered a
 * confident "Learning 0% / Entertainment 100%" bar from zero real data.
 *
 * Fix (api/services/reflections/otherDataFetchers.js): learningRatio is null
 * when no videos could be categorized, so downstream renders skip the bar
 * instead of fabricating a 100% entertainment split. When there IS
 * categorizable data the ratio is a real number and entertainmentRatio is
 * its complement.
 *
 * Mirrors tests/unit/goalSuggestionExclusions.test.js: mock the side-effectful
 * imports (Supabase + logger) so the real fetcher runs against crafted rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable container so each test can swap the rows the mocked query resolves to.
const mockState = { rows: [] };

// Supabase query builder: .from().select().eq().eq().order() is awaited and
// resolves to { data }. Every chain method returns the same thenable builder;
// .order() is the terminal call the fetcher awaits.
vi.mock('../../api/config/supabase.js', () => {
  const builder = {
    from: () => builder,
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve({ data: mockState.rows }),
  };
  return { supabaseAdmin: builder, supabase: builder, default: builder };
});

vi.mock('../../api/services/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { getYouTubeData } = await import('../../api/services/reflections/otherDataFetchers.js');

/** Build a likedVideos platform-data row from a list of video titles. */
function likedVideosRow(titles) {
  return {
    data_type: 'likedVideos',
    extracted_at: '2026-06-10T00:00:00Z',
    raw_data: {
      items: titles.map((title) => ({ snippet: { title, description: '' } })),
    },
  };
}

describe('getYouTubeData learning ratio', () => {
  beforeEach(() => {
    mockState.rows = [];
  });

  it('returns null ratios when no liked video can be categorized', async () => {
    // None of these titles match the learning or entertainment regexes.
    mockState.rows = [likedVideosRow(['Random clip', 'Untitled upload', 'My video 2026'])];

    const result = await getYouTubeData('user-1');

    expect(result.success).toBe(true);
    expect(result.data.learningRatio).toBeNull();
    expect(result.data.entertainmentRatio).toBeNull();
  });

  it('computes a real ratio when there is categorizable data', async () => {
    // 3 learning (tutorial/programming/science), 1 entertainment (gaming).
    mockState.rows = [
      likedVideosRow([
        'Python tutorial for beginners',
        'Intro to programming',
        'The science of black holes',
        'Epic gaming stream highlights',
      ]),
    ];

    const result = await getYouTubeData('user-2');

    expect(result.success).toBe(true);
    expect(result.data.learningRatio).toBe(75);
    expect(result.data.entertainmentRatio).toBe(25);
  });

  it('does not fabricate 100% entertainment from zero categorized data', async () => {
    // The original bug: 0 learning + 0 entertainment -> 0, rendered as
    // "Entertainment 100%". A null ratio is the only correct answer here.
    mockState.rows = [likedVideosRow(['asdf', 'qwerty', 'zzz'])];

    const result = await getYouTubeData('user-3');

    expect(result.data.learningRatio).not.toBe(0);
    expect(result.data.learningRatio).toBeNull();
  });
});
