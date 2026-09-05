import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_PORTRAIT, DOMAIN_LABEL, SOURCE_LABEL, type Domain, type Evidence, type Reading } from '../../data/demoPortrait';
import '../../styles/landing.css';

/**
 * TwinMe's landing, started from a white page (2026-09-05).
 * Lock: .claude/plans/2026-09-05-landing-from-scratch/README.md
 *
 * The page is the portrait. It opens on the first signature line at display size with
 * three of its dated receipts beneath it, and the other four lines follow as the ledger,
 * each with its count. Then the one photograph, sharp, with a reading arriving from its
 * receipts on a frosted sheet under the window; a question answered as you, set as type;
 * the sources as a sentence; the privacy statement in words; one action at the end. One
 * axis, left, from the nav to the footer. Everything shown is the public export, so every
 * receipt and every line is real.
 */

const START = '/auth';
const DEMO = '/demo';

/** What the entrance says it is doing. Under two seconds, once per session. */
const READS = ['Reading Spotify.', 'Reading your calendar.', 'Reading GitHub.', 'Reading Whoop.', 'Reading Gmail.', 'Reading you.'];

/** The nine places it can read from. Source of truth: VALID_PROVIDERS in api/routes/oauth-callback.js. */
const SOURCES = ['Spotify', 'Google Calendar', 'YouTube', 'Gmail', 'Discord', 'GitHub', 'Whoop', 'Instagram', 'Outlook'];

const PRE_MS = { first: 420, word: 300, last: 560 };

/**
 * The five lines with their breaks set by hand for the desktop column. On a phone the
 * breaks relax and the glued pairs keep a conjunction or a last word from hanging alone.
 * They mirror DEMO_PORTRAIT.signature word for word; a dev-time check says so.
 */
const LINES: Record<Domain, string[]> = {
  motivation: ['Nothing moves for\u00a0days.', 'Then\u00a0everything ships at\u00a0once.'],
  personality: ['Repetition is how you\u00a0settle.', 'The same songs, the same\u00a0order,', 'until the thing is\u00a0done.'],
  cultural: ['A new artist becomes a whole\u00a0morning.', 'On\u00a0YouTube it splits: football', 'for\u00a0joy, sociology for the\u00a0toolkit.'],
  social: ['You keep the circle\u00a0tight', 'and the evenings\u00a0yours.'],
  lifestyle: ['Your week runs on what you\u00a0slept.', 'The\u00a0rest day your body asks\u00a0for,', 'you almost never\u00a0take.'],
};

if (import.meta.env.DEV) {
  for (const s of DEMO_PORTRAIT.signature) {
    const hand = LINES[s.domain].join(' ').replace(/\u00a0/g, ' ');
    if (hand !== s.line) console.warn(`landing: the hand-set ${s.domain} line differs from the export:\n  ${hand}\n  ${s.line}`);
  }
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

/** A receipt a person would say aloud: no list of names or counts after a colon, no inventory. */
function plain(e: Evidence) {
  return !/:\s.*,/.test(e.event) && (e.event.match(/,/g) ?? []).length <= 2 && !/\b\d+\s*(channels|months|topics)\b/i.test(e.event);
}

/** Up to three receipts: plain ones first, one per day first, in the order they happened. */
function spread(evidence: Evidence[], n = 3) {
  const ranked = [...evidence].sort((a, b) => Number(plain(b)) - Number(plain(a)));
  const byDay = new Map<string, Evidence>();
  for (const e of ranked) if (!byDay.has(e.at.slice(0, 10))) byDay.set(e.at.slice(0, 10), e);
  const picked = [...byDay.values()].slice(0, n);
  for (const e of ranked) { if (picked.length >= n) break; if (!picked.includes(e)) picked.push(e); }
  return picked.sort((a, b) => a.at.localeCompare(b.at));
}

/** What stands behind one signature line: its readings, their receipts, their sources. */
function behind(domain: Domain) {
  const s = DEMO_PORTRAIT.signature.find((x) => x.domain === domain)!;
  const from = s.from.map((id) => DEMO_PORTRAIT.readings.find((r) => r.id === id)).filter(Boolean) as Reading[];
  const evidence = from.flatMap((r) => r.evidence);
  const sources = [...new Set(evidence.map((e) => sourceName(e.source)))];
  return { line: s.line, from, evidence, sources };
}

function Mark() {
  return (
    <svg className="ld-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      {Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return <circle key={k} cx={(14 + 10 * Math.cos(a)).toFixed(2)} cy={(14 + 10 * Math.sin(a)).toFixed(2)} r="2.4" />; })}
    </svg>
  );
}

/** A display line with its breaks set by hand. */
function Line({ domain }: { domain: Domain }) {
  return <>{LINES[domain].map((part, i) => <span key={i} className={i ? 'ld-br' : undefined}>{part}</span>)}</>;
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

function Rise({ as: Tag = 'div', className = '', children, delay = 0 }: { as?: 'div' | 'p' | 'section'; className?: string; children: React.ReactNode; delay?: number }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return <Tag ref={ref as React.RefObject<HTMLDivElement>} className={`ld-rise ${inView ? 'is-in' : ''} ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</Tag>;
}

/* ---------- The ledger: the other four lines ---------- */

function Receipts({ evidence, sources, label }: { evidence: Evidence[]; sources: string[]; label?: string }) {
  const shown = spread(evidence);
  return (
    <div aria-label={label ?? 'Read from'}>
      <div className="ld-receipts">
        {shown.map((e, i) => <div key={i} className="ld-receipt"><b>{day(e.at)}</b><span>{e.event}</span></div>)}
      </div>
      <span className="ld-meta ld-mono">{evidence.length} receipts · {sources.join(', ')}</span>
    </div>
  );
}

function LedgerRow({ domain, i }: { domain: Domain; i: number }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const b = behind(domain);
  return (
    <div ref={ref} className={`ld-sig ld-row ${inView ? 'is-in' : ''}`} style={{ transitionDelay: `${i * 60}ms` }}>
      <div>
        <span className="ld-label">{DOMAIN_LABEL[domain]}</span>
        <p className="ld-d2"><Line domain={domain} /></p>
      </div>
      <Receipts evidence={b.evidence} sources={b.sources} />
    </div>
  );
}

/* ---------- The one photograph: a reading arriving from its receipts, once ---------- */

/**
 * The card's reading: from another part of life than the hero's, with at least three
 * receipts the page has not shown yet, across more than one day where it can.
 */
function cardReading(seen: Set<string>) {
  const fresh = (r: Reading) => r.evidence.filter((e) => !seen.has(e.event));
  const pool = DEMO_PORTRAIT.readings.filter((r) => r.domain !== 'motivation' && fresh(r).length >= 3);
  return pool.find((r) => new Set(fresh(r).map((e) => e.at.slice(0, 10))).size >= 2) ?? pool[0] ?? DEMO_PORTRAIT.readings[0];
}

function ReadingPanel({ reduced, seen }: { reduced: boolean; seen: Set<string> }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px');
  const [shown, setShown] = useState(reduced ? 3 : 0);
  const [lineIn, setLineIn] = useState(reduced);
  const READING = cardReading(seen);
  const receipts = spread(READING.evidence.filter((e) => !seen.has(e.event)));
  useEffect(() => {
    if (reduced || !inView) return;
    let t = 0;
    if (shown < receipts.length) t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 260 : 280);
    else if (!lineIn) t = window.setTimeout(() => setLineIn(true), 420);
    return () => window.clearTimeout(t);
  }, [shown, lineIn, reduced, inView, receipts.length]);
  const sources = [...new Set(READING.evidence.map((e) => sourceName(e.source)))];
  return (
    <div className="ld-panel" ref={ref}>
      <img src="/images/twinme/cosmos-08-window.jpg" alt="A room at blue hour: a lamp lit, the window still light" />
      <div className="ld-frost" aria-label="A reading arriving from its receipts">
        <span className="ld-label">{DOMAIN_LABEL[READING.domain]} · {names(sources)}</span>
        <div className="ld-receipts">
          {receipts.map((e, i) => (
            <div key={i} className={`ld-receipt ${i < shown ? 'is-in' : ''}`}>
              <b>{day(e.at)}</b><span>{e.event}</span>
            </div>
          ))}
        </div>
        <p className={`ld-reading ${lineIn ? 'is-in' : ''}`}>{READING.text}</p>
        <div className="ld-foot">
          <span className="ld-mono">{READING.evidence.length} receipts{READING.evidence.length > receipts.length ? `, ${receipts.length} shown` : ''}</span>
          <Link to={DEMO}>Open this portrait</Link>
        </div>
      </div>
    </div>
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

  const first = behind('motivation');
  const ask = DEMO_PORTRAIT.ask[1] ?? DEMO_PORTRAIT.ask[0];
  const askCited = ask.cites.map((id) => DEMO_PORTRAIT.readings.find((r) => r.id === id)).filter(Boolean) as Reading[];
  const askSources = [...new Set(askCited.flatMap((r) => r.evidence.map((e) => sourceName(e.source))))];
  const rest = DEMO_PORTRAIT.signature.map((s) => s.domain).filter((d) => d !== 'motivation');
  // Every receipt the hero and the ledger show, so the card shows others.
  const seen = new Set<string>(DEMO_PORTRAIT.signature.flatMap((x) => spread(behind(x.domain).evidence).map((e) => e.event)));
  const readSources = DEMO_PORTRAIT.sources.filter((x) => (parseInt(x.read, 10) || 0) > 0).length;
  const sourcesSentence = names(SOURCES).replace(/ and (\S+)$/, ' and\u00a0$1');

  return (
    <>
      {!reduced ? (
        <div className={`ld-pre ${pre.done ? 'is-done' : ''}`} aria-hidden="true">
          <p key={pre.word}>{pre.word}</p>
        </div>
      ) : null}
      <main className={`ld ld-sheet ${pre.animateSheet ? 'is-entering' : ''}`} id="main-content">
        <header className="ld-nav">
          <div className="ld-col">
            <Link to="/" className="ld-brand" aria-label="TwinMe home"><Mark />TwinMe</Link>
            <nav className="ld-nav-right" aria-label="Account">
              <Link to={START}>Log in</Link>
            </nav>
          </div>
        </header>

        <section className="ld-hero ld-col" aria-label={`${DEMO_PORTRAIT.owner}'s portrait, first line`}>
          <p className="ld-label">{DOMAIN_LABEL.motivation}</p>
          <h1 className="ld-d1"><Line domain="motivation" /></h1>
          <div className="ld-row">
            <div>
              <p className="ld-lead ld-dek">A portrait of you, read from your days. This one is {DEMO_PORTRAIT.owner}&rsquo;s, read from {readSources} sources over a summer. Every line comes with what it was read from.</p>
              <p className="ld-cta"><Link to={DEMO} className="ld-link">Open {DEMO_PORTRAIT.owner}&rsquo;s portrait</Link></p>
            </div>
            <Receipts evidence={first.evidence} sources={first.sources} />
          </div>
        </section>

        <section className="ld-ledger ld-col" aria-label="The other four lines">
          {rest.map((d, i) => <LedgerRow key={d} domain={d} i={i} />)}
        </section>

        <section className="ld-sect ld-how ld-col" aria-labelledby="ld-how-title">
          <Rise>
            <p className="ld-label" id="ld-how-title">How it reads</p>
            <p className="ld-lead">It reads what you do, and writes what it notices.</p>
          </Rise>
          <ReadingPanel reduced={reduced} seen={seen} />
        </section>

        <Rise as="section" className="ld-sect ld-ask ld-col">
          <p className="ld-label">Ask</p>
          <p className="ld-lead ld-lead--grey ld-q">{ask.q}</p>
          <p className="ld-voice"><q>{ask.a}</q></p>
          <span className="ld-meta ld-mono">Cites {ask.cites.length} readings · {askSources.join(', ')}</span>
        </Rise>

        <Rise as="section" className="ld-sect ld-sources ld-col">
          <p className="ld-label">Reads from</p>
          <p className="ld-lead ld-names">{sourcesSentence}.</p>
          <p className="ld-lead ld-lead--grey ld-privacy">Messages, photos and location are never read. Delete a source, and everything read from it goes with it.</p>
        </Rise>

        <Rise as="section" className="ld-close ld-col">
          <h2 className="ld-d1">See what your days&nbsp;say.</h2>
          <div className="ld-cta">
            <Link to={START} className="ld-pill">Read my portrait</Link>
            <small>Connect one source to begin.</small>
          </div>
        </Rise>

        <footer className="ld-footer ld-col">
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
