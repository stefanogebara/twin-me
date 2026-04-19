import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  TrendingUp, AlertTriangle, PartyPopper, Heart,
  Lightbulb, Target, Compass,
} from 'lucide-react';
import type { ProactiveInsight, InsightCategory } from '@/types/dashboard';
import { useDemo } from '@/contexts/DemoContext';
import { DEMO_TWIN_PORTRAIT } from '@/services/demo/demoSoulSignature';
import type { NudgeFeedbackPayload } from '@/hooks/useProactiveInsights';
import { SourceChips } from './SourceChips';

const DEMO_INSIGHTS: ProactiveInsight[] = DEMO_TWIN_PORTRAIT.insights.map(i => ({
  ...i,
  engaged: false,
}));

interface InsightsFeedProps {
  insights: ProactiveInsight[];
  heroInsightId?: string;
  onEngage: (id: string) => void;
  onFeedback?: (payload: NudgeFeedbackPayload) => void;
  feedbackPendingId?: string | null;
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
  medium: '#C9B99A',
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

export function InsightsFeed({
  insights,
  heroInsightId,
  onEngage,
  onFeedback,
  feedbackPendingId,
}: InsightsFeedProps) {
  const navigate = useNavigate();
  const { isDemoMode } = useDemo();

  // Track optimistically-archived ids so the fade-out animation runs even
  // before the query cache is updated by the mutation's onMutate.
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  // Filter out the hero insight to avoid duplication, take max 5
  const feedInsights = insights
    .filter(i => i.id !== heroInsightId && !archivedIds.has(i.id))
    .slice(0, 5);

  // In demo mode, fall back to representative demo insights when feed is empty
  const displayInsights = feedInsights.length > 0
    ? feedInsights
    : isDemoMode
      ? DEMO_INSIGHTS
      : null;

  if (!displayInsights) return null;

  const handleDiscuss = (insight: ProactiveInsight) => {
    onEngage(insight.id);
    navigate('/talk-to-twin', { state: { discussContext: insight.insight } });
  };

  const handleFeedback = (insight: ProactiveInsight, followed: boolean) => {
    if (!onFeedback || isDemoMode) return;
    // Optimistically archive immediately for fade-out
    setArchivedIds(prev => {
      const next = new Set(prev);
      next.add(insight.id);
      return next;
    });
    onFeedback({ id: insight.id, followed });
    toast('Thanks — your twin is learning');
  };

  return (
    <section className="mb-12">
      <h2
        className="text-[11px] uppercase tracking-[0.15em] font-medium mb-4"
        style={{ color: 'var(--text-narrative-muted)' }}
      >
        What your twin noticed
      </h2>

      <div className="flex flex-col gap-3">
        {displayInsights.map(insight => {
          const isPending = feedbackPendingId === insight.id;
          const canFeedback = !!onFeedback && !isDemoMode;
          return (
          <div
            key={insight.id}
            className="py-3 transition-all duration-300 ease-out"
            style={{
              borderBottom: '1px solid var(--glass-surface-border)',
              opacity: isPending ? 0.5 : 1,
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
                    style={{ color: 'var(--text-narrative-secondary, #E8E0D4)' }}
                  >
                    Discuss with twin &rarr;
                  </button>
                </div>

                {/* Provenance: platforms the twin cross-correlated for this insight */}
                <SourceChips sources={insight.sources} />

                {/* Feedback actions: archive this insight + teach the twin */}
                {canFeedback && (
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleFeedback(insight, true)}
                      className="text-[11px] font-medium rounded-[100px] px-3 py-1.5 transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: '#F5F5F4',
                        color: '#110f0f',
                        border: 'none',
                      }}
                    >
                      I did this
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleFeedback(insight, false)}
                      className="text-[11px] rounded-[6px] px-2 py-1 transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed bg-transparent"
                      style={{
                        color: 'var(--text-muted, #9C9590)',
                        border: 'none',
                      }}
                    >
                      Not for me
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}
