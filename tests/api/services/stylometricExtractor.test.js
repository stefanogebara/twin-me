/**
 * Characterization tests for stylometricExtractor — pure writing-style
 * fingerprinting (CLAUDE.md: "pure computation, no LLM").
 *
 * computeFeatures / generateFacts are exported (test-only additive export) so
 * the deterministic math can be pinned directly without touching addMemory.
 * We lock: word-count averaging + rounding, capitalization banding, punctuation
 * ending percentages, emoji ratio, one-liner ratio, n-gram signature phrases,
 * and the threshold-driven fact copy the personality prompt consumes.
 */
import { describe, it, expect } from 'vitest';
import {
  computeFeatures,
  generateFacts,
} from '../../../api/services/chatHistory/stylometricExtractor.js';

/** Build the { msg, ts } shape computeFeatures expects. */
const M = (arr) => arr.map((msg) => ({ msg, ts: new Date() }));

describe('computeFeatures — core stats', () => {
  it('returns null for an empty message list', () => {
    expect(computeFeatures([])).toBeNull();
  });

  it('computes average word count rounded to 1 decimal', () => {
    // "one" (1) + "two words" (2) + "three words here" (3) => avg 2.0
    const f = computeFeatures(M(['one', 'two words', 'three words here']));
    expect(f.n).toBe(3);
    expect(f.avgWords).toBe(2);
  });

  it('rounds avgWords to one decimal place', () => {
    // words: 1,1,2 => 4/3 = 1.333... -> 1.3
    const f = computeFeatures(M(['hi', 'yo', 'two words']));
    expect(f.avgWords).toBe(1.3);
  });
});

describe('computeFeatures — capitalization banding', () => {
  it('flags lowercase-dominant when >70% start lowercase', () => {
    // 8 lowercase-start of 10 => capsRatio 0.8 > 0.7
    const msgs = M([
      'yo', 'hey', 'sup', 'ok', 'cool', 'nice', 'sure', 'yeah', 'Hello', 'World',
    ]);
    const f = computeFeatures(msgs);
    expect(f.capStyle).toBe('lowercase-dominant');
    expect(f.capsRatio).toBe(80);
  });

  it('flags proper-case when <=40% start lowercase', () => {
    // 2 lowercase-start of 10 => 0.2 -> proper-case
    const msgs = M([
      'Hello', 'World', 'This', 'That', 'These', 'Those', 'Here', 'There', 'yo', 'ok',
    ]);
    const f = computeFeatures(msgs);
    expect(f.capStyle).toBe('proper-case');
    expect(f.capsRatio).toBe(20);
  });

  it('flags mixed in the 40-70% band', () => {
    // 5 lowercase-start of 10 => 0.5 -> mixed
    const msgs = M([
      'yo', 'hey', 'sup', 'ok', 'cool', 'Hello', 'World', 'This', 'That', 'Here',
    ]);
    expect(computeFeatures(msgs).capStyle).toBe('mixed');
  });
});

describe('computeFeatures — punctuation endings (as percentages)', () => {
  it('classifies ellipsis, exclamation, question, period, and none', () => {
    const msgs = M([
      'thinking...', // ellipsis
      'wow!', // exclamation
      'really?', // question
      'done.', // period
      'no ending here', // none
    ]);
    const f = computeFeatures(msgs);
    // each is 1/5 = 20%
    expect(f.endings.ellipsis).toBe(20);
    expect(f.endings.exclamation).toBe(20);
    expect(f.endings.question).toBe(20);
    expect(f.endings.period).toBe(20);
    expect(f.endings.none).toBe(20);
  });

  it('prioritizes ellipsis over a trailing period (order of checks)', () => {
    // "..." ends with "." too, but ellipsis is checked first.
    const f = computeFeatures(M(['wait...', 'wait...', 'wait...', 'wait...']));
    expect(f.endings.ellipsis).toBe(100);
    expect(f.endings.period).toBe(0);
  });
});

describe('computeFeatures — emoji + density', () => {
  it('computes emoji ratio and ranks top emojis', () => {
    const msgs = M([
      'love it 😍😍', 'nice 😍', 'cool 🔥', 'plain text', 'more plain',
    ]);
    const f = computeFeatures(msgs);
    // 3 of 5 messages contain an emoji => 60%
    expect(f.emojiRatio).toBe(60);
    // 😍 appears 3 times, 🔥 once => 😍 ranked first
    expect(f.topEmojis[0]).toBe('😍');
  });

  it('computes one-liner ratio (<=1 sentence)', () => {
    const msgs = M([
      'just one thing', // 1 sentence -> one-liner
      'first. second.', // 2 sentences -> not
      'a. b. c.', // 3 -> not
      'single line', // one-liner
    ]);
    const f = computeFeatures(msgs);
    // 2 of 4 are one-liners => 50%
    expect(f.oneLineRatio).toBe(50);
  });
});

describe('computeFeatures — signature n-grams (require 3+ occurrences)', () => {
  it('surfaces a trigram that repeats 3+ times (stopwords are dropped first)', () => {
    // tokenize() filters stopwords AND tokens shorter than 3 chars, so the
    // signature phrase must be built from long content words. "this" would be
    // dropped as a stopword, so we use "coffee tastes amazing".
    const msgs = M([
      'coffee tastes amazing today',
      'coffee tastes amazing here',
      'coffee tastes amazing again',
      'something totally different words',
    ]);
    const f = computeFeatures(msgs);
    const phrases = f.sigTrigrams.map((x) => x.phrase);
    expect(phrases).toContain('coffee tastes amazing');
    expect(f.sigTrigrams.find((x) => x.phrase === 'coffee tastes amazing').count).toBeGreaterThanOrEqual(3);
  });

  it('drops n-grams that appear fewer than 3 times', () => {
    const msgs = M(['unique alpha beta', 'unique gamma delta', 'nothing here repeats']);
    const f = computeFeatures(msgs);
    expect(f.sigTrigrams).toHaveLength(0);
    expect(f.sigBigrams).toHaveLength(0);
  });
});

describe('generateFacts — threshold-driven copy', () => {
  it('describes very short messages and names the source platform', () => {
    const f = { avgWords: 3, capStyle: 'mixed', capsRatio: 50,
      endings: { none: 0, period: 0, exclamation: 0, question: 0, ellipsis: 0 },
      emojiRatio: 10, topEmojis: [], oneLineRatio: 10, sigBigrams: [], sigTrigrams: [] };
    const facts = generateFacts(f, 'whatsapp_chat');
    expect(facts.some((x) => /very short messages/.test(x) && /WhatsApp/.test(x))).toBe(true);
  });

  it('uses "Telegram" as the source label for telegram_chat', () => {
    const f = { avgWords: 20, capStyle: 'mixed', capsRatio: 50,
      endings: { none: 0, period: 0, exclamation: 0, question: 0, ellipsis: 0 },
      emojiRatio: 10, topEmojis: [], oneLineRatio: 10, sigBigrams: [], sigTrigrams: [] };
    const facts = generateFacts(f, 'telegram_chat');
    expect(facts.some((x) => /longer messages/.test(x) && /Telegram/.test(x))).toBe(true);
  });

  it('emits a heavy-emoji fact with favorites when emojiRatio > 40', () => {
    const f = { avgWords: 8, capStyle: 'mixed', capsRatio: 50,
      endings: { none: 0, period: 0, exclamation: 0, question: 0, ellipsis: 0 },
      emojiRatio: 55, topEmojis: ['😂', '🔥'], oneLineRatio: 10, sigBigrams: [], sigTrigrams: [] };
    const facts = generateFacts(f, 'whatsapp_chat');
    expect(facts.some((x) => /Heavy emoji user/.test(x) && /😂 🔥/.test(x))).toBe(true);
  });

  it('emits a lowercase-typing fact for lowercase-dominant style', () => {
    const f = { avgWords: 8, capStyle: 'lowercase-dominant', capsRatio: 90,
      endings: { none: 0, period: 0, exclamation: 0, question: 0, ellipsis: 0 },
      emojiRatio: 10, topEmojis: [], oneLineRatio: 10, sigBigrams: [], sigTrigrams: [] };
    const facts = generateFacts(f, 'whatsapp_chat');
    expect(facts.some((x) => /almost entirely in lowercase/.test(x))).toBe(true);
  });

  it('prefers trigram signature phrases over bigrams when both exist', () => {
    const f = { avgWords: 8, capStyle: 'mixed', capsRatio: 50,
      endings: { none: 0, period: 0, exclamation: 0, question: 0, ellipsis: 0 },
      emojiRatio: 10, topEmojis: [], oneLineRatio: 10,
      sigBigrams: [{ phrase: 'love this', count: 4 }],
      sigTrigrams: [{ phrase: 'really love this', count: 3 }] };
    const facts = generateFacts(f, 'whatsapp_chat');
    // Trigram branch wins -> "Characteristic phrases", bigram branch skipped.
    expect(facts.some((x) => /Characteristic phrases/.test(x) && /really love this/.test(x))).toBe(true);
    expect(facts.some((x) => /Recurring word patterns/.test(x))).toBe(false);
  });
});
