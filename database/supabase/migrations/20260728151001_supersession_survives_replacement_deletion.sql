-- ============================================================================
-- Supersession survives deletion of the replacement row
-- ============================================================================
-- CAPTURED FROM LIVE DDL. Applied to production as 20260728151001, not by this
-- branch. Recorded here so the repo reproduces production. CREATE OR REPLACE,
-- so re-applying is a no-op.
--
-- The hazard: user_memories.superseded_by is `ON DELETE SET NULL`. When the
-- REPLACEMENT row is deleted, every row it retired has superseded_by reset to
-- NULL — and a filter on `superseded_by IS NULL` reads that as "live again".
-- The retired readings silently come back.
--
-- That is not hypothetical. The Tier 2b archival added in this same PR
-- archive-and-DELETEs superseded rows, and Tier 2 can delete a keeper once it
-- is old and low-importance. Deleting a keeper would resurrect the entire
-- generation it had retired.
--
-- Fix: `superseded_at` is the source of truth for "is this retired". It is a
-- plain timestamptz with no FK, so nothing nulls it. superseded_by remains as
-- provenance ("which row replaced this one"), and may legitimately become NULL
-- once the replacement is gone.
--
-- Also folds in the grant restoration applied as 20260728145421: a DROP+CREATE
-- of this function loses its grants, and only postgres + service_role should
-- ever hold EXECUTE (RPC is service-role only — see restrict_rpc_to_service_role).
-- CREATE OR REPLACE preserves grants, but a FRESH database needs them stated.
--
-- The HNSW note in the body is load-bearing: putting the supersession predicate
-- in the candidates WHERE clause took this query from ~2.5s to ~60s.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_memory_stream(
  p_user_id uuid,
  p_query_embedding text,
  p_limit integer DEFAULT 20,
  p_decay_factor double precision DEFAULT 0.995,
  p_weight_recency double precision DEFAULT 1.0,
  p_weight_importance double precision DEFAULT 1.0,
  p_weight_relevance double precision DEFAULT 1.0,
  p_memory_types text[] DEFAULT NULL::text[],
  p_include_superseded boolean DEFAULT false
)
RETURNS TABLE(
  id uuid, content text, memory_type character varying, importance_score integer,
  metadata jsonb, created_at timestamp with time zone,
  last_accessed_at timestamp with time zone, confidence double precision,
  decay_rate double precision, retrieval_count integer, embedding text,
  score double precision
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT
      m.id, m.content, m.memory_type, m.importance_score, m.metadata,
      m.created_at, m.last_accessed_at, m.confidence, m.decay_rate,
      m.superseded_at,
      COALESCE(m.retrieval_count, 0) AS retrieval_count,
      m.embedding::TEXT AS embedding,
      POWER(
        0.995,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(m.last_accessed_at, m.created_at))) / 3600.0
        / COALESCE(NULLIF(m.decay_rate, 0),
            CASE m.memory_type
              WHEN 'conversation' THEN 14 WHEN 'platform_data' THEN 7
              WHEN 'observation' THEN 7 WHEN 'fact' THEN 30
              WHEN 'reflection' THEN 90 ELSE 7 END)
      ) AS raw_recency,
      m.importance_score::DOUBLE PRECISION AS raw_importance,
      1 - (m.embedding <=> p_query_embedding::vector) AS raw_relevance
    FROM user_memories m
    WHERE m.user_id = p_user_id
      AND m.embedding IS NOT NULL
      AND (p_memory_types IS NULL OR m.memory_type = ANY(p_memory_types))
      -- NOTE: no supersession predicate here. It disables the HNSW index for
      -- this ordered scan (20260728b: ~2.5s -> ~60s). Filtered downstream.
    ORDER BY m.embedding <=> p_query_embedding::vector
    LIMIT p_limit * 5
  ),
  live AS (
    SELECT c.* FROM candidates c
    WHERE p_include_superseded OR c.superseded_at IS NULL
  ),
  normalized AS (
    SELECT c.*,
      CASE WHEN MAX(c.raw_recency) OVER () = MIN(c.raw_recency) OVER () THEN 0.5
           ELSE (c.raw_recency - MIN(c.raw_recency) OVER ()) / NULLIF(MAX(c.raw_recency) OVER () - MIN(c.raw_recency) OVER (), 0) END AS norm_recency,
      CASE WHEN MAX(c.raw_importance) OVER () = MIN(c.raw_importance) OVER () THEN 0.5
           ELSE (c.raw_importance - MIN(c.raw_importance) OVER ()) / NULLIF(MAX(c.raw_importance) OVER () - MIN(c.raw_importance) OVER (), 0) END AS norm_importance,
      CASE WHEN MAX(c.raw_relevance) OVER () = MIN(c.raw_relevance) OVER () THEN 0.5
           ELSE (c.raw_relevance - MIN(c.raw_relevance) OVER ()) / NULLIF(MAX(c.raw_relevance) OVER () - MIN(c.raw_relevance) OVER (), 0) END AS norm_relevance
    FROM live c
  )
  SELECT c.id, c.content, c.memory_type, c.importance_score, c.metadata,
         c.created_at, c.last_accessed_at, c.confidence, c.decay_rate,
         c.retrieval_count, c.embedding,
         (p_weight_recency * c.norm_recency + p_weight_importance * c.norm_importance
          + p_weight_relevance * c.norm_relevance) * COALESCE(c.confidence, 0.7) AS score
  FROM normalized c
  ORDER BY (p_weight_recency * c.norm_recency + p_weight_importance * c.norm_importance
            + p_weight_relevance * c.norm_relevance) * COALESCE(c.confidence, 0.7) DESC
  LIMIT p_limit;
END;
$function$;

-- Grants (folds in 20260728145421_restore_search_memory_stream_grants).
REVOKE ALL ON FUNCTION public.search_memory_stream(
  uuid, text, integer, double precision, double precision, double precision,
  double precision, text[], boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.search_memory_stream(
  uuid, text, integer, double precision, double precision, double precision,
  double precision, text[], boolean
) TO service_role;
