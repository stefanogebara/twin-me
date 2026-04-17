-- Meeting Prep Engine
-- Stores generated briefings (idempotent via event_id + etag)
-- and adds metadata JSONB to proactive_insights for rich briefing data.

CREATE TABLE IF NOT EXISTS meeting_briefings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id      TEXT NOT NULL,
  event_etag    TEXT,
  headline      TEXT,
  briefing_json JSONB,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

ALTER TABLE meeting_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own briefings"
  ON meeting_briefings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS meeting_briefings_user_generated
  ON meeting_briefings (user_id, generated_at DESC);

-- Add metadata column to proactive_insights if not present
ALTER TABLE proactive_insights
  ADD COLUMN IF NOT EXISTS metadata JSONB;
