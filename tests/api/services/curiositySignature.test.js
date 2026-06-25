/**
 * Tests for the PURE core of curiosity signature — corpus distillation (dedup,
 * noise filtering, ranking, gating) and prompt assembly. The LLM synthesis +
 * DB gather are glue, verified live.
 */
import { describe, it, expect } from 'vitest';
import {
  buildThemeCorpus,
  buildThemePrompt,
} from '../../../api/services/curiositySignature.js';

const pages = (specs) => specs.map((s) => ({ title: s.title || '', topics: s.topics || [] }));

describe('buildThemeCorpus', () => {
  it('frequency-ranks searches and dedups case-insensitively', () => {
    const searches = ['Evolution API', 'evolution api', 'evolution api', 'meta templates', 'x'];
    const corpus = buildThemeCorpus(searches, pages([{ topics: ['whatsapp', 'whatsapp'] }, { topics: ['templates', 'templates'] }, { topics: ['meta', 'meta'] }, { topics: ['evolution', 'evolution'] }, { topics: ['onboarding', 'onboarding'] }, { topics: ['referral', 'referral'] }]));
    expect(corpus).not.toBeNull();
    expect(corpus.searches[0]).toEqual({ q: 'evolution api', c: 3 });
    expect(corpus.searches.find((s) => s.q === 'x')).toBeUndefined(); // too short
  });

  it('filters generic noise topics and requires recurrence', () => {
    const topicsPages = pages([
      { topics: ['search', 'results', 'https', 'whatsapp', 'whatsapp'] },
      { topics: ['page', 'home', 'templates', 'templates'] },
      { topics: ['evolution', 'evolution', '12345'] }, // numeric dropped
      { topics: ['onceonly'] }, // freq 1 dropped
    ]);
    const corpus = buildThemeCorpus(['evolution api', 'meta templates', 'whatsapp number'], topicsPages);
    const topicWords = corpus.topics.map((t) => t.t);
    expect(topicWords).toContain('whatsapp');
    expect(topicWords).toContain('templates');
    expect(topicWords).not.toContain('search');
    expect(topicWords).not.toContain('https');
    expect(topicWords).not.toContain('12345');
    expect(topicWords).not.toContain('onceonly'); // appeared once
  });

  it('dedups titles, strips unread counts, drops generic shells', () => {
    const p = pages([
      { title: '(137) WhatsApp' },            // generic after strip -> dropped
      { title: 'Squad · Prospeccao Docerias SP' },
      { title: 'squad · prospeccao docerias sp' }, // dup (case)
      { title: 'New Tab' },                    // generic
      { title: 'Evolution API Documentation' },
    ]);
    const corpus = buildThemeCorpus(['a search', 'b search', 'c search'], p);
    expect(corpus.titles).toContain('Squad · Prospeccao Docerias SP');
    expect(corpus.titles).toContain('Evolution API Documentation');
    expect(corpus.titles.filter((t) => /squad/i.test(t))).toHaveLength(1);
    expect(corpus.titles).not.toContain('New Tab');
    expect(corpus.titles.some((t) => /^whatsapp$/i.test(t))).toBe(false);
  });

  it('gates to null when there is no real thread', () => {
    expect(buildThemeCorpus([], [])).toBeNull();
    // 2 searches + few topics -> below both thresholds
    expect(buildThemeCorpus(['one thing', 'two thing'], pages([{ topics: ['alpha', 'alpha'] }]))).toBeNull();
  });

  it('passes the gate on enough searches alone', () => {
    const corpus = buildThemeCorpus(['evolution api', 'meta templates', 'whatsapp limit'], []);
    expect(corpus).not.toBeNull();
    expect(corpus.searches).toHaveLength(3);
    expect(corpus.topics).toHaveLength(0);
  });
});

describe('buildThemePrompt', () => {
  it('renders searches, topics, titles and the NONE escape', () => {
    const corpus = {
      searches: [{ q: 'evolution api', c: 13 }, { q: 'meta templates', c: 2 }],
      topics: [{ t: 'whatsapp', c: 9 }, { t: 'templates', c: 5 }],
      titles: ['Evolution API Documentation'],
    };
    const prompt = buildThemePrompt(corpus);
    expect(prompt).toMatch(/evolution api \(x13\)/);
    expect(prompt).toMatch(/PAGE TOPICS: whatsapp, templates/);
    expect(prompt).toMatch(/Evolution API Documentation/);
    expect(prompt).toMatch(/reply with exactly: NONE/);
    expect(prompt).toMatch(/Skip anything sensitive/);
  });
});
