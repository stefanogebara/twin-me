/**
 * Tests for the PURE core of day-night-self — after-dark bucketing, the
 * night-leaning detection (share + count gates), day/night contrast, and the
 * candidate text. The DB gather + tz lookup are glue (verified live).
 */
import { describe, it, expect } from 'vitest';
import {
  isAfterDark,
  computeDayNightSelf,
  buildDayNightCandidate,
} from '../../../api/services/dayNightSelf.js';

const v = (domain, n, afterDark) => Array.from({ length: n }, () => ({ domain, afterDark }));

describe('isAfterDark', () => {
  it('treats [7,19) as day and the rest as after dark', () => {
    expect(isAfterDark(7)).toBe(false);
    expect(isAfterDark(12)).toBe(false);
    expect(isAfterDark(18)).toBe(false);
    expect(isAfterDark(19)).toBe(true);
    expect(isAfterDark(23)).toBe(true);
    expect(isAfterDark(2)).toBe(true);
    expect(isAfterDark(6)).toBe(true);
  });
});

describe('computeDayNightSelf', () => {
  it('surfaces domains that lean after-dark, contrasted with daytime', () => {
    const events = [
      ...v('replit.com', 30, false),   // pure day
      ...v('seatable.one', 20, false), // pure day
      ...v('x.com', 12, true),         // pure night
      ...v('dashboard.stripe.com', 14, true), // pure night
      ...v('github.com', 8, false), ...v('github.com', 2, true), // mostly day
    ];
    const r = computeDayNightSelf(events);
    expect(r).not.toBeNull();
    expect(r.nightDomains).toContain('Stripe');
    expect(r.nightDomains).toContain('X');
    expect(r.nightDomains).not.toContain('Github'); // 20% night -> not night-leaning
    expect(r.dayTop[0]).toBe('Replit');             // top daytime domain
    expect(r.nNight).toBe(28);
  });

  it('returns null when there is no real after-hours tail', () => {
    const events = [...v('replit.com', 40, false), ...v('x.com', 3, true)]; // 3 < MIN_NIGHT_TOTAL
    expect(computeDayNightSelf(events)).toBeNull();
  });

  it('returns null when nothing leans late enough', () => {
    // plenty of night volume, but spread so no single domain clears share+count
    const events = [];
    for (let i = 0; i < 10; i++) { events.push(...v(`d${i}.com`, 2, true), ...v(`d${i}.com`, 6, false)); }
    expect(computeDayNightSelf(events)).toBeNull(); // each domain 25% night
  });

  it('ignores events without a domain', () => {
    const events = [
      ...v('x.com', 8, true), ...v('dashboard.stripe.com', 20, true),
      { domain: null, afterDark: true },
      ...v('replit.com', 10, false),
    ];
    const r = computeDayNightSelf(events);
    expect(r.nightDomains).toContain('X');
  });
});

describe('buildDayNightCandidate', () => {
  it('contrasts day and night with friendly joins', () => {
    const c = buildDayNightCandidate({ nightDomains: ['X', 'Stripe'], dayTop: ['Replit', 'Seatable'], nNight: 30 });
    expect(c).toMatch(/lives in Replit and Seatable/);
    expect(c).toMatch(/X and Stripe draw you in/);
    expect(c).toMatch(/after the workday closes|once the workday closes/);
  });
  it('handles a single night domain and no day contrast', () => {
    const c = buildDayNightCandidate({ nightDomains: ['X'], dayTop: [], nNight: 26 });
    expect(c).toMatch(/X draw you in/);
    expect(c).not.toMatch(/lives in/);
  });
  it('returns null for no finding', () => {
    expect(buildDayNightCandidate(null)).toBeNull();
    expect(buildDayNightCandidate({ nightDomains: [] })).toBeNull();
  });
});
