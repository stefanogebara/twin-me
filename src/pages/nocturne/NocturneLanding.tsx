import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { discoveryScan, type QuickEnrichmentData } from '../../services/enrichmentService';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import RevealStory from '../../components/landing/RevealStory';
import '../../styles/nocturne.css';

/**
 * NocturneLanding — the production landing (/) since the Nocturne flip
 * (2026-09-01), and still browsable at /nocturne.
 *
 * Carries the real acquisition flow: email -> discoveryScan -> RevealStory
 * (bridged into Nocturne) -> /auth with the reading in sessionStorage.
 *
 * Section rhythm is the reference stanza, verified live on the source:
 * eyebrow -> display(italic verb) -> bold lead -> ash body -> mono ghost -> cards.
 */

const SCAN_STATUS_LINES = [
  'Scanning your public footprint...',
  'Reading what you build and publish...',
  'Piecing together your story...',
  'Writing your first portrait...',
];

const SIGNATURES = [
  {
    tint: 'ember',
    plate: '/images/nocturne/sig-ember.jpg',
    glyph: 'M',
    domain: 'Motivation & Drive',
    line: 'What pulls you, and when it lets go.',
    body: 'Work rhythms, streaks, and the hours you protect without noticing.',
  },
  {
    tint: 'iris',
    plate: '/images/nocturne/sig-iris.jpg',
    glyph: 'P',
    domain: 'Personality & Emotion',
    line: 'How you actually process a hard day.',
    body: 'Stress signatures and recovery patterns, read from behavior — not a quiz.',
  },
  {
    tint: 'verdigris',
    plate: '/images/nocturne/sig-verdigris.jpg',
    glyph: 'C',
    domain: 'Cultural Identity',
    line: 'The taste underneath your taste.',
    body: 'What you return to at 2am says more than what you post at noon.',
  },
  {
    tint: 'orchid',
    plate: '/images/nocturne/sig-orchid.jpg',
    glyph: 'S',
    domain: 'Social Dynamics',
    line: 'Who gets your energy, and what it costs.',
    body: 'Conversation cadence, reply latency, and the people you never keep waiting.',
  },
  {
    tint: 'periwinkle',
    plate: '/images/nocturne/sig-periwinkle.jpg',
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

const PLANS = [
  { name: 'Free', price: '$0', sub: 'FREE FOREVER', features: ['100 chat messages / month', '2 platform connections', '7-day memory window'], cta: 'Get started' },
  { name: 'Plus', price: '$20/mo', sub: 'BILLED MONTHLY', features: ['1,500 chat messages / month', '5 platform connections', '90-day memory window', 'Expert reflections', 'Morning briefings'], cta: 'Start with Plus', primary: true },
  { name: 'Pro', price: '$100/mo', sub: 'BILLED MONTHLY', features: ['Unlimited messages', 'All platform connections', 'Full memory history', 'Best AI models', 'Priority support'], cta: 'Start with Pro' },
] as const;

const FAQ = [
  ['What is a soul signature?', 'A living portrait of your authentic self — patterns, preferences, and personality traits derived from how you actually behave across platforms.'],
  ['How is my data used?', 'Your data never leaves our infrastructure and is never used to train AI models. You own your soul signature completely.'],
  ['What platforms can I connect?', 'Spotify, Google Calendar, YouTube, Gmail, GitHub, and Whoop — plus a browser extension and desktop app.'],
  ['Can I delete my data?', 'Yes. Any memory, any connection, or everything — at any time, from Settings.'],
  ['Does TwinMe train AI on my data?', 'Never. Your memories power your twin and nothing else.'],
] as const;

const Arrow = () => (
  <svg className="n-btn__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const NocturneLanding = () => {
  const navigate = useNavigate();
  const { trackFunnel } = useAnalytics();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'revealed'>('idle');
  const [statusIdx, setStatusIdx] = useState(0);
  const [data, setData] = useState<QuickEnrichmentData | null>(null);
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    if (phase !== 'scanning') return;
    setStatusIdx(0);
    const timer = setInterval(
      () => setStatusIdx((index) => Math.min(index + 1, SCAN_STATUS_LINES.length - 1)),
      2600,
    );
    return () => clearInterval(timer);
  }, [phase]);

  const handleScan = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setScanError('Enter a valid email address.');
      return;
    }
    setScanError('');
    setPhase('scanning');
    trackFunnel('landing_scan_started');
    const result = await discoveryScan(trimmed);
    if (result.success && result.discovered?.persona_summary) {
      setData(result.discovered);
      sessionStorage.setItem('twinme_discovery_data', JSON.stringify(result.discovered));
      sessionStorage.setItem('twinme_discovery_email', trimmed);
      setPhase('revealed');
      trackFunnel('landing_scan_revealed');
      return;
    }
    setScanError(result.error || "We couldn't read enough from that email. Try another address.");
    setPhase('idle');
    trackFunnel('landing_scan_empty');
  };

  const handleNotMe = () => {
    sessionStorage.removeItem('twinme_discovery_data');
    setData(null);
    setPhase('idle');
    setScanError('');
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
      <header className="n-atmosphere" style={{ ["--n-plate" as string]: "url('/images/nocturne/atmosphere.jpg')" }}>
        {/* Motion is an enhancement, never the content: the still plate behind
            it is the poster, the fallback, and what reduced-motion users get. */}
        <video
          className="n-atmosphere__motion"
          src="/video/nocturne-atmosphere.mp4"
          poster="/images/nocturne/atmosphere.jpg"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          onCanPlay={(event) => event.currentTarget.classList.add('is-ready')}
        />
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

        {phase !== 'revealed' && (
          <form className="n-prompt n-rise n-rise--2" style={{ width: 'min(640px, calc(100% - 48px))', marginTop: 56 }} onSubmit={handleScan}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email — watch it read your public footprint"
              aria-label="Email address for a public reading"
              disabled={phase === 'scanning'}
            />
            <button type="submit" aria-label="Run the reading" disabled={!email.trim() || phase === 'scanning'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </form>
        )}
        {phase === 'revealed' && data && (
          <div style={{ width: 'min(640px, calc(100% - 48px))', marginTop: 48 }}>
            <RevealStory
              data={data}
              onCreateTwin={() => navigate('/auth')}
              onNotMe={handleNotMe}
              trackFunnel={trackFunnel}
            />
          </div>
        )}
        <p className="n-micro n-rise n-rise--3" aria-live="polite" style={{ marginTop: 20, color: 'rgba(255,255,255,0.55)', textAlign: 'center', padding: '0 24px' }}>
          {phase === 'scanning'
            ? SCAN_STATUS_LINES[statusIdx]
            : scanError || 'Track everything · Ask anything · Delete anytime'}
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
            <article key={sig.tint} className={`n-tile n-tile--plated n-tile--${sig.tint}`}>
              <div className="n-tile__plate" style={{ backgroundImage: `url('${sig.plate}')` }} />
              <div className="n-tile__wash" style={{ background: `var(--n-${sig.tint})` }} />
              <div className="n-tile__scrim" />
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
            <article key={sig.tint} className={`n-tile n-tile--plated n-tile--${sig.tint}`}>
              <div className="n-tile__plate" style={{ backgroundImage: `url('${sig.plate}')` }} />
              <div className="n-tile__wash" style={{ background: `var(--n-${sig.tint})` }} />
              <div className="n-tile__scrim" />
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

      {/* ─────────────────── PRICING (hairline rows) ─────────────────── */}
      <section className="n-section" id="pricing">
        <div className="n-stanza">
          <p className="n-micro">04 — The terms</p>
          <h2 className="n-display-sm"><em>Simple</em>, stated plainly.</h2>
          <p className="n-body">Start free. Pay only when you want more depth.</p>
        </div>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          {PLANS.map((plan) => (
            <div key={plan.name} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24, padding: '32px 0', borderTop: '1px solid var(--n-line)' }}>
              <div style={{ width: 150 }}>
                <p className="n-heading" style={{ fontSize: 28 }}>{plan.name}</p>
                <p className="n-label" style={{ marginTop: 6 }}>{plan.price}</p>
                <p className="n-micro" style={{ marginTop: 2 }}>{plan.sub}</p>
              </div>
              <div style={{ flex: 1, minWidth: 260, display: 'flex', flexWrap: 'wrap', gap: '8px 24px' }}>
                {plan.features.map((feature) => (
                  <span key={feature} className="n-body n-body-sm">{feature}</span>
                ))}
              </div>
              <a className={'primary' in plan && plan.primary ? 'n-btn n-btn--primary' : 'n-btn n-btn--ghost'} href="/auth">
                {plan.cta}
              </a>
            </div>
          ))}
          <hr className="n-hairline" />
        </div>
      </section>

      {/* ─────────────────────── FAQ ─────────────────────── */}
      <section style={{ background: 'var(--n-abyss)' }} id="faq">
        <div className="n-section">
          <div className="n-stanza">
            <p className="n-micro">05 — Questions</p>
            <h2 className="n-display-sm">Asked, <em>answered</em>.</h2>
          </div>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            {FAQ.map(([question, answer]) => (
              <details key={question} className="n-disclosure">
                <summary className="n-lead">{question}</summary>
                <p className="n-body n-body-sm" style={{ marginTop: 12, maxWidth: 600 }}>{answer}</p>
              </details>
            ))}
            <hr className="n-hairline" />
          </div>
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
