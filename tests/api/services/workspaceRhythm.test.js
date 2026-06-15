/**
 * Tests for the PURE core of workspace rhythm — maker time vs meeting time.
 * The Drive/Calendar gather + orchestrator are glue verified live (canary);
 * the correlation math + candidate text are where bugs hide, so they're pinned.
 */
import { describe, it, expect } from 'vitest';
import {
  computeMakerTime,
  buildMakerTimeCandidate,
  bucketActivityByDay,
  MAKER_EFFECT_FLOOR,
} from '../../../api/services/workspaceRhythm.js';

// ── Drive Activity API parser ────────────────────────────────────────────────
const DOC = 'application/vnd.google-apps.document';
const SHEET = 'application/vnd.google-apps.spreadsheet';
const PNG = 'image/png';
const mine = { user: { knownUser: { isCurrentUser: true } } };
const other = { user: { knownUser: { isCurrentUser: false } } };
const edit = { edit: {} };
const create = { create: {} };
const comment = { comment: {} };
function activity({ detail = edit, actors = [mine], ts = '2026-06-09T12:00:00Z', targets = [{ driveItem: { name: 'items/a', mimeType: DOC } }], timeRange } = {}) {
  const a = { primaryActionDetail: detail, actors, targets };
  if (timeRange) a.timeRange = timeRange; else a.timestamp = ts;
  return a;
}

describe('bucketActivityByDay', () => {
  it('counts the current user create/edit on Workspace docs per day', () => {
    const m = bucketActivityByDay([
      activity({ detail: edit, ts: '2026-06-09T08:00:00Z', targets: [{ driveItem: { name: 'items/a', mimeType: DOC } }] }),
      activity({ detail: create, ts: '2026-06-09T20:00:00Z', targets: [{ driveItem: { name: 'items/b', mimeType: SHEET } }] }),
    ]);
    expect(m.get('2026-06-09')).toBe(2);
  });

  it('buckets into the user timezone so it lines up with calendar load', () => {
    // 01:00Z is the prior day (22:00) in Sao Paulo (UTC-3) — must match how
    // fetchCalendarLoadDays keys its days, or load and activity mis-pair.
    const m = bucketActivityByDay(
      [activity({ ts: '2026-06-10T01:00:00Z', targets: [{ driveItem: { name: 'items/a', mimeType: DOC } }] })],
      { timeZone: 'America/Sao_Paulo' },
    );
    expect(m.get('2026-06-09')).toBe(1);
    expect(m.has('2026-06-10')).toBe(false);
  });

  it('dedups repeat edits of the same doc within a day', () => {
    const m = bucketActivityByDay([
      activity({ ts: '2026-06-09T08:00:00Z', targets: [{ driveItem: { name: 'items/a', mimeType: DOC } }] }),
      activity({ ts: '2026-06-09T09:00:00Z', targets: [{ driveItem: { name: 'items/a', mimeType: DOC } }] }),
      activity({ ts: '2026-06-09T10:00:00Z', targets: [{ driveItem: { name: 'items/a', mimeType: DOC } }] }),
    ]);
    expect(m.get('2026-06-09')).toBe(1); // same doc, one distinct touch
  });

  it('excludes other people edits and non-making actions', () => {
    const m = bucketActivityByDay([
      activity({ actors: [other] }),                 // someone else
      activity({ detail: comment }),                 // not making
      activity({ actors: [] }),                      // unattributable
    ]);
    expect(m.size).toBe(0);
  });

  it('excludes non-Workspace file types by default', () => {
    const m = bucketActivityByDay([
      activity({ targets: [{ driveItem: { name: 'items/png', mimeType: PNG } }] }),
    ]);
    expect(m.size).toBe(0);
  });

  it('uses timeRange.endTime when no single timestamp', () => {
    const m = bucketActivityByDay([
      activity({ timeRange: { startTime: '2026-06-08T23:00:00Z', endTime: '2026-06-10T01:00:00Z' } }),
    ]);
    expect(m.get('2026-06-10')).toBe(1);
  });

  it('returns an empty map for empty / nullish input', () => {
    expect(bucketActivityByDay([]).size).toBe(0);
    expect(bucketActivityByDay(null).size).toBe(0);
  });
});

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
