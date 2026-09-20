/**
 * Ninety seconds: the payments that weighed most on the week, one verdict each. A row opens
 * to its two verdicts, as a ledger row does; a payment with a verdict leaves the list, and
 * the section goes with the last one. Nothing here is generated: the rows are the ledger's
 * largest of the week without a verdict, and the verdicts are the same ones Month keeps.
 */
import { useState } from 'react';
import { euro, shortDay } from '../../../services/api/moneyAPI';
import Chevron from '../Chevron';
import { merchantLabel } from '../words';
import { reviewRows } from '../review';
import type { MoneyAccount } from '../useMoneyAccount';

export default function Review({ m }: { m: MoneyAccount }) {
  const { t, locale, ledger, verdict } = m;
  const [open, setOpen] = useState<string | null>(null);
  const rows = reviewRows(ledger);
  if (!rows.length) return null;
  return (
    <section className="mv-section" id="review">
      <h2>{t('Ninety seconds.')}</h2>
      <p className="mv-sub">{t(rows.length === 1 ? 'The payment that weighed most this week. Worth it, or not you?' : 'The {n} payments that weighed most this week. Worth it, or not you?', { n: rows.length })}</p>
      <ul className="mv-list">
        {rows.map((row) => {
          const isOpen = open === row.id;
          return (
            <li key={row.id}>
              <button type="button" className="mv-item" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.id)}>
                <span className="mv-item-text">
                  <span className="mv-item-title">{merchantLabel(row)}</span>
                  <span className="mv-item-sub">{shortDay(row.occurred_at, locale)}</span>
                </span>
                <span className="mv-item-end mv-figures">{euro(Math.abs(Number(row.amount)))}<Chevron /></span>
              </button>
              {isOpen ? (
                <div className="mv-body">
                  <div className="mv-verdicts">
                    <button type="button" className="mv-pill mv-pill--ghost" onClick={() => { setOpen(null); void verdict(row, 'worth_it'); }}>{t('Worth it')}</button>
                    <button type="button" className="mv-pill mv-pill--ghost" onClick={() => { setOpen(null); void verdict(row, 'not_me'); }}>{t('Not me')}</button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
