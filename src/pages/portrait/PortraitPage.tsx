import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SOURCE_LABEL, type Domain, type PortraitData, type Reading, type Verdict } from '../../data/demoPortrait';
import { deriveState, daysSince, findScripted } from '../../lib/portrait';
import '../../styles/presence-cosmos.css';

/**
 * The Portrait: the product's one page, set on one editorial frame with a persistent
 * margin. Claims run in the wide column; their proof sits beside them in the margin,
 * the way footnotes sit beside a printed line. Four movements: a headline that says the
 * one thing (a synthesis, never repeated below); today's question, on a band that
 * carries the evidence that provoked it; the signature, five stanzas that open one at a
 * time onto their readings and receipts; and Ask, answered in the voice the readings
 * are written in.
 *
 * A serif scale of four: headline, question, signature line, reading. Instrument Serif
 * for what is read; Geist for anything you can click; Geist Mono only for machine
 * provenance, which is timestamps, sources and section marks.
 * Spec: .claude/plans/2026-09-03-portrait.
 *
 * Verdicts and the question's answer are local state here: this page renders a static
 * export. The product wires the same props to the API through PortraitHandlers.
 */

const ORDER: Domain[] = ['motivation', 'personality', 'cultural', 'social', 'lifestyle'];

/** The five stanzas, named the way a person would name them. */
const STANZA: Record<Domain, string> = {
  motivation: 'How you work',
  personality: 'How you settle',
  cultural: 'What you follow',
  social: 'Who you keep close',
  lifestyle: 'How you recover',
};

export type PortraitHandlers = {
  /** Live: persist a verdict. The page updates optimistically either way. */
  onVerdict?: (readingId: string, verdict: Verdict) => Promise<void> | void;
  /** Live: persist today's answer. */
  onAnswer?: (readingIds: string[], answer: string) => Promise<void> | void;
  /** Live: ask the twin. Resolves to the answer and the readings it cites; the demo uses the scripted path when absent. */
  onAsk?: (question: string) => Promise<{ a: string; cites: string[] }>;
  /** Live: delete everything read from one platform. Absent in the demo, so no control shows. */
  onDeleteSource?: (platform: string) => Promise<void> | void;
};

type Block = { domain: Domain; line: string | null; readings: Reading[] };

function spoken(d: Date, withYear = true) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
}

function spokenDay(iso: string, withYear = false) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : spoken(d, withYear);
}

const HEADLINE_STOPWORDS = new Set([
  'you', 'your', 'yours', 'the', 'a', 'an', 'and', 'then', 'for', 'of', 'in', 'on', 'to', 'it', 'is', 'are',
  'with', 'that', 'this', 'into', 'at', 'by', 'but', 'so', 'as', 'from', 'when', 'they', 'their', 'not',
]);

/**
 * The headline's one flourish: a single word in italic, the most particular word of the
 * opening clause. Longest word wins, earliest on a tie; pronouns and joins never do, and
 * the punctuation around it stays roman.
 */
function Headline({ text }: { text: string }) {
  const clauseEnd = text.search(/[,;:.]/);
  const tokens = text.split(/(\s+)/);
  let best = -1;
  let bestLength = 2;
  let seen = 0;
  tokens.forEach((tok, i) => {
    const start = seen;
    seen += tok.length;
    if (/^\s*$/.test(tok)) return;
    if (clauseEnd >= 0 && start > clauseEnd) return;
    const word = tok.replace(/[^A-Za-z'-]/g, '');
    if (!word || HEADLINE_STOPWORDS.has(word.toLowerCase())) return;
    if (word.length > bestLength) { best = i; bestLength = word.length; }
  });
  if (best < 0) return <>{text}</>;
  return <>{tokens.map((tok, i) => {
    if (i !== best) return <React.Fragment key={i}>{tok}</React.Fragment>;
    const [, before, word, after] = tok.match(/^([^A-Za-z]*)(.*?)([^A-Za-z]*)$/s) ?? [null, '', tok, ''];
    return <React.Fragment key={i}>{before}<em>{word}</em>{after}</React.Fragment>;
  })}</>;
}

/** "3 Sep 09:32" or "3 Sep" in one mono line. */
function when(at: string) {
  const [date, time] = at.split(' ');
  const d = new Date(`${date}T00:00:00Z`);
  const day = Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return time ? `${day} ${time}` : day;
}

/** The proof of one reading, in the margin beside it. */
const RECEIPTS_SHOWN = 3;

function Receipts({ reading }: { reading: Reading }) {
  const rest = reading.evidence.length - RECEIPTS_SHOWN;
  return (
    <ol className="pc-pt-evidence" aria-label="Receipts">
      {reading.evidence.slice(0, RECEIPTS_SHOWN).map((e, i) => (
        <li key={i}>
          <span className="pc-pt-when">{when(e.at)} · {SOURCE_LABEL[e.source] ?? e.source}</span>
          <span className="pc-pt-event">{e.event}</span>
        </li>
      ))}
      {rest > 0 ? <li className="pc-pt-more"><span className="pc-pt-event">and {rest} more like {rest === 1 ? 'it' : 'them'}</span></li> : null}
    </ol>
  );
}

function ReadingRow({ reading, now, verdict, onVerdict, cite }: {
  reading: Reading; now: Date; verdict: Verdict; onVerdict: (v: Verdict) => void; cite: number | null;
}) {
  const state = deriveState({ ...reading, verdict }, now);
  const note = state === 'fading' ? `Fading, last supported ${daysSince(reading.supportedAt, now)} days ago` : state === 'disputed' ? 'Disputed' : null;
  return (
    <li className={`pc-pt-row is-${state}`} id={`reading-${reading.id}`}>
      <p className="pc-pt-mono pc-pt-row-index">{cite ? `[${cite}]` : ''}</p>
      <div>
        <p className="pc-pt-claim">{reading.text}</p>
        <div className="pc-pt-vote" role="group" aria-label={`True of you? ${reading.text}`}>
          {(['true', 'partly', 'wrong'] as const).map((v) => (
            <button key={v} type="button" className={verdict === v ? 'is-active' : ''} aria-pressed={verdict === v} onClick={() => onVerdict(verdict === v ? null : v)}>
              {v === 'true' ? 'True' : v === 'partly' ? 'Partly' : 'Wrong'}
            </button>
          ))}
          {note ? <span className="pc-pt-mono pc-pt-note">{note}</span> : null}
        </div>
      </div>
      <Receipts reading={reading} />
    </li>
  );
}

export function PortraitPage({ data, now, banner, onVerdict, onAnswer, onAsk, onDeleteSource }: { data: PortraitData; now: Date; banner?: React.ReactNode } & PortraitHandlers) {
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() => Object.fromEntries(data.readings.map((r) => [r.id, r.verdict])));
  const [answer, setAnswer] = useState<string | null>(data.question?.yourAnswer ?? null);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState<{ a: string; cites: string[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const readings = useMemo(() => data.readings.map((r) => ({ ...r, verdict: verdicts[r.id] ?? null })), [data.readings, verdicts]);
  const byId = useMemo(() => new Map(readings.map((r) => [r.id, r])), [readings]);
  const sourceCount = data.sources.length;
  const readingCount = readings.length;
  const receiptCount = readings.reduce((n, r) => n + r.evidence.length, 0);
  const cites = reply?.cites ?? [];

  // The five stanzas in order; the first with a line becomes the headline and stays at
  // the top of the page rather than repeating itself in the list below.
  const blocks: Block[] = useMemo(() => {
    const lines = new Map(data.signature.map((s) => [s.domain, s]));
    return ORDER.map((domain) => ({
      domain,
      line: lines.get(domain)?.line ?? null,
      readings: readings.filter((r) => r.domain === domain),
    })).filter((b) => b.line || b.readings.length);
  }, [data.signature, readings]);

  // With no lead of its own, the portrait promotes its strongest line and that stanza
  // shows its own strongest reading instead, so nothing is printed twice.
  const promoted = data.lead ? null : blocks.find((b) => b.line) ?? null;
  const lead = data.lead ?? promoted?.line ?? null;
  const [openDomain, setOpenDomain] = useState<Domain | null>(() => (
    ORDER.find((d) => readings.some((r) => r.domain === d)) ?? null
  ));

  function showReading(id: string) {
    const r = byId.get(id);
    if (r) setOpenDomain(r.domain);
    window.setTimeout(() => document.getElementById(`reading-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  }

  function showReply(r: { a: string; cites: string[] }) {
    setReply(r);
    const [target] = r.cites;
    if (target) showReading(target);
  }

  async function ask(q: string) {
    if (!q.trim()) return;
    if (onAsk) {
      try { showReply(await onAsk(q)); } catch { showReply({ a: 'Something went wrong on my side. Ask again in a moment.', cites: [] }); }
      return;
    }
    const hit = findScripted(data.ask, q);
    if (!hit) { showReply({ a: `I do not know that yet. Nothing in the ${sourceCount} sources I read supports an answer.`, cites: [] }); return; }
    showReply({ a: hit.a, cites: hit.cites });
  }

  function verdict(readingId: string, v: Verdict) {
    setVerdicts((s) => ({ ...s, [readingId]: v }));
    void onVerdict?.(readingId, v);
  }

  function answerToday(a: string) {
    setAnswer(a);
    if (a !== 'skipped' && data.question) void onAnswer?.(data.question.fromReadings, a);
  }

  /** The rail of a stanza: the way in, or the way out. */
  function stanzaRail(b: Block) {
    const isOpen = openDomain === b.domain;
    if (!b.readings.length) return <span />;
    return (
      <div className="pc-pt-count">
        <button type="button" className={`pc-pt-open ${isOpen ? 'is-on' : ''}`} aria-expanded={isOpen} onClick={() => setOpenDomain(isOpen ? null : b.domain)}>
          {isOpen ? 'Close' : 'Read them'}
        </button>
      </div>
    );
  }

  function ledger(b: Block) {
    if (openDomain !== b.domain || !b.readings.length) return null;
    const live = b.readings.filter((r) => deriveState(r, now) !== 'disputed');
    const sources = [...new Set(live.flatMap((r) => r.evidence.map((e) => SOURCE_LABEL[e.source] ?? e.source)))];
    const receipts = live.reduce((n, r) => n + r.evidence.length, 0);
    return (
      <ul className="pc-pt-ledger">
        <li className="pc-pt-ledger-mark">
          <span /><span className="pc-pt-mono">True of you?</span>
          <span className="pc-pt-mono">Read from {sources.join(', ')} · {receipts} receipts</span>
        </li>
        {b.readings.map((r) => (
          <ReadingRow key={r.id} reading={r} now={now} verdict={verdicts[r.id] ?? null} onVerdict={(v) => verdict(r.id, v)} cite={cites.includes(r.id) ? cites.indexOf(r.id) + 1 : null} />
        ))}
      </ul>
    );
  }

  const questionSource = data.question ? data.question.evidenceLine.split(':')[0] : '';
  const questionEvidence = data.question ? data.question.evidenceLine.split(':').slice(1).join(':').trim() : '';
  const since = data.sources.length ? spokenDay([...data.sources].map((s) => s.since).sort()[0], true) : null;

  return (
    <main className="presence-cosmos pc-portrait" id="main-content">
      <header className="pc-pt-masthead">
        <Link to="/" className="pc-pt-mono pc-pt-wordmark">TwinMe</Link>
        <nav className="pc-pt-mono" aria-label="Sections">
          <a href="#signature">Signature</a>
          <a href="#ask">Ask</a>
          <a href="#sources">Sources</a>
        </nav>
      </header>

      <section className="pc-pt-hero" aria-labelledby="pc-pt-headline">
        <p className="pc-pt-mono pc-pt-kicker">{banner ?? <>{data.owner}'s portrait</>}</p>
        <h1 id="pc-pt-headline" className="pc-pt-serif">{lead ? <Headline text={lead} /> : `${data.owner}.`}</h1>
        <p className="pc-pt-mono pc-pt-index">
          <span>{readingCount} readings from {receiptCount} receipts</span>
          <span>Read {spoken(now)}</span>
        </p>

      </section>

      {data.question ? (
        <section className="pc-pt-today" aria-labelledby="pc-pt-q-title">
          <div className="pc-pt-today-inner pc-pt-grid">
            <div>
              <h2 id="pc-pt-q-title" className="pc-pt-serif">{data.question.question}</h2>
              {answer ? (
                <p className="pc-pt-serif pc-pt-answered">{answer === 'skipped' ? 'Skipped for today.' : <em>{answer}.</em>}</p>
              ) : (
                <>
                  <div className="pc-pt-choices">
                    {data.question.answers.map((a) => (
                      <button key={a} type="button" onClick={() => answerToday(a)}>{a}</button>
                    ))}
                  </div>
                  <button type="button" className="pc-pt-skip" onClick={() => answerToday('skipped')}>Skip today</button>
                </>
              )}
            </div>
            <div className="pc-pt-q-evidence">
              <span className="pc-pt-mono">Today, from {questionSource}</span>
              <span>{questionEvidence}</span>
            </div>
          </div>
        </section>
      ) : null}

      <section className="pc-pt-signature" id="signature" aria-label="Signature">
        <p className="pc-pt-mono pc-pt-section-mark">Signature</p>
        <ol className="pc-pt-lines">
          {blocks.map((b, i) => (
            <li key={b.domain} className={`pc-pt-line ${i === 0 ? 'is-first' : ''} ${openDomain === b.domain ? 'is-open' : ''}`}>
              <div className="pc-pt-line-head">
                <p className="pc-pt-mono pc-pt-label">{STANZA[b.domain]}{b.readings.length ? <b>{b.readings.length}</b> : null}</p>
                <p className="pc-pt-serif pc-pt-sentence">{(b === promoted ? b.readings[0]?.text : b.line) ?? b.readings[0]?.text}</p>
                {stanzaRail(b)}
              </div>
              {ledger(b)}
            </li>
          ))}
        </ol>
      </section>

      <section className="pc-pt-ask" id="ask" aria-label="Ask">
        <p className="pc-pt-mono pc-pt-section-mark">Ask</p>
        <div className="pc-pt-grid pc-pt-ask-body">
          <div>
            <form className="pc-pt-prompt" onSubmit={(e) => { e.preventDefault(); void ask(query); }}>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask something about yourself" aria-label="Ask something about yourself" />
              <button type="submit" className="pc-pt-send">Ask</button>
            </form>
            {reply ? (
              <blockquote className="pc-pt-reply" aria-live="polite">
                <p className="pc-pt-serif">{reply.a}</p>
                <footer className="pc-pt-cites">
                  {reply.cites.length
                    ? <>It read {reply.cites.map((id, i) => <a key={id} href={`#reading-${id}`} onClick={(e) => { e.preventDefault(); showReading(id); }}>[{i + 1}]</a>)} to answer that.</>
                    : 'Nothing it read supports more than this.'}
                </footer>
              </blockquote>
            ) : null}
          </div>
          {data.ask.length ? (
            <div className="pc-pt-rail pc-pt-hints">
              {data.ask.filter((s) => s.q !== query).map((s) => (
                <button key={s.q} type="button" onClick={() => { setQuery(s.q); void ask(s.q); }}>
                  <span>{s.q}</span><i aria-hidden="true">&#8594;</i>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="pc-pt-sources" id="sources" aria-label="Sources">
        <p className="pc-pt-mono pc-pt-section-mark">Sources</p>
        <table className="pc-pt-table">
          <thead className="pc-pt-mono">
            <tr><th>Source</th><th>What was read</th><th>Since</th><th className="is-num">Items</th>{onDeleteSource ? <th /> : null}</tr>
          </thead>
          <tbody>
            {data.sources.map((s) => {
              const items = parseInt(s.read, 10) || 0;
              return (
              <React.Fragment key={s.platform}>
                <tr>
                  <td>{s.label}</td>
                  <td className="is-kinds">{s.kinds}</td>
                  <td className="is-since">{spokenDay(s.since, true)}</td>
                  <td className="is-num">{items}</td>
                  {onDeleteSource ? (
                    <td className="is-act">
                      {confirmDelete === s.platform ? null : <button type="button" className="pc-pt-textbtn" onClick={() => setConfirmDelete(s.platform)}>Delete</button>}
                    </td>
                  ) : null}
                </tr>
                {onDeleteSource && confirmDelete === s.platform ? (
                  <tr className="pc-pt-confirm-row">
                    <td colSpan={5}>
                      <div className="pc-pt-confirm" role="group" aria-label={`Delete everything from ${s.label}`}>
                        <span>Delete everything read from {s.label}? Readings that leaned on it will fade.</span>
                        <button type="button" className="pc-pt-textbtn is-strong" disabled={deleting === s.platform}
                          onClick={async () => { setDeleting(s.platform); try { await onDeleteSource(s.platform); } finally { setDeleting(null); setConfirmDelete(null); } }}>
                          {deleting === s.platform ? 'Deleting' : 'Yes, delete'}
                        </button>
                        <button type="button" className="pc-pt-textbtn" onClick={() => setConfirmDelete(null)}>Keep</button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>{sourceCount} sources</td>
              <td className="is-kinds" />
              <td className="is-since" />
              <td className="is-num">{data.sources.reduce((n, s) => n + (parseInt(s.read, 10) || 0), 0)} items</td>
              {onDeleteSource ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="pc-pt-close" aria-label="What is not read">
        <div className="pc-pt-close-inner pc-pt-grid">
          <p className="pc-pt-serif">Messages, photos, location and anything typed here are never read. Nothing trains a model.</p>
          <div className="pc-pt-rail pc-pt-close-rail">
            {banner
              ? <Link className="pc-pt-close-cta" to="/">Read yourself</Link>
              : <Link className="pc-pt-close-cta" to="/sources">Delete everything</Link>}
          </div>
        </div>
      </section>
    </main>
  );
}

export default PortraitPage;
