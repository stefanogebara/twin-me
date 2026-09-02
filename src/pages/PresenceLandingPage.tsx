import { ArrowRight, ChevronDown, Play, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '@/styles/presence-cosmos.css';

/** A note typed into the nav pill survives sign-in; onboarding reads it as the first note. */
export const PRESENCE_PENDING_NOTE_KEY = 'presence-pending-note';

/**
 * /presence — landing page in the Cosmos design language (see presence-cosmos.css for
 * where each recipe came from). Built from scratch rather than restyled: the page
 * structure follows cosmos.so — pinned hero, film card, centered statements with one
 * large visual each, a giant pill CTA, a clipped wordmark — with Presence's product
 * content and imagery in place of theirs.
 *
 * Media under /images/presence/cosmos-* and /video/presence/ was generated for this
 * page (Higgsfield Soul 2.0 stills, Seedance 2.5 film) to a single brief: 35mm,
 * natural light, muted teal and warm neutrals, one consistent subject.
 */

const CHIP_NOTES = [
  'she mentioned the garden again',
  'ask who taught her to swim',
  'the album from Ubatuba',
  'she slept better on Tuesday',
];

const SEARCH_HINTS = [
  "Try 'ask her about the garden'",
  "Try 'remind her the plumber comes Thursday'",
  "Try 'tell her the baby said her name'",
];

const FAMILY_NOTES = [
  { text: 'Ask who taught her to swim. She started the story on Sunday and never finished it.', who: 'Ana, for her mother' },
  { text: 'Tell her the baby said “vovó” this morning. Twice.', who: 'Pedro, for his grandmother' },
  { text: 'The plumber comes Thursday at ten. She does not need to call anyone.', who: 'Luísa, for her father' },
  { text: 'Ask about the window seat on the train to Petrópolis. I want the whole version.', who: 'Marina, for her mother' },
  { text: 'If she brings up the pharmacy again, tell her Rafa already went.', who: 'Rafael, for his aunt' },
  { text: 'She said she was cold on Monday. Ask if the heater is working.', who: 'Ana, for her mother' },
];

/** Dot cluster mark — 3x3 grid with the center removed, per the spec; 8 dots reading
    as a tiny flower. The dot-wave hover lives in CSS. */
function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" />
      <circle cx="14" cy="5" r="2.7" />
      <circle cx="23" cy="5" r="2.7" />
      <circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" />
      <circle cx="14" cy="23" r="2.7" />
      <circle cx="5" cy="23" r="2.7" />
      <circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

/** The six colored dots Cosmos uses as its AI affordance. */
function AiDots() {
  return (
    <svg className="pc-ai-dots" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="3" r="2.1" fill="#2965f6" />
      <circle cx="16.06" cy="6.5" r="2.1" fill="#ef7759" />
      <circle cx="16.06" cy="13.5" r="2.1" fill="#f0b429" />
      <circle cx="10" cy="17" r="2.1" fill="#00af5d" />
      <circle cx="3.94" cy="13.5" r="2.1" fill="#4e3dff" />
      <circle cx="3.94" cy="6.5" r="2.1" fill="#ff66cf" />
    </svg>
  );
}

function Wave() {
  return (
    <span className="pc-wave" aria-hidden="true">
      <i /><i /><i /><i /><i />
    </span>
  );
}

/** Crossfades through a list of strings on an interval. */
function useCycle(items: string[], everyMs: number) {
  const [index, setIndex] = useState(0);
  const [out, setOut] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let swap = 0;
    const tick = window.setInterval(() => {
      setOut(true);
      swap = window.setTimeout(() => {
        setIndex((i) => (i + 1) % items.length);
        setOut(false);
      }, 360);
    }, everyMs);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(swap);
    };
  }, [items.length, everyMs]);

  return { text: items[index], out };
}

export default function PresenceLandingPage() {
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chip = useCycle(CHIP_NOTES, 2800);
  const hint = useCycle(SEARCH_HINTS, 4000);
  const [filmLoading, setFilmLoading] = useState(true);
  const navigate = useNavigate();
  const [note, setNote] = useState('');

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Presence · An AI voice companion for families';
    return () => { document.title = previousTitle; };
  }, []);

  const sendNote = (event: React.FormEvent) => {
    event.preventDefault();
    const text = note.trim();
    if (!text) return;
    try { window.sessionStorage.setItem(PRESENCE_PENDING_NOTE_KEY, text); } catch { /* private mode: the note simply is not carried */ }
    navigate('/presence/login');
  };

  // One IntersectionObserver for every [data-reveal]; the stagger comes from --d.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = root.querySelectorAll<HTMLElement>('.pc-reveal');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  const toggleFilm = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  return (
    <main ref={rootRef} className="presence-cosmos" id="main-content">
      <header className="pc-nav" aria-label="Presence navigation">
        <div className="pc-nav-left">
          <Link className="pc-brand" to="/presence" aria-label="Presence home">
            <Mark />
          </Link>
          <a className="pc-menu" href="#how">
            Menu <ChevronDown size={16} strokeWidth={2} />
          </a>
        </div>

        <form className={`pc-search ${note ? 'has-value' : ''}`} onSubmit={sendNote} aria-label="Send a note into tomorrow's conversation">
          <Search size={18} strokeWidth={1.8} aria-hidden="true" />
          <span className="pc-search-field">
            <input
              className="pc-search-input"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-label="A note for her next conversation"
              autoComplete="off"
              maxLength={280}
            />
            <span className="pc-search-text" aria-hidden="true">
              <span className={`pc-shimmer pc-cycle ${hint.out ? 'is-out' : ''}`}>{hint.text}</span>
            </span>
          </span>
          <button type="submit" className="pc-search-icons" aria-label="Send the note">
            <Wave />
            <AiDots />
          </button>
        </form>

        <div className="pc-nav-right">
          <Link className="pc-nav-login" to="/presence/login">Log in</Link>
          <Link className="pc-btn pc-btn--primary" to="/presence/onboarding">Sign up</Link>
        </div>
      </header>

      {/* Pinned hero. Everything after it scrolls up over the top. */}
      <section className="pc-hero" aria-labelledby="pc-hero-title">
        {/* Polaroid collage pinned around the centered copy — the spec's hero
            signature, and the only place the system casts shadows. */}
        <div className="pc-hero-tiles" aria-hidden="true">
          <img className="pc-tile" src="/images/presence/cosmos-01-album.jpg" alt="" style={{ left: '9%', top: '21%', width: 104, height: 104, transform: 'rotate(-5deg)' }} />
          <img className="pc-tile" src="/images/presence/cosmos-04-armchair.jpg" alt="" style={{ right: '29%', top: '10%', width: 84, height: 84, transform: 'rotate(-6deg)' }} />
          <img className="pc-tile" src="/images/presence/cosmos-03-garden.jpg" alt="" style={{ right: '8%', top: '17%', width: 132, height: 132, transform: 'rotate(4deg)' }} />
          {/* Lower tiles stay above the hero's bottom fade scrim or they render ghosted. */}
          <img className="pc-tile" src="/images/presence/cosmos-06-portrait.jpg" alt="" style={{ left: '13%', bottom: '37%', width: 88, height: 88, transform: 'rotate(3deg)' }} />
          <img className="pc-tile" src="/images/presence/cosmos-02-window.jpg" alt="" style={{ right: '11%', bottom: '35%', width: 118, height: 118, transform: 'rotate(-3deg)' }} />
          <img className="pc-tile" src="/images/presence/cosmos-07-doorway.jpg" alt="" style={{ left: '29%', top: '11%', width: 74, height: 74, transform: 'rotate(7deg)' }} />
        </div>
        <div className="pc-hero-inner">
          <p className="pc-kicker">Presence</p>
          <h1 id="pc-hero-title">More time to talk. Less distance between you.</h1>
          <div className="pc-hero-actions">
            <Link className="pc-btn pc-btn--primary" to="/presence/onboarding">Create a Presence</Link>
            <a className="pc-btn pc-btn--ghost" href="#how">How it works</a>
          </div>
        </div>
        <a className="pc-hero-film-link" href="#film">
          <Play size={14} fill="currentColor" strokeWidth={0} />
          Watch the film, with Sofia, 82
          <ChevronDown size={14} />
        </a>
      </section>

      <section className="pc-film" id="film" aria-label="The Presence film">
        <div className="pc-film-card pc-reveal" role="button" tabIndex={0} onClick={toggleFilm} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilm(); } }} aria-label="Play or pause the film">
          <video
            ref={videoRef}
            src="/video/presence/film-sofia-kitchen.mp4"
            poster="/images/presence/cosmos-film-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onPlaying={() => setFilmLoading(false)}
          />
          {/* The dot cluster holds the center of the poster until playback begins. */}
          <span className={`pc-film-dots ${filmLoading ? '' : 'is-hidden'}`} aria-hidden="true">
            <svg width="44" height="44" viewBox="0 0 28 28" fill="currentColor">
              <circle cx="5" cy="5" r="2.7" />
              <circle cx="14" cy="5" r="2.7" />
              <circle cx="23" cy="5" r="2.7" />
              <circle cx="23" cy="14" r="2.7" />
              <circle cx="23" cy="23" r="2.7" />
              <circle cx="14" cy="23" r="2.7" />
              <circle cx="5" cy="23" r="2.7" />
              <circle cx="5" cy="14" r="2.7" />
            </svg>
          </span>
          <div className="pc-film-title" aria-hidden="true">
            <span><Play fill="currentColor" strokeWidth={0} /> Watch</span>
            <span>the film</span>
          </div>
          <p className="pc-film-caption">with Sofia, 82</p>
        </div>
      </section>

      {/* Opaque sheet: from here down scrolls over the pinned hero, footer included. */}
      <div className="pc-body">
      <section className="pc-section" id="how" aria-labelledby="pc-world-title">
        <h2 className="pc-h2 pc-reveal" id="pc-world-title">Every conversation opens a family update.</h2>
        <div className="pc-strip pc-reveal" style={{ '--d': '0.1s' } as React.CSSProperties} aria-label="Photographs from a conversation, and the note it produced">
          <img className="pc-strip-a" src="/images/presence/cosmos-01-album.jpg" alt="Hands turning the pages of an old photo album" loading="lazy" />
          <img className="pc-strip-b" src="/images/presence/cosmos-02-window.jpg" alt="A kitchen window with herbs on the sill and a phone on the table" loading="lazy" />
          <img className="pc-strip-c" src="/images/presence/cosmos-03-garden.jpg" alt="Sofia kneeling in her garden" loading="lazy" />
          <div className="pc-glass" aria-live="polite">
            <Wave />
            <span className={`pc-cycle ${chip.out ? 'is-out' : ''}`}>{chip.text}</span>
          </div>
        </div>
      </section>

      <section className="pc-section pc-section--lede" aria-label="Summary">
        <p className="pc-lede pc-reveal">She talks for as long as she likes. You get one short note.</p>
      </section>

      <section className="pc-section" aria-labelledby="pc-think-title">
        <h2 className="pc-h2 pc-reveal" id="pc-think-title">Listen the way she talks.</h2>

        <div className="pc-trio">
          <article className="pc-card pc-reveal" style={{ '--d': '0.05s' } as React.CSSProperties}>
            <img src="/images/presence/cosmos-04-armchair.jpg" alt="Sofia laughing in her armchair at dusk" loading="lazy" />
            <div className="pc-glass pc-glass--big"><Wave /> 24:08</div>
          </article>

          <article className="pc-card pc-reveal" style={{ '--d': '0.12s' } as React.CSSProperties}>
            <img src="/images/presence/cosmos-05-daughter.jpg" alt="Ana reading a summary on her phone at night" loading="lazy" />
            <div className="pc-float">
              <p className="pc-float-label">Saved memory · 18:42</p>
              <blockquote>“Your mother always saved the window seat for me on the train to Petrópolis.”</blockquote>
            </div>
          </article>

          <article className="pc-card pc-reveal" style={{ '--d': '0.19s' } as React.CSSProperties}>
            <img src="/images/presence/cosmos-06-portrait.jpg" alt="A quiet portrait of Sofia" loading="lazy" />
            <div className="pc-float pc-float--center">
              <p className="pc-float-label">AI voice</p>
              <p className="pc-float-sub">Identified as AI to Sofia on every call</p>
              <div className="pc-segment" aria-hidden="true">
                <span className="is-active">Approved</span>
                <span>Identified</span>
                <span>Paused</span>
              </div>
            </div>
          </article>
        </div>

        <div className="pc-trio-captions pc-reveal" style={{ '--d': '0.15s' } as React.CSSProperties}>
          <p>In her time.</p>
          <p>In your time.</p>
          <p>And never pretending.</p>
        </div>
      </section>

      <section className="pc-section" aria-labelledby="pc-know-title">
        <div className="pc-know">
          <h2 className="pc-h2 pc-reveal" id="pc-know-title">Know who is speaking.</h2>
          <figure className="pc-know-figure pc-reveal" style={{ '--d': '0.08s' } as React.CSSProperties}>
            <img src="/images/presence/cosmos-07-doorway.jpg" alt="Sofia standing in the doorway of her house" loading="lazy" />
            <figcaption>
              Voice approved by <span className="pc-glass">Ana</span>
            </figcaption>
          </figure>
          <p className="pc-lede pc-reveal" style={{ '--d': '0.16s' } as React.CSSProperties}>
            Presence introduces itself on every call, surfacing who approved the voice, what was said, and what still needs you.
          </p>
        </div>
      </section>

      <section className="pc-section" aria-labelledby="pc-notes-title">
        <h2 className="pc-h2 pc-h2--sm pc-reveal" id="pc-notes-title">Small notes, carried into her next conversation.</h2>
        <div className="pc-marquee pc-reveal" style={{ '--d': '0.1s' } as React.CSSProperties} aria-label="Examples of notes families send">
          <div className="pc-marquee-track">
            {[...FAMILY_NOTES, ...FAMILY_NOTES].map((n, i) => (
              <div className="pc-note" key={i} aria-hidden={i >= FAMILY_NOTES.length}>
                <p>{n.text}</p>
                <span>{n.who}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pc-section pc-cta" aria-labelledby="pc-cta-title">
        <p className="pc-reveal" id="pc-cta-title">Start tonight.</p>
        <Link className="pc-cta-giant pc-reveal" style={{ '--d': '0.08s' } as React.CSSProperties} to="/presence/onboarding">
          Create a Presence
        </Link>
        <Link className="pc-btn pc-btn--canvas pc-reveal" style={{ '--d': '0.16s' } as React.CSSProperties} to="/presence/login">
          Log in <ArrowRight size={16} />
        </Link>
        <p className="pc-cta-trust pc-reveal" style={{ '--d': '0.22s' } as React.CSSProperties}>
          Always identified as AI. The family approves the voice. Visits, money and medicine always need a person.
        </p>
      </section>

      <footer className="pc-footer">
        <div className="pc-footer-row">
          <nav className="pc-footer-links" aria-label="Presence">
            <a href="#how">How it works</a>
            <a href="#film">The film</a>
            <Link to="/presence/login">Log in</Link>
          </nav>
          <Link className="pc-footer-mark" to="/presence" aria-label="Presence home">
            <Mark />
          </Link>
          <nav className="pc-footer-links" aria-label="Legal">
            <Link to="/">TwinMe</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
        <div className="pc-wordmark" aria-hidden="true">PRESENCE</div>
      </footer>
      </div>
    </main>
  );
}
