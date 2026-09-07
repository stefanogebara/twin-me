/**
 * Prototype kit: the Portrait's liquid-glass components, reusable on any ground.
 * Four landing prototypes under /proto compose these with their own fonts and backgrounds.
 * Content comes from the demo portrait so every card shows a real reading with its receipts.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEMO_PORTRAIT, DOMAIN_LABEL, SOURCE_LABEL, type Evidence, type Reading } from '../../data/demoPortrait';

export const DEMO = DEMO_PORTRAIT;
export const SOURCES_ALL = ['Spotify', 'Calendar', 'YouTube', 'Gmail', 'Discord', 'GitHub', 'Whoop', 'Instagram', 'Outlook'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
export function spokenDay(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** All distinct receipts in the demo, newest first. */
export function useDemoReceipts(max = 12, maxLen = 44): Evidence[] {
  return useMemo(() => {
    const seen = new Set<string>();
    return DEMO.readings.flatMap((r) => r.evidence)
      .filter((e) => { const k = `${e.source}|${e.event}`; if (seen.has(k)) return false; seen.add(k); return e.event.length <= maxLen; })
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);
  }, [max, maxLen]);
}

/** The value of `data-<attr>` on whichever element sits under the middle of the screen. */
export function useCentered(attr: string, fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    let raf = 0;
    const pick = () => {
      raf = 0;
      const mid = window.innerHeight * 0.5;
      const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-${attr}]`));
      const hit = els.find((el) => { const r = el.getBoundingClientRect(); return r.top <= mid && r.bottom > mid; });
      setValue(hit?.dataset[attr] || fallback);
    };
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(pick); };
    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) window.cancelAnimationFrame(raf); };
  }, [attr, fallback]);
  return value;
}

type GlassProps = React.HTMLAttributes<HTMLDivElement> & { tone?: 'light' | 'dark' };
/** The nav capsule's glass: near-clear, a light blur, a hairline that catches light. */
export function Glass({ className = '', tone = 'light', children, ...rest }: GlassProps) {
  return <div className={`liquid-glass pk-glass pk-glass--${tone} ${className}`} {...rest}>{children}</div>;
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <Link to="/" className={`pk-mark ${className}`}>TwinMe</Link>;
}

export function ProtoNav({ links, cta, tone = 'light' }: { links: [string, string][]; cta: string; tone?: 'light' | 'dark' }) {
  return (
    <header className="pk-nav">
      <Wordmark />
      <nav className={`liquid-glass pk-glass pk-glass--${tone} pk-navcap`} aria-label="Sections">
        {links.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
      </nav>
      <Link to="/" className={`liquid-glass pk-glass pk-glass--${tone} pk-pill`}>{cta}</Link>
    </header>
  );
}

export function ReceiptRows({ evidence, pace = 0 }: { evidence: Evidence[]; pace?: number }) {
  return (
    <div className="pk-receipts">
      {evidence.map((e, i) => (
        <div key={`${e.source}-${e.at}-${i}`} className="pk-receipt" style={pace ? { animationDelay: `${i * pace}ms` } : undefined}>
          <span>{SOURCE_LABEL[e.source] ?? e.source} · {spokenDay(e.at)}</span>
          <p>{e.event}</p>
        </div>
      ))}
    </div>
  );
}

/** Today's question with its two answers and the receipts under it. */
export function TodayCard({ tone = 'light', className = '' }: { tone?: 'light' | 'dark'; className?: string }) {
  const q = DEMO.question!;
  const from = DEMO.readings.filter((r) => q.fromReadings.includes(r.id));
  const receipts = from.flatMap((r) => r.evidence).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2);
  return (
    <Glass tone={tone} className={`pk-today ${className}`}>
      <span className="pk-label">New this week{q.source ? ` · ${q.source}` : ''}</span>
      <p className="pk-serif pk-today-q">{q.question}</p>
      <div className="pk-answers">{q.answers.map((a, i) => <b key={a} className={i === 0 ? 'is-primary' : ''}>{a}</b>)}</div>
      <ReceiptRows evidence={receipts} />
    </Glass>
  );
}

/** The five signature lines, one per domain, with what each was read from. */
export function SignatureCard({ tone = 'light', className = '', lines = 4 }: { tone?: 'light' | 'dark'; className?: string; lines?: number }) {
  return (
    <Glass tone={tone} className={`pk-signature ${className}`}>
      {DEMO.signature.slice(0, lines).map((s) => {
        const from = DEMO.readings.filter((r) => s.from.includes(r.id));
        const sources = [...new Set(from.flatMap((r) => r.evidence.map((e) => SOURCE_LABEL[e.source] ?? e.source)))];
        const receipts = from.reduce((n, r) => n + r.evidence.length, 0);
        return (
          <div key={s.domain} className="pk-sig-row">
            <div className="pk-sig-head"><span>{DOMAIN_LABEL[s.domain]}</span><small>{sources.join(', ')} · {receipts} receipts</small></div>
            <p className="pk-serif">{s.line}</p>
          </div>
        );
      })}
    </Glass>
  );
}

/** A phone frame. Give it a ground image and it shows the Portrait at phone size. */
export function Phone({ ground, className = '', tilt = -3 }: { ground: string; className?: string; tilt?: number }) {
  const q = DEMO.question!;
  const from = DEMO.readings.filter((r) => q.fromReadings.includes(r.id));
  const receipts = from.flatMap((r) => r.evidence).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 2);
  return (
    <div className={`pk-phone ${className}`} style={{ '--tilt': `${tilt}deg` } as React.CSSProperties} aria-hidden="true">
      <div className="pk-phone-screen">
        <img src={ground} alt="" />
        <div className="pk-phone-ui">
          <div className="pk-phone-bar"><span className="pk-mark-text">TwinMe</span><span className="pk-mono">21:04</span></div>
          <p className="pk-serif pk-phone-head">{DEMO.lead}</p>
          <div className="liquid-glass pk-glass pk-glass--dark pk-phone-glass">
            <span className="pk-label">New this week · {q.source}</span>
            <p className="pk-serif">{q.question}</p>
            <div className="pk-answers pk-answers--sm">{q.answers.map((a, i) => <b key={a} className={i === 0 ? 'is-primary' : ''}>{a}</b>)}</div>
            <ReceiptRows evidence={receipts} />
          </div>
        </div>
      </div>
    </div>
  );
}

const SPOTS: [number, number, number][] = [
  [3, 6, -3], [30, 2, 2], [60, 9, -2], [82, 4, 3], [10, 40, 2], [42, 34, -3], [70, 42, 2], [88, 52, -2], [18, 74, -2], [50, 68, 3], [76, 80, -3], [34, 88, 2],
];
/** Receipts as chips floating in a field. */
export function ChipField({ evidence, tone = 'light', className = '' }: { evidence: Evidence[]; tone?: 'light' | 'dark'; className?: string }) {
  return (
    <div className={`pk-field ${className}`} aria-hidden="true">
      {evidence.slice(0, SPOTS.length).map((e, i) => {
        const [x, y, r] = SPOTS[i];
        return (
          <Glass key={`${e.source}-${e.at}-${i}`} tone={tone} className="pk-chip" style={{ left: `${x}%`, top: `${y}%`, '--r': `${r}deg`, '--d': `${(i % 5) * -1.7}s` } as React.CSSProperties}>
            <span>{SOURCE_LABEL[e.source] ?? e.source} · {spokenDay(e.at)}</span>
            <p>{e.event}</p>
          </Glass>
        );
      })}
    </div>
  );
}

export function SourceTiles({ tone = 'light', className = '' }: { tone?: 'light' | 'dark'; className?: string }) {
  return (
    <div className={`pk-tiles ${className}`}>
      {DEMO.sources.map((s) => (
        <Glass key={s.platform} tone={tone} className="pk-tile">
          <strong className="pk-serif">{s.label}</strong>
          <span className="pk-mono">{parseInt(s.read, 10) || 0}</span>
          <small>{s.kinds.replace(/, never a (name|title)$/, '')}</small>
        </Glass>
      ))}
    </div>
  );
}

/** A reading as one line with its provenance, for lists. */
export function ReadingLine({ r }: { r: Reading }) {
  const names = [...new Set(r.evidence.map((e) => SOURCE_LABEL[e.source] ?? e.source))];
  return (
    <div className="pk-line">
      <p className="pk-serif">{r.text}</p>
      <span className="pk-mono">{names.join(', ')} · {r.evidence.length} receipts</span>
    </div>
  );
}

export function ProtoFooter({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <footer className={`pk-footer pk-footer--${tone}`}>
      <span>TwinMe, 2026</span>
      <nav>
        <Link to="/privacy-policy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/proto">Prototypes</Link>
      </nav>
    </footer>
  );
}

/** /proto: the four prototypes, one link each. */
export function ProtoIndex() {
  const items: [string, string, string][] = [
    ['/proto/twin', 'Twinme, from scratch', 'Cream paper, a warm serif, painted traces, one frame, a manifesto. After Littlebird and Hark.'],
    ['/proto/cofounder', 'Cofounder', 'Illustrated scene, serif wordmark, numbered chapters with product frames.'],
    ['/proto/dimension', 'Dimension', 'Dawn gradient, one big device frame, a sticky list that drives what it shows.'],
    ['/proto/air', 'Air', 'A sky, centred type, glass tiles with the product inside them.'],
    ['/proto/cosmos', 'Cosmos', 'White canvas, scattered tilted tiles, a film block, one line per screen.'],
  ];
  return (
    <main className="proto proto--index">
      <h1 className="pk-serif">Four ways to land TwinMe</h1>
      <p>Each one takes a reference site's ground and type, and the Portrait's liquid glass.</p>
      <ul>
        {items.map(([href, name, note]) => <li key={href}><Link to={href}><b>{name}</b><span>{note}</span></Link></li>)}
      </ul>
    </main>
  );
}
