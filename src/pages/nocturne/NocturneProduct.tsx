import type { ReactNode } from 'react';
import { Section, List, Row } from '@/components/register';
import '../../styles/nocturne.css';
import '../../styles/register-public.css';
import '../../styles/front-door.css';

/**
 * NocturneProduct — the product-page template (/nocturne/signature,
 * /nocturne/twin), in the register at the front door's level
 * (src/styles/front-door.css):
 *
 *   1. the product's photograph as the hero, under a flat dark scrim that buys
 *      the white type its contrast: a title, one line, the 48/12 call to
 *      action and the example question
 *   2. sections of a heading, one grey line and a demo rendered in code as
 *      rows under a 1px ink rule. No cards, no eyebrows, no italic.
 *
 * Sample data is clearly illustrative, never presented as the viewer's own.
 */

export interface ProductDemoSection {
  id: string;
  title: string;
  line: string;
  demo: ReactNode;
}

export interface NocturneProductProps {
  plate: string;
  badge: string;
  title: string;
  line: string;
  promptPlaceholder: string;
  sections: ProductDemoSection[];
}

/* The scrim rides in the plate's own stack: a flat layer of the old obsidian
   at 45% over the photograph, so white type holds wherever it falls. */
const scrimmed = (plate: string) =>
  `linear-gradient(rgb(9 10 11 / 0.45), rgb(9 10 11 / 0.45)), url('${plate}')`;

export const NocturneProduct = ({
  plate, badge, title, line, promptPlaceholder, sections,
}: NocturneProductProps) => (
  <div className="fd">
    <nav className="n-nav" aria-label="Primary">
      <a href="/" className="n-label" aria-label="TwinMe home" style={{ textDecoration: 'none', letterSpacing: '0.08em' }}>TWINME</a>
      <div className="n-nav__links n-nav__links--sections">
        <a className="n-nav__link" href="/nocturne/signature">Signature</a>
        <a className="n-nav__link" href="/nocturne/twin">The twin</a>
      </div>
      <div className="n-nav__links">
        <a className="n-nav__link n-nav__link--quiet" href="/auth">Log in</a>
        <a className="n-btn n-btn--primary" href="/auth">Get started</a>
      </div>
    </nav>

    <header className="n-atmosphere fd-hero--product" style={{ ['--n-plate' as string]: scrimmed(plate) }}>
      <div className="n-rise fd-hero-copy">
        <span className="n-badge">{badge}</span>
        <h1 className="n-display">{title}</h1>
        <p className="n-lead">{line}</p>
        <a className="n-btn n-btn--primary pb-cta" href="/auth">Get started</a>
      </div>
      <div className="n-prompt n-rise n-rise--2 fd-prompt">
        <input placeholder={promptPlaceholder} aria-label="Example question for your twin" readOnly />
        <button type="button" aria-label="Ask" onClick={() => { window.location.href = '/auth'; }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
    </header>

    {sections.map((section) => (
      <div key={section.id} className="n-section pb-marketing">
        <Section title={section.title} line={section.line}>
          {section.demo}
        </Section>
      </div>
    ))}

    <div className="n-section fd-close">
      <h2 className="n-display">Meet yourself.</h2>
      <div className="fd-close-actions">
        <a className="n-btn n-btn--primary pb-cta" href="/auth">Get your signature</a>
        <a className="n-btn n-btn--ghost" href="/nocturne">Back to overview</a>
      </div>
    </div>

    <footer className="n-section fd-foot">
      <p className="n-micro">
        © 2026 TwinMe Inc. The examples on this page are illustrative and describe no real person.
      </p>
    </footer>
  </div>
);

/* ── Demo primitives: rows under the ink rule ─────────────────────────── */

/** Readings: each observation over the source it came from. */
export const Readings = ({ items }: { items: { source: string; statement: string }[] }) => (
  <List label="Example readings">
    {items.map((item) => <Row key={item.source} title={item.statement} line={item.source} />)}
  </List>
);

/** Plain rows: a title and one grey line each. */
export const Rows = ({ items, label }: { items: { title: string; line: string }[]; label: string }) => (
  <List label={label}>
    {items.map((item) => <Row key={item.title} title={item.title} line={item.line} />)}
  </List>
);

/** The five signatures as data: a row each, its score, and a thin bar in its hue. */
export const LayerBars = ({ layers }: { layers: { label: string; value: number; tint: string }[] }) => (
  <ul className="rg-list pb-figures" aria-label="Example signature scores">
    {layers.map((layer) => (
      <li key={layer.label} className="rg-row rg-row--plain">
        <span className="rg-row-text">
          <span className="rg-row-title">{layer.label}</span>
          <span className="fd-bar" aria-hidden="true">
            <i style={{ width: `${layer.value}%`, background: `var(--rg-${layer.tint})` }} />
          </span>
        </span>
        <span className="rg-row-action">{layer.value}</span>
      </li>
    ))}
  </ul>
);

/** A twin exchange: the question as a row, the sourced answer as the one paragraph. */
export const ChatDemo = ({ question, answer, sources }: { question: string; answer: string; sources: string }) => (
  <ul className="rg-list" aria-label="An example exchange">
    <Row title="You asked" line={question} />
    <li className="fd-answer">
      <span className="rg-row-title">Your twin</span>
      <p className="fd-answer-text">{answer}</p>
      <p className="rg-row-line">{sources}</p>
    </li>
  </ul>
);

/** A week: seven columns under the ink rule, the load as a bar in the lifestyle hue. */
export const WeekRhythm = ({ days }: { days: { day: string; date: number; peak: string; load: number }[] }) => (
  <div className="fd-week" role="list" aria-label="An example week">
    {days.map((day) => (
      <div key={day.day} className="fd-day" role="listitem">
        <span className="fd-day-name">{day.day}</span>
        <span className="fd-day-date">{day.date}</span>
        <span className="fd-day-bar" aria-hidden="true"><i style={{ height: `${day.load}%` }} /></span>
        <span className="fd-day-peak">{day.peak}</span>
      </div>
    ))}
  </div>
);
