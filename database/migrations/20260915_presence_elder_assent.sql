-- Presence: her assent, the provider's conversation id, and urgency
-- =================================================================
-- Used by api/routes/presence-call.js on presence/ship (plan
-- 2026-09-15-presence-forward, Phase 0 task 9). Applied to production on
-- 2026-09-15 through the Supabase MCP (migration name presence_elder_assent).
--
-- elder_assent_at / elder_assent_version
--   The elder is the data subject of every transcript and has no user row, so
--   her assent cannot go in presence_consents (user_id NOT NULL). Before her
--   first call the call page tells her who is speaking and what is reported to
--   the family, and her "Sim, pode" is recorded here with the version of the
--   text she heard. Phase 1 turns this into the spoken first-call script.
--
-- provider_conversation_id
--   The id ElevenLabs assigns to the session. /complete reads the record it
--   holds for this id instead of trusting the browser's transcript.
--
-- urgency
--   The summarizer marks a call 'high' when she mentioned pain, a fall, being
--   unwell, confusion, or asked for help. Phase 1 notifies the family at once.

ALTER TABLE presences
  ADD COLUMN IF NOT EXISTS elder_assent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS elder_assent_version TEXT;

ALTER TABLE presence_conversations
  ADD COLUMN IF NOT EXISTS provider_conversation_id TEXT,
  ADD COLUMN IF NOT EXISTS urgency TEXT NOT NULL DEFAULT 'normal'
    CHECK (urgency IN ('normal', 'high'));

CREATE INDEX IF NOT EXISTS idx_presence_conversations_provider
  ON presence_conversations(provider_conversation_id)
  WHERE provider_conversation_id IS NOT NULL;
