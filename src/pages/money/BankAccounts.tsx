import { useState } from 'react';
import { useLocale, useT } from '@/lib/i18n';
import { moneyAPI, shortDay, type MoneyAccount, type MoneyCard } from '@/services/api/moneyAPI';

function Account({ account }: { account: MoneyAccount }) {
  const t = useT();
  const locale = useLocale();
  const [saved, setSaved] = useState<Record<string, MoneyCard>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  async function label(last4: string, type: MoneyCard['type']) {
    setBusy(last4); setError(false);
    try {
      const card = await moneyAPI.labelCard(account.id, last4, type);
      setSaved((all) => ({ ...all, [last4]: card }));
    } catch { setError(true); }
    finally { setBusy(null); }
  }
  return <li className="mv-bank-account">
    <h3>{account.name || t('Account')} {account.iban_mask || ''}</h3>
    <p className="mv-quiet">{account.currency} · {t('Bank account')}{account.last_pulled_at ? ` · ${t('last read {day}', { day: shortDay(account.last_pulled_at, locale) })}` : ''}</p>
    {(account.cards || []).length ? <ul className="mv-account-cards">
      {account.cards!.map((original) => {
        const card = saved[original.last4] || original;
        return <li key={card.last4} className="mv-card-row">
          <label htmlFor={`card-${account.id}-${card.last4}`}>
            <span>{t('Card ending {last4}', { last4: card.last4 })}</span>
            <span className="mv-quiet">{card.source === 'user' ? t('Type you confirmed') : t('Type not supplied by the bank')}</span>
          </label>
          <select id={`card-${account.id}-${card.last4}`} className="mv-field mv-field--select" value={card.type} disabled={busy !== null} onChange={(e) => void label(card.last4, e.target.value as MoneyCard['type'])}>
            <option value="unknown">{t('Unknown type')}</option><option value="debit">{t('Debit card')}</option><option value="credit">{t('Credit card')}</option>
          </select>
        </li>;
      })}
    </ul> : <p className="mv-quiet">{t('No card numbers were supplied with these payments.')}</p>}
    {Boolean(account.unidentified_card_payments) && Boolean(account.cards?.length) ? <p className="mv-quiet">{t('Some card payments have no card number.')}</p> : null}
    {error ? <p role="alert">{t('The card type could not be saved. Try again.')}</p> : null}
  </li>;
}

export default function BankAccounts({ accounts }: { accounts: MoneyAccount[] }) {
  return <ul className="mv-sublist">{accounts.map((a) => <Account key={a.id} account={a} />)}</ul>;
}
