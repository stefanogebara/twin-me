import { describe, it, expect } from 'vitest';
import { getHourInTimeZone, getDayInTimeZone, monthYearInTimeZone, appleDayKey } from '../../api/services/gdprImportService.js';

// Audit: GDPR time-of-day buckets (YouTube/Discord/Spotify/Google/Netflix) used
// Date.getHours() = the Vercel server's UTC hour, so "evening watcher" etc. were
// wrong for every non-UTC user. getHourInTimeZone buckets in the user's local tz.
describe('getHourInTimeZone', () => {
  const instant = new Date('2024-01-15T04:00:00Z'); // 04:00 UTC

  it('converts an absolute instant to the local hour of a given IANA zone', () => {
    expect(getHourInTimeZone(instant, 'UTC')).toBe(4);
    expect(getHourInTimeZone(instant, 'America/Los_Angeles')).toBe(20); // UTC-8 -> prev day 20:00
    expect(getHourInTimeZone(instant, 'America/Sao_Paulo')).toBe(1);    // UTC-3 -> 01:00
    expect(getHourInTimeZone(instant, 'Asia/Tokyo')).toBe(13);          // UTC+9 -> 13:00
  });

  it('returns 0 (not 24) at midnight via the h23 cycle', () => {
    expect(getHourInTimeZone(new Date('2024-01-15T00:00:00Z'), 'UTC')).toBe(0);
  });

  it('falls back to the server-local hour when no timezone is given', () => {
    expect(getHourInTimeZone(instant, null)).toBe(instant.getHours());
    expect(getHourInTimeZone(instant, undefined)).toBe(instant.getHours());
  });

  it('falls back to the server-local hour on an invalid timezone string', () => {
    expect(getHourInTimeZone(instant, 'Not/AZone')).toBe(instant.getHours());
  });

  it('returns 0 for an invalid or missing date', () => {
    expect(getHourInTimeZone(new Date('nope'), 'UTC')).toBe(0);
    expect(getHourInTimeZone(null, 'UTC')).toBe(0);
  });
});

// Audit: Netflix day-of-week rollup bucketed on the server's UTC weekday.
describe('getDayInTimeZone', () => {
  const instant = new Date('2024-01-15T04:00:00Z'); // Mon 04:00 UTC; Sun 20:00 in LA

  it('returns the local weekday (0=Sun..6=Sat) for an IANA zone', () => {
    expect(getDayInTimeZone(instant, 'UTC')).toBe(1);                 // Monday
    expect(getDayInTimeZone(instant, 'America/Los_Angeles')).toBe(0); // Sunday (prev local day)
    expect(getDayInTimeZone(instant, 'Asia/Tokyo')).toBe(1);          // Monday 13:00
  });

  it('falls back to the server-local weekday with no/invalid tz', () => {
    expect(getDayInTimeZone(instant, null)).toBe(instant.getDay());
    expect(getDayInTimeZone(instant, 'Not/AZone')).toBe(instant.getDay());
  });

  it('returns 0 for an invalid date', () => {
    expect(getDayInTimeZone(new Date('x'), 'UTC')).toBe(0);
  });
});

// Audit: individual-entry month/year labels rendered in the server's UTC month.
describe('monthYearInTimeZone', () => {
  it('renders the month/year in the user local tz, not server UTC', () => {
    const edge = new Date('2024-02-01T02:00:00Z'); // Feb 1 02:00 UTC = Jan 31 in NY
    expect(monthYearInTimeZone(edge, 'America/New_York')).toBe('Jan 2024');
    expect(monthYearInTimeZone(edge, 'UTC')).toBe('Feb 2024');
  });

  it('falls back gracefully on an invalid tz', () => {
    expect(monthYearInTimeZone(new Date('2024-06-15T12:00:00Z'), 'Not/AZone')).toBe('Jun 2024');
  });
});

// Audit: Apple Health day-keys used toISOString() (UTC), mis-bucketing evening records.
describe('appleDayKey', () => {
  it('uses the local date from the raw HealthKit string, not the UTC instant', () => {
    // 23:00 local on Jan 15 (UTC-8) is Jan 16 07:00 UTC. The day key must stay Jan 15.
    const raw = '2024-01-15 23:00:00 -0800';
    const absolute = new Date('2024-01-16T07:00:00Z');
    expect(appleDayKey(raw, absolute)).toBe('2024-01-15');
  });

  it('falls back to the absolute UTC day when the raw string is malformed', () => {
    expect(appleDayKey('garbage', new Date('2024-03-10T05:00:00Z'))).toBe('2024-03-10');
  });

  it('returns empty string when nothing usable is given', () => {
    expect(appleDayKey(null, null)).toBe('');
  });
});
