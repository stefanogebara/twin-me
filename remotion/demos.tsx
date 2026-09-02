/**
 * TwinMe product demos, rendered with Remotion to /public/video/mercury/demo-*.mp4
 * and shown in the landing page's product panel (one per tab).
 *
 * Tokens match src/styles/mercury.css. 1280x960 (the panel is 4:3), 30fps.
 * Render: npx remotion render remotion/index.ts <CompositionId> public/video/mercury/<file>.mp4
 */
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing, continueRender, delayRender } from 'remotion';

const T = {
  canvas: '#1e1e2a', surface: '#272735', line: 'rgba(237,237,243,0.12)',
  text: '#ededf3', text2: '#c3c3cc', text3: '#8f8fa0',
  accent: '#22c3ea', accentInk: '#06141a',
  ember: '#dd8f4c', iris: '#847dff', verdigris: '#55a08e', orchid: '#dd90d8', periwinkle: '#90b8f0',
  font: "'Hanken Grotesk', 'Inter', system-ui, sans-serif",
};

function useHanken() {
  const [handle] = React.useState(() => delayRender('hanken-grotesk'));
  React.useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300..700&display=block';
    document.head.appendChild(link);
    const done = () => continueRender(handle);
    document.fonts.ready.then(done).catch(done);
    const t = setTimeout(done, 4000);
    return () => clearTimeout(t);
  }, [handle]);
}

function Frame({ children, label, right }: { children: React.ReactNode; label: string; right?: string }) {
  useHanken();
  return (
    <AbsoluteFill style={{ background: T.canvas, fontFamily: T.font, color: T.text, padding: 72 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: T.text3, fontSize: 22, fontWeight: 420 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: T.accent, boxShadow: `0 0 18px ${T.accent}` }} />
          {label}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{right ?? ''}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{children}</div>
    </AbsoluteFill>
  );
}

function Arriving({ text, start, wordsPerSecond = 3.2, size = 34, color = T.text, weight = 420 }: { text: string; start: number; wordsPerSecond?: number; size?: number; color?: string; weight?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');
  const shown = Math.max(0, Math.floor(((frame - start) / fps) * wordsPerSecond));
  return (
    <p style={{ margin: 0, fontSize: size, lineHeight: 1.3, color, fontWeight: weight, minHeight: size * 1.3 }}>
      {words.map((w, i) => <span key={i} style={{ opacity: i < shown ? 1 : 0 }}>{w} </span>)}
    </p>
  );
}

function Chip({ children, at, accent = false, color }: { children: React.ReactNode; at: number; accent?: boolean; color?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, height: 46, padding: '0 18px', borderRadius: 999, background: accent ? T.accent : 'rgba(176,180,206,0.18)', border: accent ? 0 : '1px solid rgba(176,180,206,0.34)', color: accent ? T.accentInk : T.text, fontSize: 19, fontWeight: 500, opacity: s, transform: `translateY(${(1 - s) * 12}px)` }}>
      {color ? <span style={{ width: 10, height: 10, borderRadius: 999, background: color, boxShadow: `0 0 12px ${color}` }} /> : null}
      {children}
    </span>
  );
}

const SIGS = [
  { name: 'Motivation & drive', color: T.ember, value: 0.78, note: 'Protects the 22:00 hour without noticing.' },
  { name: 'Personality & emotion', color: T.iris, value: 0.62, note: 'Recovers through routine, not rest.' },
  { name: 'Cultural identity', color: T.verdigris, value: 0.84, note: 'Returns to the same three records at 2am.' },
  { name: 'Social dynamics', color: T.orchid, value: 0.55, note: 'Never keeps four people waiting.' },
  { name: 'Lifestyle & rhythms', color: T.periwinkle, value: 0.71, note: 'Tuesdays cost the most.' },
];

/* 1. The portrait: five signatures fill in, each with one measured line. */
export const DemoPortrait: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Frame label="Your signature" right="Measured from 6 sources">
      <div style={{ display: 'grid', gap: 26, maxWidth: 1020 }}>
        {SIGS.map((s, i) => {
          const at = 12 + i * 22;
          const p = interpolate(frame, [at, at + 40], [0, s.value], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
          const noteIn = spring({ frame: frame - at - 30, fps, config: { damping: 20, stiffness: 100 } });
          return (
            <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '280px 1fr', alignItems: 'center', gap: 28 }}>
              <span style={{ fontSize: 20, color: T.text2 }}>{s.name}</span>
              <div>
                <div style={{ position: 'relative', height: 8, borderRadius: 8, background: 'rgba(237,237,243,0.08)' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${p * 100}%`, borderRadius: 8, background: s.color, boxShadow: `0 0 18px ${s.color}88` }} />
                </div>
                <p style={{ margin: '10px 0 0', fontSize: 18, color: T.text3, opacity: noteIn, transform: `translateY(${(1 - noteIn) * 6}px)` }}>{s.note}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

/* 2. It notices: a reading arrives with its source. */
export const DemoNotices: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Frame label="Tonight" right="23:41">
      <div style={{ display: 'grid', gap: 40, maxWidth: 1000 }}>
        <div>
          <Chip at={10} color={T.verdigris}>Spotify · repeat ×4</Chip>
          <div style={{ height: 18 }} />
          <Arriving text="You loop the same three songs when a deadline is close. Focus, for you, sounds like ritual." start={26} size={38} weight={480} />
        </div>
        <div style={{ opacity: interpolate(frame, [120, 140], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
          <Chip at={120} color={T.ember}>GitHub · 02:14 · branch: still-awake</Chip>
          <div style={{ height: 18 }} />
          <Arriving text="Your best commits happen after midnight, in bursts, alone. Rest, for you, is momentum." start={138} size={30} color={T.text2} />
        </div>
      </div>
    </Frame>
  );
};

/* 3. Ask anything: a question, an answer, and what it cites. */
export const DemoTwin: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const q = 'Why do Tuesdays drain me?';
  const typed = Math.min(q.length, Math.max(0, Math.floor(((frame - 12) / fps) * 22)));
  const answerAt = 12 + Math.ceil((q.length / 22) * fps) + 18;
  return (
    <Frame label="Your twin" right="cites what it read">
      <div style={{ maxWidth: 1000, display: 'grid', gap: 26 }}>
        <div style={{ justifySelf: 'end', padding: '16px 24px', borderRadius: 22, background: T.surface, fontSize: 26 }}>
          {q.slice(0, typed)}<span style={{ opacity: frame % 20 < 10 && frame < answerAt ? 1 : 0 }}>|</span>
        </div>
        <div>
          <Arriving text="Every Tuesday ends in six back-to-back calls, and by nine your music turns ambient. You recover the same way each week. You just never watched yourself do it." start={answerAt} size={30} wordsPerSecond={4} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 22 }}>
            <Chip at={answerAt + 95} color={T.periwinkle}>Calendar · 6 weeks</Chip>
            <Chip at={answerAt + 105} color={T.verdigris}>Spotify · Tuesday nights</Chip>
            <Chip at={answerAt + 115} color={T.iris}>Whoop · recovery</Chip>
          </div>
        </div>
      </div>
    </Frame>
  );
};

/* 4. Connect: six sources, one by one, and what each contributes. */
export const DemoConnect: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rows = [
    ['Spotify', 'taste, focus rituals', T.verdigris], ['Google Calendar', 'the shape of a week', T.periwinkle], ['GitHub', 'when you build', T.ember],
    ['Gmail', 'reply cadence', T.orchid], ['YouTube', 'what you return to', T.verdigris], ['Whoop', 'sleep, strain, recovery', T.iris],
  ];
  return (
    <Frame label="Connect" right="you can delete any of it">
      <div style={{ display: 'grid', gap: 14, maxWidth: 980 }}>
        {rows.map(([name, what, color], i) => {
          const at = 10 + i * 22;
          const s = spring({ frame: frame - at, fps, config: { damping: 20, stiffness: 110 } });
          const done = frame > at + 26;
          return (
            <div key={name} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '18px 24px', borderRadius: 14, background: T.surface, opacity: s, transform: `translateY(${(1 - s) * 10}px)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ width: 12, height: 12, borderRadius: 999, background: color, boxShadow: `0 0 12px ${color}` }} />
                <span style={{ fontSize: 24, fontWeight: 480 }}>{name}</span>
                <span style={{ fontSize: 20, color: T.text3 }}>{what}</span>
              </div>
              <span style={{ fontSize: 18, color: done ? T.accent : T.text3 }}>{done ? 'Connected' : 'Connecting'}</span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};
