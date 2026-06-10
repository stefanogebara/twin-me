/**
 * Unit tests for api/routes/desktop-extracted-facts.js — pure helpers.
 *
 * The route handler itself is integration-shaped (Redis, OAuth token,
 * Google APIs) and is exercised by the prod verify script. These tests
 * pin the 5 fact-builder functions in isolation: same inputs they'll
 * see in prod, no network, no DB.
 *
 * Why these tests matter: the fact templates are the wow moment of v2
 * #5. A regression that turns "Linked to Anthropic" into "Linked to
 * anthropic.com" or "Tuesdays — that's 60% of your week" into "0% of
 * your week" silently degrades the moment without breaking any
 * server contract. Templates need pin-tests.
 */
import { describe, it, expect } from 'vitest';
import {
  buildIdentityFact,
  buildLocationFact,
  buildCadenceFact,
  buildFocusBlocksFact,
  buildLanguageFact,
  confidenceRank,
} from '../../../api/routes/desktop-extracted-facts.js';

describe('buildIdentityFact', () => {
  it('returns null when userInfo is missing or has no email', () => {
    expect(buildIdentityFact(null)).toBeNull();
    expect(buildIdentityFact({})).toBeNull();
    expect(buildIdentityFact({ email: '' })).toBeNull();
    expect(buildIdentityFact({ email: 'no-at-sign' })).toBeNull();
  });

  it('SKIPS the major generic email providers', () => {
    expect(buildIdentityFact({ email: 'stefano@gmail.com' })).toBeNull();
    expect(buildIdentityFact({ email: 'me@hotmail.com' })).toBeNull();
    expect(buildIdentityFact({ email: 'me@icloud.com' })).toBeNull();
    expect(buildIdentityFact({ email: 'me@protonmail.com' })).toBeNull();
    expect(buildIdentityFact({ email: 'me@yahoo.com' })).toBeNull();
  });

  it('uppercases the domain root for a corp email', () => {
    const f = buildIdentityFact({ email: 'me@anthropic.com' });
    expect(f).not.toBeNull();
    expect(f.text).toContain('Anthropic');
    expect(f.id).toBe('identity');
    expect(f.confidence).toBe('high');
  });

  it('handles multi-part domains by taking the first label', () => {
    // "me@eng.openai.com" should yield "Eng" — the algorithm is
    // deliberately naive in v1; if it picks the wrong label the user
    // can dismiss the row.
    const f = buildIdentityFact({ email: 'me@eng.openai.com' });
    expect(f).not.toBeNull();
    expect(f.text).toMatch(/Eng/);
  });
});

describe('buildLocationFact', () => {
  it('returns null when no zoneinfo + no event timezone', () => {
    expect(buildLocationFact(null, [])).toBeNull();
    expect(buildLocationFact({}, [])).toBeNull();
  });

  it('prefers userInfo.zoneinfo over event timezone', () => {
    const f = buildLocationFact(
      { zoneinfo: 'America/Sao_Paulo' },
      [{ start: { timeZone: 'America/Los_Angeles' } }]
    );
    expect(f.text).toContain('Sao Paulo');
    expect(f.text).not.toContain('Los Angeles');
  });

  it('falls back to event timezone when userInfo is empty', () => {
    const f = buildLocationFact(
      {},
      [{ start: { timeZone: 'Europe/Lisbon' } }]
    );
    expect(f.text).toContain('Lisbon');
    expect(f.text).toContain('Europe');
  });

  it('replaces underscore with space ("Sao_Paulo" -> "Sao Paulo")', () => {
    const f = buildLocationFact({ zoneinfo: 'America/Sao_Paulo' }, []);
    expect(f.text).not.toContain('_');
  });

  it('returns null on degenerate timezone strings', () => {
    expect(buildLocationFact({ zoneinfo: 'UTC' }, [])).toBeNull();
    expect(buildLocationFact({ zoneinfo: '' }, [])).toBeNull();
  });
});

describe('buildCadenceFact', () => {
  it('returns null when fewer than 5 events', () => {
    expect(buildCadenceFact([])).toBeNull();
    expect(buildCadenceFact([{ start: { dateTime: '2026-06-10T10:00:00Z' } }])).toBeNull();
  });

  it('picks top 2 weekdays by event count', () => {
    // Build 6 events: 3 on Tuesday (2026-06-09, 2026-06-16, 2026-06-23),
    // 2 on Thursday (2026-06-11, 2026-06-18), 1 on Friday (2026-06-12).
    const events = [
      { start: { dateTime: '2026-06-09T10:00:00Z' } }, // Tue
      { start: { dateTime: '2026-06-16T10:00:00Z' } }, // Tue
      { start: { dateTime: '2026-06-23T10:00:00Z' } }, // Tue
      { start: { dateTime: '2026-06-11T10:00:00Z' } }, // Thu
      { start: { dateTime: '2026-06-18T10:00:00Z' } }, // Thu
      { start: { dateTime: '2026-06-12T10:00:00Z' } }, // Fri
    ];
    const f = buildCadenceFact(events);
    expect(f).not.toBeNull();
    expect(f.text).toContain('Tuesday');
    expect(f.text).toContain('Thursday');
    expect(f.text).toMatch(/83%/); // (3+2)/6 = 83%
  });

  it('handles all-day events (start.date, not start.dateTime)', () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      start: { date: `2026-06-${10 + i}` }, // 10..15 — Wed..Mon
    }));
    const f = buildCadenceFact(events);
    expect(f).not.toBeNull();
    // Should not error and should produce a real cadence string
    expect(f.text).toMatch(/calendar leans heavily/);
  });
});

describe('buildFocusBlocksFact', () => {
  it('returns null when no titles recur >= 2 times', () => {
    const events = [
      { summary: 'One-off meeting' },
      { summary: 'Another one-off' },
      { summary: 'Yet another' },
      { summary: 'And one more' },
      { summary: 'Different again' },
    ];
    expect(buildFocusBlocksFact(events)).toBeNull();
  });

  it('lifts recurring titles into the focus-blocks fact', () => {
    const events = [
      { summary: 'GitHub Deep Work' },
      { summary: 'GitHub Deep Work' },
      { summary: 'Email Zero Sprint' },
      { summary: 'Email Zero Sprint' },
      { summary: 'one-off' },
    ];
    const f = buildFocusBlocksFact(events);
    expect(f).not.toBeNull();
    expect(f.text).toMatch(/Github Deep Work/i);
    expect(f.text).toMatch(/Email Zero Sprint/i);
  });

  it('normalizes case + numeric volatility ("Standup 2026-06-10" -> "standup")', () => {
    // The fact requires AT LEAST 2 distinct recurring titles to fire — a
    // single recurring block on its own isn't strong enough signal for the
    // "your calendar has structure" pitch. Need standup + 1:1 both recurring.
    const events = [
      { summary: 'Standup 2026-06-10' },
      { summary: 'standup 2026-06-11' },
      { summary: 'Standup 2026-06-12' },
      { summary: 'Email Zero Sprint' },
      { summary: 'email zero sprint' },
      { summary: 'one-off' },
    ];
    const f = buildFocusBlocksFact(events);
    expect(f).not.toBeNull();
    expect(f.text.toLowerCase()).toContain('standup');
    expect(f.text.toLowerCase()).toContain('email zero sprint');
  });
});

describe('buildLanguageFact', () => {
  it('returns null when fewer than 3 non-English titles', () => {
    const events = [
      { summary: 'Meeting with Alex' },
      { summary: 'Lunch' },
      { summary: 'Standup' },
      { summary: 'psicólogo' }, // 1 non-English — below threshold
    ];
    expect(buildLanguageFact(events)).toBeNull();
  });

  it('lifts 3+ non-English titles as proof (diacritic-detection signal)', () => {
    // The detector matches diacritics + non-Latin scripts. Plain Portuguese
    // words without diacritics ("Academia da Mente") DON'T trip the regex —
    // that's a known v1 limitation. v2 could add an NLP pass.
    const events = [
      { summary: 'psicólogo' },          // matches ó
      { summary: 'jantar em família' },  // matches í
      { summary: 'reunião com José' },   // matches ã and é
      { summary: 'one-off English' },
      { summary: 'another English' },    // 5 events minimum for the function to fire
    ];
    const f = buildLanguageFact(events);
    expect(f).not.toBeNull();
    expect(f.text).toContain('psicólogo');
    expect(f.text).toContain('família');
    expect(f.id).toBe('language');
  });

  it('does not match plain ASCII English titles', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({ summary: `Meeting ${i}` }));
    expect(buildLanguageFact(events)).toBeNull();
  });
});

describe('confidenceRank', () => {
  it('orders high > medium > low for the sort pass', () => {
    expect(confidenceRank({ confidence: 'high' })).toBeGreaterThan(confidenceRank({ confidence: 'medium' }));
    expect(confidenceRank({ confidence: 'medium' })).toBeGreaterThan(confidenceRank({ confidence: 'low' }));
    expect(confidenceRank({ confidence: 'unknown' })).toBe(0);
  });
});
