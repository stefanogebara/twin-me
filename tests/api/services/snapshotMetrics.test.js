/**
 * Tests for snapshot-metric classification and digit-blind dedup keys.
 *
 * Background (.claude/plans/2026-07-27-optmem-brain/README.md): the twin kept
 * asserting "40,000 unread emails" months after the fact. Two of the causes are
 * pinned here — a point-in-time reading was scored as a durable trait, and the
 * dedup key was digit-sensitive so every new value inserted a fresh row while
 * the old one was never retired.
 *
 * The load-bearing distinction: a SNAPSHOT reports mutable state at a moment
 * ("has N unread"), a TRANSITION reports something that actually happened
 * ("cleared N emails since yesterday"). Transitions stay durable; only
 * snapshots are demoted.
 */
import { describe, it, expect } from 'vitest';
import {
  isSnapshotMetric,
  snapshotMetricScore,
  stripDigitsForDedup,
  isSameMetricReading,
  buildMetricLikePattern,
  SNAPSHOT_METRIC_SCORE,
} from '../../../api/services/snapshotMetrics.js';

describe('isSnapshotMetric — point-in-time readings of mutable state', () => {
  it.each([
    'Has a backlog of 40000 unread emails in inbox',
    'Has a backlog of 40,448 unread emails in inbox',
    'Has a moderate pile of 34 unread emails in inbox',
    'Has 7 unread emails in inbox',
    'Reads 8% of incoming email (3200 of 40000 inbox messages read)',
    'Manages a very large mailbox (50 000+ messages)',
    'Manages a large mailbox (~40k messages)',
    'Android screen-on time in last 24h: 6.4 hours',
    'Unlocked phone 142 times today',
    'Phone battery very low (4%) — not charging',
    'Whoop stress score today: 71/100',
    'Music mood right now: restless and loud',
  ])('classifies as snapshot: %s', (content) => {
    expect(isSnapshotMetric(content)).toBe(true);
  });

  // Rolling-window aggregates observed in production. Each is recomputed every
  // cycle and describes current state, so an old copy is misleading.
  it.each([
    'Your GitHub 2026 activity: 6132 contributions — 5903 commits, 207 PRs, 0 reviews',
    'Receives email from 24 distinct senders/organizations in the past month',
    'Most frequent email senders this week: github.com (3), linkedin.com (2)',
    'Your email mix this week: dev 50%, work 25%, newsletter 15% — reveals attention',
    'YouTube subscription topics: Sport (13), Association football (12)',
    'YouTube subscription tenure: average 66 months, oldest 113 months',
    'Outlook inbox contains approximately 2,987 messages (large inbox)',
    'Committed code on 10 days in the last 30 days on GitHub',
  ])('classifies rolling aggregate as snapshot: %s', (content) => {
    expect(isSnapshotMetric(content)).toBe(true);
  });

  it.each([
    // Transitions/events — these are what we WANT the memory stream to keep.
    'Inbox grew by 12 unread emails since yesterday',
    'Cleared 300 unread emails from the inbox over the past 3 days',
    'Practices inbox zero — 0 unread emails in inbox',
    // A specific night's sleep happened and stays true; it is an event, not a
    // reading of current state, even though it quotes numbers and carries no
    // date of its own (the prompt renderer supplies the age).
    'Slept 7.1 hours (moderate sleep) — sleep performance 72%',
    'Sleep details: respiratory rate 17 breaths/min, 5 disturbances, consistency 40%',
    'Extended listening session (4 tracks recently)',
    // Durable traits and genuine events must never be demoted.
    'Prefers morning meetings and blocks focus time before 10am',
    'Shipped the payments refactor after three weeks of work',
    'Listened to Radiohead 14 times this week',
    'Had his first guitar lesson',
  ])('does not classify as snapshot: %s', (content) => {
    expect(isSnapshotMetric(content)).toBe(false);
  });

  it('tolerates empty and non-string input', () => {
    expect(isSnapshotMetric('')).toBe(false);
    expect(isSnapshotMetric(null)).toBe(false);
    expect(isSnapshotMetric(undefined)).toBe(false);
  });
});

describe('snapshotMetricScore — demotion below the platform_data floor', () => {
  it('scores snapshots below the platform_data importance floor of 6', () => {
    // The floor in memoryStreamService is 6; Tier 2 archival requires <= 4.
    // Anything at or above 5 stays unarchivable, so this bound is the point.
    expect(SNAPSHOT_METRIC_SCORE).toBeLessThanOrEqual(4);
    expect(snapshotMetricScore('Has a backlog of 40000 unread emails in inbox'))
      .toBe(SNAPSHOT_METRIC_SCORE);
  });

  it('returns null for content that is not a snapshot metric', () => {
    expect(snapshotMetricScore('Inbox grew by 12 unread emails since yesterday')).toBeNull();
    expect(snapshotMetricScore('Had his first guitar lesson')).toBeNull();
  });
});

describe('stripDigitsForDedup — digit-blind comparison key', () => {
  it('collapses the same metric reported with different values', () => {
    const a = stripDigitsForDedup('Has a backlog of 40,381 unread emails in inbox');
    const b = stripDigitsForDedup('Has a backlog of 40,448 unread emails in inbox');
    expect(a).toBe(b);
  });

  it('handles decimals and thousand separators', () => {
    expect(stripDigitsForDedup('Android screen-on time in last 24h: 6.4 hours'))
      .toBe(stripDigitsForDedup('Android screen-on time in last 24h: 11.2 hours'));
  });

  it('keeps genuinely different observations distinct', () => {
    const email = stripDigitsForDedup('Has a backlog of 40000 unread emails in inbox');
    const battery = stripDigitsForDedup('Phone battery very low (4%) — not charging');
    expect(email).not.toBe(battery);
  });

  it('does not collapse different subjects that share a shape', () => {
    expect(stripDigitsForDedup('Listened to Radiohead 14 times this week'))
      .not.toBe(stripDigitsForDedup('Listened to Aphex Twin 14 times this week'));
  });

  it('tolerates empty and non-string input', () => {
    expect(stripDigitsForDedup('')).toBe('');
    expect(stripDigitsForDedup(null)).toBe('');
    expect(stripDigitsForDedup(undefined)).toBe('');
  });
});

describe('isSameMetricReading — same metric, new value', () => {
  it('matches two readings of the same metric', () => {
    expect(isSameMetricReading(
      'Has a backlog of 40,381 unread emails in inbox',
      'Has a backlog of 40,448 unread emails in inbox',
    )).toBe(true);
  });

  it('matches across the urgency-adjective boundary', () => {
    // Crossing 50 flips the adjective, so the words differ — these are still
    // the same metric and must not both persist.
    expect(isSameMetricReading(
      'Has a moderate pile of 34 unread emails in inbox',
      'Has a backlog of 812 unread emails in inbox',
    )).toBe(true);
  });

  it('does not match different metrics', () => {
    expect(isSameMetricReading(
      'Has a backlog of 40000 unread emails in inbox',
      'Whoop stress score today: 71/100',
    )).toBe(false);
  });

  it('does not match when either side is not a snapshot metric', () => {
    // Transitions are durable — two different clearing events are two events.
    expect(isSameMetricReading(
      'Cleared 12 unread emails from the inbox since yesterday',
      'Cleared 300 unread emails from the inbox since yesterday',
    )).toBe(false);
  });

  it('does not match unrelated observations that merely share digits', () => {
    expect(isSameMetricReading(
      'Listened to Radiohead 14 times this week',
      'Listened to Aphex Twin 14 times this week',
    )).toBe(false);
  });
});

describe('buildMetricLikePattern — SQL LIKE key for finding a prior reading', () => {
  // Contract changed deliberately: the pattern used to be DERIVED from the
  // content by wildcarding digit runs. That left every varying WORD embedded
  // literally, so a mood change or Gmail's urgency adjective flipping at 50 meant
  // the prior row was never found and the in-place refresh silently never fired.
  // It also fed attacker-influenced text into a query filter. Each metric now
  // carries a fixed LIKE literal; the JS recheck still decides.

  it('returns a fixed literal that matches sibling readings, not the exact text', () => {
    expect(buildMetricLikePattern('Has a backlog of 40,381 unread emails in inbox'))
      .toBe('Has %unread emails in inbox%');
    // Crucially the SAME pattern for a reading whose adjective differs.
    expect(buildMetricLikePattern('Has a moderate pile of 34 unread emails in inbox'))
      .toBe('Has %unread emails in inbox%');
  });

  it('escapes a literal percent so it is not treated as a wildcard', () => {
    // In a JS string '\%' collapses to '%', which would make the literal percent
    // in "Reads 8% of incoming email" act as a wildcard.
    const pattern = buildMetricLikePattern('Reads 8% of incoming email (3200 of 40000 inbox messages read)');
    // Built from char codes so the assertion cannot suffer the same collapse it
    // is testing for: the pattern must contain a real backslash before the %.
    const BACKSLASH = String.fromCharCode(92);
    expect(pattern).toBe(`Reads %${BACKSLASH}% of incoming email%`);
    expect(pattern).toContain(BACKSLASH + '%');
  });

  it('matches sibling readings whose varying part is a word, not a number', () => {
    const a = buildMetricLikePattern('Music mood right now: melancholy, low energy (valence 21%, energy 30%)');
    const b = buildMetricLikePattern('Music mood right now: upbeat, high energy (valence 81%, energy 90%)');
    expect(a).toBe('Music mood right now:%');
    expect(a).toBe(b);
  });

  it('does not require digits — a metric can vary purely in wording', () => {
    // The old derived version bailed out with no digits to generalise over,
    // which excluded exactly the metrics that change most.
    expect(buildMetricLikePattern('Music mood right now: restless and loud'))
      .toBe('Music mood right now:%');
  });

  it('returns null for non-snapshot content', () => {
    expect(buildMetricLikePattern('Inbox grew by 12 unread emails since yesterday')).toBeNull();
    expect(buildMetricLikePattern('Had his first guitar lesson')).toBeNull();
  });
});
