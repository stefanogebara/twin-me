-- ====================================================================
-- SOUL SIGNATURE PLATFORM - DATABASE SCHEMA
-- ====================================================================
-- Migration: 20250124_soul_signature_schema
-- Description: Core tables for Soul Signature Discovery Platform
-- Author: Claude AI
-- Date: 2025-01-24
--
-- This migration creates the database foundation for the Soul Signature
-- platform, which discovers authentic personality from cross-platform
-- behavioral data using Big Five (OCEAN) personality model.
-- ====================================================================

-- ====================================================================
-- TABLE: personality_scores
-- Purpose: Store Big Five personality dimensions (OCEAN model)
-- Data Source: Behavioral data from 30+ platforms + optional questionnaire
-- ====================================================================

CREATE TABLE IF NOT EXISTS personality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Big Five Dimensions (0-100 scale)
  openness DECIMAL(5,2) NOT NULL CHECK (openness >= 0 AND openness <= 100),
  conscientiousness DECIMAL(5,2) NOT NULL CHECK (conscientiousness >= 0 AND conscientiousness <= 100),
  extraversion DECIMAL(5,2) NOT NULL CHECK (extraversion >= 0 AND extraversion <= 100),
  agreeableness DECIMAL(5,2) NOT NULL CHECK (agreeableness >= 0 AND agreeableness <= 100),
  neuroticism DECIMAL(5,2) NOT NULL CHECK (neuroticism >= 0 AND neuroticism <= 100),

  -- Confidence scores (how certain we are about each dimension)
  openness_confidence DECIMAL(5,2) DEFAULT 0 CHECK (openness_confidence >= 0 AND openness_confidence <= 100),
  conscientiousness_confidence DECIMAL(5,2) DEFAULT 0 CHECK (conscientiousness_confidence >= 0 AND conscientiousness_confidence <= 100),
  extraversion_confidence DECIMAL(5,2) DEFAULT 0 CHECK (extraversion_confidence >= 0 AND extraversion_confidence <= 100),
  agreeableness_confidence DECIMAL(5,2) DEFAULT 0 CHECK (agreeableness_confidence >= 0 AND agreeableness_confidence <= 100),
  neuroticism_confidence DECIMAL(5,2) DEFAULT 0 CHECK (neuroticism_confidence >= 0 AND neuroticism_confidence <= 100),

  -- Data source tracking
  source_type TEXT NOT NULL CHECK (source_type IN ('behavioral', 'questionnaire', 'hybrid')),
  questionnaire_version TEXT, -- e.g., "NEO-FFI-60", "IPIP-50"

  -- Statistical metadata
  sample_size INTEGER DEFAULT 0, -- Number of behavioral data points analyzed
  analyzed_platforms TEXT[], -- e.g., ['spotify', 'netflix', 'calendar']

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_personality UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX idx_personality_scores_user_id ON personality_scores(user_id);
CREATE INDEX idx_personality_scores_source_type ON personality_scores(source_type);
CREATE INDEX idx_personality_scores_updated_at ON personality_scores(updated_at);

-- Row Level Security
ALTER TABLE personality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own personality scores"
  ON personality_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own personality scores"
  ON personality_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own personality scores"
  ON personality_scores FOR UPDATE
  USING (auth.uid() = user_id);

-- ====================================================================
-- TABLE: soul_signatures
-- Purpose: Store unique personality archetypes and narratives
-- Data Source: Generated from personality_scores + unique_patterns
-- ====================================================================

CREATE TABLE IF NOT EXISTS soul_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Archetype naming (e.g., "The Curious Introvert", "The Social Explorer")
  archetype_name TEXT NOT NULL,
  archetype_subtitle TEXT, -- Optional tagline

  -- Narrative description (AI-generated personality summary)
  narrative TEXT NOT NULL,

  -- Key traits (top 3-5 defining characteristics)
  defining_traits JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"trait": "High curiosity", "score": 92, "evidence": "Explores 40+ YouTube creators monthly"},
  --   {"trait": "Introspective", "score": 85, "evidence": "Prefers reflective content before important events"}
  -- ]

  -- Personality dimensions reference
  personality_score_id UUID REFERENCES personality_scores(id) ON DELETE SET NULL,

  -- Visual representation
  color_scheme JSONB, -- Brand colors for this archetype
  icon_type TEXT, -- Icon representing the archetype

  -- Privacy settings
  is_public BOOLEAN DEFAULT false,
  reveal_level INTEGER DEFAULT 50 CHECK (reveal_level >= 0 AND reveal_level <= 100),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_soul_signature UNIQUE(user_id)
);

-- Indexes
CREATE INDEX idx_soul_signatures_user_id ON soul_signatures(user_id);
CREATE INDEX idx_soul_signatures_archetype_name ON soul_signatures(archetype_name);
CREATE INDEX idx_soul_signatures_is_public ON soul_signatures(is_public);

-- Row Level Security
ALTER TABLE soul_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own soul signatures"
  ON soul_signatures FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert their own soul signatures"
  ON soul_signatures FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own soul signatures"
  ON soul_signatures FOR UPDATE
  USING (auth.uid() = user_id);

-- ====================================================================
-- TABLE: behavioral_features
-- Purpose: Store extracted features from platform data
-- Data Source: Platform-specific extractors (Spotify, Netflix, Calendar, etc.)
-- ====================================================================

CREATE TABLE IF NOT EXISTS behavioral_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Platform identification
  platform TEXT NOT NULL, -- 'spotify', 'netflix', 'calendar', etc.
  feature_type TEXT NOT NULL, -- 'discovery_rate', 'genre_diversity', 'social_density', etc.

  -- Feature value
  feature_value DECIMAL(10,4) NOT NULL,
  normalized_value DECIMAL(5,4) CHECK (normalized_value >= 0 AND normalized_value <= 1),

  -- Statistical metadata
  confidence_score DECIMAL(5,2) DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  sample_size INTEGER DEFAULT 0,

  -- Personality dimension contribution
  contributes_to TEXT, -- 'openness', 'conscientiousness', etc.
  contribution_weight DECIMAL(5,4) DEFAULT 0, -- How much this feature influences the dimension

  -- Evidence and context
  evidence JSONB, -- Raw data supporting this feature
  -- Example: {
  --   "spotify_new_artists_per_month": 12,
  --   "genre_count": 15,
  --   "time_range": "last_90_days"
  -- }

  -- Timestamps
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_platform_feature UNIQUE(user_id, platform, feature_type)
);

-- Indexes
CREATE INDEX idx_behavioral_features_user_id ON behavioral_features(user_id);
CREATE INDEX idx_behavioral_features_platform ON behavioral_features(platform);
CREATE INDEX idx_behavioral_features_feature_type ON behavioral_features(feature_type);
CREATE INDEX idx_behavioral_features_contributes_to ON behavioral_features(contributes_to);

-- Row Level Security
ALTER TABLE behavioral_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own behavioral features"
  ON behavioral_features FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own behavioral features"
  ON behavioral_features FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own behavioral features"
  ON behavioral_features FOR UPDATE
  USING (auth.uid() = user_id);

-- ====================================================================
-- TABLE: unique_patterns
-- Purpose: Store rare/distinctive behaviors (top/bottom 5% behaviors)
-- Data Source: Statistical analysis of behavioral_features across user population
-- ====================================================================

CREATE TABLE IF NOT EXISTS unique_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Pattern identification
  pattern_type TEXT NOT NULL, -- 'outlier_high', 'outlier_low', 'rare_combination'
  pattern_name TEXT NOT NULL, -- Human-readable name

  -- Pattern description
  description TEXT NOT NULL,
  -- Example: "You're in the top 2% of users who discover new music creators monthly"

  -- Statistical context
  user_value DECIMAL(10,4) NOT NULL,
  population_percentile DECIMAL(5,2) CHECK (population_percentile >= 0 AND population_percentile <= 100),
  population_mean DECIMAL(10,4),
  population_stddev DECIMAL(10,4),

  -- Cross-platform pattern (if applicable)
  platforms TEXT[], -- Multiple platforms involved in this pattern
  behavioral_feature_ids UUID[], -- References to behavioral_features

  -- Importance
  uniqueness_score DECIMAL(5,2) DEFAULT 0 CHECK (uniqueness_score >= 0 AND uniqueness_score <= 100),
  is_defining BOOLEAN DEFAULT false, -- Is this a top-3 defining pattern?

  -- Evidence
  evidence JSONB,
  -- Example: {
  --   "spotify_discovery_rate": 40.5,
  --   "population_avg": 8.2,
  --   "percentile": 98.5
  -- }

  -- Timestamps
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_unique_patterns_user_id ON unique_patterns(user_id);
CREATE INDEX idx_unique_patterns_pattern_type ON unique_patterns(pattern_type);
CREATE INDEX idx_unique_patterns_is_defining ON unique_patterns(is_defining);
CREATE INDEX idx_unique_patterns_uniqueness_score ON unique_patterns(uniqueness_score DESC);

-- Row Level Security
ALTER TABLE unique_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own unique patterns"
  ON unique_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own unique patterns"
  ON unique_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own unique patterns"
  ON unique_patterns FOR UPDATE
  USING (auth.uid() = user_id);

-- ====================================================================
-- TABLE: privacy_settings
-- Purpose: Granular privacy controls for personality traits and patterns
-- Data Source: User-controlled privacy spectrum dashboard
-- ====================================================================

CREATE TABLE IF NOT EXISTS privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Global privacy level
  global_reveal_level INTEGER DEFAULT 50 CHECK (global_reveal_level >= 0 AND global_reveal_level <= 100),

  -- Personality dimension-specific controls (0-100 intensity)
  openness_reveal INTEGER DEFAULT 50 CHECK (openness_reveal >= 0 AND openness_reveal <= 100),
  conscientiousness_reveal INTEGER DEFAULT 50 CHECK (conscientiousness_reveal >= 0 AND conscientiousness_reveal <= 100),
  extraversion_reveal INTEGER DEFAULT 50 CHECK (extraversion_reveal >= 0 AND extraversion_reveal <= 100),
  agreeableness_reveal INTEGER DEFAULT 50 CHECK (agreeableness_reveal >= 0 AND agreeableness_reveal <= 100),
  neuroticism_reveal INTEGER DEFAULT 50 CHECK (neuroticism_reveal >= 0 AND neuroticism_reveal <= 100),

  -- Life cluster controls
  personal_clusters_reveal INTEGER DEFAULT 50 CHECK (personal_clusters_reveal >= 0 AND personal_clusters_reveal <= 100),
  professional_clusters_reveal INTEGER DEFAULT 50 CHECK (professional_clusters_reveal >= 0 AND professional_clusters_reveal <= 100),
  creative_clusters_reveal INTEGER DEFAULT 50 CHECK (creative_clusters_reveal >= 0 AND creative_clusters_reveal <= 100),

  -- Platform-specific controls
  platform_overrides JSONB DEFAULT '{}'::jsonb,
  -- Example: {
  --   "spotify": {"reveal_level": 80, "hide_genres": ["guilty-pleasure"]},
  --   "netflix": {"reveal_level": 30, "hide_series": true}
  -- }

  -- Audience-specific settings
  audience_profiles JSONB DEFAULT '[]'::jsonb,
  -- Example: [
  --   {"audience": "professional", "reveal_level": 30, "hide_clusters": ["entertainment"]},
  --   {"audience": "dating", "reveal_level": 70, "show_clusters": ["personal", "creative"]}
  -- ]

  -- Feature-specific hiding
  hidden_patterns UUID[], -- Array of unique_patterns.id to hide
  hidden_features UUID[], -- Array of behavioral_features.id to hide

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_user_privacy_settings UNIQUE(user_id)
);

-- Indexes
CREATE INDEX idx_privacy_settings_user_id ON privacy_settings(user_id);

-- Row Level Security
ALTER TABLE privacy_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own privacy settings"
  ON privacy_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own privacy settings"
  ON privacy_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own privacy settings"
  ON privacy_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- ====================================================================
-- TRIGGERS: Auto-update timestamps
-- ====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_personality_scores_updated_at
  BEFORE UPDATE ON personality_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_soul_signatures_updated_at
  BEFORE UPDATE ON soul_signatures
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_behavioral_features_updated_at
  BEFORE UPDATE ON behavioral_features
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_unique_patterns_updated_at
  BEFORE UPDATE ON unique_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_privacy_settings_updated_at
  BEFORE UPDATE ON privacy_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- VIEWS: Convenient queries for common use cases
-- ====================================================================

-- View: Complete soul signature profile (all data in one query)
CREATE OR REPLACE VIEW soul_signature_profiles AS
SELECT
  u.id AS user_id,
  u.email,
  u.full_name,
  ss.archetype_name,
  ss.archetype_subtitle,
  ss.narrative,
  ss.defining_traits,
  ps.openness,
  ps.conscientiousness,
  ps.extraversion,
  ps.agreeableness,
  ps.neuroticism,
  ps.openness_confidence,
  ps.conscientiousness_confidence,
  ps.extraversion_confidence,
  ps.agreeableness_confidence,
  ps.neuroticism_confidence,
  ps.source_type,
  ps.analyzed_platforms,
  ps.sample_size,
  priv.global_reveal_level,
  priv.openness_reveal,
  priv.conscientiousness_reveal,
  priv.extraversion_reveal,
  priv.agreeableness_reveal,
  priv.neuroticism_reveal,
  ss.is_public,
  ss.created_at AS soul_signature_created_at,
  ps.updated_at AS personality_last_updated
FROM users u
LEFT JOIN soul_signatures ss ON u.id = ss.user_id
LEFT JOIN personality_scores ps ON u.id = ps.user_id
LEFT JOIN privacy_settings priv ON u.id = priv.user_id;

-- View: Top defining patterns per user
CREATE OR REPLACE VIEW top_defining_patterns AS
SELECT
  user_id,
  pattern_name,
  description,
  user_value,
  population_percentile,
  uniqueness_score,
  platforms,
  evidence
FROM unique_patterns
WHERE is_defining = true
ORDER BY user_id, uniqueness_score DESC;

-- ====================================================================
-- FUNCTIONS: Helper functions for Soul Signature generation
-- ====================================================================

-- Function: Calculate overall soul signature confidence
CREATE OR REPLACE FUNCTION calculate_soul_signature_confidence(p_user_id UUID)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  avg_confidence DECIMAL(5,2);
BEGIN
  SELECT
    (openness_confidence + conscientiousness_confidence + extraversion_confidence +
     agreeableness_confidence + neuroticism_confidence) / 5.0
  INTO avg_confidence
  FROM personality_scores
  WHERE user_id = p_user_id;

  RETURN COALESCE(avg_confidence, 0);
END;
$$ LANGUAGE plpgsql;

-- Function: Get personality dimension label with confidence
CREATE OR REPLACE FUNCTION get_dimension_label(
  p_score DECIMAL(5,2),
  p_confidence DECIMAL(5,2),
  p_dimension_name TEXT
)
RETURNS TEXT AS $$
BEGIN
  CASE
    WHEN p_confidence < 50 THEN
      RETURN p_dimension_name || ': Uncertain (' || p_score || '%)';
    WHEN p_score >= 70 THEN
      RETURN 'High ' || p_dimension_name || ' (' || p_score || '%)';
    WHEN p_score <= 30 THEN
      RETURN 'Low ' || p_dimension_name || ' (' || p_score || '%)';
    ELSE
      RETURN 'Moderate ' || p_dimension_name || ' (' || p_score || '%)';
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- COMMENTS: Documentation for future developers
-- ====================================================================

COMMENT ON TABLE personality_scores IS 'Stores Big Five (OCEAN) personality dimensions derived from behavioral data and/or questionnaires. Scores range from 0-100 with confidence metrics for each dimension.';
COMMENT ON TABLE soul_signatures IS 'Unique personality archetypes and AI-generated narratives that represent the user''s authentic soul signature.';
COMMENT ON TABLE behavioral_features IS 'Platform-specific behavioral features extracted from user data (e.g., Spotify discovery rate, Netflix binge patterns).';
COMMENT ON TABLE unique_patterns IS 'Rare or distinctive behaviors that make the user unique (top/bottom 5% of population).';
COMMENT ON TABLE privacy_settings IS 'Granular privacy controls allowing users to adjust revelation intensity (0-100%) for each personality trait and life cluster.';

-- ====================================================================
-- MIGRATION COMPLETE
-- ====================================================================

-- Verify tables were created
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('personality_scores', 'soul_signatures', 'behavioral_features', 'unique_patterns', 'privacy_settings');

  IF table_count = 5 THEN
    RAISE NOTICE '✅ Soul Signature schema migration completed successfully. Created 5 tables.';
  ELSE
    RAISE WARNING '⚠️ Migration incomplete. Expected 5 tables, found %', table_count;
  END IF;
END $$;
