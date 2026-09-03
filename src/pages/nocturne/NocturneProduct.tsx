import { useEffect, useState } from 'react';
import '../../styles/nocturne.css';

/**
 * NocturneProduct — the product-page template, built to the reference's
 * product anatomy (audited live on useorigin.com/products/spending):
 *
 *   1. full-bleed atmospheric plate hero, unique per product, in that
 *      product's palette — badge, display with the italic verb, subhead,
 *      white CTA, prompt pill
 *   2. graphite panels, each: display + lead + a LIVE demo rendered in code
 *
 * The reference builds its demos in code too (day-of-week subscription
 * cards), not screenshots — so these are real components, not images of
 * components. Sample data is clearly illustrative, never presented as the
 * viewer's own.
 */

const Arrow = () => (
  <svg className="n-btn__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export interface ProductDemoSection {
  eyebrow: string;
  display: React.ReactNode;
  lead: string;
  body?: string;
  demo: React.ReactNode;
}

export interface NocturneProductProps {
  tint: 'ember' | 'iris' | 'verdigris' | 'orchid' | 'periwinkle';
  plate: string;
  badge: string;
  display: React.ReactNode;
  lead: string;
  body: string;
  promptPlaceholder: string;
  sections: ProductDemoSection[];
}

export const NocturneProduct = ({
  tint, plate, badge, display, lead, body, promptPlaceholder, sections,
}: NocturneProductProps) => (
  <div style={{ background: 'var(--n-obsidian)', minHeight: '100vh' }}>
    <nav className="n-nav" aria-label="Primary">
      <a href="/" className="n-label" style={{ textDecoration: 'none', letterSpacing: '0.08em' }}>TWINME</a>
      <div className="n-nav__links n-nav__links--sections">
        <a className="n-nav__link" href="/nocturne/signature">Signature</a>
        <a className="n-nav__link" href="/nocturne/twin">The Twin</a>
      </div>
      <div className="n-nav__links">
        <a className="n-nav__link n-nav__link--quiet" href="/auth">Log in</a>
        <a className="n-btn n-btn--primary" href="/auth" style={{ padding: '9px 14px' }}>Get started <Arrow /></a>
      </div>
    </nav>

    {/* Atmospheric plate hero, tinted to the product's signature */}
    <header
      className="n-atmosphere"
      style={{ ['--n-plate' as string]: `url('${plate}')` }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: `var(--n-${tint})`,
          mixBlendMode: 'soft-light', opacity: 0.5,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(9,10,11,0.55) 0%, rgba(9,10,11,0.35) 45%, var(--n-obsidian) 100%)',
        }}
      />
      <div className="n-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--n-s5)', padding: '0 24px', textAlign: 'center' }}>
        <span className="n-badge">{badge}</span>
        <h1 className="n-display" style={{ color: 'var(--n-pure)' }}>{display}</h1>
        <div>
          <p className="n-lead" style={{ color: 'var(--n-pure)' }}>{lead}</p>
          <p className="n-body" style={{ maxWidth: 500, marginTop: 8 }}>{body}</p>
        </div>
        <a className="n-btn n-btn--primary" href="/auth">Get started <Arrow /></a>
      </div>
      <div className="n-prompt n-rise n-rise--2" style={{ width: 'min(620px, calc(100% - 48px))', marginTop: 48 }}>
        <input placeholder={promptPlaceholder} aria-label="Example question for your twin" readOnly />
        <button type="button" aria-label="Ask" onClick={() => { window.location.href = '/auth'; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
      <p className="n-micro n-rise n-rise--3" style={{ marginTop: 18, color: 'rgba(255,255,255,0.55)' }}>
        Track everything · Ask anything · Delete anytime
      </p>
    </header>

    {sections.map((section, index) => (
      <section
        key={section.eyebrow}
        style={{ background: index % 2 === 1 ? 'var(--n-abyss)' : 'transparent' }}
      >
        <div className="n-section">
          <div className="n-stanza">
            <p className="n-micro">{section.eyebrow}</p>
            <h2 className="n-display-sm">{section.display}</h2>
            <p className="n-lead">{section.lead}</p>
            {section.body && <p className="n-body">{section.body}</p>}
          </div>
          {section.demo}
        </div>
      </section>
    ))}

    <section className="n-section n-stanza" style={{ marginBottom: 0 }}>
      <h2 className="n-display"><em>Meet</em> yourself.</h2>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <a className="n-btn n-btn--primary" href="/auth">Get your signature <Arrow /></a>
        <a className="n-btn n-btn--ghost" href="/nocturne">Back to overview</a>
      </div>
    </section>

    <footer className="n-section" style={{ paddingTop: 40, paddingBottom: 48 }}>
      <hr className="n-hairline" style={{ marginBottom: 28 }} />
      <p className="n-micro" style={{ maxWidth: 880 }}>
        © 2026 TwinMe Inc. Demo data on this page is illustrative and does not
        describe a real person. Your data is read, never written; nothing is used
        to train models; every memory is deletable in one click.
      </p>
    </footer>
  </div>
);

/* ── Demo primitives ─────────────────────────────────────────────────── */

/** The reading — Nocturne's signature component, animated on a timer. */
export const LiveReadings = ({ items }: { items: { source: string; statement: string }[] }) => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), 4200);
    return () => clearInterval(timer);
  }, [items.length]);
  return (
    <div className="n-card" style={{ padding: 48, minHeight: 220, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div className="n-reading" key={index} style={{ animation: 'n-rise 0.6s both' }}>
        <p className="n-micro">{items[index].source}</p>
        <p className="n-reading__statement">{items[index].statement}</p>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 32 }} aria-hidden="true">
        {items.map((item, i) => (
          <span key={item.source} style={{ height: 2, flex: 1, background: i === index ? 'var(--n-cloud)' : 'var(--n-line-strong)', transition: 'background-color .2s ease' }} />
        ))}
      </div>
    </div>
  );
};

/** Layer bars — the five-signature portrait as data, in mono. */
export const LayerBars = ({ layers }: { layers: { label: string; value: number; tint: string }[] }) => (
  <div className="n-card" style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 22 }}>
    {layers.map((layer) => (
      <div key={layer.label}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="n-micro" style={{ color: 'var(--n-ash)' }}>{layer.label}</span>
          <span className="n-label" style={{ color: 'var(--n-cloud)' }}>{layer.value}</span>
        </div>
        <div style={{ height: 3, background: 'var(--n-line-strong)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${layer.value}%`, background: `var(--n-${layer.tint})`, borderRadius: 2 }} />
        </div>
      </div>
    ))}
  </div>
);

/** A twin exchange — question in, sourced answer out. */
export const ChatDemo = ({ question, answer, sources }: { question: string; answer: string; sources: string[] }) => (
  <div className="n-card" style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 24 }}>
    <div style={{ alignSelf: 'flex-end', maxWidth: '78%', background: 'var(--n-steel)', borderRadius: '16px 16px 4px 16px', padding: '14px 18px' }}>
      <p className="n-body" style={{ color: 'var(--n-cloud)' }}>{question}</p>
    </div>
    <div style={{ alignSelf: 'flex-start', maxWidth: '86%' }}>
      <p className="n-reading__statement" style={{ fontSize: 'clamp(19px, 2.1vw, 24px)' }}>{answer}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
        {sources.map((source) => (
          <span key={source} className="n-micro" style={{ border: '1px solid var(--n-line)', borderRadius: 'var(--n-r-pill)', padding: '5px 12px', letterSpacing: '0.1em' }}>
            {source}
          </span>
        ))}
      </div>
    </div>
  </div>
);

/** Weekly rhythm — seven columns, the reference's day-card row reinterpreted. */
export const WeekRhythm = ({ days }: { days: { day: string; date: number; peak: string; load: number }[] }) => (
  <div className="n-grid-3" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
    {days.map((day) => (
      <div key={day.day} className="n-card n-card--interactive" style={{ padding: '20px 12px', textAlign: 'center' }}>
        <p className="n-micro" style={{ letterSpacing: '0.12em' }}>{day.day}</p>
        <p className="n-heading" style={{ fontSize: 26, marginTop: 4 }}>{day.date}</p>
        <div style={{ height: 64, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginTop: 14 }}>
          <div style={{ width: 6, height: `${day.load}%`, background: 'var(--n-periwinkle)', borderRadius: 3 }} />
        </div>
        <p className="n-micro" style={{ marginTop: 12, letterSpacing: '0.06em' }}>{day.peak}</p>
      </div>
    ))}
  </div>
);
