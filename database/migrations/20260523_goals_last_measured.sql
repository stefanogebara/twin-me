-- audit-2026-05-23 C1: surface last measured value so the FE progress bar can
-- render and ops can see whether the auto-tracker even attempted. Today the
-- tracker silently `continue`s when extraction returns null, leaving no
-- trace — Stefano's only active goal sits at total_days_tracked=0 with
-- last_progress_check=NULL despite 60+ days of attempted ingestion.
--
-- Two columns:
--   last_measured_value — most recent numeric reading we extracted (e.g. 78
--     for a recovery_score goal). Nullable when no reading has ever been
--     captured. Used by the FE progress bar.
--   last_measured_at — timestamptz of the reading. Combined with the
--     existing `last_progress_check` (now written on every attempt), ops can
--     distinguish "tracker ran but found nothing" from "tracker never ran".

ALTER TABLE public.twin_goals
  ADD COLUMN IF NOT EXISTS last_measured_value NUMERIC,
  ADD COLUMN IF NOT EXISTS last_measured_at TIMESTAMP WITH TIME ZONE;

-- Backfill: pull the most recent measured_value per goal from the progress log.
-- Safe to re-run (idempotent — coalesces against existing values).
UPDATE public.twin_goals g
SET
  last_measured_value = COALESCE(g.last_measured_value, p.measured_value),
  last_measured_at = COALESCE(g.last_measured_at, p.tracked_date::timestamptz)
FROM (
  SELECT DISTINCT ON (goal_id) goal_id, measured_value, tracked_date
  FROM public.goal_progress_log
  WHERE measured_value IS NOT NULL
  ORDER BY goal_id, tracked_date DESC
) p
WHERE p.goal_id = g.id;
