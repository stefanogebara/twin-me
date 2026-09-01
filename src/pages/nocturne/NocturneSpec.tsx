import '../../styles/nocturne.css';

/**
 * NocturneSpec — the living reference for the Nocturne design system.
 * Route: /nocturne/system. Every token and component, rendered from the same
 * CSS the product uses, annotated with its role rules. If a surface ever
 * disagrees with this page, the surface is wrong.
 */

const SURFACES = [
  ['Obsidian', '#0f1011', 'page canvas'],
  ['Abyss', '#090a0b', 'alternating bands'],
  ['Graphite', '#1c1d1f', 'elevated card'],
  ['Steel', '#2c2d2f', 'hover / pressed'],
  ['Silver', '#cacaca', 'inverted — max 1-2 per page'],
] as const;

const INKS = [
  ['Pure', '#ffffff', 'primary action fill; display on photos'],
  ['Cloud', '#fafafa', 'display + heading ink'],
  ['Ash', '#9f9fa0', 'body — never full white'],
  ['Fog', '#6a6b6b', 'muted, annotations'],
] as const;

const SIGNATURES = [
  ['Ember', '#dd8f4c', 'Motivation & Drive'],
  ['Iris', '#847dff', 'Personality & Emotion'],
  ['Verdigris', '#55a08e', 'Cultural Identity'],
  ['Orchid', '#dd90d8', 'Social Dynamics'],
  ['Periwinkle', '#90b8f0', 'Lifestyle & Rhythms'],
] as const;

const Section = ({ id, title, note, children }: { id: string; title: string; note: string; children: React.ReactNode }) => (
  <section style={{ marginBottom: 100 }} id={id}>
    <p className="n-micro" style={{ marginBottom: 8 }}>{id}</p>
    <h2 className="n-heading" style={{ marginBottom: 8 }}>{title}</h2>
    <p className="n-body n-body-sm" style={{ maxWidth: 560, marginBottom: 32 }}>{note}</p>
    {children}
  </section>
);

const Swatch = ({ name, hex, role, light }: { name: string; hex: string; role: string; light?: boolean }) => (
  <div style={{ borderRadius: 'var(--n-r-card)', overflow: 'hidden', border: '1px solid var(--n-line)' }}>
    <div style={{ background: hex, height: 96 }} />
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="n-label">{name}</span>
      <span className="n-micro">{hex}</span>
      <span className="n-body-sm" style={{ color: light ? 'var(--n-ash)' : 'var(--n-ash)' }}>{role}</span>
    </div>
  </div>
);

const NocturneSpec = () => (
  <div style={{ background: 'var(--n-obsidian)', minHeight: '100vh' }}>
    <div className="n-section" style={{ paddingTop: 100 }}>
      <header style={{ marginBottom: 100 }}>
        <p className="n-micro">TwinMe design system · v1 · 2026-09</p>
        <h1 className="n-display" style={{ margin: '16px 0' }}><em>Nocturne</em></h1>
        <p className="n-lead">A midnight gallery of the self.</p>
        <p className="n-body" style={{ maxWidth: 620, marginTop: 12 }}>
          Three voices — serif for emotion, sans for interface, mono for data. Flat
          elevation by surface step. One white action. Chromatic color only where a
          soul domain speaks. Reference: Origin Financial, adapted; audit and
          decision ledger in the PR that introduced this file.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <a className="n-btn n-btn--primary" href="/nocturne">See the flagship</a>
        </div>
      </header>

      <Section id="01" title="The five laws" note="Break one and it stops being Nocturne.">
        <ol style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 0, paddingLeft: 20 }}>
          {[
            'Elevation is a color step, never a shadow.',
            'White-on-black is the only primary action.',
            'Chromatic color exists only as signature tiles and data strokes — never text under 18px, never borders.',
            'The italic marks one word per display line: the verb of self-knowledge.',
            'Anything smaller than 13px speaks mono, uppercase, tracked.',
          ].map((law) => (
            <li key={law} className="n-body" style={{ color: 'var(--n-cloud)' }}>{law}</li>
          ))}
        </ol>
      </Section>

      <Section id="02" title="Surfaces" note="The elevation ladder. Depth is which step you stand on, not how far you float.">
        <div className="n-grid-3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {SURFACES.map(([name, hex, role]) => <Swatch key={name} name={name} hex={hex} role={role} />)}
        </div>
      </Section>

      <Section id="03" title="Ink" note="Body text never reaches full white — Ash carries prose, Cloud carries headings, Pure is saved for actions.">
        <div className="n-grid-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {INKS.map(([name, hex, role]) => <Swatch key={name} name={name} hex={hex} role={role} />)}
        </div>
      </Section>

      <Section id="04" title="The five signatures" note="One hue per reflection expert. Tile fills and data strokes only — a signature color in running text is a violation.">
        <div className="n-grid-3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {SIGNATURES.map(([name, hex, role]) => <Swatch key={name} name={name} hex={hex} role={role} />)}
        </div>
        <p className="n-micro" style={{ marginTop: 16 }}>
          Plus Signal #00b3dd — chart strokes and sparklines only.
        </p>
      </Section>

      <Section id="05" title="Typography" note="Fraunces 300 (never bolder), Inter 400/500, Roboto Mono uppercase. Three voices, no crossover.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <div>
            <p className="n-micro" style={{ marginBottom: 12 }}>display · fraunces 300 · 96/0.9 · italic verb</p>
            <p className="n-display"><em>Know</em> yourself.</p>
          </div>
          <div>
            <p className="n-micro" style={{ marginBottom: 12 }}>heading · fraunces 300 · 38/0.95</p>
            <p className="n-heading">The taste underneath your taste.</p>
          </div>
          <div>
            <p className="n-micro" style={{ marginBottom: 12 }}>lead · inter 500 · 18/1.5</p>
            <p className="n-lead">Five signatures. One person.</p>
          </div>
          <div>
            <p className="n-micro" style={{ marginBottom: 12 }}>body · inter 400 · 16/1.5 · ash</p>
            <p className="n-body" style={{ maxWidth: 560 }}>
              It reads what you actually do — the music, the hours, the work, the
              people — and builds a portrait no questionnaire could.
            </p>
          </div>
          <div>
            <p className="n-micro" style={{ marginBottom: 12 }}>label + micro · roboto mono · uppercase</p>
            <p className="n-label">SPOTIFY · 23:41 · REPEAT ×4</p>
            <p className="n-micro" style={{ marginTop: 6 }}>25 self-report items · one session · measured, not a vibe</p>
          </div>
        </div>
      </Section>

      <Section id="06" title="Controls" note="Primary is the page's brightest object. Ghost is a white-10% fill with no border. Both speak mono.">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="n-btn n-btn--primary">Get your signature</button>
          <button className="n-btn n-btn--ghost">More about the signal</button>
          <span className="n-badge">Private beta — invite only</span>
        </div>
        <div className="n-prompt" style={{ maxWidth: 560, marginTop: 32 }}>
          <input placeholder="Ask your twin anything…" aria-label="Prompt example" />
          <button aria-label="Submit">↑</button>
        </div>
        <input className="n-input" placeholder="you@example.com" style={{ marginTop: 24, width: 320 }} aria-label="Input example" />
      </Section>

      <Section id="07" title="Cards & tiles" note="Graphite for content, Silver to break the rhythm (sparingly), signature tiles for the five domains — flat chromatic panels, color is the only differentiator. Every Nocturne background is built in code; no image assets.">
        <div className="n-grid-3">
          <div className="n-card">
            <p className="n-micro" style={{ marginBottom: 8 }}>Graphite card</p>
            <p className="n-lead">A quiet module.</p>
            <p className="n-body n-body-sm" style={{ marginTop: 8 }}>Content sits a single surface step above the canvas. No shadow.</p>
          </div>
          <div className="n-card--inverted" style={{ padding: 'var(--n-card-pad)' }}>
            <p className="n-micro" style={{ marginBottom: 8, color: '#6a6b6b' }}>Silver inverted</p>
            <p className="n-lead">The rhythm break.</p>
            <p className="n-body n-body-sm" style={{ marginTop: 8 }}>One or two per page, for the stat that must land.</p>
          </div>
          <article className="n-tile n-tile--ember" style={{ minHeight: 260 }}>
            <span className="n-tile__glyph" aria-hidden="true">M</span>
            <div className="n-tile__caption">
              <p className="n-micro">Motivation & Drive</p>
              <p className="n-lead">Signature tile.</p>
            </div>
          </article>
        </div>
      </Section>

      <Section id="08" title="The reading" note="Nocturne's own component — a mono source annotation over an italic serif statement. Data becomes portrait.">
        <div className="n-reading" style={{ maxWidth: 640 }}>
          <p className="n-micro">GITHUB · 02:14 · BRANCH: still-awake</p>
          <p className="n-reading__statement">
            Your best commits happen after midnight, in bursts, alone. Rest, for you, is momentum.
          </p>
        </div>
      </Section>

      <Section id="09" title="Motion" note="0.2s ease for every state. 2.5s atmospheric ease for hero reveals. Nothing bounces, nothing loops, reduced-motion respected.">
        <div style={{ display: 'flex', gap: 16 }}>
          <button className="n-btn n-btn--ghost">Hover me — 0.2s ease</button>
        </div>
      </Section>

      <footer>
        <hr className="n-hairline" style={{ marginBottom: 24 }} />
        <p className="n-micro">
          Nocturne v1 · source: src/styles/nocturne.css · reference: Origin Financial
          (Refero extraction + live audit) · this page is the contract.
        </p>
      </footer>
    </div>
  </div>
);

export default NocturneSpec;
