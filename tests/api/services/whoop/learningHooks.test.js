/**
 * Tests for whoop/learningHooks.js. Both hooks are fire-and-forget
 * wrappers around supabase + memoryStreamService writes, so the tests
 * focus on the dedup/skip behavior and the precise shape of what
 * lands in the DB call.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock both downstream services BEFORE importing the SUT — the SUT
// reads from these at module load time.
const supabaseChain = {
  from: vi.fn(),
};
const addReflectionMock = vi.fn();

vi.mock('../../../../api/services/database.js', () => ({
  supabaseAdmin: supabaseChain,
}));
vi.mock('../../../../api/services/memoryStreamService.js', () => ({
  addReflection: addReflectionMock,
}));
vi.mock('../../../../api/services/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const {
  persistTrendAnomalyInsight,
  persistWeeklyReflection,
} = await import('../../../../api/services/whoop/learningHooks.js');

const USER = '167c27b5-a40b-49fb-8d00-deb1b1c57f4d';

// Builds a chainable supabase mock for the various dedup + insert
// queries. Each test seeds the lookup return.
function buildSupabaseMock({ existing = [], insertOk = true } = {}) {
  const insertFn = vi.fn().mockResolvedValue({ error: insertOk ? null : new Error('insert failed') });
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

describe('persistTrendAnomalyInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when trend has no anomalies', async () => {
    const { insertFn } = buildSupabaseMock();
    await persistTrendAnomalyInsight(USER, { metric: 'strain' }, { anomalies: [] });
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('does nothing when intent.metric is missing', async () => {
    const { insertFn } = buildSupabaseMock();
    await persistTrendAnomalyInsight(USER, {}, { anomalies: [{ value: 1, deviation_from_mean: 3, date: '2026-06-01' }] });
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('does nothing when the strongest anomaly is below 2σ', async () => {
    const { insertFn } = buildSupabaseMock();
    await persistTrendAnomalyInsight(USER, { metric: 'strain' }, {
      anomalies: [{ value: 1, deviation_from_mean: 1.9, date: '2026-06-01' }],
    });
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('skips when a matching insight already exists (dedup by metric+date)', async () => {
    const { insertFn } = buildSupabaseMock({ existing: [{ id: 'existing-id' }] });
    await persistTrendAnomalyInsight(USER, { metric: 'strain' }, {
      anomalies: [{ value: 5.4, deviation_from_mean: 2.5, date: '2026-06-01T06:00:00.000Z' }],
    });
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('inserts a row with first-person prose, urgency=medium, category=health', async () => {
    const { insertFn } = buildSupabaseMock();
    await persistTrendAnomalyInsight(USER, { metric: 'strain' }, {
      anomalies: [{ value: 5.4, deviation_from_mean: 2.5, date: '2026-06-01T06:00:00.000Z' }],
    });
    expect(insertFn).toHaveBeenCalledTimes(1);
    const payload = insertFn.mock.calls[0][0];
    expect(payload.user_id).toBe(USER);
    expect(payload.urgency).toBe('medium');
    expect(payload.category).toBe('health');
    expect(payload.insight).toContain('daily strain');
    expect(payload.insight).toContain('2026-06-01');
    expect(payload.insight).toContain('2.5σ');
    expect(payload.sources).toEqual(['whoop_anomaly:strain:2026-06-01']);
  });

  it('picks the strongest anomaly when several are present', async () => {
    const { insertFn } = buildSupabaseMock();
    await persistTrendAnomalyInsight(USER, { metric: 'hrv' }, {
      anomalies: [
        { value: 80, deviation_from_mean: 2.1, date: '2026-05-10' },
        { value: 143, deviation_from_mean: 3.4, date: '2026-05-21' },
        { value: 90, deviation_from_mean: 2.0, date: '2026-05-15' },
      ],
    });
    const payload = insertFn.mock.calls[0][0];
    expect(payload.insight).toContain('2026-05-21');
    expect(payload.insight).toContain('3.4σ');
  });

  it('does not throw when DB call rejects', async () => {
    supabaseChain.from.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(
      persistTrendAnomalyInsight(USER, { metric: 'strain' }, {
        anomalies: [{ value: 5.4, deviation_from_mean: 2.5, date: '2026-06-01' }],
      }),
    ).resolves.toBeUndefined();
  });
});

describe('persistWeeklyReflection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when weekly object missing week_start', async () => {
    buildSupabaseMock();
    await persistWeeklyReflection(USER, {}, 'summary text');
    expect(addReflectionMock).not.toHaveBeenCalled();
  });

  it('does nothing when summary is empty', async () => {
    buildSupabaseMock();
    await persistWeeklyReflection(USER, { week_start: '2026-06-01T00:00:00.000Z' }, '');
    expect(addReflectionMock).not.toHaveBeenCalled();
  });

  it('skips when a reflection for this week already exists', async () => {
    buildSupabaseMock({ existing: [{ id: 'existing' }] });
    await persistWeeklyReflection(
      USER,
      { week_start: '2026-06-01T00:00:00.000Z', recovery: { average_score: 70 }, workouts: { count: 5 } },
      'fake summary',
    );
    expect(addReflectionMock).not.toHaveBeenCalled();
  });

  it('writes a reflection memory with whoop_weekly source metadata', async () => {
    buildSupabaseMock();
    const weekly = {
      week_start: '2026-06-01T00:00:00.000Z',
      recovery: { average_score: 70, trend: 'stable' },
      workouts: { count: 5 },
    };
    await persistWeeklyReflection(USER, weekly, 'Week summary text 123');
    expect(addReflectionMock).toHaveBeenCalledTimes(1);
    const [userId, content, evidence, metadata] = addReflectionMock.mock.calls[0];
    expect(userId).toBe(USER);
    expect(content).toContain('Week summary text 123');
    expect(content).toContain('2026-06-01');
    expect(evidence).toEqual([]);
    expect(metadata.source).toBe('whoop_weekly');
    expect(metadata.whoop_week_start).toBe('2026-06-01');
    expect(metadata.whoop_recovery_avg).toBe(70);
    expect(metadata.whoop_workout_count).toBe(5);
  });

  it('does not throw when downstream addReflection fails', async () => {
    buildSupabaseMock();
    addReflectionMock.mockRejectedValueOnce(new Error('memory write failed'));
    await expect(
      persistWeeklyReflection(
        USER,
        { week_start: '2026-06-01T00:00:00.000Z' },
        'summary',
      ),
    ).resolves.toBeUndefined();
  });
});
