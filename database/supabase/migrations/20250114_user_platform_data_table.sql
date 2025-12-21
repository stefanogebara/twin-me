-- ====================================================================
-- USER PLATFORM DATA TABLE
-- Migration: 20250114 - Ensure user_platform_data table exists
--
-- Purpose: Store raw platform data from connected services
-- Used by: All platform extractors (Spotify, YouTube, GitHub, etc.)
-- ====================================================================

-- Create user_platform_data table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_platform_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User and platform identification
  user_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN (
    'spotify', 'youtube', 'github', 'discord', 'reddit',
    'gmail', 'calendar', 'linkedin', 'slack', 'teams',
    'twitter', 'instagram', 'tiktok', 'netflix', 'goodreads'
  )),

  -- Data classification
  data_type TEXT NOT NULL CHECK (data_type IN (
    -- Spotify types
    'recently_played', 'top_track', 'top_artist', 'playlist',
    'saved_track', 'followed_artist', 'audio_features', 'soul_analysis',

    -- YouTube types
    'watch_history', 'subscription', 'liked_video', 'comment',

    -- GitHub types
    'repository', 'commit', 'pull_request', 'issue', 'review',

    -- Gmail types
    'email', 'thread', 'label',

    -- Calendar types
    'event', 'meeting',

    -- Social types
    'message', 'post', 'reaction', 'channel',

    -- Generic types
    'profile', 'settings', 'activity', 'metadata'
  )),

  -- Content storage
  raw_data JSONB NOT NULL, -- Raw data from platform API
  source_url TEXT, -- URL or identifier of the source

  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processing_error TEXT,
  quality_score DECIMAL(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),

  -- Timestamps
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Indexes for efficient querying
  UNIQUE(user_id, platform, data_type, source_url)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_platform_data_user_platform
  ON user_platform_data(user_id, platform);

CREATE INDEX IF NOT EXISTS idx_platform_data_user_type
  ON user_platform_data(user_id, data_type);

CREATE INDEX IF NOT EXISTS idx_platform_data_processing
  ON user_platform_data(processed, processing_error)
  WHERE NOT processed;

CREATE INDEX IF NOT EXISTS idx_platform_data_extracted
  ON user_platform_data(extracted_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_data_platform_type
  ON user_platform_data(platform, data_type, extracted_at DESC);

-- Create a partial index for Spotify soul analysis
CREATE INDEX IF NOT EXISTS idx_platform_data_spotify_analysis
  ON user_platform_data(user_id, extracted_at DESC)
  WHERE platform = 'spotify' AND data_type = 'soul_analysis';

-- ====================================================================
-- DATA EXTRACTION JOBS TABLE
-- Track extraction job status for monitoring and debugging
-- ====================================================================

CREATE TABLE IF NOT EXISTS data_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Job identification
  user_id UUID NOT NULL,
  connector_id UUID,
  platform TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'initial_sync', 'full_sync', 'incremental_sync',
    'refresh', 'analysis', 'cleanup'
  )),

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),

  -- Progress tracking
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Results and errors
  results JSONB,
  error_message TEXT,

  -- Retry logic
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);

-- Indexes for job tracking
CREATE INDEX IF NOT EXISTS idx_extraction_jobs_user_platform
  ON data_extraction_jobs(user_id, platform, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_status
  ON data_extraction_jobs(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_extraction_jobs_cleanup
  ON data_extraction_jobs(completed_at)
  WHERE status IN ('completed', 'failed', 'cancelled');

-- ====================================================================
-- FUNCTIONS FOR DATA MANAGEMENT
-- ====================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user_platform_data
DROP TRIGGER IF EXISTS update_user_platform_data_updated_at ON user_platform_data;
CREATE TRIGGER update_user_platform_data_updated_at
  BEFORE UPDATE ON user_platform_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for data_extraction_jobs
DROP TRIGGER IF EXISTS update_extraction_jobs_updated_at ON data_extraction_jobs;
CREATE TRIGGER update_extraction_jobs_updated_at
  BEFORE UPDATE ON data_extraction_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ====================================================================
-- VIEWS FOR COMMON QUERIES
-- ====================================================================

-- Platform data summary per user
CREATE OR REPLACE VIEW user_platform_data_summary AS
SELECT
  user_id,
  platform,
  data_type,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE processed) AS processed_records,
  MAX(extracted_at) AS last_extraction,
  AVG(quality_score) AS avg_quality_score
FROM user_platform_data
GROUP BY user_id, platform, data_type;

-- Recent extraction jobs
CREATE OR REPLACE VIEW recent_extraction_jobs AS
SELECT
  j.id,
  j.user_id,
  j.platform,
  j.job_type,
  j.status,
  j.total_items,
  j.processed_items,
  j.started_at,
  j.completed_at,
  EXTRACT(EPOCH FROM (COALESCE(j.completed_at, NOW()) - j.started_at)) AS duration_seconds
FROM data_extraction_jobs j
WHERE j.started_at >= NOW() - INTERVAL '7 days'
ORDER BY j.started_at DESC;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS to ensure users can only access their own data
-- ====================================================================

-- Enable RLS on user_platform_data
ALTER TABLE user_platform_data ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own data
CREATE POLICY user_platform_data_select_own ON user_platform_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can only insert their own data
CREATE POLICY user_platform_data_insert_own ON user_platform_data
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can only update their own data
CREATE POLICY user_platform_data_update_own ON user_platform_data
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can only delete their own data
CREATE POLICY user_platform_data_delete_own ON user_platform_data
  FOR DELETE
  USING (auth.uid() = user_id);

-- Enable RLS on data_extraction_jobs
ALTER TABLE data_extraction_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own jobs
CREATE POLICY extraction_jobs_select_own ON data_extraction_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can manage all jobs
CREATE POLICY extraction_jobs_service_role ON data_extraction_jobs
  FOR ALL
  USING (auth.role() = 'service_role');

-- ====================================================================
-- CLEANUP FUNCTION
-- Automatically delete old processed data to save space
-- ====================================================================

CREATE OR REPLACE FUNCTION cleanup_old_platform_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete processed data older than 90 days
  DELETE FROM user_platform_data
  WHERE processed = TRUE
    AND processed_at < NOW() - INTERVAL '90 days'
    AND data_type NOT IN ('soul_analysis', 'profile'); -- Keep analysis and profiles

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- GRANT PERMISSIONS
-- ====================================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON user_platform_data TO authenticated;
GRANT SELECT ON user_platform_data_summary TO authenticated;
GRANT SELECT ON recent_extraction_jobs TO authenticated;

-- Grant full access to service role (for backend operations)
GRANT ALL ON user_platform_data TO service_role;
GRANT ALL ON data_extraction_jobs TO service_role;

-- ====================================================================
-- COMMENTS FOR DOCUMENTATION
-- ====================================================================

COMMENT ON TABLE user_platform_data IS
  'Stores raw and processed data extracted from connected platforms (Spotify, YouTube, GitHub, etc.)';

COMMENT ON COLUMN user_platform_data.raw_data IS
  'JSONB field containing the actual data from the platform API';

COMMENT ON COLUMN user_platform_data.data_type IS
  'Type of data extracted (e.g., recently_played, top_track, soul_analysis for Spotify)';

COMMENT ON TABLE data_extraction_jobs IS
  'Tracks the status and progress of data extraction jobs';

COMMENT ON VIEW user_platform_data_summary IS
  'Aggregated view of platform data per user, showing record counts and quality metrics';

COMMENT ON VIEW recent_extraction_jobs IS
  'Recent extraction jobs with duration calculations for monitoring';

-- Migration complete
-- The user_platform_data table is now ready for Spotify and other platform integrations
