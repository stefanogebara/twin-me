/**
 * By day of the week: the last eight full weeks, one bar each, from the ledger rows the page
 * holds (2026-09-21). The chat drew this on request; the month page now shows it.
 */

import { useMemo } from 'react';
import { Bars } from '../../MoneyFigures';
import { weekdayTotals } from '../../weekdays';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function ByWeekday({ m }: { m: MoneyAccount }) {
  const { t, locale, ledger } = m;
  const points = useMemo(() => weekdayTotals(ledger || [], new Date(), locale), [ledger, locale]);
  if (!points.length) return null;
  const top = points.reduce((a, b) => (b.value > a.value ? b : a));
  return (
          <section className="mv-section" id="weekdays">
            <h2>{t('By day of the week.')}</h2>
            <p className="mv-sub">{t('The last eight full weeks, Monday to Sunday. {day} costs most.', { day: top.label })}</p>
            <Bars points={points} />
          </section>
  );
}
