-- ============================================================================
-- Move confidence weighting INTO SQL scoring
-- Date: 2026-03-05
--
-- Previously confidence was applied post-RPC in JS (m.score *= m.confidence).
-- This meant low-confidence memories could take top-N slots before being
-- downweighted, wasting retrieval budget. Now the RPC score is:
--   score = (w_rec * norm(rec) + w_imp * norm(imp) + w_rel * norm(rel))
--           * COALESCE(confidence, 0.7)
-- ============================================================================

DROP FUNCTION IF EXISTS search_memory_stream(UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);

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
  confidence       FLOAT,
  decay_rate       DOUBLE PRECISION,
  retrieval_count  INTEGER,
  score            DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  query_vec vector(1536);
BEGIN
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
      m.confidence,
      m.decay_rate,
      COALESCE(m.retrieval_count, 0) AS retrieval_count,
      POWER(
        0.995,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(m.last_accessed_at, m.created_at))) / 3600.0
        / COALESCE(
            NULLIF(m.decay_rate, 0),
            CASE m.memory_type
              WHEN 'conversation'   THEN 3
              WHEN 'platform_data'  THEN 7
              WHEN 'observation'    THEN 7
              WHEN 'fact'           THEN 30
              WHEN 'reflection'     THEN 90
              ELSE 7
            END
          )
      ) AS raw_recency,
      (COALESCE(m.importance_score, 5) - 1.0) / 9.0 AS raw_importance,
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
    c.confidence,
    c.decay_rate,
    c.retrieval_count,
    -- Multiply by confidence so low-confidence memories rank lower in SQL
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
    )::DOUBLE PRECISION * COALESCE(c.confidence, 0.7) AS score
  FROM candidates c, bounds b
  ORDER BY score DESC
  LIMIT p_limit;
END;
$$;
