/**
 * The pages in the person's language.
 *
 * English is the source: every string in the pages is written in English and looked up in
 * the dictionary of the chosen language (users.preferred_language: en, es, pt-BR). A string
 * the dictionary does not hold stays in English rather than breaking, and the gap is a
 * line to add in es.ts or pt-BR.ts. Numbers keep the es-ES shape everywhere (12,50 EUR is
 * how the ledger writes); dates follow the language.
 *
 *   const t = useT();            t('Today')  -> 'Hoy'
 *   const locale = useLocale();  'en-GB' | 'es-ES' | 'pt-BR' for toLocaleDateString
 *
 * Strings with a value in them use {name} holes: t('{n} payments', { n: 4 }).
 */
import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ES } from './es';
import { PT_BR } from './pt-BR';
import { ES_MONEY } from './es.money';
import { PT_BR_MONEY } from './pt-BR.money';

export type Lang = 'en' | 'es' | 'pt-BR';
const DICT: Record<Lang, Record<string, string>> = { en: {}, es: { ...ES, ...ES_MONEY }, 'pt-BR': { ...PT_BR, ...PT_BR_MONEY } };
const LOCALE: Record<Lang, string> = { en: 'en-GB', es: 'es-ES', 'pt-BR': 'pt-BR' };

export function langOf(user: unknown): Lang {
  const l = (user as { preferred_language?: string | null } | null)?.preferred_language;
  return l === 'es' || l === 'pt-BR' ? l : 'en';
}

/** The string in a language, holes filled; English when the dictionary has no line for it. */
export function translate(lang: Lang, source: string, holes?: Record<string, string | number>): string {
  const line = (DICT[lang] && DICT[lang][source]) || source;
  return holes ? line.replace(/\{(\w+)\}/g, (_, k) => (k in holes ? String(holes[k]) : `{${k}}`)) : line;
}

export function useLang(): Lang { const { user } = useAuth(); return langOf(user); }
export function useLocale(): string { return LOCALE[useLang()]; }
export function useT(): (source: string, holes?: Record<string, string | number>) => string {
  const lang = useLang();
  return useCallback((source: string, holes?: Record<string, string | number>) => translate(lang, source, holes), [lang]);
}
