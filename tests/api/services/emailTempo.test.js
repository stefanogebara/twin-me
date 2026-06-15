/**
 * Tests for the PURE core of email tempo — the local-time bucketing, the
 * evening-share correlation, and the candidate text. The Gmail/Calendar gather
 * + orchestrator are glue verified live (canary); the math is pinned here.
 */
import { describe, it, expect } from 'vitest';
import {
  localParts,
  computeEmailTempo,
  buildEmailTempoCandidate,
  EVENING_HOUR,
  LATE_SHARE_FLOOR,
} from '../../../api/services/emailTempo.js';

describe('localParts (timezone bucketing)', () => {
  it('shifts an epoch into the user local day and hour', () => {
    // 2026-06-09T23:30:00Z in Sao Paulo (UTC-3) -> 20:30 local, same day
    const { date, hour } = localParts(Date.UTC(2026, 5, 9, 23, 30), 'America/Sao_Paulo');
    expect(date).toBe('2026-06-09');
    expect(hour).toBe(20);
  });

  it('rolls back across the UTC midnight boundary', () => {
    // 2026-06-10T01:00:00Z in Sao Paulo (UTC-3) -> 22:00 the PRIOR local day
    const { date, hour } = localParts(Date.UTC(2026, 5, 10, 1, 0), 'America/Sao_Paulo');
    expect(date).toBe('2026-06-09');
    expect(hour).toBe(22);
  });

  it('defaults to UTC when no timezone given', () => {
    const { date, hour } = localParts(Date.UTC(2026, 5, 9, 8, 0));
    expect(date).toBe('2026-06-09');
    expect(hour).toBe(8);
  });
});

/** Build a deterministic dataset. Each spec: {sent, late, load}. */
function days(specs) {
  return specs.map((s, i) => ({ date: `d${i}`, sentCount: s.sent, lateCount: s.late, load: s.load }));
}

describe('computeEmailTempo', () => {
  it('detects meetings pushing email into the evening (positive effect)', () => {
    // High-load days: ~60% of email after 7pm. Low-load days: ~10%.
    const data = days([
      { sent: 5, late: 0, load: 0 }, { sent: 5, late: 1, load: 0 }, { sent: 4, late: 0, load: 1 },
      { sent: 5, late: 0, load: 0 }, { sent: 5, late: 1, load: 1 },
      { sent: 4, late: 1, load: 3 }, { sent: 4, late: 1, load: 3 }, { sent: 4, late: 2, load: 4 },
      { sent: 5, late: 3, load: 7 }, { sent: 5, late: 3, load: 8 }, { sent: 5, late: 3, load: 7 },
      { sent: 4, late: 3, load: 9 }, { sent: 5, late: 3, load: 8 },
    ]);
    const t = computeEmailTempo(data);
    expect(t).not.toBeNull();
    expect(t.effect).toBeGreaterThan(LATE_SHARE_FLOOR);
    expect(t.lateShareHighPct).toBeGreaterThan(t.lateShareLowPct);
    expect(t.deltaPts).toBeGreaterThan(0);
    expect(t.eveningHour).toBe(EVENING_HOUR);
    expect(t.nHigh).toBeGreaterThanOrEqual(4);
  });

  it('detects the inverse (busy days compress email into the workday)', () => {
    const data = days([
      { sent: 5, late: 3, load: 0 }, { sent: 5, late: 3, load: 0 }, { sent: 4, late: 3, load: 1 },
      { sent: 5, late: 3, load: 0 }, { sent: 5, late: 3, load: 1 },
      { sent: 4, late: 1, load: 3 }, { sent: 4, late: 1, load: 3 }, { sent: 4, late: 1, load: 4 },
      { sent: 5, late: 0, load: 7 }, { sent: 5, late: 0, load: 8 }, { sent: 5, late: 0, load: 7 },
      { sent: 4, late: 0, load: 9 }, { sent: 5, late: 0, load: 8 },
    ]);
    const t = computeEmailTempo(data);
    expect(t).not.toBeNull();
    expect(t.effect).toBeLessThan(-LATE_SHARE_FLOOR);
    expect(t.lateShareHighPct).toBeLessThan(t.lateShareLowPct);
  });

  it('returns null when meeting load has no spread', () => {
    const data = days(Array.from({ length: 14 }, (_, i) => ({ sent: 5, late: i % 2, load: 2 })));
    expect(computeEmailTempo(data)).toBeNull();
  });

  it('returns null when the evening-share gap is below the floor', () => {
    const data = days([
      { sent: 5, late: 1, load: 0 }, { sent: 5, late: 1, load: 0 }, { sent: 5, late: 1, load: 1 },
      { sent: 5, late: 1, load: 0 }, { sent: 5, late: 1, load: 1 },
      { sent: 5, late: 1, load: 3 }, { sent: 5, late: 1, load: 3 }, { sent: 5, late: 1, load: 4 },
      { sent: 5, late: 1, load: 7 }, { sent: 5, late: 1, load: 8 }, { sent: 5, late: 1, load: 7 },
      { sent: 5, late: 1, load: 9 }, { sent: 5, late: 1, load: 8 },
    ]);
    expect(computeEmailTempo(data)).toBeNull(); // flat ~20% both groups
  });

  it('returns null on too-few days or too-little volume', () => {
    expect(computeEmailTempo([])).toBeNull();
    expect(computeEmailTempo(days([{ sent: 1, late: 1, load: 5 }, { sent: 1, late: 0, load: 0 }]))).toBeNull();
  });

  it('ignores days with no sent email', () => {
    const data = days([
      ...Array.from({ length: 6 }, () => ({ sent: 0, late: 0, load: 5 })), // no email -> excluded
      { sent: 5, late: 0, load: 0 }, { sent: 5, late: 0, load: 0 }, { sent: 5, late: 1, load: 1 },
      { sent: 5, late: 0, load: 1 }, { sent: 5, late: 3, load: 8 }, { sent: 5, late: 3, load: 9 },
    ]);
    // Only 6 days have sentCount > 0 -> below MIN_DAYS -> null (proves the filter)
    expect(computeEmailTempo(data)).toBeNull();
  });
});

describe('buildEmailTempoCandidate', () => {
  it('frames the evening spill with one number and the hour', () => {
    const c = buildEmailTempoCandidate({ effect: 0.3, lateShareHighPct: 55, lateShareLowPct: 25, deltaPts: 30, nHigh: 5, nLow: 5, eveningHour: 19 });
    expect(c).toMatch(/after 7pm/);
    expect(c).toMatch(/about 30 points more/);
    expect(c).toMatch(/into the evening/);
    expect(c).not.toMatch(/%/); // house style: avoid double percentages
  });

  it('frames the compression case for a negative effect', () => {
    const c = buildEmailTempoCandidate({ effect: -0.2, lateShareHighPct: 10, lateShareLowPct: 30, deltaPts: 20, nHigh: 5, nLow: 5, eveningHour: 19 });
    expect(c).toMatch(/smaller share of late-evening emails/);
    expect(c).toMatch(/about 20 points fewer/);
    expect(c).toMatch(/into the workday/);
  });

  it('returns null for no finding', () => {
    expect(buildEmailTempoCandidate(null)).toBeNull();
  });
});
