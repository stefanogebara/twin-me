/**
 * The month: its figure, where it went, every euro, what comes back, what the money says.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import type { MoneyAccount } from '../useMoneyAccount';
import MonthHero from './month/MonthHero';
import WhereItWent from './month/WhereItWent';
import ByWeekday from './month/ByWeekday';
import Ledger from './month/Ledger';
import Recurring from './month/Recurring';
import Readings from './Readings';

export default function MonthView({ m }: { m: MoneyAccount }) {
  return (
    <>
          {/* The month opens on its figure, with the one drawing that says how it compares:
              this month to today's date against the same days of last month. */}
      <MonthHero m={m} />
          {/* Where it went, by kind of place */}
      <WhereItWent m={m} />
          {/* By day of the week, the last eight full weeks (2026-09-21). */}
      <ByWeekday m={m} />
          {/* Ledger */}
      <Ledger m={m} />
          {/* Recurring */}
      <Recurring m={m} />
      <Readings m={m} view="month" />
    </>
  );
}
