/**
 * GoalsPage
 *
 * Twin-Driven Goal Tracking page. Displays suggested goals from the twin,
 * active goals with progress tracking, and completed goals as achievements.
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { PageLayout, GlassPanel } from '@/components/layout/PageLayout';
import { goalsAPI } from '@/services/api/goalsAPI';
import type { Goal, GoalProgress } from '@/services/api/goalsAPI';
import GoalCard from './components/goals/GoalCard';
import GoalSuggestionCard from './components/goals/GoalSuggestionCard';
import {
  Target,
  Sparkles,
  Trophy,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  Flame,
} from 'lucide-react';

// --- Query Keys ---

const QUERY_KEYS = {
  activeGoals: ['goals', 'active'] as const,
  suggestions: ['goals', 'suggestions'] as const,
  completedGoals: ['goals', 'completed'] as const,
  summary: ['goals', 'summary'] as const,
};

// --- Helper: fetch goal with progress (for expanded cards) ---

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

// --- Main Component ---

const GoalsPage: React.FC = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDark = theme === 'dark';

  const textPrimary = isDark ? '#C1C0B6' : '#0c0a09';
  const textSecondary = isDark ? 'rgba(193, 192, 182, 0.7)' : '#57534e';
  const borderColor = isDark ? 'rgba(193, 192, 182, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  // Local UI state
  const [showCompleted, setShowCompleted] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'dismiss' | 'abandon' | null>(null);

  // Goal progress fetcher
  const { progressMap, fetchProgress } = useGoalProgress();

  // --- Queries ---

  const {
    data: activeGoals = [],
    isLoading: loadingActive,
  } = useQuery({
    queryKey: QUERY_KEYS.activeGoals,
    queryFn: () => goalsAPI.getGoals('active'),
    staleTime: 30_000,
  });

  const {
    data: suggestions = [],
    isLoading: loadingSuggestions,
  } = useQuery({
    queryKey: QUERY_KEYS.suggestions,
    queryFn: () => goalsAPI.getSuggestions(),
    staleTime: 60_000,
  });

  const {
    data: completedGoals = [],
    isLoading: loadingCompleted,
  } = useQuery({
    queryKey: QUERY_KEYS.completedGoals,
    queryFn: () => goalsAPI.getGoals('completed'),
    staleTime: 60_000,
    enabled: showCompleted,
  });

  const {
    data: summary,
  } = useQuery({
    queryKey: QUERY_KEYS.summary,
    queryFn: () => goalsAPI.getSummary(),
    staleTime: 30_000,
  });

  const isLoading = loadingActive && loadingSuggestions;

  // --- Prefetch progress when active goals load ---
  // This is handled on demand via the GoalCard expand

  // --- Mutation handlers ---

  const handleAccept = useCallback(async (id: string) => {
    setActionLoadingId(id);
    setActionType('accept');
    try {
      await goalsAPI.acceptGoal(id);
      // Invalidate relevant queries so lists update
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

  // Eagerly fetch progress for an active goal
  const handleGoalExpand = useCallback((goalId: string) => {
    fetchProgress(goalId);
  }, [fetchProgress]);

  // --- Empty state ---
  const hasNoData = !isLoading && activeGoals.length === 0 && suggestions.length === 0;

  return (
    <PageLayout title="Goals" subtitle="Twin-driven goals based on your real patterns">
      <div className="space-y-8">

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: textSecondary }} />
          </div>
        )}

        {/* Empty state */}
        {hasNoData && (
          <motion.div
            className="text-center py-16 space-y-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <div
              className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
              style={{
                background: isDark ? 'rgba(193, 192, 182, 0.06)' : 'rgba(0, 0, 0, 0.03)',
                border: `1px solid ${borderColor}`,
              }}
            >
              <Target className="w-8 h-8" style={{ color: textSecondary }} />
            </div>
            <h3
              className="text-lg"
              style={{ color: textPrimary, fontFamily: 'var(--font-heading)' }}
            >
              Your twin is still learning your patterns
            </h3>
            <p
              className="text-sm max-w-md mx-auto"
              style={{ color: textSecondary, fontFamily: 'var(--font-body)' }}
            >
              Connect more platforms to get personalized goals. Your twin analyzes your real
              data to suggest goals that actually fit your life.
            </p>
            <button
              onClick={() => navigate('/get-started')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: isDark ? '#C1C0B6' : '#0c0a09',
                color: isDark ? '#232320' : '#FAFAFA',
              }}
            >
              <Link2 className="w-4 h-4" />
              Connect Platforms
            </button>
          </motion.div>
        )}

        {/* Summary stats bar */}
        {!isLoading && !hasNoData && summary && (
          <motion.div
            className="flex flex-wrap items-center gap-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          >
            {summary.active > 0 && (
              <div className="flex items-center gap-1.5">
                <Target className="w-4 h-4" style={{ color: textSecondary }} />
                <span className="text-sm" style={{ color: textPrimary }}>
                  <span className="font-medium">{summary.active}</span> active
                </span>
              </div>
            )}
            {summary.completed > 0 && (
              <div className="flex items-center gap-1.5">
                <Trophy className="w-4 h-4" style={{ color: '#34d399' }} />
                <span className="text-sm" style={{ color: textPrimary }}>
                  <span className="font-medium">{summary.completed}</span> completed
                </span>
              </div>
            )}
            {summary.bestStreak > 0 && (
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4" style={{ color: '#f97316' }} />
                <span className="text-sm" style={{ color: textPrimary }}>
                  <span className="font-medium">{summary.bestStreak}d</span> best streak
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* ===== Suggestions Section ===== */}
        {!isLoading && suggestions.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: textSecondary }} />
              <h2
                className="text-sm font-medium"
                style={{ color: textPrimary, fontFamily: 'var(--font-heading)' }}
              >
                Your twin suggests
              </h2>
            </div>

            <div className="space-y-3">
              <AnimatePresence mode="popLayout">
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
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* ===== Active Goals Section ===== */}
        {!isLoading && activeGoals.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" style={{ color: textSecondary }} />
              <h2
                className="text-sm font-medium"
                style={{ color: textPrimary, fontFamily: 'var(--font-heading)' }}
              >
                Active Goals
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <AnimatePresence mode="popLayout">
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
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* ===== Completed Goals Section (collapsible) ===== */}
        {!isLoading && !hasNoData && (summary?.completed ?? 0) > 0 && (
          <section className="space-y-4">
            <button
              onClick={() => setShowCompleted((prev) => !prev)}
              className="flex items-center gap-2 w-full text-left transition-colors"
            >
              <Trophy className="w-4 h-4" style={{ color: '#34d399' }} />
              <h2
                className="text-sm font-medium flex-1"
                style={{ color: textPrimary, fontFamily: 'var(--font-heading)' }}
              >
                Completed Goals
              </h2>
              {showCompleted ? (
                <ChevronUp className="w-4 h-4" style={{ color: textSecondary }} />
              ) : (
                <ChevronDown className="w-4 h-4" style={{ color: textSecondary }} />
              )}
            </button>

            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                >
                  {loadingCompleted ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: textSecondary }} />
                    </div>
                  ) : completedGoals.length === 0 ? (
                    <p className="text-sm py-4" style={{ color: textSecondary }}>
                      No completed goals yet. Keep going!
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>
    </PageLayout>
  );
};

export default GoalsPage;
