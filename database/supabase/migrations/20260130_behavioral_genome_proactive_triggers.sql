-- ============================================
-- Behavioral Genome & Proactive Triggers
-- Migration: 20260130
--
-- This migration adds:
-- 1. behavioral_patterns - Multi-layer pattern storage (micro, daily, weekly, macro)
-- 2. realtime_events - Event logging for proactive triggers
-- 3. proactive_triggers - User-defined automation triggers
-- 4. cluster_personalities - Per-cluster (personal/professional) Big Five profiles
-- 5. cluster_divergence - Track personality differences between contexts
--
-- Architecture:
-- TwinMe → Moltbot → Platform Events → Triggers → Actions
--
-- Research basis:
-- - Event-driven architecture for proactive AI (MIT Tech Review 2025)
-- - Memory-powered agentic AI (MIRIX, M2PA systems)
-- ============================================

-- ============================================
-- 1. BEHAVIORAL PATTERNS TABLE
-- Multi-layer pattern storage following cognitive memory models
-- ============================================

CREATE TABLE IF NOT EXISTS behavioral_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pattern classification (cognitive memory layers)
  layer TEXT NOT NULL CHECK (layer IN ('micro', 'daily', 'weekly', 'macro')),
  -- micro: seconds-minutes (song skips, HR spikes)
  -- daily: hours (morning routine, work patterns)
  -- weekly: days (weekend vs weekday behavior)
  -- macro: weeks-months (seasonal mood shifts)

  category TEXT NOT NULL, -- 'music', 'sleep', 'social', 'work', 'health', 'fitness', 'communication'
  pattern_type TEXT NOT NULL, -- 'rhythm', 'preference', 'trigger', 'response', 'sequence'

  -- Pattern definition
  name TEXT NOT NULL,
  description TEXT,
  pattern_data JSONB NOT NULL DEFAULT '{}',
  -- Example pattern_data:
  -- { "trigger": "past_bedtime", "condition": "hr > baseline * 1.3", "typical_time": "22:00-02:00" }

  evidence JSONB NOT NULL DEFAULT '[]',
  -- Array of supporting observations: [{ "event_id": "...", "timestamp": "...", "platform": "..." }]

  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),

  -- Research backing
  correlation_id TEXT, -- Reference to validated-correlations.json
  r_value FLOAT, -- Correlation strength from research
  effect_size TEXT, -- 'small', 'medium', 'large'

  -- Metadata
  first_observed TIMESTAMPTZ DEFAULT NOW(),
  last_confirmed TIMESTAMPTZ DEFAULT NOW(),
  observation_count INT DEFAULT 1,

  -- Prevent duplicate patterns
  UNIQUE(user_id, layer, category, name),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_user ON behavioral_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_layer ON behavioral_patterns(layer);
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_category ON behavioral_patterns(category);
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_confidence ON behavioral_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_last_confirmed ON behavioral_patterns(last_confirmed DESC);

-- ============================================
-- 2. REALTIME EVENTS TABLE
-- Event logging for proactive trigger evaluation
-- ============================================

CREATE TABLE IF NOT EXISTS realtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event source
  platform TEXT NOT NULL, -- 'spotify', 'whoop', 'calendar', 'github', etc.
  event_type TEXT NOT NULL, -- 'track_played', 'recovery_updated', 'meeting_started', etc.
  event_data JSONB NOT NULL DEFAULT '{}',
  -- Example: { "track_id": "...", "valence": 0.8, "energy": 0.6, "timestamp": "..." }

  -- Context at event time
  context JSONB DEFAULT '{}',
  -- { "time_of_day": "evening", "day_of_week": "friday", "recovery_score": 75 }

  -- Trigger matching results
  matched_triggers TEXT[] DEFAULT '{}', -- Array of trigger IDs that matched
  actions_taken JSONB DEFAULT '[]', -- What automations ran
  -- [{ "trigger_id": "...", "action": "log_inference", "result": "success" }]

  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ, -- When triggers were evaluated
  processing_duration_ms INT, -- How long trigger evaluation took

  -- TTL for cleanup (30 days default)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Indexes for trigger evaluation
CREATE INDEX IF NOT EXISTS idx_realtime_events_user_time ON realtime_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_realtime_events_platform ON realtime_events(platform);
CREATE INDEX IF NOT EXISTS idx_realtime_events_type ON realtime_events(event_type);
CREATE INDEX IF NOT EXISTS idx_realtime_events_unprocessed ON realtime_events(user_id) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_realtime_events_expires ON realtime_events(expires_at);

-- ============================================
-- 3. PROACTIVE TRIGGERS TABLE
-- User-defined automation rules
-- ============================================

CREATE TABLE IF NOT EXISTS proactive_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Trigger definition
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false, -- System-defined vs user-defined

  -- Conditions (all must be true)
  conditions JSONB NOT NULL DEFAULT '[]',
  /* Example conditions:
  [
    {"type": "time", "operator": "after", "value": "user.typical_bedtime"},
    {"type": "metric", "platform": "whoop", "field": "heart_rate", "operator": ">", "value": 85},
    {"type": "pattern", "check": "not_exercising"},
    {"type": "event", "platform": "spotify", "event": "track_played"}
  ]
  */

  -- Actions to take when triggered
  actions JSONB NOT NULL DEFAULT '[]',
  /* Example actions:
  [
    {"type": "log_event", "category": "social", "inference": "likely_going_out"},
    {"type": "update_pattern", "layer": "daily", "pattern": "social_nights"},
    {"type": "update_trait", "trait": "extraversion", "direction": "+", "weight": 0.1},
    {"type": "notify", "message": "Looks like you're having a night out!"},
    {"type": "suggest", "message": "Your recovery is low. Consider rescheduling?"}
  ]
  */

  -- Execution control
  cooldown_minutes INT DEFAULT 60,
  max_triggers_per_day INT DEFAULT 10,
  last_triggered_at TIMESTAMPTZ,
  trigger_count INT DEFAULT 0,

  -- Research backing (optional)
  research_basis TEXT, -- Citation or explanation
  correlation_strength FLOAT, -- If based on research

  -- Priority for ordering
  priority INT DEFAULT 50, -- Higher = evaluated first

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proactive_triggers_user ON proactive_triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_proactive_triggers_enabled ON proactive_triggers(user_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_proactive_triggers_priority ON proactive_triggers(priority DESC);

-- ============================================
-- 4. CLUSTER PERSONALITIES TABLE
-- Separate Big Five profiles per context cluster
-- ============================================

CREATE TABLE IF NOT EXISTS cluster_personalities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cluster type
  cluster TEXT NOT NULL CHECK (cluster IN ('personal', 'professional', 'health', 'creative')),
  -- personal: Spotify, Netflix, YouTube, Discord, Reddit
  -- professional: Gmail, Calendar, GitHub, LinkedIn, Slack
  -- health: Whoop, Apple Health, Oura, Fitbit
  -- creative: Instagram, TikTok, Pinterest

  -- Big Five traits for this cluster (0-100 scale)
  openness FLOAT CHECK (openness >= 0 AND openness <= 100),
  conscientiousness FLOAT CHECK (conscientiousness >= 0 AND conscientiousness <= 100),
  extraversion FLOAT CHECK (extraversion >= 0 AND extraversion <= 100),
  agreeableness FLOAT CHECK (agreeableness >= 0 AND agreeableness <= 100),
  neuroticism FLOAT CHECK (neuroticism >= 0 AND neuroticism <= 100),

  -- Cluster-specific traits
  communication_style TEXT CHECK (communication_style IN ('formal', 'casual', 'mixed', 'adaptive')),
  energy_pattern TEXT CHECK (energy_pattern IN ('morning', 'evening', 'variable', 'steady')),
  social_preference TEXT CHECK (social_preference IN ('solo', 'collaborative', 'mixed', 'context_dependent')),
  response_speed TEXT CHECK (response_speed IN ('immediate', 'thoughtful', 'variable')),

  -- Evidence tracking
  data_points_count INT DEFAULT 0,
  platforms_contributing TEXT[] DEFAULT '{}', -- Which platforms contributed to this profile
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),

  -- Top contributing correlations
  top_correlations JSONB DEFAULT '[]',
  -- [{ "paper": "...", "trait": "openness", "r_value": 0.42, "finding": "..." }]

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, cluster)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cluster_personalities_user ON cluster_personalities(user_id);
CREATE INDEX IF NOT EXISTS idx_cluster_personalities_cluster ON cluster_personalities(cluster);

-- ============================================
-- 5. CLUSTER DIVERGENCE TABLE
-- Track how personality differs between contexts
-- ============================================

CREATE TABLE IF NOT EXISTS cluster_divergence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Cluster pair being compared
  cluster_a TEXT NOT NULL,
  cluster_b TEXT NOT NULL,

  -- Trait divergence scores (absolute difference)
  openness_diff FLOAT,
  conscientiousness_diff FLOAT,
  extraversion_diff FLOAT,
  agreeableness_diff FLOAT,
  neuroticism_diff FLOAT,

  -- Overall divergence score (0-100, weighted average)
  overall_divergence FLOAT,

  -- AI-generated interpretation
  divergence_summary TEXT,
  -- "You show significantly higher extraversion in personal contexts vs professional"

  insights JSONB DEFAULT '[]',
  -- [{ "trait": "extraversion", "observation": "30% higher in personal", "implication": "..." }]

  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, cluster_a, cluster_b)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_cluster_divergence_user ON cluster_divergence(user_id);

-- ============================================
-- 6. TRIGGER EXECUTION LOG
-- Audit trail for trigger activations
-- ============================================

CREATE TABLE IF NOT EXISTS trigger_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_id UUID NOT NULL REFERENCES proactive_triggers(id) ON DELETE CASCADE,

  -- Triggering event
  event_id UUID REFERENCES realtime_events(id) ON DELETE SET NULL,

  -- Execution details
  conditions_evaluated JSONB DEFAULT '{}', -- Result of each condition check
  actions_executed JSONB DEFAULT '[]', -- Results of each action
  execution_status TEXT DEFAULT 'success' CHECK (execution_status IN ('success', 'partial', 'failed', 'skipped')),
  error_message TEXT,

  -- Timing
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INT,

  -- TTL for cleanup
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trigger_executions_user ON trigger_executions(user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trigger_executions_trigger ON trigger_executions(trigger_id);
CREATE INDEX IF NOT EXISTS idx_trigger_executions_expires ON trigger_executions(expires_at);

-- ============================================
-- 7. ROW LEVEL SECURITY POLICIES
-- ============================================

ALTER TABLE behavioral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE realtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE proactive_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_personalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_divergence ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_executions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own behavioral_patterns"
  ON behavioral_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own behavioral_patterns"
  ON behavioral_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own behavioral_patterns"
  ON behavioral_patterns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own behavioral_patterns"
  ON behavioral_patterns FOR DELETE
  USING (auth.uid() = user_id);

-- Realtime events
CREATE POLICY "Users can view own realtime_events"
  ON realtime_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own realtime_events"
  ON realtime_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Proactive triggers
CREATE POLICY "Users can view own proactive_triggers"
  ON proactive_triggers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own proactive_triggers"
  ON proactive_triggers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own proactive_triggers"
  ON proactive_triggers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own proactive_triggers"
  ON proactive_triggers FOR DELETE
  USING (auth.uid() = user_id);

-- Cluster personalities
CREATE POLICY "Users can view own cluster_personalities"
  ON cluster_personalities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cluster_personalities"
  ON cluster_personalities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cluster_personalities"
  ON cluster_personalities FOR UPDATE
  USING (auth.uid() = user_id);

-- Cluster divergence
CREATE POLICY "Users can view own cluster_divergence"
  ON cluster_divergence FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cluster_divergence"
  ON cluster_divergence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Trigger executions
CREATE POLICY "Users can view own trigger_executions"
  ON trigger_executions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trigger_executions"
  ON trigger_executions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 8. HELPER FUNCTIONS
-- ============================================

-- Function to upsert behavioral pattern
CREATE OR REPLACE FUNCTION upsert_behavioral_pattern(
  p_user_id UUID,
  p_layer TEXT,
  p_category TEXT,
  p_name TEXT,
  p_pattern_type TEXT,
  p_description TEXT,
  p_pattern_data JSONB,
  p_evidence JSONB,
  p_confidence FLOAT,
  p_correlation_id TEXT DEFAULT NULL,
  p_r_value FLOAT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO behavioral_patterns (
    user_id, layer, category, name, pattern_type, description,
    pattern_data, evidence, confidence, correlation_id, r_value,
    observation_count, last_confirmed
  )
  VALUES (
    p_user_id, p_layer, p_category, p_name, p_pattern_type, p_description,
    p_pattern_data, p_evidence, p_confidence, p_correlation_id, p_r_value,
    1, NOW()
  )
  ON CONFLICT (user_id, layer, category, name) DO UPDATE SET
    description = COALESCE(EXCLUDED.description, behavioral_patterns.description),
    pattern_data = EXCLUDED.pattern_data,
    evidence = behavioral_patterns.evidence || EXCLUDED.evidence,
    confidence = (behavioral_patterns.confidence + EXCLUDED.confidence) / 2,
    observation_count = behavioral_patterns.observation_count + 1,
    last_confirmed = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate cluster divergence
CREATE OR REPLACE FUNCTION calculate_cluster_divergence(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_clusters TEXT[] := ARRAY['personal', 'professional', 'health', 'creative'];
  v_cluster_a TEXT;
  v_cluster_b TEXT;
  v_profile_a cluster_personalities;
  v_profile_b cluster_personalities;
  v_overall_diff FLOAT;
BEGIN
  -- Loop through cluster pairs
  FOREACH v_cluster_a IN ARRAY v_clusters LOOP
    FOREACH v_cluster_b IN ARRAY v_clusters LOOP
      IF v_cluster_a < v_cluster_b THEN
        -- Get profiles
        SELECT * INTO v_profile_a FROM cluster_personalities
        WHERE user_id = p_user_id AND cluster = v_cluster_a;

        SELECT * INTO v_profile_b FROM cluster_personalities
        WHERE user_id = p_user_id AND cluster = v_cluster_b;

        -- Skip if either profile doesn't exist
        IF v_profile_a IS NULL OR v_profile_b IS NULL THEN
          CONTINUE;
        END IF;

        -- Calculate overall divergence (weighted average)
        v_overall_diff := (
          ABS(COALESCE(v_profile_a.openness, 50) - COALESCE(v_profile_b.openness, 50)) * 0.2 +
          ABS(COALESCE(v_profile_a.conscientiousness, 50) - COALESCE(v_profile_b.conscientiousness, 50)) * 0.2 +
          ABS(COALESCE(v_profile_a.extraversion, 50) - COALESCE(v_profile_b.extraversion, 50)) * 0.2 +
          ABS(COALESCE(v_profile_a.agreeableness, 50) - COALESCE(v_profile_b.agreeableness, 50)) * 0.2 +
          ABS(COALESCE(v_profile_a.neuroticism, 50) - COALESCE(v_profile_b.neuroticism, 50)) * 0.2
        );

        -- Upsert divergence record
        INSERT INTO cluster_divergence (
          user_id, cluster_a, cluster_b,
          openness_diff, conscientiousness_diff, extraversion_diff,
          agreeableness_diff, neuroticism_diff, overall_divergence,
          calculated_at
        ) VALUES (
          p_user_id, v_cluster_a, v_cluster_b,
          ABS(COALESCE(v_profile_a.openness, 50) - COALESCE(v_profile_b.openness, 50)),
          ABS(COALESCE(v_profile_a.conscientiousness, 50) - COALESCE(v_profile_b.conscientiousness, 50)),
          ABS(COALESCE(v_profile_a.extraversion, 50) - COALESCE(v_profile_b.extraversion, 50)),
          ABS(COALESCE(v_profile_a.agreeableness, 50) - COALESCE(v_profile_b.agreeableness, 50)),
          ABS(COALESCE(v_profile_a.neuroticism, 50) - COALESCE(v_profile_b.neuroticism, 50)),
          v_overall_diff,
          NOW()
        )
        ON CONFLICT (user_id, cluster_a, cluster_b) DO UPDATE SET
          openness_diff = EXCLUDED.openness_diff,
          conscientiousness_diff = EXCLUDED.conscientiousness_diff,
          extraversion_diff = EXCLUDED.extraversion_diff,
          agreeableness_diff = EXCLUDED.agreeableness_diff,
          neuroticism_diff = EXCLUDED.neuroticism_diff,
          overall_divergence = EXCLUDED.overall_divergence,
          calculated_at = NOW();
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup expired data
CREATE OR REPLACE FUNCTION cleanup_expired_proactive_data()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_count INTEGER;
BEGIN
  -- Delete expired realtime events
  DELETE FROM realtime_events WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + v_count;

  -- Delete expired trigger executions
  DELETE FROM trigger_executions WHERE expires_at < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted + v_count;

  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. UPDATED_AT TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_behavioral_patterns_updated_at
  BEFORE UPDATE ON behavioral_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proactive_triggers_updated_at
  BEFORE UPDATE ON proactive_triggers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cluster_personalities_updated_at
  BEFORE UPDATE ON cluster_personalities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 10. SEED DEFAULT TRIGGER TEMPLATES
-- ============================================

-- Note: These would be inserted for each user on onboarding
-- Keeping as reference for system triggers

COMMENT ON TABLE behavioral_patterns IS 'Multi-layer behavioral pattern storage following cognitive memory models (micro/daily/weekly/macro)';
COMMENT ON TABLE realtime_events IS 'Event log for proactive trigger evaluation with 30-day retention';
COMMENT ON TABLE proactive_triggers IS 'User-defined automation rules with conditions and actions';
COMMENT ON TABLE cluster_personalities IS 'Separate Big Five profiles per context cluster (personal/professional/health/creative)';
COMMENT ON TABLE cluster_divergence IS 'Tracks personality differences between contexts for self-awareness insights';
COMMENT ON TABLE trigger_executions IS 'Audit trail for trigger activations with 90-day retention';
