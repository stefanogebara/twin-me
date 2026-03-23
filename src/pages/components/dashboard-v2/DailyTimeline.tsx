import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coffee, Moon, Music2, Mail, Bell, Lightbulb, TrendingUp, Zap, Bot } from 'lucide-react';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

interface TimelineItem {
  id: string;
  type: 'insight' | 'action';
  title: string;
  body: string;
  category: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  briefing: <Coffee className="w-3.5 h-3.5" />,
  evening_recap: <Moon className="w-3.5 h-3.5" />,
  music_mood_match: <Music2 className="w-3.5 h-3.5" />,
  email_triage: <Mail className="w-3.5 h-3.5" />,
  reminder: <Bell className="w-3.5 h-3.5" />,
  nudge: <Lightbulb className="w-3.5 h-3.5" />,
  trend: <TrendingUp className="w-3.5 h-3.5" />,
  pattern_alert: <Zap className="w-3.5 h-3.5" />,
};

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DailyTimeline() {
  const navigate = useNavigate();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
    fetch(`${API_URL}/dashboard/context/timeline`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => setItems(data.timeline || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetch(`${API_URL}/dashboard/context/timeline`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(r => r.json())
        .then(data => setItems(data.timeline || []))
        .catch(() => {});
    }, 5 * 60_000);

    return () => clearInterval(interval);
  }, []);

  if (loading) return null;
  if (items.length === 0) {
    return (
      <section className="mb-8">
        <h2
          className="text-[11px] uppercase tracking-[0.15em] mb-3"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          Today
        </h2>
        <div
          className="rounded-[20px] p-5 text-center"
          style={{
            background: 'var(--glass-surface-bg)',
            backdropFilter: 'blur(42px)',
            WebkitBackdropFilter: 'blur(42px)',
            border: '1px solid var(--glass-surface-border)',
          }}
        >
          <Bot className="w-5 h-5 mx-auto mb-2" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Activity will appear here as your twin learns.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2
        className="text-[11px] uppercase tracking-[0.15em] mb-3"
        style={{ color: 'rgba(255,255,255,0.25)' }}
      >
        Today
      </h2>
      <div
        className="rounded-[20px] px-4 py-3"
        style={{
          background: 'var(--glass-surface-bg)',
          backdropFilter: 'blur(42px)',
          WebkitBackdropFilter: 'blur(42px)',
          border: '1px solid var(--glass-surface-border)',
        }}
      >
        {items.slice(0, 10).map((item, i) => (
          <div
            key={item.id}
            className="flex gap-3 py-2.5"
            style={{ borderBottom: i < Math.min(items.length, 10) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
          >
            {/* Time */}
            <span className="text-[10px] w-12 shrink-0 pt-0.5 text-right" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {formatTime(item.timestamp)}
            </span>

            {/* Icon */}
            <div className="shrink-0 pt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {CATEGORY_ICONS[item.category] || <Zap className="w-3.5 h-3.5" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {item.body}
              </p>
            </div>

            {/* Discuss link */}
            <button
              onClick={() => navigate('/talk-to-twin', { state: { prefill: item.body.slice(0, 80) } })}
              className="text-[10px] shrink-0 bg-transparent border-none cursor-pointer pt-0.5 transition-opacity hover:opacity-70"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              Discuss
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
