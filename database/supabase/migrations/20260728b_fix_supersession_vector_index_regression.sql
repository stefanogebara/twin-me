-- ============================================================================
-- Fix: supersession filter disabled the HNSW vector index
-- Date: 2026-07-28
--
-- 20260728_add_memory_supersession.sql put the supersession filter inside the
-- vector-search CTE, right next to `ORDER BY embedding <=> query LIMIT n`.
--
-- idx_user_memories_embedding is a plain (non-partial) HNSW index, so the extra
-- unindexed predicate stopped the planner using it for the ordered scan and it
-- fell back to scanning the corpus. Measured on the live table with the same
-- function and the same data, varying only the predicate:
--
--     p_include_superseded = true   (predicate constant-folds away)  ~2.5 s
--     p_include_superseded = false  (predicate active)              ~60   s
--
-- That is a 20x regression on every retrieval — i.e. on every twin chat turn,
-- and it is what made twin-eval time out after 2 of 25 queries.
--
-- The candidates CTE already over-fetches p_limit * 5, so the filter simply
-- moves downstream of the vector scan into a `live` CTE. The ordered scan stays
-- index-backed; superseded rows are dropped before ranking, so results are
-- unchanged. Verified after the fix: both-live returns both, retired returns
-- only the replacement, p_include_superseded returns both.
--
-- Trade-off: if a very large share of a user's nearest matches were superseded,
-- fewer than p_limit rows could survive the filter. With 5x over-fetch and
-- supersession being rare by construction, that is not a practical concern. The
-- alternative — a partial HNSW index WHERE superseded_by IS NULL — costs a full
-- index build and is only worth it if that assumption stops holding.
--
-- Lesson for future filters: do not add predicates to the CTE that performs the
-- vector ORDER BY. Filter downstream, or build a matching partial index.
-- ============================================================================

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
      m.superseded_by,
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
      -- NOTE: the supersession filter deliberately does NOT belong here.
      -- See the header — it disables the HNSW index for this ordered scan.
    ORDER BY m.embedding <=> p_query_embedding::vector
    LIMIT p_limit * 5
  ),
  live AS (
    SELECT c.* FROM candidates c
    WHERE p_include_superseded OR c.superseded_by IS NULL
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
    FROM live c
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
