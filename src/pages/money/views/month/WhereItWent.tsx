/**
 * Where the month went, by kind of place, with the unplaced merchants placeable by hand.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { euro, moneyAPI } from '../../../../services/api/moneyAPI';
import { KindTile } from '../../Carved';
import { cap } from '../../words';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function WhereItWent({ m }: { m: MoneyAccount }) {
  const { t, categories, busy, lookupPlaces, placeAs } = m;
  if (!categories || !categories.groups.length) return null;
  return (
            <section className="mv-section" id="where">
              <div className="mv-head">
                <h2>{t('Where it went this month.')}</h2>
                {categories.read < categories.total ? (
                  <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void lookupPlaces()} disabled={busy === 'places'}>
                    {busy === 'places' ? t('Looking up\u2026') : t('Look up the rest')}
                  </button>
                ) : null}
              </div>
              <p className="mv-sub">
                {categories.read < categories.total
                  ? t('{read} of {total} placed so far.', { read: euro(categories.read), total: euro(categories.total) })
                  : t('Every payment this month is placed.')}
              </p>
              <ol className="mv-list mv-where">
                {categories.groups.map((g) => (
                  <li key={g.category} className={g.known ? '' : 'is-unknown'}>
                    <div className="mv-item">
                      <KindTile kind={g.known ? g.category : null} label={g.category} />
                      <span className="mv-item-text">
                        <span className="mv-item-title">{cap(t(g.category))}</span>
                        <span className="mv-item-sub">{g.share}%{g.merchants.length ? `, ${g.merchants.map((m) => m.name).slice(0, 3).join(', ')}` : ''}</span>
                        {/* Two pixels of ink for the share: the number above it, drawn. */}
                        <span className="mv-share" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, Number(g.share) || 0))}%` }} /></span>
                      </span>
                      <span className="mv-item-end">{euro(g.spent)}</span>
                    </div>
                    {/* What no provider could place, the person can: one word per merchant, kept
                        as their own and never overwritten by a lookup. */}
                    {!g.known && g.merchants.length ? (
                      <ul className="mv-sublist">
                        {g.merchants.filter((m) => m.merchant_key && m.merchant_key !== 'unknown').map((m) => (
                          <li key={m.merchant_key || m.name} className="mv-item mv-item--sub">
                            <span className="mv-item-text">
                              <span className="mv-item-title">{m.name}</span>
                              <span className="mv-item-sub">{euro(m.spent)}</span>
                            </span>
                            <span className="mv-item-end">
                              <label className="mv-sr" htmlFor={`cat-${m.merchant_key || m.name}`}>{t('What kind of place is {name}?', { name: m.name })}</label>
                              <select id={`cat-${m.merchant_key || m.name}`} className="mv-field mv-field--select" defaultValue="" disabled={busy === 'category'} onChange={(e) => void placeAs(m.merchant_key || m.name, e.target.value, m.name)}>
                                <option value="" disabled>{t('Kind of place')}</option>
                                {moneyAPI.CATEGORIES.map((c) => <option key={c} value={c}>{cap(t(c))}</option>)}
                              </select>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
  );
}
