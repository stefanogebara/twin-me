import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Play, Search } from 'lucide-react';
import '../../styles/presence-cosmos.css';

/**
 * /cosmos/system — the living reference for the Cosmos design language, rendered from
 * the same stylesheet the product uses (presence-cosmos.css). Every token and component
 * here is the real class; if a surface disagrees with this page, the surface is wrong.
 *
 * Origin: cosmos.so, measured first-hand on 2026-09-02, first applied to /presence and
 * then adopted for TwinMe's front door. Geist stands in for Cosmos's licensed Oracle.
 */

const SURFACES = [
  ['Paper', '#f7f5f3', 'the canvas, never pure white'],
  ['White', '#ffffff', 'floating cards, the auth panel'],
  ['Search', '#fbfaf9', 'the search pill'],
  ['Olive', '#a6a698', 'the strip, the only colored surface'],
  ['Hover', '#e8e6e4', 'secondary hover'],
] as const;

const INKS = [
  ['Ink', '#0d0d0d', 'headings, actions, body'],
  ['Ink 2', '#6e6a69', 'ledes, secondary'],
  ['Ink 3', '#9a9796', 'placeholders, legal'],
  ['Ink 4', '#d0cdcd', 'disabled'],
  ['Border', 'rgba(13,13,13,.12)', 'the 0.5px hairline'],
] as const;

const SIGNATURES = [
  ['Ember', '#dd8f4c', 'Motivation'],
  ['Iris', '#847dff', 'Personality'],
  ['Verdigris', '#55a08e', 'Cultural'],
  ['Orchid', '#dd90d8', 'Social'],
  ['Periwinkle', '#90b8f0', 'Lifestyle'],
] as const;

const LAWS = [
  'Imagery carries all the color. The interface is paper and ink.',
  'One family, one weight for display. Display is light, never bold.',
  'Everything centered, sentence case, period-ended.',
  '16px is the radius. Photos 12, pills only for the nav, the search, glass chips and the giant CTA.',
  'Borders are 0.5px. Shadows are whispers. Nothing bounces, nothing loops.',
  'Glass only on media. Never on the canvas.',
] as const;

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

function Swatch({ name, value, role }: { name: string; value: string; role: string }) {
  return (
    <div className="pc-spec-swatch">
      <div className="pc-spec-chip" style={{ background: value }} />
      <strong>{name}</strong>
      <code>{value}</code>
      <span>{role}</span>
    </div>
  );
}

function Section({ id, n, title, note, children }: { id: string; n: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="pc-spec-section" id={id}>
      <p className="pc-spec-n">{n}</p>
      <h2 className="pc-h2 pc-h2--sm">{title}</h2>
      <p className="pc-spec-note">{note}</p>
      {children}
    </section>
  );
}

export default function CosmosSpec() {
  const [segment, setSegment] = useState(0);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Cosmos · TwinMe design system';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <main className="presence-cosmos pc-spec" id="main-content">
      <header className="pc-spec-head">
        <p className="pc-spec-n">TwinMe design system · Cosmos · 2026-09</p>
        <h1 className="pc-spec-display">Cosmos.</h1>
        <p className="pc-lede">Paper, ink, and photographs. The interface stays out of the way.</p>
        <p className="pc-spec-note">
          Lifted from cosmos.so by measurement and adapted for two products: Presence and TwinMe share
          this stylesheet, prefix and rules. Source of truth: presence-cosmos.css.
        </p>
        <div className="pc-spec-row">
          <Link className="pc-btn pc-btn--primary" to="/">The front door</Link>
          <Link className="pc-btn pc-btn--ghost" to="/presence">Presence</Link>
        </div>
      </header>

      <Section id="laws" n="01" title="The six laws." note="Break one and it stops being Cosmos.">
        <ol className="pc-spec-laws">
          {LAWS.map((law) => <li key={law}>{law}</li>)}
        </ol>
      </Section>

      <Section id="surfaces" n="02" title="Surfaces and ink." note="Five surfaces, four inks, one hairline. There is no accent color.">
        <div className="pc-spec-swatches">
          {SURFACES.map(([name, hex, role]) => <Swatch key={name} name={name} value={hex} role={role} />)}
        </div>
        <div className="pc-spec-swatches" style={{ marginTop: 16 }}>
          {INKS.map(([name, hex, role]) => <Swatch key={name} name={name} value={hex} role={role} />)}
        </div>
      </Section>

      <Section id="signatures" n="03" title="The five signatures." note="One hue per reflection expert. They appear as dots, data strokes and chart fills only. Never text, never borders, never washes.">
        <div className="pc-spec-swatches">
          {SIGNATURES.map(([name, hex, role]) => <Swatch key={name} name={name} value={hex} role={role} />)}
        </div>
        <div className="pc-spec-row" style={{ marginTop: 24, alignItems: 'center', gap: 16 }}>
          <SignatureDots />
          <span className="pc-spec-note" style={{ margin: 0 }}>The dots in the search pill are the only place all five sit together.</span>
        </div>
      </Section>

      <Section id="type" n="04" title="Typography." note="Geist for everything, light for display. Tracking tightens as size grows. Sizes below 14px do not exist.">
        <div className="pc-spec-type">
          <div>
            <p className="pc-spec-n">display · 74 / 1 · weight 300 · tracking -0.05em</p>
            <p className="pc-spec-display">Know yourself.</p>
          </div>
          <div>
            <p className="pc-spec-n">h2 · 66 / 1 · weight 400 · tracking -0.04em</p>
            <p className="pc-h2">Read the way you live.</p>
          </div>
          <div>
            <p className="pc-spec-n">h2 small · 38 / 1.05</p>
            <p className="pc-h2 pc-h2--sm">Observations, timestamped and sourced.</p>
          </div>
          <div>
            <p className="pc-spec-n">lede · 26 / 1.3 · ink 2</p>
            <p className="pc-lede">Your music, your hours, your work, your people. Connected, measured, yours.</p>
          </div>
          <div>
            <p className="pc-spec-n">body · 16 / 1.5 · tracking -0.02em</p>
            <p style={{ maxWidth: 560 }}>It reads what you actually do, the music, the hours, the work, the people, and builds a portrait no questionnaire could.</p>
          </div>
          <div>
            <p className="pc-spec-n">small · 14 and 13 · ink 2 and ink 3</p>
            <p style={{ fontSize: 14, color: 'var(--c-ink-2)' }}>Saved reading · Tuesday</p>
            <p style={{ fontSize: 13, color: 'var(--c-ink-3)' }}>By continuing you agree to the Terms and the Privacy Policy.</p>
          </div>
        </div>
      </Section>

      <Section id="controls" n="05" title="Controls." note="Black primary and 0.5px ghost as a matched pair at 52px and 16px radius. Canvas for the quiet third option. The giant pill closes a page.">
        <div className="pc-spec-row">
          <button className="pc-btn pc-btn--primary">Get your signature</button>
          <button className="pc-btn pc-btn--ghost">How it works</button>
          <button className="pc-btn pc-btn--canvas">Log in <ArrowRight size={16} /></button>
          <button className="pc-btn pc-btn--primary" disabled>Disabled</button>
        </div>
        <div className="pc-spec-row" style={{ marginTop: 24 }}>
          <button className="pc-auth-google"><span className="pc-auth-g">G</span> Continue with Google</button>
        </div>
        <div className="pc-spec-row" style={{ marginTop: 24 }}>
          <button className="pc-cta-giant">Meet yourself</button>
        </div>
      </Section>

      <Section id="search" n="06" title="The search pill." note="A near-white inset-lit pill with a shimmer placeholder, the five dots on the right. On TwinMe the field is the email and the submit is the reading.">
        <form className="pc-search" onSubmit={(e) => e.preventDefault()} style={{ maxWidth: 560 }}>
          <Search size={18} aria-hidden="true" />
          <label className="pc-search-field">
            <input className="pc-search-input" type="email" placeholder="Your email. Watch it read your public footprint" aria-label="Email" />
          </label>
          <button type="submit" className="pc-search-icons" aria-label="Read my footprint"><Wave /><SignatureDots /></button>
        </form>
        <div className="pc-spec-row" style={{ marginTop: 24 }}>
          <label className="pc-ob-field" style={{ width: 320 }}>
            <span>Field</span>
            <input placeholder="you@example.com" aria-label="Field example" />
            <small>56px, 16px radius, 0.5px border, ink on focus.</small>
          </label>
        </div>
      </Section>

      <Section id="glass" n="07" title="Glass, on media only." note="Dark glass at 20% black and blur 30 sits on photographs. The big glass holds a live readout. White cards float at 16px with a whisper shadow.">
        <div className="pc-spec-media">
          <img src="/images/twinme/cosmos-04-run.jpg" alt="" loading="lazy" />
          <span className="pc-glass"><Wave /> loops the same three songs before a deadline</span>
          <span className="pc-glass pc-glass--big"><Wave /> 05:52</span>
        </div>
        <div className="pc-spec-media pc-spec-media--tall">
          <img src="/images/twinme/cosmos-06-portrait.jpg" alt="" loading="lazy" />
          <div className="pc-float">
            <p className="pc-float-label">Your twin</p>
            <p className="pc-float-sub">Answers as you, and cites what it read</p>
            <div className="pc-segment" role="tablist" aria-label="Example segment">
              {['Cited', 'Measured', 'Yours'].map((label, i) => (
                <span key={label} role="tab" aria-selected={segment === i} className={segment === i ? 'is-active' : ''} onClick={() => setSegment(i)}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section id="cards" n="08" title="Polaroids, notes and the film." note="Photos at 12px, loosely rotated, with a whisper shadow. A note is a white card with a reading and its source line. The film card is 4:3 with a split title and a caption on a scrim.">
        <div className="pc-spec-row" style={{ alignItems: 'flex-start' }}>
          <div className="pc-spec-polaroids">
            <img src="/images/twinme/cosmos-02-records.jpg" alt="" loading="lazy" style={{ transform: 'rotate(-4deg)' }} />
            <img src="/images/twinme/cosmos-05-kitchen.jpg" alt="" loading="lazy" style={{ transform: 'rotate(3deg)' }} />
          </div>
          <article className="pc-note" style={{ width: 300 }}>
            <p>Every Tuesday ends in back-to-back calls, and every Tuesday night your music turns ambient.</p>
            <span>Google Calendar and Spotify · 14 Tuesdays</span>
          </article>
        </div>
        <div className="pc-spec-film">
          <img src="/images/twinme/cosmos-07-room.jpg" alt="" loading="lazy" />
          <div className="pc-film-title" aria-hidden="true"><span><Play fill="currentColor" strokeWidth={0} /> Watch</span><span>the film</span></div>
          <p className="pc-film-caption">with Marina, 31</p>
        </div>
      </Section>

      <Section id="motion" n="09" title="Motion." note="Two eases and nothing else. Reduced motion turns every reveal into a cut.">
        <dl className="pc-spec-motion">
          <dt>Space</dt><dd>transform 0.72s cubic-bezier(.32,.72,0,1). Tiles, the film card, anything that moves on the canvas.</dd>
          <dt>Interface</dt><dd>0.25s cubic-bezier(.22,1,.36,1). Buttons, hover, segment changes.</dd>
          <dt>Reveal</dt><dd>opacity and 24px rise, staggered 80ms per sibling through the --d custom property.</dd>
          <dt>Marquee</dt><dd>Linear, edge-faded, pauses on hover. The one permitted loop, because it is content.</dd>
        </dl>
      </Section>

      <footer className="pc-spec-foot">
        <p className="pc-spec-note">Rendered from presence-cosmos.css. Nocturne, the previous system, is retired for marketing surfaces and stays browsable at /nocturne/system.</p>
      </footer>
    </main>
  );
}
