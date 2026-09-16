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
import { useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ES } from './es';
import { PT_BR } from './pt-BR';
import { ES_MONEY } from './es.money';
import { PT_BR_MONEY } from './pt-BR.money';

export type Lang = 'en' | 'es' | 'pt-BR';
const DICT: Record<Lang, Record<string, string>> = { en: {}, es: { ...ES, ...ES_MONEY }, 'pt-BR': { ...PT_BR, ...PT_BR_MONEY } };
const LOCALE: Record<Lang, string> = { en: 'en-GB', es: 'es-ES', 'pt-BR': 'pt-BR' };

const STORE = 'twinme:lang';
const known = (l: unknown): l is Lang => l === 'es' || l === 'pt-BR' || l === 'en';

/** The language this browser was last told to speak, if any. */
export function storedLang(): Lang | null {
  try { const l = localStorage.getItem(STORE); return known(l) ? l : null; } catch { return null; }
}
/** Remember it, so the very first frame of the next visit is already in it. */
export function rememberLang(lang: Lang): void {
  try { localStorage.setItem(STORE, lang); } catch { /* a convenience, not a fact */ }
}

/**
 * Which language to speak, given the account and what this browser remembers. The account
 * wins; the memory carries the first frames, before the account has loaded, which is when a
 * person used to be greeted in English on a Portuguese account (2026-09-16). Pure.
 */
export function langFrom(user: unknown, stored: Lang | null): Lang {
  const l = (user as { preferred_language?: string | null } | null)?.preferred_language;
  if (known(l)) return l;
  return stored || 'en';
}

export function langOf(user: unknown): Lang {
  return langFrom(user, null);
}

/** The string in a language, holes filled; English when the dictionary has no line for it. */
export function translate(lang: Lang, source: string, holes?: Record<string, string | number>): string {
  const line = (DICT[lang] && DICT[lang][source]) || source;
  return holes ? line.replace(/\{(\w+)\}/g, (_, k) => (k in holes ? String(holes[k]) : `{${k}}`)) : line;
}

export function useLang(): Lang {
  const { user } = useAuth();
  const lang = langFrom(user, storedLang());
  /* Once the account has said which language it is, this browser keeps it for the next
     first frame; nothing else reads it. */
  useEffect(() => { if ((user as { preferred_language?: string | null } | null)?.preferred_language) rememberLang(lang); }, [user, lang]);
  return lang;
}
export function useLocale(): string { return LOCALE[useLang()]; }
export function useT(): (source: string, holes?: Record<string, string | number>) => string {
  const lang = useLang();
  return useCallback((source: string, holes?: Record<string, string | number>) => translate(lang, source, holes), [lang]);
}
