-- get_type_stats: Returns exact count and avg importance for a given memory type.
-- Used by memory-health endpoint to avoid Supabase's 1000-row default cap.
CREATE OR REPLACE FUNCTION get_type_stats(p_user_id UUID, p_type TEXT)
RETURNS TABLE(cnt BIGINT, avg_importance NUMERIC) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS cnt,
    AVG(importance_score)::NUMERIC AS avg_importance
  FROM user_memories
  WHERE user_id = p_user_id
    AND memory_type = p_type;
END;
$$ LANGUAGE plpgsql STABLE;
