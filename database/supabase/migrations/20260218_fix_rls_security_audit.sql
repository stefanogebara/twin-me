-- ============================================================================
-- RLS Security Audit Fixes
-- Migration: fix_rls_security_audit
-- Date: 2026-02-18
--
-- Fixes three critical security issues:
-- 1. soul_data_sources has NO RLS (stores OAuth tokens!)
-- 2. analytics_events has NO RLS
-- 3. enriched_profiles has NULL user_id leak + per-row auth.uid() calls
--
-- All policies use (SELECT auth.uid()) for performance (evaluated once per
-- query instead of per-row).
-- ============================================================================

-- ============================================================================
-- FIX 1: Enable RLS on soul_data_sources (CRITICAL - stores OAuth tokens)
-- ============================================================================

ALTER TABLE IF EXISTS soul_data_sources ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to ensure clean state
DROP POLICY IF EXISTS "Users view own soul_data_sources" ON soul_data_sources;
DROP POLICY IF EXISTS "Users insert own soul_data_sources" ON soul_data_sources;
DROP POLICY IF EXISTS "Users update own soul_data_sources" ON soul_data_sources;
DROP POLICY IF EXISTS "Users delete own soul_data_sources" ON soul_data_sources;
DROP POLICY IF EXISTS "Service role full access soul_data_sources" ON soul_data_sources;

-- Users can only see their own data sources
CREATE POLICY "Users view own soul_data_sources"
  ON soul_data_sources FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Users can only insert their own data sources
CREATE POLICY "Users insert own soul_data_sources"
  ON soul_data_sources FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users can only update their own data sources
CREATE POLICY "Users update own soul_data_sources"
  ON soul_data_sources FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

-- Users can only delete their own data sources
CREATE POLICY "Users delete own soul_data_sources"
  ON soul_data_sources FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- Service role needs full access for backend API operations
CREATE POLICY "Service role full access soul_data_sources"
  ON soul_data_sources FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- FIX 2: Enable RLS on analytics_events
-- ============================================================================

ALTER TABLE IF EXISTS analytics_events ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to ensure clean state
DROP POLICY IF EXISTS "Users can insert own analytics" ON analytics_events;
DROP POLICY IF EXISTS "Users can view own analytics" ON analytics_events;
DROP POLICY IF EXISTS "Users view own analytics_events" ON analytics_events;
DROP POLICY IF EXISTS "Users insert own analytics_events" ON analytics_events;
DROP POLICY IF EXISTS "Service role full access analytics_events" ON analytics_events;

-- Users can only see their own analytics events
CREATE POLICY "Users view own analytics_events"
  ON analytics_events FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Users can only insert their own analytics events
CREATE POLICY "Users insert own analytics_events"
  ON analytics_events FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Service role needs full access for backend operations
CREATE POLICY "Service role full access analytics_events"
  ON analytics_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- FIX 3: Fix enriched_profiles NULL user_id leak + auth.uid() performance
--
-- Previous policies had: auth.uid() = user_id OR user_id IS NULL
-- This allowed ANY authenticated user to read/write rows with NULL user_id.
-- Also used bare auth.uid() instead of (SELECT auth.uid()), causing per-row
-- function evaluation.
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own enriched profile" ON enriched_profiles;
DROP POLICY IF EXISTS "Users can insert own enriched profile" ON enriched_profiles;
DROP POLICY IF EXISTS "Users can update own enriched profile" ON enriched_profiles;
DROP POLICY IF EXISTS "Service role has full access to enriched profiles" ON enriched_profiles;

-- Users can only view their own enriched profile (no NULL leak)
CREATE POLICY "Users can view own enriched profile"
  ON enriched_profiles FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Users can only insert their own enriched profile (no NULL leak)
CREATE POLICY "Users can insert own enriched profile"
  ON enriched_profiles FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Users can only update their own enriched profile (no NULL leak)
CREATE POLICY "Users can update own enriched profile"
  ON enriched_profiles FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Service role needs full access for API operations
CREATE POLICY "Service role full access enriched_profiles"
  ON enriched_profiles FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- Verify: After applying, run security advisor to confirm fixes
-- SELECT * FROM pg_policies WHERE tablename IN (
--   'soul_data_sources', 'analytics_events', 'enriched_profiles'
-- );
-- ============================================================================
