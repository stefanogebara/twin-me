/**
 * Proactive Insights Panel
 * Shows insights the twin has noticed from cross-platform pattern analysis.
 * Fetches from GET /api/chat/context (reuses existing endpoint).
 * Tracks engagement via POST /api/insights/proactive/:id/engage when user interacts.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { authFetch } from '@/services/api/apiBase';
import { toSecondPerson } from '@/lib/utils';
import {
  MessageCircle,
  Eye,
  Loader2,
  ChevronDown,
  Plug,
} from 'lucide-react';
import { GlassPanel } from '@/components/layout/PageLayout';

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

export const ProactiveInsightsPanel: React.FC = () => {
  const { isDemoMode } = useAuth();
  const navigate = useNavigate();
  // Track which insight IDs the user has already engaged with (fire-and-forget to backend)
  const [engagedIds, setEngagedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const markEngaged = (insightId: string) => {
    if (isDemoMode || engagedIds.has(insightId)) return;
    setEngagedIds(prev => new Set(prev).add(insightId));
    // Fire-and-forget — do not await, UI must not block on this
    authFetch(`/insights/proactive/${insightId}/engage`, { method: 'POST' })
      .catch(() => { /* silently ignore network errors */ });
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
        const token = localStorage.getItem('auth_token');
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
        background: 'rgba(255, 255, 255, 0.06)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-secondary)' }} />
          <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Checking for insights...
          </span>
        </div>
      </div>
    );
  }

  // On error or timeout, silently show empty state instead of stuck spinner
  if (isError) {
    return null;
  }

  // Empty state
  if (insights.length === 0) {
    return (
      <GlassPanel className="text-center py-6">
        <Plug
          className="w-8 h-8 mx-auto mb-3 opacity-30"
          style={{ color: 'var(--text-muted)' }}
        />
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          I'm still getting to know you — connect Spotify or Calendar so I can start noticing things
        </p>
        <button
          onClick={() => navigate('/get-started')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--glass-surface-bg)', color: 'var(--foreground)', border: '1px solid var(--glass-surface-border)' }}
        >
          Connect a platform →
        </button>
      </GlassPanel>
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
        <Eye className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        <h3
          className="text-sm uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          Twin Noticed
        </h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            color: 'var(--text-secondary)',
          }}
        >
          {insights.length}
        </span>
      </div>

      {/* Insight Cards */}
      <div className="space-y-4">
        {insights.map((insight, idx) => {
          const isExpanded = expandedId === insight.id;
          const displayText = toSecondPerson(insight.insight);
          const dotIdx = displayText.indexOf('. ');
          const preview = dotIdx !== -1 && dotIdx < 100
            ? displayText.slice(0, dotIdx + 1)
            : displayText.slice(0, 90) + (displayText.length > 90 ? '\u2026' : '');
          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.08 }}
            >
              <GlassPanel className="relative">
                <div className="flex items-start gap-3">
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{formatRelativeTime(insight.created_at)}</span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)' }}>
                      {isExpanded ? displayText : preview}
                    </p>
                  </div>
                  <button onClick={() => setExpandedId(prev => prev === insight.id ? null : insight.id)} className="flex-shrink-0 self-start mt-1">
                    <ChevronDown className="w-4 h-4 transition-transform duration-200" style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </button>
                </div>

                {/* Discuss Button — triggers engagement tracking */}
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
              </GlassPanel>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default ProactiveInsightsPanel;
