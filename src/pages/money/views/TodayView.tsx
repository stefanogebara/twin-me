/**
 * Today: the day's figure, the month's band, what is still to come, and what changed.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { useState } from 'react';
import { orbFor } from '../orbFor';
import { Link } from 'react-router-dom';
import { euro, shortDay, BANKS } from '../../../services/api/moneyAPI';
import type { MoneyAccount } from '../useMoneyAccount';
import Wait from '../../../components/Wait';
import HomeAsk from '../HomeAsk';
import TotalRow from '../figures/TotalRow';
import { KindTile } from '../Carved';
import { todayHere, localDay, allowanceWords } from '../readingWords';
import { ordinalDay, pct, chargesSoonWords, returnsClosingWords } from '../words';
import Readings from './Readings';
import Review from './Review';

export default function TodayView({ m }: { m: MoneyAccount }) {
  const { t, locale, forecast, today, ledger, loaded, unread, empty, capabilities, busy, bankReady, connect, load, reconnect, balanceLine, incomeEdge, edge, projectable, last, ahead, monthLabel } = m;
  /* The globe opens the day's payments under the hero. */
  const [dayOpen, setDayOpen] = useState(false);
  return (
    <>
          {/* This month: one figure, one grey line, the band */}
          <section className={`mv-hero${loaded && !empty && today && today.amount !== null ? ' mv-hero--orb' : ''}`} id="month">
            {/* the globe stands where the stamp stood */}
            <p className="mv-eyebrow">{monthLabel}</p>
            {!loaded ? (
              /* The first seconds of a new account are the month being read; an ellipsis
                 where the number goes read as a broken figure to a stranger. */
              <Wait inline state={orbFor('page')} line="Reading your month." />
            ) : unread ? (
              <>
                <h1>{t('Your month could not be read.')}</h1>
                <p className="mv-sub">{t('Nothing is lost. Try again in a moment.')}</p>
                <div className="mv-ctas">
                  <button type="button" className="mv-pill" onClick={() => void load()}>{t('Try again')}</button>
                </div>
              </>
            ) : empty ? (
              <>
                <h1>{t('Nothing read yet.')}</h1>
                <p className="mv-sub">{t('Start with a statement from your bank.')}</p>
                <div className="mv-ctas">
                  <Link to="/money/account#sources" className="mv-pill">{t('Add a statement')}</Link>
                  {capabilities.bank && <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void connect(BANKS[0].name)} disabled={busy === 'connect' || !bankReady}>{t('Connect Santander')}</button>}
                </div>
              </>
            ) : (
              <>
                {/* Safe to spend today leads, with the basis it rests on; the month is the line
                    under it. Until a month can be read, the month figure leads as before. */}
                {today && today.amount !== null ? (
                  <>
                    <button type="button" className="mv-day-figure" aria-expanded={dayOpen} onClick={() => setDayOpen((o) => !o)}>
                      {/* Over budget, the figure is a hole, not a balance: "74,18 EUR" over a
                          grey "Over your budget" read as money to spend (2026-09-21). */}
                      <span className="mv-day-value">{today.over ? `\u2212${euro(Math.abs(today.free ?? 0))}` : euro(today.amount)}</span>
                      <span className="mv-quiet">{today.over ? t('Over your budget') : t("Today's estimate")}</span>
                    </button>
                    <h1 className="mv-sr">{today.over ? t('Nothing today.') : t('{amount} today.', { amount: euro(today.amount) })}</h1>
                    {/* One line: the basis. The month lives in the band's two labels below. */}
                    {allowanceWords(today, t, locale) ? <p className="mv-sub">{allowanceWords(today, t, locale)}</p> : null}
                    {/* The real thing under it: what the bank says is in the account, read with you
                        present, named as available and never as safe to spend. */}
                    {/* The day's own line already names the balance when it rests on one; saying
                        it again two lines down is the same figure twice (2026-09-16). */}
                    {balanceLine && today.basis !== 'balance' ? <p className="mv-sub">{balanceLine}</p> : null}
                    {/* What the diary already expects today. The allowance has taken it off the
                        number above; without this line it is taken off for no visible reason. */}
                    {/* The charge before it lands: named the day before, and already taken off the
                        number above, so nothing on the page contradicts it. */}
                    {chargesSoonWords(t, today.charges_soon) ? <p className="mv-sub">{chargesSoonWords(t, today.charges_soon)}</p> : null}
                    {/* The return window on a receipt, one quiet line near its end (idea 1, 2026-09-21). */}
                    {returnsClosingWords(t, today.returns_closing) ? <p className="mv-sub">{returnsClosingWords(t, today.returns_closing)}</p> : null}
                    {today.today_events?.length ? (
                      <p className="mv-sub">{t('The diary expects {what} today.', { what: today.today_events.map((e) => `${e.title}, ${euro(e.amount)}`).join('; ') })}</p>
                    ) : null}
                    {dayOpen ? (() => {
                      const todayKey = todayHere();
                      const rows = ledger.filter((t) => t.verdict !== 'not_me' && (!t.currency || t.currency === 'EUR') && localDay(t.occurred_at) === todayKey && Number(t.amount) < 0);
                      return rows.length ? (
                        <ul className="mv-list mv-day-rows" aria-label={t("Today's payments")}>
                          {rows.map((row) => (
                            <li key={row.id} className="mv-item mv-item--tight">
                              <span className="mv-item-text">
                                <span className="mv-item-title">{row.merchant_name || row.merchant_raw || t('Unknown')}</span>
                                <span className="mv-item-sub">{new Date(row.occurred_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
                              </span>
                              <span className="mv-item-end">{euro(Math.abs(Number(row.amount)))}</span>
                            </li>
                          ))}
                          <TotalRow count={rows.length} total={rows.reduce((s, r) => s + Math.abs(Number(r.amount)), 0)} />
                        </ul>
                      ) : <p className="mv-sub">{t('Nothing paid yet today.')}</p>;
                    })() : null}
                  </>
                ) : (
                  <>
                    <h1>{t('{amount} so far.', { amount: forecast ? euro(forecast.spent) : '\u2026' })}</h1>
                    {forecast ? (
                      <p className="mv-sub">
                        {projectable
                          ? t('Likely {amount} by the {day}, somewhere from {low} to {high}.', { amount: euro(forecast.projected_p50), day: ordinalDay(t, last), low: euro(forecast.projected_p10), high: euro(forecast.projected_p90) })
                          : t('Too early to say where the month lands.')}
                      </p>
                    ) : null}
                    {today && today.why ? <p className="mv-sub">{t(today.why)}</p> : null}
                  </>
                )}
                {/* The band's own record, once it has one: how many days it has been checked
                    against, and how many it held. A range nobody scores is a range nobody
                    should trust, so the number is printed as soon as there is one. */}
                {forecast?.band_calibration && forecast.band_calibration.days >= 7 && forecast.band_calibration.coverage !== null ? (
                  <p className="mv-sub">{t('The range has held on {held} of the last {days} days.', { held: Math.round(forecast.band_calibration.coverage * forecast.band_calibration.days), days: forecast.band_calibration.days })}</p>
                ) : null}
                {/* A month that stopped moving must say why: the bank ends its session on its
                    own schedule, and nothing can be read until it is authorised again. */}
                {reconnect ? <p className="mv-sub">{t('The bank connection has ended. Reconnect it under Sources.')}</p> : null}
              </>
            )}
            {loaded && !unread ? <HomeAsk /> : null}
            {forecast && !empty ? (
              <div className="mv-band">
                {/* Ink for what has gone, grey to where the month lands. The spread stays in the
                    line above: drawn as a third layer it left a hole that read as a fault. */}
                <div className="mv-band-track">
                  <div className="mv-band-likely" style={{ width: `${pct(Math.max(forecast.projected_p50, forecast.spent + forecast.committed), forecast, edge)}%` }} />
                  <div className="mv-band-spent" style={{ width: `${pct(forecast.spent, forecast, edge)}%` }} />
                  {/* Where what they want left begins, when they said so: the month has a wall
                      before the end of the track. */}
                  {incomeEdge && today?.keep ? <i className="mv-band-mark" style={{ left: `${pct(incomeEdge - today.keep, forecast, edge)}%` }} title={t('Keeping {amount}', { amount: euro(today.keep) })} /> : null}
                </div>
                <div className="mv-band-labels">
                  <span>{t('Spent {amount}', { amount: euro(forecast.spent) })}</span>
                  {/* The track ends at what comes in when they said it; the likely figure and its
                      reach stay in the label so the band reads as spent, likely, and the wall. */}
                  <span>
                    {(() => {
                      const likely = { amount: euro(Math.max(forecast.projected_p50, forecast.spent + forecast.committed)), high: euro(forecast.projected_p90), day: ordinalDay(t, last), income: euro(incomeEdge || 0) };
                      /* Three figures in one label ("Likely 1923,23, up to 2191,73; 1750,00 comes in")
                         is a line nobody parses; what comes in is already in the day's own line. */
                      if (incomeEdge) return projectable ? t('Likely {amount}, up to {high}', likely) : t('Likely {amount}', likely);
                      return projectable ? t('Likely {amount} by the {day}, up to {high}', likely) : t('Likely {amount} by the {day}', likely);
                    })()}
                  </span>
                </div>
                {ahead.length ? (
                  <>
                  <p className="mv-sub mv-ahead-head">{t('Still to come this month')}</p>
                  <ul className="mv-list mv-ahead" aria-label={t('Still to come this month')}>
                    {ahead.map((r) => (
                      <li key={`${r.kind}-${r.on}-${r.name}`} className="mv-item mv-item--tight mv-ahead-row">
                        <span className="mv-ahead-day">{shortDay(r.on, locale)}</span>
                        <span className="mv-item-text"><span className="mv-item-title">{r.name}</span><span className="mv-item-sub">{r.why}</span></span>
                        <span className={`mv-item-end mv-figures${r.amount > 0 ? ' mv-ahead-in' : ''}`}>{r.amount > 0 ? '+' : ''}{euro(Math.abs(r.amount))}</span>
                      </li>
                    ))}
                  </ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </section>
      <Readings m={m} view="today" />
      <Review m={m} />
    </>
  );
}
