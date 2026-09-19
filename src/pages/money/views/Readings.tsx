/**
 * What the ledger says, with the payments that say it one press away.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLocale, useT } from '@/lib/i18n';
import { euro, shortDay, type MoneyReading } from '../../../services/api/moneyAPI';
import { readingWords } from '../readingWords';
import Chevron from '../Chevron';
import type { MoneyAccount } from '../useMoneyAccount';

  /* What the ledger says, with the payments that say it one press away. Today carries the
     three that changed something today, the one that moved most as the heading; the month
     carries all of them, last, after where the money went. */
export default function Readings({ m, view }: { m: MoneyAccount; view: 'today' | 'month' }) {
  const { t, locale, readings, quietDays, shown, lead, rest } = m;
  const [openReading, setOpenReading] = useState<string | null>(null);
  return readings.length ? (
            <section className="mv-section" id="readings">
              {view === 'today' && lead ? (
                <>
                  {/* The reading that moved the most money is the heading, not a row among rows: it is
                      the one sentence to read on the way out. Its receipts open under it. */}
                  <p className="mv-eyebrow">{t('What changed')}</p>
                  <button type="button" className="mv-lead" aria-expanded={openReading === lead.id} onClick={() => setOpenReading(openReading === lead.id ? null : lead.id)}>
                    {/* The ledger keeps the English sentence for the twin; the page says the same
                        numbers in the reader's own language (readingWords.ts, 2026-09-16). */}
                    {(() => { const said = readingWords(lead, t, locale); return (<>
                      <h2>{said.sentence}</h2>
                      {said.detail ? <p className="mv-sub">{said.detail}</p> : null}
                    </>); })()}
                  </button>
                  {openReading === lead.id ? <ReadingBody r={lead} /> : null}
                </>
              ) : (
                <h2>{t('What the money says.')}</h2>
              )}
              {/* Quiet is a feature. Every other app manufactures a daily line; this one says how
                  long it has had nothing new to say, from the day each reading was first said. */}
              {quietDays !== null && quietDays >= 2 && !lead ? <p className="mv-sub">{t('Nothing new for {n} days.', { n: quietDays })}</p> : null}
              <ul className="mv-list">
                {(view === 'today' ? rest : readings).map((r) => {
                  const isOpen = openReading === r.id;
                  return (
                    <li key={r.id}>
                      <button type="button" className="mv-item" aria-expanded={isOpen} onClick={() => setOpenReading(isOpen ? null : r.id)}>
                        <span className="mv-item-text">
                          {(() => { const said = readingWords(r, t, locale); return (<>
                            <span className="mv-item-title">{said.sentence}</span>
                            {said.detail ? <span className="mv-item-sub">{said.detail}</span> : null}
                          </>); })()}
                        </span>
                        <span className="mv-item-end"><Chevron /></span>
                      </button>
                      {isOpen ? <ReadingBody r={r} /> : null}
                    </li>
                  );
                })}
                {view === 'today' && readings.length > shown.length ? (
                  <li>
                    <Link to="/money/month#readings" className="mv-item">
                      <span className="mv-item-text"><span className="mv-item-title">{t('All {n} readings', { n: readings.length })}</span></span>
                      <span className="mv-item-end"><Chevron /></span>
                    </Link>
                  </li>
                ) : null}
              </ul>
            </section>
  ) : null;
}

/** The payments a reading stands on, and how many: shared by the lead and the rows. */
function ReadingBody({ r }: { r: MoneyReading }) {
  const t = useT();
  const locale = useLocale();
  return (
    <div className="mv-body">
      {r.receipts.length ? (
        <ul className="mv-sublist">
          {r.receipts.map((t) => (
            <li key={t.id} className="mv-item mv-item--tight">
              <span className="mv-item-text">
                <span className="mv-item-title">{t.merchant_raw || t.merchant_key}</span>
                <span className="mv-item-sub">{shortDay(t.occurred_at, locale)}</span>
              </span>
              <span className="mv-item-end">{euro(t.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mv-body-foot">
        <span className="mv-quiet">{t(r.evidence_count === 1 ? 'From {n} payment' : 'From {n} payments', { n: r.evidence_count })}</span>
      </div>
    </div>
  );
}
