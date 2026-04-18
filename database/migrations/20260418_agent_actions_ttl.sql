-- Agent Actions TTL Support
-- ==========================
-- Adds 'expired' to the user_response enum so stale pending proposals
-- can be soft-closed by the cron-agent-actions-cleanup job without
-- losing the audit trail.
--
-- Pending proposals accumulate indefinitely when a department's autonomy
-- is below ACT_NOTIFY (3) — the department-execute cron skips them but
-- leaves user_response NULL, so they keep being re-fetched on every run.
-- This TTL fixes that: after 7 days pending, the cleanup job marks them
-- 'expired' so they stop consuming the 50-row fetch window and the user
-- inbox view can filter them out cleanly.
--
-- Idempotent: safe to re-run.

ALTER TABLE agent_actions
  DROP CONSTRAINT IF EXISTS agent_actions_user_response_check;

ALTER TABLE agent_actions
  ADD CONSTRAINT agent_actions_user_response_check
  CHECK (user_response IN ('accepted', 'rejected', 'modified', 'ignored', 'expired') OR user_response IS NULL);

-- Narrow index to accelerate the TTL scan. Only covers unresolved rows,
-- which is the only set the cleanup job cares about.
CREATE INDEX IF NOT EXISTS idx_agent_actions_pending_created
  ON agent_actions(created_at)
  WHERE user_response IS NULL;

COMMENT ON CONSTRAINT agent_actions_user_response_check ON agent_actions IS
  'Valid user_response values. "expired" is reserved for the TTL cleanup cron (cron-agent-actions-cleanup) and is never set by end users.';
