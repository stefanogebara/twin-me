import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../styles/nocturne.css';

/**
 * NocturneLanding — flagship application of the Nocturne design system.
 *
 * Preview route (/nocturne). This page exists to prove the system on the
 * highest-stakes surface before adoption; the production landing at / is
 * untouched until the direction is chosen. Controls route into the real
 * funnel (/ for the scan, /auth, /waitlist) rather than dead-ending.
 *
 * Section rhythm is the reference stanza, verified live on the source:
 * eyebrow -> display(italic verb) -> bold lead -> ash body -> mono ghost -> cards.
 */

const SIGNATURES = [
  {
    tint: 'ember',
    glyph: 'M',
    domain: 'Motivation & Drive',
    line: 'What pulls you, and when it lets go.',
    body: 'Work rhythms, streaks, and the hours you protect without noticing.',
  },
  {
    tint: 'iris',
    glyph: 'P',
    domain: 'Personality & Emotion',
    line: 'How you actually process a hard day.',
    body: 'Stress signatures and recovery patterns, read from behavior — not a quiz.',
  },
  {
    tint: 'verdigris',
    glyph: 'C',
    domain: 'Cultural Identity',
    line: 'The taste underneath your taste.',
    body: 'What you return to at 2am says more than what you post at noon.',
  },
  {
    tint: 'orchid',
    glyph: 'S',
    domain: 'Social Dynamics',
    line: 'Who gets your energy, and what it costs.',
    body: 'Conversation cadence, reply latency, and the people you never keep waiting.',
  },
  {
    tint: 'periwinkle',
    glyph: 'L',
    domain: 'Lifestyle & Rhythms',
    line: 'The week your calendar cannot see.',
    body: 'Sleep, strain, and the tide of a real day — measured, not remembered.',
  },
] as const;

const READINGS = [
  {
    source: 'SPOTIFY · 23:41 · REPEAT ×4',
    statement: 'You loop the same three songs when a deadline is close. Focus, for you, sounds like ritual.',
  },
  {
    source: 'CALENDAR · TUESDAYS · 6 WEEKS',
    statement: 'Every Tuesday ends in back-to-back calls, and every Tuesday night your music turns ambient. You already knew how to recover. You just never watched yourself do it.',
  },
  {
    source: 'GITHUB · 02:14 · BRANCH: still-awake',
    statement: 'Your best commits happen after midnight, in bursts, alone. Rest, for you, is momentum.',
  },
] as const;

const Arrow = () => (
  <svg className="n-btn__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const NocturneLanding = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  /* The prompt is the real front door: it hands the email to the production
     scan flow rather than pretending to run its own. */
  const handleScan = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed) sessionStorage.setItem('twinme_discovery_email', trimmed);
    navigate('/');
  };

  return (
    <div style={{ background: 'var(--n-obsidian)', minHeight: '100vh' }}>
      {/* ───────────────────────── NAV ───────────────────────── */}
      <nav className="n-nav" aria-label="Primary">
        <a href="/nocturne" className="n-label" style={{ textDecoration: 'none', letterSpacing: '0.08em' }}>
          TWINME
        </a>
        <div className="n-nav__links n-nav__links--sections">
          <a className="n-nav__link" href="#signatures">Signatures</a>
          <a className="n-nav__link" href="#twin">The Twin</a>
        </div>
        <div className="n-nav__links">
          <a className="n-nav__link n-nav__link--quiet" href="/auth">Log in</a>
          <a className="n-btn n-btn--primary" href="/auth" style={{ padding: '9px 14px' }}>
            Get started <Arrow />
          </a>
        </div>
      </nav>

      {/* ─────────────────── ATMOSPHERE HERO ─────────────────── */}
      {/* Atmosphere is built entirely in CSS — no legacy imagery anywhere
          in Nocturne (owner decision 2026-09-01: all backgrounds from scratch). */}
      <header className="n-atmosphere">
        <div className="n-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--n-s5)', padding: '0 24px', textAlign: 'center' }}>
          <span className="n-badge">Private beta — invite only</span>
          <h1 className="n-display" style={{ color: 'var(--n-pure)' }}>
            <em>Know</em> yourself.
          </h1>
          <div>
            <p className="n-lead" style={{ color: 'var(--n-pure)' }}>TwinMe is your soul signature, measured.</p>
            <p className="n-body" style={{ maxWidth: 480, marginTop: 8 }}>
              It reads what you actually do — the music, the hours, the work, the
              people — and builds a portrait no questionnaire could.
            </p>
          </div>
          <a className="n-btn n-btn--primary" href="/auth">
            Get your signature <Arrow />
          </a>
        </div>

        <form className="n-prompt n-rise n-rise--2" style={{ width: 'min(640px, calc(100% - 48px))', marginTop: 56 }} onSubmit={handleScan}>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email — watch it read your public footprint"
            aria-label="Email address for a public reading"
          />
          <button type="submit" aria-label="Run the reading" disabled={!email.trim()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </form>
        <p className="n-micro n-rise n-rise--3" style={{ marginTop: 20, color: 'rgba(255,255,255,0.55)', textAlign: 'center', padding: '0 24px' }}>
          Track everything · Ask anything · Delete anytime
        </p>
      </header>

      {/* ─────────────── SIGNATURES (the five tiles) ─────────────── */}
      <section className="n-section" id="signatures">
        <div className="n-stanza">
          <p className="n-micro">01 — The portrait</p>
          <h2 className="n-display-sm"><em>Read</em> closely.</h2>
          <p className="n-lead">Five signatures. One person.</p>
          <p className="n-body">
            Five experts read your data from five directions — drive, emotion,
            taste, people, rhythm — and each keeps its own color.
          </p>
          <a className="n-btn n-btn--ghost" href="/auth">More about the signal</a>
        </div>

        <div className="n-grid-3" style={{ marginBottom: 14 }}>
          {SIGNATURES.slice(0, 3).map((sig) => (
            <article key={sig.tint} className={`n-tile n-tile--${sig.tint}`}>
              <span className="n-tile__glyph" aria-hidden="true">{sig.glyph}</span>
              <div className="n-tile__caption">
                <p className="n-micro">{sig.domain}</p>
                <p className="n-lead">{sig.line}</p>
                <p className="n-body-sm">{sig.body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="n-grid-2" style={{ maxWidth: 810, margin: '0 auto' }}>
          {SIGNATURES.slice(3).map((sig) => (
            <article key={sig.tint} className={`n-tile n-tile--${sig.tint}`}>
              <span className="n-tile__glyph" aria-hidden="true">{sig.glyph}</span>
              <div className="n-tile__caption">
                <p className="n-micro">{sig.domain}</p>
                <p className="n-lead">{sig.line}</p>
                <p className="n-body-sm">{sig.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ─────────────── READING STRIP (abyss band) ─────────────── */}
      <section style={{ background: 'var(--n-abyss)' }}>
        <div className="n-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--n-s15)' }}>
          <div className="n-stanza" style={{ marginBottom: 0 }}>
            <p className="n-micro">02 — The evidence</p>
            <h2 className="n-display-sm">It <em>notices</em>.</h2>
            <p className="n-body">Not summaries. Observations — timestamped, sourced, yours.</p>
          </div>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--n-s12)' }}>
            {READINGS.map((reading) => (
              <div key={reading.source} className="n-reading">
                <p className="n-micro">{reading.source}</p>
                <p className="n-reading__statement">{reading.statement}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── THE TWIN (graphite cards) ─────────────── */}
      <section className="n-section" id="twin">
        <div className="n-stanza">
          <p className="n-micro">03 — The twin</p>
          <h2 className="n-display-sm"><em>Ask</em> anything.</h2>
          <p className="n-lead">A twin with your memory, not a chatbot with your name.</p>
          <p className="n-body">
            It holds your context — every pattern above — and answers the questions
            you have never had the data to ask.
          </p>
        </div>
        <div className="n-grid-2">
          <div className="n-card" style={{ padding: 48 }}>
            <h3 className="n-heading" style={{ textAlign: 'center' }}><em>Why</em> am I like this?</h3>
            <p className="n-body" style={{ textAlign: 'center', marginTop: 16, maxWidth: 380, marginInline: 'auto' }}>
              Ask why Tuesdays drain you. It answers from your calendar, your music,
              your sleep — and cites what it read.
            </p>
          </div>
          <div className="n-card" style={{ padding: 48 }}>
            <h3 className="n-heading" style={{ textAlign: 'center' }}>It answers <em>as</em> you.</h3>
            <p className="n-body" style={{ textAlign: 'center', marginTop: 16, maxWidth: 380, marginInline: 'auto' }}>
              Your cadence, your vocabulary, your instincts — trained on how you
              actually write, measured against how you actually answer.
            </p>
          </div>
        </div>

        {/* One inverted card per page — the honest number, in the mono voice */}
        <div className="n-card--inverted" style={{ marginTop: 14, padding: 'var(--n-s12)', textAlign: 'center' }}>
          <p className="n-heading" style={{ color: 'var(--n-void)', fontSize: 64, lineHeight: 1 }}>61%</p>
          <p className="n-lead" style={{ marginTop: 12 }}>
            how often the twin picks the same answer its human does
          </p>
          <p className="n-micro" style={{ marginTop: 12, color: '#6a6b6b' }}>
            25 self-report items · one session · measured, not a vibe
          </p>
        </div>
      </section>

      {/* ─────────────────────── CLOSE ─────────────────────── */}
      <section style={{ background: 'var(--n-abyss)' }}>
        <div className="n-section n-stanza" style={{ marginBottom: 0 }}>
          <h2 className="n-display"><em>Meet</em> yourself.</h2>
          <p className="n-body" style={{ maxWidth: 420 }}>
            Seven platforms. Five signatures. One portrait that keeps learning.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <a className="n-btn n-btn--primary" href="/auth">Get your signature <Arrow /></a>
            <a className="n-btn n-btn--ghost" href="/waitlist">Join the waitlist</a>
          </div>
        </div>
      </section>

      {/* ─────────────────────── FOOTER ─────────────────────── */}
      <footer className="n-section" style={{ paddingTop: 48, paddingBottom: 48 }}>
        <hr className="n-hairline" style={{ marginBottom: 32 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          <span className="n-label" style={{ letterSpacing: '0.08em' }}>TWINME</span>
          <div style={{ display: 'flex', gap: 24 }}>
            <a className="n-micro" href="/privacy-policy" style={{ textDecoration: 'none' }}>Privacy</a>
            <a className="n-micro" href="/terms" style={{ textDecoration: 'none' }}>Terms</a>
            <a className="n-micro" href="/nocturne/system" style={{ textDecoration: 'none' }}>Design system</a>
          </div>
        </div>
        <p className="n-micro" style={{ marginTop: 32, maxWidth: 880 }}>
          © 2026 TwinMe Inc. Your data is read, never written. Nothing is used to train
          models. Every connection is revocable and every memory deletable, in one click,
          at any time. Readings are behavioral observations, not clinical measures.
        </p>
      </footer>
    </div>
  );
};

export default NocturneLanding;
