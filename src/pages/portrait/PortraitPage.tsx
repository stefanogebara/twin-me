import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SOURCE_LABEL, type Domain, type Evidence, type PortraitData, type Reading, type Verdict } from '../../data/demoPortrait';
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
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });
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
  const tokens = text.split(/(\s+)/);
  let best = -1;
  let bestLength = 2;
  const last = tokens.map((t) => /\S/.test(t)).lastIndexOf(true);
  tokens.forEach((tok, i) => {
    if (/^\s*$/.test(tok)) return;
    const word = tok.replace(/[^A-Za-z'-]/g, '');
    if (!word || HEADLINE_STOPWORDS.has(word.toLowerCase())) return;
    // The last word closes the sentence; the accent belongs before it.
    if (i === last && bestLength > 2) return;
    if (word.length > bestLength) { best = i; bestLength = word.length; }
  });
  if (best < 0) return <>{text}</>;
  return <>{tokens.map((tok, i) => {
    if (i !== best) return <React.Fragment key={i}>{tok}</React.Fragment>;
    const [, before, word, after] = tok.match(/^([^A-Za-z]*)(.*?)([^A-Za-z]*)$/s) ?? [null, '', tok, ''];
    return <React.Fragment key={i}>{before}<em>{word}</em>{after}</React.Fragment>;
  })}</>;
}

/**
 * Four corners of one apartment at blue hour. The references do not hold a single
 * frame for the length of a page — their ground is a space you travel through — so
 * the stills stack and uncover with the scroll, and the page ends in the room it
 * began in.
 */
const GROUND: [string, string][] = [
  ['/images/twinme/cosmos-07-room.jpg', '24% 46%'],
  ['/images/twinme/cosmos-07-room.jpg', '96% 30%'],
  ['/images/twinme/cosmos-07-room.jpg', '70% 78%'],
  ['/images/twinme/cosmos-07-room.jpg', '4% 62%'],
];

function Ground() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stills = Array.from(el.children) as HTMLElement[];
    const bands = Math.max(1, stills.length - 1);
    let frame = 0;
    const paint = () => {
      frame = 0;
      const span = document.documentElement.scrollHeight - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, window.scrollY / span)) : 0;
      stills.forEach((layer, i) => {
        // The first still is the floor; each later one uncovers over its own band, so
        // there is always one fully opaque image and never a seam between two. Each
        // corner holds for most of its band and then crosses quickly: a slow
        // cross-fade shows two rooms at once, which reads as a double exposure.
        const t = p * bands - (i - 1);
        const w = Math.min(1, Math.max(0, (t - 0.62) / 0.3));
        layer.style.opacity = i === 0 ? '1' : String(w * w * (3 - 2 * w));
      });
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div className="pc-pt-ground" aria-hidden="true" ref={ref}>
      {GROUND.map(([src, pos], i) => (
        <div
          key={i}
          className="pc-pt-ground-still"
          style={{ backgroundImage: `url('${src}')`, backgroundPosition: pos, opacity: i === 0 ? 1 : 0 }}
        />
      ))}
    </div>
  );
}

/** The signed-in eyebrow: whose portrait this is, and the day it was read. */
function Kicker({ owner, now }: { owner: string; now: Date }) {
  return <>{owner}&rsquo;s portrait &middot; read {spoken(now, false)}</>;
}

/** "3 Sep 09:32" or "3 Sep" in one mono line. */
function when(at: string) {
  const [date] = at.split(' ');
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * When a stanza was true: one tick per day across the window, taller where more
 * receipts landed on it. Drawn from the receipts themselves, so it never claims
 * anything the page cannot already show — the hairline charts on the boards,
 * carrying real series rather than decoration.
 */
function Ticks({ evidence, now, days = 30 }: { evidence: Evidence[]; now: Date; days?: number }) {
  const counts = new Array(days).fill(0);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (const e of evidence) {
    const t = Date.parse(`${e.at.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(t)) continue;
    const i = days - 1 - Math.round((end - t) / 86_400_000);
    if (i >= 0 && i < days) counts[i] += 1;
  }
  const max = Math.max(1, ...counts);
  const landed = counts.filter(Boolean).length;
  if (landed < 5) return null;
  return (
    <span className="pc-pt-ticks">
      <svg viewBox={`0 0 ${days * 4} 28`} preserveAspectRatio="none" aria-hidden="true">
        {/* A quiet baseline across the window, so empty days read as empty rather than as noise. */}
        <rect x="0" y="27" width={days * 4 - 3} height="1" opacity="0.16" />
        {counts.map((c, i) =>
          c ? (
            <rect key={i} x={i * 4} y={12} width="3" height={16} opacity="0.92" />
          ) : null,
        )}
      </svg>
      <span className="pc-pt-sr">{landed} of the last {days} days</span>
    </span>
  );
}

/** The proof of one reading, in the margin beside it. */
const RECEIPTS_SHOWN = 3;

function Receipts({ reading }: { reading: Reading }) {
  const shown = reading.evidence.slice(0, RECEIPTS_SHOWN);
  const rest = reading.evidence.length - shown.length;
  return (
    <ol className="pc-pt-evidence" aria-label="Receipts">
      {shown.map((e, i) => (
        <li key={i}>
          <span className="pc-pt-when">{when(e.at)}</span>
          <span className="pc-pt-src">{SOURCE_LABEL[e.source] ?? e.source}</span>
          <span className="pc-pt-event">{e.event}</span>
        </li>
      ))}
      {rest > 0 ? <li className="pc-pt-more"><span /><span /><span className="pc-pt-mono">+{rest} more</span></li> : null}
    </ol>
  );
}

function ReadingRow({ reading, now, verdict, onVerdict, cite, ordinal, opening = false }: {
  reading: Reading; now: Date; verdict: Verdict; onVerdict: (v: Verdict) => void; cite: number | null; ordinal: number;
  /** The reading the page opened with: said once, up there, so the row keeps only its receipts and verdict. */
  opening?: boolean;
}) {
  const state = deriveState({ ...reading, verdict }, now);
  const note = state === 'fading' ? `Fading, last supported ${daysSince(reading.supportedAt, now)} days ago` : state === 'disputed' ? 'Disputed' : null;
  return (
    <li className={`pc-pt-row is-${state} ${verdict ? 'is-answered' : ''}`} id={`reading-${reading.id}`}>
      <p className="pc-pt-mono pc-pt-row-index">
        <span>{String(ordinal).padStart(2, '0')}</span>
        {cite ? <b>Cited [{cite}]</b> : null}
      </p>
      <div>
        <p className={`pc-pt-serif pc-pt-claim ${opening ? 'is-opening' : ''}`}>{opening ? 'The line this portrait opens with.' : reading.text}</p>
        <div className="pc-pt-vote" role="group" aria-label={`True of you? ${reading.text}`}>
          {(['true', 'partly', 'wrong'] as const).map((v) => (
            <button key={v} type="button" className={verdict === v ? 'is-active' : ''} aria-pressed={verdict === v} onClick={() => onVerdict(verdict === v ? null : v)}>
              {v === 'true' ? 'That is me' : v === 'partly' ? 'Partly' : 'Not me'}
            </button>
          ))}
          {note ? <span className="pc-pt-mono pc-pt-note">{note}</span> : null}
        </div>
      </div>
      <Receipts reading={reading} />
    </li>
  );
}

const SECTIONS = ['signature', 'ask', 'sources'] as const;

export function PortraitPage({ data, now, banner, onVerdict, onAnswer, onAsk, onDeleteSource }: { data: PortraitData; now: Date; banner?: React.ReactNode } & PortraitHandlers) {
  const [here, setHere] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>(() => Object.fromEntries(data.readings.map((r) => [r.id, r.verdict])));
  const [answer, setAnswer] = useState<string | null>(data.question?.yourAnswer ?? null);
  const [query, setQuery] = useState('');
  const [reply, setReply] = useState<{ a: string; cites: string[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const readings = useMemo(() => data.readings.map((r) => ({ ...r, verdict: verdicts[r.id] ?? null })), [data.readings, verdicts]);
  const byId = useMemo(() => new Map(readings.map((r) => [r.id, r])), [readings]);
  const sourceCount = data.sources.filter((s) => (parseInt(s.read, 10) || 0) > 0).length;
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
  // Closed on arrival: the five lines are read first, and a stanza opens onto its
  // ledger when you ask it to. Unfolding the heaviest section on first scroll left
  // nothing to discover.
  const [openDomain, setOpenDomain] = useState<Domain | null>(null);

  // The nav follows the page: whichever section owns the upper third is the one you are in.
  useEffect(() => {
    const seen = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.intersectionRatio));
      const [top] = [...seen.entries()].filter(([, r]) => r > 0).sort((a, b) => b[1] - a[1]);
      setHere(top ? top[0] : null);
    }, { rootMargin: '-10% 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] });
    SECTIONS.forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

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

  /** The evidence column of a stanza: what it was read from, and how much. */
  /**
   * The receipt each closed card shows, assigned in page order so no two cards
   * cite the same line. "A day with nothing in it, twice" and "..., 4 times" are
   * the same receipt for this purpose.
   */
  const cardReceipt = useMemo(() => {
    const base = (s: string) => s.replace(/, (?:twice|\d+ times)$/, '');
    const taken = new Set<string>();
    const out = new Map<Domain, Evidence | undefined>();
    for (const b of blocks) {
      const own = (shownReading(b) ?? b.readings[0])?.evidence ?? [];
      const pick = own.find((e) => !taken.has(base(e.event))) ?? own[0];
      if (pick) taken.add(base(pick.event));
      out.set(b.domain, pick);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, promoted, data.question]);

  /** The reading a closed card speaks for: the strongest, unless the hero or the question already says it. */
  function shownReading(b: Block): Reading | undefined {
    const asked = data.question?.fromReadings ?? [];
    if (b === promoted) return b.readings.find((r, i) => i > 0 && !asked.includes(r.id)) ?? b.readings[0];
    return b.readings.find((r) => !asked.includes(r.id)) ?? b.readings[0];
  }

  function stanzaRail(b: Block, open: boolean) {
    if (!b.readings.length) return <span />;
    const live = b.readings.filter((r) => deriveState(r, now) !== 'disputed');
    // Open stanzas carry their own ledger below; the rail keeps only the strip.
    if (open) return <div className="pc-pt-count is-open"><Ticks evidence={live.flatMap((r) => r.evidence)} now={now} /></div>;
    const sources = [...new Set(live.flatMap((r) => r.evidence.map((e) => SOURCE_LABEL[e.source] ?? e.source)))];
    const first = cardReceipt.get(b.domain);
    return (
      <div className="pc-pt-count">
        {first ? (
          <p className="pc-pt-peek">
            <span className="pc-pt-when">{when(first.at)} · {SOURCE_LABEL[first.source] ?? first.source}</span>
            <span className="pc-pt-event">{first.event}</span>
          </p>
        ) : <p className="pc-pt-peek"><span>{sources.join(', ')}</span></p>}
        <Ticks evidence={live.flatMap((r) => r.evidence)} now={now} />
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
        {b.readings.map((r, i) => (
          <ReadingRow key={r.id} reading={r} now={now} verdict={verdicts[r.id] ?? null} onVerdict={(v) => verdict(r.id, v)} cite={cites.includes(r.id) ? cites.indexOf(r.id) + 1 : null} ordinal={i + 1} opening={b === promoted && i === 0} />
        ))}
      </ul>
    );
  }

  // The source names itself; splitting the evidence line on ':' swallowed the timestamp.
  const questionSource = data.question?.source || data.question?.evidenceLine.split(',')[0] || '';
  // The band shows the newest receipt under the readings the question came from.
  const questionReceipt = useMemo(() => {
    if (!data.question) return null;
    const from = data.question.fromReadings.map((id) => byId.get(id)).filter(Boolean) as Reading[];
    const all = from.flatMap((r) => r.evidence);
    return [...all].sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  }, [data.question, byId]);
  // The receipts behind today's question, after the one already quoted under it.
  const questionDay = useMemo(() => {
    if (!data.question) return [];
    const from = data.question.fromReadings.map((id) => byId.get(id)).filter(Boolean) as Reading[];
    return [...from.flatMap((r) => r.evidence)]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(1, 5);
  }, [data.question, byId]);
  const questionEvidence = data.question ? data.question.evidenceLine.split(':').slice(1).join(':').trim() : '';
  const mostRead = Math.max(1, ...data.sources.map((s) => parseInt(s.read, 10) || 0));
  const firstSince = data.sources.length ? [...data.sources].map((s) => s.since).sort()[0] : null;
  const since = firstSince ? spokenDay(firstSince, true) : null;
  const daysReading = firstSince ? Math.max(1, daysSince(firstSince, now)) : 0;

  return (
    <main className="presence-cosmos pc-portrait" id="main-content">
      <Ground />
      <section className="pc-pt-hero" aria-labelledby="pc-pt-headline">
        <header className="pc-pt-masthead">
          <Link to="/" className="pc-pt-wordmark">TwinMe</Link>
          <div className="pc-pt-bar pc-pt-glass">
          <nav aria-label="Sections">
            {SECTIONS.map((id) => (
              <a key={id} href={`#${id}`} className={here === id ? 'is-here' : ''} aria-current={here === id ? 'true' : undefined}>
                {id === 'signature' ? 'Signature' : id === 'ask' ? 'Ask' : 'Sources'}
              </a>
            ))}
          </nav>
          {banner ? <Link to="/" className="pc-pt-nav-link">Read your own</Link> : null}
          </div>
        </header>
        <div className="pc-pt-hero-body">
          <p className="pc-pt-kicker">{banner ?? <Kicker owner={data.owner} now={now} />}</p>
          <h1 id="pc-pt-headline" className="pc-pt-serif">{lead ? <Headline text={lead} /> : `${data.owner}.`}</h1>

        </div>
      {data.question ? (
        <section className="pc-pt-today pc-pt-glass" aria-labelledby="pc-pt-q-title">
          <div className="pc-pt-today-inner">
            <div className="pc-pt-q-main">
              <p className="pc-pt-q-mark">New this week, from {questionSource}</p>
              <h2 id="pc-pt-q-title" className="pc-pt-serif">{data.question.question}</h2>
            </div>
            {questionReceipt ? (
              <ul className="pc-pt-q-day" aria-label="What it was read from">
                {[questionReceipt, ...questionDay].slice(0, 3).map((e) => (
                  <li key={`${e.source}-${e.at}-${e.event}`}>
                    <span className="pc-pt-mono">{when(e.at)} · {SOURCE_LABEL[e.source] ?? e.source}</span>
                    <span>{e.event}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="pc-pt-q-answer">
              {answer ? (
                <p className="pc-pt-serif pc-pt-answered">{answer === 'skipped' ? 'Skipped for today.' : <em>{answer}.</em>}</p>
              ) : (
                <>
                  <div className="pc-pt-choices">
                    {data.question.answers.map((a, i) => (
                      <button key={a} type="button" className="is-quiet" onClick={() => answerToday(a)}>{a}</button>
                    ))}
                  </div>
                  <button type="button" className="pc-pt-skip" onClick={() => answerToday('skipped')}>Skip today</button>
                </>
              )}
            </div>
          </div>
        </section>
      ) : null}

      </section>

      <div className="pc-pt-paper">
      <section className="pc-pt-signature" id="signature" aria-label="Signature">
        <ol className="pc-pt-lines pc-pt-glass">
          {blocks.map((b, i) => (
            <li
              key={b.domain}
              className={`pc-pt-line ${i === 0 ? 'is-first' : ''} ${openDomain === b.domain ? 'is-open' : ''}`}
            >
              <button
                type="button"
                className="pc-pt-line-head"
                aria-expanded={openDomain === b.domain}
                disabled={!b.readings.length}
                onClick={() => setOpenDomain(openDomain === b.domain ? null : b.domain)}
              >
                <span className="pc-pt-label">{STANZA[b.domain]}</span>
                <span className="pc-pt-open-mark" aria-hidden="true">{openDomain === b.domain ? 'Close' : 'Read'}</span>
                {b === promoted && openDomain === b.domain
                  ? null
                  : <span className="pc-pt-serif pc-pt-sentence">{(b === promoted ? shownReading(b)?.text : b.line) ?? b.readings[0]?.text}</span>}
                {stanzaRail(b, openDomain === b.domain)}
              </button>
              {ledger(b)}
            </li>
          ))}
        </ol>
      </section>

      <section className="pc-pt-ask" id="ask" aria-label="Ask">
        <div className="pc-pt-ask-body">
          <p className="pc-pt-ask-lead">Ask it anything. It answers from what it read, or not at all.</p>
          <form className="pc-pt-prompt pc-pt-glass" onSubmit={(e) => { e.preventDefault(); void ask(query); }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What do you want to know?" aria-label="Ask something about yourself" />
            <button type="submit" className="pc-pt-send" aria-label="Ask">&#8594;</button>
          </form>
          {data.ask.length ? (
            <ul className="pc-pt-asks" aria-label="Questions it can answer">
              {data.ask.slice(0, 3).map((s) => (
                <li key={s.q}>
                  <button type="button" onClick={() => { setQuery(s.q); void ask(s.q); }}>{s.q}</button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            {reply ? (
              <blockquote className="pc-pt-reply pc-pt-glass" aria-live="polite">
                <p>{reply.a}</p>
                <footer className="pc-pt-cites">
                  {reply.cites.length
                    ? <>It read {reply.cites.map((id, i) => <a key={id} href={`#reading-${id}`} onClick={(e) => { e.preventDefault(); showReading(id); }}>[{i + 1}]</a>)} to answer that.</>
                    : 'Nothing it read supports more than this.'}
                </footer>
              </blockquote>
            ) : null}
          </div>
        </div>
      </section>

      <section className="pc-pt-sources" id="sources" aria-label="Sources">
        <ul className="pc-pt-sourcelist pc-pt-glass">
          {[...data.sources].filter((s) => (parseInt(s.read, 10) || 0) > 0).sort((a, b) => (parseInt(b.read, 10) || 0) - (parseInt(a.read, 10) || 0)).map((s) => (
            <li key={s.platform}>
              <p
                className="pc-pt-source-line"
                style={{ '--pt-share': (parseInt(s.read, 10) || 0) / mostRead } as React.CSSProperties}
              >
                <span className="pc-pt-source-name">{s.label}</span>
                <span className="pc-pt-source-kind">{s.kinds}</span>
                <span className="pc-pt-mono pc-pt-source-count">{parseInt(s.read, 10) || 0}</span>
                {onDeleteSource && managing && confirmDelete !== s.platform && (parseInt(s.read, 10) || 0) > 0 ? (
                  <button type="button" className="pc-pt-textbtn" onClick={() => setConfirmDelete(s.platform)}>Delete</button>
                ) : null}
              </p>
              {onDeleteSource && confirmDelete === s.platform ? (
                <p className="pc-pt-confirm" role="group" aria-label={`Delete everything from ${s.label}`}>
                  <span>Delete everything read from {s.label}? Readings that leaned on it will fade.</span>
                  <button type="button" className="pc-pt-textbtn is-strong" disabled={deleting === s.platform}
                    onClick={async () => { setDeleting(s.platform); try { await onDeleteSource(s.platform); } finally { setDeleting(null); setConfirmDelete(null); } }}>
                    {deleting === s.platform ? 'Deleting' : 'Yes, delete'}
                  </button>
                  <button type="button" className="pc-pt-textbtn" onClick={() => setConfirmDelete(null)}>Keep</button>
                </p>
              ) : null}
            </li>
          ))}
          <li className="pc-pt-source-door">
            {banner
              ? <Link className="pc-pt-door" to="/">Read your own portrait <span aria-hidden="true">&#8594;</span></Link>
              : <Link className="pc-pt-door" to="/sources">Read from one more place <span aria-hidden="true">&#8594;</span></Link>}
          </li>
          <li className="pc-pt-source-note">
            <p className="pc-pt-mono pc-pt-sourcefoot">
              {data.sources.reduce((n, s) => n + (parseInt(s.read, 10) || 0), 0)} things read across {sourceCount} sources<span className="pc-pt-since"> · since {since}, {daysReading} days ago</span>
            </p>
            {onDeleteSource ? (
              <span className="pc-pt-source-actions">
                <button type="button" className="pc-pt-textbtn pc-pt-manage" onClick={() => { setManaging((m) => !m); setConfirmDelete(null); }}>
                  {managing ? 'Done' : 'Manage'}
                </button>
                {managing ? <Link className="pc-pt-textbtn" to="/sources">Delete everything</Link> : null}
              </span>
            ) : null}
          </li>
        </ul>
      </section>


      <footer className="pc-pt-foot">
        <span className="pc-pt-wordmark">TwinMe</span>
        <span className="pc-pt-foot-line">Nothing here trains a model. Messages, photos, location and anything typed here are never read.</span>
      </footer>
      </div>
    </main>
  );
}

export default PortraitPage;
