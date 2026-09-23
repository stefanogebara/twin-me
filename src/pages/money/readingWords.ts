/**
 * A reading, said in the reader's own language.
 *
 * The ledger computes its readings on a schedule and keeps the English sentence it wrote,
 * because that sentence is what the twin reads and what its memory is embedded from. The
 * page has the same numbers, so it says the line itself (2026-09-16). This is the pattern
 * the plan's line already follows: the server keeps its prose, the screen composes its own.
 *
 * Every kind falls back to the stored sentence when a number it needs is missing, so a
 * reading written before a field existed still reads, in English, rather than breaking.
 */
import { euro } from '../../services/api/moneyAPI';
import { type T, type Numbers, type Sayable, s, weekdayName, type Allowance, bankNames } from './readingHelpers';
import { SAYERS } from './readingSayers';
import type { LiveFigures } from './readingSayers';
import type { Said } from './readingHelpers';
export * from './readingHelpers';

export function allowanceWords(a: Allowance, t: T, locale: string): string | null {
  if (!a || a.amount === null || a.days_left === null) return a?.sentence ?? null;
  const days = Math.max(1, a.horizon?.days ?? ((a.days_left || 0) + 1));
  const keep = a.keep ? t(', keeping {amount}', { amount: euro(a.keep) }) : '';
  const base = a.base ?? null;
  /* Two forms of the same phrase, each carrying its own preposition: one that opens the
     sentence ("Dos 447,98 EUR") and one that follows "that is" ("acima dos 447,98 EUR").
     Portuguese fuses the preposition into the article, so a phrase built bare and glued
     after one read "De os 447,98 EUR" (2026-09-16) and then "acima de os" in the over-spent
     line (2026-09-18). No string surgery on a translated sentence fixes that honestly. */
  const past = a.basis === 'balance' && base !== null
    ? t('past the {amount} in {bank}', { amount: euro(base), bank: bankNames(a, t) }) + keep
    : a.basis === 'income' && base !== null
      ? t('past the {amount} you said comes in', { amount: euro(base) }) + keep
      : a.basis === 'typical' && base !== null
        ? t('past your usual month of {amount}', { amount: euro(base) }) + keep
        : a.basis === 'student_prior' && base !== null
          ? t('past {label}, {amount}', { label: t(a.basis_label || 'a typical student month in Madrid on top of your rent'), amount: euro(base) }) + keep
          : null;
  const basis = a.basis === 'balance' && base !== null
    ? t('From the {amount} in {bank}', { amount: euro(base), bank: bankNames(a, t) }) + keep
    : a.basis === 'income' && base !== null
      ? t('From the {amount} you said comes in', { amount: euro(base) }) + keep
      : a.basis === 'typical' && base !== null
        ? t('From your usual month of {amount}', { amount: euro(base) }) + keep
        : a.basis === 'student_prior' && base !== null
          ? t('From {label}, {amount}', { label: t(a.basis_label || 'a typical student month in Madrid on top of your rent'), amount: euro(base) }) + keep
          : null;
  if (!basis || !past) return a.sentence ?? null;

  const daysWord = days === 1 ? t('{n} day', { n: 1 }) : t('{n} days', { n: days });
  if (a.over && a.basis === 'balance' && base !== null && base < 0) {
    /* The bank itself is short (see allowance.js): say what it has and what is still to book. */
    const parts: string[] = [t('{amount} there', { amount: euro(a.balance?.reported ?? 0) })];
    if ((a.balance?.adjustment || 0) > 0) parts.push(t('{amount} of payments not booked yet', { amount: euro(a.balance?.adjustment || 0) }));
    if ((a.committed || 0) > 0) parts.push(t('{amount} still to be charged', { amount: euro(a.committed || 0) }));
    const line = parts.length > 1
      ? t('{bank} is {amount} short: {parts}.', { bank: bankNames(a, t), amount: euro(Math.abs(base)), parts: parts.join(t(', and ')) })
      : t('{bank} is {amount} short, with {days} to go.', { bank: bankNames(a, t), amount: euro(Math.abs(base)), days: daysWord });
    return line.charAt(0).toUpperCase() + line.slice(1);
  }
  if (a.over) {
    return t('That is {amount} {past}, with {days} to go.', { amount: euro(Math.abs(a.free || 0)), past, days: daysWord });
  }
  const spoken: string[] = [];
  /* With the balance, what has been spent is already gone from it and is not said again. */
  if (a.basis !== 'balance') spoken.push(t('{amount} spent', { amount: euro(a.spent || 0) }));
  if ((a.committed || 0) > 0) spoken.push(t('{amount} still to be charged', { amount: euro(a.committed || 0) }));
  if ((a.calendar_ahead || 0) > 0) spoken.push(t('{amount} the diary expects', { amount: euro(a.calendar_ahead || 0) }));
  const until = a.horizon?.day && a.horizon.source
    ? t('over the {days} until {source} arrives', { days: daysWord, source: a.horizon.source })
    : t('over {days}', { days: daysWord });
  const line = spoken.length
    ? t('{basis}, after {after}, {over}.', { basis, after: spoken.join(t(' and ')), over: until })
    : t('{basis}, {over}.', { basis, over: until });
  /* Why today is not simply the month divided by its days. */
  if (!a.shape) return line;
  const weekday = weekdayName(a.shape.weekday, locale);
  return a.shape.ratio > 1
    ? `${line} ${t('{weekday} usually costs you more, so today has a bigger share.', { weekday })}`
    : `${line} ${t('{weekday} is usually quieter, so today has a smaller share.', { weekday })}`;
}

/* ------------------------------------------------------------------------------ the kinds */

/**
 * One reading in the reader's language, or the stored English when this kind is not known
 * here or a number it needs is missing.
 */
export function readingWords(r: Sayable, t: T, locale: string, now = new Date(), live: LiveFigures | null = null, zone: string | null = null): Said {
  const keep: Said = { sentence: r.sentence, detail: r.detail ?? null };
  const num = (r.numbers || {}) as Numbers;
  const receipts = r.receipts || [];
  const nameFromReceipt = () => s(receipts[0]?.merchant_raw) || s(receipts[0]?.merchant_key);

  try {
    const sayer = SAYERS[r.kind];
    return sayer ? sayer({ r, t, locale, now, num, keep, receipts, nameFromReceipt, live, zone }) : keep;
  } catch {
    /* A reading that cannot be said again is still a reading: the stored line stands. */
    return keep;
  }
}
