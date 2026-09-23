/**
 * Words found wrong on a walk of production as a signed-in person (2026-09-23), each pinned:
 * an arrival nobody mentioned was called "as you said"; a payment the bank did not name was
 * listed as a shop called "unknown"; a multiple printed with a dot on a page of commas.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { stillToCome, merchantName } from '../../src/pages/money/words';
import { readingWords } from '../../src/pages/money/readingWords';
import { translate, ensureDict } from '../../src/lib/i18n';
import type { MoneyForecast } from '../../src/services/api/moneyAPI';

beforeAll(async () => { await ensureDict('es'); });
const en = (s: string, vars?: Record<string, string | number>) => translate('en', s, vars);
const es = (s: string, vars?: Record<string, string | number>) => translate('es', s, vars);
const plain = (line: string | null | undefined) => String(line).replace(/[\u00a0\u202f]/g, ' ');

const forecast = (income: Record<string, unknown>) => ({
  month: '2026-09-01', as_of: '2026-09-23', days_left: 7, spent: 0, committed: 0, expected: 0, baseline_rest: 0,
  projected_p10: 0, projected_p50: 0, projected_p90: 0, history_days: 90, committed_items: [], commitment_items: [],
  income_items: [{ subject: 'Mauad G.', amount: 100, due_on: '2026-09-24', ...income }], calendar_items: [],
} as unknown as MoneyForecast);

describe('what comes in says how it knows', () => {
  it('an arrival nobody mentioned is seen, not said', () => {
    expect(stillToCome(en, 'en-GB', forecast({ said: false, basis: 'seen 4 times, not said' }))[0].why).toBe('Comes in, seen before, not said');
  });
  it('one the person said is as they said, and one seen with a count says the count', () => {
    expect(stillToCome(en, 'en-GB', forecast({ said: true, basis: 'said' }))[0].why).toBe('Comes in, as you said');
    expect(stillToCome(en, 'en-GB', forecast({ said: false, times: 4, day: 24 }))[0].why).toBe('Comes in, seen 4 times, usually the 24th');
  });
});

describe('a payment the bank did not name is not a shop called unknown', () => {
  const reading = {
    kind: 'delta_weekday', month: '2026-09-01', sentence: 'STORED', detail: 'STORED',
    numbers: { weekday: 2, current: 131.34, usual: 22.75, count: 5 },
    receipts: [
      { id: '1', occurred_at: '2026-09-22T10:00:00Z', merchant_raw: 'El Corte Ingles', merchant_key: 'el corte ingles' },
      { id: '2', occurred_at: '2026-09-22T11:00:00Z', merchant_raw: null, merchant_key: 'unknown' },
      { id: '3', occurred_at: '2026-09-22T12:00:00Z', merchant_raw: null, merchant_key: 'unknown' },
    ],
  };
  it('names the named and counts the rest', () => {
    expect(readingWords(reading as never, en, 'en-GB').detail).toBe('5 payments: El Corte Ingles, and 2 without a name.');
    expect(readingWords(reading as never, es, 'es-ES').detail).toBe('5 pagos: El Corte Ingles, y 2 sin nombre.');
  });
  it('says so when none has a name', () => {
    const none = { ...reading, receipts: reading.receipts.slice(1) };
    expect(readingWords(none as never, en, 'en-GB').detail).toBe('5 payments, none with a name.');
  });
  it('the month page says the same for a merchant row', () => {
    expect(merchantName('unknown', en)).toBe('without a name');
    expect(merchantName(null, es)).toBe('sin nombre');
    expect(merchantName('Mercadona', en)).toBe('Mercadona');
  });
});

describe('a multiple is written in the reader own figures', () => {
  const odd = { kind: 'amount_outlier', sentence: 'STORED', detail: 'STORED', numbers: { name: 'Openrouter', on: '2026-08-15T12:00:00Z', typical_amount: 16.72, amount: 55.39, multiple: 3.3, times: 7 } };
  it('3,3 in Spanish, 3.3 in English', () => {
    expect(plain(readingWords(odd as never, es, 'es-ES').detail)).toContain('3,3');
    expect(plain(readingWords(odd as never, en, 'en-GB').detail)).toContain('3.3');
  });
});
