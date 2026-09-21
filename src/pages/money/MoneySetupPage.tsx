/**
 * Money setup: the questions the ledger cannot answer for itself.
 *
 * The engine reads rhythm, price and place from payments. It cannot read meaning: who a
 * name on a transfer is, what leaves every month whatever happens, what comes in. This
 * screen asks that once, and then keeps asking about specific unexplained lines, each with
 * the payments that raised it attached, so the question is earned rather than nosy.
 *
 * One question per screen, in the money-v2 register.
 * Spec: .claude/plans/2026-09-07-money-twin/README.md
 */
import { askWords } from './askWords';
import { orbFor } from './orbFor';
import { Link } from 'react-router-dom';
import '../../styles/money-v2.css';
import '../../styles/money-setup.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import Wait from '../../components/Wait';
import { MONEY_NAV } from './navLinks';

const NAV: MoneyNavLink[] = MONEY_NAV('you');
import { euro, shortDay } from '../../services/api/moneyAPI';
import { factTitle, factWord } from './factWords';
import { useSetupQueue } from './setup/useSetupQueue';
import AnswerFields from './setup/AnswerFields';

export default function MoneySetupPage() {
  const q = useSetupQueue();
  const { queue, answeredBefore, index, loaded, failed, busy, note, facts, t, locale, question, done, fromLedger, skippable, answerable, submit, skip } = q;
  return (
    <main className="mv ms">
      <div className="mv-shell">
        <MoneyNav links={NAV} />
        <div className="mv-col">
          <section className="ms-stage">
            {!loaded ? (
              <Wait inline state={orbFor('learning')} line="Reading your payments." />
            ) : failed ? (
              <div className="ms-stage-inner">
                <h1>{t('The questions did not load.')}</h1>
                <p className="mv-sub">{t('Nothing was lost. Try again in a moment.')}</p>
                <div className="ms-actions"><Link to="/money" className="mv-pill">{t('Back to the month')}</Link></div>
              </div>
            ) : queue.length === 0 ? (
              <div className="ms-stage-inner">
                <h1>{t('Nothing to ask.')}</h1>
                <p className="mv-sub">
                  {answeredBefore > 0
                    ? t('You answered {n} already. Everything since reads on its own.', { n: answeredBefore })
                    : t('When a payment arrives that it cannot read, it asks here.')}
                </p>
                <div className="ms-actions"><Link to="/money/you" className="mv-pill">{t('See what it knows')}</Link></div>
              </div>
            ) : done ? (
              <div className="ms-stage-inner">
                <h1>{t('That is enough to change the numbers.')}</h1>
                <p className="mv-sub">
                  {facts && facts.length
                    ? t(facts.length === 1 ? 'It now holds {n} thing you told it.' : 'It now holds {n} things you told it.', { n: facts.length })
                    : t('Nothing was recorded. It carries on with what it reads.')}
                </p>
                {facts && facts.length ? (
                  <ul className="mv-list">
                    {facts.map((f) => (
                      <li key={f.id} className="mv-item">
                        <span className="mv-item-text">
                          <span className="mv-item-title">{factTitle(f, t)}</span>
                          <span className="mv-item-sub">{factWord(f, t)}</span>
                        </span>
                        <span className="mv-item-end">{f.amount ? euro(f.amount) : ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="ms-actions"><Link to="/money" className="mv-pill">{t('See today')}</Link></div>
              </div>
            ) : question ? (
              <div className="ms-stage-inner" key={question.id}>
                <p className="ms-count">{t(fromLedger ? '{i} of {n}, from your payments' : '{i} of {n}', { i: index + 1, n: queue.length })}</p>
                {/* The ledger composes the question in English for the model; the page asks it
                    in the reader's own language, from the same parts (2026-09-16). */}
                <h1>{askWords(question, t, locale)}</h1>
                {question.help || question.why ? <p className="mv-sub">{t(question.help || question.why)}</p> : null}

                {question.receipts && question.receipts.length ? (
                  <ul className="mv-list" aria-label={t('The payments behind this question')}>
                    {question.receipts.map((r) => (
                      <li key={r.id} className="mv-item mv-item--tight">
                        <span className="mv-item-text">
                          <span className="mv-item-title">{r.merchant_raw || r.merchant_key}</span>
                          <span className="mv-item-sub">{shortDay(r.occurred_at, locale)}</span>
                        </span>
                        <span className="mv-item-end">{euro(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <form className="ms-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
                  <AnswerFields q={q} />
                  <div className="ms-actions">
                    <button type="submit" className="mv-pill" disabled={busy || !answerable}>
                      <span>{busy ? t('Saving\u2026') : t('Continue')}</span>
                    </button>
                    {skippable ? (
                      <button type="button" className="mv-pill mv-pill--ghost" onClick={() => void skip()} disabled={busy}>
                        <span>{t('Skip this')}</span>
                      </button>
                    ) : null}
                  </div>
                  {note ? <p className="ms-note" role="alert">{note}</p> : null}
                </form>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

