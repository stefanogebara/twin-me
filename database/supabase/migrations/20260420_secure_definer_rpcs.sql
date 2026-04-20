-- ============================================================================
-- Security Fix: Lock down SECURITY DEFINER RPCs to service_role only
-- Date: 2026-04-20
-- Ticket: Security audit — CRITICAL privilege escalation vector
--
-- PROBLEM
-- -------
-- Eight RPCs were created with SECURITY DEFINER (or with no explicit REVOKE),
-- which means PostgreSQL's default grants gave the `authenticated` and `anon`
-- roles EXECUTE permission on them. Because these functions run as the function
-- owner (postgres / superuser), they bypass RLS entirely. Any authenticated
-- user could call them with an arbitrary p_user_id and read or mutate another
-- user's memories, importance scores, and retrieval counts.
--
-- WHY "REVOKE + GRANT service_role" IS THE RIGHT FIX HERE
-- --------------------------------------------------------
-- The app uses public.users.id as its user identifier. This UUID is COMPLETELY
-- DIFFERENT from auth.users.id (no FK relationship, no mapping column). There
-- is therefore no safe way to write a per-row ownership check of the form
-- "p_user_id matches the caller's auth.uid()" without a cross-table join that
-- does not exist.
--
-- All six functions are called exclusively by the backend via supabaseAdmin
-- (the service_role client). No frontend code calls .rpc() on any of them —
-- confirmed by grepping the entire src/ tree and finding zero matches.
--
-- The simplest, safest, and most correct fix is therefore:
--   REVOKE EXECUTE ... FROM authenticated, anon, public
--   GRANT  EXECUTE ... TO service_role
--
-- This means only the backend service_role key can invoke these RPCs. Any
-- attempt to call them from the Supabase JS client using the anon/user JWT
-- will receive a "permission denied for function" error.
--
-- FUNCTIONS FIXED
-- ---------------
-- 1. search_memory_stream(8-param) — primary memory retrieval RPC
--    File: 20260408_search_memory_stream_type_filter.sql
--    Risk: any user could read all memories of any other user
--
-- 2. touch_memories(UUID[]) — updates last_accessed_at + retrieval_count
--    File: 20260304_fix_touch_memories_retrieval_count.sql
--    Risk: any user could inflate retrieval scores for any memory
--
-- 3. increment_retrieval_counts(UUID[]) — batch retrieval count increment
--    File: 20260304_increment_retrieval_counts_rpc.sql
--    Risk: same as touch_memories
--
-- 4. apply_importance_shift(float, int, uuid) — homeostatic score rebalancing
--    File: 20260304_homeostatic_per_user.sql
--    Risk: when p_user_id IS NULL, mutates ALL users' memories globally.
--    Also fixes: REQUIRE p_user_id by dropping the NULL shortcut.
--
-- 5. get_importance_stats(uuid) — reads mean importance + count
--    File: 20260304_homeostatic_per_user.sql
--    Risk: any user could read memory statistics for any other user
--
-- 6. get_type_stats(uuid, text) — per-type count + avg importance
--    File: database/migrations/20260305_get_type_stats.sql (note: no SECURITY
--    DEFINER, but default PostgreSQL grants EXECUTE to PUBLIC on new functions,
--    so it is still callable by authenticated users and bypasses no RLS;
--    locked here for defence-in-depth since it reads user_memories)
--    Risk: authenticated user can count another user's memories by type
--
-- 7. update_memory_confidence(uuid, float) — updates confidence + revision_count
--    File: 20260305_revision_count.sql
--    Risk: any user could alter the confidence score of any memory by ID
--
-- 8. get_recent_importance_sum(uuid, float) — reflection trigger threshold check
--    File: 20260222_add_memory_stream_vector_search.sql
--    Risk: read access to another user's importance data
--
-- NOTE ON 7-PARAM OVERLOAD
-- ------------------------
-- The original 7-param search_memory_stream was dropped by migrations
-- 20260304_fix_search_memory_stream_gum.sql and again by
-- 20260305_search_memory_stream_confidence.sql. As of
-- 20260408_search_memory_stream_type_filter.sql only the 8-param overload
-- exists. The DROP below is a safety net only; it will no-op if not present.
--
-- BACKWARD COMPATIBILITY
-- ----------------------
-- No backend code change is required. All callers already use supabaseAdmin
-- (service_role), which is not affected by REVOKE. Service_role bypasses all
-- RLS and EXECUTE grants — it can always call any function.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SAFETY NET: Ensure the 7-param overload is gone
-- (already dropped by earlier migrations, but idempotent here)
-- ============================================================================
DROP FUNCTION IF EXISTS public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION
);

-- ============================================================================
-- 1. search_memory_stream — 8-param (current live version)
-- ============================================================================
-- Revoke from all public/authenticated roles first
REVOKE ALL ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT[]
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT[]
) FROM authenticated, anon;

-- Grant only to service_role (backend supabaseAdmin)
GRANT EXECUTE ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT[]
) TO service_role;

-- ============================================================================
-- 2. touch_memories
-- ============================================================================
REVOKE ALL ON FUNCTION public.touch_memories(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.touch_memories(UUID[]) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.touch_memories(UUID[]) TO service_role;

-- ============================================================================
-- 3. increment_retrieval_counts
-- ============================================================================
REVOKE ALL ON FUNCTION public.increment_retrieval_counts(UUID[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_retrieval_counts(UUID[]) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.increment_retrieval_counts(UUID[]) TO service_role;

-- ============================================================================
-- 4. apply_importance_shift — also fix the NULL p_user_id global-mutate risk
--
-- The current signature is apply_importance_shift(float, int DEFAULT 500, uuid DEFAULT NULL).
-- When called with p_user_id = NULL it mutates all users' memories at once.
-- We recreate the function to REQUIRE p_user_id (raise exception if null),
-- keeping SECURITY DEFINER and the same body logic otherwise.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.apply_importance_shift(
  p_shift    FLOAT,
  p_limit    INT  DEFAULT 500,
  p_user_id  UUID DEFAULT NULL
)
RETURNS TABLE(shifted_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shifted        INT := 0;
  v_effective_shift INT;
BEGIN
  -- SECURITY: p_user_id is now required. Passing NULL previously triggered a
  -- global scan of all users' memories — that path is intentionally removed.
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION
      'apply_importance_shift: p_user_id is required. '
      'Global (cross-user) shifts are not permitted.';
  END IF;

  v_effective_shift := CASE
    WHEN p_shift < 0 THEN LEAST(-1,  ROUND(p_shift)::INT)
    WHEN p_shift > 0 THEN GREATEST(1, ROUND(p_shift)::INT)
    ELSE 0
  END;

  IF v_effective_shift = 0 THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  IF v_effective_shift < 0 THEN
    UPDATE user_memories
    SET importance_score = GREATEST(2, importance_score + v_effective_shift)
    WHERE id IN (
      SELECT id FROM user_memories
      WHERE importance_score BETWEEN 2 AND 9
        AND importance_score >= 6
        AND user_id = p_user_id
      ORDER BY importance_score DESC, created_at ASC
      LIMIT p_limit
    );
  ELSE
    UPDATE user_memories
    SET importance_score = LEAST(9, importance_score + v_effective_shift)
    WHERE id IN (
      SELECT id FROM user_memories
      WHERE importance_score BETWEEN 2 AND 9
        AND importance_score <= 4
        AND user_id = p_user_id
      ORDER BY importance_score ASC, created_at ASC
      LIMIT p_limit
    );
  END IF;

  GET DIAGNOSTICS v_shifted = ROW_COUNT;
  RETURN QUERY SELECT v_shifted;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_importance_shift(FLOAT, INT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_importance_shift(FLOAT, INT, UUID) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.apply_importance_shift(FLOAT, INT, UUID) TO service_role;

-- ============================================================================
-- 5. get_importance_stats — per-user variant (with optional p_user_id)
--
-- The global (p_user_id IS NULL) variant still exists for backward compat
-- with internal diagnostic tooling, but is also locked to service_role.
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_importance_stats(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_importance_stats(UUID) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.get_importance_stats(UUID) TO service_role;

-- ============================================================================
-- 6. get_type_stats(uuid, text)
-- No SECURITY DEFINER on this function, but PostgreSQL grants EXECUTE to
-- PUBLIC by default. Revoke so authenticated users cannot enumerate another
-- user's memory type distribution.
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_type_stats(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_type_stats(UUID, TEXT) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.get_type_stats(UUID, TEXT) TO service_role;

-- ============================================================================
-- 7. update_memory_confidence(uuid, float)
-- Allows arbitrary confidence mutation by memory ID with no ownership check.
-- ============================================================================
REVOKE ALL ON FUNCTION public.update_memory_confidence(UUID, DOUBLE PRECISION) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_memory_confidence(UUID, DOUBLE PRECISION) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.update_memory_confidence(UUID, DOUBLE PRECISION) TO service_role;

-- ============================================================================
-- 8. get_recent_importance_sum(uuid, float)
-- ============================================================================
REVOKE ALL ON FUNCTION public.get_recent_importance_sum(UUID, DOUBLE PRECISION) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_recent_importance_sum(UUID, DOUBLE PRECISION) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.get_recent_importance_sum(UUID, DOUBLE PRECISION) TO service_role;

COMMIT;
