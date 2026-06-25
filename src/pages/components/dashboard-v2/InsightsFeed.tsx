import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  TrendingUp, AlertTriangle, PartyPopper, Heart,
  Lightbulb, Target, Compass,
  Activity, Sparkles, BatteryCharging, Gauge,
} from 'lucide-react';
import type { ProactiveInsight, InsightCategory } from '@/types/dashboard';
import type { NudgeFeedbackPayload } from '@/hooks/useProactiveInsights';
import { SourceChips } from './SourceChips';
// audit-2026-05-23 demo mode plumbing removed

interface InsightsFeedProps {
  insights: ProactiveInsight[];
  heroInsightId?: string;
  onEngage: (id: string) => void;
  // Returns a promise so we only toast success after the request resolves and
  // can roll back the optimistic archive on failure.
  onFeedback?: (payload: NudgeFeedbackPayload) => Promise<unknown>;
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
  // Cross-domain self-revelations — distinct identity, not a generic tip
  stress_correlation: <Activity className="w-4 h-4" />,
  energy_correlation: <Sparkles className="w-4 h-4" />,
  social_battery:     <BatteryCharging className="w-4 h-4" />,
  work_rhythm:        <Gauge className="w-4 h-4" />,
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

  // Track optimistically-archived ids so the fade-out animation runs even
  // before the query cache is updated by the mutation's onMutate.
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set());

  // Filter out the hero insight + categories that have their own dedicated
  // dashboard cards (email_triage → EmailTriageCard, relationship_followup
  // → RelationshipsCard). Take max 5 of what remains.
  const DEDICATED_CARD_CATEGORIES = new Set(['email_triage', 'relationship_followup']);
  // INTERNAL_CATEGORIES are cache markers and debug rows that historically
  // got persisted into proactive_insights with `delivered=true` even though
  // they aren't user content (audit 2026-05-21: 39 of 139 rows were
  // morning_briefing_cache, competing for the 5 feed slots with real
  // insights). Hide them from the feed without touching the storage layer
  // — the morning-briefing surface still reads its cache via category.
  const INTERNAL_CATEGORIES = new Set([
    'morning_briefing_cache',
    'wiki_lint',
    'test',
  ]);
  const displayInsights = insights
    .filter(i =>
      i.id !== heroInsightId &&
      !archivedIds.has(i.id) &&
      !DEDICATED_CARD_CATEGORIES.has(i.category) &&
      !INTERNAL_CATEGORIES.has(i.category)
    )
    .slice(0, 5);

  if (displayInsights.length === 0) return null;

  const handleDiscuss = (insight: ProactiveInsight) => {
    onEngage(insight.id);
    navigate('/talk-to-twin', { state: { discussContext: insight.insight } });
  };

  const handleFeedback = async (insight: ProactiveInsight, followed: boolean) => {
    if (!onFeedback) return;
    // Optimistically archive immediately for fade-out
    setArchivedIds(prev => {
      const next = new Set(prev);
      next.add(insight.id);
      return next;
    });
    try {
      await onFeedback({ id: insight.id, followed });
      // Only confirm once the server actually recorded the feedback.
      toast('Thanks — your twin is learning');
    } catch {
      // Roll back the optimistic archive so the insight reappears, and tell
      // the user the action did not go through.
      setArchivedIds(prev => {
        const next = new Set(prev);
        next.delete(insight.id);
        return next;
      });
      toast('Could not save your feedback. Please try again.');
    }
  };

  return (
    <section className="mb-12">
      <h2
        className="text-[11px] uppercase tracking-[0.15em] font-medium mb-4"
        style={{ color: 'var(--text-narrative-muted)' }}
      >
        Recent observations
      </h2>

      <div className="flex flex-col gap-3">
        {displayInsights.map(insight => {
          const isPending = feedbackPendingId === insight.id;
          const canFeedback = !!onFeedback;
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
                  {/* Defensive: stored insights generated before 2026-06-10 may
                      still carry a leaked leading category tag like "[celebration]" */}
                  {insight.insight.replace(/^\s*\[[a-z_ -]{2,24}\]\s*/i, '')}
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
