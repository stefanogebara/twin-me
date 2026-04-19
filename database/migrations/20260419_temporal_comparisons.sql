-- Temporal comparison cache
-- Stores "You then vs you now" comparison text pairs for the /identity page.
-- One row per user, regenerated every 24 hours by temporalComparisonService.

CREATE TABLE IF NOT EXISTS user_temporal_comparisons (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  then_text TEXT,
  now_text TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_temporal_comparisons_generated_at
  ON user_temporal_comparisons(generated_at);
