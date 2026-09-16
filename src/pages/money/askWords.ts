/**
 * A question, asked in the reader's own language.
 *
 * The ledger composes every question in English, because the model reads the same text; the
 * fixed ones go through the dictionary as they are, and the ones carrying a name or an
 * amount travel with their parts beside them (`say`). Both pages that show a question use
 * this, so they never drift apart (2026-09-16).
 */
import { dayBehind, ordinal } from './readingWords';
import type { MoneyQuestion } from '../../services/api/moneyAPI';

type T = (s: string, vars?: Record<string, string | number>) => string;

export function askWords(q: MoneyQuestion, t: T, locale: string): string {
  if (!q.say?.key) return t(q.ask);
  const vars: Record<string, string | number> = { ...q.say.vars };
  /* A day arrives as a date; a person says it as a day. */
  if (typeof vars.day === 'string' && /^\d{4}-\d{2}-\d{2}/.test(vars.day)) vars.day = dayBehind(vars.day, t, locale);
  else if (typeof vars.day === 'number') vars.day = ordinal(t, vars.day);
  return t(q.say.key, vars);
}
