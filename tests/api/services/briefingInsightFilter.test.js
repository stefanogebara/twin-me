/**
 * Tests for filterBriefingInsights (api/services/briefingInsightFilter.js).
 *
 * replan-2026-06-10 Track B: the morning briefing re-dumped raw
 * proactive_insights rows of ANY category (meeting_prep headlines, reauth
 * notices, email triage drafts) and repeated yesterday's rows verbatim.
 * This pure filter is the editorial gate: category whitelist, no
 * re-delivery across briefings, hard cap of 3 items.
 */
import { describe, it, expect } from 'vitest';
import {
  filterBriefingInsights,
  BRIEFING_CATEGORY_WHITELIST,
  BRIEFING_MAX_INSIGHTS,
} from '../../../api/services/briefingInsightFilter.js';

const row = (overrides = {}) => ({
  id: 'id-' + Math.random().toString(36).slice(2, 8),
  insight: 'Some insight text',
  category: 'trend',
  urgency: 'medium',
  metadata: null,
  ...overrides,
});

describe('filterBriefingInsights', () => {
  describe('category whitelist', () => {
    it('keeps exactly nudge, celebration, trend, concern', () => {
      const rows = [
        row({ category: 'nudge' }),
        row({ category: 'celebration' }),
        row({ category: 'trend' }),
        row({ category: 'concern' }),
      ];
      expect(filterBriefingInsights(rows)).toHaveLength(3); // capped, see below
      expect(filterBriefingInsights(rows, { limit: 10 })).toHaveLength(4);
    });

    it('drops operational categories (the observed prod re-dump)', () => {
      const rows = [
        row({ category: 'meeting_prep', insight: 'Meeting prep for "Murilo Personal"' }),
        row({ category: 'reauth_needed', insight: 'Your Spotify connection expired. Reconnect...' }),
        row({ category: 'email_triage' }),
        row({ category: 'morning_briefing_cache' }),
        row({ category: 'briefing' }),
        row({ category: 'briefing_email' }),
      ];
      expect(filterBriefingInsights(rows)).toEqual([]);
    });

    it('drops unknown and missing categories', () => {
      expect(filterBriefingInsights([row({ category: 'something_new' }), row({ category: undefined })]))
        .toEqual([]);
    });
  });

  describe('no re-delivery across briefings', () => {
    it('excludes rows already delivered in a previous briefing', () => {
      const fresh = row({ category: 'nudge' });
      const stale = row({ category: 'nudge', metadata: { delivered_in_briefing: true } });
      expect(filterBriefingInsights([stale, fresh])).toEqual([fresh]);
    });

    it('keeps rows with null, missing, or unrelated metadata', () => {
      const rows = [
        row({ category: 'trend', metadata: null }),
        row({ category: 'trend', metadata: undefined }),
        row({ category: 'trend', metadata: { theme: 'email-backlog' } }),
        row({ category: 'trend', metadata: { delivered_in_briefing: false } }),
      ];
      expect(filterBriefingInsights(rows, { limit: 10 })).toHaveLength(4);
    });
  });

  describe('cap', () => {
    it('caps at 3 items by default, preserving input order', () => {
      const rows = [
        row({ category: 'concern', insight: 'first' }),
        row({ category: 'trend', insight: 'second' }),
        row({ category: 'nudge', insight: 'third' }),
        row({ category: 'celebration', insight: 'fourth' }),
      ];
      const result = filterBriefingInsights(rows);
      expect(result.map(r => r.insight)).toEqual(['first', 'second', 'third']);
      expect(BRIEFING_MAX_INSIGHTS).toBe(3);
    });

    it('applies the cap AFTER filtering, so blocked rows do not eat slots', () => {
      const rows = [
        row({ category: 'meeting_prep' }),
        row({ category: 'reauth_needed' }),
        row({ category: 'nudge', insight: 'a' }),
        row({ category: 'trend', insight: 'b' }),
        row({ category: 'concern', insight: 'c' }),
      ];
      expect(filterBriefingInsights(rows).map(r => r.insight)).toEqual(['a', 'b', 'c']);
    });

    it('respects a custom limit', () => {
      const rows = [row({ category: 'nudge' }), row({ category: 'trend' })];
      expect(filterBriefingInsights(rows, { limit: 1 })).toHaveLength(1);
    });
  });

  describe('input safety', () => {
    it('returns [] for non-array input', () => {
      expect(filterBriefingInsights(null)).toEqual([]);
      expect(filterBriefingInsights(undefined)).toEqual([]);
      expect(filterBriefingInsights('not-rows')).toEqual([]);
    });

    it('drops null and non-object entries', () => {
      expect(filterBriefingInsights([null, undefined, 42, row({ category: 'nudge' })]))
        .toHaveLength(1);
    });
  });

  it('exports the whitelist for query-level narrowing', () => {
    expect(BRIEFING_CATEGORY_WHITELIST).toEqual(['nudge', 'celebration', 'trend', 'concern']);
  });
});
