/**
 * Account: where it reads from, the language, what it keeps (2026-09-21). These sat at the
 * bottom of You, under what the ledger knows about the person; they are settings, not
 * knowledge, so they have a page of their own.
 */

import type { MoneyAccount } from '../useMoneyAccount';
import Sources from './you/Sources';
import Account from './you/Account';

export default function AccountView({ m }: { m: MoneyAccount }) {
  const { t } = m;
  return (
    <>
          <section className="mv-hero" id="account-title">
            <p className="mv-eyebrow">{t('Account')}</p>
            <h1>{t('Account.')}</h1>
            <p className="mv-sub">{t('Where it reads from, the language, what it keeps.')}</p>
          </section>
      <Sources m={m} />
      <Account m={m} />
    </>
  );
}
