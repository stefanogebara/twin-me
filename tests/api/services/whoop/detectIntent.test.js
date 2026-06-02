/**
 * Tests for whoop/detectIntent.js.
 *
 * The detector is a regex classifier — these tests are the spec. If a
 * test fails, either the regex is wrong or the intended routing has
 * changed and the spec needs updating to match.
 */

import { describe, it, expect } from 'vitest';
import { detectWhoopIntent } from '../../../../api/services/whoop/detectIntent.js';

describe('detectWhoopIntent', () => {
  // -------------------------------------------------------------------------
  // null — nothing Whoop-related
  // -------------------------------------------------------------------------
  describe('null intent', () => {
    it('returns null for empty input', () => {
      expect(detectWhoopIntent('')).toEqual({ kind: null });
    });
    it('returns null for whitespace', () => {
      expect(detectWhoopIntent('   ')).toEqual({ kind: null });
    });
    it('returns null for a non-Whoop question', () => {
      expect(detectWhoopIntent('what should I cook for dinner?')).toEqual({ kind: null });
    });
    it('returns null when "vs" appears without a Whoop noun', () => {
      // "I prefer cats vs dogs" should NOT match compare.
      expect(detectWhoopIntent('I prefer cats vs dogs')).toEqual({ kind: null });
    });
    it('returns null when "trending" appears without a Whoop noun', () => {
      expect(detectWhoopIntent('this stock is trending up')).toEqual({ kind: null });
    });
    it('returns null when "last week" appears without a Whoop noun', () => {
      expect(detectWhoopIntent('what did I do last week')).toEqual({ kind: null });
    });
  });

  // -------------------------------------------------------------------------
  // snapshot — lowest-bar Whoop intent
  // -------------------------------------------------------------------------
  describe('snapshot', () => {
    it('matches a bare "how is my recovery?" question', () => {
      expect(detectWhoopIntent('how is my recovery?')).toEqual({ kind: 'snapshot' });
    });
    it('matches "should I push it today?" via the today/strain frame', () => {
      // "today" alone doesn't fire; but with strain noun it does.
      expect(detectWhoopIntent('should I push it today given my strain?')).toEqual({
        kind: 'snapshot',
      });
    });
    it('matches "what is my HRV"', () => {
      expect(detectWhoopIntent('what is my HRV')).toEqual({ kind: 'snapshot' });
    });
    it('matches "rhr right now"', () => {
      expect(detectWhoopIntent('rhr right now')).toEqual({ kind: 'snapshot' });
    });
    it('matches "how did I sleep"', () => {
      expect(detectWhoopIntent('how did I sleep')).toEqual({ kind: 'snapshot' });
    });
    it('matches a vague Whoop-tagged question', () => {
      expect(detectWhoopIntent('what does whoop say?')).toEqual({ kind: 'snapshot' });
    });
  });

  // -------------------------------------------------------------------------
  // weekly
  // -------------------------------------------------------------------------
  describe('weekly', () => {
    it('matches "how was my recovery last week"', () => {
      const result = detectWhoopIntent('how was my recovery last week');
      expect(result.kind).toBe('weekly');
      expect(result.weekStart).toBe('last week');
    });
    it('matches "show me my sleep this week"', () => {
      const result = detectWhoopIntent('show me my sleep this week');
      expect(result.kind).toBe('weekly');
      expect(result.weekStart).toBe('this week');
    });
    it('matches "weekly recovery summary"', () => {
      const result = detectWhoopIntent('weekly recovery summary');
      expect(result.kind).toBe('weekly');
    });
    it('matches "past 7 days of sleep"', () => {
      const result = detectWhoopIntent('past 7 days of sleep');
      expect(result.kind).toBe('weekly');
      expect(result.weekStart).toBe('last week');
    });
    it('does NOT match "next week" — only this/last/past', () => {
      // "next week" + Whoop noun should fall through to snapshot.
      const result = detectWhoopIntent('will my recovery be good next week');
      expect(result.kind).toBe('snapshot');
    });
  });

  // -------------------------------------------------------------------------
  // trend
  // -------------------------------------------------------------------------
  describe('trend', () => {
    it('matches "is my recovery trending up?"', () => {
      const result = detectWhoopIntent('is my recovery trending up?');
      expect(result.kind).toBe('trend');
      expect(result.metric).toBe('recovery');
      expect(result.days).toBe(30);
    });
    it('matches "what is my HRV trend"', () => {
      const result = detectWhoopIntent('what is my HRV trend');
      expect(result.kind).toBe('trend');
      expect(result.metric).toBe('hrv');
    });
    it('matches "is my sleep improving"', () => {
      const result = detectWhoopIntent('is my sleep improving');
      expect(result.kind).toBe('trend');
      expect(result.metric).toBe('sleep_duration');
    });
    it('matches "is my sleep performance declining"', () => {
      const result = detectWhoopIntent('is my sleep performance declining');
      expect(result.kind).toBe('trend');
      expect(result.metric).toBe('sleep_performance');
    });
    it('matches "rhr getting worse"', () => {
      const result = detectWhoopIntent('is my rhr getting worse');
      expect(result.kind).toBe('trend');
      expect(result.metric).toBe('rhr');
    });
    it('matches "strain over the last month"', () => {
      const result = detectWhoopIntent('how does my strain look over the last month');
      expect(result.kind).toBe('trend');
      expect(result.metric).toBe('strain');
      expect(result.days).toBe(30);
    });
    it('extracts days from "over the last 14 days"', () => {
      const result = detectWhoopIntent('how is my recovery over the last 14 days');
      expect(result.kind).toBe('trend');
      expect(result.days).toBe(14);
    });
    it('extracts days from "over the past 2 weeks"', () => {
      const result = detectWhoopIntent('how is my hrv over the past 2 weeks');
      expect(result.kind).toBe('trend');
      expect(result.days).toBe(14);
    });
    it('extracts days from "over the last 3 months"', () => {
      const result = detectWhoopIntent('how is my strain over the last 3 months');
      expect(result.kind).toBe('trend');
      expect(result.days).toBe(90);
    });
    it('defaults metric to recovery when none specified but trend signal present', () => {
      // Hard case — "how am I trending" with a Whoop noun is enough.
      const result = detectWhoopIntent('how is my whoop trending');
      expect(result.kind).toBe('trend');
      expect(result.metric).toBe('recovery');
    });
  });

  // -------------------------------------------------------------------------
  // compare
  // -------------------------------------------------------------------------
  describe('compare', () => {
    it('matches "this week vs last week" for a Whoop metric', () => {
      const result = detectWhoopIntent('how is my recovery this week vs last week');
      expect(result.kind).toBe('compare');
      expect(result.periodA).toBe('last week');
      expect(result.periodB).toBe('this week');
      expect(result.metric).toBe('recovery');
    });
    it('matches "this month vs last month"', () => {
      const result = detectWhoopIntent('compare my sleep this month vs last month');
      expect(result.kind).toBe('compare');
      expect(result.periodA).toBe('last month');
      expect(result.periodB).toBe('this month');
    });
    it('matches "compared to last week"', () => {
      const result = detectWhoopIntent('how is my hrv compared to last week');
      expect(result.kind).toBe('compare');
      expect(result.periodB).toBe('last week');
    });
    it('matches "better than last month" for strain', () => {
      const result = detectWhoopIntent('is my strain better than last month');
      expect(result.kind).toBe('compare');
      expect(result.metric).toBe('strain');
    });
    it('matches "versus" spelling', () => {
      const result = detectWhoopIntent('recovery this week versus last week');
      expect(result.kind).toBe('compare');
    });
    it('falls back to snapshot when "compare" appears but no period names found', () => {
      // "compare my recovery" — no two periods named — should NOT be a
      // broken compare. With no trend or weekly signal either, the
      // detector falls through to snapshot (today's data is enough).
      const result = detectWhoopIntent('compare my recovery');
      expect(result.kind).toBe('snapshot');
    });
    it('does NOT match "compare" without a Whoop noun', () => {
      expect(detectWhoopIntent('compare these two recipes')).toEqual({ kind: null });
    });
  });

  // -------------------------------------------------------------------------
  // Priority — compare > trend > weekly > snapshot
  // -------------------------------------------------------------------------
  describe('priority order', () => {
    it('chooses compare when both compare AND weekly signals are present', () => {
      // "this week vs last week" has BOTH the weekly signal ("this week")
      // and the compare signal ("vs"). Compare wins.
      const result = detectWhoopIntent('recovery this week vs last week');
      expect(result.kind).toBe('compare');
    });
    it('chooses trend when both trend AND weekly signals are present', () => {
      // "trending this week" has both — trend wins.
      const result = detectWhoopIntent('how is my recovery trending this week');
      expect(result.kind).toBe('trend');
    });
    it('chooses weekly when both weekly AND snapshot signals are present', () => {
      // "this week" + "recovery" — weekly wins over snapshot.
      const result = detectWhoopIntent('how is my recovery this week');
      expect(result.kind).toBe('weekly');
    });
  });

  // -------------------------------------------------------------------------
  // Metric extraction priority — "sleep performance" beats "sleep"
  // -------------------------------------------------------------------------
  describe('metric extraction priority', () => {
    it('"sleep performance" beats plain "sleep"', () => {
      const result = detectWhoopIntent('how is my sleep performance trending');
      expect(result.metric).toBe('sleep_performance');
    });
    it('"resting heart rate" beats plain "heart rate"', () => {
      const result = detectWhoopIntent('how is my resting heart rate trending');
      expect(result.metric).toBe('rhr');
    });
    it('"hrv" matches abbreviation', () => {
      const result = detectWhoopIntent('hrv trend over the past 30 days');
      expect(result.metric).toBe('hrv');
    });
  });

  // -------------------------------------------------------------------------
  // Defensive — nullish inputs, unicode, etc.
  // -------------------------------------------------------------------------
  describe('defensive', () => {
    it('returns null for undefined input', () => {
      expect(detectWhoopIntent(undefined)).toEqual({ kind: null });
    });
    it('returns null for null input', () => {
      expect(detectWhoopIntent(null)).toEqual({ kind: null });
    });
    it('is case-insensitive', () => {
      const result = detectWhoopIntent('HOW IS MY RECOVERY TRENDING');
      expect(result.kind).toBe('trend');
    });
    it('handles long surrounding context', () => {
      const long = `Hey, I had a really intense week at work and I'm wondering — is my recovery trending up or down over the past 14 days?`;
      const result = detectWhoopIntent(long);
      expect(result.kind).toBe('trend');
      expect(result.metric).toBe('recovery');
      expect(result.days).toBe(14);
    });
  });
});
