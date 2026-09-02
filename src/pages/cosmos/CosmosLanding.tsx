import { ArrowRight, ChevronDown, Play, Search } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { discoveryScan, type QuickEnrichmentData } from '../../services/enrichmentService';
import { useAnalytics } from '../../contexts/AnalyticsContext';
import RevealStory from '../../components/landing/RevealStory';
import '../../styles/presence-cosmos.css';

/**
 * / — TwinMe in the Cosmos design language, built from the same components as
 * /presence (presence-cosmos.css, the `pc-*` vocabulary, the `presence-cosmos` root
 * class that scopes it). Nothing here is restyled: same nav, search pill, pinned hero
 * with polaroid tiles, film card, centered statements, strip, trio, know, marquee,
 * giant CTA, clipped wordmark. Only the content and the photographs are TwinMe's.
 *
 * Structure follows cosmos.so as read live on 2026-09-02 (1440): sticky hero with
 * scattered tiles fading into a paper scrim; "Watch our new film" link; the film card
 * scrolling over the hero; "Every search opens a new world." + olive strip; a lede;
 * "Search the way you think." + trio with floating UI + one-line captions; "Know what
 * you're looking at." right/portrait/left; logo strip; scattered-tile CTA with a giant
 * pill; footer links, mark, giant wordmark.
 *
 * The acquisition flow is unchanged: the nav pill takes the email -> discoveryScan ->
 * RevealStory in the hero -> /auth with the reading in sessionStorage.
 *
 * Media under /images/twinme/ was generated to the Presence brief (35mm, natural
 * light, muted teal and warm neutrals, one consistent subject).
 */

const SEARCH_HINTS = [
  'Your email. Watch it read your public footprint',
  "Try 'why do Tuesdays drain me?'",
  "Try 'what do I return to at 2am?'",
];

const CHIP_READINGS = [
  'loops the same three songs before a deadline',
  'Tuesdays cost the most',
  'best commits after midnight, alone',
  'never keeps four people waiting',
];

const SCAN_STATUS_LINES = [
  'Scanning your public footprint',
  'Reading what you build and publish',
  'Piecing together your story',
  'Writing your first portrait',
];

const NOTES = [
  { text: 'You loop the same three songs when a deadline is close. Focus, for you, sounds like ritual.', who: 'Spotify · 23:41 · repeat ×4' },
  { text: 'Every Tuesday ends in back-to-back calls, and every Tuesday night your music turns ambient.', who: 'Calendar · Tuesdays · 6 weeks' },
  { text: 'Your best commits happen after midnight, in bursts, alone. Rest, for you, is momentum.', who: 'GitHub · 02:14 · branch: still-awake' },
  { text: 'You reply to four people within minutes and let everyone else wait a day. They are the same four every month.', who: 'Gmail · reply latency' },
  { text: 'Recovery is lowest on Wednesdays. The runs are on Thursdays. You already knew.', who: 'Whoop · 8 weeks' },
  { text: 'At 2am you watch the same documentary channel you never mention to anyone.', who: 'YouTube · late' },
];

const IMG = {
  desk: '/images/twinme/cosmos-01-desk.jpg',
  records: '/images/twinme/cosmos-02-records.jpg',
  calendar: '/images/twinme/cosmos-03-calendar.jpg',
  run: '/images/twinme/cosmos-04-run.jpg',
  kitchen: '/images/twinme/cosmos-05-kitchen.jpg',
  portrait: '/images/twinme/cosmos-06-portrait.jpg',
  room: '/images/twinme/cosmos-07-room.jpg',
};

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" /><circle cx="14" cy="5" r="2.7" /><circle cx="23" cy="5" r="2.7" /><circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" /><circle cx="14" cy="23" r="2.7" /><circle cx="5" cy="23" r="2.7" /><circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

/** The five signature hues, the way Cosmos uses six colored dots as its AI affordance. */
function SignatureDots() {
  return (
    <svg className="pc-ai-dots" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="3" r="2.1" fill="#dd8f4c" />
      <circle cx="16.66" cy="7.84" r="2.1" fill="#847dff" />
      <circle cx="14.12" cy="15.66" r="2.1" fill="#55a08e" />
      <circle cx="5.88" cy="15.66" r="2.1" fill="#dd90d8" />
      <circle cx="3.34" cy="7.84" r="2.1" fill="#90b8f0" />
    </svg>
  );
}

function Wave() {
  return <span className="pc-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>;
}

function useCycle(items: readonly string[], everyMs: number) {
  const [index, setIndex] = useState(0);
  const [out, setOut] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let swap = 0;
    const tick = window.setInterval(() => {
      setOut(true);
      swap = window.setTimeout(() => { setIndex((i) => (i + 1) % items.length); setOut(false); }, 360);
    }, everyMs);
    return () => { window.clearInterval(tick); window.clearTimeout(swap); };
  }, [items.length, everyMs]);
  return { text: items[index], out };
}

export default function CosmosLanding() {
  const navigate = useNavigate();
  const { trackFunnel } = useAnalytics();
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hint = useCycle(SEARCH_HINTS, 4000);
  const chip = useCycle(CHIP_READINGS, 2800);
  const [filmLoading, setFilmLoading] = useState(true);
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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>('.pc-reveal');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { nodes.forEach((n) => n.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { (e.target as HTMLElement).classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

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

  const toggleFilm = () => {
    const v = videoRef.current;
    if (!v || !v.getAttribute('src')) return;
    if (v.paused) void v.play(); else v.pause();
  };

  return (
    <main ref={rootRef} className="presence-cosmos" id="main-content">
      <header className="pc-nav" aria-label="Primary">
        <div className="pc-nav-left">
          <Link className="pc-brand" to="/" aria-label="TwinMe home"><Mark /></Link>
          <a className="pc-menu" href="#how">Menu <ChevronDown size={16} strokeWidth={2} /></a>
        </div>

        {/* Cosmos's search pill carries TwinMe's one input: the email that gets read. */}
        <form className={`pc-search ${email ? 'has-value' : ''}`} onSubmit={handleScan} aria-label="Read your public footprint">
          <Search size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="pc-search-field">
            <input className="pc-search-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email address for a public reading" autoComplete="email" disabled={phase === 'scanning'} />
            <span className="pc-search-text" aria-hidden="true"><span className={`pc-shimmer pc-cycle ${hint.out ? 'is-out' : ''}`}>{hint.text}</span></span>
          </span>
          <button type="submit" className="pc-search-icons" aria-label="Read my footprint"><Wave /><SignatureDots /></button>
        </form>

        <div className="pc-nav-right">
          <Link className="pc-nav-login" to="/auth">Log in</Link>
          <Link className="pc-btn pc-btn--primary" to="/auth">Sign up</Link>
        </div>
      </header>

      <section className="pc-hero" aria-labelledby="pc-hero-title">
        <div className="pc-hero-tiles" aria-hidden="true">
          <img className="pc-tile" src={IMG.records} alt="" style={{ left: '9%', top: '21%', width: 104, height: 104, transform: 'rotate(-5deg)' }} />
          <img className="pc-tile" src={IMG.calendar} alt="" style={{ right: '29%', top: '10%', width: 84, height: 84, transform: 'rotate(-6deg)' }} />
          <img className="pc-tile" src={IMG.run} alt="" style={{ right: '8%', top: '17%', width: 132, height: 132, transform: 'rotate(4deg)' }} />
          <img className="pc-tile" src={IMG.portrait} alt="" style={{ left: '13%', bottom: '37%', width: 88, height: 88, transform: 'rotate(3deg)' }} />
          <img className="pc-tile" src={IMG.desk} alt="" style={{ right: '11%', bottom: '35%', width: 118, height: 118, transform: 'rotate(-3deg)' }} />
          <img className="pc-tile" src={IMG.kitchen} alt="" style={{ left: '29%', top: '11%', width: 74, height: 74, transform: 'rotate(7deg)' }} />
        </div>
        <div className="pc-hero-inner">
          <p className="pc-kicker">TwinMe</p>
          <h1 id="pc-hero-title">Know yourself.</h1>
          {phase !== 'revealed' && (
            <>
              <div className="pc-hero-actions">
                <Link className="pc-btn pc-btn--primary" to="/auth">Get your signature</Link>
                <a className="pc-btn pc-btn--ghost" href="#how">How it works</a>
              </div>
              <p className="pc-cta-trust" aria-live="polite" style={{ marginTop: 22 }}>
                {phase === 'scanning' ? SCAN_STATUS_LINES[statusIdx] : scanError || 'Your soul signature, measured from what you actually do.'}
              </p>
            </>
          )}
          {phase === 'revealed' && data && (
            <div style={{ width: 'min(640px, calc(100vw - 48px))', marginTop: 8, textAlign: 'left' }}>
              <RevealStory data={data} onCreateTwin={() => navigate('/auth')} onNotMe={handleNotMe} trackFunnel={trackFunnel} />
            </div>
          )}
        </div>
        <a className="pc-hero-film-link" href="#film">
          <Play size={14} fill="currentColor" strokeWidth={0} />
          Watch the film, with Marina, 31
          <ChevronDown size={14} />
        </a>
      </section>

      <section className="pc-film" id="film" aria-label="The TwinMe film">
        <div className="pc-film-card pc-reveal" role="button" tabIndex={0} onClick={toggleFilm} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilm(); } }} aria-label="Play or pause the film">
          <video ref={videoRef} poster={IMG.room} muted loop playsInline preload="metadata" onPlaying={() => setFilmLoading(false)} />
          <span className={`pc-film-dots ${filmLoading ? '' : 'is-hidden'}`} aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 28 28" fill="currentColor">
              <circle cx="5" cy="5" r="2.7" /><circle cx="14" cy="5" r="2.7" /><circle cx="23" cy="5" r="2.7" /><circle cx="23" cy="14" r="2.7" />
              <circle cx="23" cy="23" r="2.7" /><circle cx="14" cy="23" r="2.7" /><circle cx="5" cy="23" r="2.7" /><circle cx="5" cy="14" r="2.7" />
            </svg>
          </span>
          <div className="pc-film-title" aria-hidden="true"><span><Play fill="currentColor" strokeWidth={0} /> Watch</span><span>the film</span></div>
          <p className="pc-film-caption">with Marina, 31</p>
        </div>
      </section>

      <div className="pc-body">
        <section className="pc-section" id="how" aria-labelledby="pc-world-title">
          <h2 className="pc-h2 pc-reveal" id="pc-world-title">Every signal opens a new reading.</h2>
          <div className="pc-strip pc-reveal" style={{ '--d': '0.1s' } as React.CSSProperties} aria-label="Photographs from a week, and the reading they produced">
            <img className="pc-strip-a" src={IMG.desk} alt="Marina at her desk late at night with headphones on" loading="lazy" />
            <img className="pc-strip-b" src={IMG.records} alt="A hand pulling a record from a shelf" loading="lazy" />
            <img className="pc-strip-c" src={IMG.calendar} alt="A wall calendar with a Tuesday crossed out" loading="lazy" />
            <div className="pc-glass" aria-live="polite"><Wave /><span className={`pc-cycle ${chip.out ? 'is-out' : ''}`}>{chip.text}</span></div>
          </div>
        </section>

        <section className="pc-section pc-section--lede" aria-label="Summary">
          <p className="pc-lede pc-reveal">Your music, your hours, your work, your people. Connected, measured, yours.</p>
        </section>

        <section className="pc-section" aria-labelledby="pc-think-title">
          <h2 className="pc-h2 pc-reveal" id="pc-think-title">Read the way you live.</h2>
          <div className="pc-trio">
            <article className="pc-card pc-reveal" style={{ '--d': '0.05s' } as React.CSSProperties}>
              <img src={IMG.run} alt="Marina running along a river at dawn" loading="lazy" />
              <div className="pc-glass pc-glass--big"><Wave /> 05:52</div>
            </article>
            <article className="pc-card pc-reveal" style={{ '--d': '0.12s' } as React.CSSProperties}>
              <img src={IMG.kitchen} alt="Marina on her kitchen floor with a coffee in the morning" loading="lazy" />
              <div className="pc-float">
                <p className="pc-float-label">Saved reading · Tuesday</p>
                <blockquote>“Every Tuesday ends in back-to-back calls, and every Tuesday night your music turns ambient.”</blockquote>
              </div>
            </article>
            <article className="pc-card pc-reveal" style={{ '--d': '0.19s' } as React.CSSProperties}>
              <img src={IMG.portrait} alt="Marina at her window at blue hour, lit by a lamp" loading="lazy" style={{ objectPosition: '50% 100%' }} />
              <div className="pc-float pc-float--center">
                <p className="pc-float-label">Your twin</p>
                <p className="pc-float-sub">Answers as you, and cites what it read</p>
                <div className="pc-segment" aria-hidden="true"><span className="is-active">Cited</span><span>Measured</span><span>Yours</span></div>
              </div>
            </article>
          </div>
          <div className="pc-trio-captions pc-reveal" style={{ '--d': '0.15s' } as React.CSSProperties}>
            <p>From behaviour.</p>
            <p>With evidence.</p>
            <p>And never from a quiz.</p>
          </div>
        </section>

        <section className="pc-section" aria-labelledby="pc-know-title">
          <div className="pc-know">
            <h2 className="pc-h2 pc-reveal" id="pc-know-title">Know what you're made of.</h2>
            <figure className="pc-know-figure pc-reveal" style={{ '--d': '0.08s' } as React.CSSProperties}>
              <img src={IMG.room} alt="Marina's living room at dusk" loading="lazy" />
              <figcaption>Read from <span className="pc-glass">6 sources</span></figcaption>
            </figure>
            <p className="pc-lede pc-reveal" style={{ '--d': '0.16s' } as React.CSSProperties}>
              TwinMe reads your data from five directions, surfacing the pattern, the source, and the story.
            </p>
          </div>
        </section>

        <section className="pc-section" aria-labelledby="pc-notes-title">
          <h2 className="pc-h2 pc-h2--sm pc-reveal" id="pc-notes-title">Observations, timestamped and sourced.</h2>
          <div className="pc-marquee pc-reveal" style={{ '--d': '0.1s' } as React.CSSProperties} aria-label="Examples of readings">
            <div className="pc-marquee-track">
              {[...NOTES, ...NOTES].map((n, i) => (
                <div className="pc-note" key={i} aria-hidden={i >= NOTES.length}><p>{n.text}</p><span>{n.who}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section className="pc-section pc-cta" aria-labelledby="pc-cta-title">
          <p className="pc-reveal" id="pc-cta-title">Meet yourself.</p>
          <Link className="pc-cta-giant pc-reveal" style={{ '--d': '0.08s' } as React.CSSProperties} to="/auth">Get your signature</Link>
          <Link className="pc-btn pc-btn--canvas pc-reveal" style={{ '--d': '0.16s' } as React.CSSProperties} to="/auth">Log in <ArrowRight size={16} /></Link>
          <p className="pc-cta-trust pc-reveal" style={{ '--d': '0.22s' } as React.CSSProperties}>
            Six platforms. Five signatures. Your data never trains a model, and you can delete any of it.
          </p>
        </section>

        <footer className="pc-footer">
          <div className="pc-footer-row">
            <nav className="pc-footer-links" aria-label="TwinMe">
              <a href="#how">How it works</a>
              <a href="#film">The film</a>
              <Link to="/pricing">Pricing</Link>
            </nav>
            <Link className="pc-footer-mark" to="/" aria-label="TwinMe home"><Mark /></Link>
            <nav className="pc-footer-links" aria-label="Legal">
              <Link to="/presence">Presence</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/privacy">Privacy</Link>
            </nav>
          </div>
          <div className="pc-wordmark" aria-hidden="true">TWINME</div>
        </footer>
      </div>
    </main>
  );
}
