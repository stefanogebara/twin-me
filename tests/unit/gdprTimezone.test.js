import { describe, it, expect } from 'vitest';
import { getHourInTimeZone } from '../../api/services/gdprImportService.js';

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
