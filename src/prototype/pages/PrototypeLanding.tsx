import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, ArrowUp, Globe, Zap, Shield, Brain, Lock } from 'lucide-react';
import '../sundust.css';

const suggestions = [
  { icon: '✦', text: 'What makes me unique?' },
  { icon: '◎', text: 'Analyze my patterns' },
  { icon: '❋', text: 'My energy rhythms' },
  { icon: '⬡', text: 'Social dynamics' },
];

const platformLogos = [
  { name: 'Spotify', color: '#1DB954', letter: 'S' },
  { name: 'Google Calendar', color: '#4285F4', letter: 'G' },
  { name: 'YouTube', color: '#FF0000', letter: 'Y' },
  { name: 'Whoop', color: '#00D4FF', letter: 'W' },
  { name: 'Twitch', color: '#9146FF', letter: 'T' },
];

const features = [
  {
    icon: <Brain size={18} color="#c17e2c" />,
    title: 'Soul Signature',
    desc: 'OCEAN Big Five personality, expert insights across 5 domains, and your unique archetype — all built from real behavioral data.',
  },
  {
    icon: <Zap size={18} color="#818cf8" />,
    title: 'Instant insights',
    desc: "Patterns you've never noticed about yourself — surfaced daily from your Spotify, Calendar, YouTube, and more.",
  },
  {
    icon: <Globe size={18} color="#34d399" />,
    title: '5 deep integrations',
    desc: 'Spotify, Google Calendar, YouTube, Whoop, Twitch. Quality over quantity — 5 great connections beat 50 shallow ones.',
  },
  {
    icon: <Shield size={18} color="#fb923c" />,
    title: 'Privacy spectrum',
    desc: 'You control exactly what your twin knows. The privacy dashboard is not a legal footnote — it is the core trust feature.',
  },
  {
    icon: <Brain size={18} color="#f472b6" />,
    title: '16K+ memories',
    desc: 'Your twin builds a living memory stream from every platform. The more it knows, the more it sounds like you.',
  },
  {
    icon: <Lock size={18} color="#c17e2c" />,
    title: 'Your data stays yours',
    desc: 'End-to-end encrypted. Never sold. Never used to train AI models. You can delete everything, anytime.',
  },
];

export default function PrototypeLanding() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  return (
    <div className="sundust" style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflowX: 'hidden',
    }}>

      {/* ── Floating Navbar ── */}
      <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'center', position: 'relative', zIndex: 10 }}>
        <nav className="sd-navbar" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 36,
          paddingLeft: 20,
          paddingRight: 12,
          paddingTop: 10,
          paddingBottom: 10,
        }}>
          {/* Logo */}
          <button
            onClick={() => navigate('/prototype')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
              <img src="/images/backgrounds/flower.png" alt="Twin Me" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{
              fontFamily: '"Instrument Serif", Georgia, serif',
              fontSize: 20,
              fontWeight: 400,
              color: '#fdfcfb',
              letterSpacing: '-0.02em',
            }}>
              Twin Me
            </span>
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />

          {/* Nav links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {['Features', 'How it works', 'Pricing'].map(link => (
              <button
                key={link}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(217,209,203,0.8)',
                  fontSize: 14,
                  fontFamily: 'Poppins, Inter, sans-serif',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {link}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />

          {/* CTA buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="sd-btn-ghost"
              onClick={() => navigate('/auth')}
              style={{ color: 'rgba(217,209,203,0.8)', fontSize: 14 }}
            >
              Sign in
            </button>
            <button
              className="sd-btn-dark"
              onClick={() => navigate('/auth')}
              style={{ borderRadius: 100, height: 32, padding: '0 16px', fontSize: 13 }}
            >
              Get started
            </button>
          </div>
        </nav>
      </div>

      {/* ── Hero ── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px 40px',
        position: 'relative',
        zIndex: 2,
      }}>
        {/* Amber glow radial blob */}
        <div style={{
          position: 'absolute',
          width: 560,
          height: 560,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -60%)',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(193,126,44,0.65) 0%, rgba(255,132,0,0.35) 30%, rgba(193,126,44,0.1) 60%, transparent 80%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }} />

        {/* Badge */}
        <div className="sd-badge" style={{ marginBottom: 28 }}>
          <Globe size={13} />
          Generative Agents · Soul Signature Platform
        </div>

        {/* Heading */}
        <h1 className="sd-heading" style={{
          fontSize: 60,
          textAlign: 'center',
          marginBottom: 20,
          letterSpacing: '-1.2px',
          maxWidth: 680,
          lineHeight: 1.0,
        }}>
          Your AI Twin,<br />
          <span style={{ color: '#c17e2c' }}>authentically</span> you
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 17,
          color: 'var(--sd-text-secondary)',
          textAlign: 'center',
          marginBottom: 52,
          maxWidth: 480,
          lineHeight: 1.65,
        }}>
          Discover your soul signature through your digital footprints. An AI twin built from 16,000+ real memories — not a chatbot, but a mirror.
        </p>

        {/* Chat input */}
        <div style={{ width: '100%', maxWidth: 680 }}>
          <div className="sd-chatbox" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask your twin anything about yourself..."
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--sd-fg)',
                  fontSize: 14,
                  fontFamily: 'Inter, sans-serif',
                  resize: 'none',
                  minHeight: 52,
                  maxHeight: 120,
                  lineHeight: 1.5,
                }}
                rows={2}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    navigate('/prototype/chat');
                  }
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(17,15,15,0.4)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 200,
                  padding: '2px 8px',
                  color: 'var(--sd-text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                }}>
                  <Paperclip size={13} />
                  Attach
                </button>
                <button
                  className="sd-send-btn"
                  disabled={!input.trim()}
                  onClick={() => navigate('/prototype/chat')}
                >
                  <ArrowUp size={14} color="#110f0f" />
                </button>
              </div>
            </div>
          </div>

          {/* Suggestion chips */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="sd-chip"
                onClick={() => { setInput(s.text); navigate('/prototype/chat'); }}
              >
                <span style={{ fontSize: 12, lineHeight: 1 }}>{s.icon}</span>
                {s.text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Twin Insights Showcase (equiv. to Figma "From the community") ── */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        padding: '32px 24px 16px',
        maxWidth: 860,
        margin: '0 auto',
        width: '100%',
      }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--sd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, textAlign: 'center' }}>
          What your twin discovers
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { icon: '🎵', color: '#1DB954', label: 'Music identity', preview: 'Brazilian pagode when focused, Radiohead when melancholy. Music is your emotional regulator — not background noise.', tag: 'Cultural' },
            { icon: '⏰', color: '#c17e2c', label: 'Energy rhythm', preview: 'Peak cognitive window: 9–11 AM. Your best creative work happens before the world catches up with you.', tag: 'Lifestyle' },
            { icon: '🧠', color: '#818cf8', label: 'Archetype', preview: '"The Empathetic Obsessive" — you go deep on everything you care about. 91% match confidence.', tag: 'Personality' },
          ].map((item, i) => (
            <div key={i} className="sd-card" style={{ padding: '20px', borderRadius: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: item.color,
                  background: `${item.color}18`,
                  border: `1px solid ${item.color}30`,
                  borderRadius: 4,
                  padding: '2px 6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>{item.tag}</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--sd-fg)', marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: 'var(--sd-text-muted)', lineHeight: 1.6 }}>{item.preview}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Platform logos strip ── */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--sd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Your twin learns from
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
          {platformLogos.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: p.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}>
                {p.letter}
              </div>
              <span style={{ fontSize: 13, color: 'var(--sd-text-secondary)', fontWeight: 500 }}>{p.name}</span>
              {i < platformLogos.length - 1 && (
                <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.12)', fontSize: 16 }}>·</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Features grid ── */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        padding: '64px 24px',
        maxWidth: 1000,
        margin: '0 auto',
        width: '100%',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--sd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Why TwinMe
          </div>
          <h2 className="sd-heading" style={{ fontSize: 36, marginBottom: 12 }}>Not ChatGPT with facts</h2>
          <p style={{ fontSize: 15, color: 'var(--sd-text-secondary)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
            Your twin embodies your personality. It knows your morning routine, your taste in music, your social rhythms — and grows smarter every day.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {features.map((f, i) => (
            <div key={i} className="sd-card" style={{ padding: '24px', borderRadius: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}>
                {f.icon}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--sd-fg)', marginBottom: 8 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: 'var(--sd-text-muted)', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA section ── */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        padding: '64px 24px 80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
        textAlign: 'center',
      }}>
        <div style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(193,126,44,0.3) 0%, transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }} />
        <h2 className="sd-heading" style={{ fontSize: 40, maxWidth: 500, lineHeight: 1.1, zIndex: 1 }}>
          Find what makes you<br />authentically you
        </h2>
        <p style={{ fontSize: 15, color: 'var(--sd-text-secondary)', maxWidth: 400, lineHeight: 1.6, zIndex: 1 }}>
          Perhaps we are searching in the branches for what we only find in the roots.
        </p>
        <div style={{ display: 'flex', gap: 12, zIndex: 1 }}>
          <button
            className="sd-btn-pill"
            onClick={() => navigate('/auth')}
            style={{ fontSize: 15, padding: '12px 28px' }}
          >
            Start for free
          </button>
          <button
            className="sd-btn-ghost"
            onClick={() => navigate('/prototype/chat')}
            style={{ fontSize: 15, padding: '12px 20px', color: 'var(--sd-text-secondary)' }}
          >
            See the demo →
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--sd-text-muted)', zIndex: 1 }}>
          No credit card required · Delete everything anytime
        </div>
      </div>
    </div>
  );
}
