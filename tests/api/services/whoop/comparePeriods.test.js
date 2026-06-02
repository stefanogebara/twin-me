/**
 * Tests for whoop/analytics/comparePeriods.js — ported from
 * shashankswe2020-ux/whoop-mcp tests/tools/compare-periods.test.ts (MIT).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { comparePeriods } from '../../../../api/services/whoop/analytics/comparePeriods.js';

function createMockClient() {
  const getMock = vi.fn();
  return { client: { get: getMock }, getMock };
}

function makeRecovery(score) {
  return {
    cycle_id: 1,
    sleep_id: 's1',
    user_id: 100,
    created_at: '2026-05-01T06:00:00.000Z',
    updated_at: '2026-05-01T06:00:00.000Z',
    score_state: 'SCORED',
    score: {
      user_calibrating: false,
      recovery_score: score,
      resting_heart_rate: 55,
      hrv_rmssd_milli: 60,
      spo2_percentage: 98,
      skin_temp_celsius: 33.5,
    },
  };
}

function makeSleep(startIso, endIso) {
  return {
    id: 'sleep-1',
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
      sleep_performance_percentage: 85,
      sleep_consistency_percentage: 90,
      sleep_efficiency_percentage: 88,
    },
  };
}

function makeCycle(strain) {
  return {
    id: 1,
    user_id: 100,
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-01T23:59:59.000Z',
    start: '2026-05-01T00:00:00.000Z',
    end: '2026-05-01T23:59:59.000Z',
    timezone_offset: '-05:00',
    score_state: 'SCORED',
    score: { strain, kilojoule: 8500, average_heart_rate: 72, max_heart_rate: 175 },
  };
}

const paginated = (records) => ({ records });

const PERIODS = {
  period_a_start: '2026-05-01T00:00:00.000Z',
  period_a_end: '2026-05-07T23:59:59.999Z',
  period_b_start: '2026-05-08T00:00:00.000Z',
  period_b_end: '2026-05-14T23:59:59.999Z',
};

describe('comparePeriods', () => {
  let client;
  let getMock;

  beforeEach(() => {
    ({ client, getMock } = createMockClient());
  });

  it('correctly computes percentage changes and direction (improved)', async () => {
    getMock
      .mockResolvedValueOnce(paginated([makeRecovery(60), makeRecovery(60)]))
      .mockResolvedValueOnce(paginated([makeSleep('2026-05-01T22:00:00Z', '2026-05-02T06:00:00Z')]))
      .mockResolvedValueOnce(paginated([makeCycle(10)]))
      .mockResolvedValueOnce(paginated([makeRecovery(80), makeRecovery(80)]))
      .mockResolvedValueOnce(paginated([makeSleep('2026-05-08T22:00:00Z', '2026-05-09T06:00:00Z')]))
      .mockResolvedValueOnce(paginated([makeCycle(10)]));

    const result = await comparePeriods(client, PERIODS);
    expect(result.recovery.period_a_avg).toBeCloseTo(60, 1);
    expect(result.recovery.period_b_avg).toBeCloseTo(80, 1);
    expect(result.recovery.change_pct).toBeCloseTo(33.33, 0);
    expect(result.recovery.direction).toBe('improved');
  });

  it('correctly identifies declined direction', async () => {
    getMock
      .mockResolvedValueOnce(paginated([makeRecovery(80)]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([makeRecovery(60)]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await comparePeriods(client, PERIODS);
    expect(result.recovery.change_pct).toBeCloseTo(-25, 0);
    expect(result.recovery.direction).toBe('declined');
  });

  it('uses ±5% threshold for unchanged', async () => {
    getMock
      .mockResolvedValueOnce(paginated([makeRecovery(80)]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([makeRecovery(82)]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await comparePeriods(client, PERIODS);
    expect(result.recovery.direction).toBe('unchanged');
  });

  it('rejects periods longer than 90 days', async () => {
    await expect(
      comparePeriods(client, {
        period_a_start: '2026-01-01T00:00:00.000Z',
        period_a_end: '2026-05-01T00:00:00.000Z',
        period_b_start: '2026-05-02T00:00:00.000Z',
        period_b_end: '2026-05-08T00:00:00.000Z',
      }),
    ).rejects.toThrow('90 days');
  });

  it('rejects overlapping periods', async () => {
    await expect(
      comparePeriods(client, {
        period_a_start: '2026-05-01T00:00:00.000Z',
        period_a_end: '2026-05-10T23:59:59.999Z',
        period_b_start: '2026-05-08T00:00:00.000Z',
        period_b_end: '2026-05-14T23:59:59.999Z',
      }),
    ).rejects.toThrow('overlap');
  });

  it('handles periods with zero records gracefully', async () => {
    getMock.mockResolvedValue(paginated([]));
    const result = await comparePeriods(client, PERIODS);
    expect(result.recovery.period_a_avg).toBe(0);
    expect(result.recovery.period_b_avg).toBe(0);
    expect(result.recovery.change_pct).toBe(0);
    expect(result.recovery.direction).toBe('unchanged');
  });

  it('normalizes per-day when periods have different lengths', async () => {
    const sleepA = [
      makeSleep('2026-05-01T22:00:00Z', '2026-05-02T06:00:00Z'),
      makeSleep('2026-05-02T22:00:00Z', '2026-05-03T06:00:00Z'),
    ];
    const sleepB = [
      makeSleep('2026-05-08T22:00:00Z', '2026-05-09T05:00:00Z'),
      makeSleep('2026-05-09T22:00:00Z', '2026-05-10T05:00:00Z'),
      makeSleep('2026-05-10T22:00:00Z', '2026-05-11T05:00:00Z'),
      makeSleep('2026-05-11T22:00:00Z', '2026-05-12T05:00:00Z'),
    ];
    getMock
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated(sleepA))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated(sleepB))
      .mockResolvedValueOnce(paginated([]));

    const result = await comparePeriods(client, {
      period_a_start: '2026-05-01T00:00:00.000Z',
      period_a_end: '2026-05-07T23:59:59.999Z',
      period_b_start: '2026-05-08T00:00:00.000Z',
      period_b_end: '2026-05-21T23:59:59.999Z',
    });

    expect(result.sleep.period_a_avg_hours).toBeCloseTo(8, 1);
    expect(result.sleep.period_b_avg_hours).toBeCloseTo(7, 1);
    expect(result.sleep.direction).toBe('declined');
  });

  it('filters unscored records', async () => {
    getMock
      .mockResolvedValueOnce(
        paginated([
          makeRecovery(80),
          { ...makeRecovery(50), score_state: 'PENDING_SCORE', score: undefined },
        ]),
      )
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([makeRecovery(80)]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await comparePeriods(client, PERIODS);
    expect(result.recovery.period_a_avg).toBe(80);
  });

  it('includes period metadata (start, end, days) in output', async () => {
    getMock.mockResolvedValue(paginated([]));
    const result = await comparePeriods(client, PERIODS);
    expect(result.period_a.start).toBe('2026-05-01T00:00:00.000Z');
    expect(result.period_a.end).toBe('2026-05-07T23:59:59.999Z');
    expect(result.period_a.days).toBeCloseTo(7, 0);
    expect(result.period_b.days).toBeCloseTo(7, 0);
  });

  it('computes strain direction as increased/decreased/unchanged', async () => {
    getMock
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([makeCycle(10)]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([makeCycle(15)]));

    const result = await comparePeriods(client, PERIODS);
    expect(result.strain.period_a_avg).toBe(10);
    expect(result.strain.period_b_avg).toBe(15);
    expect(result.strain.change_pct).toBeCloseTo(50, 0);
    expect(result.strain.direction).toBe('increased');
  });

  it('makes 6 sequential API calls (3 per period)', async () => {
    getMock.mockResolvedValue(paginated([]));
    await comparePeriods(client, PERIODS);
    expect(getMock).toHaveBeenCalledTimes(6);
  });
});
