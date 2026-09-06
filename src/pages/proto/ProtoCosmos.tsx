/**
 * /proto/cosmos — after cosmos.so: a white canvas, scattered tilted image tiles drifting around one
 * centred line, a film block, then one statement and one large visual per screen.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/proto.css';
import { DEMO, Glass, ProtoFooter, TodayCard, SignatureCard, Phone, ChipField, SourceTiles, useDemoReceipts } from './kit';

const TILES: [number, number, number, number][] = [
  [2, 12, -14, 120], [12, 44, 8, 100], [6, 70, -6, 90], [9, 24, 12, 80], [30, 62, -10, 110], [44, 82, 6, 90],
  [62, 78, -8, 100], [74, 58, 10, 90], [86, 30, -12, 120], [92, 68, 6, 90], [70, 10, 8, 100], [50, 6, -6, 80],
];

export default function ProtoCosmos() {
  const receipts = useDemoReceipts(9, 40);
  return (
    <main className="proto proto--cosmos">
      <header className="cs-nav">
        <Link to="/" className="cs-mark" aria-label="TwinMe"><i /><i /><i /><i /><i /><i /></Link>
        <nav><a href="#film">Film</a><a href="#lines">Lines</a><a href="#sources">Sources</a></nav>
        <Glass className="cs-search"><span>Try &lsquo;what do I play when I focus&rsquo;</span></Glass>
        <div className="cs-nav-right"><Link to="/demo">See a portrait</Link><Link to="/" className="pk-btn pk-btn--solid">Sign up</Link></div>
      </header>

      <section className="cs-hero">
        <div className="cs-tiles" aria-hidden="true">
          {TILES.map(([x, y, r, w], i) => (
            <img key={i} src={`/images/proto/tile-${String(i + 1).padStart(2, '0')}.jpg`} alt="" className="cs-tile" style={{ left: `${x}%`, top: `${y}%`, width: w, '--r': `${r}deg`, '--d': `${(i % 6) * -1.3}s` } as React.CSSProperties} />
          ))}
        </div>
        <p className="cs-kicker">TWINME</p>
        <h1>A portrait of you,<br />from what you already do</h1>
        <div className="cs-ctas">
          <Link to="/" className="pk-btn pk-btn--solid">Read my portrait</Link>
          <Link to="/demo" className="pk-btn pk-btn--ghost">See one first</Link>
        </div>
      </section>

      <section className="cs-film" id="film">
        <p className="cs-film-lead">Watch the room</p>
        <div className="cs-film-frame">
          <video autoPlay loop muted playsInline poster="/images/twinme/cosmos-08-window.jpg" aria-hidden="true"><source src="/images/twinme/cosmos-08-window.mp4" type="video/mp4" /></video>
          <p className="cs-film-line">Every line here was <em>read</em>, not asked.</p>
        </div>
      </section>

      <section className="cs-statement" id="lines">
        <h2>Every source opens a new line.</h2>
        <div className="cs-collage">
          <img src="/images/proto/tile-04.jpg" alt="" className="cs-collage-img" />
          <img src="/images/proto/tile-08.jpg" alt="" className="cs-collage-img" />
          <img src="/images/proto/tile-11.jpg" alt="" className="cs-collage-img" />
          <SignatureCard tone="light" lines={3} className="cs-collage-sig" />
        </div>
      </section>

      <section className="cs-statement">
        <h2>It keeps the receipts.</h2>
        <div className="cs-fieldwrap"><ChipField evidence={receipts} className="cs-field" /></div>
      </section>

      <section className="cs-statement cs-statement--split">
        <div>
          <h2>And asks you one question a week.</h2>
          <p>Something it noticed, with what it was read from under it. Say whether it is you.</p>
          <TodayCard tone="light" className="cs-today" />
        </div>
        <Phone ground="/images/twinme/cosmos-12-night.jpg" className="cs-phone" tilt={4} />
      </section>

      <section className="cs-statement" id="sources">
        <h2>Six places since June. Never a message.</h2>
        <SourceTiles tone="light" className="cs-tiles-row" />
      </section>

      <section className="cs-close">
        <h2>Your space for yourself.</h2>
        <Link to="/" className="pk-btn pk-btn--solid">Read my portrait</Link>
      </section>
      <ProtoFooter />
    </main>
  );
}
