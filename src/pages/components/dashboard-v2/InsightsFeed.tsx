import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, AlertTriangle, PartyPopper, Heart,
  Lightbulb, Target, Compass,
} from 'lucide-react';
import type { ProactiveInsight, InsightCategory } from '@/types/dashboard';

interface InsightsFeedProps {
  insights: ProactiveInsight[];
  heroInsightId?: string;
  onEngage: (id: string) => void;
}

const CATEGORY_ICON: Record<InsightCategory, React.ReactNode> = {
  trend:           <TrendingUp className="w-4 h-4" />,
  anomaly:         <AlertTriangle className="w-4 h-4" />,
  celebration:     <PartyPopper className="w-4 h-4" />,
  concern:         <Heart className="w-4 h-4" />,
  nudge:           <Lightbulb className="w-4 h-4" />,
  goal_progress:   <Target className="w-4 h-4" />,
  goal_suggestion: <Compass className="w-4 h-4" />,
};

const URGENCY_COLOR: Record<string, string> = {
  high:   '#ef4444',
  medium: '#f59e0b',
  low:    'var(--text-muted, #86807b)',
};

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function InsightsFeed({ insights, heroInsightId, onEngage }: InsightsFeedProps) {
  const navigate = useNavigate();

  // Filter out the hero insight to avoid duplication, take max 5
  const feedInsights = insights
    .filter(i => i.id !== heroInsightId)
    .slice(0, 5);

  if (feedInsights.length === 0) return null;

  const handleDiscuss = (insight: ProactiveInsight) => {
    onEngage(insight.id);
    navigate('/talk-to-twin', { state: { discussContext: insight.insight } });
  };

  return (
    <section className="mb-12">
      <h2
        className="text-[11px] uppercase tracking-[0.15em] font-medium mb-4"
        style={{ color: 'var(--text-narrative-muted)' }}
      >
        More from your twin
      </h2>

      <div className="flex flex-col gap-3">
        {feedInsights.map(insight => (
          <div
            key={insight.id}
            className="py-3"
            style={{
              borderBottom: '1px solid var(--glass-surface-border)',
            }}
          >
            <div className="flex items-start gap-3">
              {/* Category icon + urgency dot */}
              <div className="relative shrink-0 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {CATEGORY_ICON[insight.category] ?? <Lightbulb className="w-4 h-4" />}
                <div
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                  style={{ backgroundColor: URGENCY_COLOR[insight.urgency] ?? URGENCY_COLOR.low }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--foreground)' }}
                >
                  {insight.insight}
                </p>

                {/* Nudge action */}
                {insight.category === 'nudge' && insight.nudge_action && (
                  <p
                    className="text-xs mt-1 italic"
                    style={{ color: 'var(--text-secondary, #4a4242)' }}
                  >
                    Try: {insight.nudge_action}
                  </p>
                )}

                {/* Footer: timestamp + discuss link */}
                <div className="flex items-center gap-3 mt-2">
                  <span
                    className="text-[11px]"
                    style={{ color: 'var(--text-muted, #86807b)' }}
                  >
                    {relativeTime(insight.created_at)}
                  </span>
                  <button
                    onClick={() => handleDiscuss(insight)}
                    className="text-[11px] bg-transparent border-none cursor-pointer transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.97] p-0"
                    style={{ color: 'var(--text-narrative-secondary, #ff8400)' }}
                  >
                    Discuss with twin &rarr;
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
