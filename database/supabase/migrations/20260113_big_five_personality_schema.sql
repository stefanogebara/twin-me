-- Big Five Personality Assessment Schema
-- IPIP-NEO-120 implementation with T-score normalization
-- Created: 2026-01-13

-- ============================================
-- IPIP-NEO Questions Table
-- ============================================
CREATE TABLE IF NOT EXISTS ipip_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id VARCHAR(10) NOT NULL UNIQUE,
  domain CHAR(1) NOT NULL CHECK (domain IN ('O', 'C', 'E', 'A', 'N')),
  facet_number INTEGER NOT NULL CHECK (facet_number BETWEEN 1 AND 6),
  facet_name VARCHAR(50) NOT NULL,
  question_text TEXT NOT NULL,
  is_reverse_keyed BOOLEAN DEFAULT false,
  item_order INTEGER NOT NULL,
  version VARCHAR(10) DEFAULT '120',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for efficient question fetching
CREATE INDEX IF NOT EXISTS idx_ipip_questions_domain ON ipip_questions(domain);
CREATE INDEX IF NOT EXISTS idx_ipip_questions_version ON ipip_questions(version);

-- ============================================
-- Big Five Scores Table (with T-scores)
-- ============================================
CREATE TABLE IF NOT EXISTS big_five_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Raw scores (sum of responses, 4 items per facet, 24 items per domain)
  openness_raw INTEGER,
  conscientiousness_raw INTEGER,
  extraversion_raw INTEGER,
  agreeableness_raw INTEGER,
  neuroticism_raw INTEGER,

  -- T-Scores (normalized: mean=50, SD=10)
  openness_t DECIMAL(5,2) CHECK (openness_t >= 0 AND openness_t <= 100),
  conscientiousness_t DECIMAL(5,2) CHECK (conscientiousness_t >= 0 AND conscientiousness_t <= 100),
  extraversion_t DECIMAL(5,2) CHECK (extraversion_t >= 0 AND extraversion_t <= 100),
  agreeableness_t DECIMAL(5,2) CHECK (agreeableness_t >= 0 AND agreeableness_t <= 100),
  neuroticism_t DECIMAL(5,2) CHECK (neuroticism_t >= 0 AND neuroticism_t <= 100),

  -- Percentile ranks (0-100)
  openness_percentile INTEGER CHECK (openness_percentile >= 0 AND openness_percentile <= 100),
  conscientiousness_percentile INTEGER CHECK (conscientiousness_percentile >= 0 AND conscientiousness_percentile <= 100),
  extraversion_percentile INTEGER CHECK (extraversion_percentile >= 0 AND extraversion_percentile <= 100),
  agreeableness_percentile INTEGER CHECK (agreeableness_percentile >= 0 AND agreeableness_percentile <= 100),
  neuroticism_percentile INTEGER CHECK (neuroticism_percentile >= 0 AND neuroticism_percentile <= 100),

  -- Confidence intervals (based on data quality)
  openness_ci DECIMAL(5,2) DEFAULT 15,
  conscientiousness_ci DECIMAL(5,2) DEFAULT 15,
  extraversion_ci DECIMAL(5,2) DEFAULT 15,
  agreeableness_ci DECIMAL(5,2) DEFAULT 15,
  neuroticism_ci DECIMAL(5,2) DEFAULT 15,

  -- Metadata
  questionnaire_version VARCHAR(10) DEFAULT '120',
  questions_answered INTEGER DEFAULT 0,
  source_type TEXT DEFAULT 'questionnaire' CHECK (source_type IN ('questionnaire', 'behavioral', 'hybrid')),
  behavioral_weight DECIMAL(3,2) DEFAULT 0 CHECK (behavioral_weight >= 0 AND behavioral_weight <= 1),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_user_big_five UNIQUE(user_id)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_big_five_scores_user ON big_five_scores(user_id);

-- ============================================
-- Big Five Responses Table
-- ============================================
CREATE TABLE IF NOT EXISTS big_five_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id VARCHAR(10) NOT NULL,
  response_value INTEGER NOT NULL CHECK (response_value BETWEEN 1 AND 5),
  response_time_ms INTEGER,
  session_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_user_question_response UNIQUE(user_id, question_id)
);

-- Index for efficient response fetching
CREATE INDEX IF NOT EXISTS idx_big_five_responses_user ON big_five_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_big_five_responses_session ON big_five_responses(session_id);

-- ============================================
-- Facet Scores Table (30 facets)
-- ============================================
CREATE TABLE IF NOT EXISTS facet_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  domain CHAR(1) NOT NULL CHECK (domain IN ('O', 'C', 'E', 'A', 'N')),
  facet_number INTEGER NOT NULL CHECK (facet_number BETWEEN 1 AND 6),
  facet_name VARCHAR(50) NOT NULL,

  raw_score INTEGER,
  t_score DECIMAL(5,2),
  percentile INTEGER CHECK (percentile >= 0 AND percentile <= 100),
  confidence DECIMAL(5,2) DEFAULT 80,

  -- Behavioral evidence supporting this facet score
  behavioral_support JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_user_facet UNIQUE(user_id, domain, facet_number)
);

-- Index for facet lookups
CREATE INDEX IF NOT EXISTS idx_facet_scores_user ON facet_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_facet_scores_domain ON facet_scores(domain);

-- ============================================
-- Population Norms Table
-- ============================================
CREATE TABLE IF NOT EXISTS population_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain CHAR(1) NOT NULL CHECK (domain IN ('O', 'C', 'E', 'A', 'N')),
  facet_number INTEGER,  -- NULL for domain-level norms
  questionnaire_version VARCHAR(10) NOT NULL,

  mean DECIMAL(6,2) NOT NULL,
  std_dev DECIMAL(6,2) NOT NULL,
  sample_size INTEGER NOT NULL,

  -- Percentile lookup for non-normal distributions
  percentile_table JSONB,

  source VARCHAR(200),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_norm UNIQUE(domain, facet_number, questionnaire_version)
);

-- ============================================
-- Insert Population Norms (Johnson, 2014)
-- Based on N=619,150 internet sample
-- ============================================
INSERT INTO population_norms (domain, facet_number, questionnaire_version, mean, std_dev, sample_size, source)
VALUES
  -- Domain-level norms (IPIP-NEO-120)
  ('O', NULL, '120', 72.7, 12.8, 619150, 'Johnson (2014) - IPIP-NEO-120 Norms'),
  ('C', NULL, '120', 72.1, 13.4, 619150, 'Johnson (2014) - IPIP-NEO-120 Norms'),
  ('E', NULL, '120', 63.5, 14.7, 619150, 'Johnson (2014) - IPIP-NEO-120 Norms'),
  ('A', NULL, '120', 73.8, 12.0, 619150, 'Johnson (2014) - IPIP-NEO-120 Norms'),
  ('N', NULL, '120', 62.3, 15.1, 619150, 'Johnson (2014) - IPIP-NEO-120 Norms'),

  -- Openness facets
  ('O', 1, '120', 12.3, 3.2, 619150, 'Johnson (2014) - Imagination'),
  ('O', 2, '120', 11.8, 3.5, 619150, 'Johnson (2014) - Artistic Interests'),
  ('O', 3, '120', 12.5, 2.9, 619150, 'Johnson (2014) - Emotionality'),
  ('O', 4, '120', 11.2, 3.4, 619150, 'Johnson (2014) - Adventurousness'),
  ('O', 5, '120', 13.1, 2.8, 619150, 'Johnson (2014) - Intellect'),
  ('O', 6, '120', 11.8, 3.1, 619150, 'Johnson (2014) - Liberalism'),

  -- Conscientiousness facets
  ('C', 1, '120', 12.8, 2.9, 619150, 'Johnson (2014) - Self-Efficacy'),
  ('C', 2, '120', 11.5, 3.6, 619150, 'Johnson (2014) - Orderliness'),
  ('C', 3, '120', 13.2, 2.5, 619150, 'Johnson (2014) - Dutifulness'),
  ('C', 4, '120', 12.1, 3.1, 619150, 'Johnson (2014) - Achievement-Striving'),
  ('C', 5, '120', 10.8, 3.4, 619150, 'Johnson (2014) - Self-Discipline'),
  ('C', 6, '120', 11.7, 3.0, 619150, 'Johnson (2014) - Cautiousness'),

  -- Extraversion facets
  ('E', 1, '120', 11.2, 3.3, 619150, 'Johnson (2014) - Friendliness'),
  ('E', 2, '120', 9.8, 3.8, 619150, 'Johnson (2014) - Gregariousness'),
  ('E', 3, '120', 10.5, 3.5, 619150, 'Johnson (2014) - Assertiveness'),
  ('E', 4, '120', 10.9, 3.2, 619150, 'Johnson (2014) - Activity Level'),
  ('E', 5, '120', 10.2, 3.6, 619150, 'Johnson (2014) - Excitement-Seeking'),
  ('E', 6, '120', 10.9, 3.4, 619150, 'Johnson (2014) - Cheerfulness'),

  -- Agreeableness facets
  ('A', 1, '120', 11.8, 3.2, 619150, 'Johnson (2014) - Trust'),
  ('A', 2, '120', 13.5, 2.4, 619150, 'Johnson (2014) - Morality'),
  ('A', 3, '120', 12.8, 2.8, 619150, 'Johnson (2014) - Altruism'),
  ('A', 4, '120', 12.2, 2.9, 619150, 'Johnson (2014) - Cooperation'),
  ('A', 5, '120', 11.5, 3.1, 619150, 'Johnson (2014) - Modesty'),
  ('A', 6, '120', 12.0, 3.0, 619150, 'Johnson (2014) - Sympathy'),

  -- Neuroticism facets
  ('N', 1, '120', 10.8, 3.5, 619150, 'Johnson (2014) - Anxiety'),
  ('N', 2, '120', 9.5, 3.4, 619150, 'Johnson (2014) - Anger'),
  ('N', 3, '120', 10.2, 3.8, 619150, 'Johnson (2014) - Depression'),
  ('N', 4, '120', 10.9, 3.3, 619150, 'Johnson (2014) - Self-Consciousness'),
  ('N', 5, '120', 10.1, 3.2, 619150, 'Johnson (2014) - Immoderation'),
  ('N', 6, '120', 10.8, 3.4, 619150, 'Johnson (2014) - Vulnerability')
ON CONFLICT (domain, facet_number, questionnaire_version) DO NOTHING;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE big_five_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE big_five_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE facet_scores ENABLE ROW LEVEL SECURITY;

-- Users can only see their own scores
CREATE POLICY "Users can view own big_five_scores"
  ON big_five_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own big_five_scores"
  ON big_five_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own big_five_scores"
  ON big_five_scores FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only see their own responses
CREATE POLICY "Users can view own big_five_responses"
  ON big_five_responses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own big_five_responses"
  ON big_five_responses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only see their own facet scores
CREATE POLICY "Users can view own facet_scores"
  ON facet_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own facet_scores"
  ON facet_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own facet_scores"
  ON facet_scores FOR UPDATE
  USING (auth.uid() = user_id);

-- Questions and norms are public (read-only)
ALTER TABLE ipip_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE population_norms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ipip_questions"
  ON ipip_questions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can read population_norms"
  ON population_norms FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access to big_five_scores"
  ON big_five_scores FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to facet_scores"
  ON facet_scores FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- Update trigger for timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_big_five_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_big_five_scores_timestamp
  BEFORE UPDATE ON big_five_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_big_five_updated_at();

CREATE TRIGGER update_facet_scores_timestamp
  BEFORE UPDATE ON facet_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_big_five_updated_at();

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE ipip_questions IS 'IPIP-NEO personality assessment questions (public domain from ipip.ori.org)';
COMMENT ON TABLE big_five_scores IS 'User Big Five personality scores with T-score normalization';
COMMENT ON TABLE big_five_responses IS 'Individual question responses for Big Five assessment';
COMMENT ON TABLE facet_scores IS '30 facet-level scores (6 per domain) for detailed personality profile';
COMMENT ON TABLE population_norms IS 'Population normative data for T-score calculation (Johnson, 2014)';
