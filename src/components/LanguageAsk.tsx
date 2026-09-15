/**
 * The first thing TwinMe asks a new person: which language it should speak.
 *
 * Asked in English, once, over the money pages, until an answer is kept; changeable later
 * under Settings. Three choices as rows under the ink rule, one primary button. The choice
 * goes to the account (users.preferred_language) and the overlay closes at once; the twin
 * reads the choice on its next answer, and the app's copy follows it as the pages learn to.
 */
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LANGUAGES, saveLanguage, type LanguageCode } from '@/lib/language';
import '@/styles/money-v2.css';

export default function LanguageAsk({ onDone }: { onDone?: () => void } = {}) {
  const { user } = useAuth();
  const [picked, setPicked] = useState<LanguageCode>('en');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Only a person the server has said was never asked (null), never a cached user missing the field. */
  const asked = (user as { preferred_language?: string | null } | null)?.preferred_language;
  if (!user || asked !== null || done) return null;

  async function keep() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await saveLanguage(picked); setDone(true); onDone?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mv la" role="dialog" aria-modal="true" aria-labelledby="la-title">
      <div className="la-col">
        <h1 id="la-title">Which language should TwinMe speak?</h1>
        <p className="mv-sub">You can change it later under Settings.</p>
        <ul className="mv-list" role="radiogroup" aria-label="Language">
          {LANGUAGES.map((l) => (
            <li key={l.code}>
              <button type="button" role="radio" aria-checked={picked === l.code} className={`mv-item la-choice${picked === l.code ? ' is-picked' : ''}`} onClick={() => setPicked(l.code)}>
                <span className="mv-item-text">
                  <span className="mv-item-title">{l.name}</span>
                  <span className="mv-item-sub">{l.line}</span>
                </span>
                <span className="la-dot" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        {error ? <p className="mv-note" role="status">{error}</p> : null}
        <div className="mv-ctas"><button type="button" className="mv-pill" disabled={busy} onClick={() => void keep()}>{busy ? 'Keeping' : 'Continue'}</button></div>
      </div>
    </div>
  );
}
