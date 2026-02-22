-- ============================================================================
-- Memory Stream Vector Search: Catch-up Migration
-- Date: 2026-02-22
--
-- This migration documents the schema additions applied directly in the
-- Supabase dashboard that are missing from the migration history.
--
-- What was missing:
-- 1. pgvector extension (required for 1536-dim embeddings)
-- 2. user_memories: embedding, importance_score, last_accessed_at columns
-- 3. search_memory_stream RPC (7-param three-factor scoring)
-- 4. touch_memories RPC (update last_accessed_at on retrieval)
-- 5. get_recent_importance_sum RPC (for reflection trigger threshold)
-- 6. twin_summaries table (dynamic personality portrait cache)
--
-- All statements are idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- ============================================================================
-- 1. Enable pgvector extension
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- 2. Add missing columns to user_memories
--
-- The original migration (20260204_create_user_memories.sql) only had:
--   id, user_id, memory_type, content, response, metadata, created_at, updated_at
--
-- The memory stream service uses: embedding, importance_score, last_accessed_at
-- ============================================================================

ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS importance_score INTEGER DEFAULT 5
    CHECK (importance_score BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ DEFAULT NOW();

-- Index for pgvector similarity search (HNSW - best for ANN at query time)
-- ef_construction=128 and m=16 are good defaults balancing speed vs. recall
CREATE INDEX IF NOT EXISTS idx_user_memories_embedding
  ON user_memories USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- Index for recency-based queries (last_accessed_at)
CREATE INDEX IF NOT EXISTS idx_user_memories_last_accessed
  ON user_memories (last_accessed_at DESC);

-- ============================================================================
-- 3. search_memory_stream — Three-factor scoring RPC
--
-- Implements the Generative Agents (Park et al., UIST 2023) retrieval formula:
--   score = w_recency * norm(recency) + w_importance * norm(importance)
--         + w_relevance * norm(relevance)
--
-- where norm() is min-max normalization across all candidates.
--
-- Parameters:
--   p_user_id           - User's UUID
--   p_query_embedding   - Stringified 1536-dim vector "[0.1,0.2,...]"
--   p_limit             - Max results to return
--   p_decay_factor      - Recency decay per hour (e.g. 0.995)
--   p_weight_recency    - Weight for recency factor (0.0 - 1.0+)
--   p_weight_importance - Weight for importance factor
--   p_weight_relevance  - Weight for cosine relevance factor
-- ============================================================================
CREATE OR REPLACE FUNCTION search_memory_stream(
  p_user_id           UUID,
  p_query_embedding   TEXT,
  p_limit             INTEGER,
  p_decay_factor      DOUBLE PRECISION,
  p_weight_recency    DOUBLE PRECISION,
  p_weight_importance DOUBLE PRECISION,
  p_weight_relevance  DOUBLE PRECISION
)
RETURNS TABLE (
  id               UUID,
  content          TEXT,
  memory_type      VARCHAR(50),
  importance_score INTEGER,
  metadata         JSONB,
  created_at       TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  score            DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query_vec vector(1536);
BEGIN
  -- Parse the stringified vector from the JS client
  query_vec := p_query_embedding::vector(1536);

  RETURN QUERY
  WITH candidates AS (
    SELECT
      m.id,
      m.content,
      m.memory_type,
      m.importance_score,
      m.metadata,
      m.created_at,
      m.last_accessed_at,
      -- Recency: exponential decay based on hours since last access
      -- Accessing a memory resets last_accessed_at (via touch_memories)
      POWER(
        p_decay_factor,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(m.last_accessed_at, m.created_at))) / 3600.0
      ) AS raw_recency,
      -- Importance: already 1-10, normalize to [0,1]
      (COALESCE(m.importance_score, 5) - 1.0) / 9.0 AS raw_importance,
      -- Relevance: cosine similarity via pgvector (1 - cosine distance)
      CASE
        WHEN m.embedding IS NOT NULL
        THEN 1.0 - (m.embedding <=> query_vec)
        ELSE 0.0
      END AS raw_relevance
    FROM user_memories m
    WHERE m.user_id = p_user_id
      AND m.content IS NOT NULL
      AND LENGTH(m.content) > 0
  ),
  -- Compute min/max for normalization across the candidate set
  bounds AS (
    SELECT
      MIN(raw_recency)    AS min_rec,   MAX(raw_recency)    AS max_rec,
      MIN(raw_importance) AS min_imp,   MAX(raw_importance) AS max_imp,
      MIN(raw_relevance)  AS min_rel,   MAX(raw_relevance)  AS max_rel
    FROM candidates
  )
  SELECT
    c.id,
    c.content,
    c.memory_type,
    c.importance_score,
    c.metadata,
    c.created_at,
    c.last_accessed_at,
    -- Three-factor weighted sum with min-max normalization
    -- When all values are equal, normalize to 0.5 (tie-breaking neutral)
    (
      p_weight_recency * CASE
        WHEN b.max_rec > b.min_rec
          THEN (c.raw_recency - b.min_rec) / (b.max_rec - b.min_rec)
        ELSE 0.5
      END
      +
      p_weight_importance * CASE
        WHEN b.max_imp > b.min_imp
          THEN (c.raw_importance - b.min_imp) / (b.max_imp - b.min_imp)
        ELSE 0.5
      END
      +
      p_weight_relevance * CASE
        WHEN b.max_rel > b.min_rel
          THEN (c.raw_relevance - b.min_rel) / (b.max_rel - b.min_rel)
        ELSE 0.5
      END
    )::DOUBLE PRECISION AS score
  FROM candidates c, bounds b
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 4. touch_memories — Update last_accessed_at on retrieval
--
-- Called non-blocking after search_memory_stream returns results.
-- This is the "access refreshes recency" behaviour from the paper.
-- ============================================================================
CREATE OR REPLACE FUNCTION touch_memories(
  p_memory_ids UUID[]
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE user_memories
  SET last_accessed_at = NOW()
  WHERE id = ANY(p_memory_ids);
$$;

-- ============================================================================
-- 5. get_recent_importance_sum — Reflection trigger threshold check
--
-- Returns the sum of importance_score for memories created within the last
-- N hours. Used by reflectionEngine.js to decide when to run reflections.
-- Threshold is currently IMPORTANCE_THRESHOLD = 15 (~3 memories rated 5).
-- ============================================================================
CREATE OR REPLACE FUNCTION get_recent_importance_sum(
  p_user_id   UUID,
  p_hours_ago DOUBLE PRECISION DEFAULT 2.0
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(SUM(COALESCE(importance_score, 5)), 0)::DOUBLE PRECISION
  FROM user_memories
  WHERE user_id = p_user_id
    AND created_at >= NOW() - (p_hours_ago || ' hours')::INTERVAL;
$$;

-- ============================================================================
-- 6. twin_summaries — Dynamic personality portrait cache
--
-- Stores the most recent AI-generated personality summary for each user.
-- Regenerated every 4 hours by twinSummaryService.js.
-- One row per user (enforced by UNIQUE constraint, upserted on conflict).
--
-- Columns:
--   summary        - Full multi-domain personality paragraph (injected into chat)
--   core_traits    - Personality/emotional domain summary
--   current_focus  - Lifestyle/daily-rhythms domain summary
--   recent_feelings - Cultural identity domain summary (historical column name)
--   domains        - All 5 expert domains as JSONB { personality, lifestyle,
--                    culturalIdentity, socialDynamics, motivation }
--   generated_at   - When this summary was last regenerated (TTL = 4 hours)
-- ============================================================================
CREATE TABLE IF NOT EXISTS twin_summaries (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  summary         TEXT         NOT NULL,
  core_traits     TEXT,
  current_focus   TEXT,
  recent_feelings TEXT,
  domains         JSONB        DEFAULT '{}',
  generated_at    TIMESTAMPTZ  DEFAULT NOW(),
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (user_id)
);

-- Index for fast user lookup (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_twin_summaries_user_id
  ON twin_summaries (user_id);

-- Index for staleness checks (filter by generated_at)
CREATE INDEX IF NOT EXISTS idx_twin_summaries_generated_at
  ON twin_summaries (generated_at DESC);

-- Enable RLS
ALTER TABLE twin_summaries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent re-run safety)
DROP POLICY IF EXISTS "Users view own twin_summary"          ON twin_summaries;
DROP POLICY IF EXISTS "Service role full access twin_summaries" ON twin_summaries;

-- Users can view their own summary
CREATE POLICY "Users view own twin_summary"
  ON twin_summaries FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Service role has full access (backend writes summaries)
CREATE POLICY "Service role full access twin_summaries"
  ON twin_summaries FOR ALL
  TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE twin_summaries IS
  'Cache of AI-generated personality summaries (4h TTL). One row per user.';
COMMENT ON COLUMN twin_summaries.domains IS
  'JSONB with keys: personality, lifestyle, culturalIdentity, socialDynamics, motivation';
COMMENT ON COLUMN twin_summaries.generated_at IS
  'Timestamp of last regeneration. Summaries older than 4h are regenerated on next request.';
