-- ============================================================================
-- Memory supersession
-- Date: 2026-07-28
--
-- The twin kept asserting stale readings as current because nothing could ever
-- retire a fact. There was no supersede/invalidate concept anywhere: a newer
-- observation could contradict an older one and both stayed equally live and
-- equally retrievable.
--
-- This adds append-only invalidation, following the bi-temporal model used by
-- temporal knowledge graphs (Zep/Graphiti, arXiv 2501.13956): a superseded row
-- is never deleted, its validity is simply closed. Current state is
-- "superseded_by IS NULL"; history remains queryable for "how have I changed".
--
-- Three parts:
--   1. superseded_by / superseded_at columns + a partial index sized for the
--      common case (retrieval only ever wants live rows).
--   2. search_memory_stream skips superseded rows, with an opt-in flag so the
--      history is still reachable deliberately.
--   3. touch_memories stops refreshing superseded rows. Retrieval-refresh was
--      one of three paths that kept a retired fact permanently warm.
--
-- Plan: .claude/plans/2026-07-27-optmem-brain/README.md (Phase 1)
-- ============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────

ALTER TABLE user_memories
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES user_memories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

COMMENT ON COLUMN user_memories.superseded_by IS
  'The memory that replaced this one. NULL = currently valid. Superseded rows are retained for history and excluded from retrieval by default.';
COMMENT ON COLUMN user_memories.superseded_at IS
  'When this memory was superseded. NULL while valid.';

-- Partial index: retrieval filters to live rows on every query, and the live
-- set is the overwhelming majority, so index only those.
CREATE INDEX IF NOT EXISTS idx_user_memories_live
  ON user_memories (user_id, memory_type, created_at DESC)
  WHERE superseded_by IS NULL;

-- Reverse lookup: "what did this memory replace?"
CREATE INDEX IF NOT EXISTS idx_user_memories_superseded_by
  ON user_memories (superseded_by)
  WHERE superseded_by IS NOT NULL;

-- ── 2. search_memory_stream: exclude superseded by default ──────────────────
-- Drops the 8-arg signature from 20260408 before creating the 9-arg version,
-- so the two do not sit side by side as ambiguous overloads.

DROP FUNCTION IF EXISTS search_memory_stream(UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT[]);

CREATE OR REPLACE FUNCTION search_memory_stream(
  p_user_id UUID,
  p_query_embedding TEXT,
  p_limit INTEGER DEFAULT 20,
  p_decay_factor DOUBLE PRECISION DEFAULT 0.995,
  p_weight_recency DOUBLE PRECISION DEFAULT 1.0,
  p_weight_importance DOUBLE PRECISION DEFAULT 1.0,
  p_weight_relevance DOUBLE PRECISION DEFAULT 1.0,
  p_memory_types TEXT[] DEFAULT NULL,
  p_include_superseded BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type VARCHAR(50),
  importance_score INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  confidence       DOUBLE PRECISION,
  decay_rate       DOUBLE PRECISION,
  retrieval_count  INTEGER,
  embedding        TEXT,
  score            DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $$
BEGIN
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
      m.confidence,
      m.decay_rate,
      COALESCE(m.retrieval_count, 0) AS retrieval_count,
      m.embedding::TEXT AS embedding,
      POWER(
        0.995,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(m.last_accessed_at, m.created_at))) / 3600.0
        / COALESCE(
            NULLIF(m.decay_rate, 0),
            CASE m.memory_type
              WHEN 'conversation'   THEN 14
              WHEN 'platform_data'  THEN 7
              WHEN 'observation'    THEN 7
              WHEN 'fact'           THEN 30
              WHEN 'reflection'     THEN 90
              ELSE 7
            END
          )
      ) AS raw_recency,
      m.importance_score::DOUBLE PRECISION AS raw_importance,
      1 - (m.embedding <=> p_query_embedding::vector) AS raw_relevance
    FROM user_memories m
    WHERE m.user_id = p_user_id
      AND m.embedding IS NOT NULL
      AND (p_memory_types IS NULL OR m.memory_type = ANY(p_memory_types))
      AND (p_include_superseded OR m.superseded_by IS NULL)
    ORDER BY m.embedding <=> p_query_embedding::vector
    LIMIT p_limit * 5
  ),
  normalized AS (
    SELECT
      c.*,
      CASE WHEN MAX(c.raw_recency) OVER () = MIN(c.raw_recency) OVER () THEN 0.5
           ELSE (c.raw_recency - MIN(c.raw_recency) OVER ()) / NULLIF(MAX(c.raw_recency) OVER () - MIN(c.raw_recency) OVER (), 0)
      END AS norm_recency,
      CASE WHEN MAX(c.raw_importance) OVER () = MIN(c.raw_importance) OVER () THEN 0.5
           ELSE (c.raw_importance - MIN(c.raw_importance) OVER ()) / NULLIF(MAX(c.raw_importance) OVER () - MIN(c.raw_importance) OVER (), 0)
      END AS norm_importance,
      CASE WHEN MAX(c.raw_relevance) OVER () = MIN(c.raw_relevance) OVER () THEN 0.5
           ELSE (c.raw_relevance - MIN(c.raw_relevance) OVER ()) / NULLIF(MAX(c.raw_relevance) OVER () - MIN(c.raw_relevance) OVER (), 0)
      END AS norm_relevance
    FROM candidates c
  )
  SELECT
    c.id,
    c.content,
    c.memory_type,
    c.importance_score,
    c.metadata,
    c.created_at,
    c.last_accessed_at,
    c.confidence,
    c.decay_rate,
    c.retrieval_count,
    c.embedding,
    (
      p_weight_recency * c.norm_recency +
      p_weight_importance * c.norm_importance +
      p_weight_relevance * c.norm_relevance
    ) * COALESCE(c.confidence, 0.7) AS score
  FROM normalized c
  ORDER BY (
    p_weight_recency * c.norm_recency +
    p_weight_importance * c.norm_importance +
    p_weight_relevance * c.norm_relevance
  ) * COALESCE(c.confidence, 0.7) DESC
  LIMIT p_limit;
END;
$$;

-- ── 3. touch_memories: never refresh a superseded row ───────────────────────
-- Retrieval-refresh is what made a wrong-but-salient memory self-sustaining:
-- being retrieved reset its recency AND incremented retrieval_count, which the
-- forgetting cron treats as a protection signal. A retired fact must be allowed
-- to go cold.

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
  WHERE id = ANY(p_memory_ids)
    AND superseded_by IS NULL;
$$;
