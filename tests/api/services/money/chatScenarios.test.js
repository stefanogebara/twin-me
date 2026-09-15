/**
 * The chat's routing, held against the scenarios without a model: a statement never takes
 * the shortcut, a short ask does, and the scenarios themselves are well formed.
 */
import { describe, it, expect } from 'vitest';
import { SCENARIOS, sentenceCount, amountsInText } from './chatScenarios.js';
import { isShortAsk, shortCircuit, assemble, FIGURE_KINDS, ACTION_KINDS } from '../../../../api/services/money/chat.js';

const NOW = new Date('2026-09-15T12:00:00Z');
const t = (id, occurred_at, amount, merchant_key, merchant_raw, extra = {}) => ({ id, occurred_at, amount, merchant_key, merchant_raw, channel: 'card', currency: 'EUR', ...extra });
const ctx = assemble({
  transactions: [
    t('t1', '2026-09-07T10:00:00Z', -116.76, 'el corte ingles', 'El Corte Ingles'),
    t('t2', '2026-09-04T09:00:00Z', -11.99, 'spotify', 'Spotify', { is_recurring: true }),
    t('t3', '2026-08-04T09:00:00Z', -11.99, 'spotify', 'Spotify', { is_recurring: true }),
  ],
  segments: [{ month: '2026-09-01', spent: 128.75, received: 0, lines: 2, days_covered: 8 }, { month: '2026-08-01', spent: 60.87, received: 0, lines: 2, days_covered: 31 }],
  recurring: [{ merchant_key: 'spotify', merchant_name: 'Spotify', cadence: 'monthly', typical_amount: 11.99, next_expected: '2026-10-04', charges: [{ id: 't2' }, { id: 't3' }] }],
  places: [{ merchant_key: 'spotify', name: 'Spotify', category: 'software' }],
  questions: { opening: [], fromLedger: [], answered: 0 },
  now: NOW,
});

describe('chat scenarios', () => {
  it('are well formed', () => {
    const ids = new Set();
    for (const s of SCENARIOS) {
      expect(ids.has(s.id)).toBe(false); ids.add(s.id);
      expect(['ask', 'statement', 'correction', 'smalltalk', 'ambiguous']).toContain(s.kind);
      expect(['short', 'model']).toContain(s.route);
      for (const k of (s.figures.only || s.figures.some || [])) expect(FIGURE_KINDS).toContain(k);
      for (const k of (s.actions.some || [])) expect(ACTION_KINDS).toContain(k);
      expect(s.maxSentences).toBeGreaterThan(0);
    }
  });
  it('every scenario routes as it says: statements never take the shortcut, short asks do', () => {
    for (const s of SCENARIOS) {
      const quick = shortCircuit(s.message, ctx);
      expect(Boolean(quick), `${s.id}: ${s.message.slice(0, 40)}`).toBe(s.route === 'short');
      if (s.kind === 'statement' || s.kind === 'correction') expect(isShortAsk(s.message), s.id).toBe(false);
    }
  });
  it('counts sentences and amounts the way the live runner scores them', () => {
    expect(sentenceCount('Groceries came to 198,76 EUR. That is 20%. Most of it at Mercadona!')).toBe(3);
    expect(amountsInText('1.011,02 EUR spent and 77,41 EUR to come')).toEqual([1011.02, 77.41]);
  });
});
