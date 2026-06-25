-- Backfill migration (2026-06-18): messaging_channels already EXISTS in prod but
-- was created ad-hoc (direct DDL / dashboard) and never captured as a tracked
-- migration -- a schema-drift gap where a fresh bootstrap from database/migrations/
-- would be missing the table that whatsapp-link.js and telegram-link.js depend on.
-- This reproduces the live schema exactly. Fully idempotent: re-applying against
-- the existing table is a no-op (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT
-- EXISTS / ENABLE RLS is already on / DROP+CREATE recreates the identical policy).
CREATE TABLE IF NOT EXISTS messaging_channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,                       -- 'whatsapp' | 'telegram' | ...
  channel_id  TEXT NOT NULL,                       -- E.164 phone / chat id
  is_enabled  BOOLEAN DEFAULT TRUE,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT messaging_channels_user_id_channel_key UNIQUE (user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_messaging_channels_user
  ON messaging_channels (user_id);
CREATE INDEX IF NOT EXISTS idx_messaging_channels_channel_id
  ON messaging_channels (channel, channel_id);

-- The API talks to this table only via the service role (supabaseAdmin); user_id
-- is a public.users id, not auth.uid(), so client roles get no direct access.
ALTER TABLE messaging_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_full_access ON messaging_channels;
CREATE POLICY service_role_full_access ON messaging_channels
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
