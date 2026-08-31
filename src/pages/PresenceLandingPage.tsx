import { ArrowRight, Check, Mic, ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '@/styles/presence-marketing.css';

export default function PresenceLandingPage() {
  const pipoPhoneRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const phone = pipoPhoneRef.current;
    if (!phone) return;

    const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.305'/%3E%3C/svg%3E")`;
    const anchors = [[68.1, 46.03], [25.17, 75.99], [53.11, 12.71]] as const;
    // Static phases derived once from seed 1. They never change during animation.
    const phases = [[0.73, 2.11], [2.67, 4.02], [4.41, 5.38]] as const;
    const colors = [
      ['230, 176, 147', 10.28, 20.55, 30.83, 41.1],
      ['163, 206, 255', 11.15, 22.3, 33.45, 44.6],
      ['250, 249, 239', 16.66, 33.33, 49.99, 66.65],
    ] as const;
    const amount = 0.72;

    const paint = (phase: number) => {
      const blobs = anchors.map(([anchorX, anchorY], index) => {
        const [p, p2] = phases[index];
        const x = anchorX + (Math.sin(phase * 0.55 + p) - Math.sin(p)) * 14 * amount;
        const y = anchorY + (Math.sin(phase * 0.43 + p2) - Math.sin(p2)) * 14 * amount;
        const [rgb, stop1, stop2, stop3, stop4] = colors[index];
        return `radial-gradient(circle at ${x}% ${y}%, rgba(${rgb}, 1) 0%, rgba(${rgb}, 0.844) ${stop1}%, rgba(${rgb}, 0.5) ${stop2}%, rgba(${rgb}, 0.156) ${stop3}%, rgba(${rgb}, 0) ${stop4}%)`;
      });
      phone.style.backgroundImage = [grain, ...blobs].join(', ');
    };

    paint(0);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const startedAt = performance.now();
    let frameId = 0;
    const animate = (now: number) => {
      const elapsedSeconds = (now - startedAt) / 1000;
      const phase = elapsedSeconds * 0.86;
      paint(phase);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return (
    <main className="presence-marketing" id="main-content">
      <nav className="presence-marketing-nav" aria-label="Presence navigation">
        <Link className="presence-marketing-brand" to="/presence" aria-label="Presence home">
          <span className="presence-marketing-mark" aria-hidden="true" />
          Presence
        </Link>
        <div className="presence-marketing-links">
          <a href="#how-it-works">How it works</a>
          <a href="#trust">Trust</a>
        </div>
        <div className="presence-marketing-actions">
          <Link className="presence-link-button" to="/presence/login">Sign in</Link>
          <Link className="presence-dark-button" to="/presence/onboarding">Create a Presence <ArrowRight size={15} /></Link>
        </div>
      </nav>

      <section className="presence-hero">
        <div className="presence-hero-copy">
          <p className="presence-kicker">An AI voice companion for families</p>
          <h1>More time to talk. Less distance between you.</h1>
          <p className="presence-hero-lede">
            Presence gives an older adult a familiar AI voice that listens patiently. Their family receives grounded summaries, memories and requests—and can reply in seconds.
          </p>
          <div className="presence-hero-actions">
            <Link className="presence-dark-button presence-dark-button--large" to="/presence/onboarding">Create a first Presence <ArrowRight size={16} /></Link>
            <a className="presence-text-link" href="#how-it-works">See how the family relay works</a>
          </div>
          <div className="presence-hero-facts">
            <span><Check size={14} /> Familiar, clearly identified AI voice</span>
            <span><Check size={14} /> Private family summaries</span>
            <span><Check size={14} /> Only family makes promises</span>
          </div>
        </div>

        <aside className="presence-hero-stage" aria-label="Presence shown for an older adult and their family">
          <div className="presence-stage-meta"><span>Two people</span><span>One continuous relationship</span></div>
          <section ref={pipoPhoneRef} className="presence-listener-device" aria-label="Older adult listening interface">
            <header><span className="presence-console-dot" aria-hidden="true" /><span>AI voice · Sofia’s family</span></header>
            <div>
              <p>Listening</p>
              <h2>Take all the<br />time you need.</h2>
              <div className="presence-device-wave" aria-hidden="true">
                {[18, 34, 52, 27, 68, 43, 22, 57, 38, 19].map((height, index) => <i key={index} style={{ height }} />)}
              </div>
            </div>
            <footer><Mic size={17} /><span>Conversation in progress</span><strong>24:08</strong></footer>
          </section>

          <section className="presence-family-device" aria-label="Family summary interface">
            <header><div><strong>Presence with Sofia</strong><span>Today’s update</span></div><span>24 min</span></header>
            <div className="presence-family-summary">
              <span>What she shared</span>
              <h2>A bright morning and a story from Ubatuba.</h2>
              <p>She sounded energized after her walk and remembered learning to swim with her older sister.</p>
            </div>
            <div className="presence-family-action">
              <div><span>Send into tomorrow’s conversation</span><strong>Ask who taught her to swim.</strong></div>
              <button type="button" aria-label="Send note to the next conversation"><ArrowRight size={17} /></button>
            </div>
            <footer><span>Summary grounded in 24:08 of conversation</span><span>Private to family</span></footer>
          </section>
        </aside>

      </section>

      <section className="presence-relay-explainer" id="how-it-works">
        <div className="presence-section-intro">
          <p className="presence-kicker">The family relay</p>
          <h2>A patient conversation becomes a useful family update.</h2>
        </div>
        <div className="presence-relay-map" aria-label="A long conversation becomes one clear family action">
          <div className="presence-relay-origin">
            <div className="presence-relay-time"><strong>40:16</strong><span>Her time</span></div>
            <blockquote>“I opened the old album and realized I still remember every face…”</blockquote>
          </div>
          <div className="presence-relay-thread" aria-hidden="true">
            <span /><span /><span /><span /><span /><span /><span />
          </div>
          <div className="presence-relay-result">
            <div className="presence-relay-time"><strong>00:45</strong><span>Your time</span></div>
            <div className="presence-relay-decision">
              <span>What needs you</span>
              <strong>She wants your help naming two people in the album.</strong>
              <p>You receive the specific request with enough context to answer thoughtfully.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="presence-product-lab" aria-labelledby="presence-product-lab-title">
        <header className="presence-product-lab-header">
          <div>
            <p className="presence-kicker">The product, in motion</p>
            <h2 id="presence-product-lab-title">One relationship. Three clear product moments.</h2>
          </div>
          <p>The older adult speaks. Presence preserves what matters. The family sees what happened and decides what comes next.</p>
        </header>

        <div className="presence-product-scenes">
          <article className="presence-scene presence-scene--listen">
            <div className="presence-scene-meta"><span>Conversation</span><span>Live</span></div>
            <div className="presence-listening-ui">
              <span className="presence-ai-label">AI presence · Sofia</span>
              <h3>Take your time.<br />I’m listening.</h3>
              <div className="presence-live-wave" aria-hidden="true">
                {[16, 28, 42, 24, 54, 38, 20, 46, 30, 18, 36, 22].map((height, index) => <i key={index} style={{ height }} />)}
              </div>
              <button type="button" aria-label="Pause listening"><Mic size={20} /></button>
            </div>
            <footer><span>01</span><p>One unmistakable state. No menus while she is speaking.</p></footer>
          </article>

          <article className="presence-scene presence-scene--memory">
            <div className="presence-scene-meta"><span>Memory</span><span>18:42</span></div>
            <div className="presence-memory-demo">
              <div className="presence-memory-transcript">
                <span>Conversation transcript</span>
                <p>We used to take the early train when the station was still quiet.</p>
                <p className="presence-memory-transcript-focus">Your mother always saved the window seat for me.</p>
                <p>I can still remember the mountains appearing through the mist.</p>
              </div>
              <div className="presence-memory-route" aria-hidden="true"><i /><i /><i /></div>
              <div className="presence-memory-record">
                <span>Saved memory · 18:42</span>
                <blockquote>“Your mother always saved the window seat for me on the train to Petrópolis.”</blockquote>
                <div className="presence-memory-tags"><span>Family memory</span><span>Petrópolis</span></div>
                <small>Source: Sofia · Today’s conversation</small>
              </div>
            </div>
            <footer><span>02</span><p>The memory stays specific instead of becoming a generic summary.</p></footer>
          </article>

          <article className="presence-scene presence-scene--relay">
            <div className="presence-scene-meta"><span>Family relay</span><span>Ready</span></div>
            <div className="presence-relay-ui">
              <span>What needs you</span>
              <h3>Thursday call</h3>
              <p>She’ll be home from garden club after five and would like to hear your voice.</p>
              <div className="presence-relay-action">
                <div><span>Your reply</span><strong>I’ll call you at 6:00.</strong></div>
                <button type="button" aria-label="Send reply"><ArrowRight size={16} /></button>
              </div>
            </div>
            <footer><span>03</span><p>Presence can listen. Only you can make the promise.</p></footer>
          </article>
        </div>
      </section>

      <section className="presence-trust-section" id="trust">
        <div><ShieldCheck size={22} /><p className="presence-kicker">Trust is part of the interface</p></div>
        <h2>The AI never pretends to be a phone call from you.</h2>
        <p>Identity, consent and provenance stay visible. Visits, money, medicine and promises always require verified family input.</p>
        <Link className="presence-dark-button" to="/presence/onboarding">Begin with consent <ArrowRight size={15} /></Link>
      </section>
    </main>
  );
}
