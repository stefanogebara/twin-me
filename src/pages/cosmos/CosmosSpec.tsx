import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, Mail, Music2, Plus } from 'lucide-react';
import '../../styles/presence-cosmos.css';

/**
 * /cosmos/system — the living contract of the register (2026-09-12): Instinct's
 * signed-in app, measured, with the headings kept Cosmos. Spec:
 * .claude/plans/2026-09-11-instinct-register/README.md.
 *
 * The page is built from the primitives it documents (.pc-app, the shell, sections of
 * rows) and every token is read back live from presence-cosmos.css, so it cannot
 * disagree with the stylesheet. If a surface disagrees with this page, the surface is
 * wrong.
 *
 * Was (2026-09-02): "Cosmos" — six laws, 52/16 controls, a 16px body, swatch cards,
 * glass on media as a general tool, polaroids and the film as components. Those are
 * retired, except where the marketing pages still use them; the last section says where.
 */

/* Each token names the custom property, never a hex: <TokenRow> paints its chip with
   var(token) and prints the value (and its contrast on the page) it reads back from
   the stylesheet. A token that goes missing prints "missing". */
const TOKENS = [
  ['Page', '--c-paper', "every screen's ground"],
  ['White', '--c-white', 'the secondary button'],
  ['Ink', '--c-ink', 'text, every list rule, the primary fill'],
  ['Ink 2', '--c-ink-2', 'the one grey line under a title'],
  ['Ink 3', '--c-ink-3', 'quiet: empty states, names, times'],
  ['Quiet', '--c-quiet', 'disabled and decorative marks, never text'],
  ['Ink 4', '--c-ink-4', 'rules and fills only, never text'],
  ['Hairline', '--c-hairline', 'between rows, the secondary border'],
  ['Field', '--c-field', 'the input box'],
  ['Hover', '--c-hover-secondary', 'hover on white and on rows'],
  ['Danger', '--c-danger', 'danger text'],
  ['Danger line', '--c-danger-line', 'the danger button border, never text'],
  ['Live', '--c-live', 'live state text'],
  ['Live mark', '--c-live-mark', 'live icons and borders, never text'],
] as const;

const SECTIONS = [
  ['tokens', 'Tokens'],
  ['type', 'Type'],
  ['rows', 'Rows'],
  ['controls', 'Controls'],
  ['spacing', 'Spacing'],
  ['copy', 'Copy'],
  ['marketing', 'Marketing'],
] as const;

const SPACING = [
  ['Column', '820px at most. Phones: 24px side gutters.'],
  ['Sidebar', '200px of plain links, 80px left of the column.'],
  ['Sections', '72px apart, 56 on phones. Marketing doubles it.'],
  ['Heading', '4px to its grey line, then 24px to the list rule.'],
  ['Row', 'At least 80 tall, padding 20 by 12, 16 between parts.'],
  ['Sub-row', 'Indented 50px, about 57 tall.'],
  ['Targets', 'At least 24 by 24. A 32px button already passes.'],
] as const;

const COPY = [
  ['One grey line', 'Per row, about 60 characters. Never a paragraph.'],
  ['Under 150 words a screen', 'A sign-in under 50. Count main before and after.'],
  ['Sentence case', 'No uppercase tracked labels, anywhere.'],
  ['Plain words', 'As a person would say them. No jargon.'],
  ['Say it once', 'Cut repetition and second explanations.'],
] as const;

const MARKETING = [
  ['Photography and the film', 'They stay: they are the product’s identity.'],
  ['Marketing headings', 'The hero and section sizes above. Body stays 13.'],
  ['One call to action', '48 tall, 12px corners. Everything else is 32 by 4.'],
  ['Glass only over a photograph', 'Where it keeps text readable. It must pass AA.'],
  ['Motion', '0.2s for state, 0.72s for what moves in space.'],
] as const;

type RGB = [number, number, number];
const hex = (v: string): RGB | null => {
  const m = /^#([0-9a-f]{6})$/i.exec(v.trim());
  return m ? ([0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as RGB) : null;
};
const lum = (c: RGB) => {
  const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: RGB, b: RGB) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

function TokenRow({ name, token, role }: { name: string; token: string; role: string }) {
  const ref = useRef<HTMLLIElement>(null);
  const [value, setValue] = useState('');
  const [page, setPage] = useState('');
  useLayoutEffect(() => {
    if (!ref.current) return;
    const cs = getComputedStyle(ref.current);
    setValue(cs.getPropertyValue(token).trim() || 'missing');
    setPage(cs.getPropertyValue('--c-paper').trim());
  }, [token]);
  const a = hex(value), p = hex(page);
  const ratio = token !== '--c-paper' && a && p ? `${contrast(a, p).toFixed(2)}:1` : null;
  return (
    <li className="pc-row" ref={ref}>
      <span className="pc-row-icon pc-spec-chip" style={{ background: `var(${token})` }} aria-hidden="true" />
      <div className="pc-row-text">
        <p className="pc-row-title">{name} <span className="pc-spec-token">{token}</span></p>
        <p className="pc-row-line">{[value, ratio, role].filter(Boolean).join(' · ')}</p>
      </div>
      <span />
    </li>
  );
}

function PlainRow({ title, line }: { title: string; line: string }) {
  return (
    <li className="pc-row pc-row--plain">
      <div className="pc-row-text">
        <p className="pc-row-title">{title}</p>
        <p className="pc-row-line">{line}</p>
      </div>
      <span />
    </li>
  );
}

function Head({ title, line, children }: { title: string; line: string; children?: React.ReactNode }) {
  return (
    <div className="pc-sechead">
      <h2 className="pc-sechead-title">{title}</h2>
      <p className="pc-sechead-line">{line}</p>
      {children}
    </div>
  );
}

function Mark() {
  return (
    <svg className="pc-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="5" r="2.7" /><circle cx="14" cy="5" r="2.7" /><circle cx="23" cy="5" r="2.7" /><circle cx="23" cy="14" r="2.7" />
      <circle cx="23" cy="23" r="2.7" /><circle cx="14" cy="23" r="2.7" /><circle cx="5" cy="23" r="2.7" /><circle cx="5" cy="14" r="2.7" />
    </svg>
  );
}

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

export default function CosmosSpec() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [current, setCurrent] = useState<string>('tokens');
  const [weekly, setWeekly] = useState(true);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'The register · TwinMe design system';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <main className="presence-cosmos pc-app" id="main-content">
      <div className="pc-shell">
        <div className="pc-topbar">
          <Link className="pc-side-brand" to="/" aria-label="TwinMe"><Mark /></Link>
          <button className="pc-btn pc-btn--secondary" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="spec-nav">
            Menu
          </button>
        </div>

        <aside className={`pc-side${menuOpen ? ' is-open' : ''}`} id="spec-nav">
          <Link className="pc-side-brand" to="/" aria-label="TwinMe"><Mark /></Link>
          <nav className="pc-side-nav" aria-label="The register">
            {SECTIONS.map(([id, label]) => (
              <a
                key={id}
                className="pc-side-link"
                href={`#${id}`}
                aria-current={current === id ? 'true' : undefined}
                onClick={() => { setCurrent(id); setMenuOpen(false); }}
              >
                {label}
              </a>
            ))}
          </nav>
          <nav className="pc-side-nav" aria-label="Pages">
            <Link className="pc-side-link" to="/">The front door</Link>
            <Link className="pc-side-link" to="/presence">Presence</Link>
          </nav>
        </aside>

        <div className="pc-col">
          <header className="pc-apphead">
            <h1 className="pc-apphead-title">The register.</h1>
            <p className="pc-apphead-line">Instinct’s app, with Cosmos headings. Read live from presence-cosmos.css.</p>
          </header>

          <section className="pc-appsection" id="tokens">
            <Head title="Tokens" line="A warm page, a warm ink, two greys that pass AA." />
            <ul className="pc-list">
              {TOKENS.map(([name, token, role]) => <TokenRow key={token} name={name} token={token} role={role} />)}
            </ul>
          </section>

          <section className="pc-appsection" id="type">
            <Head title="Type" line="Geist throughout. Weight makes the hierarchy, not size." />
            <ul className="pc-list">
              <li className="pc-spec-specimen">
                <p className="pc-spec-display">Know yourself.</p>
                <p className="pc-row-line">Hero, marketing · 300 · 46 to 74px · line 1.0 · −0.05em</p>
              </li>
              <li className="pc-spec-specimen">
                <p className="pc-apphead-title">Create your twin.</p>
                <p className="pc-row-line">Page title, app and sign-in · 300 · 32 to 40px · −0.05em</p>
              </li>
              <li className="pc-spec-specimen">
                <p className="pc-h2">Read the way you live.</p>
                <p className="pc-row-line">Section, marketing · 400 · 38 to 66px · line 1.08 · −0.04em</p>
              </li>
              <li className="pc-spec-specimen">
                <p className="pc-sechead-title">Her link</p>
                <p className="pc-row-line">Section, app · 400 · 28 to 38px · line 1.08 · −0.04em</p>
              </li>
              <li className="pc-spec-specimen">
                <p className="pc-row-title">Make a new link</p>
                <p className="pc-row-line">Row title · 13/20 · 500 · ink</p>
              </li>
              <li className="pc-spec-specimen">
                <p className="pc-row-line">The old one stops working.</p>
                <p className="pc-row-line">Grey line · 13/19.5 · 350 · ink 2</p>
              </li>
              <li className="pc-spec-specimen">
                <p className="pc-side-note">No calls yet.</p>
                <p className="pc-row-line">Quiet · 13/19.5 · 350 · ink 3</p>
              </li>
              <li className="pc-spec-specimen">
                <p>It reads what you do, and builds a portrait no questionnaire could.</p>
                <p className="pc-row-line">Prose, only where a paragraph is unavoidable · 13/19.5 · 400</p>
              </li>
            </ul>
          </section>

          <section className="pc-appsection" id="rows">
            <Head title="Rows, not cards" line="A heading, one grey line, then a list under a 1px ink rule.">
              <button type="button" className="pc-iconbtn pc-sechead-add" aria-label="Add, the section's one action"><Plus /></button>
            </Head>
            <ul className="pc-list">
              <li>
                <a className="pc-row pc-row--link" href="#rows">
                  <span className="pc-row-icon" aria-hidden="true"><Music2 /></span>
                  <span className="pc-row-text">
                    <span className="pc-row-title">Spotify</span>
                    <span className="pc-row-line">A row that is one link ends in a chevron.</span>
                  </span>
                  <ChevronRight className="pc-chevron" aria-hidden="true" />
                </a>
              </li>
              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><Mail /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Gmail</p>
                  <p className="pc-row-line">Or one 32px button. Never two.</p>
                </div>
                <div className="pc-row-action"><button type="button" className="pc-btn pc-btn--secondary">Manage</button></div>
              </li>
              <li className="pc-subrow">
                <div className="pc-row-text">
                  <p className="pc-row-title">you@example.com</p>
                  <p className="pc-row-line">A sub-row: an account under its service.</p>
                </div>
              </li>
            </ul>
          </section>

          <section className="pc-appsection" id="empty">
            <Head title="Notes" line="An empty list keeps its rule and says so once." />
            <ul className="pc-list" />
            <p className="pc-empty">No notes yet.</p>
          </section>

          <section className="pc-appsection" id="controls">
            <Head title="Controls" line="32 tall, 4px corners, 13px. One primary a screen." />
            <div className="pc-list">
              <div className="pc-spec-specimen">
                <div className="pc-spec-controls">
                  <button type="button" className="pc-btn pc-btn--primary">Save</button>
                  <button type="button" className="pc-btn pc-btn--secondary">Cancel</button>
                  <button type="button" className="pc-btn pc-btn--danger">Remove the voice</button>
                  <button type="button" className="pc-btn pc-btn--primary" disabled>Disabled</button>
                  <button type="button" className="pc-iconbtn" aria-label="Add"><Plus /></button>
                </div>
                <p className="pc-row-line">Primary, secondary, danger, disabled, and the 24px icon button.</p>
              </div>
              <div className="pc-spec-specimen">
                <div className="pc-spec-controls">
                  <button type="button" className="pc-btn pc-btn--cta">Continue with Google</button>
                  <a className="pc-textlink" href="#controls">How it works <ChevronRight className="pc-chevron" aria-hidden="true" /></a>
                </div>
                <p className="pc-row-line">A marketing or sign-in page’s one call to action: 48 tall, 12px corners.</p>
              </div>
              <div className="pc-spec-fields">
                <label className="pc-field">
                  <span className="pc-field-label">Email</span>
                  <input className="pc-input" type="email" placeholder="you@example.com" />
                  <span className="pc-field-hint">No border, a warm box, 44 tall.</span>
                </label>
                <label className="pc-field">
                  <span className="pc-field-label">Tone</span>
                  <span className="pc-select">
                    <select className="pc-input" defaultValue="warm">
                      <option value="warm">Warm</option>
                      <option value="plain">Plain</option>
                    </select>
                    <ChevronDown aria-hidden="true" />
                  </span>
                  <span className="pc-field-hint">A select is the same box.</span>
                </label>
              </div>
              <div className="pc-row pc-row--plain">
                <div className="pc-row-text">
                  <p className="pc-row-title">Weekly summary</p>
                  <p className="pc-row-line">A switch: 44 by 26, ink when on.</p>
                </div>
                <div className="pc-row-action">
                  <button type="button" role="switch" aria-checked={weekly} aria-label="Weekly summary" className="pc-switch" onClick={() => setWeekly((on) => !on)} />
                </div>
              </div>
            </div>
          </section>

          <section className="pc-appsection" id="spacing">
            <Head title="Spacing" line="Measured off Instinct at 1512 and 402 wide." />
            <ul className="pc-list">
              {SPACING.map(([title, line]) => <PlainRow key={title} title={title} line={line} />)}
            </ul>
          </section>

          <section className="pc-appsection" id="copy">
            <Head title="Copy" line="Very little text, and every word earns its place." />
            <ul className="pc-list">
              {COPY.map(([title, line]) => <PlainRow key={title} title={title} line={line} />)}
            </ul>
          </section>

          <section className="pc-appsection" id="marketing">
            <Head title="Marketing" line="Where the front door, Presence and TwinMe’s landing differ." />
            <ul className="pc-list">
              {MARKETING.map(([title, line]) => <PlainRow key={title} title={title} line={line} />)}
              <li className="pc-row">
                <span className="pc-row-icon" aria-hidden="true"><SignatureDots /></span>
                <div className="pc-row-text">
                  <p className="pc-row-title">Signature hues</p>
                  <p className="pc-row-line">Data only: the five dots and the demo’s bars.</p>
                </div>
                <span />
              </li>
            </ul>
            <div className="pc-spec-media">
              <img src="/images/twinme/cosmos-04-run.jpg" alt="" loading="lazy" />
              <span className="pc-glass"><Wave /> loops the same three songs before a deadline</span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
