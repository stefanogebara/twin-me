/**
 * What comes back on its own, and whether it gets used.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { useState } from 'react';
import { euro, shortDay } from '../../../../services/api/moneyAPI';
import Chevron from '../../Chevron';
import { readingWords } from '../../readingWords';
import { merchantLabel, ordinalDay, CADENCE } from '../../words';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function Recurring({ m }: { m: MoneyAccount }) {
  const { t, locale, recurring, usage, monthlyLoad, subscriptions, bills } = m;
  const [openSeries, setOpenSeries] = useState<string | null>(null);
  return (
          <section className="mv-section" id="recurring">
            <h2>{t('What comes back on its own.')}</h2>
            {recurring.length === 0 ? (
              <div className="mv-list"><p className="mv-empty">{t('A charge counts once it has come back three times at the same rhythm.')}</p></div>
            ) : (
              <>
                {monthlyLoad ? <p className="mv-sub">{t('{amount} of it leaves every month.', { amount: euro(monthlyLoad) })}</p> : null}
                <ul className="mv-list">
                  {[...subscriptions, ...bills].map((r) => {
                    const isOpen = openSeries === r.merchant_key;
                    const name = merchantLabel({ merchant_name: r.merchant_name, merchant_key: r.merchant_key }, t);
                    const more = [
                      r.day_of_month ? t('Lands on the {day}.', { day: ordinalDay(t, r.day_of_month) }) : '',
                      typeof r.total_paid === 'number' ? t(r.occurrences === 1 ? '{amount} so far, over {n} charge.' : '{amount} so far, over {n} charges.', { amount: euro(r.total_paid), n: r.occurrences }) : '',
                      typeof r.uses === 'number'
                        ? r.cost_per_use
                          ? t(r.uses === 1 ? 'Used {n} time this month, {amount} a use.' : 'Used {n} times this month, {amount} a use.', { n: r.uses, amount: euro(r.cost_per_use) })
                          : t(r.uses === 1 ? 'Used {n} time this month.' : 'Used {n} times this month.', { n: r.uses })
                        : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <li key={r.merchant_key}>
                        <button type="button" className="mv-item mv-item--icon" aria-expanded={isOpen} onClick={() => setOpenSeries(isOpen ? null : r.merchant_key)}>
                          <span className="mv-icon" aria-hidden="true">{name.charAt(0)}</span>
                          <span className="mv-item-text">
                            <span className="mv-item-title">{name}</span>
                            <span className="mv-item-sub">
                              {/* Six rows that each began "Recurring, every month" said the cadence
                                  six times; the date is what differs (2026-09-21). */}
                              {[CADENCE[r.cadence] ? t(CADENCE[r.cadence]) : r.cadence, r.next_expected ? t('next around {day}', { day: shortDay(r.next_expected, locale) }) : ''].filter(Boolean).join(', ')}
                            </span>
                          </span>
                          <span className="mv-item-end">{euro(r.typical_amount)}<Chevron /></span>
                        </button>
                        {isOpen ? (
                          <div className="mv-body mv-body--icon">
                            {more ? <p className="mv-quiet">{more}</p> : null}
                            {r.charges?.length ? (
                              <ul className="mv-sublist">
                                {r.charges.map((c) => (
                                  <li key={c.id} className="mv-item mv-item--tight">
                                    <span className="mv-item-sub">{shortDay(c.occurred_at, locale)}</span>
                                    <span className="mv-item-end">{euro(c.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {/* Whether a subscription was used, and the honest gap where nothing can look: the
                same section, one grey line further down, not a heading of its own. */}
            {usage && usage.findings.length ? (
              <>
              <p className="mv-sub mv-more" id="usage">
                {t('Whether it gets used, read from the accounts it can see.')}
              </p>
              <ul className="mv-list">
                {usage.findings.map((f) => (
                  <li key={f.kind + f.sentence} className="mv-item">
                    <span className="mv-item-text">
                      {(() => { const said = readingWords(f, t, locale); return (<>
                        <span className="mv-item-title">{said.sentence}</span>
                        {said.detail ? <span className="mv-item-sub">{said.detail}</span> : null}
                      </>); })()}
                    </span>
                  </li>
                ))}
              </ul>
              </>
            ) : null}
          </section>
  );
}
