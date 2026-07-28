/**
 * Tests for the goal auto-tracking math (audit 2026-06, High #6).
 *
 * extractMetricFromPlatformData + extractMetricFromMemories drive every user's
 * goal progress, yet shipped with zero direct assertions. A sign error in the
 * focus_time meeting math, a regex that stops matching after an ingestion-format
 * change, or a bounds typo would silently mis-track progress with no failing
 * test. These are pure functions over plain objects (extractMetricFromMemories
 * takes prefetched memories), so no DB mock is needed.
 */
import { describe, it, expect } from 'vitest';
import {
  extractMetricFromPlatformData,
  extractMetricFromMemories,
  evaluateTarget,
} from '../../api/services/goalTrackingService.js';

const mem = (content, overrides = {}) => ({
  memory_type: 'platform_data',
  content,
  created_at: new Date().toISOString(),
  ...overrides,
});

describe('extractMetricFromPlatformData', () => {
  it('returns null when platformData is missing', () => {
    expect(extractMetricFromPlatformData('sleep_hours', null)).toBeNull();
  });

  it('reads Whoop metrics (sleep parseFloat, recovery/hrv Number)', () => {
    const pd = { whoop: { sleepHours: '8.2', recovery: 82, hrv: 154 } };
    expect(extractMetricFromPlatformData('sleep_hours', pd)).toBe(8.2);
    expect(extractMetricFromPlatformData('recovery_score', pd)).toBe(82);
    expect(extractMetricFromPlatformData('hrv', pd)).toBe(154);
  });

  it('treats recovery 0 as a real value, not missing', () => {
    expect(extractMetricFromPlatformData('recovery_score', { whoop: { recovery: 0 } })).toBe(0);
  });

  it('meeting_count = number of today events', () => {
    const pd = { calendar: { todayEvents: [{}, {}, {}] } };
    expect(extractMetricFromPlatformData('meeting_count', pd)).toBe(3);
    expect(extractMetricFromPlatformData('meeting_count', { calendar: { todayEvents: [] } })).toBe(0);
  });

  describe('focus_time (9h block minus meeting hours)', () => {
    it('subtracts a 2h meeting from the 9h block', () => {
      const pd = { calendar: { todayEvents: [
        { start: '2026-06-19T10:00:00Z', end: '2026-06-19T12:00:00Z' },
      ] } };
      expect(extractMetricFromPlatformData('focus_time', pd)).toBe(7);
    });

    it('defaults a missing end to a 1h meeting', () => {
      const pd = { calendar: { todayEvents: [{ start: '2026-06-19T10:00:00Z' }] } };
      expect(extractMetricFromPlatformData('focus_time', pd)).toBe(8);
    });

    it('skips events with invalid start/end dates', () => {
      const pd = { calendar: { todayEvents: [
        { start: 'not-a-date', end: '2026-06-19T12:00:00Z' },
        { start: '2026-06-19T10:00:00Z', end: 'also-bad' },
        { start: '2026-06-19T10:00:00Z', end: '2026-06-19T11:00:00Z' }, // 1h counts
      ] } };
      expect(extractMetricFromPlatformData('focus_time', pd)).toBe(8);
    });

    it('ignores negative-duration events and clamps a fully-booked day to 0', () => {
      const pd = { calendar: { todayEvents: [
        { start: '2026-06-19T12:00:00Z', end: '2026-06-19T10:00:00Z' }, // negative -> 0
        { start: '2026-06-19T00:00:00Z', end: '2026-06-19T23:00:00Z' }, // 23h -> clamp
      ] } };
      expect(extractMetricFromPlatformData('focus_time', pd)).toBe(0);
    });

    it('returns null when there is no calendar data', () => {
      expect(extractMetricFromPlatformData('focus_time', { calendar: {} })).toBeNull();
    });
  });

  it('listening_hours = tracks * 3.5min, null when empty', () => {
    expect(extractMetricFromPlatformData('listening_hours', { spotify: { recentTracks: new Array(60).fill({}) } }))
      .toBeCloseTo(3.5, 5); // 60 * 3.5 / 60
    expect(extractMetricFromPlatformData('listening_hours', { spotify: { recentTracks: [] } })).toBeNull();
  });

  it('returns null for an unknown metric type', () => {
    expect(extractMetricFromPlatformData('bogus_metric', { whoop: {} })).toBeNull();
  });
});

describe('extractMetricFromMemories (regex fallback over the memory stream)', () => {
  it('extracts each metric from its canonical phrasing', async () => {
    const cases = [
      ['sleep_hours', 'Slept 8.2h last night', 8.2],
      ['recovery_score', 'Recovery score: 82%', 82],
      ['hrv', 'HRV: 154ms this morning', 154],
      ['meeting_count', 'Calendar schedule today: 2 events', 2],
      ['meeting_count', '3 meetings today', 3],
      ['listening_hours', '2.5h of listening', 2.5],
      ['focus_time', '4h deep work', 4],
    ];
    for (const [metric, content, expected] of cases) {
      const v = await extractMetricFromMemories('u', metric, [mem(content)]);
      expect(v, `${metric} <- "${content}"`).toBe(expected);
    }
  });

  it('rejects out-of-bounds matches (METRIC_BOUNDS)', async () => {
    expect(await extractMetricFromMemories('u', 'recovery_score', [mem('Recovery score: 999%')])).toBeNull();
    expect(await extractMetricFromMemories('u', 'sleep_hours', [mem('Slept 50h')])).toBeNull();
  });

  it('handles the "no meetings or events" special case as 0', async () => {
    const v = await extractMetricFromMemories('u', 'meeting_count', [mem('Calendar schedule today: no meetings or events')]);
    expect(v).toBe(0);
  });

  it('handles the "completely open day" special case as 9h focus', async () => {
    const v = await extractMetricFromMemories('u', 'focus_time', [mem('A completely open day ahead')]);
    expect(v).toBe(9);
  });

  it('only scans platform_data/observation memories (ignores reflections)', async () => {
    const v = await extractMetricFromMemories('u', 'sleep_hours', [
      mem('Slept 7.5h', { memory_type: 'reflection' }),
    ]);
    expect(v).toBeNull();
  });

  it('ignores memories older than the 36h window', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const v = await extractMetricFromMemories('u', 'sleep_hours', [mem('Slept 8h', { created_at: old })]);
    expect(v).toBeNull();
  });

  it('returns null for an unknown metric type', async () => {
    expect(await extractMetricFromMemories('u', 'bogus_metric', [mem('Slept 8h')])).toBeNull();
  });
});

describe('evaluateTarget', () => {
  it('honors each operator', () => {
    expect(evaluateTarget(8, 7, '>=')).toBe(true);
    expect(evaluateTarget(6, 7, '>=')).toBe(false);
    expect(evaluateTarget(6, 7, '<=')).toBe(true);
    expect(evaluateTarget(8, 7, '>')).toBe(true);
    expect(evaluateTarget(6, 7, '<')).toBe(true);
    expect(evaluateTarget(7, 7, '=')).toBe(true);
    expect(evaluateTarget(8, 7, 'unknown-op')).toBe(true); // default >=
  });

  it('is false when either value is null/undefined', () => {
    expect(evaluateTarget(null, 7, '>=')).toBe(false);
    expect(evaluateTarget(8, null, '>=')).toBe(false);
    expect(evaluateTarget(undefined, 7, '>=')).toBe(false);
  });
});
