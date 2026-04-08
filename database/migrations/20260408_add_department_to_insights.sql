-- Add department column to proactive_insights for cross-department pattern tagging.
-- Department is optional (NULL for non-department insights).
-- Valid values: communications, scheduling, health, content, finance, research, social.

ALTER TABLE proactive_insights ADD COLUMN IF NOT EXISTS department TEXT;

-- Index for querying insights by department (sparse — only non-null rows)
CREATE INDEX IF NOT EXISTS idx_proactive_insights_department
  ON proactive_insights(user_id, department)
  WHERE department IS NOT NULL;
