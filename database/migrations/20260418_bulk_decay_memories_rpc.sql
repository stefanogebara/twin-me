-- bulk_decay_memories RPC — canonical definition
-- ================================================
-- Called by api/services/memoryStreamService.js::decaySourceMemories to
-- decay importance of source memories that produced a reflection, so they
-- stop competing in retrieval with the higher-level reflections derived
-- from them.
--
-- Why this migration exists:
-- Two ad-hoc overloads were previously created in prod (one with
-- double precision, one with numeric) outside of the migrations folder.
-- PostgREST can't disambiguate them, so every call from the JS client
-- fails with "Could not choose the best candidate function between ...".
-- decaySourceMemories catches the error and logs a warning, so reflection
-- generation silently never decays its sources. This migration drops both
-- ghost overloads and installs the single canonical signature.
--
-- Semantics:
--   - Only decays memories belonging to p_user_id (defense-in-depth; the
--     caller already filters, but SQL-side filter prevents cross-user leak
--     if p_memory_ids ever contained a foreign id).
--   - Skips memories with importance_score >= 8 (high-value) or
--     retrieval_count >= 3 (proven useful). These are "consolidated" and
--     should not decay.
--   - New importance = GREATEST(1, FLOOR(old * p_decay_factor)).
--     Floor of 1 prevents zeroing out a memory entirely.
--   - Returns the set of rows that were actually updated.
--
-- Idempotent: safe to re-run. DROPs are qualified with IF EXISTS.

-- 1. Remove ambiguous overloads.
DROP FUNCTION IF EXISTS public.bulk_decay_memories(uuid, uuid[], double precision);
DROP FUNCTION IF EXISTS public.bulk_decay_memories(uuid, uuid[], numeric);
DROP FUNCTION IF EXISTS public.bulk_decay_memories(uuid, uuid[], real);

-- 2. Install the canonical signature. numeric is the right type for a
--    decay factor in (0, 1] — the JS client sends 0.8 which PostgREST
--    encodes as numeric-compatible.
CREATE OR REPLACE FUNCTION public.bulk_decay_memories(
  p_user_id uuid,
  p_memory_ids uuid[],
  p_decay_factor numeric
)
RETURNS TABLE (id uuid, new_importance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Defensive: early return on empty batch
  IF p_memory_ids IS NULL OR array_length(p_memory_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Defensive: reject out-of-range decay factors so a bad caller can't
  -- accidentally zero out or inflate importance scores.
  IF p_decay_factor IS NULL OR p_decay_factor <= 0 OR p_decay_factor > 1 THEN
    RAISE EXCEPTION 'p_decay_factor must be in (0, 1], got: %', p_decay_factor;
  END IF;

  RETURN QUERY
  UPDATE public.user_memories AS m
  SET importance_score = GREATEST(1, FLOOR(m.importance_score * p_decay_factor))::integer
  WHERE m.user_id = p_user_id
    AND m.id = ANY(p_memory_ids)
    AND m.importance_score < 8
    AND COALESCE(m.retrieval_count, 0) < 3
  RETURNING m.id, m.importance_score;
END;
$$;

-- 3. Grant execute to the roles PostgREST uses. authenticated is the
--    typical role; service_role bypasses RLS but still needs EXECUTE.
GRANT EXECUTE ON FUNCTION public.bulk_decay_memories(uuid, uuid[], numeric)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_decay_memories(uuid, uuid[], numeric) IS
  'Decays importance_score of source memories after a reflection consolidates them. Skips memories with importance >= 8 or retrieval_count >= 3. Returns rows actually updated.';
