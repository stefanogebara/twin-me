import { Link } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, Loader2, Plus } from 'lucide-react';
import { SOURCE_LABEL, type Evidence, type PortraitData, type Reading, type Verdict } from '../../data/demoPortrait';
import { deriveState, groupByDomain, DOMAIN_HEAD, DOMAIN_ORDER, daysSince, findScripted } from '../../lib/portrait';
import '../../styles/presence-cosmos.css';

/**
 * The Portrait, in the register (2026-09-12): a flat app screen, rows under a 1px ink
 * rule. No room, no clip, no panels over a picture.
 *
 * Composition:
 *   sidebar — links to the sections; a menu on phones
 *   title   — the headline reading, and how many places it was read from
 *   column  — today's question, the readings in their five domains (each domain's
 *             signature line is its section's grey line), Ask, and what is read and
 *             never read
 *
 * Every reading is a row: the reading as its title, one grey line for what it was read
 * from. A press opens its receipts and the verdict as sub-rows.
 *
 * Verdicts and today's answer update locally first; the live page wires the same props to
 * the API through PortraitHandlers. Without onAsk, Ask answers from the export's scripts.
 */

export type PortraitHandlers = {
  /** Live: persist a verdict. The page updates optimistically either way. */
  onVerdict?: (readingId: string, verdict: Verdict) => Promise<void> | void;
  /** Live: persist today's answer. */
  onAnswer?: (readingIds: string[], answer: string) => Promise<void> | void;
  /** Live: ask the twin. Resolves to the answer and the readings it cites. */
  onAsk?: (question: string) => Promise<{ a: string; cites: string[] }>;
  /** Live: delete everything read from one platform. Absent in the demo, so no control shows. */
  onDeleteSource?: (platform: string) => Promise<void> | void;
};

const VERDICT_LABEL: Record<Exclude<Verdict, null>, string> = { true: 'That is me', partly: 'Partly', wrong: 'Not me' };

/** Prompts for Ask when the data carries none of its own. They only prefill the question. */
const DEFAULT_HINTS = ['What do I do when work piles up?', 'Am I resting enough?', 'Who do I actually talk to?'];

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" /><circle cx="14" cy="5" r="2.7" /><circle cx="23" cy="5" r="2.7" /><circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" /><circle cx="14" cy="23" r="2.7" /><circle cx="5" cy="23" r="2.7" /><circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** Text arriving at a typist's pace: the twin's answer, as it is written. */
function useTyped(text: string, cps: number, enabled: boolean) {
  const [n, setN] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) { setN(text.length); return; }
    setN(0);
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(text.length, Math.floor(((performance.now() - start) / 1000) * cps));
      setN(k);
      if (k < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, cps, enabled]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

/** The value of `data-<attr>` on whichever element sits under the middle of the screen. */
function useCentered(attr: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      const mid = window.innerHeight * 0.5;
      const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-${attr}]`));
      const hit = els.find((el) => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
      setValue(hit?.dataset[attr] || fallback);
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(pick); };
    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) window.cancelAnimationFrame(raf); };
  }, [attr, fallback]);
  return value;
}

/** The first words of a line, cut at a word, for a row that names the reading it opens. */
function shortLine(text: string, max = 36) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > 12 ? cut.slice(0, at) : cut).replace(/[,;:.]$/, '')}…`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthName(iso: string | undefined) {
  const m = Number(String(iso ?? '').slice(5, 7));
  return MONTHS[m - 1] ?? '';
}

/** "11 Aug" from an ISO date: a receipt is dated the way a person says a day. */
function spokenDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "A, B and C". */
function listWords(words: string[]) {
  return words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** A source as a person says it: "your calendar", not "Calendar". */
const SOURCE_SPOKEN: Record<string, string> = { google_calendar: 'your calendar', google_gmail: 'your email', web: 'the web' };

/** "From your calendar and Spotify": what a line was read from, in plain words. */
function fromLine(evidence: Evidence[]) {
  const names = [...new Set(evidence.map((e) => SOURCE_SPOKEN[e.source] ?? SOURCE_LABEL[e.source] ?? e.source))];
  return names.length ? `From ${listWords(names)}` : '';
}

/** A receipt: what happened, then the source and the day. */
function ReceiptRow({ e }: { e: Evidence }) {
  return (
    <li className="pc-subrow pc-pt-receipt">
      <p className="pc-pt-receipt-event">{e.event}</p>
      <p className="pc-pt-receipt-when">{SOURCE_LABEL[e.source] ?? e.source}, {spokenDay(e.at)}</p>
    </li>
  );
}

function ReadingRow({ reading, now, verdict, onVerdict, open, onToggle, lit }: {
  reading: Reading; now: Date; verdict: Verdict; onVerdict: (v: Verdict) => void; open: boolean; onToggle: () => void; lit: boolean;
}) {
  const state = deriveState({ ...reading, verdict }, now);
  const age = daysSince(reading.supportedAt, now);
  return (
    <li className={`pc-pt-reading${lit ? ' is-lit' : ''}`} id={`reading-${reading.id}`}>
      <button type="button" className="pc-row pc-row--plain pc-row--link" onClick={onToggle} aria-expanded={open}>
        <span className="pc-row-text">
          <span className="pc-row-title">{reading.text}</span>
          <span className="pc-row-line">{fromLine(reading.evidence)}{state === 'fading' ? `, last seen ${age} days ago` : ''}</span>
        </span>
        {open ? <ChevronUp className="pc-chevron" aria-hidden="true" /> : <ChevronDown className="pc-chevron" aria-hidden="true" />}
      </button>
      {open ? (
        <ul className="pc-pt-sub" aria-label="What it was read from">
          {reading.evidence.map((e, i) => <ReceiptRow key={i} e={e} />)}
          <li className="pc-subrow pc-pt-choice">
            <p className="pc-pt-choice-label">Is this you?</p>
            <div className="pc-pt-choice-buttons" role="group" aria-label="Your verdict">
              {(['true', 'partly', 'wrong'] as const).map((v) => (
                <button key={v} type="button" className="pc-btn pc-btn--secondary" aria-pressed={verdict === v} onClick={() => onVerdict(verdict === v ? null : v)}>
                  {verdict === v ? <Check size={14} aria-hidden="true" /> : null}{VERDICT_LABEL[v]}
                </button>
              ))}
            </div>
          </li>
        </ul>
      ) : null}
    </li>
  );
}

export function PortraitPage({ data, now, banner, onVerdict, onAnswer, onAsk, onDeleteSource }: { data: PortraitData; now: Date; banner?: React.ReactNode } & PortraitHandlers) {
  const reduced = usePrefersReducedMotion();
  const active = useCentered('group', '');
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() => Object.fromEntries(data.readings.map((r) => [r.id, r.verdict])));
  const [open, setOpen] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(data.question?.yourAnswer ?? null);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState<{ a: string; cites: string[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [lit, setLit] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const readings = useMemo(() => data.readings.map((r) => ({ ...r, verdict: verdicts[r.id] ?? null })), [data.readings, verdicts]);
  const byId = useMemo(() => new Map(readings.map((r) => [r.id, r])), [readings]);
  // The headline is the first reading; the page does not say it a second time.
  const lead = data.lead ?? data.signature[0]?.line ?? data.readings[0]?.text ?? null;
  // Today's question already stands on its readings; they are not listed again below it.
  const inQuestion = useMemo(() => new Set(data.question?.fromReadings ?? []), [data.question]);
  const groups = useMemo(() => groupByDomain(readings.filter((r) => r.text !== lead && !inQuestion.has(r.id))), [readings, lead, inQuestion]);
  // A source with nothing read is not a source yet.
  const readSources = data.sources.filter((s) => (parseInt(s.read, 10) || 0) > 0);
  const sourceCount = readSources.length;
  const sources = [...readSources].sort((a, b) => (parseInt(b.read, 10) || 0) - (parseInt(a.read, 10) || 0));
  const since = monthName(readSources.map((s) => s.since).sort()[0]);

  // One section per domain, its signature line under the heading. The headline is not said twice.
  const domains = useMemo(() => {
    const sig = new Map(data.signature.filter((s) => s.line !== lead).map((s) => [s.domain, s.line]));
    const byDomain = new Map(groups.map((g) => [g.domain, g.readings]));
    return DOMAIN_ORDER.filter((d) => byDomain.has(d) || sig.has(d)).map((domain) => {
      const rows = byDomain.get(domain) ?? [];
      const said = sig.get(domain);
      // A signature line that is also one of the rows below would be said twice in a row:
      // the row keeps it, and the heading says where the section was read from instead.
      const isSig = !!said && !rows.some((r) => r.text === said);
      return { domain, readings: rows, isSig, line: isSig ? said! : fromLine(rows.flatMap((r) => r.evidence)) };
    });
  }, [data.signature, groups, lead]);

  // What today's question was read from: the receipts behind its readings, newest first.
  const questionReceipts = useMemo(() => {
    if (!data.question) return [];
    const from = data.question.fromReadings.map((id) => byId.get(id)).filter(Boolean) as Reading[];
    return [...from.flatMap((r) => r.evidence)].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  }, [data.question, byId]);

  const twin = useTyped(reply?.a ?? '', 46, !reduced);
  const hints = data.ask.length ? data.ask.map((s) => s.q) : DEFAULT_HINTS;

  const nav = [
    ...(data.question ? [{ id: 'today', href: '#today', label: 'Today' }] : []),
    ...domains.map((d) => ({ id: d.domain, href: `#group-${d.domain}`, label: DOMAIN_HEAD[d.domain] })),
    { id: 'ask', href: '#ask', label: 'Ask' },
    { id: 'sources', href: '#sources', label: 'Sources' },
  ];

  function verdict(id: string, v: Verdict) {
    setVerdicts((s) => ({ ...s, [id]: v }));
    void onVerdict?.(id, v);
  }

  function answerToday(a: string) {
    setAnswer(a);
    if (a !== 'skipped' && data.question) void onAnswer?.(data.question.fromReadings, a);
  }

  function showReply(r: { a: string; cites: string[] }) {
    setReply(r);
    setLit(r.cites);
    if (r.cites[0]) setOpen(r.cites[0]);
  }

  async function ask(q: string) {
    if (!q.trim()) return;
    if (onAsk) {
      setAsking(true);
      try { showReply(await onAsk(q)); } catch { showReply({ a: 'Something went wrong on my side. Ask again in a moment.', cites: [] }); } finally { setAsking(false); }
      return;
    }
    const hit = findScripted(data.ask, q);
    if (!hit) { showReply({ a: `I do not know that yet. Nothing in the ${sourceCount} sources I read supports an answer.`, cites: [] }); return; }
    showReply({ a: hit.a, cites: hit.cites });
  }

  function jumpTo(id: string) {
    setOpen(id);
    setLit([id]);
    // A reading behind today's question lives in that section: open its receipts instead.
    if (inQuestion.has(id)) setQuestionOpen(true);
    (document.getElementById(`reading-${id}`) ?? document.getElementById('today'))?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }

  return (
    <main className="presence-cosmos pc-app pc-portrait" id="main-content">
      {banner}
      <div className="pc-shell">
        <div className="pc-topbar">
          <Link className="pc-side-brand" to="/" aria-label="TwinMe"><Mark /></Link>
          <button type="button" className="pc-btn pc-btn--ghost" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="pc-pt-nav">
            Menu
          </button>
        </div>
        <aside className={`pc-side${menuOpen ? ' is-open' : ''}`} id="pc-pt-nav">
          <Link className="pc-side-brand" to="/" aria-label="TwinMe"><Mark /></Link>
          <nav className="pc-side-nav" aria-label="Portrait">
            {nav.map((item) => (
              <a key={item.id} className="pc-side-link" href={item.href} aria-current={active === item.id ? 'location' : undefined} onClick={() => setMenuOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="pc-col">
          <header className="pc-apphead">
            <h1 className="pc-apphead-title">{lead ?? `${data.owner}.`}</h1>
            <p className="pc-apphead-line">{banner ? `${data.owner}’s` : 'Your'} portrait, read from {sourceCount} source{sourceCount === 1 ? '' : 's'}</p>
          </header>

          {data.question ? (
            <section className="pc-appsection" id="today" data-group="today" aria-labelledby="pc-pt-today">
              <div className="pc-sechead">
                <h2 className="pc-sechead-title" id="pc-pt-today">Today&rsquo;s question</h2>
                <p className="pc-sechead-line">New this week.</p>
              </div>
              <ul className="pc-list">
                <li>
                  <div className="pc-row pc-row--plain">
                    <div className="pc-row-text">
                      <p className="pc-row-title">{data.question.question}</p>
                      <p className="pc-row-line">{fromLine(questionReceipts)}</p>
                    </div>
                    <div className="pc-row-action">
                      <button type="button" className="pc-iconbtn" onClick={() => setQuestionOpen((o) => !o)} aria-expanded={questionOpen}
                        aria-label={questionOpen ? 'Hide what it was read from' : 'Show what it was read from'}>
                        {questionOpen ? <ChevronUp /> : <ChevronDown />}
                      </button>
                    </div>
                  </div>
                  {answer ? (
                    <div className="pc-subrow">
                      <p className="pc-pt-answer">{answer === 'skipped' ? 'Skipped for today' : `In your words: ${answer}`}</p>
                    </div>
                  ) : (
                    <div className="pc-subrow pc-pt-choice">
                      <div className="pc-pt-choice-buttons" role="group" aria-label="Your answer">
                        {data.question.answers.map((a) => (
                          <button key={a} type="button" className="pc-btn pc-btn--secondary" onClick={() => answerToday(a)}>{a}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {questionOpen ? (
                    <ul className="pc-pt-sub" aria-label="What it was read from">
                      {questionReceipts.map((e, i) => <ReceiptRow key={`${e.source}-${e.at}-${i}`} e={e} />)}
                    </ul>
                  ) : null}
                </li>
              </ul>
            </section>
          ) : null}

          {domains.map((d) => (
            <section key={d.domain} className="pc-appsection" id={`group-${d.domain}`} data-group={d.domain} aria-labelledby={`pc-pt-h-${d.domain}`}>
              <div className="pc-sechead">
                <h2 className="pc-sechead-title" id={`pc-pt-h-${d.domain}`}>{DOMAIN_HEAD[d.domain]}</h2>
                {d.line ? <p className={`pc-sechead-line${d.isSig ? ' pc-pt-sigline' : ''}`}>{d.line}</p> : null}
              </div>
              {d.readings.length ? (
                <ul className="pc-list">
                  {d.readings.map((r) => (
                    <ReadingRow key={r.id} reading={r} now={now} verdict={verdicts[r.id] ?? null}
                      onVerdict={(v) => verdict(r.id, v)}
                      open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} lit={lit.includes(r.id)} />
                  ))}
                </ul>
              ) : (
                <div className="pc-list"><p className="pc-empty">No other readings here yet.</p></div>
              )}
            </section>
          ))}

          <section className="pc-appsection" id="ask" data-group="ask" aria-labelledby="pc-pt-ask">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title" id="pc-pt-ask">Ask your twin</h2>
              <p className="pc-sechead-line">It answers as you, and shows what it read.</p>
            </div>
            <ul className="pc-list">
              <li className="pc-row pc-row--plain pc-pt-askrow">
                <form className="pc-pt-ask" onSubmit={(e) => { e.preventDefault(); void ask(query); }}>
                  <input className="pc-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Your question" aria-label="Ask your twin" />
                  <button type="submit" className="pc-btn pc-btn--primary" disabled={asking}>Ask</button>
                </form>
              </li>
              {!reply && !asking ? hints.map((q) => (
                <li key={q}>
                  <button type="button" className="pc-row pc-row--plain pc-row--link" onClick={() => { setQuery(q); void ask(q); }}>
                    <span className="pc-row-text"><span className="pc-row-title">{q}</span></span>
                    <ChevronRight className="pc-chevron" aria-hidden="true" />
                  </button>
                </li>
              )) : null}
              {asking ? (
                <li className="pc-row pc-row--plain">
                  <div className="pc-row-text">
                    <p className="pc-row-title">Your twin</p>
                    <p className="pc-row-line">Reading what you did</p>
                  </div>
                  <Loader2 className="pc-chevron pc-spin" aria-hidden="true" />
                </li>
              ) : null}
              {reply ? (
                <li aria-live="polite">
                  <div className="pc-row pc-row--plain">
                    <div className="pc-row-text">
                      <p className="pc-row-title">{twin.shown}</p>
                      <p className="pc-row-line">
                        {reply.cites.length ? `Your twin, from ${reply.cites.length} reading${reply.cites.length === 1 ? '' : 's'}` : 'Your twin. Nothing it read supports more than this.'}
                      </p>
                    </div>
                    <span />
                  </div>
                  {twin.done && reply.cites.length ? (
                    <ul className="pc-pt-sub" aria-label="What it cites">
                      {reply.cites.map((id) => {
                        const r = byId.get(id);
                        if (!r) return null;
                        return (
                          <li key={id}>
                            <button type="button" className="pc-subrow pc-row--link" onClick={() => jumpTo(id)} aria-label={`Open the reading: ${r.text}`}>
                              <span className="pc-row-line">{shortLine(r.text, 60)}</span>
                              <ChevronRight className="pc-chevron" aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              ) : null}
            </ul>
          </section>

          <section className="pc-appsection" id="sources" data-group="sources" aria-labelledby="pc-pt-src">
            <div className="pc-sechead">
              <h2 className="pc-sechead-title" id="pc-pt-src">Sources</h2>
              <p className="pc-sechead-line">{since ? `Reading since ${since}.` : 'Nothing read yet.'}</p>
              {!banner ? (
                <Link className="pc-iconbtn pc-sechead-add" to="/sources" aria-label="Connect another source"><Plus /></Link>
              ) : null}
            </div>
            <ul className="pc-list">
              <li>
                <div className="pc-row">
                  <span className="pc-row-icon" aria-hidden="true"><Eye /></span>
                  <div className="pc-row-text">
                    <p className="pc-row-title">Reads from {sourceCount} place{sourceCount === 1 ? '' : 's'}</p>
                    <p className="pc-row-line">{listWords(sources.map((s) => s.label))}</p>
                  </div>
                  <div className="pc-row-action">
                    <button type="button" className="pc-iconbtn" onClick={() => { setSourcesOpen((o) => !o); setConfirmDelete(null); }} aria-expanded={sourcesOpen}
                      aria-label={sourcesOpen ? 'Hide each source' : onDeleteSource ? 'Manage sources' : 'Show each source'}>
                      {sourcesOpen ? <ChevronUp /> : <ChevronDown />}
                    </button>
                  </div>
                </div>
                {sourcesOpen ? (
                  <ul className="pc-pt-sub" aria-label="Each source">
                    {sources.map((s) => (
                      <li key={s.platform} className="pc-subrow">
                        <div className="pc-row-text">
                          <p className="pc-row-title">{s.label}</p>
                          <p className="pc-row-line">
                            {confirmDelete === s.platform
                              ? `Delete everything read from ${s.label}?`
                              : `${parseInt(s.read, 10) || 0} read since ${spokenDay(s.since)}: ${s.kinds.charAt(0).toLowerCase()}${s.kinds.slice(1)}`}
                          </p>
                        </div>
                        {onDeleteSource ? (
                          confirmDelete === s.platform ? (
                            <div className="pc-pt-confirm">
                              <button type="button" className="pc-btn pc-btn--secondary" onClick={() => setConfirmDelete(null)}>Keep</button>
                              <button type="button" className="pc-btn pc-btn--danger" onClick={async () => { await onDeleteSource(s.platform); setConfirmDelete(null); }}>Yes, delete</button>
                            </div>
                          ) : (
                            <button type="button" className="pc-btn pc-btn--secondary" onClick={() => setConfirmDelete(s.platform)}>Delete</button>
                          )
                        ) : <span />}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
              <li>
                <Link className="pc-row pc-row--link" to="/privacy-policy">
                  <span className="pc-row-icon" aria-hidden="true"><EyeOff /></span>
                  <span className="pc-row-text">
                    <span className="pc-row-title">Never reads</span>
                    <span className="pc-row-line">Messages, photos or location. Nothing here trains a model.</span>
                  </span>
                  <ChevronRight className="pc-chevron" aria-hidden="true" />
                </Link>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}

export default PortraitPage;
