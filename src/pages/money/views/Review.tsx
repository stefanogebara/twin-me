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
import { reviewRows, groupReviewRows } from '../review';
import type { MoneyAccount } from '../useMoneyAccount';

export default function Review({ m }: { m: MoneyAccount }) {
  const { t, locale, ledger, verdict } = m;
  const [open, setOpen] = useState<string | null>(null);
  const payments = reviewRows(ledger);
  if (!payments.length) return null;
  const rows = groupReviewRows(payments);
  /* "Ninety seconds" named a ritual and not what was on the screen; Stefano flagged it on the
     21st and a second reader did on the 22nd. The heading says what the list is. */
  return (
    <section className="mv-section" id="review">
      <h2>{t('What weighed most.')}</h2>
      {/* No count: five payments in four rows read as an error to anyone who did not add them up. */}
      <p className="mv-sub">{t(payments.length === 1 ? 'The largest payment of the week.' : 'The largest payments of the week.')}</p>
      <ul className="mv-list">
        {rows.map((row) => {
          const isOpen = open === row.id;
          const first = row.rows[0];
          return (
            <li key={row.id}>
              {/* The same row as a payment anywhere else: the day in its column, the name, the figure. */}
              <button type="button" className="mv-item mv-item--dated" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : row.id)}>
                <span className="mv-ahead-day">{shortDay(row.occurred_at, locale)}</span>
                <span className="mv-item-text">
                  <span className="mv-item-title">{merchantLabel(first, t)}</span>
                  {row.rows.length > 1 ? <span className="mv-item-sub">{t('{n} payments', { n: row.rows.length })}</span> : null}
                </span>
                <span className="mv-item-end mv-figures">{euro(row.amount)}<Chevron /></span>
              </button>
              {isOpen ? (
                <div className="mv-body">
                  <div className="mv-verdicts">
                    <button type="button" className="mv-pill mv-pill--ghost" onClick={() => { setOpen(null); for (const r of row.rows) void verdict(r, 'worth_it'); }}>{t('Worth it')}</button>
                    <button type="button" className="mv-pill mv-pill--ghost" onClick={() => { setOpen(null); for (const r of row.rows) void verdict(r, 'not_me'); }}>{t('Not me')}</button>
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
