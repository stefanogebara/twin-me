-- ============================================
-- Moltbot Extraction Jobs Tables
-- Tracks scheduled extraction agents and their execution history
-- NOTE: Using 'moltbot_' prefix to avoid conflict with existing extraction_jobs table
-- ============================================

-- Moltbot extraction jobs configuration
CREATE TABLE IF NOT EXISTS moltbot_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Job identification
  job_name TEXT NOT NULL,
  platform TEXT NOT NULL,

  -- Schedule configuration
  schedule TEXT NOT NULL, -- Cron expression
  action JSONB NOT NULL,  -- Action payload

  -- State
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  run_count INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, job_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_moltbot_jobs_user ON moltbot_extraction_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_moltbot_jobs_enabled ON moltbot_extraction_jobs(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_moltbot_jobs_platform ON moltbot_extraction_jobs(platform);

-- Moltbot job execution history
CREATE TABLE IF NOT EXISTS moltbot_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Execution details
  platform TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  result JSONB,
  error_message TEXT,

  -- Performance metrics
  duration_ms INT,
  records_extracted INT,

  -- Timestamps
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_moltbot_runs_user_platform ON moltbot_job_runs(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_moltbot_runs_executed_at ON moltbot_job_runs(executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_moltbot_runs_status ON moltbot_job_runs(status);

-- Enable Row Level Security
ALTER TABLE moltbot_extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE moltbot_job_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for moltbot_extraction_jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moltbot_extraction_jobs' AND policyname = 'moltbot_jobs_select_own'
  ) THEN
    CREATE POLICY moltbot_jobs_select_own ON moltbot_extraction_jobs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moltbot_extraction_jobs' AND policyname = 'moltbot_jobs_insert_own'
  ) THEN
    CREATE POLICY moltbot_jobs_insert_own ON moltbot_extraction_jobs
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moltbot_extraction_jobs' AND policyname = 'moltbot_jobs_update_own'
  ) THEN
    CREATE POLICY moltbot_jobs_update_own ON moltbot_extraction_jobs
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moltbot_extraction_jobs' AND policyname = 'moltbot_jobs_delete_own'
  ) THEN
    CREATE POLICY moltbot_jobs_delete_own ON moltbot_extraction_jobs
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- RLS Policies for moltbot_job_runs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moltbot_job_runs' AND policyname = 'moltbot_runs_select_own'
  ) THEN
    CREATE POLICY moltbot_runs_select_own ON moltbot_job_runs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moltbot_job_runs' AND policyname = 'moltbot_runs_insert_own'
  ) THEN
    CREATE POLICY moltbot_runs_insert_own ON moltbot_job_runs
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Service role bypass for backend operations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moltbot_extraction_jobs' AND policyname = 'moltbot_jobs_service_all'
  ) THEN
    CREATE POLICY moltbot_jobs_service_all ON moltbot_extraction_jobs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moltbot_job_runs' AND policyname = 'moltbot_runs_service_all'
  ) THEN
    CREATE POLICY moltbot_runs_service_all ON moltbot_job_runs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Function to increment run count
CREATE OR REPLACE FUNCTION increment_moltbot_job_run_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE moltbot_extraction_jobs
  SET run_count = run_count + 1,
      last_run_at = NEW.executed_at,
      last_run_status = NEW.status,
      updated_at = NOW()
  WHERE user_id = NEW.user_id
    AND job_name = 'extract_' || NEW.platform;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update job stats on run
DROP TRIGGER IF EXISTS trigger_moltbot_job_runs ON moltbot_job_runs;
CREATE TRIGGER trigger_moltbot_job_runs
  AFTER INSERT ON moltbot_job_runs
  FOR EACH ROW
  EXECUTE FUNCTION increment_moltbot_job_run_count();

-- Cleanup old job runs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_moltbot_job_runs()
RETURNS void AS $$
BEGIN
  DELETE FROM moltbot_job_runs
  WHERE executed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
