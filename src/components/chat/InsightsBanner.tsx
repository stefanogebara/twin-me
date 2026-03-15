import { useState } from 'react';
import { ChevronDown, Lightbulb } from 'lucide-react';
import type { ProactiveInsight } from '@/types/dashboard';

interface InsightsBannerProps {
  insights: ProactiveInsight[];
  onQuickAction: (text: string) => void;
  onEngage: (id: string) => void;
}

export function InsightsBanner({ insights, onQuickAction, onEngage }: InsightsBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (insights.length === 0) return null;

  const handleAsk = (insight: ProactiveInsight) => {
    onEngage(insight.id);
    onQuickAction(insight.insight);
  };

  return (
    <div
      className="mx-6 mb-2"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Collapsed summary */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex items-center gap-2 py-2.5 text-left bg-transparent border-none cursor-pointer"
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: '#f59e0b' }}
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
              className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <p
                className="text-xs leading-relaxed flex-1"
                style={{ color: 'rgba(255,255,255,0.6)' }}
              >
                {insight.insight}
              </p>
              <button
                onClick={() => handleAsk(insight)}
                className="shrink-0 text-[11px] bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70 p-0 whitespace-nowrap"
                style={{ color: '#ff8400' }}
              >
                Ask about this
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
