-- =============================================================================
-- Money: the twin grades its own homework, the month and the day (2026-09-13)
-- =============================================================================
-- The next-charge predictions have been written down and scored since the 8th
-- (money_predictions, 20260908_money_brain.sql). The two figures the twin says
-- most often were said and forgotten: where the month lands, with its band, and
-- what is safe to spend today. Each is now written down with the day it is
-- about; when that day has passed, the actual from the ledger is written beside
-- it. One row per person, kind, target day and day of making, so the three
-- scheduled reads a day leave one line.
--
-- Code: api/services/money/predictions.js. Read by GET /api/money/accuracy.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.money_figure_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,                       -- month_total | safe_today
  predicted_for  DATE NOT NULL,                       -- the day the figure is about
  predicted_on   DATE NOT NULL,                       -- the day the figure was made
  predicted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value          NUMERIC(12,2) NOT NULL,              -- what it said
  low            NUMERIC(12,2),                       -- the band, where there is one
  high           NUMERIC(12,2),
  actual         NUMERIC(12,2),                       -- what happened, once known
  error          NUMERIC(12,2),                       -- actual - value
  hit            BOOLEAN,                             -- inside the band / the day kept
  scored_at      TIMESTAMPTZ,
  UNIQUE (user_id, kind, predicted_for, predicted_on)
);
CREATE INDEX IF NOT EXISTS idx_money_figure_scores_open ON public.money_figure_scores (user_id, predicted_for) WHERE scored_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_money_figure_scores_scored ON public.money_figure_scores (user_id, predicted_for DESC) WHERE scored_at IS NOT NULL;

-- RLS: owners read their own rows; the service role does the writing.
ALTER TABLE public.money_figure_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS money_figure_scores_select_own ON public.money_figure_scores;
CREATE POLICY money_figure_scores_select_own ON public.money_figure_scores FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS money_figure_scores_service_all ON public.money_figure_scores;
CREATE POLICY money_figure_scores_service_all ON public.money_figure_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
