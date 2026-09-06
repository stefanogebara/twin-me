/**
 * /proto/air — after air.inc: one sky as the whole ground (a slow cloud clip), centred tight type,
 * one glass prompt pill, three glass tiles with the product inside them, a row of the places it reads,
 * and one big rounded media block with a line typing itself.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/proto.css';
import { DEMO, Glass, ProtoNav, ProtoFooter, TodayCard, SignatureCard, Phone, ChipField, SOURCES_ALL, useDemoReceipts } from './kit';

function useTyped(text: string, ms = 40) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); const t = window.setInterval(() => setN((k) => (k >= text.length ? k : k + 1)), ms); return () => window.clearInterval(t); }, [text, ms]);
  return text.slice(0, n);
}

export default function ProtoAir() {
  const receipts = useDemoReceipts(10, 40);
  const ask = DEMO.ask[0];
  const typed = useTyped(ask?.a ?? '', 28);
  return (
    <main className="proto proto--air">
      <video className="air-bg" autoPlay loop muted playsInline poster="/images/proto/bg-air.jpg" aria-hidden="true">
        <source src="/images/proto/bg-air-clouds.mp4" type="video/mp4" />
      </video>
      <ProtoNav links={[['Read', '#read'], ['Portrait', '#portrait'], ['Twin', '#twin']]} cta="Read my portrait" />

      <section className="air-hero">
        <h1>Your portrait, read not asked</h1>
        <p>TwinMe reads what you already do. So you can see who you are.</p>
        <Link to="/" className="pk-btn pk-btn--white">Read my portrait</Link>
        <Glass className="air-prompt"><i /> {ask?.q ?? 'What do I do when work piles up?'}</Glass>
      </section>

      <section className="air-tiles" id="read">
        <Glass className="air-tile">
          <div className="air-tile-visual air-tile-visual--field"><ChipField evidence={receipts} className="air-field" /></div>
          <h2>Read</h2>
          <p>It reads counts and rhythms from the places you connect. Plays, days, hours. Never a message, never a name.</p>
        </Glass>
        <Glass className="air-tile is-featured" id="portrait">
          <div className="air-tile-visual"><SignatureCard tone="light" lines={3} className="air-sig" /></div>
          <h2>Portrait</h2>
          <p>Five lines that hold, one per part of your life, each with the receipts it was read from.</p>
        </Glass>
        <Glass className="air-tile" id="twin">
          <div className="air-tile-visual air-tile-visual--phone"><Phone ground="/images/twinme/cosmos-08-window.jpg" className="air-phone" tilt={-4} /></div>
          <h2>Twin</h2>
          <p>Ask it anything about yourself. It answers from the receipts and cites the line.</p>
        </Glass>
      </section>

      <section className="air-sources">
        <p>Read from the places you already use</p>
        <div className="air-logos">{SOURCES_ALL.map((s) => <span key={s}>{s}</span>)}</div>
      </section>

      <section className="air-feature">
        <Glass className="air-badge">This week</Glass>
        <h2>A twin that answers<br /><em>from the receipts</em></h2>
        <p>Ask how you work, what you play when you focus, when you are at your best. It cites the line it read it from, and says when it does not know.</p>
        <div className="air-media">
          <div className="air-media-q"><Glass className="air-media-pill">{ask?.q}</Glass></div>
          <p className="air-media-a">{typed}<i className="air-caret" /></p>
        </div>
      </section>

      <section className="air-today">
        <h2>And one question to you, each week</h2>
        <TodayCard tone="light" className="air-today-card" />
      </section>

      <section className="air-close">
        <h2>Get your portrait</h2>
        <Link to="/" className="pk-btn pk-btn--white">Read my portrait</Link>
      </section>
      <ProtoFooter />
    </main>
  );
}
