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
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type Lang = 'en' | 'es' | 'pt-BR';
/* A dictionary arrives only for the language spoken (M3-2, 2026-09-19): both together were
   119 KB of the entry chunk for everyone, English readers included. English needs none.
   main.tsx asks for the remembered language before the first frame, and a signed-in page
   waits for the account's before it paints, so nobody reads a line in the wrong language. */
const DICT: Record<Lang, Record<string, string>> = { en: {}, es: {}, 'pt-BR': {} };
const READY: Record<Lang, boolean> = { en: true, es: false, 'pt-BR': false };
const LOADING: Partial<Record<Lang, Promise<void>>> = {};
let version = 0;
const listeners = new Set<() => void>();
const LOCALE: Record<Lang, string> = { en: 'en-GB', es: 'es-ES', 'pt-BR': 'pt-BR' };

/** Whether the dictionary for a language is here, so a page can be said in it. */
export function dictReady(lang: Lang): boolean { return READY[lang]; }

/** Fetches a language's dictionary once; resolves when it is here. English resolves at once. */
export function ensureDict(lang: Lang): Promise<void> {
  if (READY[lang]) return Promise.resolve();
  if (LOADING[lang]) return LOADING[lang] as Promise<void>;
  const load = lang === 'es'
    ? Promise.all([import('./es'), import('./es.money')]).then(([a, b]) => { DICT.es = { ...a.ES, ...b.ES_MONEY }; })
    : Promise.all([import('./pt-BR'), import('./pt-BR.money')]).then(([a, b]) => { DICT['pt-BR'] = { ...a.PT_BR, ...b.PT_BR_MONEY }; });
  LOADING[lang] = load.then(() => { READY[lang] = true; version += 1; listeners.forEach((l) => l()); }, (error) => { delete LOADING[lang]; throw error; });
  return LOADING[lang] as Promise<void>;
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => version;
/** Whether a language's dictionary is here, re-rendering the caller the moment it lands. */
export function useDictReady(lang: Lang): boolean {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { if (!READY[lang]) void ensureDict(lang).catch(() => { /* English stands until it arrives */ }); }, [lang]);
  return READY[lang];
}

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
  /* Re-rendered when a dictionary lands, so a line said before it arrived is said again in it. */
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void ensureDict(lang).catch(() => { /* English stands until it arrives */ }); }, [lang]);
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
