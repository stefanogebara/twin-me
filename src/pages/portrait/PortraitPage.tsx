import { Link } from 'react-router-dom';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown } from 'lucide-react';
import { DOMAIN_HUE, DOMAIN_LABEL, SOURCE_LABEL, type Evidence, type PortraitData, type Reading, type Verdict } from '../../data/demoPortrait';
import { deriveState, supportLine, groupReadings, daysSince, findScripted, type ReadingState } from '../../lib/portrait';
import '../../styles/presence-cosmos.css';

/**
 * The Portrait: the product's one page, built the way the front door shows it — a
 * liquid-glass panel on the room photograph, holding the real interface. The panel has
 * three scenes, the same three the front door demos: today's question (a reading and what
 * it was read from), Ask (the twin answers in your words and shows what it cites), and
 * your signature (five lines, each measured from named sources). Beneath the stage, on
 * paper, the ledger of every reading with its evidence and your verdict, and the sources.
 *
 * The glass, the arriving rows, the typing: the same recipe as /cosmos/demos, but nothing
 * here is scripted — every row is a receipt, every answer comes from the readings.
 *
 * Motion rules, measured rather than assumed: nothing on this page changes size without
 * animating that size. The glass keeps its top edge and grows or shrinks to the scene it
 * holds; the old scene fades out before the new one rises in; a reading opens by height,
 * not by appearing. Everything respects prefers-reduced-motion by settling instantly.
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

type Scene = 'question' | 'ask' | 'signature';

const SCENES: { id: Scene; label: string; caption: string }[] = [
  { id: 'question', label: "Today's question", caption: 'One new reading, and what it was read from. Say whether it is you.' },
  { id: 'ask', label: 'Ask your twin', caption: 'It answers as you, in your words, and shows what it read to say so.' },
  { id: 'signature', label: 'Your signature', caption: 'One line per domain, each measured from named sources. Nothing from a quiz.' },
];

const STATE_LABEL: Record<ReadingState, string> = {
  new: 'New this week', standing: 'Standing', fading: 'Fading', disputed: 'Disputed',
};

const VERDICT_LABEL: Record<Exclude<Verdict, null>, string> = { true: 'That is me', partly: 'Partly', wrong: 'Not me' };

/** Prompts for Ask when the data carries none of its own. They only prefill the question. */
const DEFAULT_HINTS = ['What do I do when work piles up?', 'Am I resting enough?', 'Who do I actually talk to?'];

/** One easing for every size change on the page: quick out of the gate, long settle. */
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const GROW_MS = 460;
const FADE_OUT_MS = 140;

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" /><circle cx="14" cy="5" r="2.7" /><circle cx="23" cy="5" r="2.7" /><circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" /><circle cx="14" cy="23" r="2.7" /><circle cx="5" cy="23" r="2.7" /><circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

function Wave() {
  return <span className="pc-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
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

/** Text arriving at a typist's pace, the way the front door shows a reading being written. */
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

/**
 * A box that never changes height without animating it. After every render, and whenever
 * its content resizes on its own (typing, arriving rows), it compares the content's height
 * with the last one it painted; if they differ it pins the old height and transitions to
 * the new. The top edge stays where it is. Reduced motion settles instantly.
 */
function AnimatedHeight({ children, className, reduced, duration = GROW_MS }: { children: React.ReactNode; className?: string; reduced: boolean; duration?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const last = useRef<number | null>(null);
  const settle = useRef<(() => void) | null>(null);

  const glide = (o: HTMLDivElement, from: number, to: number) => {
    // Mid-glide, start from where the box is now, not from where it was going.
    const start = settle.current ? o.getBoundingClientRect().height : from;
    settle.current?.();
    if (document.hidden) return; // a hidden tab does not run transitions; leave the height alone
    o.style.transition = 'none';
    o.style.height = `${start}px`;
    void o.offsetHeight; // commit the pinned height before the transition starts
    o.style.transition = `height ${duration}ms ${EASE}`;
    o.style.height = `${to}px`;
    let timer = 0;
    const done = (e?: TransitionEvent) => {
      // Children's transitions bubble here; only the box's own height ends the glide.
      if (e && (e.target !== o || e.propertyName !== 'height')) return;
      window.clearTimeout(timer);
      o.style.transition = ''; o.style.height = ''; o.removeEventListener('transitionend', done); settle.current = null;
    };
    settle.current = () => done();
    o.addEventListener('transitionend', done);
    // If the end event never comes (tab hidden mid-glide), the pinned height still lets go.
    timer = window.setTimeout(() => done(), duration + 120);
  };

  // The box's own border is outside the content it measures; the target includes it.
  const target = (o: HTMLDivElement, i: HTMLDivElement) => Math.round(i.getBoundingClientRect().height) + (o.offsetHeight - o.clientHeight);

  useLayoutEffect(() => {
    const o = outer.current; const i = inner.current;
    if (!o || !i) return;
    const next = target(o, i);
    const prev = last.current;
    last.current = next;
    if (prev === null || prev === next || reduced) return;
    glide(o, prev, next);
  });

  useEffect(() => {
    const o = outer.current; const i = inner.current;
    if (!o || !i || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const next = target(o, i);
      const prev = last.current;
      last.current = next;
      if (prev === null || prev === next || reduced) return;
      glide(o, prev, next);
    });
    ro.observe(i);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, duration]);

  return (
    <div ref={outer} className={className} style={{ overflow: 'hidden' }}>
      <div ref={inner}>{children}</div>
    </div>
  );
}

/**
 * Scenes cross rather than swap: the leaving scene fades in FADE_OUT_MS, then the entering
 * one rises in. Only one scene is in the tree at a time, so the height box above sees a
 * single content change per switch.
 */
function useSceneCross(scene: Scene, reduced: boolean) {
  const [shown, setShown] = useState(scene);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (scene === shown) return;
    if (reduced) { setShown(scene); return; }
    setLeaving(true);
    const t = window.setTimeout(() => { setShown(scene); setLeaving(false); }, FADE_OUT_MS);
    return () => window.clearTimeout(t);
  }, [scene, shown, reduced]);
  return { shown, leaving };
}

/** The first words of a line, cut at a word, for a chip that names the reading it opens. */
function shortLine(text: string, max = 36) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > 12 ? cut.slice(0, at) : cut).replace(/[,;:.]$/, '')}\u2026`;
}

/** "11 Aug" from an ISO date: a receipt is dated the way a person says a day. */
function spokenDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** A receipt as the front door shows one: source and day over the event. `pace` is the ms between arrivals. */
function ReceiptRow({ e, i, pace = 110 }: { e: Evidence; i: number; pace?: number }) {
  return (
    <div className="pc-demo-row is-in pc-pt-arrive" style={{ animationDelay: `${i * pace}ms` }}>
      <span>{SOURCE_LABEL[e.source] ?? e.source} · {spokenDay(e.at)}</span>
      <p>{e.event}</p>
    </div>
  );
}

function ReadingRow({ reading, now, verdict, onVerdict, open, onToggle, lit }: {
  reading: Reading; now: Date; verdict: Verdict; onVerdict: (v: Verdict) => void; open: boolean; onToggle: () => void; lit: boolean;
}) {
  const state = deriveState({ ...reading, verdict }, now);
  const age = daysSince(reading.supportedAt, now);
  // Receipts stay in the tree while the fold closes, so the height it animates from is the height it had.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const t = window.setTimeout(() => setMounted(false), 420);
    return () => window.clearTimeout(t);
  }, [open]);
  return (
    <article className={`pc-pt-row ${open ? 'is-open' : ''} ${lit ? 'is-lit' : ''}`} id={`reading-${reading.id}`}>
      <button type="button" className="pc-pt-row-head" onClick={onToggle} aria-expanded={open}>
        <i style={{ background: DOMAIN_HUE[reading.domain] }} aria-hidden="true" />
        <p>{reading.text}</p>
        <span>{supportLine(reading)}{state === 'fading' ? ` · last supported ${age} days ago` : ''}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {/* Always in the tree so the height animates both ways; inert to readers and the keyboard when shut. */}
      <div className="pc-pt-row-fold" aria-hidden={!open}>
        <div className="pc-pt-row-fold-inner">
          <div className="pc-pt-row-body">
            <div className="pc-demo-log" aria-label="Evidence">
              {mounted ? reading.evidence.map((e, i) => <ReceiptRow key={i} e={e} i={i} pace={40} />) : null}
            </div>
            <div className="pc-pt-verdict" role="group" aria-label="Your verdict">
              <small>{verdict ? 'Your verdict' : 'Not yet reviewed'}</small>
              {(['true', 'partly', 'wrong'] as const).map((v) => (
                <button key={v} type="button" tabIndex={open ? 0 : -1} className={`pc-btn pc-btn--ghost ${verdict === v ? 'is-active' : ''}`} onClick={() => onVerdict(verdict === v ? null : v)}>
                  {verdict === v ? <Check size={14} /> : null}{VERDICT_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function PortraitPage({ data, now, banner, onVerdict, onAnswer, onAsk, onDeleteSource }: { data: PortraitData; now: Date; banner?: React.ReactNode } & PortraitHandlers) {
  const reduced = usePrefersReducedMotion();
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() => Object.fromEntries(data.readings.map((r) => [r.id, r.verdict])));
  const [open, setOpen] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(data.question?.yourAnswer ?? null);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState<{ a: string; cites: string[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [lit, setLit] = useState<string[]>([]);
  const [scene, setScene] = useState<Scene>(data.question ? 'question' : 'signature');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const { shown, leaving } = useSceneCross(scene, reduced);

  const readings = useMemo(() => data.readings.map((r) => ({ ...r, verdict: verdicts[r.id] ?? null })), [data.readings, verdicts]);
  const byId = useMemo(() => new Map(readings.map((r) => [r.id, r])), [readings]);
  const groups = useMemo(() => groupReadings(readings, now), [readings, now]);
  // A source with nothing read is not a source yet.
  const readSources = data.sources.filter((s) => (parseInt(s.read, 10) || 0) > 0);
  const sourceCount = readSources.length;

  // What today's question was read from: the receipts behind its readings, newest first.
  const questionReceipts = useMemo(() => {
    if (!data.question) return [];
    const from = data.question.fromReadings.map((id) => byId.get(id)).filter(Boolean) as Reading[];
    return [...from.flatMap((r) => r.evidence)].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  }, [data.question, byId]);

  // The signature's bars: how much stands behind each line, against the fullest.
  const signature = useMemo(() => {
    const rows = data.signature.map((s) => {
      const from = readings.filter((r) => s.from.includes(r.id) && deriveState(r, now) !== 'disputed');
      const receipts = from.reduce((n, r) => n + r.evidence.length, 0);
      const sources = [...new Set(from.flatMap((r) => r.evidence.map((e) => SOURCE_LABEL[e.source] ?? e.source)))];
      return { ...s, from, receipts, sources };
    });
    const max = Math.max(1, ...rows.map((r) => r.receipts));
    return rows.map((r) => ({ ...r, share: r.receipts / max }));
  }, [data.signature, readings, now]);

  const question = useTyped(data.question?.question ?? '', 38, !reduced && shown === 'question');
  const twin = useTyped(reply?.a ?? '', 46, !reduced);

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
    setScene('ask');
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
    document.getElementById(`reading-${id}`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  }

  const current = SCENES.find((s) => s.id === scene)!;

  return (
    <main className="presence-cosmos pc-portrait" id="main-content">
      {banner}
      <header className="pc-pt-nav">
        <Mark />
        <nav aria-label="Portrait">
          <a href="#portrait" className={scene !== 'ask' ? 'is-active' : ''} onClick={() => setScene(data.question ? 'question' : 'signature')}>Portrait</a>
          <a href="#readings">Readings</a>
          <a href="#sources">Sources</a>
        </nav>
      </header>

      <section className="pc-pt-stage-wrap" id="portrait" aria-label="Your portrait">
        <div className="pc-demo-stage pc-pt-stage">
          <img src="/images/twinme/cosmos-07-room.jpg" alt="" aria-hidden="true" className={reduced ? '' : 'pc-pt-drift'} />
          <AnimatedHeight className="pc-demo-glass pc-pt-glass" reduced={reduced}>
            <div role="group" aria-label={current.label} className={`pc-pt-glass-inner ${leaving ? 'is-leaving' : 'is-showing'}`}>
              <div className="pc-demo-head">
                <span className="pc-demo-dot" /> TwinMe
                <em>{data.owner}&rsquo;s portrait · read from {sourceCount} source{sourceCount === 1 ? '' : 's'}</em>
              </div>

              {shown === 'question' ? (
                <div className="pc-demo-scene" key="question">
                  {data.question ? (
                    <>
                      <div className="pc-demo-log" aria-label="What it was read from">
                        {questionReceipts.map((e, i) => <ReceiptRow key={`${e.source}-${e.at}-${i}`} e={e} i={i} />)}
                      </div>
                      <div className="pc-demo-reading is-in pc-pt-arrive" style={{ animationDelay: `${questionReceipts.length * 110 + 100}ms` }}>
                        <span>{question.done ? 'New this week' : 'Writing a reading'}{!question.done ? <Wave /> : null}{data.question.source ? ` · ${data.question.source}` : ''}</span>
                        <p>{question.shown}{!question.done ? <i className="pc-demo-caret" /> : null}</p>
                        <div className={`pc-demo-chips pc-pt-answers ${question.done ? 'is-in' : ''}`}>
                          {answer ? (
                            <b><Check size={13} /> {answer === 'skipped' ? 'Skipped for today' : `In your words: ${answer}`}</b>
                          ) : (
                            <>
                              {data.question.answers.map((a) => (
                                <button key={a} type="button" className="is-quiet" onClick={() => answerToday(a)}>{a}</button>
                              ))}
                              <button type="button" className="pc-pt-skip" onClick={() => answerToday('skipped')}>Skip today</button>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="pc-demo-reading is-in">
                      <span>This week</span>
                      <p>Nothing new to ask you yet. Every line below still keeps its receipts.</p>
                    </div>
                  )}
                </div>
              ) : null}

              {shown === 'ask' ? (
                <div className="pc-demo-scene" key="ask">
                  <form className={`pc-demo-ask ${reply || asking ? 'is-sent' : ''}`} onSubmit={(e) => { e.preventDefault(); void ask(query); }}>
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ask your twin." aria-label="Ask your twin" />
                    <button type="submit" aria-label="Ask"><ArrowUp size={16} /></button>
                  </form>
                  {!reply && !asking ? (
                    <div className="pc-demo-chips is-in pc-pt-hints">
                      {(data.ask.length ? data.ask.map((s) => s.q) : DEFAULT_HINTS).map((q) => <button key={q} type="button" onClick={() => { setQuery(q); void ask(q); }}>{q}</button>)}
                    </div>
                  ) : null}
                  {asking ? (
                    <div className="pc-demo-answer is-in pc-pt-arrive"><span>Your twin<Wave /></span><p>&nbsp;</p></div>
                  ) : null}
                  {reply ? (
                    <div className="pc-demo-answer is-in pc-pt-arrive" aria-live="polite">
                      <span>Your twin{!twin.done ? <Wave /> : null}</span>
                      <p>{twin.shown}{!twin.done ? <i className="pc-demo-caret" /> : null}</p>
                      <div className={`pc-demo-chips ${twin.done ? 'is-in' : ''}`}>
                        {reply.cites.length
                          ? reply.cites.map((id) => {
                            const r = byId.get(id);
                            if (!r) return null;
                            return (
                              <button key={id} type="button" onClick={() => jumpTo(id)} aria-label={`Open the reading: ${r.text}`}>
                                <i style={{ background: DOMAIN_HUE[r.domain] }} aria-hidden="true" />{shortLine(r.text)}
                              </button>
                            );
                          })
                          : <b>Nothing it read supports more than this</b>}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {shown === 'signature' ? (
                <div className="pc-demo-scene" key="signature">
                  <div className="pc-demo-sig pc-pt-sig">
                    {signature.map((s, i) => (
                      <div key={s.domain} className="pc-pt-sig-item pc-pt-arrive" style={{ animationDelay: `${i * 120}ms` }}>
                        <div className="pc-demo-sig-row is-in">
                          <span><i style={{ background: DOMAIN_HUE[s.domain] }} />{DOMAIN_LABEL[s.domain]}</span>
                          <div className="pc-demo-bar"><b style={{ width: `${Math.round(s.share * 100)}%`, background: DOMAIN_HUE[s.domain] }} /></div>
                          <small>{s.sources.length > 2 ? `${s.sources.slice(0, 2).join(', ')} +${s.sources.length - 2}` : s.sources.join(', ')}</small>
                        </div>
                        <p className="pc-pt-sig-line">
                          {s.line}
                          {s.from[0] ? <button type="button" className="pc-pt-sig-jump" onClick={() => jumpTo(s.from[0].id)} aria-label={`Open the reading behind ${DOMAIN_LABEL[s.domain]}`}>{s.receipts} receipt{s.receipts === 1 ? '' : 's'}</button> : null}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="pc-demo-chips is-in pc-pt-arrive" style={{ animationDelay: `${signature.length * 120 + 80}ms` }}>
                    <b><Check size={13} /> {signature.reduce((n, s) => n + s.receipts, 0)} receipts behind {signature.length} lines</b>
                    <b>Nothing self-reported</b>
                  </div>
                </div>
              ) : null}
            </div>
          </AnimatedHeight>
        </div>

        <div className="pc-demo-tabs pc-pt-tabs" role="tablist" aria-label="Portrait">
          {SCENES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === scene} className={`pc-demo-tab ${s.id === scene ? 'is-active' : ''}`} onClick={() => setScene(s.id)}>
              <strong>{s.label}</strong>
              <small>{s.caption}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="pc-pt-ledger" id="readings" aria-labelledby="pc-pt-ledger-title">
        <h2 id="pc-pt-ledger-title" className="pc-h2 pc-h2--sm">The readings.</h2>
        {groups.map((g) => (
          <div key={g.state} className="pc-pt-group">
            <p className="pc-spec-n">{STATE_LABEL[g.state]} · {g.readings.length}</p>
            {g.readings.map((r) => (
              <ReadingRow key={r.id} reading={r} now={now} verdict={verdicts[r.id] ?? null}
                onVerdict={(v) => verdict(r.id, v)}
                open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} lit={lit.includes(r.id)} />
            ))}
          </div>
        ))}
      </section>

      <section className="pc-pt-sources" id="sources" aria-labelledby="pc-pt-src-title">
        <h2 id="pc-pt-src-title" className="pc-h2 pc-h2--sm">Sources.</h2>
        <div className="pc-pt-source-list">
          {readSources.map((s) => (
            <div key={s.platform} className="pc-pt-source">
              <strong>{s.label}</strong>
              <span>{s.read} · since {spokenDay(s.since)}</span>
              <small>{s.kinds}</small>
              {onDeleteSource && managing ? (
                confirmDelete === s.platform ? (
                  <em className="pc-pt-source-confirm">
                    Delete everything read from {s.label}?
                    <button type="button" onClick={async () => { await onDeleteSource(s.platform); setConfirmDelete(null); }}>Yes, delete</button>
                    <button type="button" onClick={() => setConfirmDelete(null)}>Keep</button>
                  </em>
                ) : (
                  <em><button type="button" onClick={() => setConfirmDelete(s.platform)}>Delete</button></em>
                )
              ) : null}
            </div>
          ))}
        </div>
        <p className="pc-pt-source-door">
          {banner
            ? <Link to="/">Read your own portrait <span aria-hidden="true">&#8594;</span></Link>
            : <Link to="/sources">Read from one more place <span aria-hidden="true">&#8594;</span></Link>}
          {onDeleteSource ? (
            <button type="button" className="pc-pt-manage" onClick={() => { setManaging((m) => !m); setConfirmDelete(null); }}>
              {managing ? 'Done' : 'Manage'}
            </button>
          ) : null}
        </p>
        <p className="pc-pt-source-note">Nothing here trains a model. Messages, photos and location are never read.</p>
      </section>
    </main>
  );
}

export default PortraitPage;
