/**
 * A reading, said again by the page.
 *
 * The ledger keeps the English sentence it wrote, because the twin reads it and its memory
 * is embedded from it. The page holds the same numbers and says the line in the reader's
 * own language. Two things must hold: the English it composes is the English the server
 * composed, word for word, and every phrase it asks for exists in both dictionaries.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { readingWords, weekdayName, monthName, listOf, ordinal, allowanceWords } from '../../src/pages/money/readingWords';
import { translate, ensureDict } from '../../src/lib/i18n';

/* The dictionaries arrive on demand since 2026-09-19; the tests ask for both first. */
beforeAll(async () => { await ensureDict('es'); await ensureDict('pt-BR'); });

const en = (s: string, vars?: Record<string, string | number>) => translate('en', s, vars);
const es = (s: string, vars?: Record<string, string | number>) => translate('es', s, vars);
const pt = (s: string, vars?: Record<string, string | number>) => translate('pt-BR', s, vars);
const NOW = new Date('2026-09-16T12:00:00Z');
/* Phrases whose Spanish and Portuguese are the same words as the English. */
const ALSO_IN_ENGLISH = new Set(['{basis}, {over}.', '{basis}, after {after}, {over}.', '{month}: {amount}', 'Software']);
/* Intl puts a narrow no-break space before the euro sign; these read it as a plain space. */
const plain = (line: string | null) => String(line).replace(/[\u00a0\u202f]/g, ' ');

describe('a reading in the reader own language', () => {
  it('says the month pace exactly as the ledger wrote it, and then in Spanish', () => {
    const r = {
      kind: 'month_pace', month: '2026-09-01', sentence: 'STORED', detail: 'STORED',
      numbers: { spent: 1204.5, previous_spent: 980.2, gap: 224.3, day: 16 },
    };
    const said = readingWords(r, en, 'en-GB', NOW);
    expect(said.sentence).toBe('By the 16th you had spent 1204,50 €. By the 16th of August it was 980,20 €.');
    expect(said.detail).toBe('That is 224,30 € more.');

    const spanish = readingWords(r, es, 'es-ES', NOW);
    expect(spanish.sentence).toContain('agosto');
    expect(spanish.sentence).not.toContain('August');
    expect(spanish.detail).toBe('Son 224,30 € más.');
  });

  it('keeps the stored sentence when a number it needs is missing', () => {
    const r = { kind: 'month_pace', month: '2026-09-01', sentence: 'STORED', detail: 'ALSO STORED', numbers: { spent: 10 } };
    expect(readingWords(r, es, 'es-ES', NOW)).toEqual({ sentence: 'STORED', detail: 'ALSO STORED' });
  });

  it('keeps the stored sentence for a kind it does not know', () => {
    const r = { kind: 'price_point', sentence: 'STORED', detail: null, numbers: { anything: 1 } };
    expect(readingWords(r, pt, 'pt-BR', NOW)).toEqual({ sentence: 'STORED', detail: null });
  });

  it('never translates a name, and always translates a kind of place', () => {
    const silence = {
      kind: 'delta_silence', sentence: 'STORED', detail: 'STORED',
      numbers: { name: 'Mercadona', first_seen: '2026-06-05T10:00:00Z', days_since: 9, away_days: 0, usual_gap_days: 3, times: 14, typical_amount: 23.4 },
    };
    const said = readingWords(silence, pt, 'pt-BR', NOW);
    expect(said.sentence).toContain('Mercadona');
    expect(said.sentence).toContain('a cada 3 dias');

    const category = {
      kind: 'delta_category', sentence: 'STORED', detail: 'STORED',
      numbers: { category: 'eating out', current: 96.2, usual: 40.5, count: 7, usual_count: 3 },
    };
    expect(readingWords(category, es, 'es-ES', NOW).sentence).toContain('Comer fuera');
    expect(readingWords(category, pt, 'pt-BR', NOW).sentence).toContain('Comer fora');
  });

  it('says a cap in the product word, and a cap the person named in theirs', () => {
    const ours = { kind: 'cap_month', month: '2026-09-01', sentence: 'STORED', detail: 'STORED', numbers: { subject: 'eating out', label: 'Eating out', label_is_category: true, cap: 200, spent: 241.5, left: -41.5, over: true, count: 18, days_left: 11 } };
    expect(readingWords(ours, es, 'es-ES', NOW).sentence).toContain('Comer fuera');
    const theirs = { ...ours, numbers: { ...ours.numbers, label: 'Cabify', label_is_category: false } };
    expect(readingWords(theirs, es, 'es-ES', NOW).sentence).toContain('Cabify');
  });

  it('counts in the singular and the plural', () => {
    const one = { kind: 'new_merchant', sentence: 'STORED', detail: 'STORED', numbers: { new_merchants: 1, top_total: 58.4, top_count: 1, top_name: 'Filmin' } };
    expect(readingWords(one, en, 'en-GB', NOW).sentence).toBe('Filmin is new this month.');
    expect(readingWords(one, en, 'en-GB', NOW).detail).toBe('Filmin has taken 58,40 € across 1 payment.');
    const many = { ...one, numbers: { new_merchants: 3, top_total: 58.4, top_count: 2, top_name: 'Filmin' } };
    expect(readingWords(many, en, 'en-GB', NOW).sentence).toBe('3 places are new this month.');
    expect(readingWords(many, en, 'en-GB', NOW).detail).toBe('Filmin has taken 58,40 € across 2 payments.');
  });

  it('names a day ahead the way a person would', () => {
    const r = { kind: 'named_expense', sentence: 'STORED', detail: null, numbers: { name: 'Netflix', amount: 12.99, on: '2026-09-17' } };
    expect(readingWords(r, en, 'en-GB', NOW).sentence).toBe('Netflix, 12,99 €, leaves tomorrow.');
    const far = { ...r, numbers: { ...r.numbers, on: '2026-09-28' } };
    expect(readingWords(far, en, 'en-GB', NOW).sentence).toBe('Netflix, 12,99 €, leaves the 28th.');
    expect(readingWords(far, pt, 'pt-BR', NOW).sentence).toContain('o dia 28');
  });

  it('has a word for every phrase it asks for, in both languages', () => {
    /* A reading with no line for one of its holes reads half in English, which is the whole
       reason this module exists. */
    /* The words live in three files since 2026-09-19: the public function, the helpers, one sayer per kind. */
    const source = ['readingWords', 'readingHelpers', 'readingSayers'].map((f) => readFileSync(new URL(`../../src/pages/money/${f}.ts`, import.meta.url), 'utf8')).join('\n');
    const keys = new Set<string>();
    for (const m of source.matchAll(/t\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
    for (const m of source.matchAll(/'[a-z ]+': '([A-Z][^']*)'/g)) keys.add(m[1]);
    for (const m of source.matchAll(/: '(\{amount\}[^']*)'/g)) keys.add(m[1]);
    expect(keys.size).toBeGreaterThan(60);
    /* A line that reads the same in both languages is a real line; only the dictionaries can
       tell it from a missing one, which is what moneyDictionaryCoverage.test.ts holds. Here
       the point is that every phrase this module asks for is asked for by a key at all. */
    const missing: string[] = [];
    for (const k of keys) {
      if (!/[a-zA-Z]{2}/.test(k)) continue;
      if (translate('es', k) === k && translate('pt-BR', k) === k && !ALSO_IN_ENGLISH.has(k)) missing.push(k);
    }
    expect(missing).toEqual([]);
  });
});

describe('what the ledger worked out on its own', () => {
  /* These patterns had never reached a page before, so they are said in three languages
     from the first day (2026-09-16). */
  it('says a price it always pays', () => {
    const r = { kind: 'price_point', sentence: 'STORED', detail: 'STORED', numbers: { name: 'Bar Pepe', first_seen: '2026-05-04T10:00:00Z', typical_amount: 1.4, times: 31, amount_low: 1.4, amount_high: 1.4, total: 43.4 } };
    expect(plain(readingWords(r, en, 'en-GB', NOW).sentence)).toBe('Bar Pepe is always 1,40 \u20ac, 31 times since May.');
    expect(readingWords(r, en, 'en-GB', NOW).detail).toBe('Every one of them the same to the cent.');
    const spread = { ...r, numbers: { ...r.numbers, amount_low: 1.2, amount_high: 1.8 } };
    expect(readingWords(spread, en, 'en-GB', NOW).sentence).toContain('is about');
    expect(readingWords(spread, es, 'es-ES', NOW).sentence).toContain('ronda los');
    expect(readingWords(r, pt, 'pt-BR', NOW).sentence).toContain('desde maio');
  });

  it('says a day of the week it belongs to, in the reader calendar', () => {
    const r = { kind: 'weekday_habit', sentence: 'STORED', detail: 'STORED', numbers: { name: 'Mercadona', first_seen: '2026-06-05T10:00:00Z', weekday: 6, on_day: 9, times: 12, typical_amount: 38.2 } };
    expect(readingWords(r, en, 'en-GB', NOW).sentence).toBe('You pay Mercadona on Saturday, 9 of 12 times.');
    expect(readingWords(r, es, 'es-ES', NOW).sentence).toContain('s\u00e1bado');
  });

  it('says where in the month the money goes, and where in the world', () => {
    const shape = { kind: 'month_shape', sentence: 'STORED', detail: 'STORED', evidence_count: 240, numbers: { third: 0, share_percent: 46, third_total: 812.4, total: 1766, months: 3 } };
    expect(readingWords(shape, en, 'en-GB', NOW).sentence).toBe('46% of what you spend lands in the first third of the month.');
    expect(readingWords(shape, pt, 'pt-BR', NOW).sentence).toContain('no primeiro ter\u00e7o do m\u00eas');
    const place = { kind: 'place_habit', sentence: 'STORED', detail: 'STORED', numbers: { city: 'Madrid', count: 180, placed: 200, share_percent: 90, spent: 1200, total: 1400, cities: 3 } };
    expect(readingWords(place, en, 'en-GB', NOW).sentence).toBe('90% of your card payments happen in Madrid: 180 of 200.');
    expect(readingWords(place, es, 'es-ES', NOW).detail).toContain('3 ciudades');
  });

  it('says two places that go together, and a payment out of its usual size', () => {
    const pair = { kind: 'pairing', sentence: 'STORED', detail: 'STORED', numbers: { first: 'metro', second: 'bar pepe', first_name: 'Metro', second_name: 'Bar Pepe', times: 14, median_gap_minutes: 6 } };
    expect(readingWords(pair, en, 'en-GB', NOW).sentence).toBe('Metro and Bar Pepe go together, 14 times.');
    expect(readingWords(pair, en, 'en-GB', NOW).detail).toBe('Bar Pepe follows Metro by about 6 minutes.');
    const odd = { kind: 'amount_outlier', sentence: 'STORED', detail: 'STORED', numbers: { name: 'Mercadona', on: '2026-09-05T18:00:00Z', typical_amount: 22, amount: 96.4, multiple: 4.4, times: 20 } };
    expect(plain(readingWords(odd, en, 'en-GB', NOW).sentence)).toBe('Mercadona usually takes 22,00 \u20ac; on 5 September it took 96,40 \u20ac.');
    expect(readingWords(odd, es, 'es-ES', NOW).sentence).toContain('5 de septiembre');
  });

  it('says a kind of spending that lands at the weekend', () => {
    const r = { kind: 'category_rhythm', sentence: 'STORED', detail: 'STORED', evidence_count: 42, numbers: { category: 'eating out', weekend_per_day: 31.2, weekday_per_day: 9.4, ratio: 3.3, days: 90 } };
    expect(plain(readingWords(r, en, 'en-GB', NOW).sentence)).toBe('Your eating out spending lands at weekends: 31,20 \u20ac a weekend day against 9,40 \u20ac a weekday.');
    expect(readingWords(r, es, 'es-ES', NOW).sentence).toContain('comer fuera');
    expect(readingWords(r, en, 'en-GB', NOW).detail).toBe('Read from 42 payments in 90 days.');
  });
});

describe("the day's own line", () => {
  const base = {
    amount: 31.2, basis: 'income' as const, base: 900, keep: 100, free: 420, over: false, days_left: 13,
    spent: 380, committed: 0, calendar_ahead: 0, shape: null, today_events: [], sentence: 'STORED', why: null,
  };
  /* The euro sign arrives with a narrow no-break space from Intl, so these read the words. */
  const words = (line: string | null) => String(line).replace(/\d[\d.,]*[\u00a0\u202f ]?\u20ac|\d+/g, '#');

  it('says what the day rests on, word for word with the ledger', () => {
    expect(words(allowanceWords(base, en, 'en-GB'))).toBe('From the # you said comes in, keeping #, after # spent, over # days.');
  });

  it('names what is already spoken for', () => {
    const a = { ...base, committed: 73.34, calendar_ahead: 48.5 };
    expect(words(allowanceWords(a, en, 'en-GB')))
      .toBe('From the # you said comes in, keeping #, after # spent and # still to be charged and # the diary expects, over # days.');
  });

  it('says why today is worth more or less than an even split', () => {
    const more = allowanceWords({ ...base, shape: { weekday: 5, ratio: 1.3 } }, en, 'en-GB');
    expect(more).toContain('Friday usually costs you more, so today has a bigger share.');
    const less = allowanceWords({ ...base, shape: { weekday: 2, ratio: 0.8 } }, en, 'en-GB');
    expect(less).toContain('Tuesday is usually quieter, so today has a smaller share.');
  });

  it('says it in Spanish and Portuguese too', () => {
    expect(allowanceWords(base, es, 'es-ES')).toContain('que dijiste que entran');
    expect(allowanceWords(base, pt, 'pt-BR')).toContain('que voc\u00ea disse que entram');
    expect(allowanceWords({ ...base, over: true }, es, 'es-ES')).toMatch(/^Son /);
    const shaped = allowanceWords({ ...base, shape: { weekday: 5, ratio: 1.3 } }, es, 'es-ES');
    expect(shaped).toContain('viernes');
    expect(shaped).not.toContain('Friday');
  });

  /* Portuguese fuses the preposition into the article: de + os is dos, never "de os". The
     over-spent line glued a bare phrase after a bare preposition and read "acima de os
     1750,00 EUR" (2026-09-18), so each basis carries its own "past" wording. */
  it('says the over-spent line without a preposition glued to an article', () => {
    const over = { ...base, over: true, free: -234.8 };
    expect(allowanceWords(over, pt, 'pt-BR')).toContain('acima dos');
    expect(allowanceWords(over, pt, 'pt-BR')).not.toContain('de os');
    expect(allowanceWords({ ...over, basis: 'balance' as const, base: 401.63, banks: ['Santander'] }, pt, 'pt-BR')).not.toContain('de os');
    expect(allowanceWords({ ...over, basis: 'typical' as const }, pt, 'pt-BR')).not.toContain('de o ');
    expect(words(allowanceWords(over, en, 'en-GB'))).toBe('That is # past the # you said comes in, keeping #, with # days to go.');
  });

  /* A bank that did not give its name is "your bank" in the ledger, which is words, not a
     name, and words belong in the reader's language: the day read "no your bank". */
  it('says an unnamed bank in the reader own language', () => {
    const onBalance = { ...base, basis: 'balance' as const, base: 240.88, keep: null, balance: { banks: ['your bank'] } };
    expect(allowanceWords(onBalance, pt, 'pt-BR')).toContain('no seu banco');
    expect(allowanceWords(onBalance, pt, 'pt-BR')).not.toContain('your bank');
    expect(allowanceWords(onBalance, es, 'es-ES')).toContain('en tu banco');
    /* A bank that did give its name keeps it. */
    expect(allowanceWords({ ...onBalance, balance: { banks: ['Santander'] } }, pt, 'pt-BR')).toContain('Santander');
    expect(allowanceWords(onBalance, en, 'en-GB')).toContain('in your bank');
  });

  it('keeps the ledger sentence when it cannot say the line', () => {
    expect(allowanceWords({ ...base, amount: null }, es, 'es-ES')).toBe('STORED');
    expect(allowanceWords({ ...base, basis: null, base: null }, es, 'es-ES')).toBe('STORED');
  });
});

describe('the words under it', () => {
  it('names days and months in the reader own calendar', () => {
    expect(weekdayName(5, 'en-GB')).toBe('Friday');
    expect(weekdayName(5, 'es-ES')).toBe('viernes');
    expect(monthName('2026-09-01', 'en-GB')).toBe('September');
    expect(monthName('2026-09-01', 'en-GB', -1)).toBe('August');
    expect(monthName('2026-01-01', 'en-GB', -1)).toBe('December');
  });

  it('reads a list of names as a person reads it', () => {
    expect(listOf(en, ['Ana'])).toBe('Ana');
    expect(listOf(en, ['Ana', 'Marc'])).toBe('Ana and Marc');
    expect(listOf(en, ['Ana', 'Marc', 'Lu'])).toBe('Ana, Marc and Lu');
    expect(listOf(es, ['Ana', 'Marc'])).toBe('Ana y Marc');
  });

  it('says the day of a month', () => {
    expect(ordinal(en, 1)).toBe('1st');
    expect(ordinal(en, 22)).toBe('22nd');
    expect(ordinal(en, 11)).toBe('11th');
    expect(ordinal(es, 3)).toBe('3');
  });
});
