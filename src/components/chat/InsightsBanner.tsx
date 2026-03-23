import { useState } from 'react';
import { ChevronDown, Lightbulb, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { ProactiveInsight } from '@/types/dashboard';
import { getAccessToken } from '@/services/api/apiBase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface InsightsBannerProps {
  insights: ProactiveInsight[];
  onQuickAction: (text: string) => void;
  onEngage: (id: string) => void;
}

export function InsightsBanner({ insights, onQuickAction, onEngage }: InsightsBannerProps) {
  const [expanded, setExpanded] = useState(false);
  const [ratedInsights, setRatedInsights] = useState<Record<string, number>>({});

  if (insights.length === 0) return null;

  const handleAsk = (insight: ProactiveInsight) => {
    onEngage(insight.id);
    onQuickAction(insight.insight);
  };

  const handleRate = async (insightId: string, rating: number) => {
    setRatedInsights(prev => ({ ...prev, [insightId]: rating }));
    try {
      const token = getAccessToken() || localStorage.getItem('auth_token') || localStorage.getItem('token');
      await fetch(`${API_URL}/insights/${insightId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rating }),
      });
    } catch {
      // Silent — feedback is best-effort
    }
  };

  return (
    <div
      className="mx-6 mb-2"
      style={{ borderBottom: '1px solid var(--border-glass)' }}
    >
      {/* Collapsed summary */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-2 py-2.5 text-left bg-transparent border-none cursor-pointer"
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: '#C9B99A' }}
        />
        <Lightbulb className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <span
          className="text-xs flex-1"
          style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
        >
          Your twin has {insights.length} thing{insights.length !== 1 ? 's' : ''} to share
        </span>
        <ChevronDown
          className="w-3.5 h-3.5 shrink-0 transition-transform duration-200"
          style={{
            color: 'rgba(255,255,255,0.3)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Expanded list */}
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: expanded ? `${insights.length * 80}px` : '0px' }}
      >
        <div className="flex flex-col gap-2 pb-3">
          {insights.map(insight => (
            <div
              key={insight.id}
              className="flex items-start gap-2.5 px-3 py-2 rounded-[12px]"
              style={{
                background: 'var(--glass-surface-bg)',
                backdropFilter: 'blur(42px)',
                WebkitBackdropFilter: 'blur(42px)',
                border: '1px solid var(--glass-surface-border)',
              }}
            >
              <p
                className="text-xs leading-relaxed flex-1"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                {insight.insight}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                {ratedInsights[insight.id] ? (
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {ratedInsights[insight.id] === 1 ? 'Liked' : 'Noted'}
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => handleRate(insight.id, 1)}
                      className="p-1 rounded-md bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70"
                      title="Helpful"
                    >
                      <ThumbsUp className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.35)' }} />
                    </button>
                    <button
                      onClick={() => handleRate(insight.id, -1)}
                      className="p-1 rounded-md bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70"
                      title="Not helpful"
                    >
                      <ThumbsDown className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.35)' }} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleAsk(insight)}
                  className="shrink-0 text-[11px] bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70 p-0 whitespace-nowrap"
                  style={{ color: 'var(--accent-vibrant)' }}
                >
                  Ask
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
