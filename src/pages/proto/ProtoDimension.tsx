/**
 * /proto/dimension — after dimension.dev: a dawn gradient as the ground, short copy with a list at the
 * left, one large device frame at the right whose screen changes as a sticky list is scrolled.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import '../../styles/proto.css';
import { DEMO, Glass, ProtoNav, ProtoFooter, TodayCard, SignatureCard, ReceiptRows, SourceTiles, ReadingLine, useCentered, useDemoReceipts } from './kit';

const SCENES = [
  { id: 'today', n: '01', label: 'Today’s question', h: 'One question a week, from what it read.', sub: 'The twin notices something new and asks you, with the receipts under it.' },
  { id: 'signature', n: '02', label: 'Signature', h: 'Five lines that hold.', sub: 'One per part of your life, each measured from named sources.' },
  { id: 'readings', n: '03', label: 'Readings', h: 'Every reading, with what it was read from.', sub: 'Confirm it, dispute it, or open the receipts.' },
  { id: 'receipts', n: '04', label: 'Receipts', h: 'Counts and rhythms, never contents.', sub: 'A play, a day with nothing on the calendar, a long night. Never a message, never a name.' },
  { id: 'sources', n: '05', label: 'Sources', h: 'Six places, since June.', sub: 'Connect one more and the portrait deepens. Delete one and everything read from it goes.' },
];

function Screen({ id }: { id: string }) {
  const receipts = useDemoReceipts(6, 44);
  if (id === 'signature') return <SignatureCard tone="dark" lines={4} className="dm-screen-card" />;
  if (id === 'readings') return <Glass tone="dark" className="dm-screen-card dm-screen-lines">{DEMO.readings.slice(0, 4).map((r) => <ReadingLine key={r.id} r={r} />)}</Glass>;
  if (id === 'receipts') return <Glass tone="dark" className="dm-screen-card"><span className="pk-label">What it was read from</span><ReceiptRows evidence={receipts} /></Glass>;
  if (id === 'sources') return <SourceTiles tone="dark" className="dm-screen-tiles" />;
  return <TodayCard tone="dark" className="dm-screen-card" />;
}

export default function ProtoDimension() {
  const active = useCentered('scene', 'today');
  return (
    <main className="proto proto--dimension">
      <img className="dm-bg" src="/images/proto/bg-dimension.jpg" alt="" aria-hidden="true" />
      <ProtoNav links={[['What it reads', '#reads'], ['Portrait', '#portrait'], ['Privacy', '#privacy']]} cta="Get started" />

      <section className="dm-hero">
        <div className="dm-hero-copy">
          <p className="dm-eyebrow">Introducing TwinMe</p>
          <h1>The portrait that reads itself.</h1>
          <ul className="dm-bullets">
            <li>Reads Spotify, Calendar, GitHub, Whoop and more</li>
            <li>Writes five lines that hold, with receipts</li>
            <li>Asks you one question a week</li>
            <li>Never a message, photo or location; nothing trains a model</li>
          </ul>
          <Link to="/" className="pk-btn pk-btn--solid">Get started</Link>
        </div>
        <div className="dm-frame">
          <div className="dm-frame-screen">
            <img src="/images/twinme/cosmos-08-window.jpg" alt="" aria-hidden="true" />
            <div className="dm-frame-ui">
              <span className="pk-mono">EVENING · READ FROM 6 SOURCES</span>
              <p className="dm-frame-greeting">Good evening, <b>{DEMO.owner}</b>.<br />{DEMO.lead}</p>
              <TodayCard tone="dark" className="dm-frame-today" />
            </div>
          </div>
        </div>
      </section>

      <section className="dm-scroller" id="reads">
        <aside className="dm-index">
          <h2>What TwinMe reads for you</h2>
          <ol>
            {SCENES.map((s) => <li key={s.id} className={active === s.id ? 'is-active' : ''}><a href={`#dm-${s.id}`}>{s.label}<span>{s.n}</span></a></li>)}
          </ol>
        </aside>
        <div className="dm-scenes">
          {SCENES.map((s) => (
            <section key={s.id} id={`dm-${s.id}`} data-scene={s.id} className={`dm-scene ${active === s.id ? 'is-active' : ''}`}>
              <div className="dm-scene-copy">
                <p className="dm-eyebrow">{s.label}</p>
                <h3>{s.h}</h3>
                <p>{s.sub}</p>
              </div>
              <div className="dm-scene-frame">
                <div className="dm-frame-screen dm-frame-screen--sm">
                  <img src={['/images/twinme/cosmos-08-window.jpg', '/images/twinme/cosmos-10-lamp.jpg', '/images/twinme/cosmos-11-chair.jpg', '/images/twinme/cosmos-12-night.jpg', '/images/twinme/cosmos-10-lamp.jpg'][SCENES.indexOf(s)]} alt="" aria-hidden="true" />
                  <div className="dm-frame-ui dm-frame-ui--sm"><Screen id={s.id} /></div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="dm-privacy" id="privacy">
        <Glass className="dm-privacy-card">
          <h2>Read, not asked. Counted, not kept.</h2>
          <p>TwinMe reads counts and rhythms from the places you connect: how many, how often, what time of day. It never reads a message, a photo or your location, and nothing here trains a model. Delete a source and everything read from it goes with it.</p>
        </Glass>
      </section>

      <section className="dm-close">
        <h2>Your portrait, ready this evening.</h2>
        <Link to="/" className="pk-btn pk-btn--solid">Get started</Link>
      </section>
      <ProtoFooter />
    </main>
  );
}
