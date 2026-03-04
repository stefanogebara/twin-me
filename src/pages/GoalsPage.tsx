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
import { PageLayout } from '@/components/layout/PageLayout';
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
  Sparkles,
  Trophy,
  ChevronDown,
  ChevronUp,
  Link2,
  Loader2,
  Flame,
} from 'lucide-react';

// --- Design tokens ---
const TEXT_PRIMARY = 'var(--foreground)';
const TEXT_SECONDARY = 'var(--text-secondary)';
const BORDER_COLOR = 'var(--glass-surface-border)';

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDemoMode = localStorage.getItem('demo_mode') === 'true';

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
    <PageLayout>
      {/* Page heading */}
      <div className="mb-12">
        <h1
          className="heading-serif mb-4"
          style={{
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            fontFamily: 'var(--font-heading)',
            fontWeight: 400,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            color: 'var(--foreground)',
          }}
        >
          Goals
        </h1>
        <p
          className="text-[15px] font-medium"
          style={{
            fontFamily: "'Geist', sans-serif",
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
            maxWidth: '540px',
          }}
        >
          Twin-driven goals based on your real patterns
        </p>
      </div>

      <div className="space-y-10">

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: TEXT_SECONDARY }} />
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
                background: 'var(--glass-surface-bg-subtle)',
                border: `1px solid ${BORDER_COLOR}`,
              }}
            >
              <Target className="w-8 h-8" style={{ color: TEXT_SECONDARY }} />
            </div>
            <h3
              className="heading-serif text-lg"
            >
              No goal suggestions yet
            </h3>
            <p
              className="body-text max-w-md mx-auto"
              style={{ color: TEXT_SECONDARY }}
            >
              Your twin needs 2-3 days of platform data to suggest goals that actually fit
              your life. Connect Spotify or Calendar to get started.
            </p>
            <button
              onClick={() => navigate('/get-started')}
              className="btn-cta-app inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-all"
            >
              <Link2 className="w-4 h-4" />
              Connect Platforms
            </button>
          </motion.div>
        )}

        {/* Summary stats bar */}
        {!isLoading && !hasNoData && summary && (
          <motion.div
            className="flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          >
            {summary.active > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)' }}
              >
                <Target className="w-3.5 h-3.5" style={{ color: TEXT_SECONDARY }} />
                <span className="text-xs font-medium" style={{ color: TEXT_PRIMARY }}>
                  {summary.active} active
                </span>
              </div>
            )}
            {summary.completed > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)' }}
              >
                <Trophy className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
                <span className="text-xs font-medium" style={{ color: TEXT_PRIMARY }}>
                  {summary.completed} completed
                </span>
              </div>
            )}
            {summary.bestStreak > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: 'var(--glass-surface-bg)', border: '1px solid var(--glass-surface-border)' }}
              >
                <Flame className="w-3.5 h-3.5" style={{ color: '#f97316' }} />
                <span className="text-xs font-medium" style={{ color: TEXT_PRIMARY }}>
                  {summary.bestStreak}d best streak
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* ===== Suggestions Section ===== */}
        {!isLoading && suggestions.length > 0 && (
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: TEXT_SECONDARY }} />
              <h2
                className="heading-serif"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '1.125rem', letterSpacing: '-0.02em', color: TEXT_PRIMARY }}
              >
                Your twin suggests
              </h2>
            </div>

            <div className="space-y-4">
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
          <section className="space-y-6">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4" style={{ color: TEXT_SECONDARY }} />
              <h2
                className="heading-serif"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '1.125rem', letterSpacing: '-0.02em', color: TEXT_PRIMARY }}
              >
                Active Goals
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
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
          <section className="space-y-6">
            <button
              onClick={() => setShowCompleted((prev) => !prev)}
              className="flex items-center gap-2 w-full text-left transition-colors"
            >
              <Trophy className="w-4 h-4" style={{ color: '#34d399' }} />
              <h2
                className="heading-serif flex-1"
                style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: '1.125rem', letterSpacing: '-0.02em', color: TEXT_PRIMARY }}
              >
                Completed Goals
              </h2>
              {showCompleted ? (
                <ChevronUp className="w-4 h-4" style={{ color: TEXT_SECONDARY }} />
              ) : (
                <ChevronDown className="w-4 h-4" style={{ color: TEXT_SECONDARY }} />
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
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: TEXT_SECONDARY }} />
                    </div>
                  ) : completedGoals.length === 0 ? (
                    <p className="text-sm py-4" style={{ color: TEXT_SECONDARY }}>
                      No completed goals yet. Keep going!
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
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
