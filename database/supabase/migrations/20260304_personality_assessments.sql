-- Weekly personality evaluation results (InCharacter-inspired)
-- Tracks Big Five + 16 Personalities factors over time to detect personality drift

CREATE TABLE IF NOT EXISTS personality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assessment_type VARCHAR(20) NOT NULL DEFAULT 'weekly', -- 'weekly' | 'manual'
  scores JSONB NOT NULL, -- { big_five: { openness: {score, confidence, evidence}, ... }, mbti: { ... } }
  summary TEXT, -- LLM-generated summary of personality portrait
  memory_count INT, -- how many memories were analyzed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate assessments in the same week
  CONSTRAINT unique_weekly_assessment UNIQUE (user_id, assessment_type, (date_trunc('week', created_at)))
);

CREATE INDEX IF NOT EXISTS idx_personality_assessments_user ON personality_assessments(user_id, created_at DESC);
