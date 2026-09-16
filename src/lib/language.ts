/**
 * The languages TwinMe speaks, and how a choice is kept. Apart from the component that
 * asks (LanguageAsk) so fast refresh keeps working and Settings can share the list.
 */
import { authFetch } from '@/services/api/apiBase';
import { rememberLang } from '@/lib/i18n';

export const LANGUAGES = [
  { code: 'en', name: 'English', line: 'The ledger speaks to you in English.' },
  { code: 'es', name: 'Espa\u00f1ol', line: 'El libro te habla en espa\u00f1ol.' },
  { code: 'pt-BR', name: 'Portugu\u00eas (Brasil)', line: 'O livro fala com voc\u00ea em portugu\u00eas.' },
] as const;
export type LanguageCode = typeof LANGUAGES[number]['code'];

/** Keep the choice on the account (users.preferred_language). */
export async function saveLanguage(code: LanguageCode): Promise<void> {
  const r = await authFetch('/account/language', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: code }) });
  if (!r.ok) throw new Error('The language could not be saved.');
  /* And in this browser, so the next visit opens in it rather than in English. */
  rememberLang(code);
}

/** The choice on the account, or null when never asked. */
export async function readLanguage(): Promise<LanguageCode | null> {
  const r = await authFetch('/account/language');
  const j = await r.json().catch(() => null);
  return j && j.success ? (j.language ?? null) : null;
}
