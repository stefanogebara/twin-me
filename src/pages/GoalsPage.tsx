/**
 * GoalsPage
 *
 * Twin-Driven Goal Tracking page. Typography-driven dark design.
 */

import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { goalsAPI } from '@/services/api/goalsAPI';
import type { Goal, GoalProgress } from '@/services/api/goalsAPI';
import {
  DEMO_ACTIVE_GOALS,
  DEMO_SUGGESTED_GOALS,
  DEMO_COMPLETED_GOALS,
  DEMO_GOAL_SUMMARY,
} from '@/services/demoDataService';
import GoalCard from './components/goals/GoalCard';
import GoalSuggestionCard from './components/goals/GoalSuggestionCard';
import {
  Target,
  Trophy,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  Flame,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const QUERY_KEYS = {
  activeGoals: ['goals', 'active'] as const,
  suggestions: ['goals', 'suggestions'] as const,
  completedGoals: ['goals', 'completed'] as const,
  summary: ['goals', 'summary'] as const,
};

const useGoalProgress = () => {
  const [progressMap, setProgressMap] = useState<Record<string, GoalProgress[]>>({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  const fetchProgress = useCallback(async (goalId: string) => {
    if (progressMap[goalId] || loadingIds.has(goalId)) return;

    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.add(goalId);
      return next;
    });

    try {
      const goalWithProgress = await goalsAPI.getGoal(goalId);
      setProgressMap((prev) => ({
        ...prev,
        [goalId]: goalWithProgress.progress ?? [],
      }));
    } catch (err) {
      console.error('Failed to fetch goal progress:', err);
      setProgressMap((prev) => ({ ...prev, [goalId]: [] }));
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(goalId);
        return next;
      });
    }
  }, [progressMap, loadingIds]);

  return { progressMap, fetchProgress };
};

const GoalsPage: React.FC = () => {
  useDocumentTitle('Goals');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

  const [showCompleted, setShowCompleted] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'dismiss' | 'abandon' | null>(null);
  const { progressMap, fetchProgress } = useGoalProgress();

  const {
    data: activeGoals = [],
    isLoading: loadingActive,
  } = useQuery({
    queryKey: QUERY_KEYS.activeGoals,
    queryFn: () => goalsAPI.getGoals('active'),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? DEMO_ACTIVE_GOALS : undefined,
  });

  const {
    data: suggestions = [],
    isLoading: loadingSuggestions,
  } = useQuery({
    queryKey: QUERY_KEYS.suggestions,
    queryFn: () => goalsAPI.getSuggestions(),
    staleTime: 60_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? DEMO_SUGGESTED_GOALS : undefined,
  });

  const {
    data: completedGoals = [],
    isLoading: loadingCompleted,
  } = useQuery({
    queryKey: QUERY_KEYS.completedGoals,
    queryFn: () => goalsAPI.getGoals('completed'),
    staleTime: 60_000,
    enabled: showCompleted && !isDemoMode,
    initialData: isDemoMode ? DEMO_COMPLETED_GOALS : undefined,
  });

  const {
    data: summary,
  } = useQuery({
    queryKey: QUERY_KEYS.summary,
    queryFn: () => goalsAPI.getSummary(),
    staleTime: 30_000,
    enabled: !isDemoMode,
    initialData: isDemoMode ? DEMO_GOAL_SUMMARY : undefined,
  });

  const isLoading = isDemoMode ? false : (loadingActive && loadingSuggestions);

  const handleAccept = useCallback(async (id: string) => {
    setActionLoadingId(id);
    setActionType('accept');
    try {
      await goalsAPI.acceptGoal(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.suggestions }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activeGoals }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.summary }),
      ]);
    } catch (err) {
      console.error('Failed to accept goal:', err);
      toast.error('Failed to accept goal. Please try again.');
    } finally {
      setActionLoadingId(null);
      setActionType(null);
    }
  }, [queryClient]);

  const handleDismiss = useCallback(async (id: string) => {
    setActionLoadingId(id);
    setActionType('dismiss');
    try {
      await goalsAPI.dismissGoal(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.suggestions }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.summary }),
      ]);
    } catch (err) {
      console.error('Failed to dismiss goal:', err);
      toast.error('Failed to dismiss goal. Please try again.');
    } finally {
      setActionLoadingId(null);
      setActionType(null);
    }
  }, [queryClient]);

  const handleAbandon = useCallback(async (id: string) => {
    setActionLoadingId(id);
    setActionType('abandon');
    try {
      await goalsAPI.abandonGoal(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activeGoals }),
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.summary }),
      ]);
    } catch (err) {
      console.error('Failed to abandon goal:', err);
      toast.error('Failed to abandon goal. Please try again.');
    } finally {
      setActionLoadingId(null);
      setActionType(null);
    }
  }, [queryClient]);

  const handleGoalExpand = useCallback((goalId: string) => {
    fetchProgress(goalId);
  }, [fetchProgress]);

  const hasNoData = !isLoading && activeGoals.length === 0 && suggestions.length === 0;

  return (
    <div className="max-w-[680px] mx-auto px-6 py-16">
      {/* Header */}
      <h1
        className="mb-2"
        style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontSize: '28px',
          fontWeight: 400,
          color: 'var(--foreground)',
          letterSpacing: '-0.02em',
        }}
      >
        Goals
      </h1>
      <p className="text-sm mb-10" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', sans-serif" }}>
        Twin-driven goals based on your real patterns
      </p>

      <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mb-8" />

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      )}

      {/* Empty state */}
      {hasNoData && (
        <div className="text-center py-12 space-y-4">
          <Target className="w-8 h-8 mx-auto" style={{ color: 'rgba(255,255,255,0.15)' }} />
          <p
            className="text-sm"
            style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Inter', sans-serif" }}
          >
            No goal ideas yet — once I've seen a few days of your patterns, I'll suggest goals that actually make sense for your life.
          </p>
          <button
            onClick={() => navigate('/get-started')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ease-out hover:opacity-90 active:scale-[0.97]"
            style={{
              backgroundColor: 'var(--accent-vibrant)',
              color: '#0a0f0a',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <Link2 className="w-4 h-4" />
            Connect Platforms
          </button>
        </div>
      )}

      {/* Summary stats */}
      {!isLoading && !hasNoData && summary && (
        <div className="flex flex-wrap items-center gap-3 mb-10">
          {summary.active > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ border: '1px solid var(--border)' }}
            >
              <Target className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.4)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                {summary.active} active
              </span>
            </div>
          )}
          {summary.completed > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ border: '1px solid var(--border)' }}
            >
              <Trophy className="w-3.5 h-3.5" style={{ color: 'var(--accent-vibrant)' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                {summary.completed} completed
              </span>
            </div>
          )}
          {summary.bestStreak > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ border: '1px solid var(--border)' }}
            >
              <Flame className="w-3.5 h-3.5" style={{ color: '#D4CBBE' }} />
              <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                {summary.bestStreak}d best streak
              </span>
            </div>
          )}
        </div>
      )}

      {/* Suggestions Section */}
      {!isLoading && suggestions.length > 0 && (
        <section className="mb-10">
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: 'var(--accent-vibrant)', fontFamily: 'Inter, sans-serif' }}
          >
            Your Twin Suggests
          </span>
          <div>
            {suggestions.map((goal, i) => (
              <GoalSuggestionCard
                key={goal.id}
                goal={goal}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                isAccepting={actionLoadingId === goal.id && actionType === 'accept'}
                isDismissing={actionLoadingId === goal.id && actionType === 'dismiss'}
                index={i}
              />
            ))}
          </div>
        </section>
      )}

      {/* Active Goals Section */}
      {!isLoading && activeGoals.length > 0 && (
        <section className="mb-10">
          <span
            className="text-[11px] font-medium tracking-widest uppercase block mb-4"
            style={{ color: 'var(--accent-vibrant)', fontFamily: 'Inter, sans-serif' }}
          >
            Active Goals
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeGoals.map((goal, i) => (
              <div
                key={goal.id}
                onMouseEnter={() => handleGoalExpand(goal.id)}
                onFocus={() => handleGoalExpand(goal.id)}
              >
                <GoalCard
                  goal={goal}
                  progress={progressMap[goal.id]}
                  onAbandon={handleAbandon}
                  isAbandoning={actionLoadingId === goal.id && actionType === 'abandon'}
                  index={i}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Completed Goals Section */}
      {!isLoading && !hasNoData && (summary?.completed ?? 0) > 0 && (
        <section>
          <div style={{ borderTop: '1px solid var(--border-glass)' }} className="mb-6" />
          <button
            onClick={() => setShowCompleted((prev) => !prev)}
            className="flex items-center gap-2 w-full text-left transition-all duration-150 ease-out hover:opacity-70 active:scale-[0.98] mb-4"
          >
            <Trophy className="w-4 h-4" style={{ color: 'var(--accent-vibrant)' }} />
            <span
              className="text-sm font-medium flex-1"
              style={{ color: 'var(--foreground)', fontFamily: "'Inter', sans-serif" }}
            >
              Completed Goals
            </span>
            {showCompleted ? (
              <ChevronUp className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            ) : (
              <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
            )}
          </button>

          {showCompleted && (
            <div>
              {loadingCompleted ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
                </div>
              ) : completedGoals.length === 0 ? (
                <p className="text-sm py-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  Nothing finished yet — you've got this though.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {completedGoals.map((goal, i) => (
                    <div
                      key={goal.id}
                      onMouseEnter={() => handleGoalExpand(goal.id)}
                      onFocus={() => handleGoalExpand(goal.id)}
                    >
                      <GoalCard
                        goal={goal}
                        progress={progressMap[goal.id]}
                        onAbandon={handleAbandon}
                        isAbandoning={false}
                        index={i}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default GoalsPage;
