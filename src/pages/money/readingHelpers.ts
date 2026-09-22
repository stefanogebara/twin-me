/**
 * The words the readings are made of: numbers as numbers, days as days, kinds of place as
 * words, in the reader's language. readingWords.ts says a reading; readingSayers.ts holds
 * one sayer per kind; this is what both stand on (split 2026-09-19, M2-2b).
 */

export type T = (s: string, vars?: Record<string, string | number>) => string;
export type Numbers = Record<string, unknown>;
/** What a reading needs to be said again; both the stored readings and the usage findings fit. */
export type Sayable = {
  kind: string;
  numbers?: Numbers | Record<string, unknown> | null;
  month?: string | null;
  evidence_count?: number;
  sentence: string;
  detail?: string | null;
  /* Only the name and the day are read from a receipt here, so a pattern's shorter row fits. */
  receipts?: { id: string; occurred_at: string; merchant_raw?: string | null; merchant_key?: string | null }[];
};

export const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/* --------------------------------------------------------------------- words for numbers */

/** The day of a month, said as that language says it. */
export function ordinal(t: T, day: number): string {
  if (day % 10 === 1 && day !== 11) return t('{n}st', { n: day });
  if (day % 10 === 2 && day !== 12) return t('{n}nd', { n: day });
  if (day % 10 === 3 && day !== 13) return t('{n}rd', { n: day });
  return t('{n}th', { n: day });
}

/** A weekday by its index, 0 Sunday, in the reader's own calendar. */
export function weekdayName(index: number, locale: string): string {
  /* 2026-09-13 was a Sunday, so the index falls straight onto the date. */
  const d = new Date(Date.UTC(2026, 8, 13 + (((index % 7) + 7) % 7)));
  return d.toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });
}

/** A month from a YYYY-MM or a full date. */
export function monthName(ym: string | null | undefined, locale: string, shift = 0): string {
  if (!ym) return '';
  const d = new Date(`${String(ym).slice(0, 7)}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCMonth(d.getUTCMonth() + shift);
  return d.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });
}

/**
 * Today, where the person is reading. `toISOString` is UTC, so in Spain everything between
 * midnight and two in the morning called today yesterday (2026-09-16); the browser's own
 * zone is the right answer here, and en-CA is the shape every key in the ledger has.
 */
export const todayHere = (now = new Date()) => now.toLocaleDateString('en-CA');

/** The day a payment falls on where the person is, from its instant. */
export const localDay = (at: string | Date) => {
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
};

/** A day coming: today, tomorrow, the weekday it falls on, or its date. */
export function dayAhead(iso: string, t: T, locale: string, now = new Date()): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(iso);
  const days = Math.round((d.getTime() - new Date(`${todayHere(now)}T12:00:00Z`).getTime()) / 86400000);
  if (days <= 0) return t('today');
  if (days === 1) return t('tomorrow');
  if (days < 7) return weekdayName(d.getUTCDay(), locale);
  return t('the {day}', { day: ordinal(t, d.getUTCDate()) });
}

/** A day gone: today, yesterday, the weekday it was, or its date. */
export function dayBehind(iso: string, t: T, locale: string, now = new Date()): string {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(iso);
  const days = Math.round((new Date(`${todayHere(now)}T12:00:00Z`).getTime() - d.getTime()) / 86400000);
  if (days <= 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 7) return weekdayName(d.getUTCDay(), locale);
  return t('the {day}', { day: ordinal(t, d.getUTCDate()) });
}

/** A day and its month, for a first sighting. */
export const dayAndMonth = (iso: string, locale: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' });
};

/** Names read as a person reads them: two with an and, more with commas and an and. */
export function listOf(t: T, names: string[]): string {
  const xs = names.filter(Boolean);
  if (xs.length <= 1) return xs[0] || '';
  if (xs.length === 2) return t('{a} and {b}', { a: xs[0], b: xs[1] });
  return t('{a} and {b}', { a: xs.slice(0, -1).join(', '), b: xs[xs.length - 1] });
}

/* The product's word for a kind of place. A place the person named keeps their own word. */
export const CATEGORY_WORD: Record<string, string> = {
  'eating out': 'Eating out', coffee: 'Coffee', groceries: 'Groceries', transport: 'Transport', taxi: 'Taxis',
  entertainment: 'Going out', clothing: 'Clothes', health: 'Health', pharmacy: 'Pharmacy', sport: 'Sport',
  software: 'Software', travel: 'Travel', education: 'Education', home: 'Home', electronics: 'Electronics',
  fuel: 'Fuel', lodging: 'Lodging', cash: 'Cash', fees: 'Fees', rent: 'Rent', bills: 'Bills', other: 'Other',
  advertising: 'Advertising',
};
/** The word for a kind of place, capitalised as a line's first word. */
export function categoryWord(t: T, category: string | null): string {
  if (!category) return t('Other');
  const word = CATEGORY_WORD[category];
  return word ? t(word) : category.charAt(0).toUpperCase() + category.slice(1);
}
/** The same word inside a sentence, where the language decides the case. */
export const categoryInline = (t: T, category: string | null) => categoryWord(t, category).toLocaleLowerCase();

export const CADENCE_AMOUNT: Record<string, string> = {
  weekly: '{amount} a week', biweekly: '{amount} every two weeks', monthly: '{amount} a month',
  quarterly: '{amount} every three months', yearly: '{amount} a year',
};
export const PLATFORM_LABEL: Record<string, string> = {
  spotify: 'Spotify', google_calendar: 'Calendar', youtube: 'YouTube', google_gmail: 'Gmail',
  discord: 'Discord', github: 'GitHub', whoop: 'Whoop', instagram: 'Instagram', outlook: 'Outlook',
};
/* Brand names stay as they are; the calendar is the one word of ours in the list. */
export const platformLabel = (t: T, platform: string | null) => (platform === 'google_calendar' ? t('Calendar') : (platform ? PLATFORM_LABEL[platform] || platform : ''));

/* The three weeks the covariates know. They arrive as English phrases. */
export const weekPhrase = (t: T, week: unknown) => (typeof week === 'string' && week ? t(week) : '');

/* ------------------------------------------------------------------ the day's own line */

/** What the allowance sends, beyond its number. */
export type Allowance = {
  amount: number | null; basis: 'balance' | 'income' | 'typical' | 'student_prior' | null; basis_label?: string | null;
  horizon?: { day: string | null; days: number; source: string | null } | null; balance?: { amount: number; banks: string[]; reported?: number; adjustment?: number } | null;
  base?: number | null; keep?: number | null; free: number | null; over: boolean; days_left: number | null;
  spent?: number | null; committed?: number | null; calendar_ahead?: number | null;
  shape?: { weekday: number; ratio: number } | null;
  sentence: string | null;
};

/**
 * The line under today's number, in the reader's own language: what the day's share rests
 * on, what has already gone, and why today is worth more or less than an even split. The
 * ledger keeps composing its English one for the twin; this says the same thing from the
 * same numbers.
 */
/* A bank is a name, not a phrase; the fallback stays outside the translator's reach. */
/* The ledger writes "your bank" where the bank did not give its name, and the page said it
   in the middle of a Portuguese sentence: "Dos 240,88 EUR que ha no your bank". A name is
   kept as it is; a placeholder is words, and words are said in the reader's language. The
   old fallback here named Santander, which is a fact about somebody's bank that nobody had
   established (2026-09-18). */
export const UNNAMED_BANK = 'your bank';
export const bankNames = (a: Allowance, t: T) => (a.balance?.banks || [])
  .map((bank) => (bank === UNNAMED_BANK ? t('your bank') : bank))
  .join(t(' and ')) || t('your bank');

/** What a sayer hands back: the sentence, and the grey line under it when there is one. */
export type Said = { sentence: string; detail: string | null };
