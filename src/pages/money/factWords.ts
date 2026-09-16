/**
 * How a fact the person gave is said back, on the You page and at the end of the questions:
 * one title that carries what they said, one grey word for what kind of thing it is.
 */
import type { MoneyFact } from '../../services/api/moneyAPI';

/* These words reach the screen through a variable, so the dictionaries never saw them and
   the You page read in English beside everything else (2026-09-16). Every one of them now
   passes through t; the default keeps the English for a caller that has no translator. */
type T = (s: string, vars?: Record<string, string | number>) => string;
const asIs: T = (s) => s;

export const FACT_WORD: Record<string, string> = {
  home_area: 'lives in', study_place: 'studies at', work_place: 'works at', commitment: 'every month',
  income: 'comes in', shared_cost: 'shared', person: 'who that is', merchant_kind: 'kind of place', goal: 'this term',
  keep: 'to have left at the end of the month', cap: 'the most it should take this month', split: 'split', spending: 'what counts as spending', note: 'in your words',
};

export function ordinal(n: number, t: T = asIs): string {
  if (n % 10 === 1 && n !== 11) return t('{n}st', { n });
  if (n % 10 === 2 && n !== 12) return t('{n}nd', { n });
  if (n % 10 === 3 && n !== 13) return t('{n}rd', { n });
  return t('{n}th', { n });
}

export function cap(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

/** The order facts take on You: money first, then places, then people, then kinds of place. */
const KIND_ORDER = ['income', 'commitment', 'keep', 'cap', 'shared_cost', 'split', 'goal', 'home_area', 'study_place', 'work_place', 'person', 'merchant_kind', 'spending'];
export function factRank(f: MoneyFact): number {
  const i = KIND_ORDER.indexOf(f.kind);
  return i === -1 ? KIND_ORDER.length : i;
}

/** The title of a fact row: what they said, in their words where there are any. */
export function factTitle(f: MoneyFact, t: T = asIs): string {
  /* A note is their sentence; the row keeps its first sixty characters and opens for the rest. */
  if (f.kind === 'note') { const v = String(f.value || ''); return v.length > 60 ? `${v.slice(0, 57).trim()}...` : v; }
  return [
    cap(f.subject_label || f.value || f.subject || t('unnamed')),
    f.subject_label && f.value ? f.value : '',
    f.day ? t('on the {day}', { day: ordinal(f.day, t) }) : '',
    f.share ? t('{n}% yours', { n: Math.round(Number(f.share) * 100) }) : '',
  ].filter(Boolean).join(', ');
}

/** The grey word under it: the ledger's own verdict on the claim when it has one, else the kind. */
export function factWord(f: MoneyFact, t: T = asIs): string {
  /* The ledger's own note on the claim is still composed on the server, in English. It is
     the last English sentence on this page and it is being moved next. */
  if (f.check_note) return f.check_note;
  const word = cap(FACT_WORD[f.kind] ? t(FACT_WORD[f.kind]) : f.kind.replace(/_/g, ' '));
  return f.note ? `${word}, ${f.note}` : word;
}
