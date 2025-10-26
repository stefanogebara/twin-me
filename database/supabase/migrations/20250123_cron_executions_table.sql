-- Migration: Create cron_executions table for tracking automated job execution
-- Created: 2025-01-23
-- Purpose: Track execution history, performance metrics, and errors for cron jobs

-- Create cron_executions table
CREATE TABLE IF NOT EXISTS cron_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  execution_time_ms INTEGER,
  tokens_refreshed INTEGER DEFAULT 0,
  tokens_checked INTEGER DEFAULT 0,
  platforms_polled INTEGER DEFAULT 0,
  error_message TEXT,
  result_data JSONB,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cron_executions_job_name
  ON cron_executions(job_name);

CREATE INDEX IF NOT EXISTS idx_cron_executions_status
  ON cron_executions(status);

CREATE INDEX IF NOT EXISTS idx_cron_executions_executed_at
  ON cron_executions(executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_executions_job_status_time
  ON cron_executions(job_name, status, executed_at DESC);

-- Add table comment
COMMENT ON TABLE cron_executions IS 'Tracks execution history of automated cron jobs (token refresh, platform polling)';

-- Add column comments
COMMENT ON COLUMN cron_executions.job_name IS 'Name of the cron job (e.g., token-refresh, platform-polling)';
COMMENT ON COLUMN cron_executions.status IS 'Execution status: success, error, or timeout';
COMMENT ON COLUMN cron_executions.execution_time_ms IS 'Time taken to execute the job in milliseconds';
COMMENT ON COLUMN cron_executions.tokens_refreshed IS 'Number of OAuth tokens successfully refreshed';
COMMENT ON COLUMN cron_executions.tokens_checked IS 'Number of tokens checked for expiration';
COMMENT ON COLUMN cron_executions.platforms_polled IS 'Number of platforms polled for data';
COMMENT ON COLUMN cron_executions.error_message IS 'Error message if status is error';
COMMENT ON COLUMN cron_executions.result_data IS 'Full JSON result data from the execution';
COMMENT ON COLUMN cron_executions.executed_at IS 'Timestamp when the job was executed';
