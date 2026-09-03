import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Check } from 'lucide-react';
import '../../styles/presence-cosmos.css';

/**
 * Live demos of the platform, in the Cosmos language — PROTOTYPE (2026-09-03).
 *
 * Pattern: Littlebird's hero embed (a scripted HTML replica of the real interface, three
 * auto-cycling scenes with a progress fill, clickable, paused when hidden, static end
 * state under reduced motion) crossed with Delphi's visible sources. No video, no device
 * bezel: a liquid-glass panel on a photograph, the same glass recipe as the Presence
 * transcript, showing what the product actually does in the order it does it:
 * a source arrives, a reading forms, the twin uses it.
 *
 * Everything below is scripted with the landing's own sample readings and says so on the
 * panel. Route: /cosmos/demos (dev only). The section export is what would land on /.
 */

type Scene = { id: string; label: string; caption: string; duration: number };

const SCENES: Scene[] = [
  { id: 'reading', label: 'A reading forms', caption: 'Observations arrive with a timestamp. A reading is written only when they repeat.', duration: 9000 },
  { id: 'twin', label: 'Ask your twin', caption: 'It answers as you, in your words, and shows what it read to say so.', duration: 9500 },
  { id: 'signature', label: 'Your signature', caption: 'Five signatures, each measured from named sources. Nothing from a quiz.', duration: 8000 },
];

const OBSERVATIONS = [
  { at: 400, src: 'Spotify', when: 'Thu 23:41', text: 'Nightcall, repeat x4' },
  { at: 1500, src: 'Spotify', when: 'Thu 23:58', text: 'Nightcall, repeat x5' },
  { at: 2600, src: 'Calendar', when: 'Fri 09:00', text: 'Deadline: portfolio review' },
  { at: 3700, src: 'Spotify', when: 'Sun 22:12', text: 'Nightcall, repeat x3' },
];
const READING = 'You loop the same three songs when a deadline is close. Focus, for you, sounds like ritual.';
const READING_AT = 5000;

const QUESTION = 'What do I do the night before a deadline?';
const ANSWER = 'I put the same three songs on repeat and stop answering messages. It is not avoidance, it is how I get quiet enough to finish. Last Thursday it was Nightcall, five times.';
const ANSWER_AT = 3400;

const SIGNATURES = [
  { name: 'Motivation', hue: '#dd8f4c', value: 0.82, sources: 'GitHub, Calendar' },
  { name: 'Personality', hue: '#847dff', value: 0.64, sources: 'Gmail, Spotify' },
  { name: 'Cultural', hue: '#55a08e', value: 0.91, sources: 'Spotify, YouTube' },
  { name: 'Social', hue: '#dd90d8', value: 0.47, sources: 'Gmail, Discord' },
  { name: 'Lifestyle', hue: '#90b8f0', value: 0.73, sources: 'Whoop, Calendar' },
];

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

/** Clock for one scene: returns ms elapsed since the scene started, frozen when paused. */
function useSceneClock(key: string | number, running: boolean, staticState: boolean) {
  // The key travels with the reading so a stale value from the previous scene can never
  // be read against the new scene's duration (that double-advanced and skipped scenes).
  const [clock, setClock] = useState<{ key: string | number; t: number }>({ key, t: 0 });
  useEffect(() => {
    if (staticState) { setClock({ key, t: Number.MAX_SAFE_INTEGER }); return; }
    setClock({ key, t: 0 });
    if (!running) return;
    const start = performance.now();
    let raf = 0;
    const tick = () => { setClock({ key, t: performance.now() - start }); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, running, staticState]);
  return clock.key === key ? clock.t : 0;
}

function typed(text: string, t: number, startAt: number, cps = 42) {
  if (t < startAt) return '';
  const n = Math.min(text.length, Math.floor(((t - startAt) / 1000) * cps));
  return text.slice(0, n);
}

function Wave() {
  return <span className="pc-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

function SceneReading({ t }: { t: number }) {
  const reading = typed(READING, t, READING_AT, 38);
  const done = reading.length === READING.length;
  return (
    <div className="pc-demo-scene">
      <div className="pc-demo-log" aria-label="Observations">
        {OBSERVATIONS.map((o) => (
          <div key={o.at} className={`pc-demo-row ${t >= o.at ? 'is-in' : ''}`}>
            <span>{o.src} · {o.when}</span>
            <p>{o.text}</p>
          </div>
        ))}
      </div>
      <div className={`pc-demo-reading ${t >= READING_AT ? 'is-in' : ''}`}>
        <span>{done ? 'Saved reading' : 'Writing a reading'}{!done && t >= READING_AT ? <Wave /> : null}</span>
        <p>{reading}{!done && t >= READING_AT ? <i className="pc-demo-caret" /> : null}</p>
        <div className={`pc-demo-chips ${done ? 'is-in' : ''}`}>
          <b>Spotify · 3 nights</b>
          <b>Calendar · 1 deadline</b>
        </div>
      </div>
    </div>
  );
}

function SceneTwin({ t }: { t: number }) {
  const q = typed(QUESTION, t, 500, 30);
  const asked = q.length === QUESTION.length && t >= 2400;
  const a = typed(ANSWER, t, ANSWER_AT, 46);
  const done = a.length === ANSWER.length;
  return (
    <div className="pc-demo-scene">
      <div className={`pc-demo-ask ${asked ? 'is-sent' : ''}`}>
        <p>{q}{!asked && q.length < QUESTION.length ? <i className="pc-demo-caret" /> : null}</p>
        <button type="button" aria-hidden="true" tabIndex={-1}><ArrowUp size={16} /></button>
      </div>
      <div className={`pc-demo-answer ${t >= ANSWER_AT - 600 ? 'is-in' : ''}`}>
        <span>Your twin{!done && t >= ANSWER_AT - 600 ? <Wave /> : null}</span>
        <p>{a}{!done && t >= ANSWER_AT ? <i className="pc-demo-caret" /> : null}</p>
        <div className={`pc-demo-chips ${done ? 'is-in' : ''}`}>
          <b>Spotify · Thu 23:41</b>
          <b>Calendar · Fri 09:00</b>
          <b>Gmail · reply latency</b>
        </div>
      </div>
    </div>
  );
}

function SceneSignature({ t }: { t: number }) {
  return (
    <div className="pc-demo-scene">
      <div className="pc-demo-sig">
        {SIGNATURES.map((s, i) => {
          const at = 400 + i * 700;
          const on = t >= at;
          return (
            <div key={s.name} className={`pc-demo-sig-row ${on ? 'is-in' : ''}`}>
              <span><i style={{ background: s.hue }} />{s.name}</span>
              <div className="pc-demo-bar"><b style={{ width: on ? `${s.value * 100}%` : '0%', background: s.hue }} /></div>
              <small>{s.sources}</small>
            </div>
          );
        })}
      </div>
      <div className={`pc-demo-chips ${t >= 4200 ? 'is-in' : ''}`}>
        <b><Check size={13} /> Read from 6 sources</b>
        <b>Nothing self-reported</b>
      </div>
    </div>
  );
}

export function CosmosDemosSection() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [manual, setManual] = useState(false);
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const stageRef = useRef<HTMLDivElement>(null);
  const running = !reduced && visible && !hidden;
  const t = useSceneClock(active, running, reduced);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Advance when the scene's time is up (a manual pick still advances, after its full run).
  useEffect(() => {
    if (!running) return;
    if (t >= SCENES[active].duration) { setActive((i) => (i + 1) % SCENES.length); setManual(false); }
  }, [t, running, active]);

  const scene = SCENES[active];
  return (
    <section className="pc-section pc-demos" aria-labelledby="pc-demos-title">
      <h2 className="pc-h2 pc-reveal is-in" id="pc-demos-title">Watch it read.</h2>
      <p className="pc-lede pc-section--lede pc-reveal is-in" style={{ marginTop: 20 }}>The interface, doing what it does, in the order it does it.</p>

      <div className="pc-demo-stage" ref={stageRef}>
        <img src="/images/twinme/cosmos-07-room.jpg" alt="" aria-hidden="true" />
        <div className="pc-demo-glass" role="group" aria-label={scene.label}>
          <div className="pc-demo-head">
            <span className="pc-demo-dot" /> TwinMe
            <em>{manual ? 'Paused on your pick' : 'Scripted demo, real interface'}</em>
          </div>
          {scene.id === 'reading' ? <SceneReading t={t} /> : null}
          {scene.id === 'twin' ? <SceneTwin t={t} /> : null}
          {scene.id === 'signature' ? <SceneSignature t={t} /> : null}
        </div>
      </div>

      <div className="pc-demo-tabs" role="tablist" aria-label="Demo scenes">
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            className={`pc-demo-tab ${i === active ? 'is-active' : ''} ${i === active && running ? 'is-running' : ''}`}
            style={{ '--dur': `${s.duration}ms` } as React.CSSProperties}
            onClick={() => { setActive(i); setManual(true); }}
          >
            <span className="pc-demo-tab-fill" aria-hidden="true" />
            <strong>{s.label}</strong>
            <small>{s.caption}</small>
          </button>
        ))}
      </div>

      <p className="pc-demo-note">
        Scripted from the sample readings on this page. Your own reading starts from your email in the search bar, or after one connected account.
      </p>
    </section>
  );
}

export default function CosmosDemosPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Live demos · TwinMe prototype';
    return () => { document.title = previousTitle; };
  }, []);
  return (
    <main className="presence-cosmos pc-demos-page" id="main-content">
      <header className="pc-demo-proto-head">
        <p className="pc-spec-n">Prototype · 2026-09-03 · for discussion</p>
        <p>A demos section for the front door, between "Read the way you live." and "Know what you're made of." Three scenes, auto-cycling, click to hold. Plan: .claude/plans/2026-09-03-live-demos.</p>
        <Link className="pc-btn pc-btn--ghost" to="/">The front door</Link>
      </header>
      <CosmosDemosSection />
    </main>
  );
}
