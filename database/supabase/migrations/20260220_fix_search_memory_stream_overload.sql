-- ============================================================================
-- FIX: Drop 4-param overloaded search_memory_stream
--
-- There are two versions of search_memory_stream:
--   1. 4-param: (p_user_id, p_query_embedding, p_limit, p_decay_factor)
--   2. 7-param: (p_user_id, p_query_embedding, p_limit, p_decay_factor,
--                p_weight_recency, p_weight_importance, p_weight_relevance)
--
-- PostgREST cannot disambiguate between them when called with a subset
-- of parameters, causing PGRST203 errors. The code always sends 7 params,
-- so the 4-param version is unused and should be dropped.
-- ============================================================================

-- Drop the 4-param version (keep only the 7-param version)
DROP FUNCTION IF EXISTS search_memory_stream(UUID, vector, INTEGER, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS search_memory_stream(UUID, TEXT, INTEGER, DOUBLE PRECISION);
