-- Salience + Voice layer ("The Editor") — replan-2026-06-13
-- Adds semantic-dedup support to proactive_insights so the Editor can reject
-- a candidate that means the same thing as something already surfaced (the
-- six-identical-email-nags problem that string dedup missed).
--
--   embedding   : 1536-d vector of the FINAL (voice-rewritten) insight text.
--   surfaced_at : when the insight was actually shown to the user (distinct
--                 from created_at — dedup compares against surfaced, not drafts).

ALTER TABLE proactive_insights ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE proactive_insights ADD COLUMN IF NOT EXISTS surfaced_at timestamptz;

-- Partial index: dedup only ever scans recently-surfaced rows that carry an
-- embedding. Keeps the lookup cheap as the table grows.
CREATE INDEX IF NOT EXISTS idx_proactive_insights_surfaced
  ON proactive_insights(user_id, surfaced_at DESC)
  WHERE embedding IS NOT NULL;

COMMENT ON COLUMN proactive_insights.embedding IS
  'Salience layer (2026-06-13): 1536-d embedding of the final voice-rewritten insight, for semantic dedup against future candidates.';
COMMENT ON COLUMN proactive_insights.surfaced_at IS
  'When the insight was actually shown to the user. Dedup window anchors on this, not created_at.';
