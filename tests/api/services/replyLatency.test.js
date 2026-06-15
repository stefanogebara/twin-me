/**
 * Tests for the PURE core of reply latency — thread reply-turn extraction,
 * median, the load correlation gate, and candidate text. Gather is glue (canary).
 */
import { describe, it, expect } from 'vitest';
import {
  extractReplyTurns,
  median,
  computeReplyLatency,
  humanizeHours,
  buildReplyLatencyCandidate,
  MAX_LATENCY_MS,
  LATENCY_FLOOR_HRS,
} from '../../../api/services/replyLatency.js';

const HOUR = 3600_000;
const msg = (epoch, fromMe) => ({ internalDate: String(epoch), fromMe });

describe('extractReplyTurns', () => {
  it('captures a reply sent directly after an inbound message', () => {
    const turns = extractReplyTurns([
      msg(1000, false),         // inbound
      msg(1000 + 2 * HOUR, true), // my reply 2h later
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].inboundEpoch).toBe(1000);
    expect(turns[0].latencyMs).toBe(2 * HOUR);
  });

  it('sorts unsorted input before pairing', () => {
    const turns = extractReplyTurns([
      msg(1000 + 3 * HOUR, true),
      msg(1000, false),
    ]);
    expect(turns).toHaveLength(1);
    expect(turns[0].latencyMs).toBe(3 * HOUR);
  });

  it('does not double-count two replies in a row to one inbound', () => {
    const turns = extractReplyTurns([
      msg(1000, false),
      msg(1000 + HOUR, true),     // reply (counts)
      msg(1000 + 2 * HOUR, true), // follow-up, prev is mine -> not a new turn
    ]);
    expect(turns).toHaveLength(1);
  });

  it('ignores inbound-only or outbound-only threads', () => {
    expect(extractReplyTurns([msg(1, false), msg(2, false)])).toHaveLength(0);
    expect(extractReplyTurns([msg(1, true), msg(2, true)])).toHaveLength(0);
  });

  it('drops stale replies beyond the latency cap', () => {
    const turns = extractReplyTurns([
      msg(1000, false),
      msg(1000 + MAX_LATENCY_MS + HOUR, true),
    ]);
    expect(turns).toHaveLength(0);
  });
});

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('returns null for empty', () => {
    expect(median([])).toBeNull();
  });
});

/** days: {lat: number[] hours, load}. */
function days(specs) {
  return specs.map((s, i) => ({ date: `d${i}`, latencies: s.lat, load: s.load }));
}

describe('computeReplyLatency', () => {
  it('detects slower replies on busy days', () => {
    const fast = [1, 1.5, 2, 1]; // ~1.25h median on light days
    const slow = [6, 7, 8, 6];   // ~6.5h median on busy days
    const data = days([
      { lat: fast, load: 0 }, { lat: fast, load: 0 }, { lat: fast, load: 1 },
      { lat: fast, load: 0 }, { lat: fast, load: 1 },
      { lat: [3, 3], load: 3 }, { lat: [3, 3], load: 3 }, { lat: [4], load: 4 },
      { lat: slow, load: 7 }, { lat: slow, load: 8 }, { lat: slow, load: 7 },
      { lat: slow, load: 9 }, { lat: slow, load: 8 },
    ]);
    const r = computeReplyLatency(data);
    expect(r).not.toBeNull();
    expect(r.effect).toBeGreaterThan(LATENCY_FLOOR_HRS);
    expect(r.highMedianHrs).toBeGreaterThan(r.lowMedianHrs);
    expect(r.ratio).toBeGreaterThan(1.5);
  });

  it('detects faster replies on busy days (inverse)', () => {
    const slow = [6, 7, 8, 6];
    const fast = [1, 1.5, 2, 1];
    const data = days([
      { lat: slow, load: 0 }, { lat: slow, load: 0 }, { lat: slow, load: 1 },
      { lat: slow, load: 0 }, { lat: slow, load: 1 },
      { lat: [4], load: 3 }, { lat: [4], load: 3 }, { lat: [3, 3], load: 4 },
      { lat: fast, load: 7 }, { lat: fast, load: 8 }, { lat: fast, load: 7 },
      { lat: fast, load: 9 }, { lat: fast, load: 8 },
    ]);
    const r = computeReplyLatency(data);
    expect(r).not.toBeNull();
    expect(r.effect).toBeLessThan(0);
    expect(r.ratio).toBeLessThan(0.67);
  });

  it('returns null when the shift is too small relatively', () => {
    const a = [10, 11, 12, 10];
    const b = [11, 12, 13, 11]; // ~1h slower but ratio ~1.1
    const data = days([
      { lat: a, load: 0 }, { lat: a, load: 0 }, { lat: a, load: 1 },
      { lat: a, load: 0 }, { lat: a, load: 1 },
      { lat: a, load: 3 }, { lat: a, load: 3 }, { lat: a, load: 4 },
      { lat: b, load: 7 }, { lat: b, load: 8 }, { lat: b, load: 7 },
      { lat: b, load: 9 }, { lat: b, load: 8 },
    ]);
    expect(computeReplyLatency(data)).toBeNull();
  });

  it('returns null on too few replies or days', () => {
    expect(computeReplyLatency([])).toBeNull();
    expect(computeReplyLatency(days([{ lat: [1], load: 0 }, { lat: [9], load: 9 }]))).toBeNull();
  });
});

describe('humanizeHours', () => {
  it('scales phrasing by magnitude', () => {
    expect(humanizeHours(0.5)).toBe('under an hour');
    expect(humanizeHours(1.3)).toBe('about an hour');
    expect(humanizeHours(5)).toBe('about 5 hours');
    expect(humanizeHours(26)).toBe('about a day');
    expect(humanizeHours(60)).toBe('about 3 days');
  });
});

describe('buildReplyLatencyCandidate', () => {
  it('frames the slowdown with a humanized amount', () => {
    const c = buildReplyLatencyCandidate({ effect: 5.2, highMedianHrs: 6.5, lowMedianHrs: 1.3, ratio: 5, nHigh: 5, nLow: 5 });
    expect(c).toMatch(/about 5 hours longer/);
    expect(c).toMatch(/pushes your responses back/);
  });
  it('frames the inverse', () => {
    const c = buildReplyLatencyCandidate({ effect: -4, highMedianHrs: 2, lowMedianHrs: 6, ratio: 0.33, nHigh: 5, nLow: 5 });
    expect(c).toMatch(/reply about 4 hours faster/);
    expect(c).toMatch(/sharpen your turnaround/);
  });
  it('returns null for no finding', () => {
    expect(buildReplyLatencyCandidate(null)).toBeNull();
  });
});
