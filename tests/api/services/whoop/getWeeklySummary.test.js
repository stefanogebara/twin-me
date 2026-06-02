/**
 * Tests for whoop/analytics/getWeeklySummary.js — ported from
 * shashankswe2020-ux/whoop-mcp tests/tools/get-weekly-summary.test.ts (MIT).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWeeklySummary } from '../../../../api/services/whoop/analytics/getWeeklySummary.js';

function createMockClient() {
  const getMock = vi.fn();
  return { client: { get: getMock }, getMock };
}

function makeRecovery(overrides = {}) {
  return {
    cycle_id: 1,
    sleep_id: 's1',
    user_id: 100,
    created_at: '2026-05-26T06:00:00.000Z',
    updated_at: '2026-05-26T06:00:00.000Z',
    score_state: 'SCORED',
    score: {
      user_calibrating: false,
      recovery_score: 75,
      resting_heart_rate: 55,
      hrv_rmssd_milli: 60,
      spo2_percentage: 98,
      skin_temp_celsius: 33.5,
      ...(overrides.score ?? {}),
    },
    ...overrides,
    // For overrides that pass `score: undefined` we want the spread to win;
    // mimic upstream by explicitly reapplying when present.
    ...(overrides.score === undefined && 'score' in overrides ? { score: undefined } : {}),
  };
}

function makeSleep(overrides = {}) {
  return {
    id: 'sleep-1',
    cycle_id: 1,
    user_id: 100,
    created_at: '2026-05-26T06:00:00.000Z',
    updated_at: '2026-05-26T06:00:00.000Z',
    start: '2026-05-25T22:00:00.000Z',
    end: '2026-05-26T06:00:00.000Z',
    timezone_offset: '-05:00',
    nap: false,
    score_state: 'SCORED',
    score: {
      sleep_performance_percentage: 85,
      sleep_consistency_percentage: 90,
      sleep_efficiency_percentage: 88,
    },
    ...overrides,
  };
}

function makeWorkout(overrides = {}) {
  return {
    id: 'workout-1',
    user_id: 100,
    created_at: '2026-05-26T10:00:00.000Z',
    updated_at: '2026-05-26T10:00:00.000Z',
    start: '2026-05-26T10:00:00.000Z',
    end: '2026-05-26T11:00:00.000Z',
    timezone_offset: '-05:00',
    sport_name: 'Running',
    score_state: 'SCORED',
    score: {
      strain: 12.5,
      average_heart_rate: 145,
      max_heart_rate: 175,
      kilojoule: 1200,
      percent_recorded: 100,
    },
    ...overrides,
  };
}

function makeCycle(overrides = {}) {
  return {
    id: 1,
    user_id: 100,
    created_at: '2026-05-26T00:00:00.000Z',
    updated_at: '2026-05-26T23:59:59.000Z',
    start: '2026-05-26T00:00:00.000Z',
    end: '2026-05-26T23:59:59.000Z',
    timezone_offset: '-05:00',
    score_state: 'SCORED',
    score: { strain: 14.2, kilojoule: 8500, average_heart_rate: 72, max_heart_rate: 175 },
    ...overrides,
  };
}

const paginated = (records) => ({ records });

describe('getWeeklySummary', () => {
  let client;
  let getMock;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
    ({ client, getMock } = createMockClient());
  });

  it('defaults to current week (Monday to now) when no week_start provided', async () => {
    getMock.mockResolvedValue(paginated([]));
    await getWeeklySummary(client, {});
    const firstCall = getMock.mock.calls[0][0];
    expect(firstCall).toContain('start=2026-05-25T00%3A00%3A00.000Z');
  });

  it('computes correct recovery averages from scored records', async () => {
    const recoveries = [
      makeRecovery({ score: { user_calibrating: false, recovery_score: 70, resting_heart_rate: 52, hrv_rmssd_milli: 55, spo2_percentage: 98, skin_temp_celsius: 33 } }),
      makeRecovery({ score: { user_calibrating: false, recovery_score: 80, resting_heart_rate: 58, hrv_rmssd_milli: 65, spo2_percentage: 97, skin_temp_celsius: 34 } }),
      makeRecovery({ score: { user_calibrating: false, recovery_score: 60, resting_heart_rate: 54, hrv_rmssd_milli: 50, spo2_percentage: 99, skin_temp_celsius: 33.5 } }),
    ];
    getMock
      .mockResolvedValueOnce(paginated(recoveries))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await getWeeklySummary(client, {});
    expect(result.recovery.average_score).toBeCloseTo(70, 1);
    expect(result.recovery.min_score).toBe(60);
    expect(result.recovery.max_score).toBe(80);
    expect(result.recovery.average_hrv).toBeCloseTo(56.67, 1);
    expect(result.recovery.average_rhr).toBeCloseTo(54.67, 1);
  });

  it('computes correct sleep averages', async () => {
    const sleeps = [
      makeSleep({ start: '2026-05-25T22:00:00.000Z', end: '2026-05-26T06:00:00.000Z' }),
      makeSleep({
        start: '2026-05-26T23:00:00.000Z',
        end: '2026-05-27T06:30:00.000Z',
        score: {
          sleep_performance_percentage: 75,
          sleep_consistency_percentage: 85,
          sleep_efficiency_percentage: 80,
        },
      }),
    ];
    getMock
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated(sleeps))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await getWeeklySummary(client, {});
    expect(result.sleep.average_duration_hours).toBeCloseTo(7.75, 1);
    expect(result.sleep.average_performance_pct).toBeCloseTo(80, 1);
    expect(result.sleep.average_efficiency_pct).toBeCloseTo(84, 1);
  });

  it('computes correct workout stats with sport breakdown', async () => {
    const workouts = [
      makeWorkout({ sport_name: 'Running', score: { strain: 12.5, average_heart_rate: 145, max_heart_rate: 175, kilojoule: 1200, percent_recorded: 100 } }),
      makeWorkout({ id: 'workout-2', sport_name: 'Running', score: { strain: 10.0, average_heart_rate: 140, max_heart_rate: 170, kilojoule: 1000, percent_recorded: 100 } }),
      makeWorkout({ id: 'workout-3', sport_name: 'Cycling', score: { strain: 8.0, average_heart_rate: 135, max_heart_rate: 160, kilojoule: 900, percent_recorded: 100 } }),
    ];
    getMock
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated(workouts))
      .mockResolvedValueOnce(paginated([]));

    const result = await getWeeklySummary(client, {});
    expect(result.workouts.count).toBe(3);
    expect(result.workouts.total_strain).toBeCloseTo(30.5, 1);
    expect(result.workouts.total_calories_kj).toBe(3100);
    expect(result.workouts.sport_breakdown).toEqual({ Running: 2, Cycling: 1 });
  });

  it('computes correct strain averages from cycle data', async () => {
    const cycles = [
      makeCycle({ score: { strain: 14.2, kilojoule: 8500, average_heart_rate: 72, max_heart_rate: 175 } }),
      makeCycle({ id: 2, score: { strain: 10.0, kilojoule: 7000, average_heart_rate: 68, max_heart_rate: 165 } }),
    ];
    getMock
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated(cycles));

    const result = await getWeeklySummary(client, {});
    expect(result.strain.average_daily_strain).toBeCloseTo(12.1, 1);
    expect(result.strain.max_daily_strain).toBe(14.2);
  });

  it('determines recovery trend using linear regression', async () => {
    const recoveries = [50, 55, 60, 65, 70, 75, 80].map((score) =>
      makeRecovery({ score: { user_calibrating: false, recovery_score: score, resting_heart_rate: 55, hrv_rmssd_milli: 60, spo2_percentage: 98, skin_temp_celsius: 33 } }),
    );
    getMock
      .mockResolvedValueOnce(paginated(recoveries))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await getWeeklySummary(client, {});
    expect(result.recovery.trend).toBe('improving');
  });

  it('filters out unscored records (PENDING_SCORE, UNSCORABLE)', async () => {
    const recoveries = [
      makeRecovery({ score: { user_calibrating: false, recovery_score: 70, resting_heart_rate: 52, hrv_rmssd_milli: 55, spo2_percentage: 98, skin_temp_celsius: 33 } }),
      { ...makeRecovery(), score_state: 'PENDING_SCORE', score: undefined },
      { ...makeRecovery(), score_state: 'UNSCORABLE', score: undefined },
    ];
    getMock
      .mockResolvedValueOnce(paginated(recoveries))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await getWeeklySummary(client, {});
    expect(result.recovery.average_score).toBe(70);
    expect(result.recovery.min_score).toBe(70);
    expect(result.recovery.max_score).toBe(70);
  });

  it('returns partial results with warnings when some endpoints fail', async () => {
    getMock
      .mockResolvedValueOnce(paginated([makeRecovery()]))
      .mockRejectedValueOnce(new Error('Sleep endpoint unavailable'))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await getWeeklySummary(client, {});
    expect(result.recovery.average_score).toBe(75);
    expect(result.warnings).toBeDefined();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('sleep');
  });

  it('throws error when ALL 4 endpoints fail', async () => {
    getMock
      .mockRejectedValueOnce(new Error('Recovery down'))
      .mockRejectedValueOnce(new Error('Sleep down'))
      .mockRejectedValueOnce(new Error('Workout down'))
      .mockRejectedValueOnce(new Error('Cycle down'));
    await expect(getWeeklySummary(client, {})).rejects.toThrow('All endpoints failed');
  });

  it('accepts enhanced date expression for week_start', async () => {
    getMock.mockResolvedValue(paginated([]));
    await getWeeklySummary(client, { week_start: 'last week' });
    const firstCall = getMock.mock.calls[0][0];
    expect(firstCall).toContain('start=2026-05-18T00%3A00%3A00.000Z');
  });

  it('returns zero values when no scored data available', async () => {
    getMock.mockResolvedValue(paginated([]));
    const result = await getWeeklySummary(client, {});
    expect(result.recovery.average_score).toBe(0);
    expect(result.recovery.min_score).toBe(0);
    expect(result.recovery.max_score).toBe(0);
    expect(result.recovery.trend).toBe('stable');
    expect(result.sleep.average_duration_hours).toBe(0);
    expect(result.workouts.count).toBe(0);
    expect(result.strain.average_daily_strain).toBe(0);
  });

  it('uses fetchAllPages with serialized calls (4 sequential calls)', async () => {
    getMock.mockResolvedValue(paginated([]));
    await getWeeklySummary(client, {});
    expect(getMock).toHaveBeenCalledTimes(4);
  });

  it('includes week_start and week_end in the output', async () => {
    getMock.mockResolvedValue(paginated([]));
    const result = await getWeeklySummary(client, {});
    expect(result.week_start).toBe('2026-05-25T00:00:00.000Z');
    expect(result.week_end).toContain('2026-05-31');
  });

  it('correctly handles week_start as ISO 8601 string', async () => {
    getMock.mockResolvedValue(paginated([]));
    await getWeeklySummary(client, { week_start: '2026-05-12T00:00:00.000Z' });
    const firstCall = getMock.mock.calls[0][0];
    expect(firstCall).toContain('start=2026-05-12T00%3A00%3A00.000Z');
  });

  it('excludes naps from sleep duration calculation', async () => {
    const sleeps = [
      makeSleep({ nap: false, start: '2026-05-25T22:00:00.000Z', end: '2026-05-26T06:00:00.000Z' }),
      makeSleep({
        id: 'nap-1',
        nap: true,
        start: '2026-05-26T14:00:00.000Z',
        end: '2026-05-26T14:30:00.000Z',
      }),
    ];
    getMock
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated(sleeps))
      .mockResolvedValueOnce(paginated([]))
      .mockResolvedValueOnce(paginated([]));

    const result = await getWeeklySummary(client, {});
    expect(result.sleep.average_duration_hours).toBeCloseTo(8, 1);
  });
});
