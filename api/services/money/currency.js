/**
 * What money this ledger is in.
 *
 * The euro was assumed in forty-one places: eight formatters cut by hand with es-ES and EUR
 * written into each, and a scattering of comparisons against the string 'EUR' that decide
 * whether a payment is counted, whether a balance may be read, and whether the day may be
 * spoken about at all. None of them was wrong -- the product is for students in Spain -- but
 * assumed in forty-one places is not the same as stated in one, and a friend studying in the
 * United States would link a bank successfully and then be told that spending guidance is
 * available for euro accounts only (2026-09-19).
 *
 * One currency for the whole ledger, overridable with MONEY_CURRENCY, exactly as zone.js
 * holds one timezone. A per-person currency belongs on the person's own row, and when that
 * column exists it should be passed in here; until then the product's own scope is the honest
 * answer, and it is said once instead of assumed everywhere.
 *
 * Conversion is deliberately absent. A ledger that mixes currencies and quietly adds them up
 * is worse than one that says it cannot: every figure here is in one currency, and money that
 * is not in it is refused rather than guessed at.
 */

/** The currency every figure in the ledger is in. */
export const LEDGER_CCY = (process.env.MONEY_CURRENCY || 'EUR').toUpperCase();

/**
 * How a figure is written where the ledger's money is spent. Spain writes 1.234,56 €; the
 * United States writes $1,234.56. The locale follows the currency rather than the reader,
 * because this is the ledger's own voice -- what the twin stores and what the page says in
 * the reader's language are separate, and readingWords.ts handles the second.
 */
const LOCALES = { EUR: 'es-ES', USD: 'en-US', GBP: 'en-GB', BRL: 'pt-BR', CHF: 'de-CH', SEK: 'sv-SE', DKK: 'da-DK', NOK: 'nb-NO', PLN: 'pl-PL' };

/** A formatter per currency, made once. */
const formatters = new Map();
function formatterFor(currency, maximumFractionDigits) {
  const ccy = String(currency || LEDGER_CCY).toUpperCase();
  const key = `${ccy}:${maximumFractionDigits}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat(LOCALES[ccy] || 'en-US', { style: 'currency', currency: ccy, maximumFractionDigits }));
  }
  return formatters.get(key);
}

/**
 * A figure, written. Defaults to the ledger's own currency.
 * @param {number} amount
 * @param {object} [opts]  { currency, maximumFractionDigits = 2 }
 */
export function money(amount, { currency = LEDGER_CCY, maximumFractionDigits = 2 } = {}) {
  return formatterFor(currency, maximumFractionDigits).format(Number(amount) || 0);
}

/**
 * Is this the ledger's money? A row with no currency is the ledger's own, because everything
 * written before there was a column to say otherwise was in it.
 */
export function ours(currency) {
  return !currency || String(currency).toUpperCase() === LEDGER_CCY;
}

/** The ledger's money, as the bank spells it, for a row being written. */
export const DEFAULT_CURRENCY = LEDGER_CCY;
