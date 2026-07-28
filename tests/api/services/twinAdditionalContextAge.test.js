/**
 * Tests for date-anchoring in the twin's additional-context render path
 * (api/services/twinAdditionalContext.js).
 *
 * optmem-brain audit, Phase 0 item 5 (root cause 9): observation text is
 * written in timeless present tense ("Has a backlog of 40,443 unread emails")
 * and the renderer attached NO date, under a header that calls the block
 * "factual observations about this person". The only hedge — "(less certain)"
 * — comes from computeAlpha (confidence x importance x citation boost), which
 * is completely age-blind: a stale, repeatedly-retrieved platform reading
 * scores HIGH on all three, so the hedging fires in exactly the wrong
 * direction. The model then reads a months-old snapshot as a current fact.
 *
 * The audit's verdict on this item: "Item 5 alone would likely have prevented
 * the user-visible symptom."
 */
import { describe, it, expect } from 'vitest';

process.env.NODE_ENV = 'test';

const { buildAdditionalContext, formatMemoryAge } = await import(
  '../../../api/services/twinAdditionalContext.js'
);

const NOW = new Date('2026-07-27T12:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A platform observation as search_memory_stream returns it. */
const obs = (content, createdAt, overrides = {}) => ({
  id: Math.random().toString(36).slice(2),
  content,
  memory_type: 'platform_data',
  created_at: createdAt,
  confidence: 0.9,
  importance_score: 8,
  retrieval_count: 5,
  ...overrides,
});

const build = (memories) =>
  buildAdditionalContext({ memories, maxChars: 20000, now: NOW }).additionalContext;

describe('formatMemoryAge', () => {
  it('returns an empty marker for missing or unparseable timestamps', () => {
    expect(formatMemoryAge(null, NOW)).toBe('');
    expect(formatMemoryAge(undefined, NOW)).toBe('');
    expect(formatMemoryAge('not-a-date', NOW)).toBe('');
  });

  it('anchors recent readings without inventing elapsed time', () => {
    expect(formatMemoryAge(ago(5 * MIN), NOW)).toBe('today');
    expect(formatMemoryAge(ago(6 * HOUR), NOW)).toBe('today');
    expect(formatMemoryAge(ago(DAY + HOUR), NOW)).toBe('yesterday');
  });

  it('scales the unit with age, truncating rather than rounding up', () => {
    expect(formatMemoryAge(ago(3 * DAY), NOW)).toBe('3 days ago');
    expect(formatMemoryAge(ago(6 * DAY + 23 * HOUR), NOW)).toBe('6 days ago');
    expect(formatMemoryAge(ago(14 * DAY), NOW)).toBe('2 weeks ago');
    expect(formatMemoryAge(ago(90 * DAY), NOW)).toBe('2 months ago');
    expect(formatMemoryAge(ago(400 * DAY), NOW)).toBe('1 year ago');
  });

  it('never reports a future timestamp as an age', () => {
    expect(formatMemoryAge(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBe('');
  });
});

describe('observation rendering — date anchoring', () => {
  it('THE REGRESSION: a months-old unread count is not presented as a timeless fact', () => {
    const text = build([obs('Has a backlog of 40443 unread emails in inbox', ago(90 * DAY))]);
    expect(text).toContain('40443');
    // The number may still surface — but never without saying when it was read.
    expect(text).toContain('2 months ago');
    expect(text).toMatch(/\[2 months ago\][^\n]*40443/);
  });

  it('tags every observation line, not just the stale ones', () => {
    const text = build([
      obs('Inbox grew by 12 unread emails in the last 30 minutes', ago(20 * MIN)),
      obs('Has a backlog of 40443 unread emails in inbox', ago(90 * DAY)),
    ]);
    const obsLines = text.split('\n').filter(l => l.startsWith('- '));
    expect(obsLines.length).toBe(2);
    for (const line of obsLines) {
      expect(line).toMatch(/^- \[(today|yesterday|\d+ (day|week|month|year)s? ago)\] /);
    }
  });

  it('tells the model what the tag means, so the date is actionable', () => {
    const text = build([obs('Has a backlog of 40443 unread emails in inbox', ago(90 * DAY))]);
    expect(text).toMatch(/when it was observed/i);
    expect(text).toMatch(/historical/i);
  });

  it('omits the tag rather than fabricating one when created_at is missing', () => {
    const text = build([obs('Has a backlog of 40443 unread emails in inbox', null)]);
    const line = text.split('\n').find(l => l.startsWith('- '));
    expect(line).toBe('- Has a backlog of 40443 unread emails in inbox');
    expect(line).not.toContain('[]');
    expect(line).not.toContain('undefined');
    expect(line).not.toContain('NaN');
  });

  it('keeps the age tag alongside the existing certainty hedge', () => {
    // Low importance -> alpha < 0.4 -> "(less certain)" and a shorter clamp.
    const text = build([
      obs('Has a backlog of 40443 unread emails in inbox', ago(90 * DAY), {
        importance_score: 5,
        confidence: 0.7,
        retrieval_count: 0,
      }),
    ]);
    const line = text.split('\n').find(l => l.startsWith('- '));
    expect(line).toContain('[2 months ago]');
    expect(line).toContain('(less certain)');
  });

  it('date-anchors the creativity spark, which surfaces old memories by design', () => {
    const { additionalContext } = buildAdditionalContext({
      memories: [],
      maxChars: 20000,
      now: NOW,
      creativityResult: {
        novelMemories: [obs('Listened to Radiohead on repeat', ago(200 * DAY))],
        avgLz: 0.42,
      },
    });
    expect(additionalContext).toContain('[6 months ago]');
  });

  it('leaves synthesized reflections untagged — they are patterns, not readings', () => {
    const text = build([
      { ...obs('Tends to process email in long focused bursts', ago(90 * DAY)), memory_type: 'reflection' },
    ]);
    const line = text.split('\n').find(l => l.startsWith('- '));
    expect(line).toBe('- Tends to process email in long focused bursts');
  });
});
