/**
 * Tests for the PURE core of workspace rhythm — maker time vs meeting time.
 * The Drive/Calendar gather + orchestrator are glue verified live (canary);
 * the correlation math + candidate text are where bugs hide, so they're pinned.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMakerTime,
  buildMakerTimeCandidate,
  MAKER_EFFECT_FLOOR,
} from '../../../api/services/workspaceRhythm.js';

/** Build N days, each {date, driveActivity, load}. */
function days(specs) {
  return specs.map((s, i) => ({ date: `d${i}`, driveActivity: s.a, load: s.l }));
}

describe('computeMakerTime', () => {
  it('detects meetings suppressing creation (positive effect)', () => {
    // High-load days have ~0-1 docs; low-load days have ~5-6 docs.
    const data = days([
      { a: 6, l: 0 }, { a: 5, l: 0 }, { a: 6, l: 1 }, { a: 5, l: 0 }, { a: 6, l: 1 },
      { a: 3, l: 3 }, { a: 3, l: 3 }, { a: 2, l: 4 },
      { a: 1, l: 7 }, { a: 0, l: 8 }, { a: 1, l: 7 }, { a: 0, l: 9 }, { a: 1, l: 8 },
    ]);
    const m = computeMakerTime(data);
    expect(m).not.toBeNull();
    expect(m.effect).toBeGreaterThan(MAKER_EFFECT_FLOOR);
    expect(m.aLow).toBeGreaterThan(m.aHigh); // more making on light days
    expect(m.dropPct).toBeGreaterThan(0);
    expect(m.nHigh).toBeGreaterThanOrEqual(4);
    expect(m.nLow).toBeGreaterThanOrEqual(4);
  });

  it('detects making riding on a full calendar (negative effect)', () => {
    const data = days([
      { a: 0, l: 0 }, { a: 1, l: 0 }, { a: 0, l: 1 }, { a: 1, l: 0 }, { a: 0, l: 1 },
      { a: 3, l: 3 }, { a: 3, l: 3 }, { a: 4, l: 4 },
      { a: 6, l: 7 }, { a: 5, l: 8 }, { a: 6, l: 7 }, { a: 5, l: 9 }, { a: 6, l: 8 },
    ]);
    const m = computeMakerTime(data);
    expect(m).not.toBeNull();
    expect(m.effect).toBeLessThan(-MAKER_EFFECT_FLOOR);
    expect(m.aHigh).toBeGreaterThan(m.aLow); // more making on busy days
  });

  it('returns null when meeting load has no spread', () => {
    const data = days(Array.from({ length: 14 }, (_, i) => ({ a: i % 5, l: 2 })));
    expect(computeMakerTime(data)).toBeNull();
  });

  it('returns null when creation activity is flat (no signal)', () => {
    const data = days(Array.from({ length: 14 }, (_, i) => ({ a: 3, l: i % 9 })));
    expect(computeMakerTime(data)).toBeNull();
  });

  it('returns null on too-few days', () => {
    expect(computeMakerTime([])).toBeNull();
    expect(computeMakerTime(days([{ a: 1, l: 1 }, { a: 2, l: 5 }]))).toBeNull();
  });

  it('returns null when a tercile group is below the floor', () => {
    // 11 days but the high-load tercile has < 4 members with a clean split is
    // hard to force; instead use a tiny set that passes the 10-day gate but
    // can't fill 4+4 distinct groups.
    const data = days([
      { a: 5, l: 0 }, { a: 5, l: 0 }, { a: 5, l: 0 }, { a: 5, l: 0 }, { a: 5, l: 0 },
      { a: 5, l: 0 }, { a: 5, l: 0 }, { a: 5, l: 0 }, { a: 0, l: 9 }, { a: 0, l: 9 },
    ]);
    // Only 2 high-load days -> below MIN_GROUP_DAYS -> null
    expect(computeMakerTime(data)).toBeNull();
  });
});

describe('buildMakerTimeCandidate', () => {
  it('frames suppression with the percentage when meaningful', () => {
    const c = buildMakerTimeCandidate({ effect: 1.4, aHigh: 1, aLow: 5, dropPct: 80, nHigh: 5, nLow: 5 });
    expect(c).toMatch(/about 80% less/);
    expect(c).toMatch(/5 busy days/);
    expect(c).toMatch(/crowd out your actual making/);
  });

  it('falls back to "noticeably less" when no clean percentage', () => {
    const c = buildMakerTimeCandidate({ effect: 0.9, aHigh: 2, aLow: 3, dropPct: null, nHigh: 6, nLow: 6 });
    expect(c).toMatch(/noticeably less/);
    expect(c).not.toMatch(/%/);
  });

  it('frames the energizing case (more making on busy days)', () => {
    const c = buildMakerTimeCandidate({ effect: -1.1, aHigh: 6, aLow: 1, dropPct: -500, nHigh: 5, nLow: 5 });
    expect(c).toMatch(/actually create more/);
    expect(c).toMatch(/ride on a full calendar/);
  });

  it('returns null for no finding', () => {
    expect(buildMakerTimeCandidate(null)).toBeNull();
  });
});
