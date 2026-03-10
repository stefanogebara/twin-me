import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Player } from '@remotion/player';
import {
  Paperclip, ArrowUp, Globe, Zap, Shield, Brain,
  Music, Calendar, Youtube, Linkedin, MessageSquare, Activity,
} from 'lucide-react';
import '../sundust.css';
import { MemoryFlow } from '../../remotion/cinematic/MemoryFlow';
import { SoulPortrait } from '../../remotion/cinematic/SoulPortrait';
import { PlatformMosaic } from '../../remotion/cinematic/PlatformMosaic';
import { TwinDialog } from '../../remotion/cinematic/TwinDialog';

// ── Scattered soul words ──
const SOUL_WORDS = [
  { word: 'curious',      x: 7,  y: 11, size: 12, opacity: 0.044, rot: -15, dur: 28 },
  { word: 'night owl',    x: 17, y: 44, size: 10, opacity: 0.032, rot: 8,   dur: 34 },
  { word: 'empathy',      x: 77, y: 7,  size: 11, opacity: 0.038, rot: -8,  dur: 31 },
  { word: 'OCEAN',        x: 87, y: 37, size: 14, opacity: 0.050, rot: 12,  dur: 25 },
  { word: 'memories',     x: 4,  y: 71, size: 13, opacity: 0.038, rot: -20, dur: 38 },
  { word: 'authentic',    x: 61, y: 87, size: 11, opacity: 0.032, rot: 6,   dur: 29 },
  { word: 'reflections',  x: 34, y: 14, size: 10, opacity: 0.028, rot: -5,  dur: 42 },
  { word: 'Spotify',      x: 71, y: 54, size: 12, opacity: 0.042, rot: 15,  dur: 27 },
  { word: 'patterns',     x: 24, y: 81, size: 10, opacity: 0.032, rot: -10, dur: 36 },
  { word: 'soul',         x: 89, y: 69, size: 16, opacity: 0.052, rot: -4,  dur: 22 },
  { word: 'identity',     x: 47, y: 5,  size: 11, opacity: 0.038, rot: 18,  dur: 33 },
  { word: 'insights',     x: 13, y: 27, size: 10, opacity: 0.028, rot: -12, dur: 40 },
  { word: 'growth',       x: 54, y: 71, size: 12, opacity: 0.038, rot: 7,   dur: 30 },
  { word: '16K+',         x: 81, y: 21, size: 13, opacity: 0.048, rot: -18, dur: 26 },
  { word: 'deep thinker', x: 37, y: 93, size: 10, opacity: 0.028, rot: 5,   dur: 44 },
  { word: 'music lover',  x: 67, y: 13, size: 11, opacity: 0.032, rot: -7,  dur: 35 },
  { word: 'habits',       x: 91, y: 84, size: 10, opacity: 0.038, rot: 20,  dur: 28 },
  { word: 'twin',         x: 11, y: 57, size: 15, opacity: 0.048, rot: -3,  dur: 24 },
  { word: 'rhythm',       x: 43, y: 47, size: 11, opacity: 0.032, rot: 10,  dur: 37 },
  { word: 'explorer',     x: 75, y: 41, size: 12, opacity: 0.038, rot: -14, dur: 32 },
  { word: 'values',       x: 29, y: 34, size: 10, opacity: 0.028, rot: 9,   dur: 41 },
  { word: 'passions',     x: 57, y: 27, size: 11, opacity: 0.038, rot: -6,  dur: 29 },
  { word: 'introvert',    x: 7,  y: 87, size: 12, opacity: 0.042, rot: 16,  dur: 26 },
  { word: 'Calendar',     x: 84, y: 54, size: 10, opacity: 0.028, rot: -11, dur: 38 },
];

// ── Platforms ──
const PLATFORMS = [
  { name: 'Spotify',  color: '#1DB954', Icon: Music },
  { name: 'Calendar', color: '#4285F4', Icon: Calendar },
  { name: 'YouTube',  color: '#FF0000', Icon: Youtube },
  { name: 'Discord',  color: '#5865F2', letter: 'D' },
  { name: 'LinkedIn', color: '#0A66C2', Icon: Linkedin },
  { name: 'Whoop',    color: '#CCFF00', letter: 'W', darkText: true },
  { name: 'GitHub',   color: '#24292e', letter: 'G' },
  { name: 'Twitch',   color: '#9146FF', letter: 'T' },
];

// ── Suggestions ──
const SUGGESTIONS = [
  { icon: '✦', text: 'What makes me unique?' },
  { icon: '◎', text: 'Analyze my patterns' },
  { icon: '❋', text: 'My energy rhythms' },
  { icon: '⬡', text: 'Social dynamics' },
];

// ── Feature tabs ──
const TABS = [
  {
    id: 'remember', label: 'Remember', Icon: Brain, color: '#c17e2c',
    headline: 'Every memory, forever.',
    desc: '16,000+ real moments — Spotify plays, calendar events, late-night reflections — woven into a living stream your twin retrieves in milliseconds.',
  },
  {
    id: 'discover', label: 'Discover', Icon: Zap, color: '#818cf8',
    headline: "Patterns you've never noticed.",
    desc: 'The twin surfaces invisible correlations — your creativity peaks after 11pm, your energy crashes on Mondays, your reading habits reveal your deepest values.',
  },
  {
    id: 'reflect', label: 'Reflect', Icon: Activity, color: '#34d399',
    headline: 'Expert insights, daily.',
    desc: '5 AI experts analyze you across personality, lifestyle, culture, social, and motivation — generating reflections that feel disturbingly accurate.',
  },
  {
    id: 'chat', label: 'Chat', Icon: MessageSquare, color: '#fb923c',
    headline: 'Talk to your twin.',
    desc: "Not a chatbot with facts. A twin that answers as you would — with your humor, your perspective, your voice. Built from your actual behavioral data.",
  },
];

// ── Stats ──
const STATS = [
  { value: '16,482', label: 'Memories captured' },
  { value: '91%',    label: 'Confidence score' },
  { value: '5',      label: 'Expert domains' },
  { value: '<2s',    label: 'Response time' },
];

// ── OCEAN ──
const OCEAN = [
  { trait: 'Openness',          score: 88, color: '#818cf8' },
  { trait: 'Conscientiousness', score: 62, color: '#34d399' },
  { trait: 'Extraversion',      score: 34, color: '#fb923c' },
  { trait: 'Agreeableness',     score: 74, color: '#f472b6' },
  { trait: 'Neuroticism',       score: 45, color: '#c17e2c' },
];

// ── Memory preview cards ──
const MEM_CARDS = [
  { Icon: Music,         color: '#1DB954', text: 'Listened to Radiohead 3× this week',       time: '2h ago' },
  { Icon: Brain,         color: '#818cf8', text: 'Deep work session 4h — best this month',    time: '6h ago' },
  { Icon: MessageSquare, color: '#c17e2c', text: 'Reflection: creative peaks after midnight', time: '1d ago' },
];

// ── Scroll-reveal wrapper ──
function FadeIn({
  children, delay = 0, y = 24, className = '',
}: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVis(true); },
      { threshold: 0.07 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? 'none' : `translateY(${y}px)`,
        transition: `opacity 0.65s ease ${delay}s, transform 0.65s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
export default function PrototypeLanding() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState('remember');
  const [oceansVisible, setOceansVisible] = useState(false);
  const oceanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = oceanRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setOceansVisible(true); },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const tab = TABS.find(t => t.id === activeTab)!;
  const TabIcon = tab.Icon;

  return (
    <div className="sundust" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative', overflowX: 'hidden' }}>

      {/* ── Scattered soul words (fixed, behind everything) ── */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        {SOUL_WORDS.map((w, i) => (
          <span key={i} style={{
            position: 'absolute', left: `${w.x}%`, top: `${w.y}%`,
            fontSize: w.size, opacity: w.opacity, color: '#fdfcfb',
            fontFamily: 'Inter, sans-serif', fontWeight: 500,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            transform: `rotate(${w.rot}deg)`,
            animation: `sd-word-drift ${w.dur}s ease-in-out infinite alternate`,
            animationDelay: `${-i * 1.4}s`,
            whiteSpace: 'nowrap', userSelect: 'none',
          }}>
            {w.word}
          </span>
        ))}
      </div>

      {/* ── Ambient glows ── */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', width: 800, height: 800, left: '20%', top: '-15%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(193,126,44,0.10) 0%, transparent 65%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', width: 600, height: 600, right: '-8%', top: '25%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(129,140,248,0.07) 0%, transparent 65%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', width: 500, height: 500, left: '-5%', bottom: '5%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,211,153,0.05) 0%, transparent 65%)', filter: 'blur(80px)' }} />
      </div>

      {/* ── Navbar ── */}
      <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 10 }}>
        <nav className="sd-navbar" style={{ display: 'flex', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: 10, paddingBottom: 10 }}>
          <button onClick={() => navigate('/prototype')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, paddingRight: 20, marginRight: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              <img src="/images/backgrounds/flower.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 25, fontWeight: 400, letterSpacing: '-0.5px', whiteSpace: 'nowrap' }}>Twin Me</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 48, fontSize: 14, fontFamily: '"Poppins", Inter, sans-serif', fontWeight: 400, paddingLeft: 16, paddingRight: 16, whiteSpace: 'nowrap' }}>
            {['How it works', 'Features', 'Pricing'].map(l => (
              <button key={l} style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 'inherit', fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}>{l}</button>
            ))}
          </div>
          <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
            <button onClick={() => navigate('/auth')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', color: 'var(--sd-fg)', fontSize: 12, fontFamily: '"Geist", Inter, sans-serif', fontWeight: 500, borderRadius: 6 }}>Sign in</button>
            <button onClick={() => navigate('/auth')} style={{ background: 'var(--sd-fg)', color: 'var(--sd-bg)', border: 'none', borderRadius: 100, padding: '8px 12px', minWidth: 80, fontSize: 14, fontFamily: '"Geist", Inter, sans-serif', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>Get started</button>
          </div>
        </nav>
      </div>

      {/* ── Hero ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 64px', position: 'relative', zIndex: 2, minHeight: '90vh' }}>
        <div style={{ position: 'absolute', width: 560, height: 560, left: '50%', top: '50%', transform: 'translate(-50%, -60%)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(193,126,44,0.55) 0%, rgba(255,132,0,0.28) 35%, rgba(193,126,44,0.08) 65%, transparent 80%)', filter: 'blur(64px)', pointerEvents: 'none' }} />

        <div className="sd-badge" style={{ marginBottom: 28, animation: 'sd-fade-up-stagger 0.7s ease both' }}>
          <Globe size={13} />
          Generative Agents · Soul Signature Platform
        </div>

        <h1 className="sd-heading" style={{ fontSize: 'clamp(44px, 6.5vw, 76px)', textAlign: 'center', marginBottom: 22, letterSpacing: '-0.025em', maxWidth: 800, lineHeight: 0.95, animation: 'sd-fade-up-stagger 0.7s 0.1s ease both' }}>
          Your soul,<br />
          <span style={{ color: '#c17e2c' }}>in digital form.</span>
        </h1>

        <p style={{ fontSize: 17, color: 'var(--sd-text-secondary)', textAlign: 'center', marginBottom: 52, maxWidth: 500, lineHeight: 1.65, fontFamily: 'Inter, sans-serif', animation: 'sd-fade-up-stagger 0.7s 0.2s ease both' }}>
          An AI twin built from 16,000+ real memories — not a chatbot with facts, but a mirror of your authentic self.
        </p>

        {/* Chatbox */}
        <div style={{ width: '100%', maxWidth: 620, animation: 'sd-fade-up-stagger 0.7s 0.3s ease both' }}>
          <div className="sd-chatbox" style={{ padding: '16px 20px', borderRadius: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', height: 87, justifyContent: 'space-between' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask your twin anything about yourself..."
                style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--sd-fg)', fontSize: 14, fontFamily: 'Inter, sans-serif', resize: 'none', lineHeight: 1.25 }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); navigate('/prototype/chat'); } }}
              />
              <div style={{ display: 'flex', height: 28, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', borderRadius: 200, padding: '2px 8px', minWidth: 64, fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif', cursor: 'pointer', color: 'var(--sd-fg)' }}>
                    <Paperclip size={16} style={{ flexShrink: 0 }} />Attach
                  </button>
                  <button style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(17,15,15,0.4)', border: 'none', borderRadius: 6, padding: '2px 8px', minWidth: 64, fontSize: 12, fontWeight: 500, fontFamily: 'Inter, sans-serif', cursor: 'pointer', color: 'var(--sd-fg)' }}>
                    <Globe size={16} style={{ flexShrink: 0 }} />Online
                  </button>
                </div>
                <button className="sd-send-btn" disabled={!input.trim()} onClick={() => navigate('/prototype/chat')} style={{ opacity: input.trim() ? 1 : 0.5 }}>
                  <ArrowUp size={14} />
                </button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 13, flexWrap: 'wrap', justifyContent: 'center' }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="sd-chip" onClick={() => { setInput(s.text); navigate('/prototype/chat'); }}>
                <span style={{ fontSize: 11, lineHeight: 1 }}>{s.icon}</span>{s.text}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 52, marginTop: 60, flexWrap: 'wrap', justifyContent: 'center', animation: 'sd-fade-up-stagger 0.7s 0.45s ease both' }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 30, color: '#fdfcfb', letterSpacing: '-0.5px', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--sd-text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Platform Marquee ── */}
      <div style={{ position: 'relative', zIndex: 2, padding: '22px 0', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 40, animation: 'sd-marquee 22s linear infinite', width: 'max-content' }}>
          {[...PLATFORMS, ...PLATFORMS, ...PLATFORMS].map((p, i) => {
            const PIcon = 'Icon' in p ? p.Icon : null;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {PIcon
                    ? <PIcon size={14} color="#fff" />
                    : <span style={{ fontSize: 12, fontWeight: 700, color: 'darkText' in p && p.darkText ? '#000' : '#fff', fontFamily: 'Inter, sans-serif' }}>{'letter' in p ? p.letter : ''}</span>
                  }
                </div>
                <span style={{ fontSize: 13, color: 'var(--sd-text-secondary)', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{p.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Soul Signature Section ── */}
      <div style={{ position: 'relative', zIndex: 2, padding: '100px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>

          {/* OCEAN card */}
          <FadeIn>
            <div ref={oceanRef} className="sd-card" style={{ padding: '36px 40px', background: 'rgba(40,36,36,0.6)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)' }}>
              {/* Profile header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, paddingBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #c17e2c, #ff8400)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 600, color: '#fff', flexShrink: 0, fontFamily: 'Inter, sans-serif' }}>S</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sd-fg)', fontFamily: 'Inter, sans-serif' }}>Stefano</div>
                  <div style={{ fontSize: 11, color: 'var(--sd-text-muted)', fontFamily: 'Inter, sans-serif' }}>The Empathetic Obsessive</div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 11, color: '#c17e2c', fontFamily: 'Inter, sans-serif', background: 'rgba(193,126,44,0.1)', padding: '4px 10px', borderRadius: 20, border: '1px solid rgba(193,126,44,0.25)', whiteSpace: 'nowrap' }}>91% confident</div>
              </div>

              {/* OCEAN bars */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 10, color: 'var(--sd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginBottom: 14 }}>Soul Signature — OCEAN</div>
                {OCEAN.map((trait, i) => (
                  <div key={trait.trait} style={{ marginBottom: 11 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: 'var(--sd-text-secondary)', fontFamily: 'Inter, sans-serif' }}>{trait.trait}</span>
                      <span style={{ fontSize: 12, color: trait.color, fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>{trait.score}%</span>
                    </div>
                    <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: trait.color, opacity: 0.85, width: oceansVisible ? `${trait.score}%` : '0%', transition: `width 1.1s cubic-bezier(0.4,0,0.2,1) ${0.3 + i * 0.13}s` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Memory cards */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--sd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginBottom: 10 }}>Recent memories</div>
                {MEM_CARDS.map((card, i) => {
                  const CIcon = card.Icon;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 7, opacity: oceansVisible ? 1 : 0, transform: oceansVisible ? 'none' : 'translateY(8px)', transition: `opacity 0.5s ease ${0.9 + i * 0.16}s, transform 0.5s ease ${0.9 + i * 0.16}s` }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${card.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CIcon size={14} color={card.color} />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)', fontFamily: 'Inter, sans-serif', lineHeight: 1.45 }}>{card.text}</div>
                        <div style={{ fontSize: 10, color: 'var(--sd-text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>{card.time}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </FadeIn>

          {/* Copy */}
          <FadeIn delay={0.18}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--sd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16, fontFamily: 'Inter, sans-serif' }}>Not ChatGPT with facts</p>
            <h2 className="sd-heading" style={{ fontSize: 'clamp(30px, 4vw, 50px)', letterSpacing: '-0.025em', marginBottom: 20, lineHeight: 1.0 }}>
              A twin that actually<br /><span style={{ color: '#c17e2c' }}>knows you.</span>
            </h2>
            <p style={{ fontSize: 16, color: 'var(--sd-text-secondary)', lineHeight: 1.7, fontFamily: 'Inter, sans-serif', marginBottom: 32 }}>
              Built from your behavioral data — not a persona you type in. Every Spotify play, every late-night work session, every reflection adds another layer of depth.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 36 }}>
              {([
                { Icon: Brain,  color: '#818cf8', text: 'OCEAN Big Five from real behavioral data, not self-report' },
                { Icon: Zap,    color: '#c17e2c', text: 'Memory stream with 5 expert AI personas analyzing you' },
                { Icon: Shield, color: '#34d399', text: 'Privacy spectrum — you control exactly what it knows' },
              ] as const).map((item, i) => {
                const IIcon = item.Icon;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1px solid ${item.color}25` }}>
                      <IIcon size={15} color={item.color} />
                    </div>
                    <span style={{ fontSize: 14, color: 'var(--sd-text-secondary)', fontFamily: 'Inter, sans-serif', lineHeight: 1.4 }}>{item.text}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="sd-btn-dark" onClick={() => navigate('/auth')} style={{ borderRadius: 100, height: 44, padding: '0 28px', fontSize: 14, fontFamily: '"Geist", Inter, sans-serif' }}>Start for free</button>
              <button className="sd-btn-ghost" onClick={() => navigate('/prototype/chat')} style={{ height: 44, padding: '0 24px', fontSize: 14 }}>Try the demo</button>
            </div>
          </FadeIn>
        </div>
      </div>

      {/* ── Feature Tabs ── */}
      <div style={{ position: 'relative', zIndex: 2, padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 44 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--sd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, fontFamily: 'Inter, sans-serif' }}>How it works</p>
              <h2 className="sd-heading" style={{ fontSize: 'clamp(26px, 4vw, 40px)', letterSpacing: '-0.025em' }}>Four layers of knowing you</h2>
            </div>
          </FadeIn>

          {/* Tab buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
            {TABS.map(t => {
              const TIcon = t.Icon;
              const isActive = t.id === activeTab;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 100, background: isActive ? `${t.color}18` : 'rgba(255,255,255,0.04)', border: `1px solid ${isActive ? t.color + '45' : 'rgba(255,255,255,0.08)'}`, color: isActive ? t.color : 'var(--sd-text-secondary)', fontSize: 13, fontFamily: 'Inter, sans-serif', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s ease' }}>
                  <TIcon size={14} />{t.label}
                </button>
              );
            })}
          </div>

          {/* Tab panel */}
          <div className="sd-card" style={{ overflow: 'hidden', padding: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 360 }}>
              <div style={{ padding: '48px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: `${tab.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, border: `1px solid ${tab.color}25` }}>
                  <TabIcon size={20} color={tab.color} />
                </div>
                <h3 style={{ fontFamily: '"Instrument Serif", Georgia, serif', fontSize: 28, color: 'var(--sd-fg)', letterSpacing: '-0.5px', marginBottom: 14, lineHeight: 1.1 }}>{tab.headline}</h3>
                <p style={{ fontSize: 14, color: 'var(--sd-text-secondary)', lineHeight: 1.7, fontFamily: 'Inter, sans-serif' }}>{tab.desc}</p>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.18)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TabPlayer tabId={activeTab} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <FadeIn>
        <div style={{ position: 'relative', zIndex: 2, padding: '80px 24px 100px', textAlign: 'center' }}>
          <blockquote style={{ fontSize: 16, color: 'var(--sd-text-muted)', fontStyle: 'italic', fontFamily: '"Instrument Serif", Georgia, serif', maxWidth: 480, margin: '0 auto 36px', lineHeight: 1.7 }}>
            "Perhaps we are searching in the branches for what we only find in the roots."
            <br /><span style={{ fontSize: 12, fontStyle: 'normal', fontFamily: 'Inter, sans-serif', opacity: 0.7 }}>— Rami</span>
          </blockquote>
          <h2 className="sd-heading" style={{ fontSize: 'clamp(32px, 5vw, 56px)', letterSpacing: '-0.025em', marginBottom: 18, lineHeight: 1.0 }}>
            Find what makes you<br /><span style={{ color: '#c17e2c' }}>authentically you.</span>
          </h2>
          <p style={{ fontSize: 16, color: 'var(--sd-text-secondary)', marginBottom: 36, fontFamily: 'Inter, sans-serif' }}>Free for early access.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="sd-btn-dark" onClick={() => navigate('/auth')} style={{ borderRadius: 100, height: 46, padding: '0 32px', fontSize: 15, fontFamily: '"Geist", Inter, sans-serif' }}>Start for free</button>
            <button className="sd-btn-ghost" onClick={() => navigate('/prototype/chat')} style={{ height: 46, padding: '0 28px', fontSize: 15 }}>Try the demo</button>
          </div>
        </div>
      </FadeIn>

    </div>
  );
}

// ── Remotion tab players ──
const TAB_CONFIGS: Record<string, { component: React.ComponentType; duration: number; w: number; h: number }> = {
  remember: { component: MemoryFlow,     duration: 160, w: 400, h: 320 },
  discover: { component: PlatformMosaic, duration: 160, w: 400, h: 320 },
  reflect:  { component: SoulPortrait,   duration: 180, w: 400, h: 320 },
  chat:     { component: TwinDialog,     duration: 220, w: 400, h: 320 },
};

function TabPlayer({ tabId }: { tabId: string }) {
  const cfg = TAB_CONFIGS[tabId] ?? TAB_CONFIGS.remember;
  return (
    <Player
      key={tabId}
      component={cfg.component}
      durationInFrames={cfg.duration}
      compositionWidth={cfg.w}
      compositionHeight={cfg.h}
      fps={30}
      loop
      autoPlay
      style={{ width: '100%', height: '100%' }}
    />
  );
}
