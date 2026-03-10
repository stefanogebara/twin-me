import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import '../sundust.css';
import { SundustProgressBar } from '../components/SundustProgressBar';
import { SundustSectionLabel } from '../components/SundustSectionLabel';

const OCEAN = [
  { trait: 'Openness', score: 82, desc: 'Highly curious, creative thinker. Seeks novel experiences and ideas across music, technology, and culture.', color: '#c17e2c' },
  { trait: 'Conscientiousness', score: 61, desc: 'Moderately disciplined. Strong in focused work blocks but prefers flexibility over rigid structure.', color: '#818cf8' },
  { trait: 'Extraversion', score: 44, desc: 'Ambiverted. Recharges in focused solo work but energized by deep 1-on-1 conversations.', color: '#34d399' },
  { trait: 'Agreeableness', score: 74, desc: 'Collaborative and empathetic. Prioritizes harmony but holds firm on values.', color: '#fb923c' },
  { trait: 'Neuroticism', score: 38, desc: 'Emotionally stable. Handles stress well, especially during creative deep-work sessions.', color: '#f472b6' },
];

const expertInsights = [
  {
    expert: 'Personality Psychologist',
    icon: '◎',
    iconColor: 'var(--sd-fg)',
    badge: 'Core Identity',
    badgeColor: 'rgba(255,255,255,0.08)',
    badgeTextColor: 'var(--sd-fg)',
    badgeBorder: 'rgba(255,255,255,0.12)',
    title: 'High-Openness Analytical Creator',
    body: 'You show a rare combination of analytical depth and creative range. Your Big Five pattern suggests an "Integrative Thinker" — someone who systematically explores possibilities before committing to a direction.',
  },
  {
    expert: 'Lifestyle Analyst',
    icon: '◑',
    iconColor: '#818cf8',
    badge: 'Rhythms',
    badgeColor: 'rgba(129,140,248,0.12)',
    badgeTextColor: '#818cf8',
    badgeBorder: 'rgba(129,140,248,0.25)',
    title: '9–11 AM is your peak cognitive window',
    body: "Calendar and Spotify data converge: you schedule demanding tasks in the morning and shift to Brazilian pagode during afternoon creative work. This isn't random — it's a ritual your brain has self-optimized.",
  },
  {
    expert: 'Cultural Identity Expert',
    icon: '⬡',
    iconColor: '#34d399',
    badge: 'Taste',
    badgeColor: 'rgba(52,211,153,0.1)',
    badgeTextColor: '#34d399',
    badgeBorder: 'rgba(52,211,153,0.2)',
    title: 'Eclectic curator with deep roots',
    body: "Across Spotify, YouTube, and Discord, you show breadth (genres from pagode to ambient to hip-hop) but depth in Brazilian music culture specifically. You're an explorer who still has a home base.",
  },
  {
    expert: 'Social Dynamics Analyst',
    icon: '✦',
    iconColor: '#fb923c',
    badge: 'Social',
    badgeColor: 'rgba(251,146,60,0.1)',
    badgeTextColor: '#fb923c',
    badgeBorder: 'rgba(251,146,60,0.2)',
    title: 'Deep 1:1 connector, not a broadcaster',
    body: 'Discord and Calendar patterns suggest you invest deeply in a few key relationships rather than maintaining a large network. Fewer but higher-quality connections is your social signature.',
  },
  {
    expert: 'Motivation Analyst',
    icon: '❋',
    iconColor: '#c17e2c',
    badge: 'Drive',
    badgeColor: 'rgba(193,126,44,0.12)',
    badgeTextColor: '#c17e2c',
    badgeBorder: 'rgba(193,126,44,0.25)',
    title: 'Intrinsically motivated builder',
    body: "Your work patterns reveal someone driven by craft and impact more than external validation. You're most energized when building something from first principles — which explains the late-night deep work sessions.",
  },
];

const archetypes = [
  { label: 'The Empathetic Obsessive', match: 91 },
  { label: 'The Analytical Creator', match: 84 },
  { label: 'The Quiet Visionary', match: 78 },
];

export default function PrototypeIdentity() {
  const [openExpert, setOpenExpert] = useState<number | null>(0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: 32 }} className="sd-scroll">
      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: 8 }}>
          <h1 className="sd-heading" style={{ fontSize: 32, marginBottom: 8 }}>Who You Are</h1>
          <p style={{ fontSize: 14, color: 'var(--sd-text-secondary)', lineHeight: 1.6 }}>
            Your soul signature, built from 16,482 memories across 5 platforms.
          </p>
        </div>

        {/* Archetype card */}
        <div className="sd-card" style={{ padding: '24px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(193,126,44,0.15) 0%, rgba(27,24,24,0.7) 60%)', marginBottom: 4 }}>
          <div className="sd-section-label" style={{ marginBottom: 10 }}>Your Archetype</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--sd-fg)', letterSpacing: '-0.02em', marginBottom: 6 }}>
            The Empathetic Obsessive
          </div>
          <div style={{ fontSize: 13, color: 'var(--sd-text-secondary)', lineHeight: 1.6, maxWidth: 520 }}>
            You go deep on everything you care about. Your curiosity isn't casual — it's obsessive in the best way. And you carry genuine empathy into your work, relationships, and creative output.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {archetypes.map((a, i) => (
              <div key={i} style={{
                background: i === 0 ? 'rgba(193,126,44,0.2)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${i === 0 ? 'rgba(193,126,44,0.4)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 100,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 500,
                color: i === 0 ? '#c17e2c' : 'var(--sd-text-muted)',
              }}>
                {a.label} · {a.match}%
              </div>
            ))}
          </div>
        </div>

        {/* OCEAN Big Five */}
        <div>
          <SundustSectionLabel action={
            <span style={{ fontSize: 12, color: 'var(--sd-text-muted)' }}>Based on 847 analysis points</span>
          }>
            Big Five Personality (OCEAN)
          </SundustSectionLabel>
          <div className="sd-card" style={{ padding: '24px', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {OCEAN.map((item, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)' }}>{item.trait}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.score}</span>
                </div>
                <SundustProgressBar value={item.score} color={item.color} height={5} />
                <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)', lineHeight: 1.5, marginTop: 8 }}>
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expert Insights accordion */}
        <div>
          <SundustSectionLabel>Expert Insights</SundustSectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expertInsights.map((insight, i) => (
              <div key={i} className="sd-card" style={{ borderRadius: 8, overflow: 'hidden' }}>
                <button
                  onClick={() => setOpenExpert(openExpert === i ? null : i)}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                    <span style={{ fontSize: 16, color: insight.iconColor }}>{insight.icon}</span>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--sd-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                        {insight.expert}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)' }}>{insight.title}</div>
                    </div>
                  </div>
                  {openExpert === i
                    ? <ChevronDown size={15} style={{ color: 'var(--sd-text-muted)', flexShrink: 0 }} />
                    : <ChevronRight size={15} style={{ color: 'var(--sd-text-muted)', flexShrink: 0 }} />
                  }
                </button>
                {openExpert === i && (
                  <div style={{ padding: '0 20px 20px 46px', fontSize: 13, color: 'var(--sd-text-secondary)', lineHeight: 1.7 }}>
                    {insight.body}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
