-- ====================================================================
-- BEHAVIORAL PATTERN HELPER FUNCTIONS
-- Additional database functions for pattern recognition
-- ====================================================================

-- Function to increment pattern occurrence count
CREATE OR REPLACE FUNCTION increment_pattern_occurrence(
  p_pattern_id UUID,
  p_observation_time TIMESTAMP WITH TIME ZONE
)
RETURNS VOID AS $$
BEGIN
  UPDATE behavioral_patterns
  SET
    occurrence_count = occurrence_count + 1,
    last_observed_at = p_observation_time,
    updated_at = NOW()
  WHERE id = p_pattern_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update pattern consistency rate
CREATE OR REPLACE FUNCTION update_pattern_consistency(
  p_pattern_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_observations INT;
  v_unique_events INT;
  v_total_events INT;
  v_consistency DECIMAL;
  v_pattern RECORD;
BEGIN
  -- Get pattern details
  SELECT * INTO v_pattern
  FROM behavioral_patterns
  WHERE id = p_pattern_id;

  -- Count unique trigger events for this pattern
  SELECT COUNT(DISTINCT trigger_event_id) INTO v_unique_events
  FROM pattern_observations
  WHERE pattern_id = p_pattern_id
    AND contributed_to_pattern = TRUE;

  -- Count total observations
  SELECT COUNT(*) INTO v_observations
  FROM pattern_observations
  WHERE pattern_id = p_pattern_id
    AND contributed_to_pattern = TRUE;

  -- Estimate total events of this type (simplified)
  -- In production, this would query calendar events matching pattern triggers
  v_total_events := v_unique_events; -- Simplified for now

  -- Calculate consistency rate
  IF v_total_events > 0 THEN
    v_consistency := (v_unique_events::DECIMAL / v_total_events::DECIMAL) * 100;
  ELSE
    v_consistency := 0;
  END IF;

  -- Update pattern
  UPDATE behavioral_patterns
  SET
    occurrence_count = v_observations,
    consistency_rate = v_consistency,
    updated_at = NOW()
  WHERE id = p_pattern_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate and update confidence score
CREATE OR REPLACE FUNCTION update_pattern_confidence(
  p_pattern_id UUID
)
RETURNS DECIMAL AS $$
DECLARE
  v_pattern RECORD;
  v_days_since_first DECIMAL;
  v_confidence DECIMAL;
BEGIN
  -- Get pattern
  SELECT * INTO v_pattern
  FROM behavioral_patterns
  WHERE id = p_pattern_id;

  -- Calculate days since first observation
  v_days_since_first := EXTRACT(EPOCH FROM (v_pattern.last_observed_at - v_pattern.first_observed_at)) / 86400;

  -- Calculate confidence using our ML algorithm
  v_confidence := calculate_pattern_confidence(
    v_pattern.occurrence_count,
    v_pattern.consistency_rate,
    v_days_since_first
  );

  -- Update pattern
  UPDATE behavioral_patterns
  SET
    confidence_score = v_confidence,
    last_confidence_update = NOW(),
    updated_at = NOW()
  WHERE id = p_pattern_id;

  RETURN v_confidence;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old tracking sessions
CREATE OR REPLACE FUNCTION cleanup_old_tracking_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete completed tracking sessions older than 30 days
  DELETE FROM pattern_tracking_sessions
  WHERE status IN ('completed', 'failed', 'cancelled')
    AND completed_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user pattern summary
CREATE OR REPLACE FUNCTION get_user_pattern_summary(
  p_user_id UUID
)
RETURNS TABLE (
  total_patterns BIGINT,
  high_confidence_patterns BIGINT,
  recent_observations BIGINT,
  avg_confidence DECIMAL,
  most_common_type TEXT,
  most_common_platform TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_patterns,
    COUNT(*) FILTER (WHERE confidence_score >= 70) AS high_confidence_patterns,
    (
      SELECT COUNT(*)
      FROM pattern_observations po
      WHERE po.user_id = p_user_id
        AND po.observed_at >= NOW() - INTERVAL '7 days'
    ) AS recent_observations,
    ROUND(AVG(confidence_score)::DECIMAL, 2) AS avg_confidence,
    (
      SELECT pattern_type
      FROM behavioral_patterns
      WHERE user_id = p_user_id AND is_active = TRUE
      GROUP BY pattern_type
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_type,
    (
      SELECT response_platform
      FROM behavioral_patterns
      WHERE user_id = p_user_id AND is_active = TRUE
      GROUP BY response_platform
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_platform
  FROM behavioral_patterns
  WHERE user_id = p_user_id
    AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to find similar patterns across users (for future social features)
CREATE OR REPLACE FUNCTION find_similar_patterns(
  p_pattern_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  pattern_id UUID,
  similarity_score DECIMAL,
  user_count BIGINT
) AS $$
DECLARE
  v_pattern RECORD;
BEGIN
  -- Get source pattern
  SELECT * INTO v_pattern
  FROM behavioral_patterns
  WHERE id = p_pattern_id;

  -- Find patterns with similar characteristics
  -- This is a simplified similarity algorithm
  RETURN QUERY
  SELECT
    bp.id AS pattern_id,
    (
      -- Similarity based on pattern type, platform, and timing
      CASE WHEN bp.pattern_type = v_pattern.pattern_type THEN 40 ELSE 0 END +
      CASE WHEN bp.response_platform = v_pattern.response_platform THEN 30 ELSE 0 END +
      CASE WHEN ABS(bp.time_offset_minutes - v_pattern.time_offset_minutes) <= 10 THEN 30 ELSE 0 END
    )::DECIMAL AS similarity_score,
    COUNT(DISTINCT bp.user_id) AS user_count
  FROM behavioral_patterns bp
  WHERE bp.id != p_pattern_id
    AND bp.is_active = TRUE
    AND bp.confidence_score >= 70
  GROUP BY bp.id
  HAVING (
    CASE WHEN bp.pattern_type = v_pattern.pattern_type THEN 40 ELSE 0 END +
    CASE WHEN bp.response_platform = v_pattern.response_platform THEN 30 ELSE 0 END +
    CASE WHEN ABS(bp.time_offset_minutes - v_pattern.time_offset_minutes) <= 10 THEN 30 ELSE 0 END
  ) >= 60
  ORDER BY similarity_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Add column to users table for pattern tracking opt-in
ALTER TABLE users ADD COLUMN IF NOT EXISTS pattern_tracking_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pattern_sharing_level INT DEFAULT 50 CHECK (pattern_sharing_level >= 0 AND pattern_sharing_level <= 100);

-- Create index on pattern tracking enabled
CREATE INDEX IF NOT EXISTS idx_users_pattern_tracking
  ON users(id)
  WHERE pattern_tracking_enabled = TRUE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_pattern_occurrence TO authenticated;
GRANT EXECUTE ON FUNCTION update_pattern_consistency TO authenticated;
GRANT EXECUTE ON FUNCTION update_pattern_confidence TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_tracking_sessions TO service_role;
GRANT EXECUTE ON FUNCTION get_user_pattern_summary TO authenticated;
GRANT EXECUTE ON FUNCTION find_similar_patterns TO authenticated;

-- Comments
COMMENT ON FUNCTION increment_pattern_occurrence IS
  'Increments pattern occurrence count when new observation is recorded';

COMMENT ON FUNCTION update_pattern_consistency IS
  'Recalculates pattern consistency rate based on observations';

COMMENT ON FUNCTION update_pattern_confidence IS
  'Updates pattern confidence score using ML algorithm';

COMMENT ON FUNCTION get_user_pattern_summary IS
  'Returns comprehensive summary of user behavioral patterns';

COMMENT ON FUNCTION find_similar_patterns IS
  'Finds patterns similar to given pattern across all users (for social features)';

-- Migration complete
