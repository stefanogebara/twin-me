-- ============================================================================
-- Restore the service-role-only lockdown on search_memory_stream
-- Date: 2026-07-28
--
-- 20260420_secure_definer_rpcs.sql deliberately revoked EXECUTE from PUBLIC,
-- anon and authenticated on the 8-arg signature and granted it to service_role
-- only, describing it as a CRITICAL privilege-escalation fix.
--
-- 20260728_add_memory_supersession.sql then DROPped that signature and created a
-- NEW 9-arg one (adding p_include_superseded). DROP destroys the ACL, and a newly
-- created function takes PostgreSQL's default EXECUTE TO PUBLIC, so the lockdown
-- was silently undone. Confirmed on the live database before this fix:
--   =X/postgres | anon=X/postgres | authenticated=X/postgres | service_role=X
--
-- Containment was accidental rather than designed: the function is SECURITY
-- INVOKER and user_memories' RLS compares auth.uid() against user_id, which holds
-- a public.users.id — a different UUID space — so a client role got zero rows.
-- But p_user_id is a free parameter with no ownership check, so the moment any
-- auth.uid() -> public.users.id mapping is introduced this becomes cross-user
-- memory read, callable from the browser with the publishable key.
--
-- touch_memories is deliberately untouched: CREATE OR REPLACE on an unchanged
-- signature preserves its ACL, and it still verifies as service_role-only.
--
-- Lesson: DROP FUNCTION discards grants. Any migration that drops and recreates
-- a locked-down RPC must re-issue the REVOKE/GRANT in the same migration.
-- ============================================================================

REVOKE ALL ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.search_memory_stream(
  UUID, TEXT, INTEGER, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, DOUBLE PRECISION, TEXT[], BOOLEAN) TO service_role;
