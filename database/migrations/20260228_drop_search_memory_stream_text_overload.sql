-- Drop the ambiguous text overload of search_memory_stream.
--
-- PostgreSQL cannot resolve the overload when passed a '[0.1,...]' string because
-- both the text and vector variants are valid candidates. Since pgvector registers
-- an implicit text→vector cast, the single vector overload handles all callers.
DROP FUNCTION IF EXISTS public.search_memory_stream(
  p_user_id uuid,
  p_query_embedding text,
  p_limit integer,
  p_decay_factor double precision,
  p_weight_recency double precision,
  p_weight_importance double precision,
  p_weight_relevance double precision
);
