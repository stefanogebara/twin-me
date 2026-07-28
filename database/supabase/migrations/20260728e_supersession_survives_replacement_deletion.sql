-- ============================================================================
-- Retirement must survive deletion of the replacement
-- Date: 2026-07-28
--
-- superseded_by is REFERENCES user_memories(id) ON DELETE SET NULL, and the
-- forgetting cron hard-deletes rows after archiving (Tier 1/2/6). Tier 6 deletes
-- reflections -- exactly the type GUM supersession applies to. So:
--
--   R1 is contradicted and retired, superseded_by = R2.
--   90 days later Tier 6 archives and deletes R2.
--   The FK fires: R1.superseded_by = NULL.
--   R1 is live again, superseded_at still set (an inconsistent state), and it
--   re-enters retrieval with no replacement and no log line.
--
-- Newly reachable because the same branch widened Tier 6 from retrieval_count=0
-- to <3. The fix is semantic rather than structural: the FACT of retirement is
-- superseded_at, a plain timestamp no foreign key can clear. superseded_by is
-- provenance, and it is fine for that pointer to go NULL once the replacement is
-- itself archived -- a memory does not become current again because its
-- successor was later tidied away.
--
-- Every liveness test therefore moves from superseded_by IS NULL to
-- superseded_at IS NULL: this function, touch_memories, the partial index, and
-- the seven call sites in api/.
-- ============================================================================

UPDATE user_memories
SET superseded_at = COALESCE(superseded_at, NOW())
WHERE superseded_by IS NOT NULL AND superseded_at IS NULL;

DROP INDEX IF EXISTS idx_user_memories_live;
CREATE INDEX IF NOT EXISTS idx_user_memories_live
  ON user_memories (user_id, memory_type, created_at DESC)
  WHERE superseded_at IS NULL;

COMMENT ON COLUMN user_memories.superseded_at IS
  'When this memory was retired. NULL = currently valid. Authoritative liveness test -- superseded_by may be nulled by the FK if the replacement is later archived.';
COMMENT ON COLUMN user_memories.superseded_by IS
  'Provenance: the memory that replaced this one. May become NULL if that replacement is later archived; use superseded_at to test liveness.';

CREATE OR REPLACE FUNCTION touch_memories(p_memory_ids UUID[])
RETURNS VOID LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE user_memories
  SET last_accessed_at = NOW(), retrieval_count = COALESCE(retrieval_count, 0) + 1
  WHERE id = ANY(p_memory_ids) AND superseded_at IS NULL;
$$;

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
      m.superseded_at,
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
    WHERE p_include_superseded OR c.superseded_at IS NULL
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

-- DROP FUNCTION is not used above, so the ACL from 20260728d survives. Re-issued
-- anyway so this migration is safe to replay standalone.
REVOKE ALL ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) TO service_role;
