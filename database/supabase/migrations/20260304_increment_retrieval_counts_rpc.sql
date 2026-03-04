-- Increment retrieval_count for cited memories (batch operation)
-- Used by citationExtractionService.js after RMM citation extraction

CREATE OR REPLACE FUNCTION increment_retrieval_counts(p_memory_ids UUID[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_memories
  SET retrieval_count = COALESCE(retrieval_count, 0) + 1,
      last_accessed_at = NOW()
  WHERE id = ANY(p_memory_ids);
END;
$$;
