/**
 * The order readings take on Today, and the euros each one moved: what changed comes first,
 * what stands last. Pure, so the hook can rank without the section that draws them.
 */
import type { MoneyReading } from '../../services/api/moneyAPI';

/** The order readings take on Today: what moved first, what stands last. */
const READING_ORDER = ['delta_category', 'delta_silence', 'delta_weekday', 'delta_pace', 'income_late', 'cap_month', 'keep_month', 'charge_ahead', 'named_expense', 'split_open', 'own_score', 'month_pace', 'new_merchant', 'biggest_line', 'dormant_charge', 'subscriptions', 'small_payments', 'category_shape', 'weekday_shape'];
export function readingRank(kind: string) {
  const i = READING_ORDER.indexOf(kind);
  return i === -1 ? READING_ORDER.length : i;
}
/** Everything ranked before the twin's own score is a change; from there on it is a standing shape. */
export const CHANGE_BOUNDARY = READING_ORDER.indexOf('own_score');
/** The euros a reading moved, from the numbers it carries, so what changed most is said first. */
export function readingStake(r: MoneyReading): number {
  const n = (k: string) => Math.abs(Number(r.numbers?.[k]) || 0);
  switch (r.kind) {
    case 'delta_category': case 'delta_pace': case 'delta_weekday': return Math.abs(n('current') - n('usual'));
    case 'delta_silence': return n('typical_amount') * Math.max(1, n('days_since') / Math.max(1, n('usual_gap_days')));
    case 'income_late': return n('typical_amount');
    case 'cap_month': return r.numbers?.over ? Math.abs(n('spent') - n('cap')) : 0;
    case 'keep_month': return n('gap');
    case 'charge_ahead': return n('total');
    case 'named_expense': return n('amount');
    case 'split_open': return n('open');
    default: return 0;
  }
}
