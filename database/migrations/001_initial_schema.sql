-- Twin Me Platform - Initial Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  oauth_provider TEXT,
  picture_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- ============================================================================
-- DATA CONNECTORS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS data_connectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token_encrypted TEXT, -- AES-256 encrypted
  refresh_token_encrypted TEXT, -- AES-256 encrypted
  expires_at TIMESTAMP WITH TIME ZONE,
  scopes TEXT[],
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_sync TIMESTAMP WITH TIME ZONE,
  last_sync_status TEXT DEFAULT 'pending',
  permissions JSONB DEFAULT '{}',
  total_synced INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX idx_connectors_user ON data_connectors(user_id);
CREATE INDEX idx_connectors_provider ON data_connectors(provider);
CREATE INDEX idx_connectors_active ON data_connectors(is_active) WHERE is_active = true;

-- ============================================================================
-- ANALYTICS EVENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  page_url TEXT,
  user_agent TEXT,
  referrer TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_analytics_user ON analytics_events(user_id);
CREATE INDEX idx_analytics_session ON analytics_events(session_id);
CREATE INDEX idx_analytics_timestamp ON analytics_events(timestamp DESC);
CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);

-- ============================================================================
-- ANALYTICS SESSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_id TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  page_views INTEGER DEFAULT 0,
  events_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON analytics_sessions(user_id);
CREATE INDEX idx_sessions_start ON analytics_sessions(start_time DESC);

-- ============================================================================
-- SOUL SIGNATURES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS soul_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  uniqueness_score INTEGER CHECK (uniqueness_score >= 0 AND uniqueness_score <= 100),
  personality_insights JSONB DEFAULT '[]',
  data_sources TEXT[] DEFAULT ARRAY[]::TEXT[],
  last_extraction TIMESTAMP WITH TIME ZONE,
  extraction_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_soul_signatures_user ON soul_signatures(user_id);
CREATE INDEX idx_soul_signatures_status ON soul_signatures(extraction_status);

-- ============================================================================
-- PLATFORM DATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  data_type TEXT NOT NULL, -- 'listening_history', 'viewing_history', 'emails', etc.
  raw_data JSONB,
  processed_data JSONB,
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_platform_data_user ON platform_data(user_id);
CREATE INDEX idx_platform_data_provider ON platform_data(provider);
CREATE INDEX idx_platform_data_type ON platform_data(data_type);
CREATE INDEX idx_platform_data_extracted ON platform_data(extracted_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE soul_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_data ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Data connectors policies
CREATE POLICY "Users can view own connectors" ON data_connectors
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own connectors" ON data_connectors
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own connectors" ON data_connectors
  FOR UPDATE USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own connectors" ON data_connectors
  FOR DELETE USING (auth.uid()::text = user_id::text);

-- Soul signatures policies
CREATE POLICY "Users can view own soul signature" ON soul_signatures
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own soul signature" ON soul_signatures
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own soul signature" ON soul_signatures
  FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Platform data policies
CREATE POLICY "Users can view own platform data" ON platform_data
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own platform data" ON platform_data
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- Analytics: Users can only insert their own events
CREATE POLICY "Users can insert own analytics" ON analytics_events
  FOR INSERT WITH CHECK (true); -- Allow all inserts (user_id can be null)

CREATE POLICY "Users can view own analytics" ON analytics_events
  FOR SELECT USING (auth.uid()::text = user_id::text OR user_id IS NULL);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_connectors_updated_at BEFORE UPDATE ON data_connectors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_soul_signatures_updated_at BEFORE UPDATE ON soul_signatures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON analytics_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA / SEED (Optional)
-- ============================================================================

-- Create a demo user (for testing)
-- INSERT INTO users (email, first_name, last_name)
-- VALUES ('demo@twinme.com', 'Demo', 'User')
-- ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
