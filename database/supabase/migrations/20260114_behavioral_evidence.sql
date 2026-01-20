-- Behavioral Evidence Table
-- Stores evidence for personality inferences from behavioral data
-- Based on research from Anderson et al. (2021), Stachl et al. (2020), Zufferey et al. (2023)
-- Created: 2026-01-14

-- ============================================
-- Behavioral Evidence Table
-- ============================================
CREATE TABLE IF NOT EXISTS behavioral_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Evidence source
  platform VARCHAR(50) NOT NULL,
  feature_name VARCHAR(100) NOT NULL,

  -- Feature value and raw data
  feature_value DECIMAL(5,4) NOT NULL CHECK (feature_value >= 0 AND feature_value <= 1),
  raw_value JSONB,

  -- Personality dimension and correlation
  dimension CHAR(1) NOT NULL CHECK (dimension IN ('O', 'C', 'E', 'A', 'N')),
  correlation_strength DECIMAL(4,3) CHECK (correlation_strength >= -1 AND correlation_strength <= 1),
  confidence_score DECIMAL(4,3) CHECK (confidence_score >= 0 AND confidence_score <= 1),

  -- Human-readable evidence
  evidence_description TEXT,
  research_citation TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint for upserts
  CONSTRAINT unique_user_evidence UNIQUE(user_id, platform, feature_name, dimension)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_behavioral_evidence_user ON behavioral_evidence(user_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_evidence_dimension ON behavioral_evidence(dimension);
CREATE INDEX IF NOT EXISTS idx_behavioral_evidence_platform ON behavioral_evidence(platform);
CREATE INDEX IF NOT EXISTS idx_behavioral_evidence_correlation ON behavioral_evidence(correlation_strength DESC);

-- ============================================
-- Behavioral Trait Correlations Table
-- Stores learned/validated correlations between behavioral features and personality traits
-- ============================================
CREATE TABLE IF NOT EXISTS behavioral_trait_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  platform VARCHAR(50) NOT NULL,
  feature_name VARCHAR(100) NOT NULL,
  dimension CHAR(1) NOT NULL CHECK (dimension IN ('O', 'C', 'E', 'A', 'N')),

  -- Correlation data
  correlation_coefficient DECIMAL(4,3) NOT NULL CHECK (correlation_coefficient >= -1 AND correlation_coefficient <= 1),
  sample_size INTEGER DEFAULT 0,
  confidence_level DECIMAL(4,3) DEFAULT 0.5 CHECK (confidence_level >= 0 AND confidence_level <= 1),

  -- Research backing
  research_citation TEXT,
  effect_size VARCHAR(10) CHECK (effect_size IN ('small', 'medium', 'large')),
  validated BOOLEAN DEFAULT false,

  -- Metadata
  last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint
  CONSTRAINT unique_correlation UNIQUE(platform, feature_name, dimension)
);

-- Index for correlation lookups
CREATE INDEX IF NOT EXISTS idx_trait_correlations_platform ON behavioral_trait_correlations(platform);
CREATE INDEX IF NOT EXISTS idx_trait_correlations_feature ON behavioral_trait_correlations(feature_name);
CREATE INDEX IF NOT EXISTS idx_trait_correlations_validated ON behavioral_trait_correlations(validated);

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE behavioral_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_trait_correlations ENABLE ROW LEVEL SECURITY;

-- Users can only see their own evidence
CREATE POLICY "Users can view own behavioral_evidence"
  ON behavioral_evidence FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own behavioral_evidence"
  ON behavioral_evidence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own behavioral_evidence"
  ON behavioral_evidence FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own behavioral_evidence"
  ON behavioral_evidence FOR DELETE
  USING (auth.uid() = user_id);

-- Correlations are public read-only (research data)
CREATE POLICY "Anyone can read behavioral_trait_correlations"
  ON behavioral_trait_correlations FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access to behavioral_evidence"
  ON behavioral_evidence FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to behavioral_trait_correlations"
  ON behavioral_trait_correlations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Update trigger for timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_behavioral_evidence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_behavioral_evidence_timestamp
  BEFORE UPDATE ON behavioral_evidence
  FOR EACH ROW
  EXECUTE FUNCTION update_behavioral_evidence_updated_at();

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE behavioral_evidence IS 'Evidence for personality inferences from behavioral data (Spotify, Calendar, Whoop)';
COMMENT ON TABLE behavioral_trait_correlations IS 'Research-backed correlations between behavioral features and personality traits';
COMMENT ON COLUMN behavioral_evidence.feature_value IS 'Normalized feature value (0-1 scale)';
COMMENT ON COLUMN behavioral_evidence.raw_value IS 'Original measurement data for evidence description';
COMMENT ON COLUMN behavioral_evidence.dimension IS 'Big Five dimension: O=Openness, C=Conscientiousness, E=Extraversion, A=Agreeableness, N=Neuroticism';
COMMENT ON COLUMN behavioral_trait_correlations.effect_size IS 'Effect size classification: small (r<0.30), medium (0.30-0.49), large (>=0.50)';
