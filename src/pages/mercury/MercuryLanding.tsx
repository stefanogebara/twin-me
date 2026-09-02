import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { discoveryScan, type QuickEnrichmentData } from '../../services/enrichmentService';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import RevealStory from '../../components/landing/RevealStory';
import '../../styles/mercury.css';

/**
 * / — TwinMe in the Mercury register (replaces the Nocturne landing).
 * Plan and reference lock: .claude/plans/2026-09-02-twinme-mercury/README.md
 *
 * Structure follows mercury.com as measured: a sticky hero that scrolls from a wide
 * exterior into the product; a tabbed feature list beside a product panel; a light
 * interlude; illustrated cards; a stat row; pricing; FAQ; a CTA pair; a footer with
 * footnotes. Content, palette and accent are ours.
 *
 * The acquisition flow is unchanged from Nocturne: email -> discoveryScan ->
 * RevealStory -> /auth with the reading in sessionStorage.
 *
 * Media: /images/mercury/* generated for this page (GPT Image 2 stills, Recraft V4.1
 * signature illustrations). Product demos in /video/mercury/demo-*.mp4 are Remotion
 * renders of the real UI (remotion/demos.tsx).
 */

const SCAN_STATUS_LINES = [
  'Scanning your public footprint',
  'Reading what you build and publish',
  'Piecing together your story',
  'Writing your first portrait',
];

const TABS = [
  { id: 'connect', title: 'Connect what you already use', body: 'Spotify, Google Calendar, YouTube, Gmail, GitHub and Whoop. Each one adds a direction the portrait can be read from.', video: '/video/mercury/demo-connect.mp4' },
  { id: 'portrait', title: 'Read the portrait', body: 'Five signatures, each measured from behaviour rather than a quiz, each with the line of evidence it came from.', video: '/video/mercury/demo-portrait.mp4' },
  { id: 'notices', title: 'It notices', body: 'Timestamped, sourced observations about you, not summaries. The kind of thing you would only notice if someone watched for six weeks.', video: '/video/mercury/demo-notices.mp4' },
  { id: 'twin', title: 'Ask anything', body: 'A twin with your memory, not a chatbot with your name. It answers from your calendar, your music, your sleep, and cites what it read.', video: '/video/mercury/demo-twin.mp4' },
];

const SIGNATURES = [
  { key: 'ember', illo: '/images/mercury/sig-ember.jpg', domain: 'Motivation & drive', line: 'What pulls you, and when it lets go.', body: 'Work rhythms, streaks, and the hours you protect without noticing.' },
  { key: 'iris', illo: '/images/mercury/sig-iris.jpg', domain: 'Personality & emotion', line: 'How you actually process a hard day.', body: 'Stress signatures and recovery patterns, read from behaviour, not a quiz.' },
  { key: 'verdigris', illo: '/images/mercury/sig-verdigris.jpg', domain: 'Cultural identity', line: 'The taste underneath your taste.', body: 'What you return to at 2am says more than what you post at noon.' },
  { key: 'orchid', illo: '/images/mercury/sig-orchid.jpg', domain: 'Social dynamics', line: 'Who gets your energy, and what it costs.', body: 'Conversation cadence, reply latency, and the people you never keep waiting.' },
  { key: 'periwinkle', illo: '/images/mercury/sig-periwinkle.jpg', domain: 'Lifestyle & rhythms', line: 'The week your calendar cannot see.', body: 'Sleep, strain, and the tide of a real day, measured, not remembered.' },
];

const READINGS = [
  { source: 'Spotify · 23:41 · repeat ×4', statement: 'You loop the same three songs when a deadline is close. Focus, for you, sounds like ritual.' },
  { source: 'Calendar · Tuesdays · 6 weeks', statement: 'Every Tuesday ends in back-to-back calls, and every Tuesday night your music turns ambient. You already knew how to recover. You just never watched yourself do it.' },
  { source: 'GitHub · 02:14 · branch: still-awake', statement: 'Your best commits happen after midnight, in bursts, alone. Rest, for you, is momentum.' },
];

const PLANS = [
  { name: 'Free', price: '$0', sub: 'free forever', features: ['100 chat messages a month', '2 platform connections', '7-day memory window'], cta: 'Get started', featured: false },
  { name: 'Plus', price: '$20', sub: 'a month', features: ['1,500 chat messages a month', '5 platform connections', '90-day memory window', 'Expert reflections', 'Morning briefings'], cta: 'Start with Plus', featured: true },
  { name: 'Pro', price: '$100', sub: 'a month', features: ['Unlimited messages', 'All platform connections', 'Full memory history', 'Best AI models', 'Priority support'], cta: 'Start with Pro', featured: false },
];

const FAQ = [
  ['What is a soul signature?', 'A living portrait of your authentic self: patterns, preferences and traits derived from how you actually behave across the platforms you connect.'],
  ['How is my data used?', 'Your data never leaves our infrastructure and is never used to train AI models. You own your soul signature completely.'],
  ['What platforms can I connect?', 'Spotify, Google Calendar, YouTube, Gmail, GitHub and Whoop, plus a browser extension and a desktop app.'],
  ['Can I delete my data?', 'Yes. Any memory, any connection, or everything, at any time, from Settings.'],
  ['Does TwinMe train AI on my data?', 'Never. Your memories power your twin and nothing else.'],
];

function Mark() {
  return <span className="mx-mark" aria-hidden="true"><i /></span>;
}

export default function MercuryLanding() {
  const navigate = useNavigate();
  const { trackFunnel } = useAnalytics();
  const heroRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'revealed'>('idle');
  const [statusIdx, setStatusIdx] = useState(0);
  const [data, setData] = useState<QuickEnrichmentData | null>(null);
  const [scanError, setScanError] = useState('');

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'TwinMe · Know yourself';
    return () => { document.title = previousTitle; };
  }, []);

  // Hero: scroll progress drives a push-in on the observatory, then a cross-fade
  // into the desk and the portrait on the laptop. Two stills, no video to load.
  useEffect(() => {
    const hero = heroRef.current, stage = stageRef.current, nav = navRef.current;
    if (!hero || !stage || !nav) return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let frame = 0;
    const paint = () => {
      frame = 0;
      const range = hero.offsetHeight - window.innerHeight;
      const p = range > 0 ? Math.min(Math.max(window.scrollY / range, 0), 1) : 0;
      stage.style.setProperty('--p', p.toFixed(4));
      nav.classList.toggle('is-solid', window.scrollY > range * 0.92);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('.mx-reveal');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { nodes.forEach((n) => n.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  // autoPlay only applies at mount; on tab change start the active demo from the top.
  useEffect(() => {
    panelRef.current?.querySelectorAll<HTMLVideoElement>('video').forEach((v, i) => {
      if (i === tab) { v.currentTime = 0; void v.play().catch(() => {}); } else v.pause();
    });
  }, [tab]);

  useEffect(() => {
    if (phase !== 'scanning') return;
    setStatusIdx(0);
    const timer = setInterval(() => setStatusIdx((i) => Math.min(i + 1, SCAN_STATUS_LINES.length - 1)), 2600);
    return () => clearInterval(timer);
  }, [phase]);

  const handleScan = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) { setScanError('Enter a valid email address.'); return; }
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
    <main className="mx" id="main-content">
      <header ref={navRef} className="mx-nav" aria-label="Primary">
        <Link className="mx-brand" to="/" aria-label="TwinMe home"><Mark />TwinMe</Link>
        <nav className="mx-nav-links">
          <a href="#how">How it works</a>
          <a href="#signatures">Signatures</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="mx-nav-right">
          <Link to="/auth">Log in</Link>
          <Link className="mx-btn mx-btn--primary mx-btn--sm" to="/auth">Get your signature</Link>
        </div>
      </header>

      <section ref={heroRef} className="mx-hero" aria-labelledby="mx-hero-title">
        <div ref={stageRef} className={`mx-hero-stage ${reduced ? 'is-reduced' : ''}`}>
          <div className="mx-hero-media">
            <img className="mx-hero-exterior" src="/images/mercury/hero-start.jpg" alt="An observatory on a hill under a night sky, its dome lit from inside" />
            <img className="mx-hero-interior" src="/images/mercury/hero-end.jpg" alt="A desk inside the observatory with a laptop showing a five-band portrait" />
          </div>
          <div className="mx-grain" aria-hidden="true" />
          <div className="mx-hero-scrim" aria-hidden="true" />
          <div className="mx-hero-copy">
            <h1 id="mx-hero-title" className="mx-h1">Know yourself.</h1>
            <p className="mx-lede">TwinMe is your soul signature, measured. It reads what you actually do, the music, the hours, the work, the people, and builds a portrait no questionnaire could.</p>
            {phase !== 'revealed' && (
              <>
                <form className="mx-capsule" onSubmit={handleScan} aria-label="Read your public footprint">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" aria-label="Email address for a public reading" disabled={phase === 'scanning'} />
                  <button type="submit" className="mx-btn mx-btn--primary" disabled={phase === 'scanning'}>Read my footprint</button>
                </form>
                {phase === 'scanning' ? (
                  <p className="mx-hero-status" aria-live="polite"><i />{SCAN_STATUS_LINES[statusIdx]}</p>
                ) : scanError ? (
                  <p className="mx-hero-error" role="alert">{scanError}</p>
                ) : (
                  <Link className="mx-btn mx-btn--glass mx-hero-secondary" to="/auth">Get your signature <ArrowRight size={16} /></Link>
                )}
              </>
            )}
            {phase === 'revealed' && data && (
              <div style={{ width: 'min(640px, 100%)', marginTop: 40, textAlign: 'left' }}>
                <RevealStory data={data} onCreateTwin={() => navigate('/auth')} onNotMe={handleNotMe} trackFunnel={trackFunnel} />
              </div>
            )}
          </div>
          <p className="mx-hero-caption">Private beta. Track everything, ask anything, delete anytime.</p>
        </div>
      </section>

      <section className="mx-section" id="how" aria-labelledby="mx-how-title">
        <div className="mx-wrap mx-tabs">
          <div className="mx-tabs-copy">
            <h2 id="mx-how-title" className="mx-h2 mx-reveal">Everything it reads. One portrait.</h2>
            <div className="mx-tablist mx-reveal" role="tablist" aria-label="What TwinMe does" style={{ '--d': '0.1s' } as React.CSSProperties}>
              {TABS.map((t, i) => (
                <button key={t.id} role="tab" aria-selected={i === tab} aria-controls={`mx-panel-${t.id}`} className={`mx-tab ${i === tab ? 'is-active' : ''}`} onClick={() => setTab(i)}>
                  {t.title}
                  <span className="mx-tab-body"><p>{t.body}</p></span>
                </button>
              ))}
            </div>
            <Link className="mx-link mx-tabs-link" to="/auth">Get your signature</Link>
          </div>
          <div ref={panelRef} className="mx-panel mx-reveal" style={{ '--d': '0.15s' } as React.CSSProperties}>
            {TABS.map((t, i) => (
              <video key={t.id} id={`mx-panel-${t.id}`} role="tabpanel" className={i === tab ? 'is-active' : ''} src={t.video} muted loop playsInline autoPlay={i === tab} preload={i === tab ? 'auto' : 'metadata'} aria-label={`${t.title}: product demo`} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-light" aria-labelledby="mx-notices-title">
        <div className="mx-wrap">
          <h2 id="mx-notices-title" className="mx-h2 mx-center mx-reveal" style={{ maxWidth: '18ch' }}>Not summaries. Observations, timestamped and sourced.</h2>
          <div className="mx-readings">
            {READINGS.map((r, i) => (
              <div key={r.source} className="mx-reading mx-reveal" style={{ '--d': `${0.06 * i}s` } as React.CSSProperties}>
                <small>{r.source}</small>
                <p>{r.statement}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-section" id="signatures" aria-labelledby="mx-sig-title">
        <div className="mx-wrap">
          <h2 id="mx-sig-title" className="mx-h2 mx-reveal">Five signatures. One person.</h2>
          <p className="mx-lede mx-reveal" style={{ maxWidth: 560, marginTop: 14 }}>Five experts read your data from five directions: drive, emotion, taste, people, rhythm. Each keeps its own colour.</p>
          <div className="mx-signatures">
            {SIGNATURES.map((s, i) => (
              <article key={s.key} className="mx-signature mx-reveal" style={{ '--d': `${0.05 * i}s` } as React.CSSProperties}>
                <div className="mx-illo"><img src={s.illo} alt="" loading="lazy" /></div>
                <small>{s.domain}</small>
                <h3 className="mx-h3">{s.line}</h3>
                <p className="mx-body">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-section" aria-labelledby="mx-stats-title">
        <div className="mx-wrap">
          <h2 id="mx-stats-title" className="mx-h2 mx-center mx-reveal" style={{ maxWidth: '20ch' }}>Measured, not a vibe.</h2>
          <div className="mx-stats mx-reveal" style={{ '--d': '0.1s' } as React.CSSProperties}>
            <div className="mx-stat"><strong>61%</strong><span>the twin picks the same answer its human does<sup>1</sup></span></div>
            <div className="mx-stat"><strong>6</strong><span>platforms it reads today</span></div>
            <div className="mx-stat"><strong>5</strong><span>signatures, each with its evidence</span></div>
            <div className="mx-stat"><strong>0</strong><span>models trained on your data</span></div>
          </div>
        </div>
      </section>

      <section className="mx-section" id="pricing" aria-labelledby="mx-pricing-title">
        <div className="mx-wrap">
          <div className="mx-rule" />
          <h2 id="mx-pricing-title" className="mx-h2 mx-reveal" style={{ marginTop: 56 }}>Start free. Pay for depth.</h2>
          <div className="mx-cards">
            {PLANS.map((p, i) => (
              <article key={p.name} className={`mx-card mx-reveal ${p.featured ? 'is-featured' : ''}`} style={{ '--d': `${0.06 * i}s` } as React.CSSProperties}>
                <span className="mx-body">{p.name}</span>
                <h3 className="mx-price">{p.price}<small>{p.sub}</small></h3>
                <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
                <Link className={`mx-btn ${p.featured ? 'mx-btn--primary' : 'mx-btn--glass'}`} to="/auth">{p.cta}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-section" aria-labelledby="mx-faq-title">
        <div className="mx-wrap">
          <h2 id="mx-faq-title" className="mx-h2 mx-center mx-reveal">Asked, answered.</h2>
          <div className="mx-faq mx-reveal" style={{ '--d': '0.08s' } as React.CSSProperties}>
            {FAQ.map(([q, a]) => (
              <details key={q}><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-section" aria-label="Trust">
        <div className="mx-wrap">
          <div className="mx-trust mx-reveal">
            <div><h3 className="mx-h3"><i />Your data stays yours</h3><p className="mx-body">It never leaves our infrastructure and never trains a model. You can see everything it read.</p></div>
            <div><h3 className="mx-h3"><i />Delete any of it</h3><p className="mx-body">Any memory, any connection, or everything, from Settings, whenever you like.</p></div>
            <div><h3 className="mx-h3"><i />Evidence, not adjectives</h3><p className="mx-body">Every line of the portrait points at the behaviour it came from.</p></div>
          </div>
          <div className="mx-cta">
            <div className="mx-reveal">
              <h2 className="mx-h2">Meet yourself.</h2>
              <p className="mx-body">Six platforms. Five signatures. One portrait that keeps learning.</p>
              <Link className="mx-btn mx-btn--primary" to="/auth">Get your signature</Link>
            </div>
            <div className="mx-reveal" style={{ '--d': '0.08s' } as React.CSSProperties}>
              <h2 className="mx-h2">Already have one?</h2>
              <p className="mx-body">Read today's observations, or ask your twin what changed this week.</p>
              <Link className="mx-btn mx-btn--glass" to="/auth">Log in <ArrowRight size={16} /></Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-footer">
        <div className="mx-wrap">
          <div className="mx-footer-cols">
            <div><h3>TwinMe</h3><ul><li><a href="#how">How it works</a></li><li><a href="#signatures">Signatures</a></li><li><a href="#pricing">Pricing</a></li></ul></div>
            <div><h3>Account</h3><ul><li><Link to="/auth">Log in</Link></li><li><Link to="/auth">Get your signature</Link></li><li><Link to="/waitlist">Waitlist</Link></li></ul></div>
            <div><h3>Company</h3><ul><li><Link to="/presence">Presence</Link></li><li><Link to="/terms">Terms</Link></li><li><Link to="/privacy">Privacy</Link></li></ul></div>
            <div><Link className="mx-brand" to="/"><Mark />TwinMe</Link></div>
          </div>
          <div className="mx-footnotes">
            <span>Footnotes</span>
            <p>1. Agreement between the twin's answers and its human's on 25 self-report items, measured in one session. Not a validated psychometric instrument; a working number we publish because it is the one we watch.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
