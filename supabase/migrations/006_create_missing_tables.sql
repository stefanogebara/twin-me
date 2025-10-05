-- ============================================================================
-- CREATE MISSING TABLES - soul_data_sources and analytics_events
-- Migration: 006_create_missing_tables
-- Purpose: Create tables that dashboard and soul data routes expect
-- ============================================================================

-- Create soul_data_sources table for OAuth platform connections
CREATE TABLE IF NOT EXISTS soul_data_sources (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN (
    'spotify', 'discord', 'github', 'linkedin', 'netflix', 'youtube',
    'reddit', 'google_gmail', 'google_calendar', 'microsoft_teams',
    'slack', 'twitter', 'instagram', 'tiktok', 'twitch'
  )),
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error', 'pending')),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  last_sync TIMESTAMP WITH TIME ZONE,
  scopes TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, provider)
);

-- Create indexes for soul_data_sources
CREATE INDEX IF NOT EXISTS idx_soul_data_sources_user_id ON soul_data_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_soul_data_sources_provider ON soul_data_sources(provider);
CREATE INDEX IF NOT EXISTS idx_soul_data_sources_status ON soul_data_sources(status);

-- Create analytics_events table for activity tracking
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'platform_connected', 'platform_disconnected', 'soul_analysis_started',
    'soul_analysis_completed', 'twin_created', 'twin_updated', 'twin_deleted',
    'training_started', 'training_completed', 'data_sync', 'chat_session',
    'error_occurred'
  )),
  event_data JSONB DEFAULT '{}',
  session_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create indexes for analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id);

-- Add comments for documentation
COMMENT ON TABLE soul_data_sources IS 'Stores OAuth connections to external platforms for data extraction';
COMMENT ON TABLE analytics_events IS 'Tracks user activity and system events for analytics and monitoring';

COMMENT ON COLUMN soul_data_sources.provider IS 'Name of the connected platform (spotify, discord, etc)';
COMMENT ON COLUMN soul_data_sources.status IS 'Current connection status';
COMMENT ON COLUMN soul_data_sources.access_token IS 'Encrypted OAuth access token';
COMMENT ON COLUMN soul_data_sources.refresh_token IS 'Encrypted OAuth refresh token';
COMMENT ON COLUMN soul_data_sources.metadata IS 'Additional platform-specific data';

COMMENT ON COLUMN analytics_events.event_type IS 'Type of event that occurred';
COMMENT ON COLUMN analytics_events.event_data IS 'Additional event-specific data';
COMMENT ON COLUMN analytics_events.session_id IS 'User session identifier for grouping events';

-- Create trigger for updating updated_at timestamp on soul_data_sources
CREATE OR REPLACE FUNCTION update_soul_data_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_soul_data_sources_updated_at ON soul_data_sources;
CREATE TRIGGER update_soul_data_sources_updated_at
BEFORE UPDATE ON soul_data_sources
FOR EACH ROW EXECUTE FUNCTION update_soul_data_sources_updated_at();

-- Migration complete
-- Tables soul_data_sources and analytics_events are now available
