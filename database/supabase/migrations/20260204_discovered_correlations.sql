-- Discovered Correlations Table
-- Stores cross-platform patterns detected by the Correlation Engine
-- Inspired by X's Phoenix ranking system - learns from sequences
-- Created: 2026-02-04

-- ============================================
-- Discovered Correlations Table
-- ============================================
CREATE TABLE IF NOT EXISTS discovered_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Correlation classification
  correlation_type VARCHAR(100) NOT NULL,

  -- Trigger (cause) side
  trigger_platform VARCHAR(50) NOT NULL,
  trigger_event VARCHAR(200) NOT NULL,

  -- Outcome (effect) side
  outcome_platform VARCHAR(50) NOT NULL,
  outcome_metric VARCHAR(100) NOT NULL,
  outcome_effect VARCHAR(200),

  -- Statistical significance
  occurrences INTEGER NOT NULL DEFAULT 0,
  consistency DECIMAL(3,2) CHECK (consistency >= 0 AND consistency <= 1),
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),

  -- Evidence and description
  evidence JSONB,
  description TEXT,

  -- Timestamps
  first_detected TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_detected TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint for upserts
  CONSTRAINT unique_user_correlation UNIQUE(user_id, correlation_type, trigger_event, outcome_metric)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_correlations_user ON discovered_correlations(user_id);
CREATE INDEX IF NOT EXISTS idx_correlations_confidence ON discovered_correlations(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_correlations_type ON discovered_correlations(correlation_type);
CREATE INDEX IF NOT EXISTS idx_correlations_trigger_platform ON discovered_correlations(trigger_platform);
CREATE INDEX IF NOT EXISTS idx_correlations_outcome_platform ON discovered_correlations(outcome_platform);
CREATE INDEX IF NOT EXISTS idx_correlations_discovered ON discovered_correlations(discovered_at DESC);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE discovered_correlations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own correlations
CREATE POLICY "Users can view own discovered_correlations"
  ON discovered_correlations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own discovered_correlations"
  ON discovered_correlations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own discovered_correlations"
  ON discovered_correlations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own discovered_correlations"
  ON discovered_correlations FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "Service role full access to discovered_correlations"
  ON discovered_correlations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Update trigger for timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_discovered_correlations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_detected = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_discovered_correlations_last_detected
  BEFORE UPDATE ON discovered_correlations
  FOR EACH ROW
  EXECUTE FUNCTION update_discovered_correlations_timestamp();

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE discovered_correlations IS 'Cross-platform patterns detected by the Correlation Engine (X Phoenix-inspired)';
COMMENT ON COLUMN discovered_correlations.correlation_type IS 'Pattern category: activity_recovery, calendar_biometric, recovery_music, temporal';
COMMENT ON COLUMN discovered_correlations.trigger_platform IS 'Platform where the triggering event occurred (whoop, calendar, spotify)';
COMMENT ON COLUMN discovered_correlations.trigger_event IS 'The event or condition that triggers the correlation';
COMMENT ON COLUMN discovered_correlations.outcome_platform IS 'Platform where the outcome is measured';
COMMENT ON COLUMN discovered_correlations.outcome_metric IS 'The metric affected by the trigger';
COMMENT ON COLUMN discovered_correlations.occurrences IS 'Number of times this pattern has been observed';
COMMENT ON COLUMN discovered_correlations.consistency IS 'How consistently the pattern holds (0-1)';
COMMENT ON COLUMN discovered_correlations.confidence IS 'Overall confidence score (0-1)';
COMMENT ON COLUMN discovered_correlations.evidence IS 'Raw evidence data supporting this correlation';
