/**
 * The month opens on its figure, with the one drawing that says how it compares.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { ownCurrency, ledgerCurrency, euro } from '../../../../services/api/moneyAPI';
import { orbFor } from '../../orbFor';
import Wait from '../../../../components/Wait';
import MonthOrbits from '../../figures/MonthOrbits';
import { ordinalDay, monthName } from '../../words';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function MonthHero({ m }: { m: MoneyAccount }) {
  const { t, locale, forecast, today, ledger, months, categories, recurring, loaded, monthKey, monthRows, incomeEdge, todayDay, pairMax, last, monthLabel, zone } = m;
  return (
          <section className="mv-hero mv-hero--orb" id="month-title">
            <p className="mv-eyebrow">{t('Month')}</p>
            {/* The day says it is reading; the month printed an ellipsis where its figure goes,
                which reads as a broken number to anyone who has not seen it work. */}
            {!loaded ? <Wait inline state={orbFor('page')} line="Reading your month." /> : null}
            {/* The month as a constellation: a hub per kind of place, a dot per payee. It
                says nothing until tapped; the list it opens ends in the total. */}
            {categories && categories.groups.some((g) => g.spent > 0) ? (() => {
              const key = monthKey;
              return (
                <MonthOrbits
                  groups={categories.groups}
                  rows={monthRows}
                  recurring={recurring}
                  today={todayDay}
                  zone={zone}
                  daysInMonth={last}
                  monthKey={key}
                  label={t('{month} as orbits: a ring per kind of place, a mark per payment', { month: monthLabel })}
                />
              );
            })() : null}
            {loaded ? <h1>{(() => {
              const amount = forecast ? euro(forecast.spent) : (months[0] ? euro(months[0].spent) : '\u2026');
              return incomeEdge ? t('{month}, {amount} of {income}.', { month: monthLabel, amount, income: euro(incomeEdge) }) : t('{month}, {amount}.', { month: monthLabel, amount });
            })()}</h1> : null}
            {ledger.some((row) => !ownCurrency(row.currency)) ? <p className="mv-sub">{ledgerCurrency() === 'EUR' ? t('Totals include euros only. Other currencies stay on their original receipts.') : t('Totals include {ccy} only. Other currencies stay on their original receipts.', { ccy: ledgerCurrency() })}</p> : null}
            {incomeEdge ? <p className="mv-sub">{today?.keep
              ? t('{income} is what you said comes in, {keep} of it to keep.', { income: euro(incomeEdge), keep: euro(today.keep) })
              : t('{income} is what you said comes in.', { income: euro(incomeEdge) })}</p> : null}
            {months[0] && months[1] && typeof months[1].spent_to_day === 'number' ? (
              <>
                <p className="mv-sub">{t('By the {day}: {amount}; by the {day} of {month}, {other}.', { day: ordinalDay(t, todayDay), amount: euro(months[0].spent_to_day ?? months[0].spent), month: monthName(locale, months[1].month), other: euro(months[1].spent_to_day) })}</p>
                <div className="mv-pairs" aria-hidden="true">
                  {[months[0], months[1]].map((m) => (
                    <div key={m.month} className="mv-pairs-row">
                      <span className="mv-pairs-label">{monthName(locale, m.month)}</span>
                      <span className="mv-pair mv-pair--wide"><i style={{ width: `${pairMax > 0 ? ((Number(m.spent_to_day) || 0) / pairMax) * 100 : 0}%` }} /></span>
                      <span className="mv-pairs-end mv-figures">{euro(m.spent_to_day ?? 0)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
  );
}
