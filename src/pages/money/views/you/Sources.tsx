/**
 * Read from a few places: the banks, the calendar, a statement, the inbox, the phone.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { useState } from 'react';
import { Landmark, Mail } from 'lucide-react';
import { euro, shortDay, BANKS } from '../../../../services/api/moneyAPI';
import LedgerOrb from '../../../../components/LedgerOrb';
import StatementImport from '../../StatementImport';
import BankAccounts from '../../BankAccounts';
import Mark from '../../Mark';
import { MARK_FOR, hasMark } from '../../markPaths';
import { markFor } from '../../carvedKinds';
import PhoneSource from './PhoneSource';
import WhatsAppSource from './WhatsAppSource';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function Sources({ m }: { m: MoneyAccount }) {
  const { t, locale, accounts, capabilities, loaded, empty, busy, bankReady, connecting, bankLine, bookedLine, calendar, calendarFailed, inbox, copied, copyInbox, load, pull, connect, connectCalendar, addFeed, removeFeed, removeAccount, sources } = m;
  /* What each source has given, and the half a status word hides (2026-09-21). */
  const gave = sources?.by || {};
  const month = sources?.month || null;
  const [feedUrl, setFeedUrl] = useState('');
  return (
          <section className="mv-section" id="sources">
            <div className="mv-head">
              <h2>{t('Read from a few places.')}</h2>
            </div>
            <p className="mv-sub">{t('Counts and amounts only. Remove a source and what it read goes too.')}</p>
            {month && month.payments > 0 ? (
              <ul className="mv-list mv-gave">
                <li className="mv-item mv-item--tight"><span className="mv-item-text"><span className="mv-item-title">{t('Payments in thirty days')}</span><span className="mv-item-sub">{gave.statement ? t('the bank has sent {n} sightings, statements {s} and receipts {e}, since the start', { n: gave.bankfeed || 0, s: gave.statement, e: gave.email || 0 }) : t('the bank has sent {n} sightings and receipts {e}, since the start', { n: gave.bankfeed || 0, e: gave.email || 0 })}</span></span><span className="mv-item-end mv-figures">{month.payments}</span></li>
                <li className="mv-item mv-item--tight"><span className="mv-item-text"><span className="mv-item-title">{t('Named by the bank')}</span><span className="mv-item-sub">{t('the rest arrive without a name')}</span></span><span className="mv-item-end mv-figures">{month.named}</span></li>
                <li className="mv-item mv-item--tight"><span className="mv-item-text"><span className="mv-item-title">{t('Carrying the hour they happened')}</span><span className="mv-item-sub">{month.timed < month.payments ? t('the other {n} carry the day the bank booked them', { n: month.payments - month.timed }) : t('all of them')}</span></span><span className="mv-item-end mv-figures">{month.timed}</span></li>
              </ul>
            ) : null}
            <ul className="mv-list">
              {capabilities.bank && BANKS.map((bank, i) => {
                /* Rows from before the second bank carry no name; they were all Santander. */
                const mine = accounts.filter((a) => (a.bank_name || BANKS[0].name) === bank.name);
                const first = i === 0;
                /* One row owns Read now, and only that row turns while it reads. Every connected
                   bank used to show its own orb and its own "Reading the bank." for one press. */
                const owns = mine.length > 0 && (first || !accounts.some((a) => (a.bank_name || BANKS[0].name) === BANKS[0].name));
                return (
                  <li key={bank.name}>
                    <div className="mv-item mv-item--icon">
                      <span className="mv-icon" aria-hidden="true">{hasMark(MARK_FOR[bank.label]) ? <Mark name={MARK_FOR[bank.label]} /> : <Landmark size={16} />}</span>
                      <span className="mv-item-text">
                        <span className="mv-item-title">{bank.label}</span>
                        {/* The booked line describes the accounts under this row, not the other bank's. */}
                        <span className="mv-item-sub mv-item-sub--live" aria-live="polite">
                          {(owns && busy === 'pull') || (busy === 'connect' && connecting === bank.name) ? <LedgerOrb state={busy === 'pull' ? 'searching' : 'connecting'} size={20} label="" /> : null}
                          {mine.length ? (owns || busy !== 'pull' ? bankLine : bookedLine) : first ? t('Read four times a day. You confirm it every six months.') : t('Read four times a day, like the other.')}
                        </span>
                      </span>
                      {/* Only once the accounts are in: before that the row offered a black Connect
                          that turned into Read now a moment later. */}
                      <span className="mv-item-end">
                        {!loaded ? null : mine.length ? (
                          owns
                            ? <button key="read" type="button" className="mv-pill mv-pill--ghost" onClick={pull} disabled={busy === 'pull'}>{t('Read now')}</button>
                            : null
                        ) : (
                          /* With nothing read yet, connecting the first bank is the one thing to do
                             on this page, so it is the page's one ink button. */
                          <button key="connect" type="button" className={empty && first ? 'mv-pill' : 'mv-pill mv-pill--ghost'} onClick={() => void connect(bank.name)} disabled={busy === 'connect' || !bankReady}>{t('Connect')}</button>
                        )}
                      </span>
                    </div>
                    {mine.length ? <BankAccounts accounts={mine} onRemove={removeAccount} busy={busy === 'account'} /> : null}
                  </li>
                );
              })}
              {/* Why the bank is closed, in the person's words: the reason the gate computed, never "beta". */}
              {!capabilities.bank && <li className="mv-item"><p className="mv-quiet">{
                capabilities.why === 'restricted' ? t('Bank connections open for everyone once our bank access is cleared. Until then, add a statement.')
                  : capabilities.why === 'country' ? t('Bank connections are not available in your country yet. Add a statement instead.')
                    : capabilities.why === 'unread' ? t('Your accounts could not be read. Try again.')
                      : t('Live bank connections are not set up here. Add a statement instead.')
              }</p></li>}
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true">{calendar?.google ? <Mark name="google_calendar" /> : <img className="mv-carved" src={`/images/money/carved/${markFor('diary')}.png`} alt="" width={26} height={26} />}</span>
                  <span className="mv-item-text">
                    <span className="mv-item-title">{t('Your calendar')}</span>
                    <span className="mv-item-sub">
                      {calendarFailed ? t('That could not be read right now.') : calendar?.events_seen
                        ? (calendar.learned_at
                            ? t('{n} events read, last {day}.', { n: calendar.events_seen, day: shortDay(calendar.learned_at, locale) })
                            : t('{n} events read.', { n: calendar.events_seen }))
                        : calendar?.google ? t('Google connected. The diary says what a week usually costs.') : t('What a week costs, and when a quiet habit is only a trip.')}
                    </span>
                  </span>
                  <span className="mv-item-end">
                    {calendar && !calendar.google ? <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void connectCalendar()} disabled={busy === 'calendar'}>{t('Connect Google')}</button> : null}
                  </span>
                </div>
                <ul className="mv-sublist">
                  {(calendar?.feeds || []).map((f) => (
                    <li key={f.id} className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{hasMark(f.kind) ? <span className="mv-mark-small" aria-hidden="true"><Mark name={f.kind} size={12} /></span> : null}{t(f.label)}</span>
                        <span className="mv-item-sub">{f.added_at ? t('Added {day}, read once a day.', { day: shortDay(f.added_at, locale) }) : t('Read once a day.')}</span>
                      </span>
                      <span className="mv-item-end"><button type="button" className="mv-pill mv-pill--ghost" onClick={() => void removeFeed(f.id)} disabled={busy === 'feed'}>{t('Remove')}</button></span>
                    </li>
                  ))}
                  {(calendar?.learned || []).map((l, i) => (
                    <li key={l.key || l.label || i} className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{t(l.label || "")}</span>
                        <span className="mv-item-sub">{t('about {amount}, on {n} of {m} days like it', { amount: euro(l.median || 0), n: l.paid ?? 0, m: l.occurrences ?? 0 })}</span>
                      </span>
                    </li>
                  ))}
                  {Boolean(calendar?.events_seen) && !(calendar?.learned || []).length ? (
                    <li className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-sub">{t('No kind of day has a price yet. It learns from the days you pay on.')}</span>
                      </span>
                    </li>
                  ) : null}
                  <li className="mv-item mv-item--sub">
                    <form className="mv-feed" onSubmit={(e) => { e.preventDefault(); const url = feedUrl.trim(); if (url) void addFeed(url).then((ok) => { if (ok) setFeedUrl(''); }); }}>
                      <label className="mv-label" htmlFor="mv-feed-url">{t('A Canvas or Blackboard link')}</label>
                      <div className="mv-feed-row">
                        <input id="mv-feed-url" className="mv-field" type="url" inputMode="url" placeholder="https://" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} disabled={busy === 'feed'} />
                        <button type="submit" className="mv-pill mv-pill--ghost" disabled={busy === 'feed' || !feedUrl.trim()}>{busy === 'feed' ? t('Reading') : t('Add')}</button>
                      </div>
                      <p className="mv-quiet">{t('Canvas: Calendar, Calendar feed. Blackboard: Calendar, Get external calendar link. Read once a day; nothing goes out.')}</p>
                    </form>
                  </li>
                </ul>
              </li>
              <li>
                <StatementImport onImported={load} />
              </li>
              {inbox ? (
                <li>
                  <div className="mv-item mv-item--icon">
                    <span className="mv-icon" aria-hidden="true"><Mail size={16} /></span>
                    <span className="mv-item-text">
                      <span className="mv-item-title">{t('Receipts by email')}</span>
                      <span className="mv-item-sub">{inbox.receiving ? t("Forward receipts, statements or your bank's alert mails; they join the ledger.") : t('Forward receipts here once the domain is switched on.')}</span>
                    </span>
                    <span className="mv-item-end">
                      <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void copyInbox()}>{copied ? t('Copied') : t('Copy address')}</button>
                    </span>
                  </div>
                  <div className="mv-body mv-body--icon"><code className="mv-code">{inbox.address}</code></div>
                  {/* Gmail confirms a forwarding address by mail to that address, which is this one: the code and the link are shown here, where the person can act on them. */}
                  {/* A statement mailed in with more than one account to choose from waits here; the form above is where it is chosen. */}
                  {(inbox.statements || []).map((h) => (
                    <div key={h.at} className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{t('A statement arrived by mail')}</span>
                        <span className="mv-item-sub">{t('{name}, {n} rows. Upload it above and choose the account.', { name: h.filename || t('a file'), n: h.rows })}</span>
                      </span>
                    </div>
                  ))}
                  {(inbox.forwarding || []).map((f) => (
                    <div key={f.at} className="mv-item mv-item--sub">
                      <span className="mv-item-text">
                        <span className="mv-item-title">{t('Gmail asks to confirm forwarding')}</span>
                        <span className="mv-item-sub">{f.requester && f.code ? t('From {from}. Code {code}.', { from: f.requester, code: f.code }) : f.code ? t('Code {code}.', { code: f.code }) : t('Open the link to allow it.')}</span>
                      </span>
                      {f.link ? <span className="mv-item-end"><a className="mv-pill mv-pill--ghost" href={f.link} target="_blank" rel="noopener noreferrer">{t('Confirm')}</a></span> : null}
                    </div>
                  ))}
                </li>
              ) : null}
              {capabilities.capture && <PhoneSource m={m} />}
              {capabilities.whatsapp ? <WhatsAppSource m={m} /> : null}
            </ul>
          </section>
  );
}
