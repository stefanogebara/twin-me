-- Homeostatic importance regulation RPCs
-- Prevent importance score inflation by tracking mean and applying corrective shifts

-- Get mean importance score and total count across all active memories
CREATE OR REPLACE FUNCTION get_importance_stats()
RETURNS TABLE(mean_importance FLOAT, total_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    AVG(importance_score)::FLOAT AS mean_importance,
    COUNT(*)::BIGINT AS total_count
  FROM user_memories
  WHERE importance_score IS NOT NULL;
END;
$$;

-- Apply a corrective shift to importance scores
-- p_shift: amount to add (negative = reduce, positive = increase)
-- p_limit: max number of memories to shift per run
-- Never touches scores of 1 or 10 (anchored extremes)
-- Minimum effective shift is 1 (prevents ROUND(0.3)=0 no-ops)
CREATE OR REPLACE FUNCTION apply_importance_shift(p_shift FLOAT, p_limit INT DEFAULT 500)
RETURNS TABLE(shifted_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shifted INT := 0;
  v_effective_shift INT;
BEGIN
  -- Ensure minimum shift of 1 in the correct direction
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
    -- Reduce: target high-importance memories (but not 10s or 1s)
    UPDATE user_memories
    SET importance_score = GREATEST(2, importance_score + v_effective_shift)
    WHERE id IN (
      SELECT id FROM user_memories
      WHERE importance_score BETWEEN 2 AND 9
        AND importance_score >= 6
      ORDER BY importance_score DESC, created_at ASC
      LIMIT p_limit
    );
  ELSE
    -- Increase: target low-importance memories (but not 1s or 10s)
    UPDATE user_memories
    SET importance_score = LEAST(9, importance_score + v_effective_shift)
    WHERE id IN (
      SELECT id FROM user_memories
      WHERE importance_score BETWEEN 2 AND 9
        AND importance_score <= 4
      ORDER BY importance_score ASC, created_at ASC
      LIMIT p_limit
    );
  END IF;

  GET DIAGNOSTICS v_shifted = ROW_COUNT;
  RETURN QUERY SELECT v_shifted;
END;
$$;
