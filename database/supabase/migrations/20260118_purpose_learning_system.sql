-- ====================================================================
-- PURPOSE LEARNING SYSTEM
-- Migration: 20260118 - Personalized Purpose Detection & Learning
--
-- Purpose: Learn from user's actual purpose selections to provide
-- increasingly personalized suggestions over time.
-- Tracks: suggestions vs selections, context at time of choice,
-- learned weights, and discovered behavioral patterns.
-- ====================================================================

-- ====================================================================
-- PURPOSE SELECTION FEEDBACK TABLE
-- Tracks every purpose selection with full context snapshot
-- ====================================================================

CREATE TABLE IF NOT EXISTS purpose_selection_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What was suggested vs selected
  suggested_purpose TEXT NOT NULL,
  suggested_confidence DECIMAL(3,2),  -- 0.00 to 1.00
  selected_purpose TEXT NOT NULL,
  was_override BOOLEAN NOT NULL DEFAULT FALSE,

  -- Context snapshot at time of selection
  -- Contains: recovery, strain, sleep, events_today, next_event_type,
  -- minutes_until_next, spotify_mood, hour, day_of_week, strain_trend
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Optional user explanation for override
  override_reason TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- USER PURPOSE WEIGHTS TABLE
-- Personalized weights learned from user behavior
-- ====================================================================

CREATE TABLE IF NOT EXISTS user_purpose_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Learned context-to-purpose weights
  -- Structure: {
  --   "low_recovery": { "relax": 0.8, "focus": -0.3, "workout": -0.5 },
  --   "morning": { "focus": 0.6, "workout": 0.4 },
  --   "busy_day": { "focus": 0.7 },
  --   ...
  -- }
  context_weights JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- User-specific sensitivity adjustments
  -- Structure: {
  --   recovery_sensitivity: 0.8,  -- How much recovery affects suggestions
  --   calendar_priority: 0.7,     -- How much calendar affects suggestions
  --   time_of_day_influence: 0.6,
  --   strain_awareness: 0.5,
  --   spotify_influence: 0.4
  -- }
  user_adjustments JSONB DEFAULT '{
    "recovery_sensitivity": 0.5,
    "calendar_priority": 0.5,
    "time_of_day_influence": 0.5,
    "strain_awareness": 0.5,
    "spotify_influence": 0.3
  }'::jsonb,

  -- Learning metrics
  total_feedback_count INT DEFAULT 0,
  override_rate DECIMAL(4,3) DEFAULT 0,        -- 0.000 to 1.000
  confidence_level DECIMAL(3,2) DEFAULT 0.50,  -- 0.00 to 1.00
  last_learned_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- PURPOSE CONTEXT PATTERNS TABLE
-- Discovered patterns specific to each user
-- ====================================================================

CREATE TABLE IF NOT EXISTS purpose_context_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pattern identification
  pattern_name TEXT NOT NULL,       -- e.g., "busy_morning_focus", "low_recovery_relax"
  pattern_description TEXT,         -- Human-readable: "When you have a busy morning, you pick Focus"

  -- Context conditions that trigger this pattern
  -- Structure: {
  --   "recovery": { "min": 0, "max": 33 },
  --   "hour": { "min": 6, "max": 12 },
  --   "calendar_busyness": { "min": 3, "max": 10 },
  --   "strain_trend": "high"
  -- }
  context_conditions JSONB NOT NULL,

  -- What purpose this pattern recommends
  recommended_purpose TEXT NOT NULL,

  -- Confidence based on observed behavior
  pattern_confidence DECIMAL(3,2),   -- 0.00 to 1.00

  -- Usage statistics
  match_count INT DEFAULT 1,         -- Times this context was seen
  follow_count INT DEFAULT 0,        -- Times user followed this pattern
  success_rate DECIMAL(4,3),         -- 0.000 to 1.000

  -- Active status
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure patterns are unique per user
  CONSTRAINT unique_user_pattern UNIQUE(user_id, pattern_name)
);

-- ====================================================================
-- INDEXES FOR PERFORMANCE
-- ====================================================================

-- Purpose selection feedback lookups
CREATE INDEX IF NOT EXISTS idx_purpose_feedback_user
  ON purpose_selection_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purpose_feedback_override
  ON purpose_selection_feedback(user_id, was_override)
  WHERE was_override = TRUE;

CREATE INDEX IF NOT EXISTS idx_purpose_feedback_recent
  ON purpose_selection_feedback(created_at DESC, user_id);

-- User purpose weights lookup (unique so fast anyway)
CREATE INDEX IF NOT EXISTS idx_user_purpose_weights_user
  ON user_purpose_weights(user_id);

-- Purpose context patterns
CREATE INDEX IF NOT EXISTS idx_purpose_patterns_user
  ON purpose_context_patterns(user_id, pattern_confidence DESC)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_purpose_patterns_purpose
  ON purpose_context_patterns(recommended_purpose, user_id)
  WHERE is_active = TRUE;

-- ====================================================================
-- FUNCTIONS & TRIGGERS
-- ====================================================================

-- Auto-update timestamp for user_purpose_weights
CREATE OR REPLACE FUNCTION update_purpose_weights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_purpose_weights_timestamp ON user_purpose_weights;
CREATE TRIGGER trigger_update_purpose_weights_timestamp
  BEFORE UPDATE ON user_purpose_weights
  FOR EACH ROW
  EXECUTE FUNCTION update_purpose_weights_updated_at();

-- Auto-update timestamp for purpose_context_patterns
DROP TRIGGER IF EXISTS trigger_update_purpose_patterns_timestamp ON purpose_context_patterns;
CREATE TRIGGER trigger_update_purpose_patterns_timestamp
  BEFORE UPDATE ON purpose_context_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_purpose_weights_updated_at();

-- ====================================================================
-- ROW LEVEL SECURITY (RLS)
-- Users can only access their own data
-- ====================================================================

ALTER TABLE purpose_selection_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_purpose_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE purpose_context_patterns ENABLE ROW LEVEL SECURITY;

-- Purpose selection feedback policies
CREATE POLICY purpose_feedback_select_own ON purpose_selection_feedback
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY purpose_feedback_insert_own ON purpose_selection_feedback
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY purpose_feedback_delete_own ON purpose_selection_feedback
  FOR DELETE USING (auth.uid() = user_id);

-- User purpose weights policies
CREATE POLICY purpose_weights_select_own ON user_purpose_weights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY purpose_weights_insert_own ON user_purpose_weights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY purpose_weights_update_own ON user_purpose_weights
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY purpose_weights_delete_own ON user_purpose_weights
  FOR DELETE USING (auth.uid() = user_id);

-- Purpose context patterns policies
CREATE POLICY purpose_patterns_select_own ON purpose_context_patterns
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY purpose_patterns_insert_own ON purpose_context_patterns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY purpose_patterns_update_own ON purpose_context_patterns
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY purpose_patterns_delete_own ON purpose_context_patterns
  FOR DELETE USING (auth.uid() = user_id);

-- ====================================================================
-- GRANT PERMISSIONS
-- ====================================================================

GRANT SELECT, INSERT, DELETE ON purpose_selection_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_purpose_weights TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON purpose_context_patterns TO authenticated;

GRANT ALL ON purpose_selection_feedback TO service_role;
GRANT ALL ON user_purpose_weights TO service_role;
GRANT ALL ON purpose_context_patterns TO service_role;

-- ====================================================================
-- COMMENTS FOR DOCUMENTATION
-- ====================================================================

COMMENT ON TABLE purpose_selection_feedback IS
  'Tracks every purpose selection with full context snapshot for learning';

COMMENT ON COLUMN purpose_selection_feedback.context_snapshot IS
  'Full context at selection time: recovery, strain, calendar, spotify mood, etc.';

COMMENT ON COLUMN purpose_selection_feedback.was_override IS
  'TRUE if user selected something different from the suggestion';

COMMENT ON TABLE user_purpose_weights IS
  'Personalized weights learned from user behavior over time';

COMMENT ON COLUMN user_purpose_weights.context_weights IS
  'Learned mappings from context features to purpose preferences';

COMMENT ON COLUMN user_purpose_weights.user_adjustments IS
  'How much each data source affects this user (recovery_sensitivity, calendar_priority, etc.)';

COMMENT ON TABLE purpose_context_patterns IS
  'Discovered behavioral patterns specific to each user';

COMMENT ON COLUMN purpose_context_patterns.context_conditions IS
  'The conditions that trigger this pattern (recovery range, time range, etc.)';

COMMENT ON COLUMN purpose_context_patterns.success_rate IS
  'How often the user follows this pattern when context matches';

-- Migration complete
