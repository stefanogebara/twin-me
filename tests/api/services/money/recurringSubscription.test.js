/**
 * What makes a standing charge a subscription.
 * ============================================
 * It used to be a lookup: is_subscription was Boolean(platforms[key]), and platforms came
 * from money_merchants.platform. That table holds no rows and never has, so on 2026-09-24
 * every series in production carried is_subscription false: Spotify, Higgsfield, Fly.io and
 * Render among them, and the subscription findings could not fire for anybody, ever. The
 * catalogue was the retired twin's platform list, which money does not have and is not
 * getting. The evidence the ledger does hold is the beat: a charge that repeats on a
 * calendar month or longer at a steady figure is something signed up for. A weekly or
 * biweekly rhythm is a habit - a commute, a shop - and stays out.
 */
import { describe, it, expect } from 'vitest';
import { detectRecurring } from '../../../../api/_app/services/money/recurring.js';

const DAY = 86400000;
const now = new Date('2026-09-24T12:00:00Z');
const series = (key, amount, stepDays, n = 3, from = '2026-06-24T10:00:00Z') =>
  Array.from({ length: n }, (_, i) => ({ id: `${key}${i}`, merchant_key: key, amount: -amount, occurred_at: new Date(Date.parse(from) + i * stepDays * DAY).toISOString() }));
const only = (rows) => detectRecurring(rows, { now })[0];

describe('is_subscription, read from the beat', () => {
  it('a monthly charge at a steady figure is one, with no catalogue to consult', () => {
    const s = only(series('spotify', 11.99, 30));
    expect(s.cadence).toBe('monthly');
    expect(s.is_subscription).toBe(true);
  });

  it('quarterly and yearly beats are too', () => {
    expect(only(series('domain', 14.5, 90, 3, '2025-11-24T10:00:00Z')).is_subscription).toBe(true);
    /* Three yearly charges cannot fit the 400-day window a refresh reads, so the yearly
       beat is proved on a window wide enough to hold one. */
    const yearly = detectRecurring(series('insurance', 220, 365, 3, '2023-09-24T10:00:00Z'), { now, windowDays: 1200 })[0];
    expect(yearly.cadence).toBe('yearly');
    expect(yearly.is_subscription).toBe(true);
  });

  it('a commute is not a subscription, however exact the fare', () => {
    const s = only(series('renfe cercanias', 1.7, 7, 8));
    expect(s.cadence).toBe('weekly');
    expect(s.is_subscription).toBe(false);
  });

  it('a biweekly top-up is not one either', () => {
    expect(only(series('facebook', 20, 14, 4)).is_subscription).toBe(false);
  });

  it('a merchant the catalogue does name is still one, whatever its beat', () => {
    const rows = series('facebook', 20, 14, 4);
    const s = detectRecurring(rows, { now, platforms: { facebook: 'facebook' } })[0];
    expect(s.is_subscription).toBe(true);
    expect(s.platform).toBe('facebook');
  });

  it('leaves platform null when only the beat says so: money has no platform feed', () => {
    expect(only(series('fly io', 18.63, 30)).platform).toBeNull();
  });
});
