-- =============================================================================
-- RLS HARDENING — Security Audit Fixes 2026-04-20
--
-- Fix 1: Replace broken auth.role() = 'service_role' policies
-- Fix 2: Lock down FOR ALL USING (true) on 8 agentic tables
-- Fix 3: Revoke column-level SELECT on users.password_hash / refresh_token_hash
-- Fix 4: Restrict LLM cost aggregate RPCs to service_role only
-- Fix 5: Drop legacy base64 encrypt_token / decrypt_token SQL functions
-- Fix 6: Add service_role policy on analytics_sessions (RLS with zero policies)
-- =============================================================================

-- =============================================================================
-- FIX 1: Replace broken auth.role() = 'service_role' policies
-- auth.role() is evaluated once per statement as a postgres setting; it does NOT
-- reliably restrict to service_role connections via PostgREST. The correct
-- pattern is TO service_role in the policy definition.
-- =============================================================================

-- user_memories
DROP POLICY IF EXISTS "Service role full access" ON public.user_memories;
CREATE POLICY "Service role full access" ON public.user_memories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- twin_goals
DROP POLICY IF EXISTS "Service role full access twin_goals" ON public.twin_goals;
CREATE POLICY "Service role full access" ON public.twin_goals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- goal_progress_log
DROP POLICY IF EXISTS "Service role full access goal_progress_log" ON public.goal_progress_log;
CREATE POLICY "Service role full access" ON public.goal_progress_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- onboarding_calibration
-- Original policy name from 20260304_create_onboarding_calibration.sql:
-- "Service role full access"
DROP POLICY IF EXISTS "Service role full access" ON public.onboarding_calibration;
CREATE POLICY "Service role full access" ON public.onboarding_calibration
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- user_platform_data — no service_role policy existed; backend uses supabaseAdmin
-- The existing user-facing policies remain intact (user_platform_data_select_own, etc.)
-- Add a service_role policy so supabaseAdmin writes are not blocked
CREATE POLICY "Service role full access" ON public.user_platform_data
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- data_extraction_jobs — same pattern as above
-- Drop the broken auth.role() policy and replace
DROP POLICY IF EXISTS "extraction_jobs_service_role" ON public.data_extraction_jobs;
CREATE POLICY "Service role full access" ON public.data_extraction_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- FIX 2: Lock down FOR ALL USING (true) on 8 agentic tables
-- These policies omit a TO clause, so they apply to ALL roles including anon
-- and authenticated, granting cross-user write access. Replace with TO service_role.
-- The user-scoped SELECT/UPDATE policies from 20260323 remain untouched.
-- =============================================================================

-- core_memory_blocks
DROP POLICY IF EXISTS "Service role full access" ON public.core_memory_blocks;
CREATE POLICY "Service role full access" ON public.core_memory_blocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- prospective_memories
DROP POLICY IF EXISTS "Service role full access" ON public.prospective_memories;
CREATE POLICY "Service role full access" ON public.prospective_memories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- agent_actions
DROP POLICY IF EXISTS "Service role full access" ON public.agent_actions;
CREATE POLICY "Service role full access" ON public.agent_actions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- user_skill_settings
DROP POLICY IF EXISTS "Service role full access" ON public.user_skill_settings;
CREATE POLICY "Service role full access" ON public.user_skill_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- agent_events
DROP POLICY IF EXISTS "Service role full access" ON public.agent_events;
CREATE POLICY "Service role full access" ON public.agent_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- user_finetuned_models
DROP POLICY IF EXISTS "Service role full access" ON public.user_finetuned_models;
CREATE POLICY "Service role full access" ON public.user_finetuned_models
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- preference_pairs
DROP POLICY IF EXISTS "Service role full access" ON public.preference_pairs;
CREATE POLICY "Service role full access" ON public.preference_pairs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- chat_message_feedback
DROP POLICY IF EXISTS "Service role full access" ON public.chat_message_feedback;
CREATE POLICY "Service role full access" ON public.chat_message_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- skill_definitions — shared read table; keep authenticated read, lock write to service_role
DROP POLICY IF EXISTS "Service role full access" ON public.skill_definitions;
CREATE POLICY "Service role full access" ON public.skill_definitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- FIX 3: Revoke column-level SELECT on credential columns
-- password_hash exists in 001_initial_schema.sql.
-- refresh_token_hash exists in 025_refresh_tokens.sql.
-- These REVOKE calls are safe even if prior explicit column grants were never
-- issued — PostgreSQL will no-op gracefully.
-- =============================================================================

REVOKE SELECT (password_hash) ON public.users FROM authenticated, anon, PUBLIC;
REVOKE SELECT (refresh_token_hash) ON public.users FROM authenticated, anon, PUBLIC;

-- =============================================================================
-- FIX 4: Restrict LLM cost aggregate RPCs to service_role
-- These admin RPCs aggregate cost data across ALL users and must not be
-- callable by authenticated or anon roles via PostgREST.
-- =============================================================================

REVOKE ALL ON FUNCTION public.aggregate_llm_costs_summary(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aggregate_llm_costs_summary(timestamptz) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.aggregate_llm_costs_summary(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.aggregate_llm_costs_daily(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aggregate_llm_costs_daily(timestamptz) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.aggregate_llm_costs_daily(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.aggregate_llm_costs_by_user(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aggregate_llm_costs_by_user(timestamptz) FROM authenticated, anon;
GRANT  EXECUTE ON FUNCTION public.aggregate_llm_costs_by_user(timestamptz) TO service_role;

-- =============================================================================
-- FIX 5: Drop legacy base64 encrypt_token / decrypt_token SQL functions
-- These were placeholder stubs in 002_data_integration_architecture.sql that
-- use encode(token::bytea, 'base64') — not encryption at all. Confirmed via
-- api/services/encryption.js that all OAuth token encryption is done in Node.js
-- with AES-256-GCM. No backend code calls .rpc('encrypt_token') or
-- .rpc('decrypt_token'). Dropping eliminates the false sense of security and
-- the risk of any future code accidentally using the stub.
-- =============================================================================

DROP FUNCTION IF EXISTS public.encrypt_token(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.decrypt_token(TEXT, TEXT);

-- =============================================================================
-- FIX 6: analytics_sessions — RLS was enabled (001_initial_schema.sql) but no
-- service_role policy was ever created. supabaseAdmin writes would silently fail
-- or be permitted only because service_role bypasses RLS by default in Supabase
-- managed environments. Adding an explicit policy is defense-in-depth and ensures
-- correct behavior if the service_role bypass setting is ever changed.
-- =============================================================================

CREATE POLICY "Service role analytics access" ON public.analytics_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
