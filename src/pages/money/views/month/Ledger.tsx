/**
 * Every euro, with its receipts: the ledger a month at a time, each payment openable to what the bank and the phone saw.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { useState } from 'react';
import { euro, shortDay, moneyAPI, type MoneySighting } from '../../../../services/api/moneyAPI';
import Chevron from '../../Chevron';
import { merchantLabel, monthYear, ordinalDay, seenWords, SOURCE } from '../../words';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function Ledger({ m }: { m: MoneyAccount }) {
  const { t, locale, ledger, byMonth, pairMax, todayDay, verdict, seen } = m;
  const [monthOpen, setMonthOpen] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, MoneySighting[]>>({});
  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!receipts[id]) { try { const s = await moneyAPI.sightings(id); setReceipts((m) => ({ ...m, [id]: s })); } catch { /* the row still opens */ } }
  }
  return (
          <section className="mv-section" id="ledger">
            <h2>{t('Every euro, with its receipts.')}</h2>
            {ledger.length === 0 ? (
              <div className="mv-list"><p className="mv-empty">{t('Fills as the bank and the phone send what they saw.')}</p></div>
            ) : (
              <>
                <p className="mv-sub">{t('Open a month, then a payment, to see what the bank and the phone saw.')}</p>
                <ol className="mv-list">
                  {byMonth.map((group) => {
                    /* Closed until opened: the month page is for reading the month, and sixty
                       rows of it open by default were 4 400 px before the next heading. */
                    const isOpen = monthOpen[group.key] ?? false;
                    const seg = group.segment;
                    /* One sentence: how many payments, over how many days when the month is still
                       running, and what came in. */
                    let countLine = t(group.rows.length === 1 ? '{n} payment' : '{n} payments', { n: group.rows.length });
                    if (seg && !seg.complete && seg.days_covered) countLine = t('{payments} in {covered} of {total} days', { payments: countLine, covered: seg.days_covered, total: seg.days_in_month });
                    if (seg && seg.received) countLine = t('{line}, {amount} in', { line: countLine, amount: euro(seg.received) });
                    return (
                      <li key={group.key}>
                        <button type="button" className="mv-item" aria-expanded={isOpen} onClick={() => setMonthOpen((all) => ({ ...all, [group.key]: !isOpen }))}>
                          <span className="mv-item-text">
                            <span className="mv-item-title">{monthYear(locale, `${group.key}-01T12:00:00Z`)}</span>
                            <span className="mv-item-sub">{countLine}</span>
                            {/* Two short bars: this month to today's date, and the same days of that
                                month, against the largest of them. What "By the 14th you had spent"
                                says, drawn, on every month at once. */}
                            {seg && typeof seg.spent_to_day === 'number' && pairMax > 0 ? (
                              <span className="mv-pair" aria-hidden="true" title={t('{amount} by the {day}', { amount: euro(seg.spent_to_day), day: ordinalDay(t, todayDay) })}>
                                <i style={{ width: `${(seg.spent_to_day / pairMax) * 100}%` }} />
                              </span>
                            ) : null}
                          </span>
                          <span className="mv-item-end mv-figures">{seg ? euro(seg.spent) : ''}<Chevron /></span>
                        </button>
                        {isOpen ? (
                          <ol className="mv-sublist">
                            {group.rows.map((row) => (
                              <li key={row.id} className={Number(row.amount) > 0 ? 'is-in' : undefined}>
                                <button type="button" className="mv-item mv-item--sub" onClick={() => void toggle(row.id)} aria-expanded={open === row.id}>
                                  <span className="mv-item-text">
                                    <span className="mv-item-title">{merchantLabel(row)}</span>
                                    <span className="mv-item-sub">
                                      {[shortDay(row.occurred_at, locale), seenWords(t, seen[row.id], Boolean(row.posted_at)) || (row.posted_at ? '' : t('pending')), row.is_recurring ? t('recurring') : '', row.verdict ? t(row.verdict === 'worth_it' ? 'worth it' : 'not me') : ''].filter(Boolean).join(', ')}
                                    </span>
                                  </span>
                                  <span className="mv-item-end mv-amount">{Number(row.amount) > 0 ? '+' : ''}{euro(row.amount, row.currency)}</span>
                                </button>
                                {open === row.id ? (
                                  <div className="mv-body mv-body--sub">
                                    <ul className="mv-receipts">
                                      {(receipts[row.id] || []).map((s) => (
                                        <li key={s.id}>
                                          <span className="mv-quiet">{t('{source}, read {day}', { source: SOURCE[s.source] ? t(SOURCE[s.source]) : s.source, day: shortDay(s.seen_at, locale) })}</span>
                                          <p>{s.raw_text || `${euro(s.amount, s.currency || 'EUR')} ${s.currency || ''}`}</p>
                                        </li>
                                      ))}
                                      {receipts[row.id] && receipts[row.id].length === 0 ? <li><p>{t('No receipt kept for this one.')}</p></li> : null}
                                    </ul>
                                    {Number(row.amount) < 0 ? (
                                      <div className="mv-verdicts">
                                        <button type="button" className="mv-pill mv-pill--ghost" aria-pressed={row.verdict === 'worth_it'} onClick={() => void verdict(row, 'worth_it')}>{t('Worth it')}</button>
                                        <button type="button" className="mv-pill mv-pill--ghost" aria-pressed={row.verdict === 'not_me'} onClick={() => void verdict(row, 'not_me')}>{t('Not me')}</button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </section>
  );
}
