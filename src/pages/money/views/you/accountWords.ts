/**
 * The words of the account section on You (2026-09-21): the language, signing out, what is
 * kept, and deleting everything. Pure, so the lines can be tested without a page.
 */
import { LANGUAGES, type LanguageCode } from '@/lib/language';

export type T = (source: string, holes?: Record<string, string | number>) => string;

/** The three languages as rows: code, its own name, whether it is the one in use. */
export function languageRows(current: string): { code: LanguageCode; name: string; current: boolean }[] {
  return LANGUAGES.map((l) => ({ code: l.code, name: l.name, current: l.code === current }));
}

/** Deleting is two taps, never one: the first opens the warning, the second deletes. */
export type DeleteStep = 'closed' | 'armed' | 'deleting';
export function nextDeleteStep(step: DeleteStep, tap: 'open' | 'confirm' | 'cancel'): DeleteStep {
  if (tap === 'cancel') return 'closed';
  if (tap === 'open') return step === 'closed' ? 'armed' : step;
  return step === 'armed' ? 'deleting' : step;
}

export function keepsLine(t: T): string {
  return t('It keeps your ledger, what you told it and the bank consents. Nothing is used to train a model.');
}

export function deleteWarning(t: T): string {
  return t('Everything goes: the ledger, the receipts, what you said, the bank consents. There is no way back.');
}
