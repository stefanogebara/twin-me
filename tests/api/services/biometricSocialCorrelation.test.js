/**
 * Tests for the PURE core of the stress leaderboard — the correlation math,
 * privacy masking, and candidate text. The I/O gather + orchestrator are glue
 * verified live (canary); the math is where bugs hide, so it's pinned here.
 */
import { describe, it, expect } from 'vitest';
import {
  computeStressLeaderboard,
  firstName,
  buildCandidate,
  MIN_MEETING_DAYS,
} from '../../../api/services/biometricSocialCorrelation.js';

const PERSON = { alex: 'alex@co', sam: 'sam@co', zoe: 'zoe@co' };

/** Build a deterministic 25-day dataset where Alex reliably precedes stress. */
function dataset() {
  const days = [];
  const push = (n, bio, people, load) => {
    for (let i = 0; i < n; i++) days.push({ date: `d${days.length}`, ...bio, people, load });
  };
  // 6 Alex days: low recovery, low HRV, high resting HR
  push(6, { recovery: 45, hrv: 45, restingHr: 62 }, [{ id: PERSON.alex, name: 'Alex Reis' }], 3);
  // 6 Sam days: neutral
  push(6, { recovery: 70, hrv: 60, restingHr: 55 }, [{ id: PERSON.sam, name: 'Sam' }], 1);
  // 2 Zoe days: below MIN_MEETING_DAYS -> must be excluded
  push(2, { recovery: 50, hrv: 50, restingHr: 58 }, [{ id: PERSON.zoe, name: 'Zoe' }], 1);
  // 11 baseline days: no people
  push(11, { recovery: 72, hrv: 62, restingHr: 54 }, [], 0);
  return days;
}

describe('computeStressLeaderboard', () => {
  it('ranks the genuine stressor first with the right sign', () => {
    const { top, board } = computeStressLeaderboard(dataset());
    expect(top).not.toBeNull();
    expect(top.id).toBe(PERSON.alex);
    expect(top.stressEffect).toBeGreaterThan(0.5);
    expect(top.recoveryDeltaPts).toBeGreaterThan(0);    // recovery lower on Alex days
    expect(top.restingHrDeltaBpm).toBeGreaterThan(0);   // resting HR higher on Alex days
    // Sam scored but is not the stressor; Zoe excluded (n < MIN_MEETING_DAYS)
    expect(board.find((p) => p.id === PERSON.sam)).toBeDefined();
    expect(board.find((p) => p.id === PERSON.zoe)).toBeUndefined();
  });

  it('excludes people below the meeting-day floor', () => {
    const { board } = computeStressLeaderboard(dataset());
    for (const p of board) expect(p.n).toBeGreaterThanOrEqual(MIN_MEETING_DAYS);
  });

  it('surfaces nothing when no effect clears the floor (flat data)', () => {
    const flat = Array.from({ length: 20 }, (_, i) => ({
      date: `d${i}`, recovery: 65, hrv: 58, restingHr: 56,
      people: [{ id: PERSON.sam, name: 'Sam' }], load: 1,
    }));
    const { top } = computeStressLeaderboard(flat);
    expect(top).toBeNull();
  });

  it('returns empty on too-few days', () => {
    expect(computeStressLeaderboard([]).top).toBeNull();
    expect(computeStressLeaderboard(Array(5).fill({ recovery: 50, people: [], load: 0 })).board).toEqual([]);
  });

  it('flags the busy-day confound', () => {
    // "busy" only appears on high-load days; everyone else is low load.
    const days = [];
    for (let i = 0; i < 6; i++) days.push({ date: `b${i}`, recovery: 48, hrv: 46, restingHr: 60, people: [{ id: 'busy@co', name: 'Busy' }], load: 9 });
    for (let i = 0; i < 14; i++) days.push({ date: `n${i}`, recovery: 71, hrv: 61, restingHr: 54, people: [], load: 0 });
    const { top } = computeStressLeaderboard(days);
    expect(top?.id).toBe('busy@co');
    expect(top.confoundLikely).toBe(true);
  });
});

describe('firstName (privacy)', () => {
  it('takes a first name, never the raw email', () => {
    expect(firstName('Alex Reis', 'alex.reis@co')).toBe('Alex');
    expect(firstName(null, 'maria.silva@co')).toBe('Maria');
    expect(firstName('', 'jp_santos@co')).toBe('Jp');
    expect(firstName('Alex Reis', 'alex@co')).not.toMatch(/@/);
  });
  it('falls back gracefully with no usable identity', () => {
    expect(firstName(null, '')).toBe('someone you meet often');
  });
});

describe('buildCandidate', () => {
  it('names one person by first name and states the real deltas', () => {
    const top = { id: PERSON.alex, name: 'Alex Reis', n: 6, stressEffect: 2.1, recoveryDeltaPts: 24, restingHrDeltaBpm: 7, confoundLikely: false };
    const c = buildCandidate(top);
    expect(c).toContain('Alex');
    expect(c).not.toContain('@');
    expect(c).toMatch(/recovery averages 24 points lower/);
    expect(c).toMatch(/resting heart rate runs 7 bpm higher/);
    expect(c).not.toMatch(/busier days/); // no confound hedge when false
  });
  it('adds the confound hedge when flagged', () => {
    const top = { id: 'busy@co', name: 'Busy', n: 6, stressEffect: 1.2, recoveryDeltaPts: 20, restingHrDeltaBpm: 5, confoundLikely: true };
    expect(buildCandidate(top)).toMatch(/busier days/);
  });
  it('returns null for no top', () => {
    expect(buildCandidate(null)).toBeNull();
  });
});
