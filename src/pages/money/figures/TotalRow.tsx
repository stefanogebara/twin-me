/**
 * The last row of any list a figure opens: how many, and how much together.
 *
 * Stefano, 2026-09-15: "when clicked on the calendar balls make sure you also show how much
 * was spent in total." Every list that unfolds from a tap (a day's payments, a kind of
 * place's payees, a payee's payments) ends with this row, so the sum never has to be done
 * in the head. It draws nothing for a list of one: the one row is already the total.
 */
import { euro } from '../../../services/api/moneyAPI';
import { useT } from '@/lib/i18n';

export default function TotalRow({ count, total, noun = 'payments' }: { count: number; total: number; noun?: 'payments' | 'places' }) {
  const t = useT();
  if (count < 2) return null;
  return (
    <li className="mv-item mv-item--tight mv-item--total">
      <span className="mv-item-text">
        <span className="mv-item-title">{t('Together')}</span>
        <span className="mv-item-sub">{noun === 'places' ? t('{n} places', { n: count }) : t('{n} payments', { n: count })}</span>
      </span>
      <span className="mv-item-end mv-figures">{euro(total)}</span>
    </li>
  );
}
