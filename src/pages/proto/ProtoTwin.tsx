/**
 * /proto/twin — from scratch. What the platform does, told the way Littlebird and Hark tell theirs:
 * cream paper, a warm serif, painted illustrations of the traces it reads, one product frame,
 * a centred manifesto, one sign-up. No photograph of a room, no glass, no dossier of cards.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/twin-landing.css';
import { DEMO_PORTRAIT, DOMAIN_LABEL, SOURCE_LABEL } from '../../data/demoPortrait';

const TRACES = [
  { img: 'trace-record', source: 'Spotify', line: 'What you play when you focus, and what you loop until the thing is done.' },
  { img: 'trace-calendar', source: 'Calendar', line: 'The shape of your weeks: the empty days, the crowded evenings.' },
  { img: 'trace-sleep', source: 'Whoop', line: 'How a long night lands on the next day, and how your bedtime drifts.' },
  { img: 'trace-keyboard', source: 'GitHub', line: 'When you ship, when nothing moves, and what you go back to fix.' },
  { img: 'trace-mail', source: 'Gmail', line: 'How much lands on you, and when you answer. Never a name, never a line of it.' },
  { img: 'trace-run', source: 'Whoop', line: 'Where the week gets its air, and what the mornings after look like.' },
];

const PLAIN: Record<string, string> = { motivation: 'Work and drive', personality: 'Temperament', cultural: 'Taste', social: 'People', lifestyle: 'Days and nights' };

function useTyped(text: string, ms = 34, start = true) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    setN(0);
    const t = window.setInterval(() => setN((k) => (k >= text.length ? k : k + 1)), ms);
    return () => window.clearInterval(t);
  }, [text, ms, start]);
  return text.slice(0, n);
}

export default function ProtoTwin() {
  const d = DEMO_PORTRAIT;
  const ask = d.ask[0];
  const [asked, setAsked] = useState(false);
  const answer = useTyped(ask?.a ?? '', 30, asked);
  useEffect(() => {
    const el = document.getElementById('tl-ask');
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) setAsked(true); }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const q = d.question!;
  const from = d.readings.filter((r) => q.fromReadings.includes(r.id));
  const receipts = from.flatMap((r) => r.evidence).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2);

  return (
    <main className="tl">
      <header className="tl-nav">
        <Link to="/" className="tl-mark">twinme</Link>
        <nav>
          <a href="#reads">How it reads</a>
          <a href="#portrait">Your portrait</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <Link to="/" className="tl-btn">Read my portrait</Link>
      </header>

      <section className="tl-hero">
        <img className="tl-edge tl-edge--left" src="/images/twin/edge-left.jpg" alt="" aria-hidden="true" />
        <img className="tl-edge tl-edge--right" src="/images/twin/edge-right.jpg" alt="" aria-hidden="true" />
        <h1>You, read from<br />your days.</h1>
        <p className="tl-sub">TwinMe reads the traces you already leave, what you play, when you work, how you sleep, and writes a portrait of you with the receipts to prove it.</p>
        <Link to="/" className="tl-btn tl-btn--lg">Read my portrait</Link>
        <p className="tl-fine">Connect one place. The first line arrives tonight. Nothing self-reported.</p>
      </section>

      <section className="tl-traces" id="reads">
        <div className="tl-section-head">
          <h2>It reads the traces, not the contents.</h2>
          <p>Counts, rhythms and repeats from the places you already use. Never a message, never a photo, never your location.</p>
        </div>
        <ul className="tl-trace-grid">
          {TRACES.map((t) => (
            <li key={t.img + t.line} className="tl-trace">
              <img src={`/images/twin/${t.img}.jpg`} alt="" loading="lazy" />
              <span className="tl-eyebrow">{t.source}</span>
              <p>{t.line}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="tl-portrait" id="portrait">
        <img className="tl-easel" src="/images/twin/portrait-easel.jpg" alt="" loading="lazy" />
        <div className="tl-portrait-copy">
          <h2>Then it writes your portrait: five lines that hold.</h2>
          <p className="tl-lede">One line for each part of your life, each read from named places, each with its receipts under it. This is {d.owner}&rsquo;s.</p>
          <ol className="tl-lines">
            {d.signature.map((s) => {
              const rows = d.readings.filter((r) => s.from.includes(r.id));
              const sources = [...new Set(rows.flatMap((r) => r.evidence.map((e) => SOURCE_LABEL[e.source] ?? e.source)))];
              const n = rows.reduce((k, r) => k + r.evidence.length, 0);
              return (
                <li key={s.domain}>
                  <span className="tl-eyebrow">{PLAIN[s.domain] ?? DOMAIN_LABEL[s.domain]}</span>
                  <p>{s.line}</p>
                  <small>Read from {sources.join(', ')}. {n} receipts.</small>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="tl-question">
        <div className="tl-section-head">
          <h2>Once a week, it asks you one thing.</h2>
          <p>Something new it noticed, with what it was read from underneath. You say whether it is you. The portrait learns from the answer.</p>
        </div>
        <div className="tl-frame">
          <div className="tl-frame-bar"><span>twinme</span><span className="tl-mono">Thursday evening</span></div>
          <div className="tl-frame-body">
            <span className="tl-eyebrow">New this week · {q.source}</span>
            <p className="tl-frame-q">{q.question}</p>
            <div className="tl-frame-answers">{q.answers.map((a, i) => <b key={a} className={i === 0 ? 'is-primary' : ''}>{a}</b>)}</div>
            <div className="tl-frame-receipts">
              {receipts.map((e, i) => (
                <div key={i}><span className="tl-mono">{SOURCE_LABEL[e.source] ?? e.source} · {new Date(e.at).getUTCDate()} Sept</span><p>{e.event}</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="tl-ask" id="tl-ask">
        <div className="tl-section-head">
          <h2>And it answers as you, from the receipts.</h2>
        </div>
        <div className="tl-dialogue">
          <p className="tl-dialogue-q">{ask?.q}</p>
          <p className="tl-dialogue-a">{answer}<i className={asked && answer.length < (ask?.a.length ?? 0) ? 'tl-caret' : 'tl-caret is-done'} /></p>
          <p className="tl-dialogue-cite">Cites the line it read it from. Says when it does not know.</p>
        </div>
      </section>

      <section className="tl-film">
        <img src="/images/twin/film-still.jpg" alt="" loading="lazy" />
      </section>

      <section className="tl-manifesto">
        <p>Most apps ask who you are. A quiz, a form, a bio you write on a Tuesday and never touch again.</p>
        <p>TwinMe does not ask. It reads what you already do, in the places you already do it, and keeps a receipt for every line it writes.</p>
        <p>When it notices something new, it asks you one question. You say whether it is you. That is the whole loop, and the portrait gets truer every week.</p>
      </section>

      <section className="tl-privacy" id="privacy">
        <h2>Counted, not kept.</h2>
        <ul>
          <li><b>Counts and rhythms.</b> How many, how often, what time of day. Never the contents.</li>
          <li><b>Never a message, a photo or your location.</b> Mail is sender counts and send times. Calendar is events per day.</li>
          <li><b>Yours to delete.</b> Remove a source and everything read from it goes with it. Nothing here trains a model.</li>
        </ul>
      </section>

      <section className="tl-signup">
        <h2>Read your portrait</h2>
        <p>Connect one place. The first line arrives tonight.</p>
        <form className="tl-form" onSubmit={(e) => e.preventDefault()}>
          <input type="email" placeholder="you@somewhere.com" aria-label="Email" />
          <Link to="/" className="tl-btn">Start</Link>
        </form>
      </section>

      <footer className="tl-footer">
        <span className="tl-mark">twinme</span>
        <nav><Link to="/privacy-policy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/proto">Prototypes</Link></nav>
        <span>2026</span>
      </footer>
    </main>
  );
}
