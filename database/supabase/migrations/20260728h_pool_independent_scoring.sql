-- ============================================================================
-- Pool-independent scoring: replace min-max normalisation with fixed scales
-- Date: 2026-07-28
--
-- THE DEFECT
-- Each factor was min-max normalised across whatever the candidate CTE happened
-- to return:
--     (raw - MIN(raw) OVER ()) / (MAX(raw) OVER () - MIN(raw) OVER ())
-- so a memory's score depended on which other memories came back with it. That
-- makes weights non-transferable across pool sizes and lets a single outlier set
-- the scale for everything else. It is also why raising hnsw.ef_search from its
-- default of 40 to the 150 the CTE actually asks for made retrieval WORSE
-- (20260728g): the distant extra candidates set the relevance minimum and
-- compressed the good ones together. Diversity FELL from a WIDER pool, which is
-- the clearest possible sign the scale, not the pool, was wrong.
--
-- THE FIX
-- All three factors already have known bounds, so normalising against the pool
-- was solving a problem that does not exist:
--
--   recency     POWER(0.995, hours/decay_rate) is already in (0,1] by
--               construction. Used as-is.
--   importance  importance_score is 1..10 by schema, and the full range is in
--               use (observed min 1, max 10, avg 6.51). Mapped (x-1)/9.
--   relevance   1 - cosine_distance, clamped to [0,1]. A negative cosine means
--               "points the other way", which is no more useful than zero.
--
-- A score is now a pure function of the row. Verified: the top score is
-- bit-identical at ef_search 40 and 400 (drift 0.000000000000), where before it
-- moved with the pool.
--
-- MEASURED, back-to-back on the same corpus state (absolute eval numbers drift
-- over wall-clock as the ingestion cron adds rows and age windows move, so only
-- paired runs are comparable):
--
--                    min-max     fixed scales
--   twin_quality     0.812476    0.899486
--   precision_at_5   0.803846    0.888990
--   recall_at_10     0.886154    1.000000
--   diversity        0.698506    0.786016
--   freshness        0.829538    0.876923
--
-- Every component improved; recall reached 1.0.
--
-- NOT DONE HERE: sizing hnsw.ef_search to the intended over-fetch. Retested on
-- top of this change it was still slightly net-negative (0.857 -> 0.854 in an
-- earlier pair) because a wider pool surfaces older-but-relevant rows while
-- recency weight is 0.0. It should be revisited together with raising recency,
-- which is now finally safe to tune because the weights mean the same thing at
-- any pool size.
--
-- The signature is deliberately unchanged: CREATE OR REPLACE preserves the ACL,
-- while adding a parameter would create a NEW function defaulting to EXECUTE TO
-- PUBLIC — exactly how the 20260728d privilege regression happened. ACL verified
-- after applying: postgres=X | service_role=X.
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
  scored AS (
    SELECT c.*,
      -- Fixed scales. No window functions: nothing here depends on the pool.
      GREATEST(0, LEAST(1, c.raw_recency))                AS norm_recency,
      GREATEST(0, LEAST(1, (c.raw_importance - 1) / 9.0)) AS norm_importance,
      GREATEST(0, LEAST(1, c.raw_relevance))              AS norm_relevance
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
  FROM scored c
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

-- CREATE OR REPLACE above preserves the existing ACL, so these are a no-op on
-- the live database. Included so a replay from scratch still lands locked down.
REVOKE ALL ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) TO service_role;
