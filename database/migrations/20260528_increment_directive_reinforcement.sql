-- Atomic increment for twin_directives.reinforcement_count
-- =========================================================
-- Replaces the previous read-modify-write pattern in
-- twinSelfImprovement.mergeOrInsertDirective(), which could race when two
-- nightly cron invocations (or a manual re-run + cron) reinforced the same
-- directive concurrently. PostgreSQL UPDATE...SET col = col + 1 is atomic
-- under MVCC; wrapping it in a SQL function lets the JS layer hit it via
-- a single supabaseAdmin.rpc() call.

CREATE OR REPLACE FUNCTION increment_directive_reinforcement(directive_id uuid)
RETURNS integer
LANGUAGE sql
AS $$
  UPDATE twin_directives
  SET reinforcement_count = reinforcement_count + 1,
      last_reinforced_at = NOW(),
      updated_at = NOW()
  WHERE id = directive_id
  RETURNING reinforcement_count;
$$;

GRANT EXECUTE ON FUNCTION increment_directive_reinforcement(uuid) TO service_role;
