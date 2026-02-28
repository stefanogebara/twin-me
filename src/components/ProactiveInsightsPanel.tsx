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
import {
  TrendingUp,
  AlertCircle,
  Trophy,
  AlertTriangle,
  MessageCircle,
  Eye,
  Loader2,
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

const categoryConfig: Record<string, { icon: React.ElementType; label: string }> = {
  trend: { icon: TrendingUp, label: 'Trend' },
  anomaly: { icon: AlertCircle, label: 'Anomaly' },
  celebration: { icon: Trophy, label: 'Celebration' },
  concern: { icon: AlertTriangle, label: 'Concern' },
  goal_progress: { icon: TrendingUp, label: 'Goal Progress' },
  goal_suggestion: { icon: AlertCircle, label: 'Goal Idea' },
};

const urgencyColors: Record<string, { dot: string; bg: string }> = {
  high: { dot: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' },
  medium: { dot: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  low: { dot: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
};

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

  const markEngaged = (insightId: string) => {
    if (isDemoMode || engagedIds.has(insightId)) return;
    setEngagedIds(prev => new Set(prev).add(insightId));
    // Fire-and-forget — do not await, UI must not block on this
    authFetch(`/insights/proactive/${insightId}/engage`, { method: 'POST' })
      .catch(() => { /* silently ignore network errors */ });
  };

  const { data, isLoading } = useQuery<ChatContextResponse>({
    queryKey: ['proactive-insights'],
    queryFn: async () => {
      if (isDemoMode) {
        await new Promise(r => setTimeout(r, 300));
        return { success: true, pendingInsights: [] };
      }

      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/chat/context`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const insights = data?.pendingInsights || [];

  if (isLoading) {
    return (
      <div className="rounded-2xl p-6" style={{
        background: 'rgba(255, 255, 255, 0.18)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        border: '1px solid rgba(255, 255, 255, 0.45)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
      }}>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#8A857D' }} />
          <span className="ml-2 text-sm" style={{ color: '#8A857D' }}>
            Checking for insights...
          </span>
        </div>
      </div>
    );
  }

  // Empty state
  if (insights.length === 0) {
    return (
      <GlassPanel className="text-center py-6">
        <Eye
          className="w-8 h-8 mx-auto mb-3 opacity-30"
          style={{ color: '#78716c' }}
        />
        <p
          className="text-sm"
          style={{ color: '#8A857D' }}
        >
          Your twin is observing. Insights will appear as patterns emerge.
        </p>
      </GlassPanel>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div
          className="w-1 h-5 rounded-full"
          style={{
            background: 'linear-gradient(to bottom, var(--accent-vibrant), rgba(0, 0, 0, 0.1))',
          }}
        />
        <Eye className="w-4 h-4" style={{ color: '#8A857D' }} />
        <h3
          className="text-sm uppercase tracking-wider"
          style={{ color: '#78716c' }}
        >
          Twin Noticed
        </h3>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.06)',
            color: '#8A857D',
          }}
        >
          {insights.length}
        </span>
      </div>

      {/* Insight Cards */}
      <div className="space-y-3">
        {insights.map((insight, idx) => {
          const config = categoryConfig[insight.category] || categoryConfig.trend;
          const Icon = config.icon;
          const colors = urgencyColors[insight.urgency] || urgencyColors.low;
          const isEngaged = engagedIds.has(insight.id);

          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.08 }}
            >
              <GlassPanel className="relative">
                <div className="flex items-start gap-3">
                  {/* Category Icon + Urgency Dot */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                      }}
                    >
                      <Icon
                        className="w-5 h-5"
                        style={{ color: '#8A857D' }}
                      />
                    </div>
                    {/* Urgency dot — turns green once engaged */}
                    <div
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 transition-colors duration-300"
                      style={{
                        backgroundColor: isEngaged ? '#22c55e' : colors.dot,
                        borderColor: '#fcf6ef',
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] uppercase tracking-wider font-medium"
                        style={{ color: '#8A857D' }}
                      >
                        {config.label}
                      </span>
                      <span
                        className="text-[10px]"
                        style={{ color: '#d6d3d1' }}
                      >
                        {formatRelativeTime(insight.created_at)}
                      </span>
                      {/* Subtle "seen" badge once engaged */}
                      {isEngaged && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            color: '#22c55e',
                          }}
                        >
                          seen
                        </span>
                      )}
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: '#44403c' }}
                    >
                      {insight.insight}
                    </p>
                  </div>
                </div>

                {/* Discuss Button — triggers engagement tracking */}
                <button
                  onClick={() => {
                    markEngaged(insight.id);
                    navigate('/talk-to-twin');
                  }}
                  className="mt-3 w-full py-2 flex items-center justify-center gap-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.06)',
                    color: '#000000',
                    border: '1px solid rgba(0, 0, 0, 0.08)',
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
