import React, { useState } from 'react';
import { Brain, Layers, MessageSquare, Database, Filter } from 'lucide-react';
import '../sundust.css';
import { SundustStatCard } from '../components/SundustStatCard';
import { SundustProgressBar } from '../components/SundustProgressBar';
import { SundustSectionLabel } from '../components/SundustSectionLabel';
import { SundustBadge } from '../components/SundustBadge';

type FilterType = 'all' | 'reflection' | 'fact' | 'platform_data' | 'conversation';

const memoryStats = [
  { label: 'Total Memories', value: '16,482', sub: '+312 this week', trend: 'up' as const },
  { label: 'Reflections', value: '847', sub: '5.1% of total', trend: 'up' as const },
  { label: 'Facts Extracted', value: '4,230', sub: 'From 5 platforms' },
  { label: 'Twin Quality Score', value: '0.742', sub: 'Top 15% of users', trend: 'up' as const },
];

const memoryTypes = [
  { type: 'Facts', count: 8193, pct: 49.7, color: '#c17e2c', icon: <Database size={14} /> },
  { type: 'Reflections', count: 4465, pct: 27.1, color: '#818cf8', icon: <Brain size={14} /> },
  { type: 'Conversations', count: 2044, pct: 12.4, color: '#34d399', icon: <MessageSquare size={14} /> },
  { type: 'Platform Data', count: 1780, pct: 10.8, color: '#fb923c', icon: <Layers size={14} /> },
];

const recentMemories = [
  { type: 'reflection', badge: 'Reflection', color: '#818cf8', badgeBg: 'rgba(129,140,248,0.12)', badgeBorder: 'rgba(129,140,248,0.25)', text: 'Stefano shows a consistent pattern of Brazilian pagode during his afternoon focus blocks — this music serves as a cognitive anchor for sustained creative work.', time: '2h ago', expert: 'Lifestyle Analyst' },
  { type: 'fact', badge: 'Fact', color: '#c17e2c', badgeBg: 'rgba(193,126,44,0.12)', badgeBorder: 'rgba(193,126,44,0.25)', text: 'Top Spotify genre this month: Brazilian Pagode (38% listening share)', time: '3h ago', expert: 'Spotify' },
  { type: 'platform_data', badge: 'Platform', color: '#fb923c', badgeBg: 'rgba(251,146,60,0.1)', badgeBorder: 'rgba(251,146,60,0.2)', text: 'Google Calendar: 3 deep-work blocks scheduled for 9–11 AM this week (Mon/Wed/Fri)', time: '5h ago', expert: 'Google Calendar' },
  { type: 'reflection', badge: 'Reflection', color: '#818cf8', badgeBg: 'rgba(129,140,248,0.12)', badgeBorder: 'rgba(129,140,248,0.25)', text: 'Career and music patterns suggest Stefano is an intrinsically motivated builder — most engaged when working from first principles on novel problems.', time: 'Yesterday', expert: 'Motivation Analyst' },
  { type: 'fact', badge: 'Fact', color: '#c17e2c', badgeBg: 'rgba(193,126,44,0.12)', badgeBorder: 'rgba(193,126,44,0.25)', text: 'YouTube watch time: 4.2h this week, 60% tech/startup content, 30% Brazilian culture', time: 'Yesterday', expert: 'YouTube' },
  { type: 'conversation', badge: 'Chat', color: '#34d399', badgeBg: 'rgba(52,211,153,0.1)', badgeBorder: 'rgba(52,211,153,0.2)', text: 'Asked twin about productivity patterns → twin identified morning cognitive peak', time: '2 days ago', expert: 'Twin Chat' },
];

const platformHealth = [
  { name: 'Spotify', pct: 94, status: 'connected' as const, memories: '6,240' },
  { name: 'Google Calendar', pct: 88, status: 'connected' as const, memories: '4,102' },
  { name: 'YouTube', pct: 71, status: 'connected' as const, memories: '3,890' },
  { name: 'Discord', pct: 0, status: 'disconnected' as const, memories: '—' },
  { name: 'LinkedIn', pct: 0, status: 'disconnected' as const, memories: '—' },
];

export default function PrototypeBrain() {
  const [filter, setFilter] = useState<FilterType>('all');

  const filtered = filter === 'all' ? recentMemories : recentMemories.filter(m => m.type === filter);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: 28 }} className="sd-scroll">
      <div style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>

        {/* Header */}
        <div style={{ marginBottom: 4 }}>
          <h1 className="sd-heading" style={{ fontSize: 28, marginBottom: 6 }}>Memory Brain</h1>
          <p style={{ fontSize: 14, color: 'var(--sd-text-secondary)' }}>Everything your twin has learned about you.</p>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {memoryStats.map((s, i) => (
            <SundustStatCard key={i} label={s.label} value={s.value} sub={s.sub} trend={s.trend} />
          ))}
        </div>

        {/* Memory composition */}
        <div>
          <SundustSectionLabel>Memory Composition</SundustSectionLabel>
          <div className="sd-card" style={{ padding: '24px', borderRadius: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {memoryTypes.map((t, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 64px', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.color }}>
                    {t.icon}
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sd-fg)' }}>{t.type}</span>
                  </div>
                  <SundustProgressBar value={t.pct} color={t.color} height={4} />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sd-fg)' }}>{t.count.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--sd-text-muted)' }}>{t.pct}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Platform health */}
        <div>
          <SundustSectionLabel>Platform Data Sources</SundustSectionLabel>
          <div className="sd-card" style={{ borderRadius: 8, overflow: 'hidden' }}>
            {platformHealth.map((p, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: i < platformHealth.length - 1 ? '1px solid var(--sd-separator)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sd-fg)' }}>{p.name}</span>
                  {p.status === 'connected' && (
                    <div style={{ flex: 1, maxWidth: 160 }}>
                      <SundustProgressBar value={p.pct} color="#34d399" height={3} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--sd-text-muted)' }}>{p.memories}</span>
                  <SundustBadge variant={p.status} dot>{p.status === 'connected' ? 'Connected' : 'Not connected'}</SundustBadge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Memory stream */}
        <div>
          <SundustSectionLabel action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={12} style={{ color: 'var(--sd-text-muted)' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all', 'reflection', 'fact', 'platform_data', 'conversation'] as FilterType[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: '3px 10px',
                      borderRadius: 100,
                      fontSize: 11,
                      fontWeight: 500,
                      border: '1px solid',
                      cursor: 'pointer',
                      background: filter === f ? 'var(--sd-fg)' : 'transparent',
                      color: filter === f ? 'var(--sd-bg)' : 'var(--sd-text-muted)',
                      borderColor: filter === f ? 'var(--sd-fg)' : 'var(--glass-surface-border)',
                      fontFamily: 'Inter, sans-serif',
                    }}
                  >
                    {f === 'all' ? 'All' : f === 'platform_data' ? 'Platform' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          }>
            Memory Stream
          </SundustSectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((m, i) => (
              <div key={i} className="sd-card" style={{ padding: '16px 20px', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className="sd-status-badge"
                      style={{ background: m.badgeBg, color: m.color, border: `1px solid ${m.badgeBorder}`, borderRadius: 100 }}
                    >
                      {m.badge}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--sd-text-muted)' }}>{m.expert}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--sd-text-muted)', flexShrink: 0 }}>{m.time}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--sd-text-secondary)', lineHeight: 1.65 }}>{m.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
