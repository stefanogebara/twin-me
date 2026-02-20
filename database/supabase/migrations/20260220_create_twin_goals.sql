-- ============================================================================
-- Twin-Driven Goal Tracking System
-- Migration: create_twin_goals
-- Date: 2026-02-20
--
-- Creates tables for twin-driven goal tracking:
-- 1. twin_goals - Goals suggested by the twin based on platform data patterns
-- 2. goal_progress_log - Daily progress tracking for active goals
--
-- The twin observes platform data (Whoop, Calendar, Spotify) and SUGGESTS
-- goals based on patterns. Once accepted, progress is auto-tracked from
-- platform data and the twin weaves accountability into conversations.
-- ============================================================================

-- ============================================================================
-- TABLE 1: twin_goals
-- ============================================================================

CREATE TABLE IF NOT EXISTS twin_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Goal definition
  title TEXT NOT NULL,                            -- "Sleep 7+ hours for 2 weeks"
  description TEXT,                               -- Twin's conversational suggestion
  category VARCHAR(50) NOT NULL,                  -- sleep, fitness, focus, schedule, balance
  source_platform VARCHAR(50),                    -- whoop, spotify, calendar, cross_platform
  source_observation TEXT,                         -- The pattern that triggered this

  -- Metric tracking
  metric_type VARCHAR(50) NOT NULL,               -- sleep_hours, recovery_score, meeting_count, etc.
  target_value NUMERIC,                           -- 7.0
  target_operator VARCHAR(10) DEFAULT '>=',       -- >=, <=, =, >, <
  target_unit VARCHAR(20),                        -- hours, percent, count
  measurement_window VARCHAR(20) DEFAULT 'day',   -- day, week

  -- Lifecycle
  status VARCHAR(20) DEFAULT 'suggested',         -- suggested, active, completed, abandoned, expired
  start_date DATE,
  end_date DATE,
  duration_days INTEGER DEFAULT 14,

  -- Progress counters (denormalized for fast reads)
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  total_days_tracked INTEGER DEFAULT 0,
  total_days_met INTEGER DEFAULT 0,

  -- Twin interaction
  last_progress_check TIMESTAMPTZ,
  last_mentioned_at TIMESTAMPTZ,
  celebration_delivered BOOLEAN DEFAULT false,

  -- Extensibility
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TABLE 2: goal_progress_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS goal_progress_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES twin_goals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  tracked_date DATE NOT NULL,
  measured_value NUMERIC,
  target_met BOOLEAN DEFAULT false,
  source_data JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(goal_id, tracked_date)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- twin_goals: fast lookup by user + status
CREATE INDEX IF NOT EXISTS idx_twin_goals_user_status
  ON twin_goals(user_id, status);

-- twin_goals: fast lookup by user + category
CREATE INDEX IF NOT EXISTS idx_twin_goals_user_category
  ON twin_goals(user_id, category);

-- twin_goals: find active goals for progress tracking
CREATE INDEX IF NOT EXISTS idx_twin_goals_active
  ON twin_goals(status, last_progress_check)
  WHERE status = 'active';

-- goal_progress_log: fast lookup by goal + date range
CREATE INDEX IF NOT EXISTS idx_goal_progress_goal_date
  ON goal_progress_log(goal_id, tracked_date DESC);

-- goal_progress_log: fast lookup by user
CREATE INDEX IF NOT EXISTS idx_goal_progress_user
  ON goal_progress_log(user_id, tracked_date DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE twin_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_progress_log ENABLE ROW LEVEL SECURITY;

-- twin_goals policies
CREATE POLICY "Users view own goals"
  ON twin_goals FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users insert own goals"
  ON twin_goals FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own goals"
  ON twin_goals FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own goals"
  ON twin_goals FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Service role full access twin_goals"
  ON twin_goals FOR ALL
  USING (auth.role() = 'service_role');

-- goal_progress_log policies
CREATE POLICY "Users view own goal progress"
  ON goal_progress_log FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users insert own goal progress"
  ON goal_progress_log FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own goal progress"
  ON goal_progress_log FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Service role full access goal_progress_log"
  ON goal_progress_log FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_twin_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_twin_goals_updated_at
  BEFORE UPDATE ON twin_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_twin_goals_updated_at();
