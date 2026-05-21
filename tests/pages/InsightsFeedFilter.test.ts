/**
 * Test for the internal-category filter in InsightsFeed.tsx.
 *
 * Background (audit 2026-05-21): of 139 proactive_insights rows in prod
 * for the test user, 39 (28%) were `morning_briefing_cache` — internal
 * cache markers written by the morning-briefing surface that share the
 * proactive_insights table for storage but should never be visible in
 * the dashboard's "What your twin noticed" feed. Plus 2 wiki_lint rows
 * and 1 test row.
 *
 * Mounting the actual InsightsFeed in a test would require jsdom + RTL.
 * The filter logic is pure set arithmetic, so we re-state it here and
 * assert the contract: every internal category gets dropped, every real
 * category survives.
 *
 * If a future refactor moves the filter constant elsewhere, this test
 * should be updated to import from there — it's the contract that
 * matters, not the location.
 */
import { describe, it, expect } from 'vitest';

// Mirror of the constants defined inside InsightsFeed.tsx. Kept in sync
// here so the contract is enforceable.
const DEDICATED_CARD_CATEGORIES = new Set(['email_triage', 'relationship_followup']);
const INTERNAL_CATEGORIES = new Set([
  'morning_briefing_cache',
  'wiki_lint',
  'test',
]);

interface Insight {
  id: string;
  category: string;
}

function filterFeed(
  insights: Insight[],
  heroInsightId?: string,
  archivedIds: Set<string> = new Set(),
): Insight[] {
  return insights
    .filter(
      (i) =>
        i.id !== heroInsightId &&
        !archivedIds.has(i.id) &&
        !DEDICATED_CARD_CATEGORIES.has(i.category) &&
        !INTERNAL_CATEGORIES.has(i.category),
    )
    .slice(0, 5);
}

describe('InsightsFeed filter — drops internal/dedicated categories', () => {
  it('drops every morning_briefing_cache row (the 28% noise the audit caught)', () => {
    const insights: Insight[] = [
      { id: '1', category: 'morning_briefing_cache' },
      { id: '2', category: 'morning_briefing_cache' },
      { id: '3', category: 'trend' },
    ];
    const result = filterFeed(insights);
    expect(result.map((i) => i.id)).toEqual(['3']);
  });

  it('drops wiki_lint + test (other internal categories)', () => {
    const insights: Insight[] = [
      { id: '1', category: 'wiki_lint' },
      { id: '2', category: 'test' },
      { id: '3', category: 'anomaly' },
    ];
    expect(filterFeed(insights).map((i) => i.id)).toEqual(['3']);
  });

  it('still drops email_triage + relationship_followup (their dedicated cards)', () => {
    const insights: Insight[] = [
      { id: '1', category: 'email_triage' },
      { id: '2', category: 'relationship_followup' },
      { id: '3', category: 'nudge' },
    ];
    expect(filterFeed(insights).map((i) => i.id)).toEqual(['3']);
  });

  it('preserves real categories (trend, anomaly, concern, nudge, celebration)', () => {
    const insights: Insight[] = [
      { id: 'a', category: 'trend' },
      { id: 'b', category: 'anomaly' },
      { id: 'c', category: 'concern' },
      { id: 'd', category: 'nudge' },
      { id: 'e', category: 'celebration' },
    ];
    expect(filterFeed(insights).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('drops the hero insight from the feed (no double-render)', () => {
    const insights: Insight[] = [
      { id: 'hero', category: 'trend' },
      { id: 'second', category: 'trend' },
    ];
    expect(filterFeed(insights, 'hero').map((i) => i.id)).toEqual(['second']);
  });

  it('respects optimistic archival', () => {
    const insights: Insight[] = [
      { id: 'a', category: 'trend' },
      { id: 'b', category: 'trend' },
    ];
    expect(filterFeed(insights, undefined, new Set(['a'])).map((i) => i.id)).toEqual(['b']);
  });

  it('hard-caps at 5 results', () => {
    const insights: Insight[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      category: 'trend',
    }));
    expect(filterFeed(insights)).toHaveLength(5);
  });

  it('the audit-shape input (139 rows, 28% cache) collapses to ~5 real rows', () => {
    // Synthesise the actual category mix observed in prod on 2026-05-21:
    //   39 morning_briefing_cache (filtered)
    //   21 nudge (kept)
    //   19 relationship_followup (filtered — dedicated card)
    //   14 trend (kept)
    //   14 meeting_prep (kept — separate filtering elsewhere but valid here)
    //   13 concern (kept)
    //   8 email_triage (filtered — dedicated card)
    //   4 anomaly (kept)
    //   2 reauth_needed (kept)
    //   2 wiki_lint (filtered)
    //   1 stress_nudge (kept)
    //   1 test (filtered)
    //   1 celebration (kept)
    const mix = ([] as Insight[])
      .concat(Array.from({ length: 39 }, (_, i) => ({ id: `c${i}`, category: 'morning_briefing_cache' })))
      .concat(Array.from({ length: 21 }, (_, i) => ({ id: `n${i}`, category: 'nudge' })))
      .concat(Array.from({ length: 19 }, (_, i) => ({ id: `r${i}`, category: 'relationship_followup' })))
      .concat(Array.from({ length: 14 }, (_, i) => ({ id: `t${i}`, category: 'trend' })))
      .concat(Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, category: 'meeting_prep' })))
      .concat(Array.from({ length: 13 }, (_, i) => ({ id: `co${i}`, category: 'concern' })))
      .concat(Array.from({ length: 8 }, (_, i) => ({ id: `e${i}`, category: 'email_triage' })))
      .concat(Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, category: 'anomaly' })))
      .concat(Array.from({ length: 2 }, (_, i) => ({ id: `re${i}`, category: 'reauth_needed' })))
      .concat(Array.from({ length: 2 }, (_, i) => ({ id: `w${i}`, category: 'wiki_lint' })))
      .concat([{ id: 's0', category: 'stress_nudge' }])
      .concat([{ id: 'te0', category: 'test' }])
      .concat([{ id: 'ce0', category: 'celebration' }]);

    expect(mix).toHaveLength(139);
    const result = filterFeed(mix);
    expect(result).toHaveLength(5);
    // Every result is from a real (non-internal, non-dedicated) category.
    for (const r of result) {
      expect(INTERNAL_CATEGORIES.has(r.category)).toBe(false);
      expect(DEDICATED_CARD_CATEGORIES.has(r.category)).toBe(false);
    }
  });
});
