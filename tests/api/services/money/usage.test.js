/**
 * Usage only speaks where a connection would have seen the use. These tests hold the
 * two halves of that: the sentence when the silence is real, and the silence when the
 * ledger has no way to know.
 *
 * The fixtures are the five charges this ledger actually makes every month:
 * Higgsfield 53,96, ElevenLabs 23,45, Fly.io 18,63, Spotify 11,99, Render 6,09.
 * Exactly one of them has a connector behind it, which is the finding under the finding.
 */
import { describe, it, expect } from 'vitest';
import {
  CONNECTABLE_PLATFORMS, PLATFORM_FOR_MERCHANT, MAX_FINDINGS, UNUSED_MIN_DAYS,
  platformForMerchant, usageWindow, subscriptionUse, readUsage, unmeasurable,
} from '../../../../api/services/money/usage.js';

/* es-ES currency puts a non-breaking space before the euro sign; read sentences plainly. */
const plain = (s) => String(s).replace(/\u00a0/g, ' ');

const NOW = new Date('2026-09-08T12:00:00Z');

let seq = 0;
function charge(date, amount) {
  seq += 1;
  return { id: `c${seq}`, occurred_at: `${date}T12:00:00Z`, amount: -Math.abs(amount) };
}

/** A monthly series with its charge rows, exactly as the caller hands them over. */
function series(merchant_key, merchant_name, amount, dates, extra = {}) {
  const charges = dates.map((d) => charge(d, amount));
  return {
    merchant_key,
    merchant_name,
    cadence: 'monthly',
    typical_amount: amount,
    occurrences: charges.length,
    first_seen: charges[0].occurred_at,
    last_seen: charges[charges.length - 1].occurred_at,
    is_subscription: true,
    platform: null,
    charges,
    ...extra,
  };
}

/* Jul 30 -> Sep 8 is 40 days, which is the window every "40 days" below is read from. */
const SPOTIFY = () => series('spotify', 'Spotify', 11.99, ['2026-07-30', '2026-08-30']);
const HIGGSFIELD = () => series('higgsfield', 'Higgsfield', 53.96, ['2026-07-30', '2026-08-30']);
const ELEVENLABS = () => series('elevenlabs', 'ElevenLabs', 23.45, ['2026-07-30', '2026-08-30']);
const FLY = () => series('fly io', 'FLY.IO', 18.63, ['2026-07-30', '2026-08-30']);
const RENDER = () => series('render com', 'RENDER.COM', 6.09, ['2026-07-30', '2026-08-30']);

/** n platform events ending at `end`, one an hour, so they all land inside the window. */
function events(n, end = '2026-09-07T12:00:00Z', kind = 'play') {
  const at = new Date(end).getTime();
  return Array.from({ length: n }, (_, i) => ({ at: new Date(at - i * 3600000).toISOString(), kind }));
}

describe('platformForMerchant', () => {
  it('maps the merchants a connection could prove', () => {
    expect(platformForMerchant('Spotify')).toBe('spotify');
    expect(platformForMerchant('SPOTIFY P3A4B5C6')).toBe('spotify');
    expect(platformForMerchant('GITHUB.COM')).toBe('github');
    expect(platformForMerchant('YouTube Premium')).toBe('youtube');
    expect(platformForMerchant('Google Workspace')).toBe('google_gmail');
  });

  it('returns null for the four charges nothing here can see', () => {
    for (const name of ['Higgsfield', 'ElevenLabs', 'FLY.IO', 'RENDER.COM']) {
      expect(platformForMerchant(name)).toBeNull();
    }
    expect(platformForMerchant('')).toBeNull();
    expect(platformForMerchant(null)).toBeNull();
  });

  it('only ever names a platform TwinMe can connect', () => {
    for (const platform of Object.values(PLATFORM_FOR_MERCHANT)) {
      expect(CONNECTABLE_PLATFORMS).toContain(platform);
    }
  });
});

describe('usageWindow', () => {
  it('counts what falls inside the window and dates the edges', () => {
    const w = usageWindow(events(5, '2026-09-06T12:00:00Z'), { from: '2026-07-30T12:00:00Z', to: NOW });
    expect(w.count).toBe(5);
    expect(w.first).toBe('2026-09-06T08:00:00.000Z');
    expect(w.last).toBe('2026-09-06T12:00:00.000Z');
    expect(w.days_since_last).toBe(2);
  });

  it('drops what falls outside it, and unreadable dates with it', () => {
    const rows = [
      { at: '2026-06-01T12:00:00Z', kind: 'play' },
      { at: '2026-08-01T12:00:00Z', kind: 'play' },
      { at: 'not a date', kind: 'play' },
    ];
    expect(usageWindow(rows, { from: '2026-07-30T12:00:00Z', to: NOW }).count).toBe(1);
  });

  it('says null rather than a number of days when nothing was recorded', () => {
    const w = usageWindow([], { from: '2026-07-30T12:00:00Z', to: NOW });
    expect(w).toEqual({ count: 0, first: null, last: null, days_since_last: null });
  });
});

describe('subscriptionUse', () => {
  it('reads a used subscription against its charges', () => {
    const use = subscriptionUse({ series: SPOTIFY(), events: events(200), now: NOW });
    expect(use).toMatchObject({
      merchant_key: 'spotify', platform: 'spotify', charges: 2, typical_amount: 11.99,
      period_days: 40, uses: 200, uses_per_charge: 100, days_since_last_use: 1, verdict_hint: 'used',
    });
    expect(use.cost_per_use).toBe(0.12);
  });

  it('calls a subscription unused when nothing was recorded in the whole window', () => {
    const use = subscriptionUse({ series: SPOTIFY(), events: [], now: NOW });
    expect(use).toMatchObject({ uses: 0, period_days: 40, verdict_hint: 'unused' });
  });

  it('calls it unused when the money left and nothing followed for three weeks', () => {
    /* Used before the last charge, silent for the forty days since it: the charge
       bought nothing, even though the window as a whole has uses in it. */
    const stale = series('spotify', 'Spotify', 11.99, ['2026-06-30', '2026-07-30']);
    const use = subscriptionUse({ series: stale, events: events(10, '2026-07-20T12:00:00Z'), now: NOW });
    expect(use.uses).toBe(10);
    expect(use.days_since_last_use).toBe(50);
    expect(use.verdict_hint).toBe('unused');
  });

  it('calls it thin when it was used fewer times than it was charged', () => {
    const use = subscriptionUse({ series: SPOTIFY(), events: events(1), now: NOW });
    expect(use).toMatchObject({ uses: 1, charges: 2, uses_per_charge: 0.5, verdict_hint: 'thin' });
    expect(use.cost_per_use).toBe(23.98);
  });

  it('gives no cost per use when there are no uses, rather than an infinite one', () => {
    const use = subscriptionUse({ series: SPOTIFY(), events: [], now: NOW });
    expect(use.cost_per_use).toBeNull();
    expect(Number.isFinite(use.cost_per_use)).toBe(false);
  });

  it('stays unknown for a merchant with no connector, however many charges it makes', () => {
    for (const s of [HIGGSFIELD(), ELEVENLABS(), FLY(), RENDER()]) {
      const use = subscriptionUse({ series: s, events: [], now: NOW });
      expect(use.platform).toBeNull();
      expect(use.uses).toBeNull();
      expect(use.cost_per_use).toBeNull();
      expect(use.verdict_hint).toBe('unknown');
    }
  });

  it('stays unknown on a window shorter than three weeks', () => {
    const short = series('spotify', 'Spotify', 11.99, ['2026-08-25', '2026-09-04']);
    const use = subscriptionUse({ series: short, events: [], now: NOW });
    expect(use.period_days).toBe(14);
    expect(use.period_days).toBeLessThan(UNUSED_MIN_DAYS);
    expect(use.verdict_hint).toBe('unknown');
  });
});

describe('readUsage: the charge nothing followed', () => {
  it('names the merchant, the amount and the days of silence, with its receipts', () => {
    const findings = readUsage({ recurring: [SPOTIFY()], eventsByPlatform: {}, now: NOW });
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.kind).toBe('subscription_unused');
    expect(plain(f.sentence)).toBe('Spotify took 11,99 € a month and has not been used in 40 days.');
    expect(plain(f.detail)).toBe('2 charges, 23,98 € together, and the Spotify connection recorded 0 events in 40 days.');
    expect(f.numbers).toMatchObject({ typical_amount: 11.99, charges: 2, total: 23.98, uses: 0, days_silent: 40, platform: 'spotify' });
    expect(f.month).toBe('2026-08-01');
    expect(f.receipts.map((r) => r.occurred_at)).toEqual(['2026-08-30T12:00:00Z', '2026-07-30T12:00:00Z']);
    expect(f.receipts.every((r) => r.id && r.amount < 0)).toBe(true);
    expect(f.evidence_count).toBe(2);
  });

  it('says nothing at all about a Spotify that was played 200 times', () => {
    const findings = readUsage({ recurring: [SPOTIFY()], eventsByPlatform: { spotify: events(200) }, now: NOW });
    expect(findings).toEqual([]);
  });

  it('will not call three weeks of silence before three weeks have passed', () => {
    const short = series('spotify', 'Spotify', 11.99, ['2026-08-25', '2026-09-04']);
    expect(readUsage({ recurring: [short], eventsByPlatform: {}, now: NOW })).toEqual([]);
  });

  it('never says unused about a merchant with no connector', () => {
    const findings = readUsage({ recurring: [HIGGSFIELD(), ELEVENLABS(), FLY(), RENDER()], eventsByPlatform: {}, now: NOW });
    expect(findings).toEqual([]);
  });

  it('says nothing about a series with a single charge', () => {
    const one = series('spotify', 'Spotify', 11.99, ['2026-07-30']);
    expect(readUsage({ recurring: [one], eventsByPlatform: {}, now: NOW })).toEqual([]);
  });
});

describe('readUsage: what a use costs', () => {
  it('states the cost per use when a month bought one or two uses', () => {
    const findings = readUsage({ recurring: [SPOTIFY()], eventsByPlatform: { spotify: events(2) }, now: NOW });
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.kind).toBe('subscription_cost_per_use');
    expect(plain(f.sentence)).toBe('Spotify has taken 23,98 € for 2 uses, 11,99 € each.');
    expect(plain(f.detail)).toBe('2 charges over 40 days, and the Spotify connection last recorded something 1 day ago.');
    expect(f.numbers).toMatchObject({ uses: 2, cost_per_use: 11.99, peer_cost_per_use: null, charges: 2 });
    expect(f.evidence_count).toBe(4);
  });

  it('states it against the other measurable subscriptions when one costs three times the rest', () => {
    const github = series('github', 'GitHub', 21, ['2026-07-30', '2026-08-30'], { platform: 'github' });
    const findings = readUsage({
      recurring: [SPOTIFY(), github],
      eventsByPlatform: { spotify: events(200), github: events(6, '2026-09-07T12:00:00Z', 'push') },
      now: NOW,
    });
    const f = findings.find((x) => x.numbers.platform === 'github');
    expect(plain(f.sentence)).toBe('GitHub has taken 42,00 € for 6 uses, 7,00 € each.');
    expect(plain(f.detail)).toBe('2 charges over 40 days. The other measurable subscriptions cost 0,12 € a use.');
    expect(f.numbers.peer_cost_per_use).toBe(0.12);
  });

  it('stays quiet on a subscription used as often as it is charged at an ordinary price', () => {
    const github = series('github', 'GitHub', 21, ['2026-07-30', '2026-08-30'], { platform: 'github' });
    const findings = readUsage({
      recurring: [SPOTIFY(), github],
      eventsByPlatform: { spotify: events(200), github: events(200, '2026-09-07T12:00:00Z', 'push') },
      now: NOW,
    });
    expect(findings).toEqual([]);
  });
});

describe('readUsage: how much it says at once', () => {
  const all = () => [SPOTIFY(), HIGGSFIELD(), ELEVENLABS(), FLY(), RENDER(),
    series('github', 'GitHub', 21, ['2026-07-30', '2026-08-30'], { platform: 'github' }),
    series('youtube', 'YouTube Premium', 13.99, ['2026-07-30', '2026-08-30']),
  ];

  it('returns at most two findings, the money at stake first', () => {
    const findings = readUsage({ recurring: all(), eventsByPlatform: {}, now: NOW });
    expect(findings).toHaveLength(MAX_FINDINGS);
    expect(findings.every((f) => f.kind === 'subscription_unused')).toBe(true);
    /* GitHub at 21,00 a month is the largest silence, YouTube at 13,99 the next. */
    expect(findings.map((f) => f.numbers.total)).toEqual([42, 27.98]);
  });

  it('puts an unused charge before an expensive one', () => {
    const findings = readUsage({
      recurring: all(),
      eventsByPlatform: { github: events(200, '2026-09-07T12:00:00Z', 'push'), youtube: events(1, '2026-09-07T12:00:00Z', 'watch') },
      now: NOW,
    });
    expect(findings[0].kind).toBe('subscription_unused');
    expect(findings[0].numbers.platform).toBe('spotify');
  });

  it('gives every finding the shape the analyst gives its own', () => {
    const findings = readUsage({
      recurring: all(),
      eventsByPlatform: { youtube: events(1, '2026-09-07T12:00:00Z', 'watch') },
      now: NOW,
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(Object.keys(f).sort()).toEqual(['detail', 'evidence_count', 'kind', 'month', 'numbers', 'receipts', 'sentence'].sort());
      expect(f.sentence.endsWith('.')).toBe(true);
      expect(f.detail.endsWith('.')).toBe(true);
      expect(typeof f.numbers).toBe('object');
      expect(Array.isArray(f.receipts)).toBe(true);
      expect(f.receipts.length).toBeGreaterThan(0);
      expect(f.evidence_count).toBeGreaterThan(0);
      /* Numbers, never adjectives. */
      expect(f.sentence).toMatch(/[0-9]/);
    }
  });
});

describe('unmeasurable', () => {
  it('returns the charges nothing here can see, dearest first', () => {
    const gap = unmeasurable([SPOTIFY(), HIGGSFIELD(), ELEVENLABS(), FLY(), RENDER()]);
    expect(gap).toEqual([
      { merchant_key: 'higgsfield', typical_amount: 53.96 },
      { merchant_key: 'elevenlabs', typical_amount: 23.45 },
      { merchant_key: 'fly io', typical_amount: 18.63 },
      { merchant_key: 'render com', typical_amount: 6.09 },
    ]);
  });

  it('leaves out the ones a connection could speak for', () => {
    const gap = unmeasurable([SPOTIFY(), series('github', 'GitHub', 21, ['2026-08-30'])]);
    expect(gap).toEqual([]);
  });

  it('is empty on an empty ledger', () => {
    expect(unmeasurable([])).toEqual([]);
    expect(unmeasurable()).toEqual([]);
  });
});
