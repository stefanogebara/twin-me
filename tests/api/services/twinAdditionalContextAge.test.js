/**
 * The context block used to render observations with no date at all, under a
 * header reading "[USER DATA - factual observations about this person]", while
 * the system prompt separately instructs the twin to prefer specific numbers.
 * A snapshot taken in March was therefore presented in July as a present-tense
 * fact — which is how "40,000 unread emails" kept being asserted as current.
 *
 * These tests pin the age prefix. See Phase 0 item 5 in
 * .claude/plans/2026-07-27-optmem-brain/README.md.
 */
import { describe, it, expect } from 'vitest';
import {
  formatAge,
  formatObservations,
  formatReflections,
} from '../../../api/services/twinAdditionalContext.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function ago(ms) {
  return new Date(Date.now() - ms).toISOString();
}

describe('formatAge', () => {
  it('reports sub-hour ages as just now', () => {
    expect(formatAge(ago(10 * 60 * 1000))).toBe('just now');
  });

  it('reports hours', () => {
    expect(formatAge(ago(5 * HOUR))).toBe('5 hours ago');
    expect(formatAge(ago(1 * HOUR))).toBe('1 hour ago');
  });

  it('reports days', () => {
    expect(formatAge(ago(3 * DAY))).toBe('3 days ago');
    expect(formatAge(ago(1 * DAY))).toBe('1 day ago');
  });

  it('reports weeks', () => {
    expect(formatAge(ago(21 * DAY))).toBe('3 weeks ago');
  });

  it('reports months for anything older', () => {
    expect(formatAge(ago(120 * DAY))).toBe('4 months ago');
  });

  it('returns null when there is no usable timestamp rather than inventing one', () => {
    expect(formatAge(null)).toBeNull();
    expect(formatAge(undefined)).toBeNull();
    expect(formatAge('not-a-date')).toBeNull();
  });
});

describe('formatObservations — age prefix', () => {
  // High alpha so the certainty hedge does not interfere with these assertions.
  const strong = { confidence: 0.9, importance_score: 8, retrieval_count: 2 };

  it('prefixes each observation with how old it is', () => {
    const out = formatObservations([
      { ...strong, content: 'Has a backlog of 40000 unread emails in inbox', created_at: ago(120 * DAY) },
    ]);
    expect(out).toBe('- [4 months ago] Has a backlog of 40000 unread emails in inbox');
  });

  it('marks a fresh observation as such', () => {
    const out = formatObservations([
      { ...strong, content: 'Cleared 12 unread emails from the inbox', created_at: ago(2 * HOUR) },
    ]);
    expect(out).toBe('- [2 hours ago] Cleared 12 unread emails from the inbox');
  });

  it('omits the prefix entirely when the timestamp is missing', () => {
    const out = formatObservations([{ ...strong, content: 'Prefers morning meetings' }]);
    expect(out).toBe('- Prefers morning meetings');
  });

  it('keeps the certainty hedge alongside the age', () => {
    const weak = { confidence: 0.4, importance_score: 3, retrieval_count: 0 };
    const out = formatObservations([
      { ...weak, content: 'Whoop stress score today: 71/100', created_at: ago(40 * DAY) },
    ]);
    expect(out).toContain('[1 month ago]');
    expect(out).toContain('(less certain)');
  });

  it('returns an empty string for no observations', () => {
    expect(formatObservations([])).toBe('');
  });
});

describe('formatReflections — age prefix', () => {
  const strong = { confidence: 0.9, importance_score: 9, retrieval_count: 2 };

  it('dates a reflection alongside its expert label', () => {
    const out = formatReflections([
      {
        ...strong,
        content: 'Overwhelmed by an enormous email backlog',
        created_at: ago(90 * DAY),
        metadata: { expertName: 'Lifestyle Analyst' },
      },
    ]);
    expect(out).toBe('- [Lifestyle Analyst · 3 months ago] Overwhelmed by an enormous email backlog');
  });

  it('dates a reflection with no expert label', () => {
    const out = formatReflections([
      { ...strong, content: 'Values deep work in the morning', created_at: ago(7 * DAY) },
    ]);
    expect(out).toBe('- [1 week ago] Values deep work in the morning');
  });
});
