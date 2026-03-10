import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, ArrowUp, Globe, MessageSquare } from 'lucide-react';
import '../sundust.css';

const suggestions = [
  { icon: '✦', text: 'What am I optimizing for?' },
  { icon: '◎', text: 'My energy patterns this week' },
  { icon: '❋', text: 'Creative work insights' },
  { icon: '⬡', text: 'Why do I procrastinate?' },
];

const recentInsights = [
  { label: 'Peak hours', value: '9–11 AM' },
  { label: 'Mood signal', value: 'Brazilian music → focused' },
  { label: 'Memory stored', value: '16,482 moments' },
];

const twinNoticed = [
  {
    icon: '◎',
    iconColor: 'var(--sd-fg)',
    title: 'Peak performance detected',
    body: 'Your 9–11 AM cognitive window is stronger than 92% of days this week. Consider scheduling deep work today.',
    badge: 'Focus',
    badgeColor: 'rgba(255,255,255,0.08)',
    badgeTextColor: 'var(--sd-fg)',
    badgeBorder: 'rgba(255,255,255,0.12)',
    gradientColors: 'rgba(245,158,11,0.5), rgba(245,158,11,0.08)',
  },
  {
    icon: '◑',
    iconColor: '#818cf8',
    title: 'Sleep consistency improving',
    body: '6 of 7 nights within your optimal range. Best streak since you started tracking.',
    badge: 'Sleep',
    badgeColor: 'rgba(129,140,248,0.12)',
    badgeTextColor: '#818cf8',
    badgeBorder: 'rgba(129,140,248,0.25)',
    gradientColors: 'rgba(129,140,248,0.45), rgba(129,140,248,0.06)',
  },
  {
    icon: '⬡',
    iconColor: '#34d399',
    title: 'Music matches mood',
    body: 'Brazilian pagode correlates with your 40-min focus blocks. It\'s becoming a ritual.',
    badge: 'Identity',
    badgeColor: 'rgba(52,211,153,0.1)',
    badgeTextColor: '#34d399',
    badgeBorder: 'rgba(52,211,153,0.2)',
    gradientColors: 'rgba(52,211,153,0.4), rgba(52,211,153,0.05)',
  },
  {
    icon: '✦',
    iconColor: '#c17e2c',
    title: 'Your soul signature emerging',
    body: 'The Empathetic Obsessive archetype is confirmed across 847 data points. 91% confidence.',
    badge: 'Archetype',
    badgeColor: 'rgba(193,126,44,0.12)',
    badgeTextColor: '#c17e2c',
    badgeBorder: 'rgba(193,126,44,0.25)',
    gradientColors: 'rgba(193,126,44,0.4), rgba(193,126,44,0.05)',
  },
];

const recentConvos = [
  { title: 'What makes me unique?', time: '2h ago' },
  { title: 'My morning routine patterns', time: 'Yesterday' },
];

export default function PrototypeDashboard() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
        className="sd-scroll"
      >
        {/* TOP — greeting + chatbox */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 32px 48px',
          position: 'relative',
          minHeight: '56vh',
        }}>
          {/* Ambient glow */}
          <div style={{
            position: 'absolute',
            width: 520,
            height: 340,
            left: '50%',
            top: '62%',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(193,126,44,0.35) 0%, rgba(255,132,0,0.15) 40%, transparent 70%)',
            filter: 'blur(72px)',
            pointerEvents: 'none',
            zIndex: 0,
          }} />

          {/* Greeting */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', marginBottom: 36 }}>
            <div
              className="sd-badge"
              style={{ margin: '0 auto 20px', display: 'inline-flex' }}
            >
              <Globe size={13} />
              Your twin is ready
            </div>
            <h1
              className="sd-heading"
              style={{ fontSize: 44, letterSpacing: '-1px', marginBottom: 12 }}
            >
              Good morning, Stefano
            </h1>
            <p style={{ fontSize: 15, color: 'var(--sd-text-secondary)', lineHeight: 1.65, maxWidth: 440 }}>
              Based on your patterns, you&apos;re entering your peak creative window.
              3 new insights since yesterday.
            </p>
          </div>

          {/* Stats strip */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            gap: 10,
            marginBottom: 32,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}>
            {recentInsights.map((item, i) => (
              <div key={i} style={{
                background: 'var(--sd-glass-bg)',
                border: '1px solid var(--sd-glass-border)',
                borderRadius: 8,
                padding: '10px 20px',
                textAlign: 'center',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
              }}>
                <div style={{
                  fontSize: 11,
                  color: 'var(--sd-text-muted)',
                  marginBottom: 5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 500,
                }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* Chat input */}
          <div style={{ width: '100%', maxWidth: 640, position: 'relative', zIndex: 1 }}>
            <div className="sd-chatbox" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask your twin anything..."
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--sd-fg)',
                    fontSize: 14,
                    fontFamily: 'Inter, sans-serif',
                    resize: 'none',
                    minHeight: 44,
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'rgba(17,15,15,0.25)',
                    border: '1px solid var(--sd-glass-border)',
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
                    <ArrowUp size={14} color="#fdfcfb" />
                  </button>
                </div>
              </div>
            </div>

            {/* Suggestion chips */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
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

        {/* Divider */}
        <div style={{
          height: 1,
          background: 'var(--sd-separator)',
          margin: '0 32px',
        }} />

        {/* BOTTOM — What your twin noticed */}
        <div style={{
          padding: '40px 32px 56px',
          maxWidth: 1100,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}>
          {/* Section header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--sd-text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              What your twin noticed
            </span>
            <button
              onClick={() => navigate('/prototype/brain')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--sd-text-muted)',
                padding: 0,
                fontFamily: 'Inter, sans-serif',
                fontWeight: 500,
              }}
            >
              View all
            </button>
          </div>

          {/* 2x2 card grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16,
            marginBottom: 40,
          }}>
            {twinNoticed.map((card, i) => (
              <div key={i} className="sd-card" style={{ padding: 0, borderRadius: 12, overflow: 'hidden' }}>
                {/* Gradient thumbnail strip */}
                <div style={{
                  height: 80,
                  background: `linear-gradient(160deg, ${card.gradientColors})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}>
                  <span style={{ fontSize: 28, lineHeight: 1, color: card.iconColor, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' }}>
                    {card.icon}
                  </span>
                </div>
                {/* Card content */}
                <div style={{ padding: '18px 22px 22px' }}>
                  <div style={{ marginBottom: 10 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 10px',
                      borderRadius: 100,
                      background: card.badgeColor,
                      color: card.badgeTextColor,
                      border: `1px solid ${card.badgeBorder}`,
                      letterSpacing: '0.02em',
                    }}>
                      {card.badge}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--sd-fg)',
                    marginBottom: 8,
                    lineHeight: 1.35,
                  }}>
                    {card.title}
                  </div>
                  <div style={{
                    fontSize: 13,
                    color: 'var(--sd-text-secondary)',
                    lineHeight: 1.6,
                  }}>
                    {card.body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent activity label */}
          <div style={{
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--sd-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 14,
          }}>
            Recent activity
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentConvos.map((convo, i) => (
              <button
                key={i}
                onClick={() => navigate('/prototype/chat')}
                className="sd-card"
                style={{
                  padding: '14px 20px',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  border: 'none',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'opacity 0.15s ease',
                }}
              >
                <MessageSquare size={14} style={{ color: 'var(--sd-text-muted)', flexShrink: 0 }} />
                <span style={{
                  flex: 1,
                  fontSize: 14,
                  color: 'var(--sd-text-secondary)',
                  fontFamily: 'Inter, sans-serif',
                }}>
                  {convo.title}
                </span>
                <span style={{
                  fontSize: 12,
                  color: 'var(--sd-text-muted)',
                  flexShrink: 0,
                  fontFamily: 'Inter, sans-serif',
                }}>
                  {convo.time}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
