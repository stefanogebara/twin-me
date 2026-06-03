/**
 * Tests for whoop/analytics/getWorkouts.js. The data path mirrors
 * getWeeklySummary's workout aggregation (already covered in
 * getWeeklySummary.test.js), so this file focuses on what's unique
 * here: sport breakdown sorted by count, the per-workout list, and the
 * empty-state contract.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWorkouts } from '../../../../api/services/whoop/analytics/getWorkouts.js';

function createMockClient() {
  const getMock = vi.fn();
  return { client: { get: getMock }, getMock };
}

function makeWorkout(overrides = {}) {
  return {
    id: overrides.id ?? 'workout-1',
    user_id: 100,
    created_at: overrides.start ?? '2026-05-26T10:00:00.000Z',
    updated_at: overrides.end ?? '2026-05-26T11:00:00.000Z',
    start: overrides.start ?? '2026-05-26T10:00:00.000Z',
    end: overrides.end ?? '2026-05-26T11:00:00.000Z',
    timezone_offset: '-05:00',
    sport_name: overrides.sport_name ?? 'Running',
    score_state: overrides.score_state ?? 'SCORED',
    score:
      overrides.score === null
        ? null
        : {
            strain: overrides.strain ?? 12.5,
            average_heart_rate: overrides.average_heart_rate ?? 145,
            max_heart_rate: 175,
            kilojoule: overrides.kilojoule ?? 1200,
            percent_recorded: 100,
          },
  };
}

const paginated = (records) => ({ records });

describe('getWorkouts', () => {
  let client;
  let getMock;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000Z'));
    ({ client, getMock } = createMockClient());
  });

  it('returns empty-state object when no scored workouts in the window', async () => {
    getMock.mockResolvedValueOnce(paginated([]));
    const result = await getWorkouts(client, {});
    expect(result.totals.count).toBe(0);
    expect(result.totals.total_strain).toBe(0);
    expect(result.sports).toEqual([]);
    expect(result.list).toEqual([]);
    expect(result.period.days).toBe(7);
  });

  it('filters unscored workouts', async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeWorkout({ id: 'w1', sport_name: 'Running' }),
        makeWorkout({ id: 'w2', score_state: 'PENDING_SCORE', score: null }),
        makeWorkout({ id: 'w3', sport_name: 'Cycling' }),
      ]),
    );
    const result = await getWorkouts(client, {});
    expect(result.totals.count).toBe(2);
  });

  it('aggregates by sport, sorted by count desc', async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeWorkout({ id: 'w1', sport_name: 'Running', strain: 10, kilojoule: 800 }),
        makeWorkout({ id: 'w2', sport_name: 'Running', strain: 12, kilojoule: 900 }),
        makeWorkout({ id: 'w3', sport_name: 'Running', strain: 14, kilojoule: 1100 }),
        makeWorkout({ id: 'w4', sport_name: 'Tennis', strain: 8, kilojoule: 600 }),
        makeWorkout({ id: 'w5', sport_name: 'Tennis', strain: 9, kilojoule: 700 }),
        makeWorkout({ id: 'w6', sport_name: 'Walking', strain: 4, kilojoule: 300 }),
      ]),
    );
    const result = await getWorkouts(client, {});
    expect(result.sports.map((s) => `${s.sport}×${s.count}`)).toEqual([
      'Running×3',
      'Tennis×2',
      'Walking×1',
    ]);
    expect(result.sports[0].total_strain).toBe(36);
    expect(result.sports[0].total_kj).toBe(2800);
  });

  it('returns most-recent N workouts in the list (default 10)', async () => {
    const workouts = Array.from({ length: 15 }, (_, i) =>
      makeWorkout({
        id: `w${i}`,
        sport_name: 'Running',
        start: `2026-05-${10 + i}T10:00:00.000Z`,
        end: `2026-05-${10 + i}T11:00:00.000Z`,
      }),
    );
    getMock.mockResolvedValueOnce(paginated(workouts));
    const result = await getWorkouts(client, {});
    expect(result.list).toHaveLength(10);
    // Newest first — should start at 2026-05-24 (the 15th day).
    expect(result.list[0].start.slice(0, 10)).toBe('2026-05-24');
  });

  it('honours custom list_limit', async () => {
    const workouts = Array.from({ length: 8 }, (_, i) =>
      makeWorkout({ id: `w${i}`, sport_name: 'Running' }),
    );
    getMock.mockResolvedValueOnce(paginated(workouts));
    const result = await getWorkouts(client, { list_limit: 3 });
    expect(result.list).toHaveLength(3);
  });

  it('computes duration in minutes from start/end', async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeWorkout({
          id: 'w1',
          sport_name: 'Running',
          start: '2026-05-26T10:00:00.000Z',
          end: '2026-05-26T11:30:00.000Z',
        }),
      ]),
    );
    const result = await getWorkouts(client, {});
    expect(result.list[0].duration_minutes).toBe(90);
    expect(result.sports[0].total_minutes).toBe(90);
  });

  it('computes avg HR per sport when available', async () => {
    getMock.mockResolvedValueOnce(
      paginated([
        makeWorkout({ id: 'w1', sport_name: 'Running', average_heart_rate: 140 }),
        makeWorkout({ id: 'w2', sport_name: 'Running', average_heart_rate: 160 }),
      ]),
    );
    const result = await getWorkouts(client, {});
    expect(result.sports[0].avg_hr).toBe(150);
  });

  it('clamps days to MAX_DAYS (90)', async () => {
    getMock.mockResolvedValueOnce(paginated([]));
    const result = await getWorkouts(client, { days: 365 });
    expect(result.period.days).toBe(90);
  });

  it('hits /v2/activity/workout endpoint', async () => {
    getMock.mockResolvedValueOnce(paginated([]));
    await getWorkouts(client, {});
    expect(getMock.mock.calls[0][0]).toContain('/v2/activity/workout');
  });
});
