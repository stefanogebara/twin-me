/**
 * Unit tests for category-level insight suppression (replan-2026-06-10
 * Track A item 3): generation must finally READ the engagement signals the
 * proactive_insights table already collects.
 *
 * Rows mirror the GET /insights/proactive/engagement-stats query shape:
 *   .select('category, urgency, engaged, delivered') over the last 30 days.
 */
import { describe, it, expect } from 'vitest';
import {
  computeCategorySuppression,
  buildSuppressionPromptSection,
  SUPPRESS_MIN_SHOWN,
  AVOID_MIN_SHOWN,
} from '../../api/services/insightSuppression.js';

function rows(category, { shown = 0, engaged = 0, undelivered = 0 } = {}) {
  const out = [];
  for (let i = 0; i < shown; i++) {
    out.push({ category, urgency: 'low', engaged: i < engaged, delivered: true });
  }
  for (let i = 0; i < undelivered; i++) {
    out.push({ category, urgency: 'low', engaged: false, delivered: false });
  }
  return out;
}

describe('computeCategorySuppression', () => {
  it('hard-suppresses a category shown >= 8 times with zero engagement', () => {
    const result = computeCategorySuppression(rows('nudge', { shown: 8 }));
    expect(result.suppressed).toEqual(['nudge']);
    expect(result.avoid).toEqual([]);
  });

  it('soft-flags (avoid) a category shown 4-7 times with zero engagement', () => {
    const result = computeCategorySuppression(rows('meeting_prep', { shown: 5 }));
    expect(result.suppressed).toEqual([]);
    expect(result.avoid).toEqual(['meeting_prep']);
  });

  it('never suppresses a category with at least one engagement', () => {
    const result = computeCategorySuppression(rows('trend', { shown: 20, engaged: 1 }));
    expect(result.suppressed).toEqual([]);
    expect(result.avoid).toEqual([]);
  });

  it('undelivered rows do not count as shown', () => {
    // 6 generated-but-never-delivered + 3 delivered: the user only ever SAW 3.
    const result = computeCategorySuppression(rows('concern', { shown: 3, undelivered: 6 }));
    expect(result.suppressed).toEqual([]);
    expect(result.avoid).toEqual([]);
  });

  it('handles empty/missing input and rows without a category', () => {
    expect(computeCategorySuppression([]).suppressed).toEqual([]);
    expect(computeCategorySuppression(null).suppressed).toEqual([]);
    expect(computeCategorySuppression([{ category: null, engaged: false, delivered: true }]).suppressed).toEqual([]);
  });

  it('classifies multiple categories independently', () => {
    const result = computeCategorySuppression([
      ...rows('nudge', { shown: 12 }),            // hard suppress
      ...rows('celebration', { shown: 4 }),       // soft avoid
      ...rows('trend', { shown: 9, engaged: 2 }), // engaged: untouched
    ]);
    expect(result.suppressed).toEqual(['nudge']);
    expect(result.avoid).toEqual(['celebration']);
  });

  it('thresholds are exact boundaries', () => {
    const atSuppress = computeCategorySuppression(rows('nudge', { shown: SUPPRESS_MIN_SHOWN }));
    expect(atSuppress.suppressed).toEqual(['nudge']);

    const belowSuppress = computeCategorySuppression(rows('nudge', { shown: SUPPRESS_MIN_SHOWN - 1 }));
    expect(belowSuppress.suppressed).toEqual([]);
    expect(belowSuppress.avoid).toEqual(['nudge']);

    const belowAvoid = computeCategorySuppression(rows('nudge', { shown: AVOID_MIN_SHOWN - 1 }));
    expect(belowAvoid.avoid).toEqual([]);
  });
});

describe('buildSuppressionPromptSection', () => {
  it('returns empty string when nothing is suppressed or avoided', () => {
    expect(buildSuppressionPromptSection({ suppressed: [], avoid: [] })).toBe('');
  });

  it('lists both suppressed and avoided categories for the LLM', () => {
    const section = buildSuppressionPromptSection({ suppressed: ['nudge'], avoid: ['celebration'] });
    expect(section).toContain('nudge');
    expect(section).toContain('celebration');
    expect(section.toLowerCase()).toContain('avoid');
    expect(section.toLowerCase()).toContain('urgent');
  });
});
