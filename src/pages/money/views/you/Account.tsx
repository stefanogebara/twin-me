/**
 * Your account: the language, signing out, what it keeps, and deleting everything (2026-09-21).
 * The money app had no way to leave, switch language or erase oneself; those lived only in the
 * legacy twin's sidebar. Rows under a rule, in the register; deleting is two taps.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/lib/i18n';
import { saveLanguage } from '@/lib/language';
import { moneyAPI } from '../../../../services/api/moneyAPI';
import type { MoneyAccount } from '../../useMoneyAccount';
import { languageRows, nextDeleteStep, keepsLine, deleteWarning, type DeleteStep } from './accountWords';

export default function Account({ m }: { m: MoneyAccount }) {
  const { t } = m;
  const { user, signOut, patchUser } = useAuth();
  const lang = useLang();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<'language' | 'signout' | 'delete' | null>(null);
  const [step, setStep] = useState<DeleteStep>('closed');
  const [error, setError] = useState<string | null>(null);

  async function pick(code: Parameters<typeof saveLanguage>[0]) {
    if (code === lang || busy) return;
    setBusy('language'); setError(null);
    try { await saveLanguage(code); patchUser?.({ preferred_language: code }); window.location.reload(); } catch (e) { setError((e as Error).message); setBusy(null); }
  }
  async function leave() {
    setBusy('signout');
    try { await signOut(); navigate('/'); } finally { setBusy(null); }
  }
  async function erase() {
    const next = nextDeleteStep(step, 'confirm');
    setStep(next);
    if (next !== 'deleting') return;
    setBusy('delete'); setError(null);
    try { await moneyAPI.deleteAccount(); await signOut(); navigate('/'); } catch (e) { setError((e as Error).message); setStep('armed'); setBusy(null); }
  }

  return (
          <section className="mv-section" id="account">
            <h2>{t('Your account.')}</h2>
            <p className="mv-sub">{t('The language, signing out, what it keeps.')}</p>
            <ul className="mv-list">
              <li>
                <div className="mv-item">
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('Language')}</span>
                    <span className="mv-item-sub">{t('It answers and writes in this one.')}</span>
                  </span>
                  <span className="mv-item-end rg-choices" role="group" aria-label={t('Language')}>
                    {languageRows(lang).map((l) => (
                      <button key={l.code} type="button" className="mv-pill mv-pill--ghost rg-choice" aria-pressed={l.current} onClick={() => void pick(l.code)} disabled={busy !== null}>{l.name}</button>
                    ))}
                  </span>
                </div>
              </li>
              <li>
                <div className="mv-item">
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('Signed in')}</span>
                    <span className="mv-item-sub">{user?.email || ''}</span>
                  </span>
                  <span className="mv-item-end"><button type="button" className="mv-pill mv-pill--ghost" onClick={() => void leave()} disabled={busy !== null}>{t('Sign out')}</button></span>
                </div>
              </li>
              <li>
                <div className="mv-item">
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('What it keeps')}</span>
                    <span className="mv-item-sub">{keepsLine(t)}</span>
                  </span>
                  <span className="mv-item-end"><Link to="/privacy-policy" className="mv-pill mv-pill--ghost">{t('Read')}</Link></span>
                </div>
              </li>
              <li>
                <div className="mv-item">
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('Delete my data')}</span>
                    <span className="mv-item-sub">{step === 'closed' ? t('Two taps, and it is gone.') : deleteWarning(t)}</span>
                  </span>
                  <span className="mv-item-end">
                    {step === 'closed'
                      ? <button type="button" className="mv-pill mv-pill--ghost" onClick={() => setStep(nextDeleteStep(step, 'open'))} disabled={busy !== null}>{t('Delete')}</button>
                      : (
                        <span className="rg-choices">
                          <button type="button" className="mv-pill mv-pill--ghost" onClick={() => setStep(nextDeleteStep(step, 'cancel'))} disabled={busy === 'delete'}>{t('Keep it')}</button>
                          <button type="button" className="mv-pill mv-pill--danger" onClick={() => void erase()} disabled={busy === 'delete'}>{busy === 'delete' ? t('Deleting') : t('Delete everything')}</button>
                        </span>
                      )}
                  </span>
                </div>
                {error ? <p role="alert" className="mv-note">{error}</p> : null}
              </li>
            </ul>
          </section>
  );
}
