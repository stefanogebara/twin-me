-- Add metadata JSONB column to proactive_insights.
-- Used by inbox intelligence to store structured email data (summaries, drafts, scores)
-- alongside the plain-text WhatsApp-ready message stored in the insight column.
ALTER TABLE proactive_insights
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
