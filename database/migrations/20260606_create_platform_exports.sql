-- GDPR-export upload pipeline storage
-- ===================================================================
-- For platforms with no usable real-time API (Discord, LinkedIn, Instagram)
-- the user uploads the platform's own GDPR data export. We parse the zip,
-- aggregate behavioural signals, then DISCARD the raw file. Only the
-- aggregates JSON is persisted — same privacy contract as the live-API
-- analytics path.
--
-- Conventions (consistent with 20260526_create_instagram_sessions.sql):
--   - FKs reference public.users(id), NOT auth.users(id).
--   - Server uses service_role (BYPASSRLS). RLS policies are defense-in-depth.
--   - No auth.uid()=user_id policies — those evaluate false because the two
--     user tables are different UUID spaces.

CREATE TABLE IF NOT EXISTS platform_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN (
    'discord_export',
    'linkedin_export',
    'instagram_export'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'parsing',
    'parsed',
    'failed'
  )),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parsed_at TIMESTAMPTZ,
  -- Original file metadata, NOT the file itself (parse-and-discard).
  source_filename TEXT,
  source_size_bytes BIGINT,
  -- Platform-specific aggregated counters + top-K lists. No raw messages.
  aggregates JSONB NOT NULL DEFAULT '{}'::jsonb,
  observation_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_exports_user
  ON platform_exports(user_id);

CREATE INDEX IF NOT EXISTS idx_platform_exports_user_platform_parsed
  ON platform_exports(user_id, platform)
  WHERE status = 'parsed';

CREATE OR REPLACE FUNCTION platform_exports_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_exports_updated ON platform_exports;
CREATE TRIGGER trg_platform_exports_updated
  BEFORE UPDATE ON platform_exports
  FOR EACH ROW
  EXECUTE FUNCTION platform_exports_set_updated_at();

ALTER TABLE platform_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full_access ON platform_exports;
CREATE POLICY service_role_full_access ON platform_exports
  FOR ALL TO service_role USING (true) WITH CHECK (true);
