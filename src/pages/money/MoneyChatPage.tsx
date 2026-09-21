/**
 * Ask.
 *
 * The conversation about the money itself: any month, any shop, anything that leaves the
 * account, answered from the person's own payments with a figure when one says it better
 * and the payments underneath. The same conversation the phone has as its own place.
 *
 * The questions the ledger cannot work out on its own live on /money/setup; when there
 * are any, this page says how many and points there, and otherwise stays out of the way.
 * This page used to be that setup flow again as a transcript, which was the same page
 * twice under two names in the sidebar.
 *
 * The right-hand column shows the engine reading the ledger as it happens: real steps,
 * real counts, nothing invented. If the trace stream is not there, the column says so.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { orbFor } from './orbFor';
import { useAuth } from '@/contexts/AuthContext';
import { motion } from 'framer-motion';
import { ArrowUp, Paperclip } from 'lucide-react';
import '../../styles/money-v2.css';
import '../../styles/money-chat.css';
import MoneyNav, { type MoneyNavLink } from './MoneyNav';
import { MONEY_NAV } from './navLinks';
import { euro, shortDay } from '../../services/api/moneyAPI';
import { ACCEPT } from './chat/askLine';
import { useConversation } from './chat/useConversation';
import { type TraceStep } from './chat/useLedgerTrace';
import { Figure } from './MoneyFigures';
import LedgerOrb from '../../components/LedgerOrb';
import { useT } from '@/lib/i18n';

const NAV: MoneyNavLink[] = MONEY_NAV('ask');

/**
 * The ledger at work, in view: the orb in the state of the work (searching while the rows
 * are read, solving once the model reasons), the step in words beside it, and the train of
 * thought as it is written, the newest lines kept in view. When the answer starts, this
 * gives way to it and the thought folds into How it got there.
 */
function Pending({ status, thinking, still }: { status: string; thinking?: string; still: boolean }) {
  const t = useT();
  const thought = (thinking || '').trim();
  /* The reasoning is not streamed onto the screen: one quiet line counts the seconds while
     the model thinks, and the thought waits under How it got there once the answer is in
     (2026-09-21, the way Claude and ChatGPT fold it). */
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!thought) return undefined;
    const id = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [Boolean(thought)]);
  const work = thought ? 'thinking' : /file|arquivo|archivo/i.test(status) ? 'file' : 'reading';
  return (
    <div className="mc-pending" aria-live="polite">
      {/* The library's two sizes are two designs: 64 is its chat-avatar scale, 20 its inline
          scale. While an answer is on its way the orb is the avatar (2026-09-19). */}
      <LedgerOrb state={orbFor(work)} size={64} paused={still} label="" className="mc-pending-orb" />
      <div className="mc-pending-body">
      <p className="mc-line-text is-pending">
        <span>{thought ? t('Working it out') : t(status)}</span>
      </p>
      {thought ? <p className="mv-quiet mc-thinking-line">{seconds < 2 ? t('Thinking') : t('Thinking for {n} s', { n: seconds })}</p> : null}
      </div>
    </div>
  );
}

/* A heading, one grey line, then the steps as rows under the ink rule. The step in
   progress is the one in ink at 500; the rest have gone quiet. */
/* The step's name comes off the wire in English, one per step id, so the panel is named
   here and read in the person's own language. A detail that carries a number still comes
   through as the server wrote it. */
const STEP_LABEL: Record<string, string> = {
  bank: 'Reading the bank', ledger: 'Reading the payments', places: 'Working out the places',
  learn: 'Learning the rhythms', patterns: 'Reading what it means', gaps: 'Finding what it cannot explain',
  end: 'Done',
};

function TracePanel({ steps, reading }: { steps: TraceStep[]; reading: boolean }) {
  const t = useT();
  /* Six rows of zeros ending in Done is what a new account saw here: machinery with
     nothing in it. Until something has been read, the panel is one quiet line. */
  const idle = steps.length > 0 && steps.every((s) => !s.count);
  return (
    <aside className="mc-trace" aria-label={t('What it is doing')}>
      {/* One orb for the whole panel, at its head. One per unfinished row meant three or four
          canvases turning at once, and on a long read they never stopped (2026-09-16). */}
      {reading && steps.length ? <p className="mc-trace-head"><LedgerOrb state={orbFor('trace')} size={20} label="" /><span className="mv-sub">{t('Reading the ledger.')}</span></p> : null}
      {steps.length === 0 ? (
        <p className="mv-sub">{t('Not reading the ledger right now.')}</p>
      ) : idle ? (
        <p className="mv-sub">{t('Nothing to read yet. Connect Santander under Sources.')}</p>
      ) : (
        <ul className="mv-list mc-steps" aria-live="polite">
          {steps.map((s) => (
            <li key={s.step} className={`mv-item mv-item--tight mc-step${reading && !s.done ? ' is-live' : ''}`}>
              <span className="mv-item-text">
                <span className="mv-item-title">{t(STEP_LABEL[s.step] || s.label)}</span>
                {s.say?.key ? <span className="mv-item-sub">{t(s.say.key, s.say.vars)}</span> : s.detail ? <span className="mv-item-sub">{t(s.detail)}</span> : null}
              </span>
              {s.count === null ? null : <span className="mv-item-end">{s.count}</span>}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export default function MoneyChatPage() {
  const { user } = useAuth();
  return <MoneyConversation key={user?.id || 'signed-out'} />;
}

function MoneyConversation() {
  const c = useConversation();
  const { openQuestions, lines, traceOpen, setTraceOpen, asking, text, setText, historyFailed, locale, t, boxRef, fileRef, trace, stillMotion, offers, offersShown, toggleHow, ask, attach, take, rise } = c;
  return (
    <main className="mv mc">
      <div className="mv-shell">
        <MoneyNav links={NAV} />
        <div className="mv-col">
          <div className="mc-columns">
            <section
              className="mc-thread"
              onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
              onDrop={(e) => { const f = e.dataTransfer.files?.[0]; if (f) { e.preventDefault(); void attach(f); } }}
            >
              <div className={`mc-scroll${lines.length ? '' : ' is-empty'}`}>
                <div className="mc-turn">
                  <h1>{t('Ask.')}</h1>
                  <p className="mv-sub">{t('Any month, any shop, anything that leaves your account. Answers come from your own payments, with the payments underneath.')}</p>
                  {openQuestions > 0 ? (
                    <div className="mc-actions">
                      <Link to="/money/setup" className="mv-pill mv-pill--ghost">
                        <span>{openQuestions === 1 ? t('one thing it cannot work out on its own') : t('{n} things it cannot work out on its own', { n: openQuestions })}</span>
                      </Link>
                    </div>
                  ) : null}
                </div>

                {historyFailed ? <p role="alert" className="mv-note">{t('Your earlier conversation could not be loaded. Refresh to try again.')}</p> : null}
                {lines.map((l) => (
                  <motion.div key={l.id} className={`mc-line ${l.who === 'you' ? 'mc-line--you' : ''}`} {...rise}>
                    <span className="mc-line-who">{l.who === 'you' ? t('You') : t('The ledger')}</span>
                    {l.pending ? (
                      <Pending status={l.text} thinking={l.thinking} still={Boolean(stillMotion)} />
                    ) : (
                      <p className="mc-line-text">{l.text}{l.writing ? <LedgerOrb state={orbFor('writing')} size={16} className="mc-writing" label={t('Writing')} /> : null}</p>
                    )}
                    {l.error ? <p role="alert" className="mv-note">{l.error}</p> : null}
                    {l.file?.url ? <img className="mc-file" src={l.file.url} alt="" /> : null}
                    {l.figures?.map((f, k) => <Figure key={k} figure={f} />)}
                    {l.who === 'twin' && l.actions && l.actions.length ? (
                      <div className="mc-acts" role="group" aria-label={t('What it can do')}>
                        {l.actions.map((a, k) => (
                          <button key={k} type="button" className="mv-pill mv-pill--ghost" onClick={() => void take(l.id, a)}><span>{a.label}</span></button>
                        ))}
                      </div>
                    ) : null}
                    {l.acted ? <p className="mc-acted">{l.acted}</p> : null}
                    {l.who === 'twin' && !l.pending && ((l.thinking && l.thinking.trim()) || (l.basis && l.basis.length)) ? (
                      <div className="mc-how">
                        <button type="button" className="mc-how-toggle" aria-expanded={Boolean(l.howOpen)} onClick={() => toggleHow(l.id)}>{t('How it got there')}</button>
                        {l.howOpen ? (
                          <div className="mc-how-body">
                            {l.thinking && l.thinking.trim() ? <p className="mc-how-thought">{l.thinking.trim()}</p> : null}
                            {l.basis && l.basis.length ? (
                              <ul className="mc-how-basis">
                                {l.basis.map((b, k) => <li key={k}>{b}</li>)}
                              </ul>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {l.receipts && l.receipts.length ? (
                      <div className="mc-receipts">
                        <span className="mv-quiet">{l.receipts.length === 1 ? t('Read from one payment') : t('Read from {n} payments', { n: l.receipts.length })}</span>
                        <ul className="mv-list">
                          {l.receipts.slice(0, 8).map((r) => (
                            <li key={r.id} className="mv-item mv-item--tight">
                              <span className="mv-item-text">
                                <span className="mv-item-title">{r.merchant}</span>
                                <span className="mv-item-sub">{shortDay(r.occurred_at, locale)}</span>
                              </span>
                              <span className="mv-item-end">{euro(r.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </motion.div>
                ))}

                {offersShown ? (
                  <div className="mc-offers" role="group" aria-label={t('Things to ask')}>
                    {offers.map((q) => (
                      <button key={q} type="button" className="mv-pill mv-pill--ghost" onClick={() => ask(t(q))}><span>{t(q)}</span></button>
                    ))}
                  </div>
                ) : null}

                <div className="mc-end" />
              </div>

              <div className="mc-composer">
                <form className="mc-composer-inner" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPT}
                    className="mv-sr"
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void attach(f); }}
                  />
                  <button type="button" className="mc-attach" aria-label={t('Add a photo or a file')} disabled={asking} onClick={() => fileRef.current?.click()}>
                    <Paperclip size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <label className="mv-sr" htmlFor="mc-say">{t('Ask about your money')}</label>
                  <textarea
                    id="mc-say"
                    ref={boxRef}
                    className="mc-say"
                    rows={1}
                    maxLength={2000}
                    value={text}
                    placeholder={t('Ask about your money')}
                    disabled={asking}
                    onChange={(e) => setText(e.target.value)}
                    onPaste={(e) => { const f = e.clipboardData.files?.[0]; if (f) { e.preventDefault(); void attach(f); } }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(text); }
                    }}
                  />
                  <button type="submit" className="mv-pill mc-send" disabled={asking || !text.trim()} aria-label={t('Ask')}>
                    <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </form>
              </div>
            </section>

            {/* The ledger's own progress is for the curious, not the default: one link opens it. */}
            <aside className="mc-side">
              <button type="button" className="mc-trace-toggle" aria-expanded={traceOpen} onClick={() => setTraceOpen((o) => !o)}>{t('What it is doing')}</button>
              {traceOpen ? <TracePanel steps={trace.steps} reading={trace.reading} /> : null}
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

