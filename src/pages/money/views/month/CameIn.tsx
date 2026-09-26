/**
 * Where the month's money came from: a payer a row under the ink rule, largest first, five at
 * most and the rest as one row with its own sum (2026-09-26; the owner: "not all money is only
 * spent"). Every figure is the server's (inflow.js), so the rows add up to the line above them
 * without the page adding anything. A month with nothing in says nothing.
 */

import { euro, shortDay } from '../../../../services/api/moneyAPI';
import { merchantLabel } from '../../words';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function CameIn({ m }: { m: MoneyAccount }) {
  const { t, locale, flows, monthKey } = m;
  if (!flows || flows.month.slice(0, 7) !== monthKey || !(flows.money_in > 0) || !flows.sources.length) return null;
  return (
          <section className="mv-section" id="came-in">
            <h2>{t('Where it came from this month.')}</h2>
            <p className="mv-sub">{t('{amount} in all, largest first.', { amount: euro(flows.money_in) })}</p>
            <ol className="mv-list">
              {flows.sources.map((s) => (
                <li key={s.key} className="mv-item mv-item--tight">
                  <span className="mv-item-text">
                    <span className="mv-item-title">{merchantLabel({ merchant_name: s.name, merchant_key: s.key }, t)}</span>
                    <span className="mv-item-sub">{s.count > 1 ? t('{n} payments, the last on {day}', { n: s.count, day: shortDay(s.last_at, locale) }) : shortDay(s.last_at, locale)}</span>
                  </span>
                  <span className="mv-item-end mv-figures">{euro(s.amount)}</span>
                </li>
              ))}
              {flows.more_sources ? (
                <li className="mv-item mv-item--tight">
                  <span className="mv-item-sub">{t('and {n} more', { n: flows.more_sources })}</span>
                  <span className="mv-item-end mv-figures">{euro(flows.more_amount)}</span>
                </li>
              ) : null}
            </ol>
          </section>
  );
}
