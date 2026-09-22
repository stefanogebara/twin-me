-- Presence: autonomy calibration (read from Instinct's profile, 2026-09-21)
-- ========================================================================
-- Two decisions the presence makes on its own, and families do not agree on:
-- how much of a call reaches them afterwards, and whether the presence asks
-- her about a worry she raised last time or waits for her to bring it up.
--
-- They live on the presence row, not in presence_facts: there is exactly one
-- of each per presence, the row is already loaded everywhere the brief and the
-- summarizer run, and a fact list cannot say "this is the current value".
-- The defaults are the behaviour that shipped before this migration.

ALTER TABLE presences
  ADD COLUMN IF NOT EXISTS autonomy_escalation TEXT NOT NULL DEFAULT 'when_it_matters'
    CHECK (autonomy_escalation IN ('everything', 'when_it_matters', 'only_urgent')),
  ADD COLUMN IF NOT EXISTS autonomy_initiative TEXT NOT NULL DEFAULT 'wait'
    CHECK (autonomy_initiative IN ('ask', 'wait'));
