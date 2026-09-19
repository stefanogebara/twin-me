/**
 * The words and parsers of the setup questions: the kinds of place, the shares people name
 * out loud, the placeholders, and how a typed amount, day or share becomes a number.
 * (Split from MoneySetupPage on 2026-09-19, M2-2b.)
 */
/** The words a kind of place can be given, matching what the categoriser itself uses. */
export const CATEGORIES = [
  'groceries', 'eating out', 'coffee', 'transport', 'taxi', 'fuel', 'health', 'pharmacy',
  'sport', 'education', 'clothing', 'home', 'electronics', 'entertainment', 'software',
  'advertising', 'travel', 'lodging', 'cash', 'fees', 'transfers', 'bills', 'other',
];

/** Shares a person actually names out loud, so the common answer is one press. */
export const SHARES: [string, number][] = [['a half', 50], ['a third', 33], ['a quarter', 25], ['two thirds', 67]];

/* English source strings; the page says them through t(), so the dictionaries hold them. */
export const PLACEHOLDER: Record<string, string> = {
  name: 'Rent', source: 'Family', what: 'The weekly shop', amount: '500', day: '1',
};


export type ListRow = { key: string; label: string; amount: string; day: string; share: string };

let rowSeq = 0;
export function blankRow(): ListRow { rowSeq += 1; return { key: `r${rowSeq}`, label: '', amount: '', day: '', share: '50' }; }

/** A stable key for a fact the person named, so the same rent typed twice is one fact. */
export function slug(s: string) { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed'; }
export function listColumns(input: string) { return input.slice('list:'.length).split(',').map((c) => c.trim()).filter(Boolean); }
export function choiceOptions(input: string) { return input.slice('choice:'.length).split(',').map((c) => c.trim()).filter(Boolean); }
/** People write 49,25 as often as 49.25, and both mean the same money. */
export function parseAmount(s: string): number | undefined {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : undefined;
}
export function parseDay(s: string): number | undefined {
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : undefined;
}
export function parseShare(s: string): number | undefined {
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(1, Math.round(n) / 100);
}

/** The 1st, not the 1. A system that cannot spell a date is not trusted with a number. */

