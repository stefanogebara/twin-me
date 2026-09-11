-- Presence elder channel: call links + conversation records
-- ==========================================================
-- Plans: .claude/plans/2026-08-31-presence-onboarding-system/ (elder channel v1)
--
-- call_token: capability URL for the elder-side call page (/call/:token). The elder
-- has no account; the token IS the auth. Rotatable by the owner at any time.

ALTER TABLE presences ADD COLUMN IF NOT EXISTS call_token TEXT UNIQUE;
ALTER TABLE presences ADD COLUMN IF NOT EXISTS call_token_created_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS presence_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presence_id UUID NOT NULL REFERENCES presences(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  -- [{role: 'user'|'assistant', content: text}] as captured client-side (v1);
  -- server-side capture arrives with the custom-LLM flip.
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  turn_count INT NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
  duration_seconds INT NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  summary TEXT NOT NULL DEFAULT '',
  -- Things that need the family: requests, worries, health mentions (write-only for
  -- the elder side, rendered in the dashboard digest).
  needs_family JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'summarized', 'failed')),
  source TEXT NOT NULL DEFAULT 'web_call' CHECK (source IN ('web_call', 'phone', 'agent'))
);

CREATE INDEX IF NOT EXISTS idx_presence_conversations_presence
  ON presence_conversations(presence_id, started_at DESC);

ALTER TABLE presence_conversations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'presence_conversations' AND policyname = 'service_role_all') THEN
    CREATE POLICY service_role_all ON presence_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
