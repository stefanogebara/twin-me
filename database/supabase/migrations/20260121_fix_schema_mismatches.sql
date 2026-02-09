-- ====================================================================
-- MIGRATION: Fix Schema Mismatches
-- ====================================================================
-- Migration: 20260121_fix_schema_mismatches
-- Description: Add missing columns that code expects but schema doesn't have
-- Date: 2026-01-21
-- ====================================================================

-- ====================================================================
-- 1. Add calculated_at to personality_scores
-- The code (twinEvolutionService.js) expects calculated_at but schema has updated_at
-- ====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'personality_scores' AND column_name = 'calculated_at'
  ) THEN
    ALTER TABLE personality_scores ADD COLUMN calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    -- Copy existing updated_at values to calculated_at
    UPDATE personality_scores SET calculated_at = COALESCE(updated_at, created_at, NOW());
    RAISE NOTICE '✅ Added calculated_at column to personality_scores';
  ELSE
    RAISE NOTICE '⏭️ calculated_at already exists in personality_scores';
  END IF;
END $$;

-- Create index for calculated_at
CREATE INDEX IF NOT EXISTS idx_personality_scores_calculated_at ON personality_scores(calculated_at);

-- ====================================================================
-- 2. Add confidence_score to unique_patterns
-- The code expects confidence_score but schema has uniqueness_score
-- ====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unique_patterns' AND column_name = 'confidence_score'
  ) THEN
    ALTER TABLE unique_patterns ADD COLUMN confidence_score DECIMAL(5,2) DEFAULT 0
      CHECK (confidence_score >= 0 AND confidence_score <= 100);
    -- Copy uniqueness_score values to confidence_score
    UPDATE unique_patterns SET confidence_score = COALESCE(uniqueness_score, 0);
    RAISE NOTICE '✅ Added confidence_score column to unique_patterns';
  ELSE
    RAISE NOTICE '⏭️ confidence_score already exists in unique_patterns';
  END IF;
END $$;

-- ====================================================================
-- 3. Create twin_evolution_log table
-- Used by twinEvolutionService.js to track personality evolution
-- ====================================================================
CREATE TABLE IF NOT EXISTS twin_evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB,
  personality_snapshot JSONB,
  trigger_source TEXT, -- 'platform_sync', 'assessment', 'manual'
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for twin_evolution_log
CREATE INDEX IF NOT EXISTS idx_twin_evolution_log_user_id ON twin_evolution_log(user_id);
CREATE INDEX IF NOT EXISTS idx_twin_evolution_log_recorded_at ON twin_evolution_log(recorded_at);
CREATE INDEX IF NOT EXISTS idx_twin_evolution_log_event_type ON twin_evolution_log(event_type);

-- RLS for twin_evolution_log
ALTER TABLE twin_evolution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own twin_evolution_log" ON twin_evolution_log;
CREATE POLICY "Users can view own twin_evolution_log"
  ON twin_evolution_log FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to twin_evolution_log" ON twin_evolution_log;
CREATE POLICY "Service role full access to twin_evolution_log"
  ON twin_evolution_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ====================================================================
-- 4. Create soul_data table
-- Used for storing extracted soul insights
-- ====================================================================
CREATE TABLE IF NOT EXISTS soul_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL,
  platform TEXT,
  data JSONB,
  metadata JSONB,
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for soul_data
CREATE INDEX IF NOT EXISTS idx_soul_data_user_id ON soul_data(user_id);
CREATE INDEX IF NOT EXISTS idx_soul_data_extracted_at ON soul_data(extracted_at);
CREATE INDEX IF NOT EXISTS idx_soul_data_data_type ON soul_data(data_type);
CREATE INDEX IF NOT EXISTS idx_soul_data_platform ON soul_data(platform);

-- RLS for soul_data
ALTER TABLE soul_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own soul_data" ON soul_data;
CREATE POLICY "Users can view own soul_data"
  ON soul_data FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to soul_data" ON soul_data;
CREATE POLICY "Service role full access to soul_data"
  ON soul_data FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ====================================================================
-- 5. Fix data_extraction_jobs table
-- Add default for job_type to prevent null constraint violations
-- ====================================================================
DO $$
BEGIN
  -- Add default value to job_type if it doesn't have one
  ALTER TABLE data_extraction_jobs ALTER COLUMN job_type SET DEFAULT 'extraction';
  RAISE NOTICE '✅ Set default for job_type in data_extraction_jobs';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE '⏭️ data_extraction_jobs table does not exist, skipping';
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Could not alter data_extraction_jobs: %', SQLERRM;
END $$;

-- ====================================================================
-- MIGRATION COMPLETE
-- ====================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Schema mismatch fixes migration completed';
END $$;
