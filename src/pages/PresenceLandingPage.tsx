import { ArrowRight, Bookmark, Check, Mic, ShieldCheck, UserRound, Volume2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { List, Row, Section } from '@/components/register';
import '@/styles/register-public.css';
import '@/styles/presence-marketing.css';

/**
 * /presence — Presence's landing, in the register (src/styles/presence-marketing.css):
 * the large upright headings, sections of rows under the ink rule, one 48/12 call
 * to action. The two product devices stay as the page's one illustration, flat.
 * Every route it links to is unchanged.
 */

/** Presence's dot cluster: a 3x3 grid with the centre removed. */
function Mark() {
  return (
    <svg className="pm-mark" viewBox="0 0 28 28" fill="currentColor" aria-hidden="true">
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

const WAVE = [18, 34, 52, 27, 60, 43, 22, 57, 38, 19, 30, 46, 24];

export default function PresenceLandingPage() {
  return (
    <main className="pm" id="main-content">
      <nav className="pm-nav" aria-label="Presence navigation">
        <Link className="pm-brand" to="/presence" aria-label="Presence home">
          <Mark />
          Presence
        </Link>
        <div className="pm-links">
          <a href="#how-it-works">How it works</a>
          <a href="#trust">Trust</a>
        </div>
        <div className="pm-actions">
          <Link className="pm-link" to="/presence/login">Sign in</Link>
          <Link className="n-btn n-btn--primary" to="/presence/onboarding">Create a Presence</Link>
        </div>
      </nav>

      <header className="pm-hero">
        <div>
          <h1>More time to talk. Less distance between you.</h1>
          <p className="pm-line">
            A familiar AI voice that listens to an older adult, and a short note for the family.
          </p>
          <div className="pm-hero-actions">
            <Link className="n-btn n-btn--primary pb-cta" to="/presence/onboarding">Create a Presence</Link>
            <a className="pm-textlink" href="#how-it-works">How it works</a>
          </div>
        </div>

        <aside className="pm-stage" aria-label="Presence shown for an older adult and their family">
          <section className="pm-device pm-device--listen" aria-label="Older adult listening interface">
            <div className="pm-device-bar"><span>AI voice</span><span>Sofia’s family</span></div>
            <p className="pm-device-state">Listening</p>
            <p className="pm-device-title">Take all the time you need.</p>
            <div className="pm-wave" aria-hidden="true">
              {WAVE.map((height, index) => <i key={index} style={{ height }} />)}
            </div>
            <div className="pm-device-foot">
              <Mic size={16} aria-hidden="true" />
              <span>Conversation in progress</span>
              <span className="pb-figures" style={{ marginLeft: 'auto' }}>24:08</span>
            </div>
          </section>

          <section className="pm-device" aria-label="Family summary interface">
            <div className="pm-device-bar"><span>Presence with Sofia</span><span className="pb-figures">24 min</span></div>
            <p className="pm-device-state">What she shared</p>
            <p className="pm-device-title">A bright morning and a story from Ubatuba.</p>
            <p className="pm-device-line">She remembered learning to swim with her older sister.</p>
            <div className="pm-device-action">
              <div>
                <span className="pm-device-state">For tomorrow’s conversation</span>
                <strong>Ask who taught her to swim.</strong>
              </div>
              <button type="button" aria-label="Send note to the next conversation">
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </section>
        </aside>
      </header>

      <div className="pm-section pb-marketing" id="how-it-works">
        <Section title="A long conversation becomes one clear update." line="She talks as long as she likes. You get what needs you.">
          <List label="The family relay" className="pb-figures">
            <Row title="40:16 of her time" line="“I opened the old album and I still remember every face.”" />
            <Row title="00:45 of yours" line="She wants your help naming two people in the album." />
          </List>
        </Section>
      </div>

      <div className="pm-section pb-marketing">
        <Section title="One relationship, three moments." line="She speaks. Presence keeps what matters. You decide what comes next.">
          <List label="Product moments">
            <Row icon={<Mic />} title="The conversation" line="One clear state. No menus while she is speaking." />
            <Row icon={<Bookmark />} title="A saved memory" line="“Your mother always saved the window seat for me.”" />
            <Row icon={<Volume2 />} title="A voice she knows" line="Approved by family. Always named as AI." />
          </List>
        </Section>
      </div>

      <div className="pm-section pb-marketing" id="trust">
        <Section title="It never pretends to be a call from you." line="Visits, money, medicine and promises always need a real reply from family.">
          <List label="What Presence promises">
            <Row icon={<ShieldCheck />} title="Always says it is an AI" line="On every call." />
            <Row icon={<Check />} title="The family approves the voice" line="Every call names who did." />
            <Row icon={<UserRound />} title="Visits, money and medicine" line="Always go to a person." />
          </List>
          <div className="pm-close">
            <Link className="n-btn n-btn--primary pb-cta" to="/presence/onboarding">Begin with consent</Link>
          </div>
        </Section>
      </div>
    </main>
  );
}
