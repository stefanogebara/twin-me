/**
 * Query-shape tests for twinFormationService.getTwin
 * (backend-latency audit 2026-07-03).
 *
 * getTwin sits on the GET /api/twin/status/:userId and /api/twin/profile
 * paths. Two fixes under test:
 *   1. the reflection_history select is now BOUNDED (limit 50, newest first)
 *      — it was unbounded and grows forever (one row per platform per
 *      generation cycle), all embedded verbatim in the response;
 *   2. the soul-signature read and the reflections read run in parallel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSoulSignature, mockFrom } = vi.hoisted(() => ({
  mockGetSoulSignature: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('../../../api/services/database.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));
vi.mock('../../../api/services/soulSignatureService.js', () => ({
  getSoulSignature: mockGetSoulSignature,
  upsertSoulSignature: vi.fn(),
}));
vi.mock('../../../api/services/anthropicService.js', () => ({
  generateChatResponse: vi.fn(),
}));

const { default: twinFormationService } = await import(
  '../../../api/services/twinFormationService.js'
);

const USER_ID = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

/** Chainable supabase query recorder: records call args, resolves `result`. */
function makeQueryRecorder(result) {
  const calls = { select: [], eq: [], order: [], limit: [] };
  const builder = {
    select: vi.fn((...a) => {
      calls.select.push(a);
      return builder;
    }),
    eq: vi.fn((...a) => {
      calls.eq.push(a);
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
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return { builder, calls };
}

describe('getTwin (audit 2026-07-03: unbounded reflections + serial reads)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bounds the reflection_history query to the 50 newest rows', async () => {
    const { builder, calls } = makeQueryRecorder({
      data: [{ id: 'r1', platform: 'spotify' }],
      error: null,
    });
    mockFrom.mockReturnValue(builder);
    mockGetSoulSignature.mockResolvedValue({ user_id: USER_ID, soul_data: {} });

    const result = await twinFormationService.getTwin(USER_ID);

    expect(mockFrom).toHaveBeenCalledWith('reflection_history');
    expect(calls.eq).toContainEqual(['user_id', USER_ID]);
    expect(calls.order).toEqual([['generated_at', { ascending: false }]]);
    expect(calls.limit).toEqual([[50]]);

    expect(result.success).toBe(true);
    expect(result.twin.reflections).toEqual([{ id: 'r1', platform: 'spotify' }]);
  });

  it('fetches signature and reflections in parallel', async () => {
    const { builder } = makeQueryRecorder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    let releaseSignature;
    mockGetSoulSignature.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSignature = () => resolve({ user_id: USER_ID, soul_data: {} });
        })
    );

    const twinPromise = twinFormationService.getTwin(USER_ID);

    // The reflections query must be dispatched WHILE the signature read is
    // still pending. The old code only built it after `await getSoulSignature`.
    await vi.waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('reflection_history');
    });

    releaseSignature();
    const result = await twinPromise;
    expect(result.success).toBe(true);
  });

  it('still reports Twin not found when there is no signature', async () => {
    const { builder } = makeQueryRecorder({ data: [], error: null });
    mockFrom.mockReturnValue(builder);
    mockGetSoulSignature.mockResolvedValue(null);

    const result = await twinFormationService.getTwin(USER_ID);

    expect(result).toEqual({ success: false, error: 'Twin not found' });
  });
});
