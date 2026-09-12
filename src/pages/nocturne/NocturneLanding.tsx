import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { discoveryScan, type QuickEnrichmentData } from '../../services/enrichmentService';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import RevealStory from '../../components/landing/RevealStory';
import { Section, List, Row } from '@/components/register';
import '../../styles/nocturne.css';
import '../../styles/register-public.css';
import '../../styles/front-door.css';

/**
 * NocturneLanding — the production landing (/), still browsable at /nocturne.
 * The name is Nocturne's; the page is the register's (src/styles/front-door.css).
 *
 * Carries the real acquisition flow: email -> discoveryScan -> RevealStory
 * -> /auth with the reading in sessionStorage.
 *
 * A marketing page keeps its photography and film: the hero plate and clip and
 * the five photo tiles. The rest is sections of a heading, one grey line and
 * rows under a 1px ink rule; one 48/12 call to action.
 */

const SCAN_STATUS_LINES = [
  'Scanning your public footprint...',
  'Reading what you build and publish...',
  'Piecing together your story...',
  'Writing your first portrait...',
];

const SIGNATURES = [
  { tint: 'ember', plate: '/images/nocturne/sig-ember.jpg', glyph: 'M', domain: 'Motivation and drive', line: 'What pulls you, and when it lets go.' },
  { tint: 'iris', plate: '/images/nocturne/sig-iris.jpg', glyph: 'P', domain: 'Personality and emotion', line: 'How you get through a hard day.' },
  { tint: 'verdigris', plate: '/images/nocturne/sig-verdigris.jpg', glyph: 'C', domain: 'Cultural identity', line: 'The taste underneath your taste.' },
  { tint: 'orchid', plate: '/images/nocturne/sig-orchid.jpg', glyph: 'S', domain: 'Social dynamics', line: 'Who gets your energy, and what it costs.' },
  { tint: 'periwinkle', plate: '/images/nocturne/sig-periwinkle.jpg', glyph: 'L', domain: 'Lifestyle and rhythms', line: 'The week your calendar cannot see.' },
] as const;

const READINGS = [
  { source: 'Spotify, 23:41', statement: 'You loop the same three songs when a deadline is close.' },
  { source: 'Calendar and Spotify, six Tuesdays', statement: 'Tuesdays end in back-to-back calls, and that night your music turns quiet.' },
  { source: 'GitHub, 02:14', statement: 'Your best work happens after midnight, in short bursts.' },
] as const;

const TWIN = [
  { title: 'Why am I like this?', line: 'It answers from your calendar, music and sleep, and shows its sources.' },
  { title: 'It answers as you.', line: 'Written the way you write, checked against your own answers.' },
  { title: '61% the same answer', line: 'How often it picks the answer you pick, over 25 questions.' },
] as const;

const PLANS = [
  { name: 'Free', price: '$0', line: '100 messages a month, 2 connections, 7 days of memory', cta: 'Get started' },
  { name: 'Plus', price: '$20 a month', line: '1,500 messages, 5 connections, 90 days of memory', cta: 'Start with Plus' },
  { name: 'Pro', price: '$100 a month', line: 'Unlimited messages, every connection, all your memory', cta: 'Start with Pro' },
] as const;

const FAQ = [
  ['What is a soul signature?', 'A portrait of you, built from how you actually behave across your apps.'],
  ['Is my data used to train AI?', 'Never. It stays in our infrastructure and powers your twin and nothing else.'],
  ['Which platforms can I connect?', 'Spotify, Google Calendar, YouTube, Gmail, GitHub and Whoop, plus a browser extension and a desktop app.'],
  ['Can I delete my data?', 'Yes. Any memory, any connection, or everything, at any time, from Settings.'],
] as const;

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
    <div className="fd">
      {/* ───────────────────────── NAV ───────────────────────── */}
      <nav className="n-nav" aria-label="Primary">
        {/* The wordmark is the logo, the one place the name is set in capitals. */}
        <a href="/" className="n-label" aria-label="TwinMe home" style={{ textDecoration: 'none', letterSpacing: '0.08em' }}>
          TWINME
        </a>
        <div className="n-nav__links n-nav__links--sections">
          <a className="n-nav__link" href="#signatures">Signatures</a>
          <a className="n-nav__link" href="#twin">The twin</a>
        </div>
        <div className="n-nav__links">
          <a className="n-nav__link n-nav__link--quiet" href="/auth">Log in</a>
          <a className="n-btn n-btn--primary" href="/auth">Get started</a>
        </div>
      </nav>

      {/* ─────────────────── HERO: the plate and the film ─────────────────── */}
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
        <div className="n-rise fd-hero-copy">
          <span className="n-badge">Private beta</span>
          <h1 className="n-display">Know yourself.</h1>
          <p className="n-lead">TwinMe is your soul signature, measured.</p>
          <a className="n-btn n-btn--primary pb-cta" href="/auth">Get your signature</a>
        </div>

        {phase !== 'revealed' && (
          <form className="n-prompt n-rise n-rise--2 fd-prompt" onSubmit={handleScan}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Your email, for a first reading"
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
          <div className="fd-reveal">
            <RevealStory
              data={data}
              onCreateTwin={() => navigate('/auth')}
              onNotMe={handleNotMe}
              trackFunnel={trackFunnel}
            />
          </div>
        )}
        <p className="n-micro n-rise n-rise--3 fd-status" aria-live="polite">
          {phase === 'scanning'
            ? SCAN_STATUS_LINES[statusIdx]
            : scanError || 'Read-only. Delete anything, any time.'}
        </p>
      </header>

      {/* ─────────────── THE FIVE SIGNATURES: photo tiles ─────────────── */}
      <div className="n-section pb-marketing" id="signatures">
        <Section title="Five signatures, one person." line="Five readers, each looking at one side of you.">
          <div className="fd-tiles">
            {SIGNATURES.map((sig) => (
              <article key={sig.tint} className={`n-tile n-tile--plated n-tile--${sig.tint}`}>
                <div className="n-tile__plate" style={{ backgroundImage: `url('${sig.plate}')` }} />
                <div className="n-tile__wash" style={{ background: `var(--n-${sig.tint})` }} />
                <div className="n-tile__scrim" />
                <span className="n-tile__glyph" aria-hidden="true">{sig.glyph}</span>
                <div className="n-tile__caption">
                  <p className="n-micro">{sig.domain}</p>
                  <p className="n-lead">{sig.line}</p>
                </div>
              </article>
            ))}
          </div>
        </Section>
      </div>

      {/* ─────────────── THE EVIDENCE: readings as rows ─────────────── */}
      <div className="n-section pb-marketing">
        <Section title="It notices." line="Every reading names where it came from.">
          <List label="Example readings">
            {READINGS.map((reading) => (
              <Row key={reading.source} title={reading.statement} line={reading.source} />
            ))}
          </List>
        </Section>
      </div>

      {/* ─────────────── THE TWIN ─────────────── */}
      <div className="n-section pb-marketing" id="twin">
        <Section title="Ask anything." line="A twin with your memory, not a chatbot with your name.">
          <List label="What the twin does">
            {TWIN.map((item) => (
              <Row key={item.title} title={item.title} line={item.line} />
            ))}
          </List>
        </Section>
      </div>

      {/* ─────────────── PLANS ─────────────── */}
      <div className="n-section pb-marketing" id="pricing">
        <Section title="Plans" line="Start free. Pay when you want more.">
          <List label="Plans" className="pb-stack rg-figures">
            {PLANS.map((plan) => (
              <Row
                key={plan.name}
                title={`${plan.name}, ${plan.price}`}
                line={plan.line}
                action={<a className="n-btn n-btn--ghost" href="/auth">{plan.cta}</a>}
              />
            ))}
          </List>
        </Section>
      </div>

      {/* ─────────────── QUESTIONS ─────────────── */}
      <div className="n-section pb-marketing" id="faq">
        <Section title="Questions">
          <div className="fd-faq">
            {FAQ.map(([question, answer]) => (
              <details key={question} className="n-disclosure">
                <summary className="n-lead">{question}</summary>
                <p className="n-body fd-faq-answer">{answer}</p>
              </details>
            ))}
          </div>
        </Section>
      </div>

      {/* ─────────────── CLOSE ─────────────── */}
      <div className="n-section fd-close">
        <h2 className="n-display">Meet yourself.</h2>
        <div className="fd-close-actions">
          <a className="n-btn n-btn--primary pb-cta" href="/auth">Get your signature</a>
          <a className="n-btn n-btn--ghost" href="/waitlist">Join the waitlist</a>
        </div>
      </div>

      {/* ─────────────── FOOTER ─────────────── */}
      <footer className="n-section fd-foot">
        <nav className="fd-foot-links" aria-label="Legal">
          <a href="/privacy-policy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/system">Design system</a>
        </nav>
        <p className="n-micro">© 2026 TwinMe Inc. Readings are observations, not clinical measures.</p>
      </footer>
    </div>
  );
};

export default NocturneLanding;
