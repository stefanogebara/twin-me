/** A recurring charge's next date is never in the past: the beat rolls forward past today. */
import { describe, it, expect } from 'vitest';
import { nextAfter, detectRecurring } from '../../../../api/_app/services/money/recurring.js';

const DAY = 86400000;
describe('nextAfter', () => {
  it('rolls a biweekly last seen on 22 Aug to the first beat on or after today', () => {
    const last = Date.parse('2026-08-22T10:00:00Z');
    expect(nextAfter(last, 14 * DAY, new Date('2026-09-15T12:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-19');
    expect(nextAfter(last, 14 * DAY, new Date('2026-09-04T12:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-05');
    expect(nextAfter(last, 30 * DAY, new Date('2026-09-15T12:00:00Z')).toISOString().slice(0, 10)).toBe('2026-09-21');
  });
  it('detectRecurring uses it', () => {
    const rows = [0, 1, 2, 3].map((i) => ({ id: `s${i}`, merchant_key: 'facebook', amount: -20, occurred_at: new Date(Date.parse('2026-07-11T10:00:00Z') + i * 14 * DAY).toISOString() }));
    const [s] = detectRecurring(rows, { now: new Date('2026-09-15T12:00:00Z') });
    expect(s.last_seen.slice(0, 10)).toBe('2026-08-22');
    expect(s.next_expected).toBe('2026-09-19');
  });
});
