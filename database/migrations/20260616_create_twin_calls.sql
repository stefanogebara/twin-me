-- Twin phone calls (2026-06-16): the twin places an outbound PSTN call on the
-- user's behalf toward a user-approved goal ("call the dentist and book a
-- cleaning"), holds a voice conversation via a managed voice-agent platform
-- (Vapi, BYOK), then reports the outcome back. Double-gated: the phone_calls
-- feature flag AND a configured VAPI_API_KEY are both required, so the feature
-- is inert in prod until explicitly turned on.
CREATE TABLE IF NOT EXISTS twin_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  to_number         TEXT NOT NULL,                 -- E.164 destination
  to_name           TEXT,                          -- resolved contact name, if any
  goal              TEXT NOT NULL,                 -- what the twin should accomplish
  status            TEXT NOT NULL DEFAULT 'queued', -- queued|dialing|in_progress|completed|failed|no_answer
  provider          TEXT,                          -- 'vapi'
  provider_call_id  TEXT,                          -- the platform's call id (for webhook correlation)
  transcript        TEXT,                          -- full transcript once the call ends
  outcome           TEXT,                          -- LLM one-line summary of what happened
  duration_seconds  INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ
);

-- Webhook correlation: look up a call by the provider's id when an event arrives.
CREATE INDEX IF NOT EXISTS idx_twin_calls_provider_call_id
  ON twin_calls (provider_call_id)
  WHERE provider_call_id IS NOT NULL;

-- Daily per-user quota check scans recent calls for a user.
CREATE INDEX IF NOT EXISTS idx_twin_calls_user_created
  ON twin_calls (user_id, created_at DESC);
