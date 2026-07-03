/**
 * Query-shape tests for personalityProfileService.buildProfile
 * (backend-latency audit 2026-07-03).
 *
 * GET /api/personality-profile measured at 3-5s on the rebuild path. Two
 * fixes under test:
 *   1. buildPersonalityEmbedding no longer selects the `content` column —
 *      it never reads it, and 100 rows of memory text rode on top of the
 *      ~1.9MB the 100 embedding vectors already cost;
 *   2. the user_memories COUNT query joined the initial Promise.all instead
 *      of running as a second serial phase (one DB round trip saved on
 *      every rebuild).
 *
 * The deferred-thenable idiom proves parallel dispatch: every query's
 * `then` registers into `pendingQueries` without resolving. All FOUR reads
 * must be registered before anything resolves — the old code registered
 * only three, and the count query appeared after they settled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));
vi.mock('../../../api/services/embeddingService.js', () => ({
  generateEmbedding: vi.fn(),
  vectorToString: vi.fn((v) => `[${v.join(',')}]`),
}));

const { buildProfile } = await import(
  '../../../api/services/personalityProfileService.js'
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

describe('buildProfile (audit 2026-07-03: rebuild-path query shape)', () => {
  /** Deferred queries: each entry is { table, calls, resolve } */
  let pendingQueries;

  function makeDeferredBuilder(table) {
    const calls = { select: [], eq: [], not: [], order: [], limit: [], upsert: [] };
    const entry = { table, calls, resolve: null };
    const builder = {
      select: vi.fn((...a) => {
        calls.select.push(a);
        return builder;
      }),
      eq: vi.fn((...a) => {
        calls.eq.push(a);
        return builder;
      }),
      not: vi.fn((...a) => {
        calls.not.push(a);
        return builder;
      }),
      order: vi.fn((...a) => {
        calls.order.push(a);
        return builder;
      }),
      limit: vi.fn((...a) => {
        calls.limit.push(a);
        return builder;
      }),
      maybeSingle: vi.fn(() => builder),
      single: vi.fn(() => builder),
      upsert: vi.fn((...a) => {
        calls.upsert.push(a);
        return builder;
      }),
      then: (resolve) => {
        entry.resolve = resolve;
        pendingQueries.push(entry);
      },
    };
    return builder;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    pendingQueries = [];
    mockFrom.mockImplementation((table) => makeDeferredBuilder(table));
  });

  const findQuery = (predicate) => pendingQueries.find(predicate);

  it('dispatches layers, stylometrics, embedding AND count in one parallel phase', async () => {
    const profilePromise = buildProfile(USER_ID);

    // All four reads must be registered before ANY of them resolves.
    await vi.waitFor(() => {
      expect(pendingQueries).toHaveLength(4);
    });

    const layersQ = findQuery((q) => q.table === 'soul_signature_layers');
    const stylometricsQ = findQuery(
      (q) => q.table === 'user_memories' && q.calls.select[0]?.[0] === 'content'
    );
    const embeddingQ = findQuery(
      (q) => q.table === 'user_memories' && q.calls.select[0]?.[0]?.includes('embedding')
    );
    const countQ = findQuery(
      (q) => q.table === 'user_memories' && q.calls.select[0]?.[1]?.head === true
    );

    expect(layersQ).toBeDefined();
    expect(stylometricsQ).toBeDefined();
    expect(embeddingQ).toBeDefined();
    expect(countQ).toBeDefined();

    // --- Fix #1: the embedding fetch must NOT drag the content column ---
    expect(embeddingQ.calls.select[0][0]).toBe('id, embedding, importance_score, created_at');
    expect(embeddingQ.calls.select[0][0]).not.toContain('content');
    expect(embeddingQ.calls.limit).toEqual([[100]]);

    // Count stays an index-only head count.
    expect(countQ.calls.select[0]).toEqual(['id', { count: 'exact', head: true }]);

    // Release everything with minimal-but-sufficient data.
    layersQ.resolve({ data: { layers: null }, error: null });
    stylometricsQ.resolve({
      data: [{ content: 'Hello there. This is a test sentence!' }],
      error: null,
    });
    embeddingQ.resolve({
      data: [
        {
          id: 'm1',
          embedding: [0.6, 0.8],
          importance_score: 8,
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    });
    countQ.resolve({ count: 42, data: null, error: null });

    // The upsert is a follow-up write; release it as soon as it registers.
    await vi.waitFor(() => {
      expect(findQuery((q) => q.table === 'user_personality_profiles')).toBeDefined();
    });
    const upsertQ = findQuery((q) => q.table === 'user_personality_profiles');
    expect(upsertQ.calls.upsert[0][1]).toEqual({ onConflict: 'user_id' });
    upsertQ.resolve({ error: null });

    const profile = await profilePromise;

    expect(profile).not.toBeNull();
    expect(profile.user_id).toBe(USER_ID);
    expect(profile.memory_count_at_build).toBe(42);
    expect(typeof profile.personality_embedding).toBe('string');
    expect(profile.avg_sentence_length).toBeGreaterThan(0);
  });
});
