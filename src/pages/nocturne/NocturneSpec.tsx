import { useEffect, useState } from 'react';
import { ChevronRight, Menu, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import '../../styles/money-v2.css';

/**
 * /system (and /nocturne/system): the living spec of the register, TwinMe's
 * design system since 2026-09-12. Instinct's signed-in app with the Cosmos
 * headings. Every value on this page is read live from the stylesheet
 * (src/styles/register.css) and every ratio is measured from those values in
 * the browser, so the page cannot drift from what ships. The layout is the
 * register's own: money-v2.css's frame, sections and rows, and the shared
 * shadcn controls every page uses. If a surface disagrees with this page, the
 * surface is wrong.
 *
 * Nocturne, which this route used to document, was retired the same day; its
 * --n-* names and the bridge's semantic tokens now resolve to the register.
 */

type Token = { name: string; label: string; role: string };

const GROUNDS: Token[] = [
  { name: '--rg-page', label: 'Page', role: 'Every screen' },
  { name: '--rg-white', label: 'White', role: 'A secondary button; a card until it becomes rows' },
  { name: '--rg-field', label: 'Field', role: 'An input, a pressed choice' },
];
const INKS: Token[] = [
  { name: '--rg-ink', label: 'Ink', role: 'Text, the rule over a list, the primary fill' },
  { name: '--rg-ink-2', label: 'Ink 2', role: 'The one grey line under a title' },
  { name: '--rg-ink-3', label: 'Ink 3', role: 'Quiet: empty states, names, times' },
];
const MARKS: Token[] = [
  { name: '--rg-rule', label: 'Hairline', role: 'Between rows' },
  { name: '--rg-mark', label: 'Mark', role: 'The switch off; never text' },
  { name: '--rg-quiet', label: 'Quiet grey', role: 'Disabled and decorative only; fails as text' },
];
const STATE: Token[] = [
  { name: '--rg-danger', label: 'Danger', role: 'Error text, a danger button\'s label' },
  { name: '--rg-danger-line', label: 'Danger line', role: 'A danger button\'s border' },
  { name: '--rg-ok', label: 'OK', role: 'Money in, a good state, as text' },
];
const SIGNATURES: Token[] = [
  { name: '--rg-ember', label: 'Ember', role: 'Motivation and drive' },
  { name: '--rg-iris', label: 'Iris', role: 'Personality and emotion' },
  { name: '--rg-verdigris', label: 'Verdigris', role: 'Cultural identity' },
  { name: '--rg-orchid', label: 'Orchid', role: 'Social dynamics' },
  { name: '--rg-periwinkle', label: 'Periwinkle', role: 'Lifestyle and rhythms' },
  { name: '--rg-signal', label: 'Signal', role: 'Chart strokes only' },
];
const LAYOUT: Token[] = [
  { name: '--rg-col', label: 'Column', role: 'The content column\'s width' },
  { name: '--rg-side', label: 'Sidebar', role: 'Plain text links, 80px left of the column' },
  { name: '--rg-section', label: 'Section gap', role: '56px on a phone' },
  { name: '--rg-title-to-line', label: 'Title to grey line', role: 'Then 24px to the list rule' },
  { name: '--rg-row', label: 'Row', role: 'Minimum height; padding 20 12' },
  { name: '--rg-gutter', label: 'Phone gutter', role: 'Nothing else changes size' },
];
const ALL = [...GROUNDS, ...INKS, ...MARKS, ...STATE, ...SIGNATURES, ...LAYOUT].map((t) => t.name)
  .concat(['--rg-title', '--rg-section-title', '--rg-sans', '--rg-mono']);

const SECTIONS = [
  ['colour', 'Colour'],
  ['type', 'Type'],
  ['rows', 'Rows'],
  ['controls', 'Controls'],
  ['layout', 'Layout'],
  ['rules', 'Rules'],
] as const;

/* WCAG contrast from the live values. */
const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  return h.length === 6 ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
};
const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a?: string, b?: string) => {
  const x = a && rgb(a), y = b && rgb(b);
  if (!x || !y) return null;
  const l1 = lum(x), l2 = lum(y);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const fmt = (r: number | null) => (r === null ? '' : `${r.toFixed(1)}:1`);

function useTokens() {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setValues(Object.fromEntries(ALL.map((n) => [n, cs.getPropertyValue(n).trim()])));
  }, []);
  return values;
}

const Swatch = ({ colour }: { colour: string }) => (
  <span
    aria-hidden="true"
    className="mv-icon"
    style={{ background: `var(${colour})`, boxShadow: 'inset 0 0 0 1px var(--rg-rule)' }}
  />
);

const NocturneSpec = () => {
  const v = useTokens();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const page = v['--rg-page'], white = v['--rg-white'], field = v['--rg-field'], ink = v['--rg-ink'];

  const colourRow = (t: Token, measure: string) => (
    <li key={t.name}>
      <div className="mv-item mv-item--icon mv-item--tight">
        <Swatch colour={t.name} />
        <div className="mv-item-text">
          <span className="mv-item-title">{t.label}</span>
          <span className="mv-item-sub">{v[t.name] || t.name} · {t.role}</span>
        </div>
        <span className="mv-item-end mv-quiet">{measure}</span>
      </div>
    </li>
  );

  return (
    <div className="mv">
      <div className="mv-shell">
        <aside className={`mv-side${open ? ' is-open' : ''}`}>
          <div className="mv-side-bar">
            <a href="/system" className="mv-mark" aria-label="The register">
              {Array.from({ length: 9 }).map((_, i) => <i key={i} />)}
            </a>
            <button type="button" className="mv-icon-btn mv-side-toggle" aria-expanded={open} aria-label="Sections" onClick={() => setOpen((o) => !o)}>
              <Menu size={16} aria-hidden="true" />
            </button>
          </div>
          <nav className="mv-side-links" aria-label="Sections">
            {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{label}</a>)}
          </nav>
        </aside>

        <main className="mv-col" id="main-content">
          <h1>The register</h1>
          <p className="mv-sub">TwinMe's design system since 2026-09-12. Every value is read live from register.css.</p>

          <section className="mv-section" id="colour">
            <h2>Colour</h2>
            <p className="mv-sub">One warm ink at three strengths, on three grounds. Ratios on the page / white / field.</p>
            <ul className="mv-list">
              {GROUNDS.map((t) => colourRow(t, t.name === '--rg-page' ? `ink ${fmt(ratio(ink, page))}` : `ink ${fmt(ratio(ink, v[t.name]))}`))}
              {INKS.map((t) => colourRow(t, [page, white, field].map((g) => ratio(v[t.name], g)?.toFixed(1)).join(' / ')))}
              {MARKS.map((t) => colourRow(t, fmt(ratio(v[t.name], page))))}
              {STATE.map((t) => colourRow(t, fmt(ratio(v[t.name], page))))}
            </ul>
          </section>

          <section className="mv-section" id="signatures">
            <h2>The five signatures</h2>
            <p className="mv-sub">Domain and data colour only. Strokes clear 3:1 on the page; text on a tile is ink.</p>
            <ul className="mv-list">
              {SIGNATURES.map((t) => colourRow(t, `${fmt(ratio(v[t.name], page))} · ink ${fmt(ratio(ink, v[t.name]))}`))}
            </ul>
          </section>

          <section className="mv-section" id="type">
            <h2>Type</h2>
            <p className="mv-sub">Geist throughout. Headings are Cosmos; everything else is 13px, and weight makes the hierarchy.</p>
            <ul className="mv-list">
              {[
                { sample: 'A page title', spec: `Geist 300 · ${v['--rg-title'] || ''} · line 1.0 · -0.05em`, style: { fontSize: 'var(--rg-title)', fontWeight: 300, lineHeight: 1, letterSpacing: 'var(--rg-title-track)' } },
                { sample: 'A section', spec: `Geist 400 · ${v['--rg-section-title'] || ''} · line 1.08 · -0.04em`, style: { fontSize: 'var(--rg-section-title)', fontWeight: 400, lineHeight: 1.08, letterSpacing: 'var(--rg-section-track)' } },
                { sample: 'Row title', spec: '13 / 20 · 500 · ink', style: { fontWeight: 500, lineHeight: '20px' } },
                { sample: 'The grey line under a title', spec: '13 / 19.5 · 350 · ink 2', style: { fontWeight: 350, color: 'var(--rg-ink-2)' } },
                { sample: 'Quiet, for empty states and names', spec: '13 / 19.5 · 350 · ink 3', style: { fontWeight: 350, color: 'var(--rg-ink-3)' } },
                { sample: 'tm_live_4f9a2c', spec: 'Geist Mono · only for a value to copy', style: { fontFamily: 'var(--rg-mono)', fontSize: 12 } },
              ].map((r) => (
                <li key={r.sample}>
                  <div className="mv-item">
                    <div className="mv-item-text">
                      <span style={r.style}>{r.sample}</span>
                      <span className="mv-item-sub">{r.spec}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mv-section" id="rows">
            <div className="mv-head">
              <h2>Rows, not cards</h2>
              <button type="button" className="mv-icon-btn" aria-label="Add a row (example)"><Plus size={16} aria-hidden="true" /></button>
            </div>
            <p className="mv-sub">A heading, one grey line, then rows under a 1px ink rule.</p>
            <ul className="mv-list">
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true">S</span>
                  <div className="mv-item-text">
                    <span className="mv-item-title">Spotify</span>
                    <span className="mv-item-sub">Listening, read every hour</span>
                  </div>
                  <span className="mv-item-end"><ChevronRight size={16} className="mv-chev" aria-hidden="true" /></span>
                </div>
                <ul className="mv-sublist">
                  <li>
                    <div className="mv-item mv-item--sub">
                      <div className="mv-item-text">
                        <span className="mv-item-title">stefano</span>
                        <span className="mv-item-sub">Connected in March</span>
                      </div>
                      <span className="mv-item-end"><Button variant="outline">Disconnect</Button></span>
                    </div>
                  </li>
                </ul>
              </li>
              <li>
                <div className="mv-item mv-item--icon">
                  <span className="mv-icon" aria-hidden="true">C</span>
                  <div className="mv-item-text">
                    <span className="mv-item-title">Calendar</span>
                    <span className="mv-item-sub">Not connected</span>
                  </div>
                  <span className="mv-item-end"><Button>Connect</Button></span>
                </div>
              </li>
            </ul>
            <ul className="mv-list" aria-label="An empty list">
              <li style={{ borderBottom: 0 }}><p className="mv-empty">Nothing here yet.</p></li>
            </ul>
          </section>

          <section className="mv-section" id="controls">
            <h2>Controls</h2>
            <p className="mv-sub">The shared components. 32 tall, a 4 corner; one ink primary a screen.</p>
            <ul className="mv-list">
              <li>
                <div className="mv-item">
                  <div className="mv-item-text">
                    <span className="mv-item-title">Buttons</span>
                    <span className="mv-item-sub">Primary, secondary, danger</span>
                  </div>
                  <span className="mv-item-end" style={{ flexWrap: 'wrap', whiteSpace: 'normal', gap: 8 }}>
                    <Button>Save</Button>
                    <Button variant="outline">Cancel</Button>
                    <Button variant="destructive">Delete</Button>
                  </span>
                </div>
              </li>
              <li>
                <div className="mv-item">
                  <div className="mv-item-text">
                    <span className="mv-item-title">The main call to action</span>
                    <span className="mv-item-sub">Sign-in and marketing only: 48 tall, a 12 corner</span>
                  </div>
                  <span className="mv-item-end"><Button size="lg">Continue with Google</Button></span>
                </div>
              </li>
              <li>
                <div className="mv-item">
                  <div className="mv-item-text" style={{ gap: 8 }}>
                    <label className="mv-item-title" htmlFor="system-field">Field</label>
                    <Input id="system-field" placeholder="No border, the warm box, 44 tall" />
                  </div>
                </div>
              </li>
              <li>
                <div className="mv-item">
                  <div className="mv-item-text">
                    <span className="mv-item-title">Switch</span>
                    <span className="mv-item-sub">44 by 26, ink when on</span>
                  </div>
                  <span className="mv-item-end">
                    <Switch checked={on} onCheckedChange={setOn} aria-label="Example switch, on" />
                    <Switch checked={off} onCheckedChange={setOff} aria-label="Example switch, off" />
                  </span>
                </div>
              </li>
            </ul>
          </section>

          <section className="mv-section" id="layout">
            <h2>Layout</h2>
            <p className="mv-sub">On a phone the sidebar goes behind a menu button and nothing else changes size.</p>
            <ul className="mv-list">
              {LAYOUT.map((t) => (
                <li key={t.name}>
                  <div className="mv-item mv-item--tight">
                    <div className="mv-item-text">
                      <span className="mv-item-title">{t.label}</span>
                      <span className="mv-item-sub">{t.role}</span>
                    </div>
                    <span className="mv-item-end mv-quiet">{v[t.name]}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mv-section" id="rules">
            <h2>Rules</h2>
            <p className="mv-sub">What must hold on every page.</p>
            <ul className="mv-list">
              {[
                ['Text reaches 4.5:1', '3:1 at 24px and up. Measure with scripts/audit-cosmos-ink.mjs'],
                ['Never a serif', 'Geist for everything; the heading names resolve to it'],
                ['No uppercase tracked labels', 'Labels are sentence case, a row title or a grey line'],
                ['No cards, glass, shadows or gradients', 'On app screens. Marketing pages keep their photography'],
                ['Colour only in state and domain', 'A signature is never text; state text is darkened to pass'],
                ['Very little text', 'One grey line a row, about 60 characters; a screen under 150 words'],
              ].map(([title, line]) => (
                <li key={title}>
                  <div className="mv-item mv-item--tight">
                    <div className="mv-item-text">
                      <span className="mv-item-title">{title}</span>
                      <span className="mv-item-sub">{line}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <footer className="mv-foot">
            <span>Source: src/styles/register.css</span>
            <span>Nocturne retired 2026-09-12</span>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default NocturneSpec;
