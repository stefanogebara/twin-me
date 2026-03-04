-- ============================================================================
-- Fix touch_memories: Increment retrieval_count alongside last_accessed_at
-- Date: 2026-03-04
--
-- The original touch_memories only updated last_accessed_at. Now it also
-- increments retrieval_count so the forgetting cron can protect frequently
-- accessed memories (retrieval_count >= 3 = skip decay).
-- ============================================================================

CREATE OR REPLACE FUNCTION touch_memories(
  p_memory_ids UUID[]
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE user_memories
  SET
    last_accessed_at = NOW(),
    retrieval_count = COALESCE(retrieval_count, 0) + 1
  WHERE id = ANY(p_memory_ids);
$$;
