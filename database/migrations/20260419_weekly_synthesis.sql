-- Weekly Synthesis Narrative
-- ==========================
-- One narrative paragraph per user per ISO week, describing their week as
-- a close friend would read it back. Generated on-demand (no cron), cached
-- for the duration of the week via UNIQUE (user_id, week_start).
--
-- week_start is the Monday (UTC) of the ISO week. Any call in the same
-- week hits the cached row; the following Monday invalidates it naturally.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS user_weekly_synthesis (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  narrative TEXT NOT NULL,
  memory_count INTEGER NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_user_weekly_synthesis_generated
  ON user_weekly_synthesis(user_id, generated_at DESC);

COMMENT ON TABLE user_weekly_synthesis IS
  'Per-user weekly narrative paragraph synthesized from platform observations + reflections. Generated on-demand, cached via (user_id, week_start) uniqueness.';
