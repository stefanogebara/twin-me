/**
 * Tests for classifyMessageTier — the chat message complexity router.
 *
 * Focus: the audit-2026-05-14 fix. "what meetings do I have coming up and
 * am I prepped?" was classified LIGHT (9 words, no STANDARD keyword) and
 * routed to Gemini 2.5 Flash, which never fired the get_meeting_prep
 * action — the twin answered from calendar context and wrongly told the
 * user nothing was prepped. Meeting/prep queries are agentic and must
 * route to at least STANDARD.
 *
 * classifyMessageTier is a pure heuristic function — no mocks needed.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyMessageTier,
  CHAT_TIER_LIGHT,
  CHAT_TIER_STANDARD,
  CHAT_TIER_DEEP,
} from '../../../api/services/chatRouter.js';

describe('classifyMessageTier — meeting/prep agentic intent (audit-2026-05-14)', () => {
  it('routes the exact regression query to STANDARD, not LIGHT', () => {
    // This is the verbatim query from the live audit that exposed the bug.
    const result = classifyMessageTier('what meetings do I have coming up and am I prepped?');
    expect(result.tier).toBe(CHAT_TIER_STANDARD);
    expect(result.tier).not.toBe(CHAT_TIER_LIGHT);
  });

  it.each([
    'what meetings do I have coming up',
    'do i have any meetings tomorrow',
    'how did my recent meetings go',
    "what's my prep for tomorrow",
    'am i prepped',
    'help me prepare for my call',
    "what's my agenda look like",
    'is the briefing ready',
  ])('routes meeting/prep keyword query to STANDARD: %s', (msg) => {
    const result = classifyMessageTier(msg);
    expect(result.tier).toBe(CHAT_TIER_STANDARD);
  });

  it.each([
    'am I ready for this week?',
    'am I ready for tomorrow',
    'am i prepared',
    'am i set for the day',
  ])('routes prep-readiness phrase to STANDARD: %s', (msg) => {
    const result = classifyMessageTier(msg);
    expect(result.tier).toBe(CHAT_TIER_STANDARD);
  });

  it('DEEP still wins over meeting intent — emotional meeting query routes DEEP', () => {
    // Two emotional keywords ("anxious", "overwhelmed") must beat the
    // meeting keyword — the emotional-keyword check runs before Phase 1.5.
    const result = classifyMessageTier(
      "I feel so anxious and overwhelmed about my meeting tomorrow",
    );
    expect(result.tier).toBe(CHAT_TIER_DEEP);
  });

  it('reports a meeting-intent reason for observability', () => {
    const result = classifyMessageTier('what meetings do I have coming up');
    expect(result.reason).toMatch(/meeting\/prep intent/);
  });

  it('reports a prep-readiness reason for the phrase path', () => {
    const result = classifyMessageTier('am I ready for this week?');
    expect(result.reason).toMatch(/prep-readiness phrase/);
  });
});

describe('classifyMessageTier — regressions (unchanged behaviour)', () => {
  it.each(['hey', 'hi', 'gm', 'good morning', 'yo'])(
    'greeting stays LIGHT: %s',
    (msg) => {
      expect(classifyMessageTier(msg).tier).toBe(CHAT_TIER_LIGHT);
    },
  );

  it.each(['ok', 'thanks', 'got it', 'cool', 'yep'])(
    'acknowledgment stays LIGHT: %s',
    (msg) => {
      expect(classifyMessageTier(msg).tier).toBe(CHAT_TIER_LIGHT);
    },
  );

  it.each(['what time is it', 'when is the game', 'how many emails'])(
    'simple factual stays LIGHT: %s',
    (msg) => {
      expect(classifyMessageTier(msg).tier).toBe(CHAT_TIER_LIGHT);
    },
  );

  it('empty message stays LIGHT', () => {
    expect(classifyMessageTier('').tier).toBe(CHAT_TIER_LIGHT);
    expect(classifyMessageTier('   ').tier).toBe(CHAT_TIER_LIGHT);
  });

  it.each([
    'who am i really',
    'what makes me unique',
    'tell me about myself',
  ])('identity query stays DEEP: %s', (msg) => {
    expect(classifyMessageTier(msg).tier).toBe(CHAT_TIER_DEEP);
  });

  it.each([
    "I've been feeling really lonely and exhausted lately",
    'why am I so stressed and anxious all the time',
  ])('emotional query stays DEEP: %s', (msg) => {
    expect(classifyMessageTier(msg).tier).toBe(CHAT_TIER_DEEP);
  });

  it('standard keyword query stays STANDARD: music question', () => {
    expect(classifyMessageTier('what does my music say about me').tier).toBe(
      CHAT_TIER_STANDARD,
    );
  });

  it('long message stays DEEP regardless of meeting words', () => {
    const long = 'meeting ' + 'word '.repeat(55);
    expect(classifyMessageTier(long).tier).toBe(CHAT_TIER_DEEP);
  });

  it('every result carries a model + reason', () => {
    for (const msg of ['hey', 'what meetings do I have', 'who am i']) {
      const r = classifyMessageTier(msg);
      expect(typeof r.tier).toBe('string');
      expect(typeof r.model).toBe('string');
      expect(r.model.length).toBeGreaterThan(0);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });
});
