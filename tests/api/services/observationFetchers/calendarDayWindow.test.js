/**
 * Calendar fetcher day-window helpers — the fix for the fidelity-eval
 * data-coverage investigation (2026-08-12).
 *
 * Measured failure mode: the single daily ingestion run fires at ~21:30 in
 * the user's timezone, and the observation window started at `timeMin: now`
 * — so every meeting that had already ENDED that day was invisible, and
 * events created the same day they occur were never captured (Aug 5 case:
 * calendar API holds the event, zero memories exist). Day boundaries also
 * used server time (UTC on Vercel), not the user's calendar day.
 *
 * Contract pinned here:
 *  - localDayWindow(now, tz) spans the user's FULL local calendar day
 *  - the day label is date-anchored so per-day summaries (including
 *    "no events" days) are distinct strings — identical-content dedup was
 *    collapsing empty days, making "not ingested" indistinguishable from
 *    "no events"
 *  - event times render in the user's timezone, not the server's
 */
import { describe, it, expect } from 'vitest';

const { localDayWindow, formatEventTime } = await import(
  '../../../../api/services/observationFetchers/calendar.js'
);

// 2026-08-12T00:30:00Z = 21:30 on Aug 11 in America/Sao_Paulo (UTC-3).
// This is the real cron firing time that produced the missed days.
const CRON_INSTANT = new Date('2026-08-12T00:30:00Z');

describe('localDayWindow', () => {
  it('spans the full LOCAL day containing `now`, not the UTC day', () => {
    const { start, end, dayLabel } = localDayWindow(CRON_INSTANT, 'America/Sao_Paulo');
    // Local day is Aug 11 (21:30 local) -> 00:00-23:59:59 local = 03:00Z Aug 11 to 02:59:59Z Aug 12
    expect(start.toISOString()).toBe('2026-08-11T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-12T02:59:59.999Z');
    expect(dayLabel).toBe('Aug 11, 2026');
    // The cron instant itself sits inside the window
    expect(CRON_INSTANT.getTime()).toBeGreaterThan(start.getTime());
    expect(CRON_INSTANT.getTime()).toBeLessThan(end.getTime());
  });

  it('a morning meeting that already ended is inside the window (the bug)', () => {
    // 10:45 local on Aug 11 = 13:45Z — before the 21:30-local cron, so the
    // old `timeMin: now` window excluded it.
    const meetingStart = new Date('2026-08-11T13:45:00Z');
    const { start, end } = localDayWindow(CRON_INSTANT, 'America/Sao_Paulo');
    expect(meetingStart.getTime()).toBeGreaterThan(start.getTime());
    expect(meetingStart.getTime()).toBeLessThan(end.getTime());
  });

  it('falls back to UTC for a missing or invalid timezone', () => {
    for (const tz of [undefined, null, 'Not/AZone']) {
      const { start, end, dayLabel } = localDayWindow(CRON_INSTANT, tz);
      expect(start.toISOString()).toBe('2026-08-12T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-08-12T23:59:59.999Z');
      expect(dayLabel).toBe('Aug 12, 2026');
    }
  });

  it('produces distinct labels on consecutive days (dedup safety)', () => {
    const a = localDayWindow(new Date('2026-08-12T00:30:00Z'), 'America/Sao_Paulo');
    const b = localDayWindow(new Date('2026-08-13T00:30:00Z'), 'America/Sao_Paulo');
    expect(a.dayLabel).not.toBe(b.dayLabel);
  });
});

describe('formatEventTime', () => {
  it('renders in the USER timezone, not the server timezone', () => {
    // 20:30Z = 5:30 PM in Sao Paulo. The old toLocaleTimeString without a
    // timeZone rendered whatever the server's zone was (UTC on Vercel).
    expect(formatEventTime('2026-08-11T20:30:00Z', 'America/Sao_Paulo')).toBe('5:30 PM');
    expect(formatEventTime('2026-08-11T20:30:00Z', 'UTC')).toBe('8:30 PM');
  });

  it('falls back to UTC on invalid timezone and returns null on garbage input', () => {
    expect(formatEventTime('2026-08-11T20:30:00Z', 'Not/AZone')).toBe('8:30 PM');
    expect(formatEventTime('not-a-date', 'UTC')).toBeNull();
  });
});
