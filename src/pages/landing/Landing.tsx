import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_PORTRAIT, DOMAIN_LABEL, SOURCE_LABEL, type Evidence, type Reading } from '../../data/demoPortrait';
import '../../styles/landing.css';

/**
 * TwinMe's landing, started from a white page (2026-09-05).
 * Lock: .claude/plans/2026-09-05-landing-from-scratch/README.md
 *
 * The page reads before it speaks: the entrance cycles the sources it reads, then the
 * page lifts in. One headline, two pills, one paragraph. Then the page's three proofs,
 * each introduced by one line on the left of the column: a reading arriving from its
 * receipts inside a panel; the five signature lines as the display type of the page,
 * with their receipts in the margin; a question answered as you. The sources by name,
 * the privacy statement in words, one action at the end. Everything shown is the public
 * export, so every receipt and every line is real.
 */

const START = '/auth';
const DEMO = '/demo';

/** What the entrance says it is doing. Under two seconds, once per session. */
const READS = ['Reading Spotify.', 'Reading your calendar.', 'Reading GitHub.', 'Reading Whoop.', 'Reading Gmail.', 'Reading you.'];

/** The nine places it can read from. Source of truth: VALID_PROVIDERS in api/routes/oauth-callback.js. */
const SOURCES = ['Spotify', 'Google Calendar', 'YouTube', 'Gmail', 'Discord', 'GitHub', 'Whoop', 'Instagram', 'Outlook'];

const PRE_MS = { first: 420, word: 300, last: 560 };

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

/** True once the element has entered the viewport. It never goes back. */
function useInView<T extends HTMLElement>(margin = '-10% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); } }, { rootMargin: margin, threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return { ref, inView };
}

/** "3 Sep" from an ISO day, the same in every locale. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function day(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1] ?? ''}` : iso.slice(0, 10);
}

/** "GitHub, Gmail and Spotify": names in prose, never a "+1". */
function names(list: string[]) {
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

function sourceName(key: string) { return SOURCE_LABEL[key] ?? key; }

/** Up to three receipts, one per day first, in the order they happened. */
function spread(evidence: Evidence[], n = 3) {
  const byDay = new Map<string, Evidence>();
  for (const e of evidence) if (!byDay.has(e.at.slice(0, 10))) byDay.set(e.at.slice(0, 10), e);
  const picked = [...byDay.values()];
  for (const e of evidence) { if (picked.length >= n) break; if (!picked.includes(e)) picked.push(e); }
  return picked.slice(0, n).sort((a, b) => a.at.localeCompare(b.at));
}

function Mark() {
  return (
    <svg className="ld-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.6" /><circle cx="14" cy="5" r="2.6" /><circle cx="23" cy="5" r="2.6" /><circle cx="23" cy="14" r="2.6" />
      <circle cx="23" cy="23" r="2.6" /><circle cx="14" cy="23" r="2.6" /><circle cx="5" cy="23" r="2.6" /><circle cx="5" cy="14" r="2.6" />
    </svg>
  );
}

/** The entrance. Skipped under reduced motion and after the first visit in a session. */
function usePreloader(reduced: boolean) {
  // Decided once: the entrance marks the session as seen when it finishes, and that must
  // not turn the sheet's own animation off mid-flight.
  const [skip] = useState(() => { try { return reduced || sessionStorage.getItem('ld-seen') === '1'; } catch { return reduced; } });
  const [i, setI] = useState(0);
  const [done, setDone] = useState(skip);
  useEffect(() => {
    if (done) return;
    if (i < READS.length - 1) {
      const t = window.setTimeout(() => setI(i + 1), i === 0 ? PRE_MS.first : PRE_MS.word);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => { setDone(true); try { sessionStorage.setItem('ld-seen', '1'); } catch { /* private mode */ } }, PRE_MS.last);
    return () => window.clearTimeout(t);
  }, [i, done]);
  return { word: READS[i], done, animateSheet: done && !skip };
}

function Rise({ as: Tag = 'div', className = '', children, delay = 0 }: { as?: 'div' | 'p' | 'section' | 'h2'; className?: string; children: React.ReactNode; delay?: number }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return <Tag ref={ref as React.RefObject<HTMLDivElement>} className={`ld-rise ${inView ? 'is-in' : ''} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</Tag>;
}

/* ---------- Proof 1: a reading arriving from its receipts ---------- */

/** Readings whose receipts span more than one day, so the card reads across days. */
const READINGS: Reading[] = (() => {
  const multi = DEMO_PORTRAIT.readings.filter((r) => new Set(r.evidence.map((e) => e.at.slice(0, 10))).size >= 2 && r.evidence.length >= 3);
  return (multi.length ? multi : DEMO_PORTRAIT.readings.filter((r) => r.evidence.length >= 3)).slice(0, 3);
})();

type Phase = 'receipts' | 'line' | 'hold' | 'out';

function ReadingPanel({ reduced }: { reduced: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px');
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('receipts');
  const [shown, setShown] = useState(reduced ? 3 : 0);
  const reading = READINGS[idx];
  const receipts = spread(reading.evidence);

  // The timeline: receipts arrive one by one, the line arrives whole, holds, leaves; next.
  useEffect(() => {
    if (reduced || !inView) return;
    let t = 0;
    if (phase === 'receipts') {
      if (shown < receipts.length) t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 200 : 260);
      else t = window.setTimeout(() => setPhase('line'), 380);
    } else if (phase === 'line') {
      t = window.setTimeout(() => setPhase('hold'), 600);
    } else if (phase === 'hold') {
      t = window.setTimeout(() => setPhase('out'), 3600);
    } else {
      t = window.setTimeout(() => { setIdx((k) => (k + 1) % READINGS.length); setShown(0); setPhase('receipts'); }, 400);
    }
    return () => window.clearTimeout(t);
  }, [phase, shown, reduced, inView, receipts.length]);

  const out = phase === 'out';
  const lineIn = reduced || phase === 'line' || phase === 'hold';
  const sources = [...new Set(reading.evidence.map((e) => sourceName(e.source)))];
  return (
    <section className="ld-panel" ref={ref} aria-label="A reading arriving from its receipts">
      <img src="/images/twinme/cosmos-07-room.jpg" alt="" aria-hidden="true" />
      <div className="ld-frost" aria-live="off">
        <span className="ld-kicker">Reading · {names(sources)}</span>
        <div className={`ld-receipts ${out ? 'is-out' : ''}`}>
          {receipts.map((e, i) => (
            <div key={`${idx}-${i}`} className={`ld-receipt ${i < shown || reduced ? 'is-in' : ''}`}>
              <b>{day(e.at)}</b><span>{e.event}</span>
            </div>
          ))}
        </div>
        <p className={`ld-reading ${lineIn ? 'is-in' : ''} ${out ? 'is-out' : ''}`}>{reading.text}</p>
        <div className="ld-foot">
          <span className="ld-mono">{reading.evidence.length} receipts{reading.evidence.length > receipts.length ? `, ${receipts.length} shown` : ''}</span>
          <Link to={DEMO}>Open this portrait</Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Proof 2: the signature, five lines as the page's display type ---------- */

function SignatureLines() {
  const byId = new Map(DEMO_PORTRAIT.readings.map((r) => [r.id, r]));
  const rows = DEMO_PORTRAIT.signature.map((s) => {
    const from = s.from.map((id) => byId.get(id)).filter(Boolean) as Reading[];
    const receipts = from.reduce((n, r) => n + r.evidence.length, 0);
    const sources = [...new Set(from.flatMap((r) => r.evidence.map((e) => sourceName(e.source))))];
    return { ...s, receipts, sources };
  });
  return (
    <div className="ld-sigs" aria-label={`${DEMO_PORTRAIT.owner}'s signature`}>
      {rows.map((r, i) => <SignatureRow key={r.domain} row={r} i={i} />)}
    </div>
  );
}

function SignatureRow({ row, i }: { row: { domain: Reading['domain']; line: string; receipts: number; sources: string[] }; i: number }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`ld-sig ${inView ? 'is-in' : ''}`} style={{ transitionDelay: `${i * 60}ms` }}>
      <small>{DOMAIN_LABEL[row.domain]}</small>
      <p>{row.line}</p>
      <em>{row.receipts} receipts, from {names(row.sources)}</em>
    </div>
  );
}

/* ---------- Proof 3: a question, answered as you ---------- */

function AskPanel({ reduced }: { reduced: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px');
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');
  const script = DEMO_PORTRAIT.ask[idx];
  useEffect(() => {
    if (reduced || !inView) return;
    let t = 0;
    if (phase === 'in') t = window.setTimeout(() => setPhase('hold'), 700);
    else if (phase === 'hold') t = window.setTimeout(() => setPhase('out'), 4200);
    else t = window.setTimeout(() => { setIdx((k) => (k + 1) % DEMO_PORTRAIT.ask.length); setPhase('in'); }, 400);
    return () => window.clearTimeout(t);
  }, [phase, reduced, inView]);
  const cited = script.cites.map((id) => DEMO_PORTRAIT.readings.find((r) => r.id === id)).filter(Boolean) as Reading[];
  const sources = [...new Set(cited.flatMap((r) => r.evidence.map((e) => sourceName(e.source))))];
  const shownIn = reduced || (inView && phase !== 'in') || (inView && phase === 'in');
  return (
    <section className="ld-panel ld-panel--ask" ref={ref} aria-label="Ask your twin">
      <img src="/images/twinme/cosmos-02-records.jpg" alt="" aria-hidden="true" />
      <div className="ld-frost ld-frost--ask">
        <span className="ld-kicker">Ask</span>
        <p className="ld-ask-q">{script.q}</p>
        <p className={`ld-ask-a ${shownIn ? 'is-in' : ''} ${phase === 'out' ? 'is-out' : ''}`}>{script.a}</p>
        <div className="ld-foot">
          <span className="ld-mono">Cites {script.cites.length} readings, from {names(sources)}</span>
          <Link to={DEMO}>See the readings</Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- The page ---------- */

export default function Landing() {
  const reduced = usePrefersReducedMotion();
  const pre = usePreloader(reduced);
  // The app's body is dark; this page's ground is white, including behind the entrance.
  useEffect(() => {
    const prev = [document.documentElement.style.background, document.body.style.background];
    document.documentElement.style.background = '#ffffff';
    document.body.style.background = '#ffffff';
    return () => { document.documentElement.style.background = prev[0]; document.body.style.background = prev[1]; };
  }, []);
  return (
    <>
      {!reduced ? (
        <div className={`ld-pre ${pre.done ? 'is-done' : ''}`} aria-hidden="true">
          <p key={pre.word}>{pre.word}</p>
        </div>
      ) : null}
      <main className={`ld ld-sheet ${pre.animateSheet ? 'is-entering' : ''}`} id="main-content">
        <header className="ld-nav">
          <Link to="/" className="ld-brand" aria-label="TwinMe"><Mark /></Link>
          <nav className="ld-nav-right" aria-label="Account">
            <Link to={START}>Log in</Link>
            <Link to={START} className="ld-pill ld-pill--ink ld-pill--sm">Read my portrait</Link>
          </nav>
        </header>

        <section className="ld-hero">
          <p className="ld-label">TwinMe</p>
          <h1><span>A portrait of you,</span> <span>read from your days.</span></h1>
          <div className="ld-cta">
            <Link to={START} className="ld-pill ld-pill--ink">Read my portrait</Link>
            <a href="#reading" className="ld-pill ld-pill--line">See one first</a>
          </div>
          <p className="ld-sub">It reads what you actually do, on Spotify, your calendar, GitHub, Whoop and five more, and writes what it notices. Every line comes with what it was read from.</p>
        </section>

        <Rise as="h2" className="ld-intro"><span>It reads what you do, and writes what it notices.</span></Rise>
        <div id="reading"><Rise><ReadingPanel reduced={reduced} /></Rise></div>

        <Rise as="h2" className="ld-intro"><span>Five lines. One for each part of your life, each measured from named sources.</span></Rise>
        <SignatureLines />

        <Rise as="h2" className="ld-intro"><span>Ask it anything. It answers as you, and shows what it read to say so.</span></Rise>
        <Rise><AskPanel reduced={reduced} /></Rise>

        <Rise as="section" className="ld-sources">
          <p className="ld-label">Reads from</p>
          <p className="ld-names">
            {SOURCES.map((s, i) => <React.Fragment key={s}>{i > 0 ? <span aria-hidden="true">·</span> : null}<b>{s}</b></React.Fragment>)}
          </p>
          <p className="ld-privacy">Messages, photos and location are never read. Delete a source, and everything read from it goes with it.</p>
        </Rise>

        <Rise as="section" className="ld-close">
          <h2>See what your days say.</h2>
          <Link to={START} className="ld-pill ld-pill--ink">Read my portrait</Link>
          <small>Takes a minute. Nothing here trains a model.</small>
        </Rise>

        <footer className="ld-footer">
          <span>TwinMe, 2026</span>
          <nav aria-label="Legal">
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </nav>
        </footer>
      </main>
    </>
  );
}
