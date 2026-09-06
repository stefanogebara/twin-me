/**
 * /proto/cofounder — after cofounder.co: an illustrated scene as the hero with glass chips floating in it,
 * a serif wordmark, then a light paper canvas with one two-tone statement, one big product frame,
 * three short captions, and numbered chapters that alternate copy and a frame.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/proto.css';
import { DEMO, Glass, ProtoNav, ProtoFooter, TodayCard, SignatureCard, Phone, ChipField, SourceTiles, ReadingLine, SOURCES_ALL, useDemoReceipts } from './kit';

const CHAPTERS = [
  { n: '1.0', k: 'Read', h: 'TwinMe reads what you already do', sub: 'Connect the places you already use. It reads the shape of your days from them: what you play, when you work, how you sleep. Never a message, never a photo, never a name.', items: ['Spotify, Calendar, GitHub, Whoop', 'Counts and rhythms, not contents', 'Nothing self-reported'] },
  { n: '2.0', k: 'Portrait', h: 'Then writes your portrait, with receipts', sub: 'Five lines that hold, one per part of your life, and the readings under them. Every line keeps what it was read from, so you can check it.', items: ['Five signature lines', 'Readings you can confirm or dispute', 'Receipts under every line'] },
  { n: '3.0', k: 'Twin', h: 'And answers as you, from the receipts', sub: 'Ask your twin how you work, what you listen to when you focus, when you are at your best. It answers from what was read and cites the line.', items: ['Answers cite the reading', 'Says when it does not know', 'One question to you a week'] },
];

export default function ProtoCofounder() {
  const receipts = useDemoReceipts(8, 40);
  return (
    <main className="proto proto--cofounder">
      <section className="cf-hero">
        <img className="cf-hero-bg" src="/images/proto/bg-cofounder.jpg" alt="" aria-hidden="true" />
        <ProtoNav links={[['How it reads', '#read'], ['Portrait', '#portrait'], ['Twin', '#twin']]} cta="Read my portrait" />
        <div className="cf-hero-copy">
          <h1>TwinMe reads your life and writes your portrait</h1>
          <p>Connect what you already use. It reads the patterns, keeps the receipts, and asks you one question a week.</p>
          <div className="cf-ctas">
            <Link to="/" className="pk-btn pk-btn--solid">Read my portrait</Link>
            <Link to="/demo" className="liquid-glass pk-glass pk-glass--light pk-pill">See a portrait</Link>
          </div>
        </div>
        <div className="cf-hero-chips" aria-hidden="true">
          {receipts.slice(0, 3).map((e, i) => (
            <Glass key={i} className="cf-chip" style={{ animationDelay: `${i * 1.3}s` }}>
              <i /> <span>{e.source === 'whoop' ? 'Slept' : 'Read'}</span> <b>{e.event}</b>
            </Glass>
          ))}
        </div>
      </section>

      <section className="cf-strip">
        <div className="cf-logos">{SOURCES_ALL.map((s) => <span key={s}>{s}</span>)}</div>
        <p className="pk-mono">nine places a portrait can be read from</p>
      </section>

      <section className="cf-statement">
        <h2>TwinMe is a portrait engine<br /><span>designed to show you patterns you never noticed</span></h2>
        <div className="cf-frame">
          <div className="cf-frame-inner">
            <img src="/images/twinme/cosmos-08-window.jpg" alt="" aria-hidden="true" />
            <div className="cf-frame-ui">
              <p className="pk-serif cf-frame-head">{DEMO.lead}</p>
              <TodayCard tone="dark" className="cf-frame-today" />
            </div>
          </div>
        </div>
        <div className="cf-captions">
          <p><b>Read, not asked.</b> No quiz, no form. The portrait comes from what you already do, in the places you already do it.</p>
          <p><b>Receipts under every line.</b> Open a line and see what it was read from: the plays, the days, the hours. Confirm it or dispute it.</p>
          <p><b>Private by construction.</b> Counts and rhythms, never contents. Messages, photos and location are never read.</p>
        </div>
      </section>

      {CHAPTERS.map((c, i) => (
        <section key={c.n} id={c.k.toLowerCase()} className={`cf-chapter ${i % 2 ? 'is-flipped' : ''}`}>
          <div className="cf-chapter-copy">
            <p className="pk-mono cf-kicker">{c.n} — {c.k.toUpperCase()}</p>
            <h2>{c.h.split(' ').slice(0, -2).join(' ')} <span>{c.h.split(' ').slice(-2).join(' ')}</span></h2>
            <p className="cf-sub">{c.sub}</p>
            <ol className="cf-list">
              {c.items.map((it, j) => <li key={it}><span className="pk-mono">{c.n.split('.')[0]}.{j + 1}</span>{it}</li>)}
            </ol>
          </div>
          <div className="cf-chapter-visual">
            {i === 0 ? <div className="cf-visual-room"><img src="/images/twinme/cosmos-10-lamp.jpg" alt="" /><ChipField evidence={receipts} tone="dark" className="cf-visual-field" /></div> : null}
            {i === 1 ? <div className="cf-visual-room"><img src="/images/twinme/cosmos-11-chair.jpg" alt="" /><SignatureCard tone="dark" className="cf-visual-sig" /></div> : null}
            {i === 2 ? <div className="cf-visual-room cf-visual-room--phone"><img src="/images/twinme/cosmos-12-night.jpg" alt="" /><Phone ground="/images/twinme/cosmos-12-night.jpg" className="cf-visual-phone" /></div> : null}
          </div>
        </section>
      ))}

      <section className="cf-readings">
        <p className="pk-mono cf-kicker">WHAT A PORTRAIT SAYS</p>
        <h2>Lines like these, each with its receipts</h2>
        <div className="cf-lines">{DEMO.readings.slice(0, 6).map((r) => <ReadingLine key={r.id} r={r} />)}</div>
      </section>

      <section className="cf-sources">
        <h2>Six places, read since June</h2>
        <SourceTiles tone="dark" className="cf-tiles" />
      </section>

      <section className="cf-close">
        <h2>Start with what you already do.</h2>
        <p>Connect one place. The first line arrives in minutes.</p>
        <Link to="/" className="pk-btn pk-btn--solid">Read my portrait</Link>
      </section>
      <ProtoFooter />
    </main>
  );
}
