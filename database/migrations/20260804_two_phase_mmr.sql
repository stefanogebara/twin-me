-- Two-phase MMR: keep embeddings in the database (issue #233).
--
-- PROBLEM. search_memory_stream projects `m.embedding::TEXT` for every
-- candidate solely so the JS mmrRerank() can compute pairwise cosine
-- similarity. Measured 2026-08-04: 19,225 bytes of embedding text per row
-- against 140 bytes of actual content — 137x. A single 39-row page was
-- 770,610 bytes / 662ms on the wire. The reflections and semantic_conv legs
-- blew their 5s budget on transfer alone and returned EMPTY, which is why
-- life-story memories never reached the twin.
--
-- Server-side query time was never the issue: 11.7ms unfiltered.
--
-- SHAPE. MMR cannot simply move into SQL wholesale, because BM25_BLEND_WEIGHT,
-- TCM_WEIGHT and STDP_CORETRIEVAL_BOOST adjust `score` in JS after retrieval
-- and before MMR consumes it as its relevance term. Those weights were tuned
-- over 16+ eval sessions, so bypassing them would silently change ranking.
-- Hence two phases:
--
--   1. search_memory_stream_light  — candidates WITHOUT embeddings
--   2. (JS applies BM25 / TCM / STDP exactly as today)
--   3. mmr_select(ids, adjusted_scores, ...) — greedy MMR over embeddings
--      that never left the table
--
-- MEASURED EFFECT (same query, same user):
--
--   payload      770,610 B / 662ms  ->  19,879 B / 254ms   (39x smaller)
--   reflections  timeout @5177ms, 0 results -> 1993ms, 12 results
--   semantic_conv timeout @5176ms, 0 results -> 3241ms,  6 results
--   overall      5184ms, 15 results, 0 life_story
--             -> 3246ms, 31 results, 1 life_story
--
-- EQUIVALENCE. mmr_select is a faithful port of mmrRerank(): same formula,
-- same greedy loop, same tie-break (JS uses `>`, so the earliest candidate
-- wins — reproduced with `ORDER BY ... DESC, ord ASC`). Verified identical
-- selection across four shapes; see the PR and
-- tests/api/services/twoPhaseMmr.integration.test.js.
--
--   MMR(d) = λ·rel − (1−λ)·max_sim − type_penalty − semantic_penalty + temporal_bonus
--
-- Parameter DEFAULTS on the light function are load-bearing: PostgREST
-- resolves overloads by the exact set of named arguments supplied, and callers
-- omit the trailing ones. Without matching defaults those call shapes fail
-- with PGRST202 — observed live on the reflections and fact-pool legs.

DROP FUNCTION IF EXISTS search_memory_stream_light(
  uuid, text, int, double precision, double precision, double precision,
  double precision, text[], boolean
);

CREATE OR REPLACE FUNCTION search_memory_stream_light(
  p_user_id            UUID,
  p_query_embedding    TEXT,
  p_limit              INT,
  p_decay_factor       DOUBLE PRECISION DEFAULT 0.995,
  p_weight_recency     DOUBLE PRECISION DEFAULT 1.0,
  p_weight_importance  DOUBLE PRECISION DEFAULT 1.0,
  p_weight_relevance   DOUBLE PRECISION DEFAULT 1.0,
  p_memory_types       TEXT[] DEFAULT NULL,
  p_include_superseded BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id               UUID,
  content          TEXT,
  memory_type      VARCHAR,
  importance_score INT,
  metadata         JSONB,
  created_at       TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  confidence       DOUBLE PRECISION,
  decay_rate       DOUBLE PRECISION,
  retrieval_count  INT,
  score            DOUBLE PRECISION
)
LANGUAGE plpgsql
AS $fn$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT m.id, m.content, m.memory_type, m.importance_score, m.metadata,
      m.created_at, m.last_accessed_at, m.confidence, m.decay_rate, m.superseded_at,
      COALESCE(m.retrieval_count, 0) AS retrieval_count,
      POWER(0.995,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(m.last_accessed_at, m.created_at))) / 3600.0
        / COALESCE(NULLIF(m.decay_rate, 0),
            CASE m.memory_type WHEN 'conversation' THEN 14 WHEN 'platform_data' THEN 7
              WHEN 'observation' THEN 7 WHEN 'fact' THEN 30
              WHEN 'reflection' THEN 90 ELSE 7 END)) AS raw_recency,
      m.importance_score::DOUBLE PRECISION AS raw_importance,
      1 - (m.embedding <=> p_query_embedding::vector) AS raw_relevance
    FROM user_memories m
    WHERE m.user_id = p_user_id AND m.embedding IS NOT NULL
      AND (p_memory_types IS NULL OR m.memory_type = ANY(p_memory_types))
    ORDER BY m.embedding <=> p_query_embedding::vector
    LIMIT p_limit * 5
  ),
  live AS (SELECT c.* FROM candidates c WHERE p_include_superseded OR c.superseded_at IS NULL),
  scored AS (
    SELECT c.*,
      GREATEST(0, LEAST(1, c.raw_recency))                AS norm_recency,
      GREATEST(0, LEAST(1, (c.raw_importance - 1) / 9.0)) AS norm_importance,
      GREATEST(0, LEAST(1, c.raw_relevance))              AS norm_relevance
    FROM live c
  )
  SELECT c.id, c.content, c.memory_type, c.importance_score, c.metadata,
         c.created_at, c.last_accessed_at, c.confidence, c.decay_rate,
         c.retrieval_count,
         (p_weight_recency * c.norm_recency + p_weight_importance * c.norm_importance
          + p_weight_relevance * c.norm_relevance) * COALESCE(c.confidence, 0.7) AS score
  FROM scored c
  ORDER BY (p_weight_recency * c.norm_recency + p_weight_importance * c.norm_importance
            + p_weight_relevance * c.norm_relevance) * COALESCE(c.confidence, 0.7) DESC
  LIMIT p_limit;
END;
$fn$;

COMMENT ON FUNCTION search_memory_stream_light IS
  'search_memory_stream without the embedding column, with matching parameter defaults so PostgREST resolves the same call shapes. Phase 1 of two-phase MMR (#233) — pairs with mmr_select.';


CREATE OR REPLACE FUNCTION mmr_select(
  p_ids          UUID[],
  p_scores       DOUBLE PRECISION[],
  p_final_limit  INT,
  p_lambda       DOUBLE PRECISION,
  p_tdw          DOUBLE PRECISION,
  p_sdw          DOUBLE PRECISION,
  p_temporal     DOUBLE PRECISION
)
RETURNS TABLE (id UUID, ord INT)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_selected UUID[] := '{}';
  v_best     UUID;
  v_n        INT;
BEGIN
  CREATE TEMP TABLE _mmr_in ON COMMIT DROP AS
  SELECT t.ord::INT AS ord, t.mid AS id, t.sc AS score,
         m.embedding, m.memory_type, m.created_at
  FROM unnest(p_ids, p_scores) WITH ORDINALITY AS t(mid, sc, ord)
  JOIN user_memories m ON m.id = t.mid;

  SELECT COUNT(*) INTO v_n FROM _mmr_in;

  IF v_n <= p_final_limit THEN
    RETURN QUERY SELECT c.id, c.ord FROM _mmr_in c ORDER BY c.ord;
    RETURN;
  END IF;

  FOR i IN 1..p_final_limit LOOP
    SELECT c.id INTO v_best
    FROM _mmr_in c
    WHERE NOT (c.id = ANY(v_selected))
    ORDER BY
      (
        p_lambda * c.score
        - (1 - p_lambda) * COALESCE((
            SELECT MAX(1 - (c.embedding <=> s.embedding))
            FROM _mmr_in s WHERE s.id = ANY(v_selected)), 0)
        - CASE WHEN CARDINALITY(v_selected) > 0 AND p_tdw > 0 THEN
            p_tdw * ((SELECT COUNT(*) FROM _mmr_in s
                       WHERE s.id = ANY(v_selected) AND s.memory_type = c.memory_type)::DOUBLE PRECISION
                     / CARDINALITY(v_selected))
          ELSE 0 END
        - CASE WHEN CARDINALITY(v_selected) > 0 AND p_sdw > 0 THEN
            COALESCE((SELECT p_sdw * AVG(1 - (c.embedding <=> s.embedding))
                      FROM _mmr_in s
                      WHERE s.id = ANY(v_selected) AND s.memory_type = c.memory_type), 0)
          ELSE 0 END
        + CASE WHEN CARDINALITY(v_selected) > 0 AND p_temporal > 0 THEN
            p_temporal * GREATEST(0, 0.5 - (
              (SELECT COUNT(*) FROM _mmr_in s
                 WHERE s.id = ANY(v_selected)
                   AND (CASE WHEN NOW() - s.created_at < INTERVAL '7 days' THEN 'recent'
                             WHEN NOW() - s.created_at < INTERVAL '30 days' THEN 'medium'
                             ELSE 'archive' END)
                     = (CASE WHEN NOW() - c.created_at < INTERVAL '7 days' THEN 'recent'
                             WHEN NOW() - c.created_at < INTERVAL '30 days' THEN 'medium'
                             ELSE 'archive' END)
              )::DOUBLE PRECISION / CARDINALITY(v_selected)))
          ELSE 0 END
      ) DESC,
      c.ord ASC
    LIMIT 1;

    EXIT WHEN v_best IS NULL;
    v_selected := v_selected || v_best;
  END LOOP;

  RETURN QUERY
    SELECT c.id, c.ord FROM _mmr_in c
    WHERE c.id = ANY(v_selected)
    ORDER BY ARRAY_POSITION(v_selected, c.id);
END;
$fn$;

COMMENT ON FUNCTION mmr_select IS
  'Greedy MMR over embeddings held in the database, driven by caller-supplied (already BM25/TCM/STDP-adjusted) scores. Phase 2 of two-phase MMR (#233) — pairs with search_memory_stream_light.';
