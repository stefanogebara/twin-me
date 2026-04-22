-- =============================================================================
-- USER_REFRESH_TOKENS — Multi-device session support
--
-- Problem: users.refresh_token_hash is a single column. Signing in from device B
-- overwrites device A's hash, invalidating A's session. This caused the Money
-- page "Failed to load transactions (401)" zombie UI after Playwright sign-in
-- rotated the prod user's token on 2026-04-22.
--
-- Fix: One refresh-token row per (user, device). Industry-standard pattern.
--
-- Rollout strategy:
--   1. Ship this migration — backend now writes to BOTH the new table AND the
--      legacy users.refresh_token_hash column during a transition period.
--   2. Refresh handler prefers the new table, falls back to the legacy column,
--      and silently migrates legacy tokens to the new table on first hit.
--   3. After all active tokens have migrated (~30 days), a follow-up migration
--      will drop users.refresh_token_hash.
--
-- TODO(post-rollout): Drop users.refresh_token_hash once all existing refresh
-- tokens have either expired or been migrated to user_refresh_tokens. Earliest
-- safe date: 2026-05-22 (30 days after this migration lands).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  device_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes
-- token_hash already has an implicit unique index from the UNIQUE constraint.
CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_user_id
  ON public.user_refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_user_refresh_tokens_expires_at
  ON public.user_refresh_tokens (expires_at);

-- =============================================================================
-- RLS — mirrors pattern from 20260420_rls_hardening.sql
-- Backend writes via supabaseAdmin (service_role). Users can read their own rows.
-- =============================================================================

ALTER TABLE public.user_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own refresh-token metadata (e.g. for a future
-- "sessions" management page). The token_hash itself is not a bearer secret —
-- it's a sha256 of the real token which lives only in the httpOnly cookie.
CREATE POLICY "Users read own refresh tokens" ON public.user_refresh_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Backend has full access via service_role (supabaseAdmin)
CREATE POLICY "Service role full access" ON public.user_refresh_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- Backfill: migrate existing users.refresh_token_hash values
-- One row per user. device_label='migrated_session'. 30-day expiry from now.
-- Any user who signs in again will get a fresh row with a real device_label.
-- =============================================================================

INSERT INTO public.user_refresh_tokens (user_id, token_hash, device_label, expires_at)
SELECT
  id AS user_id,
  refresh_token_hash AS token_hash,
  'migrated_session' AS device_label,
  NOW() + INTERVAL '30 days' AS expires_at
FROM public.users
WHERE refresh_token_hash IS NOT NULL
ON CONFLICT (token_hash) DO NOTHING;

-- =============================================================================
-- NOTE: We intentionally do NOT drop users.refresh_token_hash in this
-- migration. See TODO at the top. Keeping it populated during rollout lets
-- auth-simple.js fall back gracefully if a refresh token predates the new
-- table (e.g. a user whose cookie was issued minutes before deploy).
-- =============================================================================
