/**
 * The figures the conversation draws, on the web.
 *
 * The same eight kinds the phone draws, in the money-v2 register: ink bars on a grey
 * track, hairline rows, the euro at the end of the line. Every number here was computed by
 * the server from the ledger; nothing is drawn that the rows do not say. A figure it does
 * not know how to draw renders nothing, so a new kind on the server costs the page no
 * broken picture.
 */
import { euro, shortDay, type ChatFigure, type FigurePoint, type FigureShare } from '../../services/api/moneyAPI';

function Bars({ points }: { points: FigurePoint[] }) {
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

export function Figure({ figure }: { figure: ChatFigure }) {
  let body: React.ReactNode = null;
  switch (figure.kind) {
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
                <span className="mv-item-sub">{[it.cadence, it.next ? `next around ${shortDay(it.next)}` : ''].filter(Boolean).join(', ')}</span>
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
        <div className="mc-band" role="img" aria-label={`Spent ${euro(figure.spent)}, likely ${euro(figure.likely)}`}>
          <span className="mc-band-track">
            <i className="mc-band-likely" style={{ width: `${(figure.likely / top) * 100}%` }} />
            <i className="mc-band-spent" style={{ width: `${(figure.spent / top) * 100}%` }} />
          </span>
          <span className="mc-band-labels"><span>Spent {euro(figure.spent)}</span><span>Likely {euro(figure.likely)}</span></span>
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
