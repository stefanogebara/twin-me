-- Instagram session tracking for vanilla-Playwright scraping
-- =============================================================
-- Phase 1: minimal schema. No encrypted cookies, no encrypted credentials.
-- Cookies flow through the request body to /api/instagram/sync and are NEVER persisted.
-- This is the architecture decided after the dual spike validated that vanilla Playwright
-- + the user's Chrome cookies works without any anti-bot stack (no camofox, no VPS).
--
-- Conventions (from twin-ai-learn/CLAUDE.md + 20260525 RLS sweep):
--   - References public.users(id), not auth.users(id).
--   - Server uses service_role (BYPASSRLS). RLS policies are defense-in-depth.
--   - No auth.uid() = user_id policies — those evaluate false because public.users.id
--     is a separate UUID from auth.users.id.
--   - Global kill switch lives in an env var (INSTAGRAM_SCRAPING_ENABLED), NOT in
--     feature_flags (which is the PER-USER table in this codebase).

CREATE TABLE IF NOT EXISTS instagram_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instagram_username TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN (
    'connected',
    'needs_relogin',
    'rate_limited',
    'disconnected',
    'disabled_by_user'
  )),
  consent_accepted_at TIMESTAMPTZ NOT NULL,
  consent_version INT NOT NULL DEFAULT 1,
  enabled_surfaces JSONB NOT NULL DEFAULT '["saved", "own_posts", "follows"]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  last_sync_post_count INT,
  last_sync_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_instagram_sessions_user
  ON instagram_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_instagram_sessions_connected
  ON instagram_sessions(status)
  WHERE status IN ('connected', 'needs_relogin');

-- Per-sync attempt log for the privacy dashboard + debugging.
CREATE TABLE IF NOT EXISTS instagram_observations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('saved', 'own_posts', 'follows', 'feed')),
  items_scraped INT NOT NULL DEFAULT 0,
  items_stored INT NOT NULL DEFAULT 0,
  rate_limited BOOLEAN NOT NULL DEFAULT FALSE,
  captcha_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  duration_ms INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instagram_obs_log_user_time
  ON instagram_observations_log(user_id, started_at DESC);

-- Auto-update updated_at on session changes.
CREATE OR REPLACE FUNCTION instagram_sessions_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_instagram_sessions_updated ON instagram_sessions;
CREATE TRIGGER trg_instagram_sessions_updated
  BEFORE UPDATE ON instagram_sessions
  FOR EACH ROW
  EXECUTE FUNCTION instagram_sessions_set_updated_at();

-- RLS: defense in depth. Service role bypasses. No broken auth.uid()=user_id policies.
ALTER TABLE instagram_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_observations_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full_access ON instagram_sessions;
DROP POLICY IF EXISTS service_role_full_access ON instagram_observations_log;

CREATE POLICY service_role_full_access ON instagram_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY service_role_full_access ON instagram_observations_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
