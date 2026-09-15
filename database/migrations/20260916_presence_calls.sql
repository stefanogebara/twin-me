-- Presence: her phone, the call schedule, the calls, and the digest link
-- =======================================================================
-- Used by api/routes/cron-presence-calls.js, api/routes/webhooks-elevenlabs.js
-- and api/services/presenceRelay.js on presence/ship (plan
-- 2026-09-15-presence-forward, Phase 1). NOT applied anywhere yet; apply by
-- hand (Supabase MCP apply_migration) before deploying that code.
--
-- presences.elder_phone / call_hour / call_days / call_timezone
--   Her mobile in E.164, the local hour the Presence calls, the weekdays
--   (0 = Sunday), and the timezone the hour is read in. The hourly cron dials
--   a presence when its local clock matches.
--
-- presence_calls
--   One row per dial or inbound call: what ElevenLabs answered when we placed
--   it (conversation id, Twilio call sid), how it ended (the post-call and
--   call-initiation-failure webhooks), and the conversation it produced. A
--   second attempt is placed the next hour after a no-answer.
--
-- presence_conversations.provider_conversation_id (unique)
--   The webhook and the web channel's /complete can both try to store one
--   conversation; the unique index makes the second a no-op.
-- presence_conversations.digest_message_id
--   The WhatsApp message id of the digest sent to the family, so a reply to
--   that message becomes a note for her next call.

ALTER TABLE presences
  ADD COLUMN IF NOT EXISTS elder_phone TEXT
    CHECK (elder_phone IS NULL OR elder_phone ~ '^\+[1-9][0-9]{7,14}$'),
  ADD COLUMN IF NOT EXISTS call_hour SMALLINT NOT NULL DEFAULT 10
    CHECK (call_hour BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS call_days SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  ADD COLUMN IF NOT EXISTS call_timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE INDEX IF NOT EXISTS idx_presences_elder_phone
  ON presences(elder_phone) WHERE elder_phone IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS presence_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  attempt SMALLINT NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'dialing'
    CHECK (status IN ('dialing', 'answered', 'no_answer', 'busy', 'failed', 'completed')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound', 'inbound')),
  provider_conversation_id TEXT,
  call_sid TEXT,
  failure_reason TEXT,
  conversation_id UUID REFERENCES presence_conversations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_calls_presence_day
  ON presence_calls(presence_id, scheduled_for DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_presence_calls_provider
  ON presence_calls(provider_conversation_id) WHERE provider_conversation_id IS NOT NULL;

ALTER TABLE presence_calls ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presence_calls' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON presence_calls FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DROP INDEX IF EXISTS idx_presence_conversations_provider;
CREATE UNIQUE INDEX IF NOT EXISTS idx_presence_conversations_provider_unique
  ON presence_conversations(provider_conversation_id) WHERE provider_conversation_id IS NOT NULL;

ALTER TABLE presence_conversations
  ADD COLUMN IF NOT EXISTS digest_message_id TEXT;
