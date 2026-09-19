/**
 * What it knows: the person's own words, each one forgettable; then what it still wants to ask.
 * The page was one 1,200-line component; since 2026-09-19 (M2-2) the reads and actions live in
 * useMoneyAccount and each view is its own file. The words on the page did not move.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { euro } from '../../../../services/api/moneyAPI';
import Chevron from '../../Chevron';
import { KindTile } from '../../Carved';
import { factRank, factTitle, factWord } from '../../factWords';
import { askWords } from '../../askWords';
import type { MoneyAccount } from '../../useMoneyAccount';

export default function Knows({ m }: { m: MoneyAccount }) {
  const { t, locale, facts, questions, youFailed, busy, forget } = m;
  const [open, setOpen] = useState<string | null>(null);
  return (
          <section className="mv-section" id="knows">
            <h2>{t('What it knows.')}</h2>
            <p className="mv-sub">{t('Forget one and it asks again.')}</p>
            <ul className="mv-list">
              {facts === null && !youFailed ? null : youFailed && !facts?.length ? (
                <li><p className="mv-empty">{t('That could not be read right now.')}</p></li>
              ) : facts && facts.length === 0 ? (
                <li><p className="mv-empty">{t('Nothing yet. The questions are where this fills.')}</p></li>
              ) : [...facts].sort((a, b) => factRank(a) - factRank(b)).map((f) => {
                /* A row of fifteen identical buttons is a form, not a list: the fact opens, and
                   Forget waits inside it with the ledger's note. */
                const isOpen = open === `fact:${f.id}`;
                return (
                  <li key={f.id}>
                    <button type="button" className="mv-item mv-item--icon" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : `fact:${f.id}`)}>
                      <KindTile kind={f.kind === 'commitment' && f.value !== 'rent' ? 'cash' : f.kind} label={f.kind} />
                      <span className="mv-item-text">
                        <span className="mv-item-title">{factTitle(f, t)}</span>
                        <span className="mv-item-sub">{factWord(f, t)}</span>
                      </span>
                      <span className="mv-item-end mv-figures">{f.amount ? euro(f.amount) : ''}<Chevron /></span>
                    </button>
                    {isOpen ? (
                      <div className="mv-body">
                        <div className="mv-body-foot">
                          <span className="mv-quiet">{f.check_status ? t('The ledger has it as {status}.', { status: t(f.check_status) }) : t('Said, not yet seen in the ledger.')}</span>
                          <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void forget(f)} disabled={busy === `forget:${f.id}`}>{t('Forget')}</button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {questions ? (
                <li>
                  <Link to="/money/setup" className="mv-item">
                    <span className="mv-item-text">
                      <span className="mv-item-title">
                        {questions.opening.length + questions.fromLedger.length
                          ? t(questions.opening.length + questions.fromLedger.length === 1 ? '{n} question it still has' : '{n} questions it still has', { n: questions.opening.length + questions.fromLedger.length })
                          : t('Nothing to ask right now')}
                      </span>
                      <span className="mv-item-sub">{(() => { const q = questions.opening[0] || questions.fromLedger[0]; return q ? askWords(q, t, locale) : t('When a payment arrives that it cannot read, it asks.'); })()}</span>
                    </span>
                    <span className="mv-item-end"><Chevron /></span>
                  </Link>
                </li>
              ) : null}
            </ul>
          </section>
  );
}
