/**
 * YouTube learning hooks — reflection write + topic-drift insight.
 *
 * Verifies:
 *   - reflection metadata now includes youtube_top_channels/topics
 *     so future calls can baseline against it
 *   - drift insight fires when current top 3 channels share ZERO
 *     overlap with a baseline reflection >=7 days old
 *   - drift insight does NOT fire on partial overlap (≥1 shared)
 *   - drift insight does NOT fire when no baseline reflection exists
 *     (first week of usage)
 *   - drift insight does NOT fire when current top has <2 channels
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

const { persistYoutubeLearning } = await import('../../../../api/services/youtube/learningHooks.js');

const USER = '00000000-0000-0000-0000-000000000001';

/**
 * Builds a multi-mode supabase mock. Each call to from() returns the
 * SAME chain — so the first call is the dedup query for the reflection
 * write, the second call is the baseline-fetch query, the third is
 * the dedup query for the insight write, the fourth is the insert.
 *
 * Pass per-call overrides via `responses`: { reflectionLookup,
 * baselineLookup, insightLookup, insightInsertOk }.
 */
function chain({
  reflectionExisting = [], // reflection-write dedup query result
  baselineRow = null, // baseline-fetch query result (a single row or null)
  insightExisting = [], // insight dedup query result
  insightInsertOk = true,
} = {}) {
  const insertFn = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: insightInsertOk ? { id: 'inserted-id' } : null,
        error: insightInsertOk ? null : { message: 'x' },
      }),
    }),
  });

  // Counter to differentiate which call is happening.
  let callIndex = -1;
  supabaseChain.from.mockImplementation(() => {
    callIndex++;
    const idx = callIndex;
    const c = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      insert: insertFn,
    };
    // idx 0: reflection dedup (persistDedupedReflection lookup)
    // idx 1: baseline lookup (fetchBaselineReflection)
    // idx 2: insight dedup (insertDedupedInsight lookup)
    if (idx === 0) {
      c.limit.mockResolvedValue({ data: reflectionExisting, error: null });
    } else if (idx === 1) {
      c.limit.mockResolvedValue({ data: baselineRow ? [baselineRow] : [], error: null });
    } else if (idx === 2) {
      c.limit.mockResolvedValue({ data: insightExisting, error: null });
    } else {
      c.limit.mockResolvedValue({ data: [], error: null });
    }
    return c;
  });
  return { insertFn };
}

describe('persistYoutubeLearning — reflection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T13:00:00.000Z'));
  });

  it('writes reflection with top_channels + top_topics in metadata', async () => {
    chain();
    const watching = {
      totals: { liked_videos: 50, unique_channels: 12 },
      top_channels: [
        { channel: 'Karpathy', count: 8 },
        { channel: 'Stanford CS', count: 5 },
        { channel: '3Blue1Brown', count: 4 },
      ],
      top_topics: [{ topic: 'Computer science', count: 3 }],
    };
    await persistYoutubeLearning(USER, watching, 'YouTube summary');
    expect(addReflectionMock).toHaveBeenCalledTimes(1);
    const [, content, , metadata] = addReflectionMock.mock.calls[0];
    expect(content).toContain('My YouTube library on 2026-06-12');
    expect(metadata.source).toBe('youtube_watching');
    expect(metadata.youtube_top_channels).toEqual(['Karpathy', 'Stanford CS', '3Blue1Brown']);
    expect(metadata.youtube_top_topics).toEqual(['Computer science']);
  });
});

describe('persistYoutubeLearning — topic drift', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T13:00:00.000Z'));
  });

  it('fires drift insight when zero overlap with baseline >=7 days old', async () => {
    const { insertFn } = chain({
      baselineRow: {
        metadata: {
          source: 'youtube_watching',
          youtube_date: '2026-06-04',
          youtube_top_channels: ['Karpathy', 'Stanford CS', '3Blue1Brown'],
        },
        created_at: '2026-06-04T10:00:00.000Z',
      },
    });
    const watching = {
      totals: { liked_videos: 50, unique_channels: 8 },
      top_channels: [
        { channel: 'Marshmello', count: 6 },
        { channel: 'Desimpedidos', count: 4 },
        { channel: 'Felipe Neto', count: 3 },
      ],
      top_topics: [],
    };
    await persistYoutubeLearning(USER, watching, 'summary');
    // insertFn was the FIRST `.insert()` chain (the proactive_insights insert)
    expect(insertFn).toHaveBeenCalledTimes(1);
    const payload = insertFn.mock.calls[0][0];
    expect(payload.urgency).toBe('low');
    expect(payload.category).toBe('culture');
    expect(payload.insight).toContain('Karpathy');
    expect(payload.insight).toContain('Marshmello');
    expect(payload.sources).toEqual(['youtube_drift:2026-06-12']);
  });

  it('does NOT fire when there is overlap (>=1 shared channel)', async () => {
    const { insertFn } = chain({
      baselineRow: {
        metadata: {
          source: 'youtube_watching',
          youtube_date: '2026-06-04',
          youtube_top_channels: ['Karpathy', 'Stanford CS', '3Blue1Brown'],
        },
        created_at: '2026-06-04T10:00:00.000Z',
      },
    });
    const watching = {
      totals: { liked_videos: 50, unique_channels: 8 },
      top_channels: [
        { channel: 'Karpathy', count: 6 },
        { channel: 'Marshmello', count: 3 },
        { channel: 'Felipe Neto', count: 2 },
      ],
    };
    await persistYoutubeLearning(USER, watching, 'summary');
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('does NOT fire when no baseline reflection exists (first week of usage)', async () => {
    const { insertFn } = chain({ baselineRow: null });
    const watching = {
      totals: { liked_videos: 50, unique_channels: 8 },
      top_channels: [
        { channel: 'Marshmello', count: 6 },
        { channel: 'Desimpedidos', count: 4 },
      ],
    };
    await persistYoutubeLearning(USER, watching, 'summary');
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('does NOT fire when current top has < 2 channels', async () => {
    const { insertFn } = chain({
      baselineRow: {
        metadata: { youtube_top_channels: ['A', 'B', 'C'] },
        created_at: '2026-06-04T10:00:00.000Z',
      },
    });
    const watching = {
      totals: { liked_videos: 5, unique_channels: 1 },
      top_channels: [{ channel: 'Solo', count: 5 }],
    };
    await persistYoutubeLearning(USER, watching, 'summary');
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('does NOT fire when baseline has < 2 channels', async () => {
    const { insertFn } = chain({
      baselineRow: {
        metadata: { youtube_top_channels: ['SingleChannel'] },
        created_at: '2026-06-04T10:00:00.000Z',
      },
    });
    const watching = {
      totals: { liked_videos: 50, unique_channels: 8 },
      top_channels: [
        { channel: 'A', count: 6 },
        { channel: 'B', count: 4 },
      ],
    };
    await persistYoutubeLearning(USER, watching, 'summary');
    expect(insertFn).not.toHaveBeenCalled();
  });
});
