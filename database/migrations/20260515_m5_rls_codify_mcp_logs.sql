-- ============================================================================
-- 20260515_m5_rls_codify_mcp_logs.sql
-- ============================================================================
-- audit-2026-05-15 M5: codify the RLS state of mcp_conversation_logs.
--
-- Background: RLS is already enabled on this table in production (verified
-- via pg_class.relrowsecurity = true) and a "Service role mcp_logs" policy
-- exists granting service_role full access. The audit found, however, that
-- no migration in the codebase contains the ENABLE ROW LEVEL SECURITY
-- statement — so a future migration that drops & recreates the table
-- could silently regress to RLS-off and expose every user's chat history
-- to anon/authenticated roles.
--
-- This migration is IDEMPOTENT: ENABLE ROW LEVEL SECURITY is a no-op if
-- already enabled, and the CREATE POLICY statements use IF NOT EXISTS to
-- avoid re-creating the existing service-role policy.
--
-- The table stores per-chat-turn PII:
--   - rendered_system_prompt: soul signature + memories + calendar +
--     financial context + voice examples
--   - user_message, twin_response: full turn transcript
--   - sentiment, intent, topics_detected: derived analysis
--   - hop_timings: timing ladder (no PII but still tied to user_id)
--
-- Service-role-only access is the right posture: writes come from the
-- backend via supabaseAdmin; reads are admin-only (cost dashboard,
-- analytics). No browser client should ever touch this table directly.
-- ============================================================================

ALTER TABLE mcp_conversation_logs ENABLE ROW LEVEL SECURITY;

-- Service role retains full access (already exists in prod; this is the
-- idempotent codified form).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'mcp_conversation_logs'::regclass
      AND polname = 'Service role mcp_logs'
  ) THEN
    CREATE POLICY "Service role mcp_logs"
      ON mcp_conversation_logs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE mcp_conversation_logs IS
  'Per-chat-turn log including rendered system prompt + full transcript. Service-role only — never expose to anon or authenticated clients. RLS codified in 20260515_m5_rls_codify_mcp_logs.';
