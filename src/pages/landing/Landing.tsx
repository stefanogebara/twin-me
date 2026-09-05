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
  cultural: ['A new artist becomes a whole\u00a0morning.', 'On\u00a0YouTube it splits:', 'football for\u00a0joy,', 'sociology for the\u00a0toolkit.'],
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

/** A short last word never sits alone on a line, and a hyphenated word never breaks at its hyphen. */
function tidy(text: string) {
  return text.replace(/(\w)-(\w)/g, '$1\u2011$2').replace(/(\d) (?=[a-z])/g, '$1\u00a0').replace(/ (\S{1,4})$/, '\u00a0$1');
}

/** Two receipts about the same thing count as the same receipt, however the engine phrased the second. */
function receiptKey(e: Evidence) { return e.event.toLowerCase().replace(/[,;].*$/, '').replace(/\s+(again|twice|once more)$/, '').slice(0, 24); }

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

/** "12 receipts · GitHub, Gmail": the one provenance format on the page. */
function provenance(count: number, sources: string[], shown?: number) { return `${shown !== undefined && shown < count ? `${shown} of ${count}` : count} receipts · ${sources.join(', ')}`; }

/** Every receipt behind a line, plain ones only, in the order they happened. The spine of the page. */
function ReceiptRows({ rows }: { rows: Evidence[] }) {
  return (
    <div className="ld-receipts">
      {rows.map((e, i) => (
        <div key={i} className="ld-receipt"><b>{i > 0 && rows[i - 1].at.slice(0, 10) === e.at.slice(0, 10) ? '' : day(e.at)}</b><span>{tidy(e.event)}</span></div>
      ))}
    </div>
  );
}

/** A per-day row, not a season's total: totals that open with a big number stay out of the spine. */
function perDay(e: Evidence) { return !/^\d{3,}\b/.test(e.event); }

function allReceipts(evidence: Evidence[]) {
  const seen = new Set<string>();
  return evidence.filter(plain).filter(perDay).filter((e) => { const k = receiptKey(e) + e.at.slice(0, 10); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.at.localeCompare(b.at));
}

function Receipts({ evidence, sources, label }: { evidence: Evidence[]; sources: string[]; label?: string }) {
  const rows = allReceipts(evidence);
  return (
    <div aria-label={label ?? 'Read from'}>
      <ReceiptRows rows={rows} />
      <span className="ld-meta ld-mono">{provenance(rows.length, sources)}</span>
    </div>
  );
}

function LedgerRow({ domain, i, above = false }: { domain: Domain; i: number; above?: boolean }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const b = behind(domain);
  return (
    <div ref={ref} className={`ld-entry ld-row ${inView ? 'is-in' : ''}`} style={{ transitionDelay: `${i * 60}ms` }}>
      <div>
        <span className="ld-label">{DOMAIN_LABEL[domain]}</span>
        {above ? <p className="ld-lead ld-above">{LINES[domain].join(' ')}</p> : <p className="ld-v2">{LINES[domain].join(' ')}</p>}
      </div>
      <Receipts evidence={b.evidence} sources={b.sources} />
    </div>
  );
}

/* ---------- The one photograph: a reading arriving from its receipts, once ---------- */

/* ---------- The page ---------- */

export default function Landing() {
  const reduced = usePrefersReducedMotion();
  const pre = usePreloader(reduced);
  // Where the browser cannot drive an animation from the scroll, the later hour follows it by hand.
  const later = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()')) return;
    const el = later.current; if (!el) return;
    let raf = 0;
    const tick = () => { raf = 0; const max = document.documentElement.scrollHeight - window.innerHeight; const p = max > 0 ? window.scrollY / max : 0; el.style.opacity = String(Math.min(1, Math.max(0, (p - 0.25) / 0.6))); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  // The ground behind the entrance matches the room, so the sheet lifts in from the same dark.
  useEffect(() => {
    const prev = [document.documentElement.style.background, document.body.style.background];
    document.documentElement.style.background = '#0b0d12';
    document.body.style.background = '#0b0d12';
    return () => { document.documentElement.style.background = prev[0]; document.body.style.background = prev[1]; };
  }, []);

  const first = behind('motivation');
  const ask = DEMO_PORTRAIT.ask[1] ?? DEMO_PORTRAIT.ask[0];
  const askCited = ask.cites.map((id) => DEMO_PORTRAIT.readings.find((r) => r.id === id)).filter(Boolean) as Reading[];
  const rest = DEMO_PORTRAIT.signature.map((s) => s.domain).filter((d) => d !== 'motivation');
  const readSources = DEMO_PORTRAIT.sources.filter((x) => (parseInt(x.read, 10) || 0) > 0).length;
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const earliest = DEMO_PORTRAIT.sources.map((x) => x.since).filter(Boolean).sort()[0] ?? '';
  const sinceMonth = MONTH_NAMES[parseInt(earliest.slice(5, 7), 10) - 1] ?? 'this year';
  const sourcesSentence = names(SOURCES).replace(/ and (\S+)$/, ' and\u00a0$1');

  return (
    <>
      {!reduced ? (
        <div className={`ld-pre ${pre.done ? 'is-done' : ''}`} aria-hidden="true">
          <p key={pre.word}>{pre.word}</p>
        </div>
      ) : null}
      <main className={`ld ld-sheet ${pre.animateSheet ? 'is-entering' : ''}`} id="main-content">
        {/* The one photograph, behind everything. */}
        <div className="ld-ground" aria-hidden="true">
          <img src="/images/twinme/cosmos-08-window.jpg" alt="" />
          <img ref={later} className="is-later" src="/images/twinme/cosmos-09-window-night.jpg" alt="" />
        </div>

        <header className="ld-nav">
          <div className="ld-col">
            <Link to="/" className="ld-brand" aria-label="TwinMe home">TwinMe</Link>
            <nav className="ld-nav-right" aria-label="Account">
              <Link to={START}>Log in</Link>
            </nav>
          </div>
        </header>

        {/* The first line of the portrait, set in the room. */}
        <section className="ld-stage" aria-label={`${DEMO_PORTRAIT.owner}'s portrait, first line`}>
          <div className="ld-col">
            <p className="ld-label">{DEMO_PORTRAIT.owner}&rsquo;s portrait · {DOMAIN_LABEL.motivation}</p>
            <h1 className="ld-v1"><Line domain="motivation" /></h1>
            <div className="ld-row">
              <div>
                <p className="ld-lead ld-dek">A portrait of you, read from your days. This one is {DEMO_PORTRAIT.owner}&rsquo;s, from {readSources} sources since {sinceMonth}. Every line shows its evidence, below.</p>
                <p className="ld-cta"><Link to={DEMO} className="ld-link">Read {DEMO_PORTRAIT.owner}&rsquo;s portrait</Link></p>
              </div>
              <p className="ld-since ld-mono">{DEMO_PORTRAIT.owner}&rsquo;s portrait, {sinceMonth} to September</p>
            </div>
          </div>
        </section>

        {/* The document, lifted onto one frosted panel over the room. */}
        <div className="ld-paper">
          <section aria-label="The portrait, with its evidence">
            <LedgerRow domain="motivation" i={0} above />
            {rest.map((d, i) => <LedgerRow key={d} domain={d} i={i + 1} />)}
          </section>

          <Rise as="section" className="ld-entry ld-ask ld-row">
            <div>
              <p className="ld-label">Asked</p>
              <p className="ld-q">{ask.q}</p>
              <p className="ld-voice ld-v2"><q>{tidy(ask.a)}</q></p>
            </div>
            <div className="ld-cites" aria-label="What it cites">
              {askCited.map((r) => (
                <div key={r.id} className="ld-cite">
                  {tidy(r.text)}
                  <span className="ld-mono">{DOMAIN_LABEL[r.domain]} · {[...new Set(r.evidence.map((e) => sourceName(e.source)))].join(', ')}</span>
                </div>
              ))}
            </div>
          </Rise>

          <Rise as="section" className="ld-entry ld-sources ld-row">
            <div>
              <p className="ld-label">Reads from</p>
              <p className="ld-lead ld-names">{sourcesSentence}.</p>
            </div>
            <div>
              <p className="ld-label">Never read</p>
              <p className="ld-lead ld-privacy">Messages, photos and location. Delete a source, and everything read from it goes with it.</p>
            </div>
          </Rise>
        </div>

        {/* The ending, on the room. */}
        <Rise as="section" className="ld-close ld-col">
          <h2 className="ld-v0">See what your days&nbsp;say.</h2>
          <div className="ld-cta">
            <Link to={START} className="ld-pill">Read my portrait</Link>
            <small>One source is enough to begin.</small>
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
