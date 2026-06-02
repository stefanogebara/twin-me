/**
 * Tests for whoop/analytics/getTrend.js — ported from
 * shashankswe2020-ux/whoop-mcp tests/tools/get-trend.test.ts (MIT).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTrend } from '../../../../api/services/whoop/analytics/getTrend.js';

function createMockClient() {
  const getMock = vi.fn();
  return { client: { get: getMock }, getMock };
}

function makeRecovery({ recovery_score, hrv, rhr, date }) {
  return {
    cycle_id: 1,
    sleep_id: 's1',
    user_id: 100,
    created_at: date ?? '2026-05-01T06:00:00.000Z',
    updated_at: date ?? '2026-05-01T06:00:00.000Z',
    score_state: 'SCORED',
    score: {
      user_calibrating: false,
      recovery_score,
      resting_heart_rate: rhr,
      hrv_rmssd_milli: hrv,
      spo2_percentage: 98,
      skin_temp_celsius: 33.5,
    },
  };
}

function makeSleep(startIso, endIso, performance) {
  return {
    id: `sleep-${startIso}`,
    cycle_id: 1,
    user_id: 100,
    created_at: endIso,
    updated_at: endIso,
    start: startIso,
    end: endIso,
    timezone_offset: '-05:00',
    nap: false,
    score_state: 'SCORED',
    score: {
      sleep_performance_percentage: performance ?? 85,
      sleep_consistency_percentage: 90,
      sleep_efficiency_percentage: 88,
    },
  };
}

function makeCycle(strain, date) {
  return {
    id: 1,
    user_id: 100,
    created_at: date ?? '2026-05-01T00:00:00.000Z',
    updated_at: date ?? '2026-05-01T23:59:59.000Z',
    start: date ?? '2026-05-01T00:00:00.000Z',
    end: date ?? '2026-05-01T23:59:59.000Z',
    timezone_offset: '-05:00',
    score_state: 'SCORED',
    score: { strain, kilojoule: 8500, average_heart_rate: 72, max_heart_rate: 175 },
  };
}

const paginated = (records) => ({ records });

describe('getTrend', () => {
  let client;
  let getMock;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
    ({ client, getMock } = createMockClient());
  });

  it("maps 'recovery' metric to recovery endpoint and recovery_score field", async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeRecovery({ recovery_score: 70, hrv: 55, rhr: 52 }),
        makeRecovery({ recovery_score: 75, hrv: 60, rhr: 54 }),
        makeRecovery({ recovery_score: 80, hrv: 65, rhr: 56 }),
      ]),
    );
    const result = await getTrend(client, { metric: 'recovery' });
    expect(result.metric).toBe('recovery');
    expect(result.values).toEqual([70, 75, 80]);
    expect(getMock.mock.calls[0][0]).toContain('/v2/recovery');
  });

  it("maps 'hrv' metric to recovery endpoint and hrv_rmssd_milli field", async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeRecovery({ recovery_score: 70, hrv: 50, rhr: 52 }),
        makeRecovery({ recovery_score: 75, hrv: 60, rhr: 54 }),
        makeRecovery({ recovery_score: 80, hrv: 70, rhr: 56 }),
      ]),
    );
    const result = await getTrend(client, { metric: 'hrv' });
    expect(result.values).toEqual([50, 60, 70]);
  });

  it("maps 'rhr' metric to recovery endpoint and resting_heart_rate field", async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeRecovery({ recovery_score: 70, hrv: 55, rhr: 52 }),
        makeRecovery({ recovery_score: 75, hrv: 60, rhr: 54 }),
      ]),
    );
    const result = await getTrend(client, { metric: 'rhr' });
    expect(result.values).toEqual([52, 54]);
  });

  it("maps 'sleep_duration' metric to sleep endpoint and computes hours from start/end", async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeSleep('2026-05-25T22:00:00Z', '2026-05-26T06:00:00Z'),
        makeSleep('2026-05-26T23:00:00Z', '2026-05-27T06:30:00Z'),
      ]),
    );
    const result = await getTrend(client, { metric: 'sleep_duration' });
    expect(result.values[0]).toBeCloseTo(8, 1);
    expect(result.values[1]).toBeCloseTo(7.5, 1);
    expect(getMock.mock.calls[0][0]).toContain('/v2/activity/sleep');
  });

  it("maps 'sleep_performance' metric to sleep endpoint and sleep_performance_percentage", async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeSleep('2026-05-25T22:00:00Z', '2026-05-26T06:00:00Z', 85),
        makeSleep('2026-05-26T22:00:00Z', '2026-05-27T06:00:00Z', 90),
      ]),
    );
    const result = await getTrend(client, { metric: 'sleep_performance' });
    expect(result.values).toEqual([85, 90]);
  });

  it("maps 'strain' metric to cycle endpoint and score.strain", async () => {
    getMock.mockResolvedValueOnce(paginated([makeCycle(12.5), makeCycle(14.0), makeCycle(10.0)]));
    const result = await getTrend(client, { metric: 'strain' });
    expect(result.values).toEqual([12.5, 14.0, 10.0]);
    expect(getMock.mock.calls[0][0]).toContain('/v2/cycle');
  });

  it('returns correct statistics', async () => {
    getMock.mockResolvedValueOnce(
      paginated(
        [60, 70, 80, 90, 100].map((s) => makeRecovery({ recovery_score: s, hrv: 55, rhr: 52 })),
      ),
    );
    const result = await getTrend(client, { metric: 'recovery' });
    expect(result.statistics.mean).toBe(80);
    expect(result.statistics.median).toBe(80);
    expect(result.statistics.min).toBe(60);
    expect(result.statistics.max).toBe(100);
    expect(result.statistics.std_dev).toBeGreaterThan(0);
  });

  it('returns trend direction with slope and confidence', async () => {
    getMock.mockResolvedValueOnce(
      paginated(
        [50, 60, 70, 80, 90, 100].map((s) =>
          makeRecovery({ recovery_score: s, hrv: 55, rhr: 52 }),
        ),
      ),
    );
    const result = await getTrend(client, { metric: 'recovery' });
    expect(result.trend.direction).toBe('improving');
    expect(result.trend.slope).toBeGreaterThan(0);
    expect(result.trend.confidence).toBe('high');
  });

  it('returns declining trend for decreasing values', async () => {
    getMock.mockResolvedValueOnce(
      paginated(
        [100, 90, 80, 70, 60, 50].map((s) =>
          makeRecovery({ recovery_score: s, hrv: 55, rhr: 52 }),
        ),
      ),
    );
    const result = await getTrend(client, { metric: 'recovery' });
    expect(result.trend.direction).toBe('declining');
    expect(result.trend.slope).toBeLessThan(0);
  });

  it('returns stable when all values are identical (zero variance)', async () => {
    getMock.mockResolvedValueOnce(
      paginated([75, 75, 75, 75, 75].map((s) => makeRecovery({ recovery_score: s, hrv: 55, rhr: 52 }))),
    );
    const result = await getTrend(client, { metric: 'recovery' });
    expect(result.trend.direction).toBe('stable');
    expect(result.statistics.std_dev).toBe(0);
  });

  it('detects anomalies (>2σ from mean)', async () => {
    const scores = [70, 72, 68, 71, 69, 73, 70, 71, 20, 70];
    getMock.mockResolvedValueOnce(
      paginated(scores.map((s) => makeRecovery({ recovery_score: s, hrv: 55, rhr: 52 }))),
    );
    const result = await getTrend(client, { metric: 'recovery' });
    expect(result.anomalies.length).toBeGreaterThan(0);
    expect(result.anomalies[0].value).toBe(20);
    expect(result.anomalies[0].deviation_from_mean).toBeGreaterThan(2);
  });

  it('throws error for < 2 data points', async () => {
    getMock.mockResolvedValueOnce(
      paginated([makeRecovery({ recovery_score: 70, hrv: 55, rhr: 52 })]),
    );
    await expect(getTrend(client, { metric: 'recovery' })).rejects.toThrow('at least 2');
  });

  it('throws error for 0 data points', async () => {
    getMock.mockResolvedValueOnce(paginated([]));
    await expect(getTrend(client, { metric: 'recovery' })).rejects.toThrow('at least 2');
  });

  it('throws for unsupported metric', async () => {
    await expect(getTrend(client, { metric: 'spo2' })).rejects.toThrow(/Unsupported metric/);
  });

  it('filters unscored records', async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeRecovery({ recovery_score: 70, hrv: 55, rhr: 52 }),
        {
          ...makeRecovery({ recovery_score: 50, hrv: 40, rhr: 60 }),
          score_state: 'PENDING_SCORE',
          score: undefined,
        },
        makeRecovery({ recovery_score: 80, hrv: 65, rhr: 54 }),
      ]),
    );
    const result = await getTrend(client, { metric: 'recovery' });
    expect(result.values).toEqual([70, 80]);
  });

  it('defaults to 30 days when days not specified', async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeRecovery({ recovery_score: 70, hrv: 55, rhr: 52 }),
        makeRecovery({ recovery_score: 75, hrv: 60, rhr: 54 }),
      ]),
    );
    const result = await getTrend(client, { metric: 'recovery' });
    expect(result.period.days).toBe(30);
    expect(getMock.mock.calls[0][0]).toContain('start=');
  });

  it('includes period start, end, and days in output', async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeRecovery({ recovery_score: 70, hrv: 55, rhr: 52 }),
        makeRecovery({ recovery_score: 75, hrv: 60, rhr: 54 }),
      ]),
    );
    const result = await getTrend(client, { metric: 'recovery', days: 14 });
    expect(result.period.days).toBe(14);
    expect(result.period.start).toBeDefined();
    expect(result.period.end).toBeDefined();
  });
});
