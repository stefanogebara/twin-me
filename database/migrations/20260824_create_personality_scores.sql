-- Create personality_scores — the table the code has queried all along but
-- prod never had.
--
-- Context (prod logs 2026-08-24): PostgREST answered "Could not find the
-- table 'public.personality_scores' in the schema cache" on every context
-- warmup. The only CREATE TABLE for it lives in the archive tree
-- (database/supabase/migrations/20250124_soul_signature_schema.sql), which
-- predates the current Supabase project and was evidently never applied to
-- it. Readers: soul-signature.js, twin-portrait.js, portfolio-public.js,
-- account.js (GDPR export), twinContextBuilder.js, twinEvolutionService.js,
-- reflectionEngine.js (snapshots). Writers: behavioralEvidencePipeline.js,
-- the brain agents' calculate_personality_scores tool.
--
-- Note: userContextAggregator.getPersonalityProfile no longer reads this
-- table (it now falls back to user_personality_profiles); this migration
-- exists for the remaining legacy readers/writers above, which all handle an
-- empty table gracefully but not a missing one.
--
-- Definition copied from the archive file, adjusted to repo rules:
-- public.users(id) FK, idempotency guards throughout.

CREATE TABLE IF NOT EXISTS personality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Big Five dimensions (0-100 scale)
  openness DECIMAL(5,2) NOT NULL CHECK (openness >= 0 AND openness <= 100),
  conscientiousness DECIMAL(5,2) NOT NULL CHECK (conscientiousness >= 0 AND conscientiousness <= 100),
  extraversion DECIMAL(5,2) NOT NULL CHECK (extraversion >= 0 AND extraversion <= 100),
  agreeableness DECIMAL(5,2) NOT NULL CHECK (agreeableness >= 0 AND agreeableness <= 100),
  neuroticism DECIMAL(5,2) NOT NULL CHECK (neuroticism >= 0 AND neuroticism <= 100),

  -- Confidence per dimension (0-100)
  openness_confidence DECIMAL(5,2) DEFAULT 0 CHECK (openness_confidence >= 0 AND openness_confidence <= 100),
  conscientiousness_confidence DECIMAL(5,2) DEFAULT 0 CHECK (conscientiousness_confidence >= 0 AND conscientiousness_confidence <= 100),
  extraversion_confidence DECIMAL(5,2) DEFAULT 0 CHECK (extraversion_confidence >= 0 AND extraversion_confidence <= 100),
  agreeableness_confidence DECIMAL(5,2) DEFAULT 0 CHECK (agreeableness_confidence >= 0 AND agreeableness_confidence <= 100),
  neuroticism_confidence DECIMAL(5,2) DEFAULT 0 CHECK (neuroticism_confidence >= 0 AND neuroticism_confidence <= 100),

  -- Data source tracking
  source_type TEXT NOT NULL CHECK (source_type IN ('behavioral', 'questionnaire', 'hybrid')),
  questionnaire_version TEXT,

  -- Statistical metadata
  sample_size INTEGER DEFAULT 0,
  analyzed_platforms TEXT[],

  -- calculated_at was added to the archive definition by
  -- 20260121_fix_schema_mismatches.sql; folded in here.
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_personality UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_personality_scores_user_id ON personality_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_personality_scores_updated_at ON personality_scores(updated_at);

ALTER TABLE personality_scores ENABLE ROW LEVEL SECURITY;

-- Custom JWT auth: auth.uid() is NULL in this app, so no user-facing
-- policies — only the service role touches this table.
DO $$
BEGIN
  CREATE POLICY "Service role full access on personality_scores"
    ON personality_scores
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Refresh PostgREST's schema cache so the API sees the new table.
NOTIFY pgrst, 'reload schema';
