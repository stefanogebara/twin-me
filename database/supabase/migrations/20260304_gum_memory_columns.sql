-- ============================================================================
-- GUM Memory Columns: Catch-up Migration
-- Date: 2026-03-04
--
-- Codifies the GUM (Grounded Updatable Memory) columns that were applied
-- directly in the Supabase dashboard during Phase 5 Sprint 1.
--
-- Columns:
--   confidence       - Bayesian confidence (0.0-1.0), default 0.7
--   reasoning        - LLM-generated reasoning for the memory
--   grounding_ids    - UUIDs of source memories that ground this memory
--   decay_rate       - Per-type Ebbinghaus stability in days
--   retrieval_count  - Number of times this memory has been retrieved
--
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS).
-- ============================================================================

ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0.7,
  ADD COLUMN IF NOT EXISTS reasoning TEXT,
  ADD COLUMN IF NOT EXISTS grounding_ids UUID[],
  ADD COLUMN IF NOT EXISTS decay_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS retrieval_count INTEGER DEFAULT 0;

-- Index for confidence-based filtering (e.g., forgetting cron skips high-confidence)
CREATE INDEX IF NOT EXISTS idx_user_memories_confidence
  ON user_memories (confidence);

COMMENT ON COLUMN user_memories.confidence IS 'Bayesian confidence 0.0-1.0 (GUM architecture). Default 0.7.';
COMMENT ON COLUMN user_memories.decay_rate IS 'Ebbinghaus stability in days: conversation=3, platform_data=7, fact=30, reflection=90.';
COMMENT ON COLUMN user_memories.retrieval_count IS 'Number of times retrieved via search_memory_stream. Used to protect frequently-accessed memories from forgetting.';
