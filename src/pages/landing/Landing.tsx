import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_PORTRAIT, DOMAIN_LABEL, SOURCE_LABEL, type Reading } from '../../data/demoPortrait';
import '../../styles/landing.css';

/**
 * TwinMe's landing, started from a white page (2026-09-05).
 * Lock: .claude/plans/2026-09-05-landing-from-scratch/README.md
 *
 * The page reads before it speaks: the entrance cycles the sources it reads, then the
 * page lifts in. One headline, two pills. Then three demonstrations, each a rounded
 * panel holding one thing the product does — a reading being written from receipts,
 * the five-line signature, a question answered as you — and after each, two grey lines
 * saying what that proved. Names of the sources, the privacy statement in plain words,
 * and one action at the end. Everything shown is from the public export, so every
 * receipt and every line is real.
 */

const START = '/auth';
const DEMO = '/demo';

/** What the entrance says it is doing. Under two seconds, once per session. */
const READS = ['Reading Spotify.', 'Reading your calendar.', 'Reading GitHub.', 'Reading Whoop.', 'Reading Gmail.', 'Reading you.'];

/** The nine places it can read from. Source of truth: VALID_PROVIDERS in api/routes/oauth-callback.js. */
const SOURCES = ['Spotify', 'Google Calendar', 'YouTube', 'Gmail', 'Discord', 'GitHub', 'Whoop', 'Instagram', 'Outlook'];

const EASE_MS = { word: 300, firstWord: 420, lastWord: 560 };

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

/** Text arriving at a typist's pace. */
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

/** "3 Sep" from an ISO day, the same in every locale. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function day(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1] ?? ''}` : iso.slice(0, 10);
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
      const t = window.setTimeout(() => setI(i + 1), i === 0 ? EASE_MS.firstWord : EASE_MS.word);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => { setDone(true); try { sessionStorage.setItem('ld-seen', '1'); } catch { /* private mode */ } }, EASE_MS.lastWord);
    return () => window.clearTimeout(t);
  }, [i, done]);
  return { word: READS[i], done, animateSheet: done && !skip };
}

function Rise({ as: Tag = 'div', className = '', children, delay = 0 }: { as?: 'div' | 'p' | 'section'; className?: string; children: React.ReactNode; delay?: number }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return <Tag ref={ref as React.RefObject<HTMLDivElement>} className={`ld-rise ${inView ? 'is-in' : ''} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</Tag>;
}

/* ---------- Panel 1: a reading being written from its receipts ---------- */

const READINGS: Reading[] = DEMO_PORTRAIT.readings.filter((r) => r.evidence.length >= 3).slice(0, 3);

function ReadingPanel({ reduced }: { reduced: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px');
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'receipts' | 'type' | 'hold' | 'out'>('receipts');
  const [shownReceipts, setShownReceipts] = useState(reduced ? 3 : 0);
  const reading = READINGS[idx];
  const receipts = reading.evidence.slice(0, 3);
  const typed = useTyped(reading.text, 42, !reduced && inView && phase !== 'receipts');

  // The timeline: receipts arrive, the line is written, it holds, it leaves, next.
  useEffect(() => {
    if (reduced || !inView) return;
    let t = 0;
    if (phase === 'receipts') {
      if (shownReceipts < receipts.length) t = window.setTimeout(() => setShownReceipts((n) => n + 1), shownReceipts === 0 ? 200 : 260);
      else t = window.setTimeout(() => setPhase('type'), 420);
    } else if (phase === 'type' && typed.done) {
      t = window.setTimeout(() => setPhase('hold'), 0);
    } else if (phase === 'hold') {
      t = window.setTimeout(() => setPhase('out'), 3400);
    } else if (phase === 'out') {
      t = window.setTimeout(() => { setIdx((k) => (k + 1) % READINGS.length); setShownReceipts(0); setPhase('receipts'); }, 420);
    }
    return () => window.clearTimeout(t);
  }, [phase, shownReceipts, typed.done, reduced, inView, receipts.length]);

  const out = phase === 'out';
  return (
    <section className="ld-panel" ref={ref} aria-label="A reading being written">
      <img src="/images/twinme/cosmos-01-desk.jpg" alt="" aria-hidden="true" />
      <div className="ld-frost" aria-live="off">
        <span className="ld-kicker"><i />Reading · {SOURCE_LABEL[receipts[0].source] ?? receipts[0].source}</span>
        <div className={`ld-receipts ${out ? 'is-out' : ''}`}>
          {receipts.map((e, i) => (
            <div key={`${idx}-${i}`} className={`ld-receipt ${i < shownReceipts || reduced ? 'is-in' : ''}`}>
              <b>{day(e.at)}</b><span>{e.event}</span>
            </div>
          ))}
        </div>
        <p className={`ld-reading ${out ? 'is-out' : ''}`}>
          {reduced ? reading.text : typed.shown}{!reduced && phase === 'type' && !typed.done ? <i className="ld-caret" /> : null}
        </p>
        <div className="ld-foot">
          <span className="ld-mono">{reading.evidence.length} receipts · {reading.evidence.length === receipts.length ? 'all shown' : `${receipts.length} shown`}</span>
          <Link to={DEMO}>Open this portrait</Link>
        </div>
      </div>
    </section>
  );
}

/* ---------- Panel 2: the signature, five lines with their counts ---------- */

function SignaturePanel() {
  const byId = new Map(DEMO_PORTRAIT.readings.map((r) => [r.id, r]));
  const rows = DEMO_PORTRAIT.signature.map((s) => {
    const from = s.from.map((id) => byId.get(id)).filter(Boolean) as Reading[];
    const receipts = from.reduce((n, r) => n + r.evidence.length, 0);
    const sources = [...new Set(from.flatMap((r) => r.evidence.map((e) => SOURCE_LABEL[e.source] ?? e.source)))];
    return { ...s, receipts, sources };
  });
  return (
    <section className="ld-panel" aria-label="The signature">
      <img src="/images/twinme/cosmos-06-portrait.jpg" alt="" aria-hidden="true" />
      <div className="ld-frost ld-frost--wide">
        <span className="ld-kicker"><i />Signature · {DEMO_PORTRAIT.owner}</span>
        <div className="ld-sig">
          {rows.map((r, i) => (
            <Rise key={r.domain} className="ld-sig-row" delay={i * 90}>
              <small>{DOMAIN_LABEL[r.domain]}</small>
              <p>{r.line}</p>
              <em>{r.receipts} receipts · {r.sources.slice(0, 2).join(', ')}{r.sources.length > 2 ? ` +${r.sources.length - 2}` : ''}</em>
            </Rise>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Panel 3: a question, answered as you ---------- */

function AskPanel({ reduced }: { reduced: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px');
  const [idx, setIdx] = useState(0);
  const script = DEMO_PORTRAIT.ask[idx];
  const typed = useTyped(script.a, 46, !reduced && inView);
  useEffect(() => {
    if (reduced || !inView || !typed.done) return;
    const t = window.setTimeout(() => setIdx((k) => (k + 1) % DEMO_PORTRAIT.ask.length), 4200);
    return () => window.clearTimeout(t);
  }, [typed.done, reduced, inView]);
  const cited = script.cites.map((id) => DEMO_PORTRAIT.readings.find((r) => r.id === id)).filter(Boolean) as Reading[];
  const sources = [...new Set(cited.flatMap((r) => r.evidence.map((e) => SOURCE_LABEL[e.source] ?? e.source)))];
  return (
    <section className="ld-panel" ref={ref} aria-label="Ask your twin">
      <img src="/images/twinme/cosmos-05-kitchen.jpg" alt="" aria-hidden="true" />
      <div className="ld-frost">
        <span className="ld-kicker"><i />Ask</span>
        <p className="ld-ask-q">{script.q}</p>
        <p className="ld-ask-a">{reduced ? script.a : typed.shown}{!reduced && !typed.done ? <i className="ld-caret" /> : null}</p>
        <div className="ld-foot">
          <span className="ld-mono">Cites {script.cites.length} readings · {sources.join(', ')}</span>
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
  return (
    <>
      {!pre.done || !reduced ? (
        <div className={`ld-pre ${pre.done ? 'is-done' : ''}`} aria-hidden="true" hidden={reduced}>
          <p key={pre.word}>{pre.word}</p>
        </div>
      ) : null}
      <main className={`ld ld-sheet ${pre.animateSheet ? 'is-entering' : ''}`} id="main-content">
        <header className="ld-nav">
          <Link to="/" className="ld-brand" aria-label="TwinMe"><Mark />TwinMe</Link>
          <nav className="ld-nav-right" aria-label="Account">
            <Link to={START}>Log in</Link>
            <Link to={START} className="ld-pill ld-pill--ink ld-pill--sm">Read my portrait</Link>
          </nav>
        </header>

        <section className="ld-hero">
          <p className="ld-label">TwinMe</p>
          <h1>A portrait of you, read from your days.</h1>
          <div className="ld-cta">
            <Link to={START} className="ld-pill ld-pill--ink">Read my portrait</Link>
            <Link to={DEMO} className="ld-pill ld-pill--line">See one first</Link>
          </div>
          <p className="ld-sub">It reads what you actually do, on Spotify, your calendar, GitHub, Whoop and five more, and writes what it notices. Every line comes with receipts.</p>
          <a className="ld-watch" href="#reading">
            <svg viewBox="0 0 10 12" fill="currentColor" aria-hidden="true"><path d="M0 0l10 6-10 6z" /></svg>
            Watch it read a week
          </a>
        </section>

        <div id="reading">
          <Rise><ReadingPanel reduced={reduced} /></Rise>
        </div>
        <Rise as="p" className="ld-say">Every line comes with what it was read from. Nothing from a quiz, nothing you typed in.</Rise>

        <Rise><SignaturePanel /></Rise>
        <Rise as="p" className="ld-say">Five lines, one for each part of your life, each one measured from named sources.</Rise>

        <Rise><AskPanel reduced={reduced} /></Rise>
        <Rise as="p" className="ld-say">Ask it anything. It answers as you, and shows what it read to say so.</Rise>

        <Rise as="section" className="ld-sources">
          <p className="ld-label">Reads from</p>
          <p className="ld-names">
            {SOURCES.map((s, i) => <React.Fragment key={s}>{i > 0 ? <span aria-hidden="true">·</span> : null}{s}</React.Fragment>)}
          </p>
        </Rise>
        <Rise as="p" className="ld-say">Messages, photos and location are never read. Delete a source, and everything read from it goes with it.</Rise>

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
