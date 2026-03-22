/**
 * Proactive Insights Panel
 * Shows insights the twin has noticed from cross-platform pattern analysis.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authFetch, getAccessToken } from '@/services/api/apiBase';
import { usePlatformStatus } from '@/hooks/usePlatformStatus';
import { toSecondPerson } from '@/lib/utils';
import {
  MessageCircle,
  Eye,
  Loader2,
  ChevronDown,
  Plug,
} from 'lucide-react';

interface ProactiveInsight {
  id: string;
  insight: string;
  category: 'trend' | 'anomaly' | 'celebration' | 'concern' | 'goal_progress' | 'goal_suggestion';
  urgency: 'high' | 'medium' | 'low';
  created_at: string;
}

interface ChatContextResponse {
  success: boolean;
  pendingInsights: ProactiveInsight[];
}


function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

const panelStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '12px',
  padding: '16px',
};

export const ProactiveInsightsPanel: React.FC = () => {
  const { isDemoMode, user } = useAuth();
  const navigate = useNavigate();
  const { connectedCount } = usePlatformStatus(user?.id);
  const [engagedIds, setEngagedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const markEngaged = (insightId: string) => {
    if (isDemoMode || engagedIds.has(insightId)) return;
    setEngagedIds(prev => new Set(prev).add(insightId));
    authFetch(`/insights/proactive/${insightId}/engage`, { method: 'POST' })
      .catch(() => {});
  };

  const { data, isLoading, isError } = useQuery<ChatContextResponse>({
    queryKey: ['proactive-insights'],
    queryFn: async () => {
      if (isDemoMode) {
        await new Promise(r => setTimeout(r, 300));
        return { success: true, pendingInsights: [] };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        const token = getAccessToken() || localStorage.getItem('auth_token');
        const response = await fetch(`${import.meta.env.VITE_API_URL}/chat/context`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to fetch insights');
        return response.json();
      } finally {
        clearTimeout(timeoutId);
      }
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 1,
  });

  const insights = data?.pendingInsights || [];

  if (isLoading) {
    return (
      <div className="rounded-2xl p-6" style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.4)' }} />
          <span className="ml-2 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Checking for insights...
          </span>
        </div>
      </div>
    );
  }

  if (isError) {
    return null;
  }

  if (insights.length === 0) {
    if (connectedCount > 0) return null;
    return (
      <div style={panelStyle} className="text-center py-6">
        <Plug
          className="w-8 h-8 mx-auto mb-3 opacity-30"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        />
        <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
          I'm still getting to know you — connect Spotify or Calendar so I can start noticing things
        </p>
        <button
          onClick={() => navigate('/settings?tab=platforms')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors"
          style={{ backgroundColor: 'rgba(255,255,255,0.02)', color: 'var(--foreground)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          Connect a platform →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-1 h-5 rounded-full"
          style={{
            background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(255, 255, 255, 0.10))',
          }}
        />
        <Eye className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
        <h3
          className="text-sm uppercase tracking-wider"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          Twin Noticed
        </h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          {insights.length}
        </span>
      </div>

      {/* Insight Cards */}
      <div className="space-y-4">
        {insights.map((insight) => {
          const isExpanded = expandedId === insight.id;
          const displayText = toSecondPerson(insight.insight);
          const dotIdx = displayText.indexOf('. ');
          const preview = dotIdx !== -1 && dotIdx < 100
            ? displayText.slice(0, dotIdx + 1)
            : displayText.slice(0, 90) + (displayText.length > 90 ? '\u2026' : '');
          return (
            <div key={insight.id}>
              <div style={panelStyle} className="relative">
                <div className="flex items-start gap-3">
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{formatRelativeTime(insight.created_at)}</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)' }}>
                      {isExpanded ? displayText : preview}
                    </p>
                  </div>
                  <button onClick={() => setExpandedId(prev => prev === insight.id ? null : insight.id)} className="flex-shrink-0 self-start mt-1">
                    <ChevronDown className="w-4 h-4 transition-transform duration-200" style={{ color: 'rgba(255,255,255,0.3)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                </div>

                {/* Discuss Button */}
                <button
                  onClick={() => {
                    markEngaged(insight.id);
                    navigate('/talk-to-twin', {
                      state: { discussContext: `I saw this insight: "${displayText}" — can we discuss it?` }
                    });
                  }}
                  className="mt-3 w-full py-2 flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: 'var(--foreground)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Discuss with Twin
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProactiveInsightsPanel;
