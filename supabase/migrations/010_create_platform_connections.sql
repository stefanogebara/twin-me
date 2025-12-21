-- =========================================================================
-- Platform Connections Table for OAuth Token Storage
-- =========================================================================
-- This table stores OAuth access and refresh tokens for all connected
-- platforms (Spotify, GitHub, YouTube, Netflix, etc.). Tokens are encrypted
-- using AES-256-GCM before storage.
--
-- Security:
-- - All tokens encrypted at rest
-- - Row Level Security (RLS) enabled
-- - Users can only access their own connections
-- - Service role has full access for background jobs
-- =========================================================================

-- Drop existing table if it exists
DROP TABLE IF EXISTS platform_connections CASCADE;

-- Create platform_connections table
CREATE TABLE platform_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- User relationship
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Platform identification
  platform TEXT NOT NULL CHECK (platform IN (
    'spotify', 'discord', 'github', 'youtube', 'netflix', 'reddit',
    'google_gmail', 'google_calendar', 'linkedin', 'slack', 'twitch',
    'steam', 'goodreads', 'tiktok', 'instagram', 'apple_music',
    'hbo', 'prime_video', 'disney_plus', 'microsoft_teams'
  )),

  -- OAuth tokens (encrypted using AES-256-GCM)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  scopes TEXT[],

  -- Connection status
  status TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error', 'pending', 'expired')),
  last_sync_status TEXT CHECK (last_sync_status IN ('success', 'error', 'pending', 'rate_limited', NULL)),
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_error TEXT,

  -- Metadata
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',

  -- Constraints
  UNIQUE(user_id, platform),

  -- Ensure refresh_token exists for platforms that support it
  CONSTRAINT platform_connections_refresh_token_check CHECK (
    (platform IN ('spotify', 'discord', 'youtube', 'google_gmail', 'google_calendar') AND refresh_token IS NOT NULL) OR
    (platform NOT IN ('spotify', 'discord', 'youtube', 'google_gmail', 'google_calendar'))
  )
);

-- =========================================================================
-- Indexes for Performance
-- =========================================================================

CREATE INDEX idx_platform_connections_user_id ON platform_connections(user_id);
CREATE INDEX idx_platform_connections_platform ON platform_connections(platform);
CREATE INDEX idx_platform_connections_status ON platform_connections(status);
CREATE INDEX idx_platform_connections_expires_at ON platform_connections(token_expires_at) WHERE token_expires_at IS NOT NULL;
CREATE INDEX idx_platform_connections_last_sync ON platform_connections(last_sync_at);
CREATE INDEX idx_platform_connections_user_platform ON platform_connections(user_id, platform);

-- =========================================================================
-- Automatic Updated Timestamp Trigger
-- =========================================================================

CREATE OR REPLACE FUNCTION update_platform_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_connections_updated_at
  BEFORE UPDATE ON platform_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_connections_updated_at();

-- =========================================================================
-- Row Level Security (RLS) Policies
-- =========================================================================

ALTER TABLE platform_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connections
CREATE POLICY "Users can view own connections" ON platform_connections
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own connections
CREATE POLICY "Users can insert own connections" ON platform_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own connections
CREATE POLICY "Users can update own connections" ON platform_connections
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own connections
CREATE POLICY "Users can delete own connections" ON platform_connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- =========================================================================
-- Helper Functions
-- =========================================================================

-- Function to get expiring tokens (for token refresh background job)
CREATE OR REPLACE FUNCTION get_expiring_platform_tokens(
  expiry_buffer_minutes INT DEFAULT 5
)
RETURNS TABLE (
  user_id UUID,
  platform TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.user_id,
    pc.platform,
    pc.access_token,
    pc.refresh_token,
    pc.token_expires_at
  FROM platform_connections pc
  WHERE
    pc.status = 'connected'
    AND pc.refresh_token IS NOT NULL
    AND pc.token_expires_at IS NOT NULL
    AND pc.token_expires_at < (NOW() + (expiry_buffer_minutes || ' minutes')::INTERVAL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_expiring_platform_tokens(INT) IS
  'Returns all platform connections with tokens expiring within the specified buffer time. Used by token refresh background job.';

-- Function to mark connection as expired
CREATE OR REPLACE FUNCTION mark_platform_connection_expired(
  p_user_id UUID,
  p_platform TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE platform_connections
  SET
    status = 'expired',
    last_sync_status = 'error',
    last_sync_error = 'Token expired and refresh failed',
    updated_at = NOW()
  WHERE
    user_id = p_user_id
    AND platform = p_platform;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION mark_platform_connection_expired(UUID, TEXT) IS
  'Marks a platform connection as expired. Called when token refresh fails.';

-- Function to get user's connected platforms
CREATE OR REPLACE FUNCTION get_user_connected_platforms(p_user_id UUID)
RETURNS TABLE (
  platform TEXT,
  connected_at TIMESTAMP WITH TIME ZONE,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.platform,
    pc.connected_at,
    pc.last_sync_at,
    pc.status
  FROM platform_connections pc
  WHERE
    pc.user_id = p_user_id
    AND pc.status = 'connected'
  ORDER BY pc.connected_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_user_connected_platforms(UUID) IS
  'Returns all connected platforms for a user with their connection status.';

-- =========================================================================
-- Data Migration from old soul_data_sources table (if exists)
-- =========================================================================

DO $$
BEGIN
  -- Check if soul_data_sources table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'soul_data_sources') THEN
    -- Migrate data from soul_data_sources to platform_connections
    INSERT INTO platform_connections (
      user_id,
      platform,
      access_token,
      refresh_token,
      token_expires_at,
      status,
      scopes,
      connected_at,
      updated_at
    )
    SELECT
      sds.user_id,
      sds.provider,
      sds.access_token,
      sds.refresh_token,
      sds.token_expires_at,
      COALESCE(sds.status, 'connected'),
      sds.scopes,
      COALESCE(sds.created_at, NOW()),
      COALESCE(sds.updated_at, NOW())
    FROM soul_data_sources sds
    WHERE sds.access_token IS NOT NULL
    ON CONFLICT (user_id, platform) DO NOTHING;

    RAISE NOTICE 'Migrated data from soul_data_sources to platform_connections';

    -- Drop old table
    DROP TABLE soul_data_sources CASCADE;
    RAISE NOTICE 'Dropped soul_data_sources table';
  END IF;
END $$;

-- =========================================================================
-- Table Comments for Documentation
-- =========================================================================

COMMENT ON TABLE platform_connections IS
  'Stores OAuth access and refresh tokens for all connected platforms. Tokens are encrypted at rest using AES-256-GCM.';

COMMENT ON COLUMN platform_connections.access_token IS
  'Encrypted OAuth access token. Decrypt with decryptToken() before use.';

COMMENT ON COLUMN platform_connections.refresh_token IS
  'Encrypted OAuth refresh token. Decrypt with decryptToken() before use. NULL for platforms without refresh tokens (e.g., GitHub).';

COMMENT ON COLUMN platform_connections.token_expires_at IS
  'When the access token expires. NULL for tokens that never expire (e.g., GitHub). Used by token refresh background job.';

COMMENT ON COLUMN platform_connections.status IS
  'Connection status: connected (active), disconnected (user disconnected), error (connection failed), pending (OAuth in progress), expired (token expired and refresh failed)';

COMMENT ON COLUMN platform_connections.last_sync_status IS
  'Last data extraction status: success, error, pending, rate_limited';

-- =========================================================================
-- Migration Complete
-- =========================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 010: platform_connections table created successfully';
  RAISE NOTICE 'IMPORTANT: Ensure token refresh background job runs every 5 minutes';
  RAISE NOTICE 'IMPORTANT: All tokens must be encrypted before storage using encryptToken()';
END $$;
