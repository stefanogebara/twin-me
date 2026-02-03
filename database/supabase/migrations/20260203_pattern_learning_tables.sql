-- ============================================
-- Intelligent Pattern-Learning Moltbot System
-- Migration: 20260203
--
-- This migration adds a 6-layer pattern discovery engine:
-- 1. raw_behavioral_events - Store every event with full context
-- 2. user_baselines - Calculate personal rolling statistics
-- 3. behavioral_deviations - Flag significant deviations from baseline
-- 4. discovered_correlations - Find relationships between metrics
-- 5. pattern_hypotheses - Testable hypotheses with confidence
-- 6. proactive_insights - Context-aware suggestions from patterns
--
-- Key difference from rule-based triggers:
-- - Learns YOUR personal baselines (not global thresholds)
-- - Discovers correlations YOU didn't tell it about
-- - Uses statistical significance, not hardcoded rules
-- - Continuously refines with more data
-- ============================================

-- ============================================
-- LAYER 1: RAW EVENT STREAM
-- Store every behavioral event with full context
-- ============================================

CREATE TABLE IF NOT EXISTS raw_behavioral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event identification
  platform VARCHAR(50) NOT NULL,  -- 'spotify', 'whoop', 'calendar', 'discord', etc.
  event_type VARCHAR(100) NOT NULL,  -- 'track_played', 'recovery_logged', 'meeting_started'

  -- Event payload
  event_data JSONB NOT NULL,
  -- Example: { "track_id": "...", "valence": 0.8, "energy": 0.6, "duration_ms": 180000 }

  -- Timestamp of the actual event (not when we stored it)
  event_timestamp TIMESTAMPTZ NOT NULL,

  -- Context at event time
  context JSONB,
  -- { "day_of_week": "monday", "time_of_day": "morning", "recovery": 72, "hour": 9 }

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- TTL for cleanup (configurable, default 1 year)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '365 days')
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_raw_events_user_time
  ON raw_behavioral_events(user_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_platform
  ON raw_behavioral_events(platform);
CREATE INDEX IF NOT EXISTS idx_raw_events_type
  ON raw_behavioral_events(event_type);
CREATE INDEX IF NOT EXISTS idx_raw_events_user_platform_time
  ON raw_behavioral_events(user_id, platform, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_expires
  ON raw_behavioral_events(expires_at);

-- ============================================
-- LAYER 2: USER BASELINES
-- Personal rolling statistics for each metric
-- ============================================

CREATE TABLE IF NOT EXISTS user_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Metric identification
  metric_name VARCHAR(100) NOT NULL,  -- 'recovery', 'music_valence', 'sleep_hours', 'meeting_count'
  platform VARCHAR(50),  -- NULL for cross-platform metrics

  -- Time window for this baseline
  window_days INTEGER NOT NULL,  -- 7, 30, 90

  -- Statistical measures
  mean NUMERIC,
  median NUMERIC,
  std_dev NUMERIC,
  min_value NUMERIC,
  max_value NUMERIC,
  percentile_25 NUMERIC,
  percentile_75 NUMERIC,

  -- Sample info
  sample_count INTEGER,

  -- Day-of-week patterns (optional, for daily rhythms)
  dow_means JSONB,  -- { "monday": 72, "tuesday": 68, ... }

  -- Time-of-day patterns (optional)
  tod_means JSONB,  -- { "morning": 0.6, "afternoon": 0.5, "evening": 0.7, "night": 0.4 }

  -- Metadata
  last_computed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one baseline per user/metric/platform/window
  UNIQUE(user_id, metric_name, platform, window_days)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_baselines_user
  ON user_baselines(user_id);
CREATE INDEX IF NOT EXISTS idx_user_baselines_metric
  ON user_baselines(metric_name);
CREATE INDEX IF NOT EXISTS idx_user_baselines_last_computed
  ON user_baselines(last_computed_at);

-- ============================================
-- LAYER 3: BEHAVIORAL DEVIATIONS
-- Significant deviations from personal baseline
-- ============================================

CREATE TABLE IF NOT EXISTS behavioral_deviations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What deviated
  metric_name VARCHAR(100) NOT NULL,
  platform VARCHAR(50),

  -- Deviation details
  observed_value NUMERIC,
  baseline_mean NUMERIC,
  baseline_std_dev NUMERIC,
  z_score NUMERIC,  -- (observed - mean) / std_dev
  direction VARCHAR(10),  -- 'above', 'below'

  -- Significance level
  significance VARCHAR(20),  -- 'notable' (1-2 std), 'significant' (2-3 std), 'extreme' (3+ std)

  -- Link to raw event
  raw_event_id UUID REFERENCES raw_behavioral_events(id) ON DELETE SET NULL,

  -- Context
  context JSONB,  -- Copy of event context for analysis

  -- Metadata
  detected_at TIMESTAMPTZ DEFAULT NOW(),

  -- TTL
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '180 days')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deviations_user_time
  ON behavioral_deviations(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_deviations_metric
  ON behavioral_deviations(metric_name);
CREATE INDEX IF NOT EXISTS idx_deviations_significance
  ON behavioral_deviations(significance);
CREATE INDEX IF NOT EXISTS idx_deviations_z_score
  ON behavioral_deviations(ABS(z_score) DESC);
CREATE INDEX IF NOT EXISTS idx_deviations_expires
  ON behavioral_deviations(expires_at);

-- ============================================
-- LAYER 4: DISCOVERED CORRELATIONS
-- Statistical relationships between metrics
-- ============================================

CREATE TABLE IF NOT EXISTS discovered_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- First metric
  metric_a VARCHAR(100) NOT NULL,
  platform_a VARCHAR(50),

  -- Second metric
  metric_b VARCHAR(100) NOT NULL,
  platform_b VARCHAR(50),

  -- Correlation statistics
  correlation_coefficient NUMERIC,  -- Pearson r: -1 to 1
  p_value NUMERIC,  -- Statistical significance
  sample_size INTEGER,

  -- Time lag analysis
  time_lag_hours INTEGER DEFAULT 0,  -- e.g., -24 means A predicts B 24h later

  -- Interpretation
  direction VARCHAR(20),  -- 'positive', 'negative'
  strength VARCHAR(20),  -- 'weak' (r<0.3), 'moderate' (0.3-0.6), 'strong' (>0.6)

  -- Validation tracking
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_validated_at TIMESTAMPTZ,
  validation_count INTEGER DEFAULT 1,
  still_valid BOOLEAN DEFAULT true,

  -- Unique constraint: one correlation per metric pair per user
  UNIQUE(user_id, metric_a, platform_a, metric_b, platform_b, time_lag_hours)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_correlations_user
  ON discovered_correlations(user_id);
CREATE INDEX IF NOT EXISTS idx_correlations_strength
  ON discovered_correlations(strength);
CREATE INDEX IF NOT EXISTS idx_correlations_valid
  ON discovered_correlations(user_id) WHERE still_valid = true;
CREATE INDEX IF NOT EXISTS idx_correlations_pvalue
  ON discovered_correlations(p_value);

-- ============================================
-- LAYER 5: PATTERN HYPOTHESES
-- Natural language hypotheses from correlations
-- ============================================

CREATE TABLE IF NOT EXISTS pattern_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source correlation
  correlation_id UUID REFERENCES discovered_correlations(id) ON DELETE SET NULL,

  -- Hypothesis
  hypothesis_text TEXT NOT NULL,
  -- "When your recovery is low, you tend to listen to slower, acoustic music"

  -- Confidence scoring
  confidence_score NUMERIC,  -- 0-1 based on p-value, sample size, validations
  evidence_count INTEGER,  -- Number of supporting observations

  -- Classification
  category VARCHAR(50),  -- 'health_music', 'work_energy', 'social_mood', etc.

  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_count INTEGER DEFAULT 0,  -- Times hypothesis held true
  invalidated_count INTEGER DEFAULT 0,  -- Times hypothesis failed

  -- State
  is_active BOOLEAN DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  deactivation_reason TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hypotheses_user
  ON pattern_hypotheses(user_id);
CREATE INDEX IF NOT EXISTS idx_hypotheses_active
  ON pattern_hypotheses(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_hypotheses_confidence
  ON pattern_hypotheses(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_hypotheses_category
  ON pattern_hypotheses(category);

-- ============================================
-- LAYER 6: PROACTIVE INSIGHTS
-- Context-aware suggestions from patterns
-- ============================================

CREATE TABLE IF NOT EXISTS proactive_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Insight type
  insight_type VARCHAR(50),  -- 'deviation_alert', 'pattern_observation', 'prediction', 'suggestion'

  -- Sources
  hypothesis_id UUID REFERENCES pattern_hypotheses(id) ON DELETE SET NULL,
  deviation_id UUID REFERENCES behavioral_deviations(id) ON DELETE SET NULL,

  -- Content
  message TEXT NOT NULL,
  -- "Your recovery is 2.1 std devs below your average. When this happens, you typically..."

  -- Suggested action
  suggested_action JSONB,
  -- { "type": "music", "suggestion": "slower_acoustic", "reason": "matches your low-recovery pattern" }

  -- Scoring
  confidence_score NUMERIC,
  relevance_score NUMERIC,  -- How relevant to current context

  -- User interaction
  was_shown BOOLEAN DEFAULT false,
  shown_at TIMESTAMPTZ,
  user_feedback VARCHAR(20),  -- 'helpful', 'not_helpful', 'dismiss', 'wrong'
  feedback_at TIMESTAMPTZ,
  feedback_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- TTL
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insights_user_time
  ON proactive_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insights_type
  ON proactive_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_insights_unshown
  ON proactive_insights(user_id) WHERE was_shown = false;
CREATE INDEX IF NOT EXISTS idx_insights_feedback
  ON proactive_insights(user_feedback) WHERE user_feedback IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insights_expires
  ON proactive_insights(expires_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE raw_behavioral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_deviations ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_insights ENABLE ROW LEVEL SECURITY;

-- Raw behavioral events
CREATE POLICY "Users can view own raw_behavioral_events"
  ON raw_behavioral_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own raw_behavioral_events"
  ON raw_behavioral_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User baselines
CREATE POLICY "Users can view own user_baselines"
  ON user_baselines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own user_baselines"
  ON user_baselines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user_baselines"
  ON user_baselines FOR UPDATE
  USING (auth.uid() = user_id);

-- Behavioral deviations
CREATE POLICY "Users can view own behavioral_deviations"
  ON behavioral_deviations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own behavioral_deviations"
  ON behavioral_deviations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Discovered correlations
CREATE POLICY "Users can view own discovered_correlations"
  ON discovered_correlations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own discovered_correlations"
  ON discovered_correlations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own discovered_correlations"
  ON discovered_correlations FOR UPDATE
  USING (auth.uid() = user_id);

-- Pattern hypotheses
CREATE POLICY "Users can view own pattern_hypotheses"
  ON pattern_hypotheses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pattern_hypotheses"
  ON pattern_hypotheses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pattern_hypotheses"
  ON pattern_hypotheses FOR UPDATE
  USING (auth.uid() = user_id);

-- Proactive insights
CREATE POLICY "Users can view own proactive_insights"
  ON proactive_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proactive_insights"
  ON proactive_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proactive_insights"
  ON proactive_insights FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to classify z-score significance
CREATE OR REPLACE FUNCTION classify_significance(z NUMERIC)
RETURNS VARCHAR(20) AS $$
BEGIN
  IF ABS(z) >= 3 THEN
    RETURN 'extreme';
  ELSIF ABS(z) >= 2 THEN
    RETURN 'significant';
  ELSIF ABS(z) >= 1 THEN
    RETURN 'notable';
  ELSE
    RETURN 'normal';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to classify correlation strength
CREATE OR REPLACE FUNCTION classify_correlation_strength(r NUMERIC)
RETURNS VARCHAR(20) AS $$
BEGIN
  IF ABS(r) >= 0.6 THEN
    RETURN 'strong';
  ELSIF ABS(r) >= 0.3 THEN
    RETURN 'moderate';
  ELSE
    RETURN 'weak';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to record a deviation
CREATE OR REPLACE FUNCTION record_deviation(
  p_user_id UUID,
  p_metric_name VARCHAR(100),
  p_platform VARCHAR(50),
  p_observed_value NUMERIC,
  p_baseline_mean NUMERIC,
  p_baseline_std_dev NUMERIC,
  p_raw_event_id UUID DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_z_score NUMERIC;
  v_direction VARCHAR(10);
  v_significance VARCHAR(20);
  v_id UUID;
BEGIN
  -- Calculate z-score
  IF p_baseline_std_dev > 0 THEN
    v_z_score := (p_observed_value - p_baseline_mean) / p_baseline_std_dev;
  ELSE
    v_z_score := 0;
  END IF;

  -- Only record if significant (|z| >= 1)
  IF ABS(v_z_score) < 1 THEN
    RETURN NULL;
  END IF;

  -- Determine direction
  v_direction := CASE WHEN v_z_score > 0 THEN 'above' ELSE 'below' END;

  -- Classify significance
  v_significance := classify_significance(v_z_score);

  -- Insert deviation
  INSERT INTO behavioral_deviations (
    user_id, metric_name, platform, observed_value,
    baseline_mean, baseline_std_dev, z_score,
    direction, significance, raw_event_id, context
  )
  VALUES (
    p_user_id, p_metric_name, p_platform, p_observed_value,
    p_baseline_mean, p_baseline_std_dev, v_z_score,
    v_direction, v_significance, p_raw_event_id, p_context
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired pattern learning data
CREATE OR REPLACE FUNCTION cleanup_expired_pattern_learning_data()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_count INTEGER;
BEGIN
  -- Delete expired raw events
  DELETE FROM raw_behavioral_events WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + v_count;

  -- Delete expired deviations
  DELETE FROM behavioral_deviations WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + v_count;

  -- Delete expired insights
  DELETE FROM proactive_insights WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + v_count;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE raw_behavioral_events IS 'Layer 1: Raw event stream from all platforms with full context';
COMMENT ON TABLE user_baselines IS 'Layer 2: Personal rolling statistics for each metric (7/30/90 day windows)';
COMMENT ON TABLE behavioral_deviations IS 'Layer 3: Significant deviations from personal baseline (z-score based)';
COMMENT ON TABLE discovered_correlations IS 'Layer 4: Statistically discovered relationships between metrics';
COMMENT ON TABLE pattern_hypotheses IS 'Layer 5: Natural language hypotheses generated from correlations';
COMMENT ON TABLE proactive_insights IS 'Layer 6: Context-aware suggestions delivered to user';
