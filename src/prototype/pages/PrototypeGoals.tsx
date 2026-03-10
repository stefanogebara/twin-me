import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import '../sundust.css';
import { SundustStatCard } from '../components/SundustStatCard';
import { SundustProgressBar } from '../components/SundustProgressBar';
import { SundustBadge } from '../components/SundustBadge';
import { SundustSectionLabel } from '../components/SundustSectionLabel';

const goalStats = [
  { label: 'Active Goals', value: '4', sub: '2 on track' },
  { label: 'Completed', value: '12', sub: 'This year', trend: 'up' as const },
  { label: 'Avg Progress', value: '61%', sub: 'Across all goals' },
  { label: 'Streak', value: '14 days', sub: 'Consistent tracking' },
];

const activeGoals = [
  {
    id: 1,
    title: 'Listen to music 1h/day',
    desc: 'Build a consistent daily music ritual to improve focus and mood.',
    progress: 78,
    target: '30 days streak',
    current: '23 days',
    status: 'on_track' as const,
    icon: '🎵',
    color: '#34d399',
    suggestion: 'Your twin suggested this based on your Spotify listening patterns showing music correlates with your best focus blocks.',
  },
  {
    id: 2,
    title: 'Schedule 3 deep-work blocks/week',
    desc: 'Protect your 9–11 AM cognitive peak with calendar blocking.',
    progress: 67,
    target: '3 per week',
    current: '2 this week',
    status: 'on_track' as const,
    icon: '🧠',
    color: '#818cf8',
    suggestion: 'Suggested after your twin noticed you perform best in structured morning blocks.',
  },
  {
    id: 3,
    title: 'Reduce YouTube to 1h/day',
    desc: 'Use YouTube intentionally for learning, not passive scrolling.',
    progress: 42,
    target: '< 1h daily',
    current: '1.8h today',
    status: 'needs_attention' as const,
    icon: '📺',
    color: '#fb923c',
    suggestion: 'Your twin noticed YouTube usage spikes in the late afternoon, displacing creative work time.',
  },
  {
    id: 4,
    title: 'Connect 2 new platforms',
    desc: 'Add Discord and LinkedIn for richer social and professional context.',
    progress: 0,
    target: '2 platforms',
    current: '0 connected',
    status: 'not_started' as const,
    icon: '🔌',
    color: '#c17e2c',
    suggestion: 'More platforms = better twin. Your soul signature has blind spots without social and professional data.',
  },
];

const suggestions = [
  { title: 'Read 20 pages/day', reason: 'YouTube watch history shows strong interest in book summaries and intellectual content.' },
  { title: 'Practice Portuguese 15 min/day', reason: 'Brazilian music dominance in your Spotify suggests strong cultural connection to Brazil.' },
  { title: 'Morning walk before deep work', reason: 'Calendar patterns show 23% better focus block completion on days with morning activity.' },
];

type GoalStatus = 'on_track' | 'needs_attention' | 'not_started';

const statusLabels: Record<GoalStatus, { label: string; variant: 'connected' | 'disconnected' | 'custom'; color?: string; bg?: string; border?: string }> = {
  on_track: { label: 'On Track', variant: 'connected' },
  needs_attention: { label: 'Needs Attention', variant: 'custom', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.2)' },
  not_started: { label: 'Not Started', variant: 'disconnected' },
};

export default function PrototypeGoals() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: 28 }} className="sd-scroll">
      <div style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h1 className="sd-heading" style={{ fontSize: 28, marginBottom: 6 }}>Goals</h1>
            <p style={{ fontSize: 14, color: 'var(--sd-text-secondary)' }}>
              Habits and goals your twin tracks automatically from your platforms.
            </p>
          </div>
          <button className="sd-btn-dark" style={{ flexShrink: 0 }}>
            <Plus size={14} /> New goal
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {goalStats.map((s, i) => (
            <SundustStatCard key={i} label={s.label} value={s.value} sub={s.sub} trend={s.trend} />
          ))}
        </div>

        {/* Active goals */}
        <div>
          <SundustSectionLabel>Active Goals</SundustSectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeGoals.map((goal) => {
              const isOpen = expanded === goal.id;
              const statusInfo = statusLabels[goal.status];
              return (
                <div
                  key={goal.id}
                  className="sd-card"
                  style={{ borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : goal.id)}
                >
                  <div style={{ padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{goal.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--sd-fg)', lineHeight: 1.3 }}>
                            {goal.title}
                          </div>
                          {statusInfo.variant === 'custom' ? (
                            <SundustBadge variant="custom" color={statusInfo.color} bg={statusInfo.bg} border={statusInfo.border}>
                              {statusInfo.label}
                            </SundustBadge>
                          ) : (
                            <SundustBadge variant={statusInfo.variant as 'connected' | 'disconnected'}>{statusInfo.label}</SundustBadge>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)', marginBottom: 14 }}>
                          {goal.desc}
                        </div>
                        <SundustProgressBar value={goal.progress} color={goal.color} height={4} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--sd-text-muted)' }}>{goal.current}</span>
                          <span style={{ fontSize: 11, color: 'var(--sd-text-muted)' }}>Target: {goal.target}</span>
                        </div>
                      </div>
                    </div>
                    {isOpen && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--sd-separator)' }}>
                        <div className="sd-section-label" style={{ marginBottom: 8 }}>Why your twin suggested this</div>
                        <div style={{ fontSize: 13, color: 'var(--sd-text-secondary)', lineHeight: 1.65, marginBottom: 12 }}>
                          {goal.suggestion}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="sd-btn-dark" style={{ fontSize: 12, height: 30 }} onClick={e => e.stopPropagation()}>Mark complete</button>
                          <button className="sd-btn-ghost" style={{ fontSize: 12 }} onClick={e => e.stopPropagation()}>Archive goal</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Twin suggestions */}
        <div>
          <SundustSectionLabel action={
            <span style={{ fontSize: 12, color: 'var(--sd-text-muted)' }}>Based on your patterns</span>
          }>
            Twin Suggestions
          </SundustSectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s, i) => (
              <div key={i} className="sd-card" style={{ padding: '16px 20px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--sd-fg)', marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--sd-text-secondary)', lineHeight: 1.5 }}>{s.reason}</div>
                </div>
                <button className="sd-btn-dark" style={{ fontSize: 12, height: 30, flexShrink: 0 }}>
                  <Plus size={12} /> Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
