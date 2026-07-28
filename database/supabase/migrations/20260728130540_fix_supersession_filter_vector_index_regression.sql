-- ============================================================================
-- search_memory_stream: filter superseded rows without losing the vector index
-- ============================================================================
-- CAPTURED FROM LIVE DDL to close repo/production drift (see
-- 20260728110058_add_memory_supersession.sql). CREATE OR REPLACE, so applying
-- this is a no-op against the live project.
--
-- ⚠️ SUPERSEDED by 20260728151001_supersession_survives_replacement_deletion.sql.
-- This version filters on `superseded_by IS NULL`, which is unsafe: that column
-- is `ON DELETE SET NULL`, so deleting a replacement row resurrects everything
-- it retired. The later migration switches the predicate to `superseded_at`.
-- Kept here because it is the state that was actually applied at 13:05 and
-- because its HNSW finding is the reason the filter sits after the LIMIT.
--
-- The subtlety worth preserving: `AND m.superseded_by IS NULL` cannot go in the
-- candidates WHERE clause. Doing so makes the planner abandon the HNSW index
-- for the `embedding <=> query` ordering and fall back to a full scan. The
-- filter is therefore applied in a `live` CTE, AFTER the candidate LIMIT.
--
-- KNOWN LIMITATION (carried forward deliberately, see PR discussion):
-- because the filter runs after `LIMIT p_limit * 5`, superseded rows still
-- consume candidate slots. While nothing wrote supersession this was purely
-- theoretical. It is no longer: once retired readings accumulate between weekly
-- archival runs, an email-shaped query on a heavy Gmail user can have most of
-- its 100 candidate slots taken by retired unread-count rows and return far
-- fewer than p_limit live results.
--
-- The proper fix is a PARTIAL vector index (`... USING hnsw (embedding ...)
-- WHERE superseded_by IS NULL`), which lets the filter move back into WHERE
-- while keeping index-assisted ordering. That is a heavier change on a 27k-row
-- table and touches an area under active concurrent development, so it is
-- deliberately left as the top follow-up rather than bundled here.
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
      -- See the migration header: it disables the HNSW index for this scan.
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
