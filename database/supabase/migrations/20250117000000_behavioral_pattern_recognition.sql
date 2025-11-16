-- ====================================================================
-- BEHAVIORAL PATTERN RECOGNITION SYSTEM
-- Migration: 20250117 - Multi-Modal Behavioral Intelligence
--
-- Purpose: Cross-platform behavioral pattern detection and correlation
-- Captures temporal relationships between calendar events and user activities
-- Example: "User listens to lo-fi hip hop 20 min before presentations"
-- ====================================================================

-- ====================================================================
-- BEHAVIORAL PATTERNS TABLE
-- Core pattern storage with confidence scoring
-- ====================================================================

CREATE TABLE IF NOT EXISTS behavioral_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Pattern identification
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'pre_event_ritual',        -- Behavior before scheduled events
    'post_event_recovery',     -- Behavior after stressful events
    'stress_response',         -- Response to high-pressure situations
    'focus_trigger',           -- Activities that precede focus work
    'social_preparation',      -- Pre-social event behavior
    'energy_boost',            -- Activities when energy is low
    'wind_down',              -- Evening/relaxation rituals
    'morning_routine',         -- Consistent morning patterns
    'productivity_pattern',    -- Work-related behavioral loops
    'emotional_regulation'     -- Mood management behaviors
  )),

  pattern_name TEXT NOT NULL,        -- e.g., "Pre-presentation calm music"
  pattern_description TEXT,          -- Human-readable explanation

  -- Trigger event (what precedes the behavior)
  trigger_type TEXT CHECK (trigger_type IN (
    'calendar_event',          -- Scheduled events (meetings, presentations)
    'deadline',                -- Project deadlines, submissions
    'social_activity',         -- Social gatherings, calls
    'work_session',            -- Focus work periods
    'time_of_day',             -- Circadian patterns
    'day_of_week',             -- Weekly patterns
    'stress_signal'            -- Detected stress indicators
  )),

  trigger_keywords JSONB,            -- Keywords that identify trigger events
                                     -- Example: ["presentation", "meeting", "interview"]
  trigger_metadata JSONB,            -- Additional trigger context
                                     -- Example: { "eventType": "high_stakes", "attendeeCount": 10 }

  -- Behavioral response (what the user does)
  response_platform TEXT NOT NULL CHECK (response_platform IN (
    'spotify', 'apple_music',        -- Music listening
    'youtube', 'netflix',            -- Video content
    'discord', 'reddit',             -- Social platforms
    'github', 'email',               -- Work platforms
    'calendar',                      -- Scheduling behavior
    'multiple'                       -- Cross-platform pattern
  )),

  response_type TEXT NOT NULL CHECK (response_type IN (
    'music_playlist',          -- Specific playlist
    'music_genre',             -- Genre preference
    'music_artist',            -- Artist choice
    'video_content',           -- YouTube/Netflix content
    'game_session',            -- Gaming activity
    'social_activity',         -- Discord/Reddit engagement
    'coding_session',          -- GitHub activity
    'email_batch',             -- Email processing
    'calendar_review',         -- Calendar management
    'content_binge',           -- Extended content consumption
    'multiple_activities'      -- Combination of activities
  )),

  response_data JSONB NOT NULL,      -- Detailed response information
                                     -- Example: {
                                     --   "playlist_id": "37i9dQZF1DX4sWSpwq3LiO",
                                     --   "playlist_name": "Peaceful Piano",
                                     --   "genre": "classical",
                                     --   "tempo_range": [60, 80],
                                     --   "energy_level": "low"
                                     -- }

  -- Temporal relationship
  time_offset_minutes INT NOT NULL,  -- Time relative to trigger event
                                     -- Negative = before event (e.g., -20 for "20 min before")
                                     -- Positive = after event (e.g., 30 for "30 min after")
  time_window_minutes INT,           -- Duration of behavior (e.g., 15 min listening session)

  -- Confidence metrics (ML-based scoring)
  occurrence_count INT DEFAULT 1,    -- How many times observed
  consistency_rate DECIMAL(5,2) CHECK (consistency_rate >= 0 AND consistency_rate <= 100),
                                     -- % of similar events where this pattern occurred
  confidence_score DECIMAL(5,2) CHECK (confidence_score >= 0 AND confidence_score <= 100),
                                     -- Overall confidence: 0-100

  last_confidence_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Context and insights
  emotional_state TEXT CHECK (emotional_state IN (
    'anxious', 'calm', 'focused', 'excited', 'stressed',
    'energized', 'tired', 'happy', 'neutral', 'overwhelmed'
  )),

  hypothesized_purpose TEXT CHECK (hypothesized_purpose IN (
    'stress_reduction',        -- Calming down
    'mental_preparation',      -- Getting ready
    'energy_boost',            -- Increasing energy
    'focus_enhancement',       -- Improving concentration
    'social_warmup',           -- Social preparation
    'recovery',                -- Post-event recovery
    'procrastination',         -- Avoidance behavior
    'celebration',             -- Rewarding self
    'routine_habit',           -- Automatic behavior
    'unknown'                  -- Not yet determined
  )),

  ai_insight TEXT,                   -- Claude-generated insight about pattern
  user_confirmed BOOLEAN DEFAULT FALSE, -- User validated this pattern
  user_notes TEXT,                   -- User's own interpretation

  -- Metadata
  first_observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_observed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  next_predicted_occurrence TIMESTAMP WITH TIME ZONE, -- When we expect this pattern next

  is_active BOOLEAN DEFAULT TRUE,    -- Pattern still occurring
  auto_detected BOOLEAN DEFAULT TRUE, -- vs. manually created

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Ensure patterns are unique per user
  UNIQUE(user_id, pattern_type, trigger_keywords, response_platform, response_type, time_offset_minutes)
);

-- ====================================================================
-- PATTERN OBSERVATIONS TABLE
-- Individual occurrences of detected patterns
-- ====================================================================

CREATE TABLE IF NOT EXISTS pattern_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID NOT NULL REFERENCES behavioral_patterns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Event context
  trigger_event_id TEXT,             -- Calendar event ID, deadline ID, etc.
  trigger_event_data JSONB,          -- Full event details
  trigger_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Response activity
  response_activity_id TEXT,         -- Spotify track ID, YouTube video ID, etc.
  response_activity_data JSONB,      -- Full activity details
  response_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Temporal relationship
  actual_time_offset_minutes INT,    -- Actual offset for this occurrence
  actual_duration_minutes INT,       -- Actual duration

  -- Quality metrics
  match_strength DECIMAL(5,2) CHECK (match_strength >= 0 AND match_strength <= 100),
                                     -- How well this observation matches the pattern
  anomaly_score DECIMAL(5,2),        -- Deviation from typical pattern

  -- Metadata
  observed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  contributed_to_pattern BOOLEAN DEFAULT TRUE, -- Used in pattern confidence calculation

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- PATTERN INSIGHTS TABLE
-- Generated insights and suggestions based on patterns
-- ====================================================================

CREATE TABLE IF NOT EXISTS pattern_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pattern_id UUID REFERENCES behavioral_patterns(id) ON DELETE CASCADE,

  -- Insight details
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'ritual_discovery',        -- "You have a pre-presentation ritual"
    'behavior_prediction',     -- "You'll likely do X before Y"
    'pattern_suggestion',      -- "Consider this pattern for upcoming event"
    'anomaly_detection',       -- "You broke your usual pattern"
    'pattern_evolution',       -- "Your pattern is changing"
    'cross_pattern_correlation', -- "These two patterns often co-occur"
    'optimization_tip',        -- "This pattern seems effective for you"
    'awareness_nudge'          -- "You might not have noticed this"
  )),

  title TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence DECIMAL(5,2) CHECK (confidence >= 0 AND confidence <= 100),

  -- Insight data
  insight_data JSONB NOT NULL,       -- Structured data for frontend rendering
                                     -- Example: {
                                     --   "trigger": "High-stakes presentations",
                                     --   "behavior": "Lo-fi hip hop playlist",
                                     --   "timing": "20 minutes before",
                                     --   "frequency": "12 out of 13 presentations",
                                     --   "effectiveness_signal": "high"
                                     -- }

  -- Actionable suggestions
  suggestions JSONB,                 -- Array of actionable recommendations
                                     -- Example: [
                                     --   "Queue your focus playlist automatically",
                                     --   "Set calendar reminder: 'Time to prepare'",
                                     --   "Create variations for different event types"
                                     -- ]

  -- User engagement
  user_acknowledged BOOLEAN DEFAULT FALSE,
  user_rating INT CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback TEXT,

  -- Privacy and sharing
  privacy_level INT DEFAULT 50,      -- 0-100, controls revelation
  shared_with_twin BOOLEAN DEFAULT FALSE,

  -- Metadata
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE, -- Time-sensitive insights
  dismissed_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- PATTERN TRACKING SESSIONS TABLE
-- Track real-time pattern detection sessions
-- ====================================================================

CREATE TABLE IF NOT EXISTS pattern_tracking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  session_type TEXT NOT NULL CHECK (session_type IN (
    'scheduled',               -- Regular scheduled tracking
    'event_triggered',         -- Triggered by upcoming calendar event
    'manual',                  -- User-initiated
    'continuous'               -- Always-on tracking
  )),

  -- Tracking window
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Events being tracked
  tracked_events JSONB,              -- Calendar events in window
  detected_activities JSONB,         -- User activities observed

  -- Results
  patterns_matched INT DEFAULT 0,
  patterns_discovered INT DEFAULT 0,
  anomalies_detected INT DEFAULT 0,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active', 'completed', 'failed', 'cancelled'
  )),

  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ====================================================================
-- INDEXES FOR PERFORMANCE
-- Optimized for temporal queries and pattern matching
-- ====================================================================

-- Pattern lookups
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_user
  ON behavioral_patterns(user_id, is_active, confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_type
  ON behavioral_patterns(pattern_type, user_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_confidence
  ON behavioral_patterns(confidence_score DESC, user_id)
  WHERE confidence_score >= 70 AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_trigger
  ON behavioral_patterns(trigger_type, user_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_platform
  ON behavioral_patterns(response_platform, response_type, user_id)
  WHERE is_active = TRUE;

-- Temporal pattern queries
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_time_offset
  ON behavioral_patterns(time_offset_minutes, user_id)
  WHERE is_active = TRUE;

-- Next occurrence predictions
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_predictions
  ON behavioral_patterns(next_predicted_occurrence, user_id)
  WHERE next_predicted_occurrence IS NOT NULL AND is_active = TRUE;

-- Pattern observations
CREATE INDEX IF NOT EXISTS idx_pattern_observations_pattern
  ON pattern_observations(pattern_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pattern_observations_user
  ON pattern_observations(user_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pattern_observations_trigger_time
  ON pattern_observations(trigger_timestamp DESC, user_id);

-- Pattern insights
CREATE INDEX IF NOT EXISTS idx_pattern_insights_user
  ON pattern_insights(user_id, generated_at DESC)
  WHERE dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pattern_insights_confidence
  ON pattern_insights(confidence DESC, user_id)
  WHERE confidence >= 70 AND dismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pattern_insights_pattern
  ON pattern_insights(pattern_id, generated_at DESC)
  WHERE pattern_id IS NOT NULL;

-- Tracking sessions
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_user
  ON pattern_tracking_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_sessions_active
  ON pattern_tracking_sessions(status, window_start, window_end)
  WHERE status = 'active';

-- ====================================================================
-- FUNCTIONS & TRIGGERS
-- ====================================================================

-- Auto-update timestamp
CREATE OR REPLACE FUNCTION update_pattern_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for behavioral_patterns
DROP TRIGGER IF EXISTS trigger_update_behavioral_patterns_timestamp ON behavioral_patterns;
CREATE TRIGGER trigger_update_behavioral_patterns_timestamp
  BEFORE UPDATE ON behavioral_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_updated_at();

-- Trigger for pattern_insights
DROP TRIGGER IF EXISTS trigger_update_pattern_insights_timestamp ON pattern_insights;
CREATE TRIGGER trigger_update_pattern_insights_timestamp
  BEFORE UPDATE ON pattern_insights
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_updated_at();

-- Function to calculate pattern confidence score
CREATE OR REPLACE FUNCTION calculate_pattern_confidence(
  p_occurrence_count INT,
  p_consistency_rate DECIMAL,
  p_days_since_first DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  frequency_score DECIMAL;
  consistency_score DECIMAL;
  recency_score DECIMAL;
  final_score DECIMAL;
BEGIN
  -- Frequency component (0-40 points)
  -- More occurrences = higher confidence (diminishing returns)
  frequency_score := LEAST(40, p_occurrence_count * 4);

  -- Consistency component (0-40 points)
  -- Directly from consistency rate
  consistency_score := p_consistency_rate * 0.4;

  -- Recency component (0-20 points)
  -- Patterns observed over longer periods are more reliable
  recency_score := LEAST(20, p_days_since_first / 2);

  -- Combined score
  final_score := frequency_score + consistency_score + recency_score;

  RETURN LEAST(100, final_score);
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- VIEWS FOR COMMON QUERIES
-- ====================================================================

-- High-confidence active patterns
CREATE OR REPLACE VIEW high_confidence_patterns AS
SELECT
  bp.*,
  COUNT(po.id) AS observation_count,
  MAX(po.observed_at) AS last_observation_at
FROM behavioral_patterns bp
LEFT JOIN pattern_observations po ON bp.id = po.pattern_id
WHERE bp.is_active = TRUE
  AND bp.confidence_score >= 70
GROUP BY bp.id
ORDER BY bp.confidence_score DESC;

-- Recent pattern insights
CREATE OR REPLACE VIEW recent_pattern_insights AS
SELECT
  pi.*,
  bp.pattern_name,
  bp.pattern_type,
  bp.confidence_score AS pattern_confidence
FROM pattern_insights pi
LEFT JOIN behavioral_patterns bp ON pi.pattern_id = bp.id
WHERE pi.dismissed_at IS NULL
  AND (pi.expires_at IS NULL OR pi.expires_at > NOW())
ORDER BY pi.confidence DESC, pi.generated_at DESC;

-- Pattern effectiveness summary
CREATE OR REPLACE VIEW pattern_effectiveness_summary AS
SELECT
  user_id,
  pattern_type,
  COUNT(*) AS pattern_count,
  AVG(confidence_score) AS avg_confidence,
  AVG(occurrence_count) AS avg_occurrences,
  MAX(last_observed_at) AS most_recent_observation
FROM behavioral_patterns
WHERE is_active = TRUE
GROUP BY user_id, pattern_type
ORDER BY avg_confidence DESC;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS)
-- Users can only access their own patterns
-- ====================================================================

ALTER TABLE behavioral_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_tracking_sessions ENABLE ROW LEVEL SECURITY;

-- Behavioral patterns policies
CREATE POLICY behavioral_patterns_select_own ON behavioral_patterns
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY behavioral_patterns_insert_own ON behavioral_patterns
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY behavioral_patterns_update_own ON behavioral_patterns
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY behavioral_patterns_delete_own ON behavioral_patterns
  FOR DELETE USING (auth.uid() = user_id);

-- Pattern observations policies
CREATE POLICY pattern_observations_select_own ON pattern_observations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY pattern_observations_insert_own ON pattern_observations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Pattern insights policies
CREATE POLICY pattern_insights_select_own ON pattern_insights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY pattern_insights_insert_own ON pattern_insights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY pattern_insights_update_own ON pattern_insights
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY pattern_insights_delete_own ON pattern_insights
  FOR DELETE USING (auth.uid() = user_id);

-- Tracking sessions policies
CREATE POLICY tracking_sessions_select_own ON pattern_tracking_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY tracking_sessions_insert_own ON pattern_tracking_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ====================================================================
-- GRANT PERMISSIONS
-- ====================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON behavioral_patterns TO authenticated;
GRANT SELECT, INSERT ON pattern_observations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pattern_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE ON pattern_tracking_sessions TO authenticated;

GRANT SELECT ON high_confidence_patterns TO authenticated;
GRANT SELECT ON recent_pattern_insights TO authenticated;
GRANT SELECT ON pattern_effectiveness_summary TO authenticated;

GRANT ALL ON behavioral_patterns TO service_role;
GRANT ALL ON pattern_observations TO service_role;
GRANT ALL ON pattern_insights TO service_role;
GRANT ALL ON pattern_tracking_sessions TO service_role;

-- ====================================================================
-- COMMENTS FOR DOCUMENTATION
-- ====================================================================

COMMENT ON TABLE behavioral_patterns IS
  'Stores detected cross-platform behavioral patterns with confidence scoring';

COMMENT ON COLUMN behavioral_patterns.time_offset_minutes IS
  'Time relative to trigger event: negative = before, positive = after';

COMMENT ON COLUMN behavioral_patterns.confidence_score IS
  'ML-based confidence score (0-100) based on frequency, consistency, and recency';

COMMENT ON TABLE pattern_observations IS
  'Individual occurrences of detected patterns for tracking and validation';

COMMENT ON TABLE pattern_insights IS
  'Generated insights and suggestions based on behavioral patterns';

COMMENT ON VIEW high_confidence_patterns IS
  'Active patterns with confidence >= 70% for reliable insights';

COMMENT ON FUNCTION calculate_pattern_confidence IS
  'Calculates pattern confidence based on frequency, consistency, and temporal stability';

-- Migration complete
