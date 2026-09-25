/**
 * The figures the conversation draws, on the web.
 *
 * The shared figures and a computed purchase comparison, in the money-v2 register: ink bars on a grey
 * track, hairline rows, the euro at the end of the line. Every number here was computed by
 * the server from the ledger; nothing is drawn that the rows do not say. A figure it does
 * not know how to draw renders nothing, so a new kind on the server costs the page no
 * broken picture.
 */
import { useLocale, useT } from '@/lib/i18n';
import { euro, shortDay, isPurchaseFigure, type ChatFigure, type PurchaseFigure, type FigurePoint, type FigureShare } from '../../services/api/moneyAPI';

/* A cadence is a phrase, not a word: the server sends weekly, biweekly, monthly. */
const CADENCE_WORD: Record<string, string> = {
  weekly: 'Every week', biweekly: 'Every two weeks', monthly: 'Every month',
  quarterly: 'Every three months', yearly: 'Every year',
};

export function Bars({ points }: { points: FigurePoint[] }) {
  const top = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className="mc-bars" role="img" aria-label={points.map((p) => `${p.label} ${euro(p.value)}`).join(', ')}>
      {points.map((p, i) => (
        <div key={`${p.label}-${i}`} className={`mc-bar ${p.current ? 'is-current' : ''}`}>
          <span className="mc-bar-value">{euro(p.value)}</span>
          <span className="mc-bar-track"><i style={{ height: `${Math.max(2, (p.value / top) * 100)}%` }} /></span>
          <span className="mc-bar-label">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

function Shares({ items }: { items: FigureShare[] }) {
  const top = Math.max(...items.map((s) => s.value), 1);
  return (
    <ul className="mc-shares">
      {items.map((s, i) => (
        <li key={`${s.label}-${i}`} className="mc-share">
          <span className="mc-share-head"><span>{s.label}</span><span>{euro(s.value)}</span></span>
          <span className="mc-share-track"><i style={{ width: `${(s.value / top) * 100}%` }} /></span>
          <span className="mc-share-pct">{Math.round(s.share * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

function Purchase({ figure }: { figure: PurchaseFigure }) {
  const t = useT();
  const above = figure.difference > 0;
  const money = (n: number) => `${n < 0 ? '−' : ''}${euro(n, figure.currency)}`;
  return (
    <div className="mc-purchase">
      <div className="mc-purchase-verdict">
        <span className="mc-purchase-amount">{money(Math.abs(figure.difference))}</span>
        <span className="mc-purchase-label">{t(above ? 'over today’s estimate' : 'left from today’s estimate')}</span>
      </div>
      <dl className="mc-purchase-details">
        <div><dt>{t('Your purchase')}</dt><dd>{money(figure.cost)}</dd></div>
        <div><dt>{t('Today’s estimate')}</dt><dd>{money(figure.allowance)}</dd></div>
      </dl>
      <p className="mc-purchase-note">{t('An estimate, not a guarantee of what you can spend.')}</p>
    </div>
  );
}

export function Figure({ figure }: { figure: ChatFigure }) {
  const t = useT();
  const locale = useLocale();
  let body: React.ReactNode = null;
  switch (figure.kind) {
    case 'purchase':
      return isPurchaseFigure(figure) ? <Purchase figure={figure} /> : null;
    case 'week':
      body = figure.days.length ? <Bars points={figure.days.map((d) => ({ label: d.label, value: d.value, current: d.today }))} /> : null;
      break;
    case 'months':
    case 'weekdays':
    case 'history':
      body = figure.points.length ? <Bars points={figure.points} /> : null;
      break;
    case 'shares':
      body = figure.items.length ? <Shares items={figure.items} /> : null;
      break;
    case 'recurring':
      body = figure.items.length ? (
        <ul className="mv-list mc-figure-list">
          {figure.items.map((it, i) => (
            <li key={`${it.label}-${i}`} className="mv-item mv-item--tight">
              <span className="mv-item-text">
                <span className="mv-item-title">{it.label}</span>
                <span className="mv-item-sub">{[it.cadence ? t(CADENCE_WORD[it.cadence] || it.cadence) : '', it.next ? t('next around {day}', { day: shortDay(it.next, locale) }) : ''].filter(Boolean).join(', ')}</span>
              </span>
              <span className="mv-item-end">{euro(it.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null;
      break;
    case 'ahead':
      body = figure.items.length ? (
        <ul className="mv-list mc-figure-list">
          {figure.items.map((it, i) => (
            <li key={`${it.label}-${i}`} className="mv-item mv-item--tight">
              <span className="mv-item-text">
                <span className="mv-item-title">{it.label}</span>
                <span className="mv-item-sub">{[it.day, it.basis || ''].filter(Boolean).join(', ')}</span>
              </span>
              <span className="mv-item-end">{euro(it.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null;
      break;
    case 'band': {
      const top = Math.max(figure.high || 0, figure.likely, figure.spent, 1);
      body = (
        <div className="mc-band" role="img" aria-label={t('Spent {spent}, likely {likely}', { spent: euro(figure.spent), likely: euro(figure.likely) })}>
          <span className="mc-band-track">
            <i className="mc-band-likely" style={{ width: `${(figure.likely / top) * 100}%` }} />
            <i className="mc-band-spent" style={{ width: `${(figure.spent / top) * 100}%` }} />
          </span>
          <span className="mc-band-labels"><span>{t('Spent {amount}', { amount: euro(figure.spent) })}</span><span>{t('Likely {amount}', { amount: euro(figure.likely) })}</span></span>
        </div>
      );
      break;
    }
  }
  if (!body) return null;
  return (
    <figure className="mc-figure">
      {figure.title ? <figcaption className="mv-quiet">{figure.title}</figcaption> : null}
      {body}
    </figure>
  );
}
