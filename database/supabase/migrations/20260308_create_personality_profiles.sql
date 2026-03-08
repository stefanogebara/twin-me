-- Soul Signature Voting Layer: user_personality_profiles
-- Stores OCEAN Big Five, stylometric fingerprint, derived sampling params,
-- and personality embedding centroid for twin response shaping.

CREATE TABLE IF NOT EXISTS user_personality_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- OCEAN Big Five scores (0.0 - 1.0)
  openness REAL DEFAULT 0.5,
  conscientiousness REAL DEFAULT 0.5,
  extraversion REAL DEFAULT 0.5,
  agreeableness REAL DEFAULT 0.5,
  neuroticism REAL DEFAULT 0.5,

  -- Stylometric fingerprint
  avg_sentence_length REAL,
  vocabulary_richness REAL,       -- type-token ratio
  formality_score REAL,           -- 0 = very casual, 1 = very formal
  emotional_expressiveness REAL,  -- exclamations, caps, intensifiers
  humor_markers REAL,             -- humor frequency
  punctuation_style JSONB DEFAULT '{}',  -- distribution of !, ?, ..., etc.

  -- Derived LLM sampling parameters
  temperature REAL DEFAULT 0.7,
  top_p REAL DEFAULT 0.9,
  frequency_penalty REAL DEFAULT 0.0,
  presence_penalty REAL DEFAULT 0.0,

  -- Personality embedding centroid (weighted avg of memory embeddings)
  personality_embedding vector(1536),

  -- Metadata
  memory_count_at_build INT DEFAULT 0,
  confidence REAL DEFAULT 0.0,    -- 0.0-1.0
  last_built_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_personality_user UNIQUE (user_id)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_personality_user_id ON user_personality_profiles(user_id);

-- RLS
ALTER TABLE user_personality_profiles ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on personality_profiles"
  ON user_personality_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can read their own profile
CREATE POLICY "Users can read own personality profile"
  ON user_personality_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
