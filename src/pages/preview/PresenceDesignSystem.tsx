import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronDown,
  Mic,
  Pause,
  Play,
  ShieldCheck,
} from 'lucide-react';
import '@/styles/presence-system.css';

const colors = [
  ['Paper', '#F2F0EB', 'Primary canvas'],
  ['Paper raised', '#F8F7F3', 'Cards and inputs'],
  ['Mineral', '#161714', 'Primary ink'],
  ['Graphite', '#666761', 'Secondary text'],
  ['Rule', '#D4D2CB', 'Default border'],
  ['Signal blue', '#2F35FF', 'Navigation and system state'],
  ['Voice coral', '#D75D45', 'Recording only'],
  ['Memory moss', '#66745D', 'Grounded memory'],
];

const spacing = [4, 8, 12, 16, 24, 32, 48, 64, 96];

function SystemWave({ active = false }: { active?: boolean }) {
  return (
    <div className={`ps-wave ${active ? 'is-active' : ''}`} aria-label={active ? 'Voice activity' : 'Voice waveform'}>
      {Array.from({ length: 24 }, (_, index) => (
        <span key={index} style={{ height: `${18 + ((index * 29) % 74)}%` }} />
      ))}
    </div>
  );
}

export default function PresenceDesignSystem() {
  return (
    <main className="ps-system" id="main-content">
      <header className="ps-topbar">
        <a href="/preview/presence" className="ps-brand" aria-label="Open Presence prototype">
          <span className="ps-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <strong>Presence</strong>
        </a>
        <div className="ps-topbar-title">Design system / 01</div>
        <a href="/preview/presence" className="ps-inline-link">Open product <ArrowRight size={15} /></a>
      </header>

      <aside className="ps-sidenav">
        <div className="ps-sidenav-index">00</div>
        <nav aria-label="Design system sections">
          <a href="#principles" className="is-active">Principles</a>
          <a href="#colour">Colour</a>
          <a href="#type">Typography</a>
          <a href="#space">Spacing</a>
          <a href="#borders">Borders</a>
          <a href="#controls">Controls</a>
          <a href="#voice">Voice</a>
          <a href="#provenance">Provenance</a>
        </nav>
        <p>Built for a relationship that remains human.</p>
      </aside>

      <div className="ps-system-content">
        <section className="ps-section ps-intro" id="principles">
          <div className="ps-section-number">01</div>
          <div className="ps-section-body">
            <p className="ps-kicker">Presence visual language</p>
            <h1>Quiet enough to listen. Precise enough to trust.</h1>
            <p className="ps-lede">
              Presence uses an editorial grid, visible structure and restrained signals. It should feel closer to a carefully
              kept family archive than a wellness app, chatbot, or futuristic companion.
            </p>
            <div className="ps-principle-grid">
              <article><span>01</span><h3>Structure is reassurance</h3><p>Rules, columns and labels show where information came from and what happens next.</p></article>
              <article><span>02</span><h3>Warmth lives in language</h3><p>The interface stays calm so a familiar voice, a name and a remembered detail can carry emotion.</p></article>
              <article><span>03</span><h3>Signals mean one thing</h3><p>Blue marks system state. Coral means live voice. Neither becomes decoration.</p></article>
            </div>
          </div>
        </section>

        <section className="ps-section" id="colour">
          <div className="ps-section-number">02</div>
          <div className="ps-section-body">
            <div className="ps-section-heading"><h2>Colour</h2><p>Eight tokens. One dominant canvas. Two intentional signals.</p></div>
            <div className="ps-color-grid">
              {colors.map(([name, value, use]) => (
                <article key={name}>
                  <div className="ps-swatch" style={{ background: value }} />
                  <div><strong>{name}</strong><code>{value}</code><p>{use}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ps-section" id="type">
          <div className="ps-section-number">03</div>
          <div className="ps-section-body">
            <div className="ps-section-heading"><h2>Typography</h2><p>Manrope for decisions. Newsreader for memory and voice.</p></div>
            <div className="ps-type-specimen">
              <div className="ps-type-display"><span>Display / 64</span><p>A voice she knows.</p></div>
              <div className="ps-type-title"><span>Title / 36</span><p>Forty minutes become one meaningful minute.</p></div>
              <div className="ps-type-narrative"><span>Narrative / 22</span><p>“Tell her Sunday works. I’ll come after lunch.”</p></div>
              <div className="ps-type-body"><span>Body / 15</span><p>Presence listens without rushing, then brings the important parts back to you.</p></div>
              <div className="ps-type-label"><span>Label / 11</span><p>FAMILY VERIFIED / TODAY, 4:42 PM</p></div>
            </div>
          </div>
        </section>

        <section className="ps-section" id="space">
          <div className="ps-section-number">04</div>
          <div className="ps-section-body">
            <div className="ps-section-heading"><h2>Spacing</h2><p>A four-pixel base with decisive jumps at 24, 48 and 96.</p></div>
            <div className="ps-spacing-scale">
              {spacing.map((value) => <div key={value}><span style={{ width: value }} /><code>{value}</code></div>)}
            </div>
          </div>
        </section>

        <section className="ps-section" id="borders">
          <div className="ps-section-number">05</div>
          <div className="ps-section-body">
            <div className="ps-section-heading"><h2>Borders and cards</h2><p>Soft regions with precise, concentric curves.</p></div>
            <div className="ps-card-grid">
              <article className="ps-demo-card">
                <div className="ps-card-meta"><span>For Anur</span><span>12:46 elapsed</span></div>
                <h3>“And who taught you to make the cake that way?”</h3>
                <p>Stefano’s AI presence is listening</p>
                <SystemWave active />
                <footer><Mic size={14} /> Listening patiently</footer>
              </article>
              <article className="ps-demo-card ps-demo-card--split">
                <div className="ps-card-meta"><span>For you</span><span>Today</span></div>
                <h3>Anur had a story-filled afternoon.</h3>
                <ul><li>She bought ingredients for a chocolate cake.</li><li>She wants to know whether you can visit Sunday.</li></ul>
                <footer><ShieldCheck size={14} /> Grounded in today’s conversation</footer>
              </article>
            </div>
            <div className="ps-border-notes">
              <div><span className="ps-border-sample" /><strong>1px default</strong><p>Every structural division</p></div>
              <div><span className="ps-border-sample is-strong" /><strong>1px strong</strong><p>Selected or verified state</p></div>
              <div><span className="ps-radius-sample" /><strong>10–24px radius</strong><p>Controls, fields and cards</p></div>
              <div><span className="ps-circle-sample" /><strong>Circle</strong><p>People, voice and icon actions</p></div>
            </div>
          </div>
        </section>

        <section className="ps-section" id="controls">
          <div className="ps-section-number">06</div>
          <div className="ps-section-body">
            <div className="ps-section-heading"><h2>Controls</h2><p>Curved, legible and explicit. Pills are reserved for status.</p></div>
            <div className="ps-control-row">
              <button className="ps-button ps-button--primary">Create a first presence <ArrowRight size={15} /></button>
              <button className="ps-button">Review consent</button>
              <button className="ps-button ps-button--text">Not now</button>
              <button className="ps-icon-button" aria-label="Play voice"><Play size={15} fill="currentColor" /></button>
              <button className="ps-icon-button is-active" aria-label="Pause voice"><Pause size={15} fill="currentColor" /></button>
            </div>
            <div className="ps-field-row">
              <label><span>What does she call you?</span><input defaultValue="Stéfano" /></label>
              <label><span>Your relationship</span><button>Grandmother <ChevronDown size={14} /></button></label>
            </div>
          </div>
        </section>

        <section className="ps-section" id="voice">
          <div className="ps-section-number">07</div>
          <div className="ps-section-body">
            <div className="ps-section-heading"><h2>Voice state</h2><p>Coral appears only while sound is being captured or produced.</p></div>
            <div className="ps-voice-states">
              <article><span>Idle</span><SystemWave /><p>Ready when you are</p></article>
              <article className="is-listening"><span>Listening</span><SystemWave active /><p>0:42 captured</p></article>
              <article className="is-processing"><span>Processing</span><AudioLines size={22} /><p>Measuring cadence</p></article>
              <article className="is-ready"><span>Ready</span><Check size={22} /><p>First voice available</p></article>
            </div>
          </div>
        </section>

        <section className="ps-section" id="provenance">
          <div className="ps-section-number">08</div>
          <div className="ps-section-body">
            <div className="ps-section-heading"><h2>Provenance</h2><p>The origin of a sentence is part of its visual design.</p></div>
            <div className="ps-provenance-list">
              <div><i className="is-family" /><strong>Family verified</strong><p>Written or recorded directly by Stefano.</p><span>May create a promise</span></div>
              <div><i className="is-direct" /><strong>Anur said</strong><p>Captured directly in today’s conversation.</p><span>May enter summary</span></div>
              <div><i className="is-memory" /><strong>Grounded memory</strong><p>Paraphrased from an approved family memory.</p><span>May guide a question</span></div>
              <div><i className="is-ai" /><strong>AI bridge</strong><p>Generated language used to keep conversation moving.</p><span>Cannot create a promise</span></div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
