/**
 * WhatsApp as a place the ledger answers when the person writes, and nothing else. The sentence
 * under the title is the consent; linking is a number and the code sent to it. Shown to the beta only.
 */

import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useWhatsAppLink } from '@/hooks/useWhatsAppLink';
import { API_URL, getAccessToken } from '@/services/api/apiBase';
import type { MoneyAccount } from '../../useMoneyAccount';

async function recordOptIn(): Promise<void> {
  const token = getAccessToken();
  await fetch(`${API_URL}/money/channel/opt-in`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }).catch(() => undefined);
}

export default function WhatsAppSource({ m }: { m: MoneyAccount }) {
  const { t } = m;
  const link = useWhatsAppLink();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  if (link.loading) return null;
  return (
    <li>
      <div className="mv-item mv-item--icon">
        <span className="mv-icon" aria-hidden="true"><MessageCircle size={16} /></span>
        <span className="mv-item-text">
          <span className="mv-item-title">{t('WhatsApp')}</span>
          <span className="mv-item-sub">{link.step === 'linked' ? (link.linkedPhone || t('Linked.')) : t('It answers when you write. Nothing is sent unless you write first.')}</span>
        </span>
        <span className="mv-item-end">
          {link.step === 'linked' ? <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void link.unlink()} disabled={link.busy}>{t('Remove')}</button> : null}
        </span>
      </div>
      <p className="mv-body mv-body--icon mv-quiet">
        {t('Nothing is sent unless you write first. Remove the number here to disconnect it.')}
      </p>
      {link.step === 'phone' ? (
        <form className="mv-body mv-body--icon" onSubmit={(e) => { e.preventDefault(); void link.requestCode(phone); }}>
          <input className="mv-field" inputMode="tel" autoComplete="tel" placeholder="+34 600 000 000" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label={t('Your WhatsApp number')} />
          <button type="submit" className="mv-pill mv-pill--ghost" disabled={link.busy || !phone.trim()}>{t('Send a code')}</button>
        </form>
      ) : null}
      {link.step === 'code' ? (
        <form className="mv-body mv-body--icon" onSubmit={(e) => { e.preventDefault(); void link.verifyCode(code).then((ok) => { if (ok) void recordOptIn(); }); }}>
          <input className="mv-field" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} aria-label={t('The code sent to your WhatsApp')} />
          <button type="submit" className="mv-pill mv-pill--ghost" disabled={link.busy || code.trim().length < 6}>{t('Link')}</button>
          <button type="button" className="mv-link" onClick={link.cancel}>{t('Use another number')}</button>
        </form>
      ) : null}
      {link.error ? <p className="mv-body mv-body--icon mv-quiet" role="alert">{link.error}</p> : null}
    </li>
  );
}
