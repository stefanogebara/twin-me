/**
 * Tests for the PURE core of work-threads — title cleaning (app-suffix + unread
 * counts), dedup with dwell aggregation, generic-shell drop, the min-distinct
 * gate, and the synthesis prompt. The DB gather + LLM are glue (verified live).
 */
import { describe, it, expect } from 'vitest';
import { buildTitleCorpus, buildThreadsPrompt } from '../../../api/services/workThreads.js';

// build n distinct titles so the gate is satisfied by default
const filler = (n) => Array.from({ length: n }, (_, i) => ({ title: `Project thread number ${i}`, dwellSec: 1 }));

describe('buildTitleCorpus', () => {
  it('strips trailing app suffix and "(N)" unread counts', () => {
    const clips = [
      { title: 'Squad Prospeccao WhatsApp | HubSpot - Google Chrome', dwellSec: 100 },
      { title: 'Luiz Hirschmann (DM) - Inner AI - Slack', dwellSec: 50 },
      { title: '(141) WhatsApp - Brave', dwellSec: 20 }, // -> "WhatsApp" -> generic, dropped
      ...filler(12),
    ];
    const c = buildTitleCorpus(clips);
    expect(c.titles).toContain('Squad Prospeccao WhatsApp | HubSpot'); // site name kept, app removed
    expect(c.titles).toContain('Luiz Hirschmann (DM) - Inner AI');     // only final " - Slack" stripped
    expect(c.titles.some((t) => /WhatsApp$/.test(t) && t.length < 12)).toBe(false); // bare WhatsApp dropped
  });

  it('dedups case-insensitively and ranks by total dwell', () => {
    const clips = [
      { title: 'Seatable Floor Plan - Brave', dwellSec: 30 },
      { title: 'seatable floor plan - Brave', dwellSec: 40 }, // same after norm -> merged (70)
      { title: 'Squad Docerias SP - Brave', dwellSec: 200 },  // highest dwell -> first
      ...filler(12),
    ];
    const c = buildTitleCorpus(clips);
    expect(c.titles[0]).toBe('Squad Docerias SP');
    // merged entry present once
    expect(c.titles.filter((t) => /floor plan/i.test(t))).toHaveLength(1);
  });

  it('drops generic shells and too-short titles', () => {
    const clips = [
      { title: 'New Tab - Brave', dwellSec: 10 },
      { title: 'Login - Brave', dwellSec: 10 },
      { title: 'Configurações - Brave', dwellSec: 10 },
      { title: 'abc', dwellSec: 10 },
      ...filler(12),
    ];
    const c = buildTitleCorpus(clips);
    expect(c.titles).not.toContain('New Tab');
    expect(c.titles).not.toContain('Login');
    expect(c.titles).not.toContain('Configurações');
    expect(c.titles).not.toContain('abc');
  });

  it('returns null below the min-distinct gate', () => {
    expect(buildTitleCorpus([{ title: 'One real project title here', dwellSec: 5 }])).toBeNull();
    expect(buildTitleCorpus(filler(11))).toBeNull(); // 11 < 12
    expect(buildTitleCorpus(filler(12))).not.toBeNull();
  });

  it('caps the corpus at topN', () => {
    const c = buildTitleCorpus(filler(50), { topN: 30 });
    expect(c.titles).toHaveLength(30);
    expect(c.distinct).toBe(50);
  });
});

describe('buildThreadsPrompt', () => {
  it('lists the titles and instructs parallel-projects synthesis + NONE gate', () => {
    const p = buildThreadsPrompt({ titles: ['Squad Docerias SP', 'Seatable Manager AI'], distinct: 2 });
    expect(p).toMatch(/- Squad Docerias SP/);
    expect(p).toMatch(/- Seatable Manager AI/);
    expect(p).toMatch(/in parallel/i);
    expect(p).toMatch(/second person/i);
    expect(p).toMatch(/exactly: NONE/);
    expect(p).toMatch(/leave out anything private/i);
    expect(p).toMatch(/Do NOT mention job, fellowship/i);
  });
});
