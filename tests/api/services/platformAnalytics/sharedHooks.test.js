/**
 * Tests for platformAnalytics/sharedHooks.js — the dedup + insert
 * primitives that every per-platform learn() composes from.
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

const {
  insertDedupedInsight,
  persistDedupedReflection,
  currentWeekStartUTC,
  todayUTC,
} = await import('../../../../api/services/platformAnalytics/sharedHooks.js');

const USER = '00000000-0000-0000-0000-000000000001';

function buildSupabaseMock({ existing = [], insertId = 'new-id', insertOk = true } = {}) {
  const insertFn = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: insertOk ? { id: insertId } : null,
        error: insertOk ? null : { message: 'insert failed' },
      }),
    }),
  });
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: existing, error: null }),
    insert: insertFn,
  };
  supabaseChain.from.mockReturnValue(chain);
  return { chain, insertFn };
}

describe('insertDedupedInsight', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when userId/insight/dedupKey missing', async () => {
    expect(await insertDedupedInsight({})).toBeNull();
  });

  it('returns null + does not insert when an existing row matches', async () => {
    const { insertFn } = buildSupabaseMock({ existing: [{ id: 'existing' }] });
    const got = await insertDedupedInsight({
      userId: USER,
      insight: 'something',
      dedupKey: 'platform:metric:2026-06-05',
    });
    expect(got).toBeNull();
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('inserts a row with correct payload + returns id', async () => {
    const { insertFn } = buildSupabaseMock();
    const id = await insertDedupedInsight({
      userId: USER,
      insight: 'Hello',
      dedupKey: 'spotify_concentration:Drake:2026-06-05',
      urgency: 'low',
      category: 'culture',
    });
    expect(id).toBe('new-id');
    const payload = insertFn.mock.calls[0][0];
    expect(payload).toMatchObject({
      user_id: USER,
      urgency: 'low',
      category: 'culture',
      sources: ['spotify_concentration:Drake:2026-06-05'],
    });
    expect(payload.insight.length).toBeLessThanOrEqual(500);
  });

  it('truncates over-long insight text', async () => {
    const { insertFn } = buildSupabaseMock();
    const huge = 'a'.repeat(2000);
    await insertDedupedInsight({ userId: USER, insight: huge, dedupKey: 'k' });
    expect(insertFn.mock.calls[0][0].insight.length).toBe(500);
  });

  it('returns null when supabase insert throws', async () => {
    supabaseChain.from.mockImplementationOnce(() => {
      throw new Error('db down');
    });
    const got = await insertDedupedInsight({ userId: USER, insight: 'x', dedupKey: 'k' });
    expect(got).toBeNull();
  });

  it('returns null when insert reports an error', async () => {
    const { insertFn } = buildSupabaseMock({ insertOk: false });
    const got = await insertDedupedInsight({ userId: USER, insight: 'x', dedupKey: 'k' });
    expect(got).toBeNull();
    expect(insertFn).toHaveBeenCalled();
  });
});

describe('persistDedupedReflection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false when required args missing', async () => {
    expect(
      await persistDedupedReflection({
        userId: USER,
        content: '',
        metadata: { source: 's' },
        dedupMetadataKey: 'k',
        dedupMetadataValue: 'v',
      }),
    ).toBe(false);
  });

  it('skips when a matching reflection already exists', async () => {
    buildSupabaseMock({ existing: [{ id: 'existing' }] });
    const written = await persistDedupedReflection({
      userId: USER,
      content: 'content',
      metadata: { source: 'spotify_listening' },
      dedupMetadataKey: 'spotify_date',
      dedupMetadataValue: '2026-06-05',
    });
    expect(written).toBe(false);
    expect(addReflectionMock).not.toHaveBeenCalled();
  });

  it('calls addReflection with merged metadata + returns true', async () => {
    buildSupabaseMock();
    const ok = await persistDedupedReflection({
      userId: USER,
      content: 'My listening today',
      metadata: { source: 'spotify_listening', spotify_total_plays: 12 },
      dedupMetadataKey: 'spotify_date',
      dedupMetadataValue: '2026-06-05',
    });
    expect(ok).toBe(true);
    expect(addReflectionMock).toHaveBeenCalledTimes(1);
    const [uid, content, evidence, metadata] = addReflectionMock.mock.calls[0];
    expect(uid).toBe(USER);
    expect(content).toBe('My listening today');
    expect(evidence).toEqual([]);
    expect(metadata.source).toBe('spotify_listening');
    expect(metadata.spotify_total_plays).toBe(12);
  });

  it('returns false when addReflection rejects', async () => {
    buildSupabaseMock();
    addReflectionMock.mockRejectedValueOnce(new Error('write failed'));
    const ok = await persistDedupedReflection({
      userId: USER,
      content: 'X',
      metadata: { source: 's' },
      dedupMetadataKey: 'k',
      dedupMetadataValue: 'v',
    });
    expect(ok).toBe(false);
  });
});

describe('currentWeekStartUTC + todayUTC', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('todayUTC returns YYYY-MM-DD of current UTC date', () => {
    vi.setSystemTime(new Date('2026-06-05T13:00:00.000Z'));
    expect(todayUTC()).toBe('2026-06-05');
  });

  it('currentWeekStartUTC returns Monday of the current ISO week', () => {
    // Thursday 2026-06-04 → Monday 2026-06-01
    vi.setSystemTime(new Date('2026-06-04T13:00:00.000Z'));
    expect(currentWeekStartUTC()).toBe('2026-06-01');

    // Sunday 2026-06-07 → Monday 2026-06-01 (ISO week treats Sunday as the trailing day)
    vi.setSystemTime(new Date('2026-06-07T13:00:00.000Z'));
    expect(currentWeekStartUTC()).toBe('2026-06-01');

    // Monday 2026-06-08 → 2026-06-08 itself
    vi.setSystemTime(new Date('2026-06-08T13:00:00.000Z'));
    expect(currentWeekStartUTC()).toBe('2026-06-08');
  });
});
