-- Homeostatic importance regulation — per-user version
-- Replaces global RPCs with user-scoped variants

-- Get mean importance score and total count for a specific user
CREATE OR REPLACE FUNCTION get_importance_stats(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(mean_importance FLOAT, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    -- Backwards compat: global stats
    RETURN QUERY
    SELECT
      AVG(importance_score)::FLOAT AS mean_importance,
      COUNT(*)::BIGINT AS total_count
    FROM user_memories
    WHERE importance_score IS NOT NULL;
  ELSE
    RETURN QUERY
    SELECT
      AVG(importance_score)::FLOAT AS mean_importance,
      COUNT(*)::BIGINT AS total_count
    FROM user_memories
    WHERE importance_score IS NOT NULL
      AND user_id = p_user_id;
  END IF;
END;
$$;

-- Apply a corrective shift to importance scores for a specific user
CREATE OR REPLACE FUNCTION apply_importance_shift(p_shift FLOAT, p_limit INT DEFAULT 500, p_user_id UUID DEFAULT NULL)
RETURNS TABLE(shifted_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shifted INT := 0;
  v_effective_shift INT;
BEGIN
  v_effective_shift := CASE
    WHEN p_shift < 0 THEN LEAST(-1, ROUND(p_shift)::INT)
    WHEN p_shift > 0 THEN GREATEST(1, ROUND(p_shift)::INT)
    ELSE 0
  END;

  IF v_effective_shift = 0 THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  IF v_effective_shift < 0 THEN
    UPDATE user_memories
    SET importance_score = GREATEST(2, importance_score + v_effective_shift)
    WHERE id IN (
      SELECT id FROM user_memories
      WHERE importance_score BETWEEN 2 AND 9
        AND importance_score >= 6
        AND (p_user_id IS NULL OR user_id = p_user_id)
      ORDER BY importance_score DESC, created_at ASC
      LIMIT p_limit
    );
  ELSE
    UPDATE user_memories
    SET importance_score = LEAST(9, importance_score + v_effective_shift)
    WHERE id IN (
      SELECT id FROM user_memories
      WHERE importance_score BETWEEN 2 AND 9
        AND importance_score <= 4
        AND (p_user_id IS NULL OR user_id = p_user_id)
      ORDER BY importance_score ASC, created_at ASC
      LIMIT p_limit
    );
  END IF;

  GET DIAGNOSTICS v_shifted = ROW_COUNT;
  RETURN QUERY SELECT v_shifted;
END;
$$;
