import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../api/_app/services/database.js', () => ({ supabaseAdmin: {} }));
const { assemble } = await import('../../../../api/_app/services/money/chat.js');
const { openers, nextAsks } = await import('../../../../api/_app/services/money/next.js');

const NOW = new Date('2026-09-08T12:00:00Z');
const segments = [
  { month: '2026-09-01', spent: 138.25, received: 15.15, lines: 4, biggest: { id: 't1', merchant: 'El Corte Ingles', amount: 116.76 }, days_covered: 8 },
  { month: '2026-08-01', spent: 65.12, received: 0, lines: 3, biggest: { id: 't5', merchant: 'Simply Alcala', amount: 48.88 }, days_covered: 31 },
];
const cast = { month: '2026-09-01', spent: 138.25, committed: 11.99, received: 15.15, days_left: 22, projected_p10: 250, projected_p50: 320.5, projected_p90: 410 };
const recurring = [{ merchant_key: 'spotify', merchant_name: 'Spotify', cadence: 'monthly', typical_amount: 11.99, next_expected: '2026-10-04', charges: [] }];
const ctx = (extra = {}) => assemble({ transactions: [], segments, forecast: cast, recurring, now: NOW, ...extra });

describe('openers', () => {
  it('offers three questions, each with the figure the ledger would answer with', () => {
    expect(openers(ctx())).toEqual([
      { ask: 'Where did the money go?', figure: '138,25 € in September so far' },
      { ask: 'What comes back every month?', figure: '11,99 €, one charge' },
      { ask: 'How does this month compare?', figure: 'August closed at 65,12 €' },
    ]);
  });
  it('speaks the language of the account', () => {
    const es = openers(ctx({ language: 'es' }));
    expect(es[0]).toEqual({ ask: '¿A dónde se fue el dinero?', figure: '138,25 € en septiembre hasta ahora' });
  });
  it('offers only what the ledger can answer, and never more than three', () => {
    const empty = openers(assemble({ transactions: [], now: NOW }));
    expect(empty.length).toBeLessThanOrEqual(3);
    expect(empty.every((o) => o.ask)).toBe(true);
    expect(empty.some((o) => o.figure !== null)).toBe(false);
  });
});

describe('nextAsks', () => {
  it('after a kind, asks for last month and the place; never the question just asked', () => {
    expect(nextAsks('How much on groceries?', { figures: [{ kind: 'shares' }] }, ctx())).toEqual(['And groceries last month?', 'Which place took the most?']);
    expect(nextAsks('How much on groceries last month?', { figures: [] }, ctx())).toEqual(['Which place took the most?']);
  });
  it('after where it went, asks for last month and what comes back', () => {
    expect(nextAsks('Where did the money go?', { figures: [{ kind: 'shares' }] }, ctx())).toEqual(['And last month?', 'What comes back every month?']);
    expect(nextAsks('Where did the money go in August?', { figures: [{ kind: 'shares' }] }, ctx())).toEqual(['What comes back every month?']);
  });
  it('after subscriptions, months, a week and a person, asks what follows each', () => {
    expect(nextAsks('What comes back every month?', { figures: [{ kind: 'recurring' }] }, ctx())).toEqual(['Which subscription is the least worth it?', 'What is due before the month ends?']);
    expect(nextAsks('How does this month compare?', { figures: [{ kind: 'months' }] }, ctx())).toEqual(['Where did the money go?', 'What can I spend today?']);
    expect(nextAsks('Show me this week', { figures: [{ kind: 'week' }] }, ctx())).toEqual(['Which day of the week costs the most?', 'Where did the money go?']);
    expect(nextAsks('How much has my father sent me?', { figures: [] }, ctx())).toEqual(['Who sent me money this month?', 'How much came in this month?']);
  });
  it('after a statement that was noted, offers one thing only', () => {
    expect(nextAsks('Spotify is a subscription', { computed: true, actions: [{ kind: 'fact' }] }, ctx())).toEqual(['What changed this week?']);
  });
});
