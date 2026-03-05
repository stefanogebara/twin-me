-- ============================================================================
-- Add revision_count to user_memories
-- Date: 2026-03-05
--
-- Tracks how many times a memory has been revised (via proposition revision
-- or Bayesian contradiction). Useful for identifying stable vs volatile memories.
-- ============================================================================

ALTER TABLE user_memories ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

-- RPC to atomically update confidence + increment revision_count
CREATE OR REPLACE FUNCTION update_memory_confidence(
  p_memory_id      UUID,
  p_new_confidence DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE user_memories
  SET confidence = p_new_confidence,
      revision_count = COALESCE(revision_count, 0) + 1
  WHERE id = p_memory_id;
$$;
