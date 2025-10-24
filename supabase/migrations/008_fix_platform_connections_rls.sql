-- Migration: Fix platform_connections RLS policies
-- Date: 2025-01-24
-- Purpose: Fix connector persistence issue - RLS policies must filter by user_id

-- ====================================================================
-- CRITICAL FIX: RLS Policies for platform_connections
-- ====================================================================

-- Problem: Current RLS policies have qual="true" which allows ALL users
-- to access ALL data without filtering by user_id. This causes:
-- 1. Connectors disappearing on login (wrong user's data shown)
-- 2. Security issue (users can see other users' OAuth tokens)
-- 3. Data inconsistency across sessions

-- Drop existing broken policies
DROP POLICY IF EXISTS "Users can view own connectors" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can insert own connectors" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can update own connectors" ON public.platform_connections;
DROP POLICY IF EXISTS "Users can delete own connectors" ON public.platform_connections;

-- Enable RLS on platform_connections table
ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;

-- Create CORRECT RLS policies that filter by user_id
-- SELECT policy - Users can ONLY view their own connections
CREATE POLICY "Users can view own platform connections"
  ON public.platform_connections
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT policy - Users can ONLY insert connections for themselves
CREATE POLICY "Users can insert own platform connections"
  ON public.platform_connections
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE policy - Users can ONLY update their own connections
CREATE POLICY "Users can update own platform connections"
  ON public.platform_connections
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE policy - Users can ONLY delete their own connections
CREATE POLICY "Users can delete own platform connections"
  ON public.platform_connections
  FOR DELETE
  USING (user_id = auth.uid());

-- ====================================================================
-- VERIFICATION
-- ====================================================================

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'platform_connections';

-- Verify policies are correct
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'platform_connections'
ORDER BY cmd;

-- Verify that policies check user_id = auth.uid()
-- Expected output: All policies should have qual containing 'user_id = auth.uid()'
